const escapeText = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!))

// Actions are trusted markup rendered by the calling view; labels remain escaped.
export function pageHeader(title: string, description: string, actions = ''): string {
  return `<header class="page-header"><div class="page-heading"><h1>${escapeText(title)}</h1>${description ? `<p>${escapeText(description)}</p>` : ''}</div>${actions ? `<div class="page-header-actions">${actions}</div>` : ''}</header>`
}
