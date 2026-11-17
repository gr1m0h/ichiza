import { Hono } from 'hono'
import { styles } from './styles'
import { pageHeader } from './page-header'
import { logoSvg, themeInitScript, themeToggleScript } from './brand'
import { createSnapshot, createAggregate, localDate, metricsCsv, recordsCsv, renderRecord, renderAggregate, validYear, RecordConflictError, type RecordRepository, type AggregateSnapshot } from './records'
import { aggregateView, individualView } from './record-views'

import { AccessError, authenticateAccess, parseMembers, type AccessEnv, type Operator } from './auth'
import { validTaskTitle, validReminder, type DashboardTaskUpdate, type EventDashboard } from './dashboard'
import { DashboardConflictError, GitHubClient, GitHubRequestError, GitHubTransportError } from './github'

interface Bindings extends AccessEnv {
  readonly ICHIZA_REPOSITORY: string
  readonly ICHIZA_GITHUB_TOKEN: string
  readonly ICHIZA_TIMEZONE?: string
}

interface AppVariables {
  readonly operator: Operator
}

interface AppEnv {
  Bindings: Bindings
  Variables: AppVariables
}

export interface DashboardRepository {
  getDashboard?(issueNumber:number):Promise<EventDashboard|undefined>
  listDashboards(): Promise<readonly EventDashboard[]>
  updateTasks(issueNumber: number, updates: readonly DashboardTaskUpdate[], expectedUpdatedAt: string): Promise<EventDashboard>
}

interface AppDependencies {
  readonly authenticate: (request: Request, env: AccessEnv) => Promise<Operator>
  readonly repository: (env: Bindings) => DashboardRepository
  readonly members: (env: Bindings) => readonly Operator[]
  readonly records: (env: Bindings) => RecordRepository
  readonly now: () => Date
}

const defaultDependencies: AppDependencies = {
  authenticate: authenticateAccess,
  repository: (env) =>
    new GitHubClient({ repository: env.ICHIZA_REPOSITORY, token: env.ICHIZA_GITHUB_TOKEN }),
  members: (env) => parseMembers(env.ICHIZA_MEMBERS),
  records: (env) => new GitHubClient({repository:env.ICHIZA_REPOSITORY,token:env.ICHIZA_GITHUB_TOKEN}),
  now: () => new Date(),
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return entities[character] ?? character
  })
}

function layout(title: string, content: string, active: 'events' | 'me' | 'records' = 'events'): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#b03a2e"><link rel="icon" type="image/svg+xml" href="/img/logo.svg">${themeInitScript}<title>${escapeHtml(title)} · ichiza</title><style>${styles}</style></head>
    <body><nav aria-label="メイン"><div class="nav-inner"><a class="brand" href="/" aria-label="ichiza ホーム"><img src="/img/logo.svg" alt="" width="32" height="32">ichiza</a>
    <a href="/"${active === 'events' ? ' aria-current="location"' : ''}>イベント</a>
    <a href="/records"${active === 'records' ? ' aria-current="page"' : ''}>メトリクス</a>
    <a href="/me"${active === 'me' ? ' aria-current="page"' : ''}>My Page</a><button type="button" class="theme-toggle" data-theme-toggle aria-label="表示テーマを切り替える" title="表示テーマを切り替える"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17Z" fill="currentColor" stroke="none"/></svg></button></div></nav>${content}${themeToggleScript}</body></html>`
}

export function dateInTimeZone(now: Date, timeZone: string): string {
  return localDate(now,timeZone)
}

function today(dependencies: AppDependencies, bindings?: Bindings): string {
  return dateInTimeZone(dependencies.now(), bindings?.ICHIZA_TIMEZONE ?? 'Asia/Tokyo')
}

function health(dashboard: EventDashboard, date: string): string {
  const open = dashboard.tasks.filter((task) => !task.done)
  const overdue = open.filter((task) => task.due < date).length
  if (open.length === 0) return '完了'
  if (overdue > 0) return `期限超過 ${overdue}件`
  if (open.some((task) => task.due === date)) return '本日期限あり'
  return '順調'
}

function stats(dashboard: EventDashboard, date: string) {
  const completed = dashboard.tasks.filter((task) => task.done).length
  const open = dashboard.tasks.filter((task) => !task.done)
  const overdue = open.filter((task) => task.due < date).length
  const dueToday = open.filter((task) => task.due === date).length
  return { completed, total: dashboard.tasks.length, overdue, dueToday, progress: dashboard.tasks.length === 0 ? 100 : Math.round((completed / dashboard.tasks.length) * 100) }
}

function tone(state: string): string {
  if (state.startsWith('期限超過')) return 'red'
  if (state === '本日期限あり') return 'amber'
  return 'green'
}

function statusPill(label: string, status: string): string {
  return `<span class="pill ${status}">● ${escapeHtml(label)}</span>`
}

function eventCard(dashboard: EventDashboard, date: string): string {
  const { completed, total, overdue, dueToday, progress } = stats(dashboard, date)
  const state = health(dashboard, date)
  const stateClass = tone(state)
  const label = state.startsWith('期限超過') ? state : state === '本日期限あり' ? `本日期限あり · 今日の期限 ${dueToday}件` : state
  const stripe = stateClass === 'red' ? '#b42318' : stateClass === 'amber' ? '#d99a18' : '#199957'
  return `<article class="event"><div class="stripe" style="background:${stripe}"></div><div><h2><a href="/events/${encodeURIComponent(dashboard.slug)}">${escapeHtml(dashboard.title)}</a></h2><p>${escapeHtml(dashboard.date)} ・ ${completed} / ${total} 完了${overdue > 0 ? ` ・ 期限超過 ${overdue}件` : ''}</p><div class="progress" style="margin-top:.65rem"><i style="width:${progress}%;background:${stripe}"></i></div></div><div class="right">${statusPill(label, stateClass)}</div></article>`
}

