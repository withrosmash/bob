import {
  getApiKey, setApiKey, getGoogleClientId, setGoogleClientId,
} from './storage.js';
import { initBriefing } from './briefing.js';
import { initPulse } from './pulse.js';
import { initConvince } from './convince.js';
import { initGame } from './game.js';
import { initCalendar } from './calendar.js';

const PANELS = {
  briefing: initBriefing,
  pulse: initPulse,
  convince: initConvince,
  game: initGame,
  calendar: initCalendar,
};

/* ---------- tabs ---------- */

function showTab(name) {
  document.querySelectorAll('.panel').forEach((p) => {
    p.classList.toggle('active', p.dataset.panel === name);
  });
  document.querySelectorAll('.tab').forEach((t) => {
    const active = t.dataset.tab === name;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', String(active));
  });
  PANELS[name]?.();
  window.scrollTo({ top: 0 });
}

document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => showTab(t.dataset.tab));
});

/* ---------- API key modal (first launch) ---------- */

const keyModal = document.getElementById('key-modal');

function openKeyModal() {
  keyModal.classList.remove('hidden');
  document.getElementById('key-input').focus();
}

document.getElementById('key-save').addEventListener('click', () => {
  const value = document.getElementById('key-input').value.trim();
  const errEl = document.getElementById('key-error');
  if (!value.startsWith('sk-ant-')) {
    errEl.textContent = 'That doesn’t look like an Anthropic key (they start with sk-ant-).';
    errEl.classList.remove('hidden');
    return;
  }
  setApiKey(value);
  errEl.classList.add('hidden');
  keyModal.classList.add('hidden');
  location.reload(); // simplest way to re-run all feature loads with the key present
});

/* ---------- settings modal ---------- */

const settingsModal = document.getElementById('settings-modal');

function openSettings() {
  document.getElementById('settings-key').value = getApiKey();
  document.getElementById('settings-gcid').value = getGoogleClientId();
  settingsModal.classList.remove('hidden');
}

document.getElementById('settings-btn').addEventListener('click', openSettings);
document.getElementById('settings-close').addEventListener('click', () => settingsModal.classList.add('hidden'));
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) settingsModal.classList.add('hidden');
});

document.getElementById('settings-save').addEventListener('click', () => {
  setApiKey(document.getElementById('settings-key').value);
  setGoogleClientId(document.getElementById('settings-gcid').value);
  settingsModal.classList.add('hidden');
  location.reload();
});

/* Any "Open settings" button rendered inside feature panels */
document.body.addEventListener('click', (e) => {
  if (e.target.closest('[data-open-settings]')) openSettings();
});

/* ---------- service worker ---------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline shell is a bonus, not a blocker */ });
  });
}

/* ---------- boot ---------- */

showTab('briefing');
if (!getApiKey()) openKeyModal();
