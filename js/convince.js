import { askClaude, extractJSON, AuthError } from './claude.js';
import { getApiKey, getDailyCache, setDailyCache, clearDailyCache, londonDate } from './storage.js';
import { esc, loadingCard, errorCard, needsKeyCard } from './ui.js';

const FEATURE = 'convince';

/* Flavour words seed variety so each day's (and reroll's) suggestion heads
   somewhere genuinely different. */
const FLAVOURS = [
  'cartography', 'brutalism', 'tides', 'typography', 'foxes', 'radio', 'salt',
  'escalators', 'moss', 'archives', 'pigeons', 'neon', 'canals', 'meteorites',
  'accents', 'stairwells', 'citrus', 'lighthouses', 'chess', 'concrete',
  'folklore', 'orbits', 'ferments', 'doorways', 'static', 'islands', 'ink',
  'clocks', 'markets', 'fog',
];

function flavourForToday(extraSeed = 0) {
  const [y, m, d] = londonDate().split('-').map(Number);
  const idx = (y * 372 + m * 31 + d + extraSeed * 7) % FLAVOURS.length;
  return FLAVOURS[idx];
}

async function fetchSuggestion(rerollCount = 0) {
  const flavour = flavourForToday(rerollCount);
  const text = await askClaude({
    system: `You are Bob, and once a day you hand Spencer one unexpected thing to do. You are not a wellness app. Never suggest meditation, gratitude journaling, walks "to clear the head", digital detoxes, or anything that smells of self-care content.

What you do suggest: genuinely odd, specific, doable-today things. Micro-adventures, strange experiments, obscure rabbit holes, tiny acts of mischief-adjacent curiosity. Things a curious person in London would actually enjoy telling someone about afterwards. Concrete, not vague.`,
    prompt: `Today's secret inspiration word is "${flavour}" — let it nudge the direction, but don't mention it and don't be literal about it.

Give me one unexpected thing to do today, and sell it to me.

Respond with ONLY a JSON object, no other text:
{"title": "the thing, in a few punchy words", "pitch": "3-4 sentences convincing me, in Bob's confident, slightly conspiratorial voice"}`,
    maxTokens: 1024,
  });
  return extractJSON(text);
}

function renderSuggestion(container, s) {
  container.innerHTML = `
    <div class="card convince-card">
      <p class="report-label">Today's assignment</p>
      <h3>${esc(s.title)}</h3>
      <p class="pitch">${esc(s.pitch)}</p>
      <div class="convince-actions">
        <button class="btn primary" id="convince-accept">I'm in</button>
        <button class="btn" id="convince-reroll">Convince me otherwise</button>
      </div>
    </div>
    <p class="fine-print" id="convince-note"></p>`;

  document.getElementById('convince-accept').addEventListener('click', (e) => {
    e.target.textContent = 'Good. Report back.';
    e.target.disabled = true;
  });
  document.getElementById('convince-reroll').addEventListener('click', () => {
    const state = getDailyCache(FEATURE) || {};
    load(container, true, (state.rerolls || 0) + 1);
  });
}

async function load(container, force = false, rerolls = 0) {
  if (!getApiKey()) {
    container.innerHTML = needsKeyCard();
    return;
  }
  if (!force) {
    const cached = getDailyCache(FEATURE);
    if (cached?.suggestion) { renderSuggestion(container, cached.suggestion); return; }
  }
  container.innerHTML = loadingCard('Bob is choosing your assignment…');
  try {
    const suggestion = await fetchSuggestion(rerolls);
    setDailyCache(FEATURE, { suggestion, rerolls });
    renderSuggestion(container, suggestion);
  } catch (err) {
    if (err instanceof AuthError) {
      container.innerHTML = needsKeyCard();
    } else {
      container.innerHTML = errorCard(`Bob lost his train of thought. ${err.message}`, 'convince-retry');
      document.getElementById('convince-retry')?.addEventListener('click', () => load(container, true, rerolls));
    }
  }
}

let initialised = false;

export function initConvince() {
  if (initialised) return;
  initialised = true;
  load(document.getElementById('convince-body'));
}
