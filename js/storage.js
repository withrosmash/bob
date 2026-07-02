import { CONFIG } from './config.js';

export function getJSON(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function setJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getApiKey() {
  return localStorage.getItem(CONFIG.keys.apiKey) || '';
}

export function setApiKey(key) {
  localStorage.setItem(CONFIG.keys.apiKey, key.trim());
}

export function getGoogleClientId() {
  return localStorage.getItem(CONFIG.keys.googleClientId) || '';
}

export function setGoogleClientId(id) {
  localStorage.setItem(CONFIG.keys.googleClientId, id.trim());
}

/** Today's date in London as YYYY-MM-DD — the app's notion of "a day". */
export function londonDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);
}

/** Per-feature daily cache: one payload per London day. */
export function getDailyCache(feature) {
  const entry = getJSON(CONFIG.keys.cachePrefix + feature);
  if (entry && entry.date === londonDate()) return entry.payload;
  return null;
}

export function setDailyCache(feature, payload) {
  setJSON(CONFIG.keys.cachePrefix + feature, { date: londonDate(), payload });
}

export function clearDailyCache(feature) {
  localStorage.removeItem(CONFIG.keys.cachePrefix + feature);
}
