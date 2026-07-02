export function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function loadingCard(message) {
  return `<div class="card loading-card"><span class="spin"></span><p>${esc(message)}</p></div>`;
}

export function errorCard(message, retryId) {
  return `<div class="card setup-card">
    <p>${esc(message)}</p>
    ${retryId ? `<button class="btn" id="${esc(retryId)}">Try again</button>` : ''}
  </div>`;
}

export function needsKeyCard(rejected = false) {
  return `<div class="card setup-card">
    <h3>${rejected ? 'API key rejected' : 'Bob needs clearance'}</h3>
    <p>${rejected
      ? 'Anthropic refused this key (401). It usually means the paste was incomplete — open settings and re-paste the whole key from console.anthropic.com → API keys (use the copy button).'
      : 'Add your Anthropic API key in settings to unlock this briefing.'}</p>
    <button class="btn primary" data-open-settings>Open settings</button>
  </div>`;
}
