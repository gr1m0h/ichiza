export const styles = `
:root {
  color-scheme:light;
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic UI",sans-serif;
  --ink:#252637; --muted:#65677b; --line:#dddfea; --accent:#5344c6; --tint:#eeecff; --paper:#f6f6fb;
  color:var(--ink); background:var(--paper); font-size:16px; line-height:1.55;
}
*{box-sizing:border-box}
body{margin:0}
[hidden]{display:none!important}
a{color:var(--accent);text-underline-offset:.2em}
button,input,select{font:inherit}
:focus-visible{outline:3px solid #8675ff;outline-offset:3px}
main,.nav-inner{width:min(1050px,calc(100% - 3rem));margin-inline:auto}
main{padding:2rem 0 3rem}
nav{background:#fff;border-bottom:1px solid var(--line)}
.nav-inner{display:flex;align-items:center;gap:.45rem;min-height:62px}
nav a{text-decoration:none;color:var(--muted);padding:.45rem .8rem;border-radius:8px;font-size:.91rem;font-weight:650}
nav a[aria-current],nav a:hover{color:var(--accent);background:var(--tint)}
nav .brand{padding:0;margin-right:auto;font-size:1.55rem;font-weight:800;letter-spacing:-.07em;color:#232237;display:inline-flex;align-items:center;gap:.47rem}
.brand::before{content:"";width:.78rem;height:1.12rem;transform:skew(-13deg);border-radius:.2rem;background:linear-gradient(145deg,#a596ff,#5741ca)}
h1,h2,h3,p{margin:0}
h1{font-size:clamp(1.65rem,3.2vw,2.5rem);line-height:1.2;letter-spacing:-.045em;overflow-wrap:anywhere}
h2{font-size:1.2rem;letter-spacing:-.025em}
.event-hero{position:relative;isolation:isolate;overflow:hidden;border-radius:20px;padding:clamp(1.3rem,3vw,2.2rem);display:grid;grid-template-columns:minmax(0,1fr) minmax(130px,175px);align-items:end;gap:1.5rem;color:white;background:linear-gradient(110deg,#292342 0%,#3b3263 66%,#4e407d)}
.event-hero::after{content:"";position:absolute;z-index:-1;right:-7rem;top:-15rem;width:33rem;height:33rem;border-radius:50%;border:1px solid #ffffff1c;box-shadow:0 0 0 1.8rem #ffffff06,0 0 0 1.86rem #ffffff10,0 0 0 4.2rem #ffffff05;pointer-events:none}
.hero-meta,.hero-progress>div,.section-title,.edit-title,.edit-footer,.settings-line{display:flex;align-items:center;gap:.65rem;flex-wrap:wrap}
.hero-meta{margin-bottom:.7rem;font-size:.86rem;color:#e4def6}
.hero-link{display:inline-block;margin-top:.85rem;color:#ebe8ff;font-size:.83rem}
.hero-progress>div{justify-content:space-between;color:#eeeafa;font-size:.84rem}
.hero-progress strong{font-size:1.35rem;color:white;font-variant-numeric:tabular-nums}
progress{width:100%;height:.46rem;appearance:none;border:0;border-radius:10px;background:#ffffff36}
progress::-webkit-progress-bar{background:#ffffff36;border-radius:10px}
progress::-webkit-progress-value{background:#c4b8ff;border-radius:10px}
progress::-moz-progress-bar{background:#c4b8ff;border-radius:10px}
.section-title{margin:1.65rem 0 .25rem;justify-content:space-between}
.section-title span,.subtle,.empty,.task-meta,.editor-help,.status-foot,.hero p{color:var(--muted);font-size:.86rem}
.editor-help{margin:.25rem 0 1rem}
.task-editor{min-width:0}
.edit-row,.card,.board,.metric,.event{border:1px solid var(--line);background:white;border-radius:14px}
.edit-row{padding:1rem 1.15rem;margin:.55rem 0;box-shadow:0 2px 5px #22203c05}
.edit-row[data-dirty]{border-color:#9c8fe4;box-shadow:inset 3px 0 var(--accent)}
.edit-title{justify-content:space-between;align-items:baseline;flex-wrap:nowrap}
.edit-title h3{font-size:1.03rem;line-height:1.5;overflow-wrap:anywhere}
.task-meta{display:flex;gap:.6rem;align-items:center;font-size:.78rem;font-variant-numeric:tabular-nums;margin-top:.15rem}
.draft-label{color:#5746b2;background:var(--tint);border-radius:5px;padding:.1rem .4rem;font-size:.72rem}
.completion,.owners label,[data-mention]{display:inline-flex;align-items:center;gap:.4rem;cursor:pointer}
.completion{white-space:nowrap;color:var(--muted);font-size:.84rem}
input[type=checkbox]{accent-color:var(--accent);width:1rem;height:1rem;margin:0}
.completion input[type=checkbox]{width:1.15rem;height:1.15rem}
.completion:has(:checked){color:#286746}
.owners{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;margin:.85rem 0 0;padding:0;border:0;min-width:0}
.owners legend{float:left;font-size:.79rem;font-weight:650;color:var(--muted);margin-right:.5rem;padding:.25rem 0}
.owners label{padding:.2rem .63rem;border:1px solid var(--line);border-radius:999px;font-size:.82rem;min-height:30px;overflow-wrap:anywhere}
.owners label:has(:checked){background:var(--tint);border-color:#cbc4ef;color:#4433a2}
.owners label input{width:.85rem;height:.85rem}
.notification{margin-top:.8rem;padding-top:.65rem;border-top:1px solid #edeef3}
.notification summary{cursor:pointer;display:flex;align-items:center;flex-wrap:wrap;gap:.5rem;color:var(--muted);font-size:.79rem;list-style:none}
.notification summary::-webkit-details-marker{display:none}
.notification summary::after{content:"";width:.4rem;height:.4rem;margin-left:auto;border-right:1.5px solid;border-bottom:1.5px solid;transform:rotate(45deg)}
.notification[open] summary::after{transform:rotate(225deg)}
.notification summary strong{color:#494958}.settings-summary{font-weight:450}
.settings-line{padding-top:.7rem;font-size:.84rem;gap:.7rem 1rem}
.settings-line select,.settings-line input[type=date]{border:1px solid #c9cad8;border-radius:7px;background:white;color:var(--ink);padding:.38rem .5rem}
[data-save-task]{display:block;margin:.75rem 0 0 auto;border:1px solid #cbc4ef;border-radius:8px;background:var(--tint);color:var(--accent);padding:.4rem .75rem;cursor:pointer;font-size:.84rem;font-weight:650}
.save-feedback:not(:empty){position:fixed;top:.7rem;left:50%;transform:translateX(-50%);z-index:4;max-width:calc(100% - 2rem);width:max-content;background:#252637;color:white;border-radius:9px;padding:.5rem .9rem;box-shadow:0 3px 12px #22203c22;font-size:.85rem}
.save-feedback[data-error]{background:#842d2a}
.edit-footer{position:sticky;bottom:.65rem;z-index:2;justify-content:flex-end;margin-top:.9rem;padding:.65rem .85rem;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 4px 16px #29234213}
.edit-footer [data-status]{margin-right:auto;color:var(--muted);font-size:.84rem}
.edit-footer button{cursor:pointer;border:0;border-radius:8px;padding:.5rem .85rem;font-weight:650}
.edit-footer button[type=submit]{background:var(--accent);color:white}
.edit-footer button[type=submit]:disabled{background:#e6e6ee;color:#666878;cursor:default}
.edit-footer button[type=reset]{color:var(--accent);background:var(--tint)}
.notice{margin:.75rem 0;padding:.65rem 1rem;background:#e6f3ed;color:#256044;border-radius:8px}
.hero,.board-head,.event{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.hero{margin:0 0 1.15rem}.hero p{margin-top:.35rem}
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.7rem;margin-bottom:1.25rem}
.metric,.event,.board{padding:1rem 1.2rem}.metric .label{font-size:.8rem;color:var(--muted)}.metric .value{font-size:1.8rem;font-weight:720}
.event{justify-content:start}.event h2 a{text-decoration:none;color:var(--ink)}.event p{font-size:.85rem;color:var(--muted)}
.event .right{margin-left:auto}.event .stripe{width:4px;height:3rem;border-radius:3px;flex-shrink:0}
.progress{height:4px;background:var(--line);border-radius:3px;overflow:hidden}.progress i{display:block;height:100%}
.event-list{display:grid;gap:.6rem}.pill{border-radius:99px;font-size:.78rem;font-weight:650;padding:.22rem .6rem;white-space:nowrap}
.pill.green{background:#e5f3ec;color:#266949}.pill.amber{background:#fff0db;color:#88510b}.pill.red{background:#fce8e7;color:#913e39}.danger{color:#913e39}
@media(max-width:650px){
  main,.nav-inner{width:calc(100% - 1.5rem)}main{padding-top:1rem}
  .event-hero{grid-template-columns:1fr;gap:1rem}.hero-progress{max-width:17rem}
  .edit-row{padding:.85rem}.settings-line{align-items:flex-start;flex-direction:column}
  .edit-footer{gap:.45rem;padding:.55rem;bottom:.35rem}.edit-footer button{font-size:.85rem}
  .hero{align-items:flex-start;flex-wrap:wrap}.event{flex-wrap:wrap}
}
`