function taskList(dashboard: EventDashboard, tasks: EventDashboard['tasks'], date: string, members: readonly Operator[], structural = false): string {
  if (!tasks.length && !structural) return ''
  const logins = members.map(member => member.github)
  const renderRow = (task: EventDashboard['tasks'][number], isNew = false) => {
    const id = escapeHtml(task.id)
    const state = task.done ? '完了' : task.due < date ? '期限超過' : task.due === date ? '今日' : '予定'
    const reminder = task.reminder ?? ''
    const scheduled = reminder !== '' && reminder !== 'off'
    const timingLabel = scheduled ? reminder : reminder === 'off' ? 'オフ' : '期日'
    const assigned = task.assignees
    const choices = [...new Set([...logins, ...assigned])].map(login =>
      `<label><input type="checkbox" name="assign.${id}" value="${escapeHtml(login)}"${assigned.includes(login) ? ' checked' : ''}>${escapeHtml(login)}</label>`,
    ).join('')
    return `<div class="edit-row" id="task-${id}" data-task-id="${id}"${isNew ? ' data-new' : ''}>
      <div class="edit-title"><h3>${isNew ? '新しいタスク' : escapeHtml(task.title)} <small class="draft-label" title="未保存" hidden>未保存</small></h3>
        <label class="completion"><input type="hidden" name="done.${id}" value="false"><input type="checkbox" name="done.${id}" value="true"${task.done ? ' checked' : ''}>完了</label></div>
      ${isNew ? `<div class="new-fields"><input type="hidden" name="create.${id}" value="true"><label>タスク名<input name="title.${id}" required maxlength="200" placeholder="例：会場の最終確認"></label><label>期日<input type="date" name="due.${id}" value="${escapeHtml(task.due)}" required></label></div>` : ''}
      <div class="task-meta">期日 ${escapeHtml(task.due)} <span data-state data-open-state="${task.due < date ? '期限超過' : task.due === date ? '今日' : '予定'}">· ${state}</span></div>
      <fieldset class="owners"><legend>担当者</legend><input type="hidden" name="assign.${id}" value="">${choices}</fieldset>
      <details class="notification"><summary>${icon('bell')}<strong class="sr-only">Slack 通知</strong><span class="settings-summary">${escapeHtml(timingLabel)}${task.mention_assignees && reminder !== 'off' ? ' · @' : ''}</span></summary>
      <div class="settings-line"><label>通知タイミング <select name="notify.${id}">
        <option value="default"${!reminder ? ' selected' : ''}>期日</option>
        <option value="date"${scheduled ? ' selected' : ''}>指定日</option>
        <option value="off"${reminder === 'off' ? ' selected' : ''}>オフ</option>
      </select></label>
      <label data-date>通知日 <input type="date" name="date.${id}" value="${scheduled ? escapeHtml(reminder) : ''}"></label>
      <label data-mention><input type="hidden" name="mention.${id}" value="false"><input type="checkbox" name="mention.${id}" value="true"${task.mention_assignees ? ' checked' : ''}> 担当者をメンションする</label></div></details>
      <div class="row-actions">${structural ? `<label class="delete-task" title="削除を切り替え"><input type="checkbox" name="delete.${id}" value="true" aria-label="${escapeHtml(task.title || '新しいタスク')}を削除">${icon('trash')}<span class="delete-note">削除予定</span></label>` : ''}<button type="button" data-save-task hidden>${icon('check')}保存</button></div>
    </div>`
  }
  const rows = tasks.map(task => renderRow(task)).join('')
  const template = structural ? `<template data-new-template>${renderRow({id: 'new-placeholder', title: '', due: dashboard.date, done: false, assignees: [], labels: []}, true)}</template>` : ''
  return `<form class="task-editor" method="post" action="/events/${encodeURIComponent(dashboard.slug)}/tasks">
    <input type="hidden" name="issueNumber" value="${dashboard.issueNumber}">
    <input type="hidden" name="expectedUpdatedAt" value="${escapeHtml(dashboard.updatedAt ?? '')}">
    <div class="editor-toolbar"><details class="editor-guide"><summary>${icon('info')}保存について</summary><p>変更は保存すると反映されます。行ごとの保存、または下部のまとめて保存を使えます。削除は保存前に取り消せます。</p></details></div>
    ${rows}<div data-new-rows></div>${template}${structural ? '<button type="button" class="add-task" data-add-task>＋ タスクを追加</button><noscript><p>タスクの追加にはJavaScriptを有効にしてください。</p></noscript>' : ''}<div class="edit-footer"><span role="status" data-status></span><button type="reset" hidden>取り消す</button><button type="submit">まとめて保存</button></div></form>`
}

