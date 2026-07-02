import { CONFIG } from './config.js';
import { askClaude, AuthError } from './claude.js';
import {
  getApiKey, getJSON, setJSON, londonDate,
  getDailyCache, setDailyCache,
} from './storage.js';
import { esc, loadingCard, errorCard, needsKeyCard } from './ui.js';

const FEATURE = 'game';

const QUIZ_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          answerIndex: { type: 'integer' },
          funFact: { type: 'string' },
        },
        required: ['question', 'options', 'answerIndex', 'funFact'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
};

const VERDICTS = [
  'Bob is pretending not to know you.',
  'A rebuilding day.',
  'Respectable under the circumstances.',
  'Solid work, agent.',
  'Nearly flawless. Bob is impressed.',
  'Perfect round. Bob salutes you.',
];

function todaysFormat() {
  const [y, m, d] = londonDate().split('-').map(Number);
  const dayOfYear = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
  return CONFIG.gameFormats[dayOfYear % CONFIG.gameFormats.length];
}

/* ---------- persistent state ---------- */

function getPlayState() {
  const s = getJSON(CONFIG.keys.gameState);
  if (s && s.date === londonDate()) return s;
  return { date: londonDate(), answers: [], done: false };
}

function savePlayState(s) { setJSON(CONFIG.keys.gameState, s); }

function getStreak() {
  return getJSON(CONFIG.keys.streak, { lastPlayedDate: null, streak: 0, best: 0 });
}

function recordPlayed() {
  const s = getStreak();
  const today = londonDate();
  if (s.lastPlayedDate === today) return s;
  s.streak = s.lastPlayedDate === londonDate(-1) ? s.streak + 1 : 1;
  s.best = Math.max(s.best, s.streak);
  s.lastPlayedDate = today;
  setJSON(CONFIG.keys.streak, s);
  return s;
}

/* ---------- question generation ---------- */

async function fetchQuiz(format) {
  const result = await askClaude({
    system: `You write Bob's Daily Game: a 5-question multiple-choice micro-quiz with NYT Games polish and proper pub-quiz energy. Questions are clever, surprising, and satisfying to get right — never trivial, never obscure-for-obscurity's-sake. Wrong options are plausible. Each fun fact is a genuine "huh, nice" moment. British English.`,
    prompt: `Today's format: ${format}.
Date seed: ${londonDate()} (make today's set feel fresh and distinct).

Write exactly 5 multiple-choice questions in this format. Each must have exactly 4 options, one correct (answerIndex 0-3, vary the position), and a one-sentence fun fact revealed after answering. Mix difficulty: start warm, end spicy.`,
    schema: QUIZ_SCHEMA,
    maxTokens: 3000,
  });
  const qs = result.questions;
  if (!Array.isArray(qs) || qs.length < 5) throw new Error('Bad quiz payload');
  return qs.slice(0, 5).filter((q) => q.options?.length === 4);
}

/* ---------- rendering ---------- */

function streakBarHTML(score = null) {
  const s = getStreak();
  return `
    <div class="streak-bar">
      <div class="streak-chip"><span class="num">${s.streak}</span><span class="lbl">Streak</span></div>
      <div class="streak-chip"><span class="num">${s.best}</span><span class="lbl">Best</span></div>
      <div class="streak-chip"><span class="num">${score === null ? '–' : `${score}/5`}</span><span class="lbl">Today</span></div>
    </div>`;
}

function dotsHTML(questions, state, currentIdx) {
  return `<div class="progress-dots">${questions.map((q, i) => {
    let cls = 'dot';
    if (state.answers[i] !== undefined && state.answers[i] !== null) {
      cls += state.answers[i] === q.answerIndex ? ' right' : ' wrong';
    } else if (i === currentIdx) {
      cls += ' current';
    }
    return `<span class="${cls}"></span>`;
  }).join('')}</div>`;
}

function scoreOf(questions, state) {
  return questions.reduce((n, q, i) => n + (state.answers[i] === q.answerIndex ? 1 : 0), 0);
}

function renderQuestion(container, questions, state) {
  const idx = state.answers.length;
  if (idx >= questions.length) { finishGame(container, questions, state); return; }
  const q = questions[idx];

  container.innerHTML = `
    ${streakBarHTML()}
    ${dotsHTML(questions, state, idx)}
    <div class="card q-card">
      <p class="q-num">Question ${idx + 1} of 5</p>
      <p class="q-text">${esc(q.question)}</p>
      <div id="opts">
        ${q.options.map((o, i) => `<button class="opt" data-i="${i}">${esc(o)}</button>`).join('')}
      </div>
      <div id="after-answer"></div>
    </div>`;

  container.querySelectorAll('.opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      const chosen = Number(btn.dataset.i);
      container.querySelectorAll('.opt').forEach((b) => {
        b.disabled = true;
        const i = Number(b.dataset.i);
        if (i === q.answerIndex) b.classList.add('right');
        else if (i === chosen) b.classList.add('wrong');
      });
      state.answers.push(chosen);
      savePlayState(state);

      const isLast = state.answers.length >= questions.length;
      document.getElementById('after-answer').innerHTML = `
        <div class="fun-fact">${esc(q.funFact)}</div>
        <button class="btn primary block" id="next-q" style="margin-top:14px">
          ${isLast ? 'See my score' : 'Next question'}
        </button>`;
      document.getElementById('next-q').addEventListener('click', () => {
        renderQuestion(container, questions, state);
      });
    });
  });
}

function finishGame(container, questions, state) {
  if (!state.done) {
    state.done = true;
    savePlayState(state);
    recordPlayed();
  }
  const score = scoreOf(questions, state);
  const squares = questions.map((q, i) => (state.answers[i] === q.answerIndex ? '🟩' : '⬛')).join('');

  container.innerHTML = `
    ${streakBarHTML(score)}
    <div class="card score-screen">
      <p class="report-label">Final score</p>
      <p class="score-big">${score}<span style="font-size:26px;color:var(--ink-faint)">/5</span></p>
      <p class="score-verdict">${esc(VERDICTS[score])}</p>
      <p class="score-squares">${squares}</p>
      <p class="muted" style="font-size:13px">New round tomorrow. Streak survives if you show up.</p>
    </div>`;
}

/* ---------- entry ---------- */

async function loadGame(container) {
  if (!getApiKey()) {
    container.innerHTML = needsKeyCard();
    return;
  }

  const state = getPlayState();
  let questions = getDailyCache(FEATURE);

  if (!questions) {
    container.innerHTML = loadingCard('Bob is setting today’s questions…');
    try {
      questions = await fetchQuiz(todaysFormat());
      setDailyCache(FEATURE, questions);
      // fresh questions → fresh play state
      savePlayState({ date: londonDate(), answers: [], done: false });
      state.answers = [];
      state.done = false;
    } catch (err) {
      if (err instanceof AuthError) {
        container.innerHTML = needsKeyCard(true);
      } else {
        container.innerHTML = errorCard(`Couldn't set today's quiz. ${err.message}`, 'game-retry');
        document.getElementById('game-retry')?.addEventListener('click', () => loadGame(container));
      }
      return;
    }
  }

  if (state.done) finishGame(container, questions, state);
  else renderQuestion(container, questions, state);
}

let initialised = false;

export function initGame() {
  const fmt = todaysFormat();
  document.getElementById('game-sub').textContent =
    `Today's format: ${fmt.charAt(0).toUpperCase() + fmt.slice(1)}.`;
  if (initialised) return;
  initialised = true;
  loadGame(document.getElementById('game-body'));
}
