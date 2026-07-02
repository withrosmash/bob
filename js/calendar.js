import { getGoogleClientId } from './storage.js';
import { esc, loadingCard, errorCard } from './ui.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

let tokenClient = null;
let accessToken = sessionStorage.getItem('bob_gtoken') || null;
let tokenExpiry = Number(sessionStorage.getItem('bob_gtoken_exp') || 0);

function loadGsiScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load Google sign-in.'));
    document.head.appendChild(s);
  });
}

function requestToken(interactive) {
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error)); return; }
      accessToken = resp.access_token;
      tokenExpiry = Date.now() + (Number(resp.expires_in) - 60) * 1000;
      sessionStorage.setItem('bob_gtoken', accessToken);
      sessionStorage.setItem('bob_gtoken_exp', String(tokenExpiry));
      resolve();
    };
    tokenClient.error_callback = (err) => reject(new Error(err?.message || 'Sign-in cancelled.'));
    tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

async function ensureToken(interactive = false) {
  if (accessToken && Date.now() < tokenExpiry) return;
  await loadGsiScript();
  if (!tokenClient) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: getGoogleClientId(),
      scope: SCOPE,
      callback: () => {},
    });
  }
  await requestToken(interactive);
}

async function gcalFetch(path, options = {}) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (res.status === 401) {
    sessionStorage.removeItem('bob_gtoken');
    accessToken = null;
    throw new Error('Google session expired — reconnect.');
  }
  if (!res.ok) throw new Error(`Calendar error (${res.status})`);
  return res.json();
}

/* ---------- events ---------- */

async function listEvents() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekOut = new Date(startOfToday.getTime() + 7 * 86400000);
  const params = new URLSearchParams({
    timeMin: startOfToday.toISOString(),
    timeMax: weekOut.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  });
  const data = await gcalFetch(`/calendars/primary/events?${params}`);
  return data.items || [];
}

function eventDayKey(ev) {
  const start = ev.start?.dateTime || ev.start?.date || '';
  return start.slice(0, 10);
}

function eventTime(ev) {
  if (ev.start?.date) return 'All day';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
  }).format(new Date(ev.start.dateTime));
}

function dayLabel(key) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${key}T00:00:00`);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }).format(d);
}

function renderEvents(container, events) {
  const groups = new Map();
  for (const ev of events) {
    const key = eventDayKey(ev);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  }

  const listHTML = events.length === 0
    ? '<div class="card"><p class="muted">Nothing scheduled this week. Suspiciously quiet.</p></div>'
    : [...groups.entries()].map(([key, evs]) => `
        <div class="day-group">
          <p class="day-label">${esc(dayLabel(key))}</p>
          ${evs.map((ev) => `
            <div class="card event-card">
              <span class="event-time">${esc(eventTime(ev))}</span>
              <span>
                <span class="event-title">${esc(ev.summary || '(no title)')}</span>
                ${ev.location ? `<br><span class="event-loc">${esc(ev.location)}</span>` : ''}
              </span>
            </div>`).join('')}
        </div>`).join('');

  container.innerHTML = `
    ${listHTML}
    <div class="card add-reminder">
      <p class="report-label" style="margin-bottom:10px">Add a reminder</p>
      <input type="text" id="rem-title" placeholder="What needs remembering?">
      <div class="row">
        <input type="date" id="rem-date" value="${new Date().toISOString().slice(0, 10)}">
        <input type="time" id="rem-time" value="09:00">
      </div>
      <button class="btn primary block" id="rem-add">Add to calendar</button>
      <p class="field-error hidden" id="rem-error"></p>
    </div>`;

  document.getElementById('rem-add').addEventListener('click', async () => {
    const title = document.getElementById('rem-title').value.trim();
    const date = document.getElementById('rem-date').value;
    const time = document.getElementById('rem-time').value;
    const errEl = document.getElementById('rem-error');
    errEl.classList.add('hidden');
    if (!title || !date || !time) {
      errEl.textContent = 'Title, date and time all needed.';
      errEl.classList.remove('hidden');
      return;
    }
    const btn = document.getElementById('rem-add');
    btn.disabled = true;
    btn.textContent = 'Adding…';
    try {
      const start = new Date(`${date}T${time}:00`);
      const end = new Date(start.getTime() + 30 * 60000);
      await ensureToken();
      await gcalFetch('/calendars/primary/events', {
        method: 'POST',
        body: JSON.stringify({
          summary: title,
          start: { dateTime: start.toISOString(), timeZone: 'Europe/London' },
          end: { dateTime: end.toISOString(), timeZone: 'Europe/London' },
          reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
        }),
      });
      await loadCalendar(document.getElementById('calendar-body'));
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Add to calendar';
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

/* ---------- entry ---------- */

async function loadCalendar(container) {
  container.innerHTML = loadingCard('Fetching your week…');
  try {
    await ensureToken();
    const events = await listEvents();
    renderEvents(container, events);
  } catch (err) {
    container.innerHTML = errorCard(err.message, 'cal-retry');
    document.getElementById('cal-retry')?.addEventListener('click', () => connectFlow(container));
  }
}

function connectFlow(container) {
  container.innerHTML = loadingCard('Opening Google sign-in…');
  ensureToken(true)
    .then(() => loadCalendar(container))
    .catch((err) => {
      container.innerHTML = errorCard(err.message, 'cal-retry');
      document.getElementById('cal-retry')?.addEventListener('click', () => connectFlow(container));
    });
}

function renderSetup(container, hasClientId) {
  container.innerHTML = `
    <div class="card setup-card">
      <h3>Connect Google Calendar</h3>
      ${hasClientId
        ? '<p>Sign in with Google to see your week and add reminders.</p><button class="btn primary" id="cal-connect">Connect Google Calendar</button>'
        : '<p>Calendar needs a Google OAuth Client ID first — the README walks you through creating one in about five minutes. Then paste it in settings.</p><button class="btn primary" data-open-settings>Open settings</button>'}
    </div>`;
  document.getElementById('cal-connect')?.addEventListener('click', () => connectFlow(container));
}

export function initCalendar() {
  const container = document.getElementById('calendar-body');
  const clientId = getGoogleClientId();
  if (!clientId) { renderSetup(container, false); return; }
  if (accessToken && Date.now() < tokenExpiry) loadCalendar(container);
  else renderSetup(container, true);
}
