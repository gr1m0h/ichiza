// Canonical asset: ichiza-docs/static/img/logo.svg. Keep the SVG byte-identical.
export const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" rx="12" fill="#b03a2e"/>
  <rect x="12" y="14" width="40" height="7" rx="3.5" fill="#fff"/>
  <path d="M15 24 C 18 32, 18 40, 14 50 L 25 50 C 23 40, 23 31, 25 24 Z" fill="#fff"/>
  <path d="M49 24 C 46 32, 46 40, 50 50 L 39 50 C 41 40, 41 31, 39 24 Z" fill="#fff"/>
</svg>
`

export const themeInitScript = `<script>(function(){let theme;try{theme=localStorage.getItem('ichiza-theme')}catch{}document.documentElement.dataset.theme=theme==='light'||theme==='dark'?theme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'})()</script>`

export const themeToggleScript = `<script>(function(){const button=document.querySelector('[data-theme-toggle]');function apply(theme){document.documentElement.dataset.theme=theme;const label=theme==='dark'?'ライトモードに切り替える':'ダークモードに切り替える';button.setAttribute('aria-label',label);button.title=label}apply(document.documentElement.dataset.theme);button.addEventListener('click',function(){const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';apply(theme);try{localStorage.setItem('ichiza-theme',theme)}catch{}});matchMedia('(prefers-color-scheme: dark)').addEventListener('change',function(event){let saved;try{saved=localStorage.getItem('ichiza-theme')}catch{}if(saved!=='light'&&saved!=='dark')apply(event.matches?'dark':'light')})})()</script>`