const editorScript = `<script>
  function refresh(form) {
    form.noValidate = true;
    const rows = form.querySelectorAll('.edit-row');
    const save = form.querySelector('button[type=submit]');
    const reset = form.querySelector('button[type=reset]');
    let count = 0;
    for (const row of rows) {
      const mode = row.querySelector('select');
      const date = row.querySelector('[data-date] input');
      const removed = row.querySelector('.delete-task input')?.checked;
      row.toggleAttribute('data-deleted', Boolean(removed));
      row.querySelectorAll('input,select').forEach(field => { if (!field.closest('.delete-task')) field.disabled = Boolean(removed); });
      const dated = mode.value === 'date';
      date.disabled = !dated || removed;
      date.required = dated;
      row.querySelector('[data-date]').hidden = !dated;
      row.querySelector('[data-mention]').hidden = mode.value === 'off';
      const mention = row.querySelector('[data-mention] input[type=checkbox]').checked;
      const timing = dated && date.value ? date.value : mode.selectedOptions[0].textContent;
      row.querySelector('.settings-summary').textContent = timing + (mention && mode.value !== 'off' ? ' · @' : '');
      const state = row.querySelector('[data-state]');
      state.textContent = '· ' + (row.querySelector('.edit-title input[type=checkbox]').checked ? '完了' : state.dataset.openState);
      const dirty = row.hasAttribute('data-new') || [...row.querySelectorAll('input[type=checkbox]')].some(input => input.checked !== input.defaultChecked)
        || !mode.selectedOptions[0].defaultSelected || (dated && date.value !== date.defaultValue);
      row.toggleAttribute('data-dirty', dirty);
      row.querySelector('.draft-label').hidden = !dirty;
      row.querySelector('[data-save-task]').hidden = !dirty;
      if (dirty) count++;
    }
    save.disabled = count === 0;
    save.textContent = count ? 'まとめて保存（' + count + '）' : 'まとめて保存';
    reset.hidden = count === 0;
    form.querySelector('[data-status]').textContent = count ? count + '件の変更' : '保存済み';
    if (count) document.querySelector('.notice')?.setAttribute('hidden', '');
  }

  const live = document.createElement('p');
  live.className = 'save-feedback';
  live.setAttribute('role', 'status');
  document.body.append(live);
  let dismiss;
  function feedback(message, error = false) {
    clearTimeout(dismiss);
    live.textContent = message;
    live.toggleAttribute('data-error', error);
    if (message && !error && message !== '保存中…') dismiss = setTimeout(() => { live.textContent = ''; }, 5000);
  }
  document.addEventListener('input', event => {
    const form = event.target.closest('.task-editor');
    if (form) { feedback(''); refresh(form); }
  });
  document.addEventListener('change', event => {
    const form = event.target.closest('.task-editor');
    if (event.target.matches('.delete-task input:checked') && event.target.closest('[data-new]')) event.target.closest('[data-new]').remove();
    if (form) refresh(form);
  });
  document.addEventListener('reset', event => {
    if (event.target.matches('.task-editor')) { event.target.querySelectorAll('[data-new]').forEach(row => row.remove()); }
    if (event.target.matches('.task-editor')) setTimeout(() => { feedback(''); refresh(event.target); }, 0);
  });
  document.addEventListener('click', event => {
    const add = event.target.closest('[data-add-task]');
    if (add) {
      const form = add.closest('form');
      const template = form.querySelector('[data-new-template]');
      const holder = document.createElement('div');
      holder.innerHTML = template.innerHTML.replaceAll('new-placeholder', 'web-' + crypto.randomUUID());
      const row = holder.firstElementChild;
      form.querySelector('[data-new-rows]').append(row);
      refresh(form);
      row.querySelector('[name^="title."]').focus();
    }
    const button = event.target.closest('[data-save-task]');
    if (button) persist(button.form, button.closest('.edit-row'));
  });
  document.addEventListener('submit', event => {
    if (!event.target.matches('.task-editor')) return;
    event.preventDefault();
    persist(event.target);
  });

  async function persist(form, single) {
    const main = form.closest('main');
    if (main.inert) return;
    const selected = single ? [single] : [...form.querySelectorAll('[data-dirty]')];
    if (!selected.length) return;
    const data = new URLSearchParams();
    for (const name of ['issueNumber', 'expectedUpdatedAt']) data.set(name, form.elements.namedItem(name).value);
    for (const row of selected) {
      if (row.querySelector('.delete-task input')?.checked) {
        if (!row.hasAttribute('data-new')) data.set('delete.' + row.dataset.taskId, 'true');
        continue;
      }
      for (const field of row.querySelectorAll('[name]')) {
        if (field.disabled) continue;
        if (!field.checkValidity()) {
          const details = field.closest('details');
          if (details) details.open = true;
          field.reportValidity();
          return;
        }
        if (field.type !== 'checkbox' || field.checked) data.append(field.name, field.value);
      }
    }
    const deletions = selected.filter(row => !row.hasAttribute('data-new') && row.querySelector('.delete-task input')?.checked);
    if (deletions.length && !confirm(deletions.map(row => row.querySelector('h3').firstChild.textContent.trim()).join('、') + ' を削除しますか？')) return;
    const view = location.pathname === '/me' ? 'me' : 'event';
    main.inert = true;
    feedback('保存中…');
    try {
      const url = single ? form.action + '/' + encodeURIComponent(single.dataset.taskId) : form.action;
      const response = await fetch(url, {method: 'POST', headers: {'X-Ichiza-Editor': view}, body: data});
      if (!response.ok || response.headers.get('X-Ichiza-Editor') !== view) {
        feedback(response.status === 409 ? '別の更新がありました。入力内容を控えてから再読み込みしてください。' : '保存を確認できませんでした。入力内容は残っています。', true);
        return;
      }
      const next = new DOMParser().parseFromString(await response.text(), 'text/html').querySelector('main');
      // Use the acknowledged revision for this event; keep other events on their original revision.
      const forms = new Map([...main.querySelectorAll('.task-editor')].map(item => [item.getAttribute('action'), item]));
      let focus;
      for (const fresh of next.querySelectorAll('.task-editor')) {
        const previous = forms.get(fresh.getAttribute('action'));
        if (!previous) continue;
        if (previous !== form) { fresh.replaceWith(previous); continue; }
        const drafts = new Map([...form.querySelectorAll('[data-dirty]')].filter(row => !selected.includes(row)).map(row => [row.dataset.taskId, row]));
        for (const row of fresh.querySelectorAll('.edit-row')) {
          const draft = drafts.get(row.dataset.taskId);
          if (draft) row.replaceWith(draft);
          else if (single && row.dataset.taskId === single.dataset.taskId) focus = row.querySelector('.completion input[type=checkbox]');
        }
        for (const draft of drafts.values()) { if (draft.hasAttribute('data-new')) fresh.querySelector('[data-new-rows]')?.append(draft); }
        focus ??= fresh.querySelector('[data-dirty] input[type=checkbox], .completion input[type=checkbox]');
      }
      main.replaceWith(next);
      next.querySelectorAll('.task-editor').forEach(refresh);
      (focus ?? next.querySelector('a, input[type=checkbox]'))?.focus({preventScroll: true});
      const title = single?.querySelector('[name^="title."]')?.value || single?.querySelector('h3').firstChild.textContent.trim();
      feedback(single ? '「' + title + '」を' + (deletions.length ? '削除' : '保存') + 'しました。' : selected.length + '件の変更を保存しました。');
    } catch {
      feedback('保存を確認できませんでした。入力内容は残っています。', true);
    } finally {
      main.inert = false;
    }
  }
  window.addEventListener('beforeunload', event => {
    if (document.querySelector('[data-dirty]')) { event.preventDefault(); event.returnValue = ''; }
  });
  document.querySelectorAll('.task-editor').forEach(refresh);
</script>`

