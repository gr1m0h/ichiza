export const styles = `
:root {
  color-scheme:light;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,Cantarell,"Noto Sans",sans-serif;
  --ink:#1c1e21; --muted:#606770; --line:#dadde1; --soft-line:#ebedf0;
  --accent:#b03a2e; --tint:#fbefed; --paper:#fff; --surface:#fff; --surface-alt:#f5f6f7;
  --success:#277453; --success-tint:#e9f4ed; --warning:#93631e; --warning-tint:#fff3de;
  --danger:#b03a2e; --danger-tint:#fbefed; --chart:#c35e52; --chart-muted:#e5e7eb;
  --hero-bg:#242526; --hero-ink:#f5f6f7; --hero-muted:#c7c9ce; --hero-accent:#e88a7d; --button-ink:#fff;
  color:var(--ink); background:var(--paper); font-size:16px; line-height:1.65;
}
[data-theme=dark] {
  color-scheme:dark;
  --ink:#e3e3e3; --muted:#b0b3b8; --line:#444950; --soft-line:#35373b;
  --accent:#e88a7d; --tint:#3a2927; --paper:#1b1b1d; --surface:#242526; --surface-alt:#2d2e30;
  --success:#88c9a4; --success-tint:#203a2c; --warning:#e3bc75; --warning-tint:#3c3220;
  --danger:#f09287; --danger-tint:#3c2726; --chart:#e88a7d; --chart-muted:#424448; --button-ink:#1b1b1d;
}
*{box-sizing:border-box}
html{scrollbar-gutter:stable}
body{margin:0}
[hidden]{display:none!important}
a{color:var(--accent);text-underline-offset:.2em}
button,input,select{font:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
main,.nav-inner{width:min(1050px,calc(100% - 3rem));margin-inline:auto}
main{padding:2rem 0 3rem}
nav{background:var(--surface);border-bottom:1px solid var(--line)}
.nav-inner{display:flex;align-items:center;gap:.45rem;min-height:60px}
nav a{text-decoration:none;color:var(--muted);padding:.45rem .8rem;border-radius:8px;font-size:.91rem;font-weight:650}
nav a[aria-current],nav a:hover{color:var(--accent);background:var(--tint)}
nav .brand{padding:0;margin-right:auto;font-size:1.25rem;font-weight:700;letter-spacing:-.025em;color:var(--ink);display:inline-flex;align-items:center;gap:.47rem}
.brand img{display:block;width:32px;height:32px}.theme-toggle{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;flex-shrink:0;padding:6px;border:0;border-radius:50%;background:transparent;color:var(--ink);cursor:pointer}.theme-toggle:hover{background:var(--surface-alt)}.theme-toggle svg{width:22px;height:22px}nav .brand:hover{background:transparent;color:var(--ink)}
h1,h2,h3,p{margin:0}
h1{font-size:clamp(1.65rem,3.2vw,2.5rem);line-height:1.2;letter-spacing:-.045em;overflow-wrap:anywhere}
h2{font-size:1.2rem;letter-spacing:-.025em}
.event-hero{position:relative;isolation:isolate;overflow:hidden;border-radius:20px;padding:clamp(1.3rem,3vw,2.2rem);display:grid;grid-template-columns:minmax(0,1fr) minmax(130px,175px);align-items:end;gap:1.5rem;color:var(--hero-ink);background:var(--hero-bg);border:1px solid var(--line)}

.hero-meta,.hero-progress>div,.section-title,.edit-title,.edit-footer,.settings-line{display:flex;align-items:center;gap:.65rem;flex-wrap:wrap}
.hero-meta{margin-bottom:.7rem;font-size:.86rem;color:var(--hero-muted)}
.hero-link{display:inline-block;margin-top:.85rem;color:var(--hero-accent);font-size:.83rem}
.hero-progress>div{justify-content:space-between;color:var(--hero-muted);font-size:.84rem}
.hero-progress strong{font-size:1.35rem;color:var(--hero-ink);font-variant-numeric:tabular-nums}
progress{width:100%;height:.46rem;appearance:none;border:0;border-radius:10px;background:#ffffff36}
progress::-webkit-progress-bar{background:#ffffff36;border-radius:10px}
progress::-webkit-progress-value{background:var(--hero-accent);border-radius:10px}
progress::-moz-progress-bar{background:var(--hero-accent);border-radius:10px}
.section-title{margin:1.65rem 0 .25rem;justify-content:space-between}
.section-title span,.subtle,.empty,.task-meta,.editor-help,.status-foot,.hero p{color:var(--muted);font-size:.86rem}
.editor-help{margin:.25rem 0 1rem}
.task-editor{min-width:0}
.edit-row,.card,.board,.metric,.event{border:1px solid var(--line);background:var(--surface);border-radius:14px}
.edit-row{padding:1rem 1.15rem;margin:.55rem 0;box-shadow:0 2px 5px #22203c05}
.edit-row[data-dirty]{border-color:var(--accent);box-shadow:inset 3px 0 var(--accent)}
.edit-title{justify-content:space-between;align-items:baseline;flex-wrap:nowrap}
.edit-title h3{font-size:1.03rem;line-height:1.5;overflow-wrap:anywhere}
.task-meta{display:flex;gap:.6rem;align-items:center;font-size:.78rem;font-variant-numeric:tabular-nums;margin-top:.15rem}
.draft-label{color:var(--accent);background:var(--tint);border-radius:5px;padding:.1rem .4rem;font-size:.72rem}
.completion,.owners label,[data-mention]{display:inline-flex;align-items:center;gap:.4rem;cursor:pointer}
.completion{white-space:nowrap;color:var(--muted);font-size:.84rem}
input[type=checkbox]{accent-color:var(--accent);width:1rem;height:1rem;margin:0}
.completion input[type=checkbox]{width:1.15rem;height:1.15rem}
.completion:has(:checked){color:var(--success)}
.owners{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin:.85rem 0 0;padding:0;border:0;min-width:0}
.owners legend{float:left;font-size:.79rem;font-weight:650;color:var(--muted);margin-right:.5rem;padding:.25rem 0}
.owners label{padding:.2rem .63rem;border:1px solid var(--line);border-radius:999px;font-size:.82rem;min-height:30px;overflow-wrap:anywhere}
.owners label:has(:checked){background:var(--tint);border-color:var(--line);color:var(--accent)}
.owners label input{width:.85rem;height:.85rem}
.notification{margin-top:.8rem;padding-top:.65rem;border-top:1px solid var(--soft-line)}
.notification summary{cursor:pointer;display:flex;align-items:center;flex-wrap:wrap;gap:.5rem;color:var(--muted);font-size:.79rem;list-style:none}
.notification summary::-webkit-details-marker{display:none}
.notification summary::after{content:"";width:.4rem;height:.4rem;margin-left:auto;border-right:1.5px solid;border-bottom:1.5px solid;transform:rotate(45deg)}
.notification[open] summary::after{transform:rotate(225deg)}
.notification summary strong{color:var(--ink)}.settings-summary{font-weight:450}
.settings-line{padding-top:.7rem;font-size:.84rem;gap:.7rem 1rem}
.settings-line select,.settings-line input[type=date]{border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--ink);padding:.38rem .5rem}
[data-save-task]{display:block;margin:.75rem 0 0 auto;border:1px solid var(--line);border-radius:8px;background:var(--tint);color:var(--accent);padding:.4rem .75rem;cursor:pointer;font-size:.84rem;font-weight:650}
.save-feedback:not(:empty){position:fixed;top:.7rem;left:50%;transform:translateX(-50%);z-index:4;max-width:calc(100% - 2rem);width:max-content;background:var(--ink);color:var(--paper);border-radius:9px;padding:.5rem .9rem;box-shadow:0 3px 12px #22203c22;font-size:.85rem}
.save-feedback[data-error]{background:var(--danger)}
.edit-footer{position:sticky;bottom:.65rem;z-index:2;justify-content:flex-end;margin-top:.9rem;padding:.65rem .85rem;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:0 4px 16px #29234213}
.edit-footer [data-status]{margin-right:auto;color:var(--muted);font-size:.84rem}
.edit-footer button{cursor:pointer;border:0;border-radius:8px;padding:.5rem .85rem;font-weight:650}
.edit-footer button[type=submit]{background:var(--accent);color:var(--button-ink)}
.edit-footer button[type=submit]:disabled{background:var(--surface-alt);color:var(--muted);cursor:default}
.edit-footer button[type=reset]{color:var(--accent);background:var(--tint)}
.notice{margin:.75rem 0;padding:.65rem 1rem;background:var(--success-tint);color:var(--success);border-radius:8px}
.hero,.board-head,.event{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.hero{margin:0 0 1.15rem}.hero p{margin-top:.35rem}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.7rem;margin-bottom:1.25rem}
.metric,.event,.board{padding:1rem 1.2rem}.metric .label{font-size:.8rem;color:var(--muted)}.metric .value{font-size:1.8rem;font-weight:720}
.event{justify-content:start}.event h2 a{text-decoration:none;color:var(--ink)}.event p{font-size:.85rem;color:var(--muted)}
.event .right{margin-left:auto}.event .stripe{width:4px;height:3rem;border-radius:3px;flex-shrink:0}
.progress{height:4px;background:var(--line);border-radius:3px;overflow:hidden}.progress i{display:block;height:100%}
.event-list{display:grid;gap:.6rem}.pill{border-radius:99px;font-size:.78rem;font-weight:650;padding:.22rem .6rem;white-space:nowrap}
.pill.green{background:var(--success-tint);color:var(--success)}.pill.amber{background:var(--warning-tint);color:var(--warning)}.pill.red{background:var(--danger-tint);color:var(--danger)}.danger{color:var(--danger)}
.pill.neutral{background:var(--surface-alt);color:var(--muted)}
.event-tabs{display:flex;gap:.5rem;background:none;border-bottom:1px solid var(--line);margin:1.2rem 0 1.3rem;padding-bottom:.6rem}
.event-tabs a{padding:.55rem 1rem}
.icon{width:1.1rem;height:1.1rem;flex-shrink:0;vertical-align:middle}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.event-hero{padding:1.5rem 1.8rem;border-radius:16px;gap:1.1rem}.event-hero h1{font-size:clamp(1.35rem,2.5vw,2rem);line-height:1.35;letter-spacing:-.035em}
.hero-meta{margin-bottom:.5rem;font-size:.78rem}.hero-link{margin-top:.6rem;font-size:.76rem}
.event-tabs{margin:1rem 0 1.1rem}.event-tabs a{padding:.4rem .9rem;font-size:.86rem}
.event-metrics{grid-template-columns:repeat(4,minmax(0,1fr));gap:.7rem;margin-bottom:1.2rem}
.event-metrics .metric{text-align:left;color:var(--ink);padding:.85rem 1.1rem;cursor:pointer;transition:border-color .15s,box-shadow .15s;display:flex;flex-direction:column;gap:.3rem}
.event-metrics .metric:hover{border-color:var(--accent)}.event-metrics .metric[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.metric-heading{display:flex;align-items:center;gap:.4rem;font-size:.78rem;color:var(--muted)}.metric-number{font-size:1.95rem;line-height:1.2;font-weight:720;font-variant-numeric:tabular-nums}.metric-number small{font-size:.8rem;font-weight:450;color:var(--muted);margin-left:.4rem}
.metric-overdue .icon,.metric-overdue .metric-number{color:var(--danger)}.metric-today .icon{color:var(--warning)}.metric-done .icon{color:var(--success)}
.dashboard-grid{display:grid;grid-template-columns:minmax(0,1fr) 290px;align-items:start;gap:1rem}
.task-board,.insight-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;min-width:0}
.task-board{scroll-margin-top:1rem;overflow:hidden}.panel-heading{display:flex;align-items:center;justify-content:space-between;gap:.7rem;padding:1rem 1.1rem .65rem}
.panel-heading h2{font-size:.92rem;font-weight:680}.panel-heading h2 span{font-size:.75rem;color:var(--muted);font-weight:450;margin-left:.35rem}.panel-heading .subtle{font-size:.72rem}
.icon-button{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:7px;color:var(--muted);text-decoration:none;flex-shrink:0}.icon-button:hover{color:var(--accent);background:var(--tint)}.icon-button .icon{width:.95rem;height:.95rem}
.task-filters{display:flex;flex-wrap:wrap;gap:.25rem;padding:0 .85rem .8rem}.task-filters button{border:0;background:transparent;color:var(--muted);padding:.35rem .5rem;border-radius:7px;font-size:.75rem;cursor:pointer;white-space:nowrap}.task-filters button span{font-size:.68rem;opacity:.7;margin-left:.35rem;font-variant-numeric:tabular-nums}.task-filters button[aria-pressed=true]{background:var(--tint);color:var(--accent);font-weight:650}
.summary-list{list-style:none;margin:0;padding:0}
.task-summary{display:flex;align-items:center;gap:.7rem;padding:.85rem 1.05rem;border-top:1px solid var(--soft-line)}
.task-summary[data-task-status=overdue]{background:var(--danger-tint)}.task-summary[data-task-status=done] h3{color:var(--muted)}
.task-symbol{display:inline-flex;justify-content:center;align-items:center;width:30px;height:30px;border-radius:9px;flex-shrink:0;background:var(--surface-alt);color:var(--muted)}.task-symbol .icon{width:1rem;height:1rem}.task-symbol.overdue{color:var(--danger);background:var(--danger-tint)}.task-symbol.today{background:var(--warning-tint);color:var(--warning)}.task-symbol.done{background:var(--success-tint);color:var(--success)}
.summary-main{min-width:0;flex:1}.summary-main h3{font-size:.86rem;font-weight:620;overflow-wrap:anywhere}.summary-meta{display:flex;align-items:center;flex-wrap:wrap;gap:.25rem .4rem;font-size:.72rem;color:var(--muted);margin-top:.3rem;font-variant-numeric:tabular-nums}.owner-tag{font-size:.7rem;overflow-wrap:anywhere}.meta-separator{color:var(--line)}.unassigned{color:var(--muted)}
.summary-status{display:flex;align-items:center;gap:.5rem;flex-shrink:0}.due-label{font-size:.72rem;color:var(--muted);white-space:nowrap}.due-label.overdue{color:var(--danger);font-weight:650}.due-label.today{color:var(--warning)}.completion-date{font-size:.71rem;color:var(--muted);white-space:nowrap}
.filter-empty{display:flex;align-items:center;justify-content:center;gap:.6rem;padding:2.5rem 1rem;color:var(--muted);font-size:.8rem;border-top:1px solid var(--soft-line)}.filter-empty .icon{color:var(--success)}
.insights{display:grid;gap:.8rem;min-width:0}.insight-card{padding-bottom:.9rem}.insight-card .panel-heading{padding-bottom:.85rem}
.info-popover{position:relative;flex-shrink:0}.info-popover summary{display:flex;align-items:center;justify-content:center;list-style:none;color:var(--muted);cursor:pointer;width:26px;height:26px;border-radius:6px}.info-popover summary::-webkit-details-marker{display:none}.info-popover[open] summary,.info-popover summary:hover{background:var(--tint);color:var(--accent)}.info-popover .icon{width:1rem;height:1rem}
.info-popover>div{position:absolute;z-index:3;right:0;top:calc(100% + .4rem);width:min(275px,calc(100vw - 4rem));padding:.85rem 1rem;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:0 6px 20px #28203e17;font-size:.75rem;color:var(--muted)}.info-popover p+p{margin-top:.6rem}
.completion-breakdown{display:flex;gap:3px;height:9px;margin:.05rem 1.1rem 1rem;border-radius:5px;overflow:hidden}.completion-breakdown>span{min-width:0;flex-basis:0}.completion-breakdown>span[style="flex-grow:0"]{display:none}.on-time{background:var(--success)}.late{background:var(--warning)}.unknown,.no-completions{background:var(--chart-muted)}.no-completions{flex:1}
.breakdown-legend{display:grid;grid-template-columns:repeat(3,1fr);gap:.25rem;padding:0 1.1rem}.breakdown-legend>div{display:grid;grid-template-columns:7px 1fr;gap:.25rem .35rem;align-items:center;color:var(--muted);font-size:.7rem}.legend-dot{width:6px;height:6px;border-radius:2px}.breakdown-legend strong{grid-column:2;font-size:1.25rem;line-height:1.3;color:var(--ink);font-weight:650;font-variant-numeric:tabular-nums}
.chart-heading{display:flex;align-items:baseline;justify-content:space-between;padding:0 1.1rem}.chart-heading>strong{font-size:1.5rem;line-height:1;font-variant-numeric:tabular-nums}.chart-heading strong small{font-size:.7rem;font-weight:450;color:var(--muted);margin-left:.35rem}.chart-heading .subtle{font-size:.7rem}
.completion-chart{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:.45rem;margin:.7rem 1.1rem 0}.chart-column{display:flex;flex-direction:column;align-items:center;min-width:0}.bar-value{font-size:.66rem;color:var(--accent);height:1rem}.bar-track{height:60px;width:100%;display:flex;align-items:flex-end;border-bottom:1px solid var(--line)}.bar-track i{display:block;width:100%;background:var(--chart);border-radius:4px 4px 0 0;min-height:0}.bar-track i[style="height:0%"]{height:2px!important;background:var(--chart-muted)}.bar-day{font-size:.65rem;color:var(--muted);white-space:nowrap;margin-top:.35rem;font-variant-numeric:tabular-nums}.bar-day.is-today{color:var(--accent);font-weight:700}
.activity-list{list-style:none;padding:0 1.1rem;margin:0}.activity-list li{display:flex;gap:.6rem;padding:.65rem 0;align-items:start}.activity-list li+li{border-top:1px solid var(--soft-line)}.activity-list li>div{min-width:0}.activity-symbol{display:flex;align-items:center;justify-content:center;width:23px;height:23px;background:var(--warning-tint);color:var(--warning);border-radius:50%;flex-shrink:0}.activity-symbol.is-done{background:var(--success-tint);color:var(--success)}.activity-symbol .icon{width:.8rem;height:.8rem}.activity-list strong{display:block;font-size:.77rem;font-weight:560;overflow-wrap:anywhere}.activity-list p{display:flex;align-items:center;gap:.5rem;font-size:.67rem;color:var(--muted);margin-top:.2rem}.activity-list time{font-variant-numeric:tabular-nums}.quiet-empty{padding:.65rem 1.1rem;color:var(--muted);font-size:.78rem}
.editor-toolbar{display:flex;justify-content:flex-end;margin:.1rem 0 .6rem}.editor-guide{font-size:.75rem;color:var(--muted)}.editor-guide summary{cursor:pointer;display:flex;align-items:center;gap:.3rem;list-style:none}.editor-guide summary::-webkit-details-marker{display:none}.editor-guide .icon{width:.9rem;height:.9rem}.editor-guide p{padding:.6rem 0;max-width:34rem;line-height:1.7}
.draft-label{font-size:0;background:none;padding:0}.draft-label::after{content:"";display:inline-block;width:6px;height:6px;margin:0 .25rem .2rem;background:var(--accent);border-radius:50%}
.row-actions{display:flex;justify-content:space-between;align-items:center;gap:.5rem;margin-top:.7rem}
.row-actions [data-save-task]{margin:0 0 0 auto;display:inline-flex;align-items:center;gap:.3rem;font-size:.76rem;padding:.3rem .65rem}.row-actions [data-save-task] .icon{width:.85rem;height:.85rem}
.delete-task{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:.35rem;min-width:30px;min-height:30px;padding:.3rem;color:var(--muted);border-radius:7px;font-size:.72rem;cursor:pointer}.delete-task:hover{background:var(--danger-tint);color:var(--danger)}.delete-task input{position:absolute;opacity:0;width:100%;height:100%;inset:0;cursor:pointer}.delete-task .icon{width:.95rem;height:.95rem}.delete-task:has(input:focus-visible){outline:2px solid var(--accent);outline-offset:3px}.delete-task:has(input:checked){background:var(--danger-tint);color:var(--danger)}
.delete-note{display:none}.edit-row[data-deleted]{border-color:var(--line);background:var(--tint)}
.edit-row[data-deleted] .delete-note{display:inline}.edit-row[data-deleted] .edit-title h3{text-decoration:line-through}
.edit-row{scroll-margin-top:1rem}.edit-row:target{border-color:var(--accent)}
.add-task{margin:.8rem 0 .3rem;border:1px dashed var(--accent);background:var(--tint);color:var(--accent);padding:.7rem 1rem;border-radius:10px;width:100%;cursor:pointer;font-weight:650}
.new-fields{display:grid;grid-template-columns:minmax(0,1fr) 180px;gap:.8rem;margin:.65rem 0}
.new-fields label{font-size:.8rem;color:var(--muted)}.new-fields input{display:block;width:100%;border:1px solid var(--line);border-radius:7px;padding:.45rem .55rem;margin-top:.3rem;background:var(--surface);color:var(--ink)}
@media(max-width:900px){.dashboard-grid{grid-template-columns:1fr}.insights{grid-template-columns:repeat(2,minmax(0,1fr))}.insights .activity-panel{grid-column:1/-1}}
@media(max-width:650px){
  main,.nav-inner{width:calc(100% - 1.5rem)}main{padding-top:1rem}
  .event-hero{grid-template-columns:1fr;gap:1rem}.hero-progress{max-width:17rem}
  .edit-row{padding:.85rem}.settings-line{align-items:flex-start;flex-direction:column}
  .edit-footer{gap:.45rem;padding:.55rem;bottom:.35rem}.edit-footer button{font-size:.85rem}
  .hero{align-items:flex-start;flex-wrap:wrap}.event{flex-wrap:wrap}
  .task-summary{gap:.55rem;padding:.8rem}.summary-status{gap:.25rem}.summary-main h3{font-size:.8rem}.summary-status .completion-date{font-size:.65rem}.task-symbol{width:26px;height:26px}.event-hero{padding:1.15rem;gap:.8rem}.hero-progress>div{font-size:.74rem}.hero-progress strong{font-size:1.15rem}
  .event-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:.55rem}.new-fields{grid-template-columns:1fr}.event-metrics .metric{padding:.7rem .9rem}.metric-number{font-size:1.7rem}.task-filters{gap:.1rem;padding-inline:.6rem}.task-filters button{padding:.35rem .4rem}.insights{grid-template-columns:repeat(2,minmax(0,1fr))}.insights .activity-panel{grid-column:1/-1}.breakdown-legend{grid-template-columns:1fr;gap:.35rem}.breakdown-legend>div{grid-template-columns:7px 1fr auto}.breakdown-legend strong{grid-column:3;font-size:1rem}.completion-breakdown{margin-bottom:.7rem}.completion-chart{gap:.25rem}.bar-day{font-size:.62rem}.chart-heading{flex-wrap:wrap;gap:.4rem}.insight-card .panel-heading h2{font-size:.84rem}
}
@media(max-width:480px){.insights{grid-template-columns:1fr}.breakdown-legend{grid-template-columns:repeat(3,1fr)}.breakdown-legend>div{grid-template-columns:7px 1fr}.breakdown-legend strong{grid-column:2;font-size:1.2rem}.completion-chart{gap:.7rem}.bar-day{font-size:.68rem}.bar-track{height:65px}}
.event-tabs .results-link{margin-left:auto;background:var(--tint);color:var(--accent)}
.primary-button,.secondary-button{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;border-radius:8px;padding:.6rem .9rem;text-decoration:none;font-size:.82rem;font-weight:650;cursor:pointer;line-height:1.4}
.primary-button{border:1px solid var(--accent);background:var(--accent);color:var(--button-ink)}.primary-button:disabled{opacity:.55;cursor:wait}.secondary-button{border:1px solid var(--line);background:var(--surface);color:var(--muted)}
.record-page{max-width:1050px}.record-breadcrumb,.record-actions,.records-heading,.record-document-footer{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
.record-breadcrumb{margin-bottom:1rem;font-size:.79rem}.record-breadcrumb a,.export-links a,.record-document-footer a{text-decoration:none}
.export-links{display:flex;align-items:center;gap:1rem;font-size:.76rem}.link-button{padding:0;border:0;background:none;color:var(--accent);cursor:pointer;font-size:.76rem;white-space:nowrap}
.record-document{background:var(--surface);border:1px solid var(--line);border-radius:15px;padding:2rem 2.5rem;box-shadow:0 2px 6px #28203e04}
.document-badge{display:flex;align-items:center;gap:.4rem;font-size:.75rem;color:var(--accent);margin-bottom:1rem}.document-badge .icon{width:1.4rem;height:1.4rem}
.record-document h1{font-size:clamp(1.4rem,3vw,2rem);line-height:1.4;letter-spacing:-.035em}.record-date{margin:.65rem 0 1.6rem;font-size:.8rem;color:var(--muted)}.record-date span{color:var(--muted)}
.result-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.8rem;border-top:1px solid var(--soft-line);border-bottom:1px solid var(--soft-line);padding:1.15rem 0}
.result-metrics>div{display:flex;flex-direction:column;gap:.3rem;min-width:0}.result-metrics span,.result-metrics>div>small{font-size:.73rem;color:var(--muted)}.result-metrics strong{font-size:1.7rem;font-weight:680;line-height:1.3;font-variant-numeric:tabular-nums}.result-metrics strong small{font-size:.8rem;font-weight:450;margin-left:.3rem;color:var(--muted)}
.result-chips{display:flex;flex-wrap:wrap;gap:.45rem;margin:.8rem 0 1.7rem}.result-chips>span{font-size:.71rem;color:var(--muted);background:var(--surface-alt);border-radius:6px;padding:.22rem .45rem}.result-chips>.danger{color:var(--danger);background:var(--danger-tint)}
.record-actions{margin-top:1rem;justify-content:flex-end}.record-actions .export-links{margin-right:auto}.record-method{margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--soft-line);font-size:.74rem;color:var(--muted)}.record-method summary{cursor:pointer;list-style:none}.record-method summary::-webkit-details-marker{display:none}.record-method p{margin-top:.6rem;line-height:1.8}.record-method a{display:inline-block;margin-top:.5rem}
.outbound-draft{margin:1rem 0;color:var(--muted);font-size:.76rem}.outbound-draft summary{cursor:pointer}.outbound-draft pre{max-height:360px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:1rem;background:var(--surface-alt);border:1px solid var(--line);border-radius:9px;font-size:.72rem;line-height:1.7}.record-destination{font-size:.75rem;color:var(--muted);margin-top:1.5rem;overflow-wrap:anywhere}
.record-task-details{margin-top:1.5rem;border-top:1px solid var(--soft-line);padding-top:1rem;font-size:.8rem}.record-task-details summary{cursor:pointer;color:var(--muted)}.table-scroll{overflow:auto;max-width:100%;margin-top:.8rem}.record-task-details table{width:100%;border-collapse:collapse;font-size:.75rem;min-width:510px;text-align:left}.record-task-details th{font-weight:550;color:var(--muted)}.record-task-details th,.record-task-details td{padding:.65rem .4rem;border-bottom:1px solid var(--soft-line)}.record-document-footer{margin-top:1.5rem;font-size:.78rem}
.records-heading{margin:.5rem 0 1.5rem}.eyebrow{font-size:.65rem;color:var(--muted);letter-spacing:.14em;margin-bottom:.5rem}.records-heading h1{font-size:1.85rem}.records-heading h1 span{font-size:.9rem;font-weight:400;color:var(--muted);margin-left:.6rem}
@media(max-width:650px){.nav-inner{gap:.1rem}nav a{padding:.35rem .45rem;font-size:.78rem}nav .brand{font-size:1.3rem}.event-tabs a{font-size:.75rem;padding:.4rem .55rem}.record-document{padding:1.3rem 1.1rem}.result-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.result-metrics strong{font-size:1.5rem}.record-actions{gap:.7rem}.record-actions .export-links{gap:.8rem}.records-heading h1{font-size:1.5rem}.record-breadcrumb{gap:.7rem}.record-document-footer{gap:.8rem}.record-date{line-height:1.8}.record-date span{display:block}.result-chips{margin-bottom:1.2rem}}
.metrics-page{max-width:1050px}.metrics-toolbar{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}.period-filter{display:flex;align-items:center;gap:.5rem;margin:0}.period-control{position:relative;display:inline-flex;align-items:center}.toolbar-icon{display:block;width:1rem;height:1rem;flex-shrink:0}.period-control>.toolbar-icon{position:absolute;left:.85rem;color:var(--muted);pointer-events:none}.period-control>.toolbar-icon:last-child{left:auto;right:.65rem;width:.85rem;height:.85rem}.period-control select{appearance:none;font:inherit;font-size:.79rem;font-weight:550;min-height:44px;min-width:140px;background:var(--surface);border:1px solid var(--line);border-radius:12px;color:var(--ink);padding:.6rem 2.1rem .6rem 2.4rem;cursor:pointer;box-shadow:0 2px 5px #28203e04;transition:border-color .15s,box-shadow .15s}.period-control select:hover{border-color:var(--accent)}.export-actions{display:inline-flex;align-items:center;gap:3px;max-width:100%;margin:0;padding:4px;border:1px solid var(--line);border-radius:12px;background:var(--surface);box-shadow:0 2px 5px #28203e04}.export-actions button{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;min-height:34px;padding:.35rem .75rem;border:0;border-radius:8px;background:transparent;color:var(--muted);font-size:.76rem;font-weight:550;line-height:1.4;white-space:nowrap;cursor:pointer;transition:background .15s,color .15s}.export-actions .toolbar-icon{width:.95rem;height:.95rem;color:var(--muted)}.export-actions button:hover,.export-actions button:focus-visible{background:var(--tint);color:var(--accent)}.export-actions button:active{background:var(--tint)}.export-actions button:focus-visible{outline-offset:1px}.metrics-asof{font-size:.74rem;color:var(--muted);margin:-.4rem 0 1.2rem}.metrics-page>.result-metrics{background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:1rem 1.3rem}.result-visuals{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:1rem 0 1.4rem}.comparison-panel{background:var(--surface);border:1px solid var(--line);border-radius:13px;overflow:hidden}.comparison-panel .table-scroll{margin:0}.metrics-comparison{width:100%;border-collapse:collapse;min-width:610px;text-align:left;font-size:.8rem}.metrics-comparison th{color:var(--muted);font-weight:500;font-size:.73rem}.metrics-comparison th,.metrics-comparison td{padding:.9rem 1.1rem;border-top:1px solid var(--soft-line);vertical-align:middle}.metrics-comparison td:first-child{width:42%;overflow-wrap:anywhere}.metrics-comparison td a{color:var(--ink);text-decoration:none;font-weight:600}.metrics-comparison td a:hover{color:var(--accent)}.metrics-comparison td small{display:block;font-size:.68rem;color:var(--muted);margin-top:.3rem;font-weight:400}.metrics-comparison td:not(:first-child){font-variant-numeric:tabular-nums}.mini-progress{height:3px;background:var(--chart-muted);border-radius:3px;max-width:70px;margin-top:.4rem}.mini-progress i{display:block;height:100%;background:var(--chart);border-radius:3px}.aggregate-storage{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin:1.3rem 0;font-size:.76rem;color:var(--muted)}.aggregate-storage a{text-decoration:none}.event-plots{display:flex;align-items:flex-end;gap:.7rem;padding:.3rem 1.1rem 0;overflow-x:auto}.event-plot{display:flex;flex:1;min-width:32px;max-width:75px;align-items:center;flex-direction:column;font-variant-numeric:tabular-nums}.event-plot>span{font-size:.66rem;height:1rem;color:var(--accent)}.event-plot-track{height:75px;width:100%;display:flex;align-items:end;border-bottom:1px solid var(--line);margin-top:.2rem}.event-plot-track i{display:block;width:100%;background:var(--chart);min-height:2px;border-radius:4px 4px 0 0}.event-plot>small{font-size:.65rem;color:var(--muted);white-space:nowrap;margin-top:.3rem}.completion-log{list-style:none;padding:0 1.1rem;margin:0;font-size:.74rem}.completion-log li{display:flex;justify-content:space-between;align-items:start;gap:1rem;padding:.5rem 0}.completion-log li+li{border-top:1px solid var(--soft-line)}.completion-log time{color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}.record-page .record-document{padding:1.7rem 2rem}.individual-tasks{min-width:620px}.record-page .result-visuals{gap:.7rem}.record-page .result-visuals .panel-heading h2{font-size:.84rem}
@media(max-width:650px){.result-visuals{grid-template-columns:1fr}.metrics-toolbar{gap:.7rem}.metrics-comparison th,.metrics-comparison td{padding:.8rem}.metrics-page>.result-metrics{padding:.9rem 1rem}.record-page .record-document{padding:1.2rem 1rem}.aggregate-storage{align-items:flex-start;flex-direction:column}.metrics-page .records-heading h1{font-size:1.55rem}.metrics-toolbar{width:100%;gap:.6rem}.period-control select{font-size:.75rem}.export-actions button{padding-inline:.65rem}}
.individual-tasks td:first-child{width:36%}.individual-tasks td:nth-child(2){white-space:nowrap}.task-state{display:inline-block;border-radius:6px;padding:.18rem .45rem;font-size:.72rem;font-weight:600}.task-state.is-done{background:var(--success-tint);color:var(--success)}.task-state.is-open{background:var(--surface-alt);color:var(--muted)}.missing-date{color:var(--muted)}

@media(max-width:650px){.nav-inner{gap:0;flex-wrap:wrap;min-height:60px;padding-block:.4rem}nav .brand{font-size:1.1rem;gap:.4rem}.brand img{width:28px;height:28px}.theme-toggle{width:30px;height:30px;padding:5px}nav a{padding:.35rem .4rem}.event-hero{grid-template-columns:minmax(0,1fr)}}

.page-header{display:flex;align-items:flex-start;justify-content:space-between;gap:1.25rem;margin:0 0 1.5rem}
.page-heading{min-width:0;flex:1}.page-header h1{font-size:2rem;line-height:1.35;font-weight:700;letter-spacing:-.035em;overflow-wrap:anywhere}
.page-heading>p{margin-top:.45rem;color:var(--muted);font-size:.86rem;line-height:1.65;overflow-wrap:anywhere}
.page-header-actions{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:.75rem;min-height:2.7rem;flex-shrink:0;max-width:100%}
.page-progress{width:160px;color:var(--muted);font-size:.75rem}.page-progress>div{display:flex;justify-content:space-between;gap:.75rem}.page-progress strong{color:var(--ink);font-variant-numeric:tabular-nums}.page-progress progress{display:block;margin-top:.4rem;background:var(--line)}.page-progress progress::-webkit-progress-bar{background:var(--line)}.page-progress progress::-webkit-progress-value{background:var(--accent)}.page-progress progress::-moz-progress-bar{background:var(--accent)}
.page-issue-link{font-size:.75rem;text-decoration:none;color:var(--muted);white-space:nowrap}.page-issue-link:hover{color:var(--accent)}.record-state{color:var(--muted);font-size:.76rem;white-space:nowrap}
@media(max-width:850px){.page-header{flex-wrap:wrap}.page-header-actions{flex-shrink:1}.page-header:has(.page-progress){flex-direction:column}.page-header:has(.page-progress)>.page-header-actions{width:100%;justify-content:space-between}}
@media(max-width:650px){.page-header{gap:1rem;margin-bottom:1.25rem}.page-header h1{font-size:1.65rem}.page-heading>p{font-size:.82rem}.page-header>.page-heading{flex-basis:60%}.page-header-actions{min-height:2.25rem}.page-header:has(.metrics-toolbar)>.page-header-actions{width:100%;justify-content:flex-start}.page-header .metrics-toolbar{width:auto}}
`
