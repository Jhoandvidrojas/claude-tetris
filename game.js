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

// Pastel palette: soft tints aligned to piece indices 1-7.
const PASTEL_COLORS = [
  null,
  '#a7e8eb', // I
  '#fbe7a1', // O
  '#d9b8e8', // T
  '#bfe3c0', // S
  '#f2b8b8', // Z
  '#bcd6f7', // J
  '#fbd5a5', // L
];

// Neon palette: saturated colors that glow well on a dark canvas.
const NEON_COLORS = [
  null,
  '#00e5ff', // I
  '#ffea00', // O
  '#e040fb', // T
  '#00e676', // S
  '#ff1744', // Z
  '#2979ff', // J
  '#ff9100', // L
];

// Visual skins. Each defines a piece palette and drawBlock rendering flags.
// `style` selects the per-block renderer; `glow` enables canvas shadow blur.
const SKINS = {
  retro:  { palette: COLORS,        style: 'flat',  glow: 0 },
  neon:   { palette: NEON_COLORS,   style: 'flat',  glow: 12 },
  pastel: { palette: PASTEL_COLORS, style: 'round', glow: 0 },
  pixel:  { palette: COLORS,        style: 'pixel', glow: 0 },
};

let activeSkin = SKINS.retro;

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
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const menuRestartBtn = document.getElementById('menu-restart-btn');
const controlsBtn = document.getElementById('controls-btn');
const menuControls = document.getElementById('menu-controls');
const startLevelSelect = document.getElementById('start-level');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let startLevel = 1;

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
  const color = activeSkin.palette[colorIndex];
  const px = x * size + 1, py = y * size + 1, s = size - 2;
  context.globalAlpha = alpha ?? 1;
  if (activeSkin.glow) {
    context.shadowBlur = activeSkin.glow;
    context.shadowColor = color;
  }
  if (activeSkin.style === 'round') {
    drawRoundBlock(context, px, py, s, color);
  } else if (activeSkin.style === 'pixel') {
    drawPixelBlock(context, px, py, s, color);
  } else {
    drawFlatBlock(context, px, py, s, color);
  }
  context.shadowBlur = 0;
  context.globalAlpha = 1;
}

// Flat square block with a top highlight (retro / neon).
function drawFlatBlock(context, px, py, s, color) {
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px, py, s, 4);
}

// Rounded-corner block for the pastel skin.
function drawRoundBlock(context, px, py, s, color) {
  const r = Math.max(3, s * 0.25);
  context.fillStyle = color;
  context.beginPath();
  context.roundRect(px, py, s, s, r);
  context.fill();
  context.fillStyle = 'rgba(255,255,255,0.25)';
  context.beginPath();
  context.roundRect(px, py, s, Math.max(3, s * 0.3), r);
  context.fill();
}

// Pixel-art block: base fill plus an internal mini-pixel dithering pattern.
function drawPixelBlock(context, px, py, s, color) {
  context.fillStyle = color;
  context.fillRect(px, py, s, s);
  const step = Math.max(3, Math.floor(s / 5));
  context.fillStyle = 'rgba(255,255,255,0.18)';
  for (let iy = 0; iy < s; iy += step)
    for (let ix = (iy / step) % 2 ? step : 0; ix < s; ix += step * 2)
      context.fillRect(px + ix, py + iy, step, step);
  context.fillStyle = 'rgba(0,0,0,0.18)';
  context.fillRect(px, py + s - step, s, step);
  context.fillRect(px + s - step, py, step, s);
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

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    pauseMenu.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    pauseMenu.classList.remove('hidden');
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

/** Apply the chosen start level: set level, lines and dropInterval coherently. */
function applyStartLevel() {
  level = startLevel;
  lines = (level - 1) * 10;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
}

function init() {
  board = createBoard();
  score = 0;
  paused = false;
  gameOver = false;
  applyStartLevel();
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
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
resumeBtn.addEventListener('click', togglePause);
menuRestartBtn.addEventListener('click', () => {
  menuControls.classList.add('hidden');
  init();
});
controlsBtn.addEventListener('click', () => menuControls.classList.toggle('hidden'));
startLevelSelect.addEventListener('change', () => {
  startLevel = Number(startLevelSelect.value);
});

const skinSelect = document.getElementById('skin-select');

// Apply a skin by name: swap the active palette, sync body class, and redraw.
function setSkin(name) {
  if (!SKINS[name]) name = 'retro';
  activeSkin = SKINS[name];
  for (const key of Object.keys(SKINS)) document.body.classList.remove('skin-' + key);
  document.body.classList.add('skin-' + name);
  localStorage.setItem('tetris-skin', name);
  if (board) { draw(); drawNext(); }
}

const savedSkin = localStorage.getItem('tetris-skin') || 'retro';
skinSelect.value = SKINS[savedSkin] ? savedSkin : 'retro';
setSkin(skinSelect.value);

skinSelect.addEventListener('change', () => setSkin(skinSelect.value));

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

init();