function timestamp(value: string, timeZone: string): string {
  return escapeHtml(new Intl.DateTimeFormat('ja-JP', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(value)))
}

type IconName = 'clock' | 'check' | 'calendar' | 'list' | 'edit' | 'undo' | 'bell' | 'trash' | 'info' | 'users'

function icon(name: IconName): string {
  const paths: Record<IconName, string> = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
    edit: '<path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m13 6 5 5"/>',
    undo: '<path d="M3 10h11a6 6 0 0 1 0 12M3 10l5-5M3 10l5 5" transform="translate(0 -2)"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m3 10v-3a6 6 0 0 0-2-4"/>',
  }
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`
}

function shortDate(value: string): string {
  return `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`
}

const overviewScript = `<script>
  function filterTasks(filter, focus = false) {
    const board = document.querySelector('[data-task-board]');
    if (!board) return;
    let visible = 0;
    board.querySelectorAll('[data-task-status]').forEach(row => {
      const match = filter === 'all' || row.dataset.taskStatus === filter || (filter === 'open' && row.dataset.taskStatus !== 'done');
      row.hidden = !match;
      if (match) visible++;
    });
    document.querySelectorAll('[data-task-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.taskFilter === filter)));
    board.querySelector('[data-filter-empty]').hidden = visible !== 0;
    board.querySelector('[data-visible-count]').textContent = visible;
    if (focus) { board.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'}); board.querySelector('h2').focus({preventScroll:true}); }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-task-filter]');
    if (button) filterTasks(button.dataset.taskFilter, button.classList.contains('metric'));
  });
  filterTasks(document.querySelector('[data-task-board]')?.dataset.initialFilter || 'all');
