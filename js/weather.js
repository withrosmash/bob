import { CONFIG } from './config.js';
import { esc } from './ui.js';

/* WMO weather codes → icon + label */
const WMO = [
  [[0], '☀️', 'Clear'],
  [[1], '🌤️', 'Mostly clear'],
  [[2], '⛅', 'Partly cloudy'],
  [[3], '☁️', 'Overcast'],
  [[45, 48], '🌫️', 'Fog'],
  [[51, 53, 55], '🌦️', 'Drizzle'],
  [[56, 57], '🌧️', 'Freezing drizzle'],
  [[61, 63, 65], '🌧️', 'Rain'],
  [[66, 67], '🌧️', 'Freezing rain'],
  [[71, 73, 75, 77], '🌨️', 'Snow'],
  [[80, 81, 82], '🌦️', 'Showers'],
  [[85, 86], '🌨️', 'Snow showers'],
  [[95], '⛈️', 'Thunderstorm'],
  [[96, 99], '⛈️', 'Thunderstorm with hail'],
];

function describe(code) {
  for (const [codes, icon, label] of WMO) {
    if (codes.includes(code)) return { icon, label };
  }
  return { icon: '🌡️', label: 'Weather' };
}

export async function loadWeather(container) {
  const { lat, lon } = CONFIG.weather;
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,apparent_temperature,weather_code'
    + '&hourly=temperature_2m,precipitation_probability,weather_code'
    + '&forecast_days=2&timezone=Europe%2FLondon';

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`weather ${res.status}`);
    const data = await res.json();
    render(container, data);
  } catch {
    container.innerHTML = '<p class="muted">Weather unavailable right now.</p>';
  }
}

function render(container, data) {
  const cur = data.current;
  const { icon, label } = describe(cur.weather_code);

  // Next 8 hours, starting from the current hour
  const nowIso = cur.time.slice(0, 13); // "YYYY-MM-DDTHH"
  const startIdx = data.hourly.time.findIndex((t) => t.startsWith(nowIso));
  const hours = [];
  for (let i = Math.max(startIdx, 0) + 1; i < data.hourly.time.length && hours.length < 8; i++) {
    hours.push({
      time: data.hourly.time[i].slice(11, 16),
      temp: Math.round(data.hourly.temperature_2m[i]),
      rain: data.hourly.precipitation_probability[i],
      icon: describe(data.hourly.weather_code[i]).icon,
    });
  }

  container.innerHTML = `
    <div class="weather-now">
      <span class="weather-icon">${icon}</span>
      <span class="weather-temp">${Math.round(cur.temperature_2m)}°</span>
      <span class="weather-desc">${esc(label)}<br>
        <span class="feels">Feels like ${Math.round(cur.apparent_temperature)}°</span>
      </span>
    </div>
    <div class="weather-hours">
      ${hours.map((h) => `
        <div class="hour">
          <div class="h-time">${esc(h.time)}</div>
          <div class="h-icon">${h.icon}</div>
          <div class="h-temp">${h.temp}°</div>
          <div class="h-rain${h.rain >= 30 ? ' wet' : ''}">${h.rain}%</div>
        </div>`).join('')}
    </div>`;
}
