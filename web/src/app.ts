import { Hono } from 'hono'
import { styles } from './styles'

import { AccessError, authenticateAccess, parseMembers, type AccessEnv, type Operator } from './auth'
import { validReminder, type DashboardTaskUpdate, type EventDashboard } from './dashboard'
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
  listDashboards(): Promise<readonly EventDashboard[]>
  updateTasks(issueNumber: number, updates: readonly DashboardTaskUpdate[], expectedUpdatedAt: string): Promise<EventDashboard>
}

interface AppDependencies {
  readonly authenticate: (request: Request, env: AccessEnv) => Promise<Operator>
  readonly repository: (env: Bindings) => DashboardRepository
  readonly members: (env: Bindings) => readonly Operator[]
  readonly now: () => Date
}

const defaultDependencies: AppDependencies = {
  authenticate: authenticateAccess,
  repository: (env) =>
    new GitHubClient({ repository: env.ICHIZA_REPOSITORY, token: env.ICHIZA_GITHUB_TOKEN }),
  members: (env) => parseMembers(env.ICHIZA_MEMBERS),
  now: () => new Date(),
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return entities[character] ?? character
  })
}

function layout(title: string, content: string, active: 'events' | 'me' = 'events'): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)} · ichiza</title><style>${styles}</style></head>
    <body><nav aria-label="メイン"><div class="nav-inner"><a class="brand" href="/">ichiza</a>
    <a href="/"${active === 'events' ? ' aria-current="location"' : ''}>イベント</a>
    <a href="/me"${active === 'me' ? ' aria-current="page"' : ''}>My Page</a></div></nav>${content}</body></html>`
}

export function dateInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
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

function taskList(dashboard: EventDashboard, tasks: EventDashboard['tasks'], date: string, members: readonly Operator[]): string {
  if (!tasks.length) return ''
  const logins = members.map(member => member.github)
  const rows = tasks.map(task => {
    const id = escapeHtml(task.id)
    const state = task.done ? '完了' : task.due < date ? '期限超過' : task.due === date ? '今日' : '予定'
    const reminder = task.reminder ?? ''
    const scheduled = reminder !== '' && reminder !== 'off'
    const timingLabel = scheduled ? reminder : reminder === 'off' ? '通知しない' : '期日に合わせて通知'
    const mentionLabel = task.mention_assignees ? 'メンションあり' : 'メンションなし'
    const assigned = task.assignees
    const choices = [...new Set([...logins, ...assigned])].map(login =>
      `<label><input type="checkbox" name="assign.${id}" value="${escapeHtml(login)}"${assigned.includes(login) ? ' checked' : ''}>${escapeHtml(login)}</label>`,
    ).join('')
    return `<div class="edit-row" data-task-id="${id}">
      <div class="edit-title"><h3>${escapeHtml(task.title)} <small class="draft-label" hidden>未保存</small></h3>
        <label class="completion"><input type="hidden" name="done.${id}" value="false"><input type="checkbox" name="done.${id}" value="true"${task.done ? ' checked' : ''}>完了</label></div>
      <div class="task-meta">期日 ${escapeHtml(task.due)} <span data-state data-open-state="${task.due < date ? '期限超過' : task.due === date ? '今日' : '予定'}">· ${state}</span></div>
      <fieldset class="owners"><legend>担当者</legend><input type="hidden" name="assign.${id}" value="">${choices}</fieldset>
      <details class="notification"><summary><strong>Slack 通知</strong><span class="settings-summary">${escapeHtml(timingLabel)}${reminder === 'off' ? '' : ' · ' + mentionLabel}</span></summary>
      <div class="settings-line"><label>通知タイミング <select name="notify.${id}">
        <option value="default"${!reminder ? ' selected' : ''}>期日に合わせて通知</option>
        <option value="date"${scheduled ? ' selected' : ''}>指定日だけ通知</option>
        <option value="off"${reminder === 'off' ? ' selected' : ''}>通知しない</option>
      </select></label>
      <label data-date>通知日 <input type="date" name="date.${id}" value="${scheduled ? escapeHtml(reminder) : ''}"></label>
      <label data-mention><input type="hidden" name="mention.${id}" value="false"><input type="checkbox" name="mention.${id}" value="true"${task.mention_assignees ? ' checked' : ''}> 担当者をメンションする</label></div></details>
      <button type="button" data-save-task hidden>このタスクを保存</button>
    </div>`
  }).join('')
  return `<form class="task-editor" method="post" action="/events/${encodeURIComponent(dashboard.slug)}/tasks">
    <input type="hidden" name="issueNumber" value="${dashboard.issueNumber}">
    <input type="hidden" name="expectedUpdatedAt" value="${escapeHtml(dashboard.updatedAt ?? '')}">
    <p class="editor-help">完了・担当者・Slack 通知の変更は、保存するまで反映されません。変更したタスクだけ保存するか、下のボタンでこの一覧の変更をまとめて保存できます。</p>
    ${rows}<div class="edit-footer"><span role="status" data-status></span><button type="reset" hidden>変更を取り消す</button><button type="submit">すべての変更を保存</button></div></form>`
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
      const date = row.querySelector('input[type=date]');
      const dated = mode.value === 'date';
      date.disabled = !dated;
      date.required = dated;
      row.querySelector('[data-date]').hidden = !dated;
      row.querySelector('[data-mention]').hidden = mode.value === 'off';
      const mention = row.querySelector('[data-mention] input[type=checkbox]').checked;
      const timing = dated && date.value ? date.value : mode.selectedOptions[0].textContent;
      row.querySelector('.settings-summary').textContent = timing + (mode.value === 'off' ? '' : ' · ' + (mention ? 'メンションあり' : 'メンションなし'));
      const state = row.querySelector('[data-state]');
      state.textContent = '· ' + (row.querySelector('.edit-title input[type=checkbox]').checked ? '完了' : state.dataset.openState);
      const dirty = [...row.querySelectorAll('input[type=checkbox]')].some(input => input.checked !== input.defaultChecked)
        || !mode.selectedOptions[0].defaultSelected || (dated && date.value !== date.defaultValue);
      row.toggleAttribute('data-dirty', dirty);
      row.querySelector('.draft-label').hidden = !dirty;
      row.querySelector('[data-save-task]').hidden = !dirty;
      if (dirty) count++;
    }
    save.disabled = count === 0;
    save.textContent = count ? 'すべての変更を保存（' + count + '件）' : 'すべての変更を保存';
    reset.hidden = count === 0;
    form.querySelector('[data-status]').textContent = count ? '未保存 ' + count + '件' : '未保存の変更はありません';
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
    if (form) refresh(form);
  });
  document.addEventListener('reset', event => {
    if (event.target.matches('.task-editor')) setTimeout(() => { feedback(''); refresh(event.target); }, 0);
  });
  document.addEventListener('click', event => {
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
        focus ??= fresh.querySelector('[data-dirty] input[type=checkbox], .completion input[type=checkbox]');
      }
      main.replaceWith(next);
      next.querySelectorAll('.task-editor').forEach(refresh);
      (focus ?? next.querySelector('a, input[type=checkbox]'))?.focus({preventScroll: true});
      feedback(single ? '「' + single.querySelector('h3').firstChild.textContent.trim() + '」を保存しました。' : selected.length + '件の変更を保存しました。');
    } catch {
      feedback('保存を確認できませんでした。入力内容は残っています。', true);
    } finally {
      main.inert = false;
    }
  }
  document.querySelectorAll('.task-editor').forEach(refresh);
</script>`