</script>`

function eventOverview(dashboard: EventDashboard, date: string, timeZone: string): string {
  const { completed, total, overdue, dueToday } = stats(dashboard, date)
  const tasks = dashboard.tasks.toSorted((a,b) => Number(a.done) - Number(b.done) || a.due.localeCompare(b.due))
  const done = tasks.filter(task => task.done)
  const dated = done.filter(task => task.completed_at)
  const onTime = dated.filter(task => dateInTimeZone(new Date(task.completed_at!), timeZone) <= task.due).length
  const late = dated.length - onTime
  const unknown = completed - dated.length
  const activities = tasks.flatMap(task => (task.history ?? []).map(entry => ({...entry, title: task.title}))).toSorted((a,b) => Date.parse(b.at) - Date.parse(a.at))
  const base = `/events/${encodeURIComponent(dashboard.slug)}`
  const initialFilter = 'all'
  const filter = (key: string, label: string, count: number) => `<button type="button" data-task-filter="${key}" aria-pressed="false">${label}<span>${count}</span></button>`
  const metric = (key: string, label: string, count: number, symbol: IconName, color: string) => `<button type="button" class="metric ${color}" data-task-filter="${key}" aria-pressed="false"><span class="metric-heading">${icon(symbol)}${label}</span><span class="metric-number">${count}<small>${key === 'done' ? '/ ' + total : '件'}</small></span></button>`
  const rows = tasks.map(task => {
    const status = task.done ? 'done' : task.due < date ? 'overdue' : task.due === date ? 'today' : 'upcoming'
    const days = Math.round((Date.parse(date) - Date.parse(task.due)) / 86400000)
    const label = task.done ? '完了' : status === 'overdue' ? days + '日超過' : status === 'today' ? '今日' : '予定'
    const completion = task.completed_at ? `<time datetime="${escapeHtml(task.completed_at)}" title="${timestamp(task.completed_at, timeZone)}">${shortDate(dateInTimeZone(new Date(task.completed_at), timeZone))} ${timestamp(task.completed_at, timeZone).split(' ')[1]}</time>` : '日時未記録'
    const owners = task.assignees.length ? task.assignees.map(name => `<span class="owner-tag">@${escapeHtml(name)}</span>`).join('') : '<span class="unassigned">未割当</span>'
    return `<li class="task-summary" data-task-status="${status}"><span class="task-symbol ${status}" title="${label}">${icon(task.done ? 'check' : status === 'overdue' ? 'clock' : 'calendar')}<span class="sr-only">${label}</span></span><div class="summary-main"><h3>${escapeHtml(task.title)}</h3><div class="summary-meta"><time datetime="${escapeHtml(task.due)}" title="期日 ${escapeHtml(task.due)}">${shortDate(task.due)}</time><span class="meta-separator">·</span>${owners}</div></div><div class="summary-status">${task.done ? `<span class="completion-date">${completion}</span>` : `<span class="due-label ${status}">${label}</span>`}<a class="icon-button" href="${base}?tab=edit#task-${encodeURIComponent(task.id)}" aria-label="${escapeHtml(task.title)}を編集" title="編集">${icon('edit')}</a></div></li>`
  }).join('')
  const days = Array.from({length: 7}, (_, i) => new Date(Date.parse(date + 'T00:00:00Z') - (6-i) * 86400000).toISOString().slice(0,10))
  const completions = tasks.flatMap(task => {
    const recorded = (task.history ?? []).filter(entry => entry.done).map(entry => entry.at)
    return task.completed_at && !recorded.some(at => Date.parse(at) === Date.parse(task.completed_at!)) ? [...recorded, task.completed_at] : recorded
  })
  const counts = days.map(day => completions.filter(at => dateInTimeZone(new Date(at), timeZone) === day).length)
  const peak = Math.max(1, ...counts)
  const recordedCount = counts.reduce((sum, count) => sum + count, 0)
  const breakdown = [{label:'期日内', count:onTime, color:'on-time'}, {label:'期日後', count:late, color:'late'}, {label:'日時なし', count:unknown, color:'unknown'}]
  return `<div class="metrics event-metrics" aria-label="タスクの状況">${metric('overdue', '期限超過', overdue, 'clock', 'metric-overdue')}${metric('today', '今日', dueToday, 'calendar', 'metric-today')}${metric('open', '未完了', total-completed, 'list', '')}${metric('done', '完了', completed, 'check', 'metric-done')}</div>
    <div class="dashboard-grid"><section class="task-board" data-task-board data-initial-filter="${initialFilter}"><header class="panel-heading"><h2 tabindex="-1">タスク <span data-visible-count>${total}</span></h2><a class="icon-button" href="${base}?tab=edit" aria-label="タスクを編集" title="編集">${icon('edit')}</a></header><div class="task-filters" role="group" aria-label="タスクの絞り込み">${filter('all','すべて',total)}${filter('overdue','超過',overdue)}${filter('today','今日',dueToday)}${filter('open','未完了',total-completed)}${filter('done','完了',completed)}</div><ul class="summary-list">${rows}</ul><p class="filter-empty" data-filter-empty hidden>${icon('check')}該当するタスクはありません</p></section>
    <aside class="insights" aria-label="運営メトリクス"><section class="insight-card"><header class="panel-heading"><h2>完了内訳</h2><details class="info-popover"><summary aria-label="集計について" title="集計について">${icon('info')}</summary><div><p>完了日時を記録したタスクを期日と比較しています。未完了のタスクは含みません。</p><p>過去の完了日時は不明です。削除したタスクは集計対象外です。</p></div></details></header><div class="completion-breakdown" role="img" aria-label="期日内 ${onTime}件、期日後 ${late}件、日時未記録 ${unknown}件">${breakdown.map(item => `<span class="${item.color}" style="flex-grow:${item.count}" title="${item.label} ${item.count}件"></span>`).join('')}${!completed ? '<span class="no-completions"></span>' : ''}</div><div class="breakdown-legend">${breakdown.map(item => `<div><span class="legend-dot ${item.color}"></span><span>${item.label}</span><strong>${item.count}</strong></div>`).join('')}</div></section>
    <section class="insight-card"><header class="panel-heading"><h2>完了の推移</h2><span class="subtle">7日間</span></header><div class="chart-heading"><strong>${recordedCount}<small>件</small></strong><span class="subtle">${shortDate(days[0]!)} – ${shortDate(date)}</span></div><div class="completion-chart" role="img" aria-label="直近7日の完了記録：${days.map((day,i) => `${shortDate(day)} ${counts[i]}件`).join('、')}">${days.map((day,i) => `<div class="chart-column" title="${day} 完了 ${counts[i]}件"><span class="bar-value">${counts[i] || ''}</span><div class="bar-track"><i style="height:${counts[i]! / peak * 100}%"></i></div><span class="bar-day${day === date ? ' is-today' : ''}">${shortDate(day)}</span></div>`).join('')}</div></section>
    <section class="insight-card activity-panel"><header class="panel-heading"><h2>アクティビティ</h2><details class="info-popover"><summary aria-label="履歴について" title="履歴について">${icon('info')}</summary><div><p>直近10件。このWeb画面で保存した完了・再開の履歴です。GitHubで直接変更した時刻は含みません。</p><p>グラフは記録された完了操作の回数です。同じタスクの再完了も含みます。</p><p>表示日時：${escapeHtml(timeZone)}</p></div></details></header>${activities.length ? `<ol class="activity-list">${activities.slice(0,10).map(entry => `<li><span class="activity-symbol ${entry.done ? 'is-done' : ''}">${icon(entry.done ? 'check' : 'undo')}</span><div><strong>${escapeHtml(entry.title)}</strong><p>${entry.done ? '完了' : '再開'}<time datetime="${escapeHtml(entry.at)}" title="${timestamp(entry.at,timeZone)}">${shortDate(dateInTimeZone(new Date(entry.at),timeZone))} ${timestamp(entry.at,timeZone).split(' ')[1]}</time></p></div></li>`).join('')}</ol>` : '<p class="quiet-empty">履歴なし</p>'}</section></aside></div>`
}

function eventPage(dashboard: EventDashboard, date: string, members: readonly Operator[], saved = false, editing = false, timeZone = 'Asia/Tokyo'): string {
  const { completed, total, progress } = stats(dashboard, date)
  const notice = saved ? '<div class="notice" role="status">変更を保存しました。</div>' : ''
  const base = `/events/${encodeURIComponent(dashboard.slug)}`
  const content = `<main>${pageHeader(dashboard.title, dashboard.date+' 開催', `<a class="page-issue-link" href="${escapeHtml(dashboard.issueUrl)}" aria-label="ichiza Event Hub Issue" title="ichiza Event Hub Issue">Event Hub Issue ↗</a><div class="page-progress"><div><span>タスク完了</span><strong>${completed} / ${total}</strong></div><progress aria-label="タスク完了率" max="100" value="${progress}"></progress></div>`)}<nav class="event-tabs" aria-label="イベントの表示"><a href="${base}"${!editing ? ' aria-current="page"' : ''}>ダッシュボード</a><a href="${base}?tab=edit"${editing ? ' aria-current="page"' : ''}>編集</a><a class="results-link" href="${base}/results">メトリクス ↗</a></nav>${notice}
    ${editing ? `<section><div class="section-title"><h2>タスクを編集</h2><span>${health(dashboard, date)}</span></div>${taskList(dashboard, dashboard.tasks, date, members, true)}</section>` : eventOverview(dashboard, date, timeZone)}</main>`
  return layout(dashboard.title, content + (editing ? editorScript : overviewScript))
}

function myPage(dashboards: readonly EventDashboard[], operator: Operator, date: string, members: readonly Operator[]): string {
  const cards = dashboards.flatMap((dashboard) => {
    const assigned = dashboard.tasks.filter((task) => task.assignees.includes(operator.github) && !task.done)
    if (assigned.length === 0) return []
    const rows = taskList(dashboard, assigned, date, members)
    return [`<section class="board"><div class="board-head"><h2>${escapeHtml(dashboard.title)}</h2><span class="subtle">${assigned.length}件</span></div>${rows}</section>`]
  })
  const taskCount = cards.length === 0 ? 0 : dashboards.reduce((count, dashboard) => count + dashboard.tasks.filter((task) => task.assignees.includes(operator.github) && !task.done).length, 0)
  const overdue = dashboards.flatMap((dashboard) => dashboard.tasks).filter((task) => task.assignees.includes(operator.github) && !task.done && task.due < date).length
  return layout('My Page', `<main>${pageHeader('My Page', '@'+operator.github+' さんの担当タスク', statusPill(overdue > 0 ? '期限超過あり' : '対応中', overdue > 0 ? 'red' : 'green'))}<div class="metrics"><div class="metric"><div class="label">担当中</div><div class="value">${taskCount}</div></div><div class="metric"><div class="label">期限超過</div><div class="value ${overdue > 0 ? 'danger' : ''}">${overdue}</div></div></div><div style="display:grid;gap:1rem">${cards.join('') || '<p class="empty">未完了の担当タスクはありません。</p>'}</div></main>` + editorScript, 'me')
}

export function createApp(overrides: Partial<AppDependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides }
  const app = new Hono<AppEnv>()

  // Public, immutable branding only. Event and metrics routes still require Access.
  app.get('/img/logo.svg', context => context.body(logoSvg, 200, {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=86400',
  }))
  app.get('/favicon.ico', context => context.redirect('/img/logo.svg', 302))

  app.use('*', async (context, next) => {
    try {
      context.set('operator', await dependencies.authenticate(context.req.raw, context.env))
      await next()
    } catch (error) {
      if (error instanceof AccessError) return context.text(error.message, error.status)
      throw error
    }
  })

  app.onError((error, context) => {
    if (error instanceof RecordConflictError) return context.html(layout('更新の競合', '<main><h1>更新がありました</h1><p>元のIssueが更新されています。集計を読み込み直してください。</p></main>'),409)
    if (error instanceof GitHubRequestError) {
      console.error('GitHub API request failed', { status: error.status })
    } else if (error instanceof GitHubTransportError) {
      console.error('GitHub API transport failed', { detail: error.detail })
    } else {
      console.error(error)
      return context.text('Internal Server Error', 500)
    }
    return context.html(
      layout(
        'GitHub接続エラー',
        '<h1>GitHub接続エラー</h1><p>GitHubからイベント情報を取得できませんでした。しばらく待って再読み込みしてください。</p>',
      ),
      502,
    )
  })

  app.get('/', async (context) => {
    const dashboards = (await dependencies.repository(context.env).listDashboards()).filter(event=>event.state!=='closed')
    const date = today(dependencies, context.env)
    const allTasks = dashboards.flatMap((dashboard) => dashboard.tasks)
    const completed = allTasks.filter((task) => task.done).length
    const overdue = allTasks.filter((task) => !task.done && task.due < date).length
    const dueToday = allTasks.filter((task) => !task.done && task.due === date).length
    const cards = dashboards.map((dashboard) => eventCard(dashboard, date)).join('')
    const content = `<main>${pageHeader('イベント', '', statusPill(overdue > 0 ? '対応が必要' : 'すべて正常', overdue > 0 ? 'red' : 'green'))}<div class="metrics"><div class="metric"><div class="label">進行中のイベント</div><div class="value">${dashboards.length}</div></div><div class="metric"><div class="label">未完了タスク</div><div class="value">${allTasks.length - completed}</div></div><div class="metric"><div class="label">期限超過</div><div class="value ${overdue > 0 ? 'danger' : ''}">${overdue}</div></div><div class="metric"><div class="label">今日の期限</div><div class="value">${dueToday}</div></div></div><div class="event-list">${cards || '<p class="empty">イベントはまだありません。</p>'}</div></main>`
    return context.html(layout('イベント', content))
  })

  app.get('/events/:slug', async (context) => {
    const dashboards = await dependencies.repository(context.env).listDashboards()
    const dashboard = dashboards.find(candidate => candidate.slug === context.req.param('slug'))
    if (!dashboard) return context.text('event not found', 404)
    return context.html(eventPage(dashboard, today(dependencies, context.env), dependencies.members(context.env), context.req.query('saved') === '1', context.req.query('tab') === 'edit', context.env?.ICHIZA_TIMEZONE ?? 'Asia/Tokyo'))
  })

  app.get('/records', async context => {
    const year=context.req.query('year')??'all'
    if(!validYear(year))return context.text('invalid metrics year',400)
    const existing=await dependencies.records(context.env).loadAggregate()
    if(!existing)return context.html(layout('運営メトリクス',`<main>${pageHeader('運営メトリクス','初回の自動同期を待っています。')}</main>`,'records'))
    const snapshot={...existing.snapshot,year,events:existing.snapshot.events.filter(event=>year==='all'||event.date.startsWith(year+'-'))}
    const years=[...new Set(existing.snapshot.events.map(event=>event.date.slice(0,4)))].toSorted().toReversed()
    return context.html(layout('運営メトリクス',aggregateView(snapshot,{years,existing,automatic:true}),'records'))
  })

  app.get('/records/export', async context => {
    const year=context.req.query('year')??'all',format=context.req.query('format')
    if(!validYear(year)||(format!=='csv'&&format!=='markdown'))return context.text('invalid export',400)
    const existing=await dependencies.records(context.env).loadAggregate()
    if(!existing)return context.text('metrics index is not initialized',404)
    const snapshot={...existing.snapshot,year,events:existing.snapshot.events.filter(event=>year==='all'||event.date.startsWith(year+'-'))}
    context.header('Content-Disposition',`attachment; filename="ichiza-metrics-${year}.${format==='csv'?'csv':'md'}"`)
    return context.body(format==='csv'?metricsCsv(snapshot.events,snapshot.capturedAt,snapshot.timeZone):renderAggregate(snapshot),200,{'Content-Type':format==='csv'?'text/csv; charset=utf-8':'text/markdown; charset=utf-8'})
  })

  app.get('/records/save',context=>context.redirect('/records',303))
  app.post('/records/save',context=>context.text('metrics are synchronized automatically',410))

  app.get('/records/saved/export', async context => {
    const format=context.req.query('format')
    if(format!=='csv'&&format!=='markdown')return context.text('invalid export',400)
    const record=await dependencies.records(context.env).loadAggregate()
    if(!record)return context.text('metrics record not found',404)
    context.header('Content-Disposition',`attachment; filename="ichiza-metrics-saved.${format==='csv'?'csv':'md'}"`)
    const s=record.snapshot
    return context.body(format==='csv'?metricsCsv(s.events,s.capturedAt,s.timeZone):renderAggregate(s),200,{'Content-Type':format==='csv'?'text/csv; charset=utf-8':'text/markdown; charset=utf-8'})
  })

  app.get('/records/saved', async context => {
    const existing=await dependencies.records(context.env).loadAggregate()
    if(!existing)return context.text('metrics record not found',404)
    return context.html(layout('保存した横断集計',aggregateView(existing.snapshot,{years:[],existing,stored:true,saved:context.req.query('saved')==='1'}),'records'))
  })

  app.get('/records/:slug/export', async context => {
    const format=context.req.query('format')
    if(format!=='csv'&&format!=='markdown')return context.text('invalid export',400)
    const index=await dependencies.records(context.env).loadAggregate()
    const reference=index?.snapshot.events.find(event=>event.slug===context.req.param('slug'))
    if(!reference)return context.text('closed event not found',404)
    const repository=dependencies.repository(context.env)
    if(!repository.getDashboard)return context.text('single issue lookup is unavailable',503)
    const event=await repository.getDashboard(reference.sourceIssueNumber)
    if(!event||event.state!=='closed'||event.slug!==reference.slug)return context.text('closed event not found',404)
    const snapshot=createSnapshot(event,context.env?.ICHIZA_TIMEZONE??'Asia/Tokyo',event.closedAt??event.updatedAt!)
    context.header('Content-Disposition',`attachment; filename="${snapshot.slug}-metrics.${format==='csv'?'csv':'md'}"`)
    return context.body(format==='csv'?recordsCsv([snapshot]):renderRecord(snapshot),200,{'Content-Type':format==='csv'?'text/csv; charset=utf-8':'text/markdown; charset=utf-8'})
  })

  app.get('/records/:slug', async context => {
    const index=await dependencies.records(context.env).loadAggregate()
    const reference=index?.snapshot.events.find(event=>event.slug===context.req.param('slug'))
    if(!reference)return context.text('closed event not found',404)
    const repository=dependencies.repository(context.env)
    if(!repository.getDashboard)return context.text('single issue lookup is unavailable',503)
    const event=await repository.getDashboard(reference.sourceIssueNumber)
    if(!event||event.state!=='closed'||event.slug!==reference.slug)return context.text('closed event not found',404)
    const snapshot=createSnapshot(event,context.env?.ICHIZA_TIMEZONE??'Asia/Tokyo',event.closedAt??event.updatedAt!)
    return context.html(layout(event.title,individualView(snapshot),'records'))
  })

  app.get('/events/:slug/results/export', async context => {
    const format=context.req.query('format')
    if(format!=='csv'&&format!=='markdown')return context.text('invalid export',400)
    const event=(await dependencies.repository(context.env).listDashboards()).find(event=>event.slug===context.req.param('slug'))
    if(!event)return context.text('event not found',404)
    const snapshot=createSnapshot(event,context.env?.ICHIZA_TIMEZONE??'Asia/Tokyo',event.state==='closed'?(event.closedAt??event.updatedAt!):dependencies.now().toISOString())
    context.header('Content-Disposition',`attachment; filename="${snapshot.slug}-metrics.${format==='csv'?'csv':'md'}"`)
    return context.body(format==='csv'?recordsCsv([snapshot]):renderRecord(snapshot),200,{'Content-Type':format==='csv'?'text/csv; charset=utf-8':'text/markdown; charset=utf-8'})
  })

  app.get('/events/:slug/results', async context => {
    const event=(await dependencies.repository(context.env).listDashboards()).find(event=>event.slug===context.req.param('slug'))
    if(!event)return context.text('event not found',404)
    const snapshot=createSnapshot(event,context.env?.ICHIZA_TIMEZONE??'Asia/Tokyo',event.state==='closed'?(event.closedAt??event.updatedAt!):dependencies.now().toISOString())
    return context.html(layout(event.title,individualView(snapshot,false)))
  })

  app.get('/me', async (context) => {
    const dashboards = (await dependencies.repository(context.env).listDashboards()).filter(event=>event.state!=='closed')
    return context.html(myPage(dashboards, context.get('operator'), today(dependencies, context.env), dependencies.members(context.env)))
  })

  app.post('/events/:slug/tasks/:taskId?', async (context) => {
    if (context.req.header('Origin') !== new URL(context.req.url).origin) return context.text('forbidden', 403)
    const form = await context.req.parseBody({ all: true })
    const issueNumber = Number(form.issueNumber)
    const expectedUpdatedAt = form.expectedUpdatedAt
    if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0 || typeof expectedUpdatedAt !== 'string' || !expectedUpdatedAt) {
      return context.text('invalid task update', 400)
    }
    const repository = dependencies.repository(context.env)
    const dashboards = await repository.listDashboards()
    const dashboard = dashboards.find(
      (candidate) => candidate.slug === context.req.param('slug') && candidate.issueNumber === issueNumber,
    )
    if (dashboard === undefined) return context.text('event not found', 404)
    try {
      if (dashboard.updatedAt !== expectedUpdatedAt) throw new DashboardConflictError()
      const updates: DashboardTaskUpdate[] = []
      const byId = new Map(dashboard.tasks.map(task => [task.id, task]))
      const allowed = new Set(dependencies.members(context.env).map(member => member.github))
      const single = context.req.param('taskId')
      const ids = single === undefined
        ? new Set(Object.keys(form).filter(key => key.startsWith('assign.') || key.startsWith('done.') || key.startsWith('notify.') || key.startsWith('mention.') || key.startsWith('create.') || key.startsWith('delete.')).map(key => key.slice(key.indexOf('.') + 1)))
        : [single]
      for (const taskId of ids) {
        const task = byId.get(taskId)
        const create = form[`create.${taskId}`]
        const deleted = form[`delete.${taskId}`]
        if (deleted !== undefined && deleted !== 'true') return context.text('invalid deletion', 400)
        if (create !== undefined) {
          const title = form[`title.${taskId}`]
          const due = form[`due.${taskId}`]
          if (task || create !== 'true' || !/^web-[a-z0-9-]{1,80}$/.test(taskId) || !validTaskTitle(title) || typeof due !== 'string' || !due || due === 'off' || !validReminder(due)) return context.text('タスク名と有効な期日を指定してください。', 400)
          if (deleted) continue
          updates.push({taskId, create: {title: title.trim(), due}})
          // A new task can be assigned and configured in the same save.
          byId.set(taskId, {id: taskId, title, due, assignees: [], labels: [], done: false})
        } else if (!task) return context.text('task not found', 404)
        if (deleted) { updates.push({taskId, delete: true}); continue }
        const currentTask = byId.get(taskId)!
        const owners = form[`assign.${taskId}`] ?? (single ? form.assignee : undefined)
        const completion = form[`done.${taskId}`] ?? (single ? form.done : undefined)
        const update: DashboardTaskUpdate = { taskId }
        if (owners !== undefined) {
          const values = Array.isArray(owners) ? owners : [owners]
          const names = values.filter(value => value !== '')
          if (!names.every((name): name is string => typeof name === 'string' && (allowed.has(name) || currentTask.assignees.includes(name)))) {
            return context.text('invalid assignee', 400)
          }
          const selected = [...new Set(names)]
          if (selected.length !== currentTask.assignees.length || selected.some(name => !currentTask.assignees.includes(name))) update.assignees = selected
        }
        if (completion !== undefined) {
          const values = Array.isArray(completion) ? completion : [completion]
          if (!values.every(value => value === 'false' || value === 'true')) return context.text('invalid completion', 400)
          const done = values.includes('true')
          if (done !== currentTask.done) update.done = done
        }
        const mode = form[`notify.${taskId}`]
        if (mode !== undefined) {
          let reminder: string
          if (mode === 'date') {
            const day = form[`date.${taskId}`]
            if (typeof day !== 'string' || !day || day === 'off' || !validReminder(day)) return context.text('有効な通知日を指定してください。', 400)
            reminder = day
          } else if (mode === 'default' || mode === 'off') {
            reminder = mode === 'off' ? 'off' : ''
          } else {
            return context.text('無効な通知設定です。', 400)
          }
          if (reminder !== (currentTask.reminder ?? '')) update.reminder = reminder
        }
        const mention = form[`mention.${taskId}`]
        if (mention !== undefined) {
          const values = Array.isArray(mention) ? mention : [mention]
          if (!values.every(value => value === 'true' || value === 'false')) return context.text('無効なメンション設定です。', 400)
          const enabled = values.includes('true')
          if (enabled !== Boolean(currentTask.mention_assignees)) update.mentionAssignees = enabled
        }
        if (create === undefined && owners === undefined && completion === undefined && mode === undefined && mention === undefined) return context.text('invalid task update', 400)
        if (update.assignees !== undefined || update.done !== undefined || update.reminder !== undefined || update.mentionAssignees !== undefined) {
          if (create !== undefined) Object.assign(updates.find(item => item.taskId === taskId)!, update)
          else updates.push(update)
        }
      }
      const updated = updates.length ? await repository.updateTasks(issueNumber, updates, expectedUpdatedAt) : dashboard
      const view = context.req.header('X-Ichiza-Editor')
      if (view === 'event' || view === 'me') {
        const date = today(dependencies, context.env)
        const members = dependencies.members(context.env)
        context.header('X-Ichiza-Editor', view)
        return context.html(view === 'event' ? eventPage(updated, date, members, false, true, context.env?.ICHIZA_TIMEZONE ?? 'Asia/Tokyo') :
          myPage(dashboards.map(item => item.issueNumber === issueNumber ? updated : item), context.get('operator'), date, members))
      }
      return context.redirect(`/events/${encodeURIComponent(dashboard.slug)}?tab=edit${updates.length ? '&saved=1' : ''}`, 303)
    } catch (error) {
      if (error instanceof DashboardConflictError) {
        return context.html(layout('競合', '<h1>更新できませんでした</h1><p>GitHubで更新されたため、再読み込みしてください。</p>'), 409)
      }
      throw error
    }
  })

  return app
}

export default createApp()
