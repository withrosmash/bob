import { askClaude, extractJSON, AuthError } from './claude.js';
import { getApiKey, getDailyCache, setDailyCache, clearDailyCache, londonDate } from './storage.js';
import { esc, loadingCard, errorCard, needsKeyCard } from './ui.js';

const FEATURE = 'pulse';

async function fetchPulse() {
  const text = await askClaude({
    system: `You are the intelligence desk of a one-person briefing service. Your reader works in international higher education. You write intel, not headlines: every item is a signal plus an analysis of why it matters to someone recruiting international students and building EdTech partnerships in the UK.

Rules:
- No doom. Cover policy changes and challenges factually and constructively — what's the move, what's the play.
- No filler, no press-release regurgitation, no "sector leaders react" pieces.
- Terse, sharp, confident. Like a morning note from a well-connected analyst.`,
    prompt: `Search for developments from the last few days across these three beats:
1. International higher education (global student mobility, transnational education, rankings, partnerships)
2. EdTech (products, funding, AI in education, institutional adoption)
3. UK visas & immigration (student/graduate route policy, Home Office signals, compliance)

Pick the 4-6 most decision-relevant items across the beats.

Respond with ONLY a JSON array, no other text:
[{"beat": "Higher Ed" | "EdTech" | "UK Visas", "signal": "one-line summary of what happened", "analysis": "2 sentences: why this matters and what to watch"}]`,
    webSearch: 5,
    maxTokens: 3000,
  });
  return extractJSON(text);
}

function renderPulse(container, items) {
  container.innerHTML = items.map((it) => `
    <div class="card pulse-item">
      <p class="tag">${esc(it.beat)}</p>
      <h3>${esc(it.signal)}</h3>
      <p>${esc(it.analysis)}</p>
    </div>`).join('');
}

async function loadPulse(container, force = false) {
  if (!getApiKey()) {
    container.innerHTML = needsKeyCard();
    return;
  }
  if (!force) {
    const cached = getDailyCache(FEATURE);
    if (cached) { renderPulse(container, cached); return; }
  }
  container.innerHTML = loadingCard('Gathering signals across the sector… (searches take up to a minute)');
  try {
    const items = await fetchPulse();
    setDailyCache(FEATURE, items);
    renderPulse(container, items);
  } catch (err) {
    if (err instanceof AuthError) {
      container.innerHTML = needsKeyCard(true);
    } else {
      container.innerHTML = errorCard(`Couldn't gather the pulse. ${err.message}`, 'pulse-retry');
      document.getElementById('pulse-retry')?.addEventListener('click', () => loadPulse(container, true));
    }
  }
}

let initialised = false;

export function initPulse() {
  document.getElementById('pulse-stamp').textContent = `Intel · ${londonDate()}`;
  if (initialised) return;
  initialised = true;

  const container = document.getElementById('pulse-body');
  loadPulse(container);

  document.getElementById('pulse-refresh').addEventListener('click', () => {
    clearDailyCache(FEATURE);
    loadPulse(container, true);
  });
}
