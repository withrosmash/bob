import { CONFIG } from './config.js';
import { askClaude, extractJSON, AuthError } from './claude.js';
import { getApiKey, getDailyCache, setDailyCache, clearDailyCache } from './storage.js';
import { loadWeather } from './weather.js';
import { esc, loadingCard, errorCard, needsKeyCard } from './ui.js';

const FEATURE = 'goodnews';

function greetingText() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hour: 'numeric', hour12: false,
  }).format(new Date()));
  const part = hour < 5 ? 'Up late' : hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
  return `${part}, ${CONFIG.userName}`;
}

function dateText() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long',
  }).format(new Date());
}

async function fetchGoodNews() {
  const text = await askClaude({
    system: 'You are Bob, a personal daily-briefing assistant. You find genuinely good news — real, substantive, uplifting stories. Never politics dressed up as positivity, never doom with a silver lining, never corporate PR. Think: scientific breakthroughs, conservation wins, human ingenuity, acts of decency, delightful discoveries.',
    prompt: `Search the web for good news from the last 24-48 hours. Pick the 3 best genuinely positive stories.

Respond with ONLY a JSON array, no other text:
[{"headline": "short punchy headline", "summary": "2 sentences on what happened and why it's great", "source": "publication name"}]`,
    webSearch: 3,
    maxTokens: 2048,
  });
  return extractJSON(text);
}

function renderStories(container, stories) {
  container.innerHTML = stories.map((s) => `
    <div class="card">
      <h3>${esc(s.headline)}</h3>
      <p>${esc(s.summary)}</p>
      <span class="source">${esc(s.source)}</span>
    </div>`).join('');
}

async function loadGoodNews(container, force = false) {
  if (!getApiKey()) {
    container.innerHTML = needsKeyCard();
    return;
  }
  if (!force) {
    const cached = getDailyCache(FEATURE);
    if (cached) { renderStories(container, cached); return; }
  }
  container.innerHTML = loadingCard('Bob is scanning for good news…');
  try {
    const stories = await fetchGoodNews();
    setDailyCache(FEATURE, stories);
    renderStories(container, stories);
  } catch (err) {
    if (err instanceof AuthError) {
      container.innerHTML = needsKeyCard();
    } else {
      container.innerHTML = errorCard(`Couldn't fetch good news. ${err.message}`, 'goodnews-retry');
      document.getElementById('goodnews-retry')?.addEventListener('click', () => loadGoodNews(container, true));
    }
  }
}

let initialised = false;

export function initBriefing() {
  document.getElementById('greeting').textContent = greetingText();
  document.getElementById('date-line').textContent = dateText();

  if (initialised) return;
  initialised = true;

  loadWeather(document.getElementById('weather-body'));

  const container = document.getElementById('goodnews-body');
  loadGoodNews(container);

  document.getElementById('goodnews-refresh').addEventListener('click', () => {
    clearDailyCache(FEATURE);
    loadGoodNews(container, true);
  });
}