function eventPage(dashboard: EventDashboard, date: string, members: readonly Operator[], saved = false): string {
  const { completed, total, progress } = stats(dashboard, date)
  const notice = saved ? '<div class="notice" role="status">変更を保存しました。</div>' : ''
  const rows = taskList(dashboard, dashboard.tasks, date, members)
  const content = `<main><header class="event-hero">
    <div><p class="hero-meta"><time datetime="${escapeHtml(dashboard.date)}">${escapeHtml(dashboard.date)} 開催</time></p>
      <h1>${escapeHtml(dashboard.title)}</h1><a class="hero-link" href="${escapeHtml(dashboard.issueUrl)}">GitHub Dashboard Issue ↗</a></div>
    <div class="hero-progress"><div><span>タスク完了</span><strong>${completed} / ${total}</strong></div>
      <progress aria-label="タスク完了率" max="100" value="${progress}"></progress></div>
    </header>${notice}<section><div class="section-title"><h2>タスク一覧</h2><span>${health(dashboard, date)}</span></div>
    ${rows || '<p class="empty">タスクはまだありません。</p>'}</section></main>`
  return layout(dashboard.title, content + editorScript)
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
  return layout('My Page', `<main><div class="hero"><div><h1>My Page</h1><p>@${escapeHtml(operator.github)} さんの担当タスク</p></div>${statusPill(overdue > 0 ? '期限超過あり' : '対応中', overdue > 0 ? 'red' : 'green')}</div><div class="metrics"><div class="metric"><div class="label">担当中</div><div class="value">${taskCount}</div></div><div class="metric"><div class="label">期限超過</div><div class="value ${overdue > 0 ? 'danger' : ''}">${overdue}</div></div></div><div style="display:grid;gap:1rem">${cards.join('') || '<p class="empty">未完了の担当タスクはありません。</p>'}</div></main>` + editorScript, 'me')
}

