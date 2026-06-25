'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const overlayScores = document.getElementById('overlay-scores');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const gameoverContent = document.getElementById('gameover-content');
const startScreen = document.getElementById('start-screen');
const startScores = document.getElementById('start-scores');
const playBtn = document.getElementById('play-btn');
const startResetBtn = document.getElementById('start-reset-btn');

const SCORES_KEY = 'tetris-highscores';
const MAX_SCORES = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let bestCombo, scoreSaved;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    if (cleared > bestCombo) bestCombo = cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid-color').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function defaultScores() {
  return { entries: [], bestCombo: 0, maxLines: 0 };
}

function loadScores() {
  // Read high-score data from localStorage, returning safe defaults on failure.
  try {
    const data = JSON.parse(localStorage.getItem(SCORES_KEY));
    if (!data || !Array.isArray(data.entries)) return defaultScores();
    return {
      entries: data.entries.slice(0, MAX_SCORES),
      bestCombo: Number(data.bestCombo) || 0,
      maxLines: Number(data.maxLines) || 0,
    };
  } catch {
    return defaultScores();
  }
}

function saveScores(data) {
  // Persist high-score data to localStorage as JSON.
  localStorage.setItem(SCORES_KEY, JSON.stringify(data));
}

function qualifies(scores, value) {
  // Return true if value would enter the top MAX_SCORES list.
  if (value <= 0) return false;
  if (scores.entries.length < MAX_SCORES) return true;
  return value > scores.entries[scores.entries.length - 1].score;
}

function recordScore(name) {
  // Insert the current run, persist records, and return its row index.
  const scores = loadScores();
  const entry = { name: name || 'Anónimo', score };
  scores.entries.push(entry);
  scores.entries.sort((a, b) => b.score - a.score);
  scores.entries = scores.entries.slice(0, MAX_SCORES);
  scores.bestCombo = Math.max(scores.bestCombo, bestCombo);
  scores.maxLines = Math.max(scores.maxLines, lines);
  saveScores(scores);
  scoreSaved = true;
  return scores.entries.indexOf(entry);
}

function renderScores(container, highlightIndex) {
  // Render the high-score table and historical stats into a container.
  const scores = loadScores();
  if (!scores.entries.length) {
    container.innerHTML = '<p class="scores-empty">Aún no hay records</p>';
    return;
  }
  const rows = scores.entries.map((e, i) => {
    const hl = i === highlightIndex ? ' class="highlight"' : '';
    return `<tr${hl}><td class="score-rank">${i + 1}</td>` +
      `<td>${escapeHtml(e.name)}</td>` +
      `<td class="score-points">${e.score.toLocaleString()}</td></tr>`;
  }).join('');
  container.innerHTML =
    '<table class="scores-table"><thead><tr><th>#</th><th>Jugador</th>' +
    '<th>Puntos</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    `<div class="scores-stats"><span>Mejor combo: <b>${scores.bestCombo}</b></span>` +
    `<span>Líneas máximas: <b>${scores.maxLines}</b></span></div>`;
}

function escapeHtml(str) {
  // Escape user-provided text for safe HTML insertion.
  return String(str).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function resetScores(container, highlightName) {
  // Clear stored records and refresh the given table.
  localStorage.removeItem(SCORES_KEY);
  renderScores(container, highlightName);
}

function endGame() {
  gameOver = true;
  scoreSaved = false;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  nameEntry.classList.toggle('hidden', !qualifies(loadScores(), score));
  nameInput.value = '';
  renderScores(overlayScores, null);
  gameoverContent.classList.remove('hidden');
  overlay.classList.remove('hidden');
  if (!nameEntry.classList.contains('hidden')) nameInput.focus();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    gameoverContent.classList.add('hidden');
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  bestCombo = 0;
  scoreSaved = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  startScreen.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function showStartScreen() {
  // Render records and present the start overlay; the game begins on "Jugar".
  renderScores(startScores, null);
  startScreen.classList.remove('hidden');
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
playBtn.addEventListener('click', init);

function saveCurrentScore() {
  // Persist the run under the entered name and refresh the game-over table.
  if (scoreSaved) return;
  const index = recordScore(nameInput.value.trim());
  nameEntry.classList.add('hidden');
  renderScores(overlayScores, index);
}

saveScoreBtn.addEventListener('click', saveCurrentScore);
nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') { e.preventDefault(); saveCurrentScore(); }
});

resetScoresBtn.addEventListener('click', () => {
  resetScores(overlayScores, null);
  nameEntry.classList.add('hidden');
});
startResetBtn.addEventListener('click', () => resetScores(startScores, null));

const themeSwitch = document.getElementById('theme-switch');

if (localStorage.getItem('theme') === 'light') {
  document.body.classList.add('light-mode');
  themeSwitch.checked = true;
}

themeSwitch.addEventListener('change', () => {
  if (themeSwitch.checked) {
    document.body.classList.add('light-mode');
    localStorage.setItem('theme', 'light');
  } else {
    document.body.classList.remove('light-mode');
    localStorage.setItem('theme', 'dark');
  }
});

showStartScreen();