export function createApp(overrides: Partial<AppDependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides }
  const app = new Hono<AppEnv>()

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
    const dashboards = await dependencies.repository(context.env).listDashboards()
    const date = today(dependencies, context.env)
    const allTasks = dashboards.flatMap((dashboard) => dashboard.tasks)
    const completed = allTasks.filter((task) => task.done).length
    const overdue = allTasks.filter((task) => !task.done && task.due < date).length
    const dueToday = allTasks.filter((task) => !task.done && task.due === date).length
    const cards = dashboards.map((dashboard) => eventCard(dashboard, date)).join('')
    const content = `<main><div class="hero"><div><h1>イベント</h1><p>運営中のイベントを、期限と進捗から確認します。</p></div>${statusPill(overdue > 0 ? '対応が必要' : 'すべて正常', overdue > 0 ? 'red' : 'green')}</div><div class="metrics"><div class="metric"><div class="label">進行中のイベント</div><div class="value">${dashboards.length}</div></div><div class="metric"><div class="label">未完了タスク</div><div class="value">${allTasks.length - completed}</div></div><div class="metric"><div class="label">期限超過</div><div class="value ${overdue > 0 ? 'danger' : ''}">${overdue}</div></div><div class="metric"><div class="label">今日の期限</div><div class="value">${dueToday}</div></div></div><div class="event-list">${cards || '<p class="empty">イベントはまだありません。</p>'}</div></main>`
    return context.html(layout('イベント', content))
  })

  app.get('/events/:slug', async (context) => {
    const dashboards = await dependencies.repository(context.env).listDashboards()
    const dashboard = dashboards.find(candidate => candidate.slug === context.req.param('slug'))
    if (!dashboard) return context.text('event not found', 404)
    return context.html(eventPage(dashboard, today(dependencies, context.env), dependencies.members(context.env), context.req.query('saved') === '1'))
  })

  app.get('/me', async (context) => {
    const dashboards = await dependencies.repository(context.env).listDashboards()
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
        ? new Set(Object.keys(form).filter(key => key.startsWith('assign.') || key.startsWith('done.') || key.startsWith('notify.') || key.startsWith('mention.')).map(key => key.slice(key.indexOf('.') + 1)))
        : [single]
      for (const taskId of ids) {
        const task = byId.get(taskId)
        if (!task) return context.text('task not found', 404)
        const owners = form[`assign.${taskId}`] ?? (single ? form.assignee : undefined)
        const completion = form[`done.${taskId}`] ?? (single ? form.done : undefined)
        const update: DashboardTaskUpdate = { taskId }
        if (owners !== undefined) {
          const values = Array.isArray(owners) ? owners : [owners]
          const names = values.filter(value => value !== '')
          if (!names.every((name): name is string => typeof name === 'string' && (allowed.has(name) || task.assignees.includes(name)))) {
            return context.text('invalid assignee', 400)
          }
          const selected = [...new Set(names)]
          if (selected.length !== task.assignees.length || selected.some(name => !task.assignees.includes(name))) update.assignees = selected
        }
        if (completion !== undefined) {
          const values = Array.isArray(completion) ? completion : [completion]
          if (!values.every(value => value === 'false' || value === 'true')) return context.text('invalid completion', 400)
          const done = values.includes('true')
          if (done !== task.done) update.done = done
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
          if (reminder !== (task.reminder ?? '')) update.reminder = reminder
        }
        const mention = form[`mention.${taskId}`]
        if (mention !== undefined) {
          const values = Array.isArray(mention) ? mention : [mention]
          if (!values.every(value => value === 'true' || value === 'false')) return context.text('無効なメンション設定です。', 400)
          const enabled = values.includes('true')
          if (enabled !== Boolean(task.mention_assignees)) update.mentionAssignees = enabled
        }
        if (owners === undefined && completion === undefined && mode === undefined && mention === undefined) return context.text('invalid task update', 400)
        if (update.assignees !== undefined || update.done !== undefined || update.reminder !== undefined || update.mentionAssignees !== undefined) updates.push(update)
      }
      const updated = updates.length ? await repository.updateTasks(issueNumber, updates, expectedUpdatedAt) : dashboard
      const view = context.req.header('X-Ichiza-Editor')
      if (view === 'event' || view === 'me') {
        const date = today(dependencies, context.env)
        const members = dependencies.members(context.env)
        context.header('X-Ichiza-Editor', view)
        return context.html(view === 'event' ? eventPage(updated, date, members) :
          myPage(dashboards.map(item => item.issueNumber === issueNumber ? updated : item), context.get('operator'), date, members))
      }
      return context.redirect(`/events/${encodeURIComponent(dashboard.slug)}${updates.length ? '?saved=1' : ''}`, 303)
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
