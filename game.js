'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const POWERUP_BOMB      = 8;
const POWERUP_LIGHTNING = 9;
const POWERUP_TINT      = 10;
const POWERUP_GRAVITY   = 11;
const POWERUP_FREEZE    = 12;
const WILDCARD          = 99;
const POWERUP_INTERVAL  = 5;

const COLORS = [
  null,
  '#4dd0e1', // 1 I - cyan
  '#ffd54f', // 2 O - yellow
  '#ba68c8', // 3 T - purple
  '#81c784', // 4 S - green
  '#e57373', // 5 Z - red
  '#90caf9', // 6 J - pale blue
  '#ffb74d', // 7 L - orange
  '#ff5722', // 8 BOMB - deep orange
  '#ffe082', // 9 LIGHTNING - amber
  '#ce93d8', // 10 TINT - lavender
  '#a5d6a7', // 11 GRAVITY - light green
  '#b3e5fc', // 12 FREEZE - ice blue
];

const POWERUP_ICONS = {
  [POWERUP_BOMB]:      '💣',
  [POWERUP_LIGHTNING]: '⚡',
  [POWERUP_TINT]:      '🎨',
  [POWERUP_GRAVITY]:   '⬇',
  [POWERUP_FREEZE]:    '❄',
};

const WILDCARD_COLOR = '#e0e0e0';

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8]],                                       // BOMB
  [[9]],                                       // LIGHTNING
  [[10]],                                      // TINT
  [[11]],                                      // GRAVITY
  [[12]],                                      // FREEZE
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

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let nextIsPowerup, linesAtLastPowerup, freezeUntil;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPowerup() {
  const type = Math.floor(Math.random() * 5) + POWERUP_BOMB;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2), y: 0 };
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
  if (current.type >= POWERUP_BOMB) return;
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
    if (lines - linesAtLastPowerup >= POWERUP_INTERVAL) {
      nextIsPowerup = true;
      linesAtLastPowerup = lines;
    }
    updateHUD();
  }
}

function activateBomb(row, col) {
  for (let r = row - 1; r <= row + 1; r++)
    for (let c = col - 1; c <= col + 1; c++)
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS)
        board[r][c] = 0;
}

function activateLightning(row, col) {
  board[row] = new Array(COLS).fill(0);
  for (let r = 0; r < ROWS; r++)
    board[r][col] = 0;
}

function activateTint() {
  const counts = new Array(8).fill(0);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const v = board[r][c];
      if (v >= 1 && v <= 7) counts[v]++;
    }
  let target = 0, max = 0;
  for (let i = 1; i <= 7; i++)
    if (counts[i] > max) { max = counts[i]; target = i; }
  if (!target) return;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === target) board[r][c] = WILDCARD;
  clearLines();
}

function activateGravity() {
  for (let c = 0; c < COLS; c++) {
    const cells = [];
    for (let r = 0; r < ROWS; r++)
      if (board[r][c] !== 0) cells.push(board[r][c]);
    for (let r = 0; r < ROWS; r++)
      board[r][c] = r < ROWS - cells.length ? 0 : cells[r - (ROWS - cells.length)];
  }
  clearLines();
}

function activateFreeze() {
  freezeUntil = performance.now() + 5000;
}

function activatePowerup(type, row, col) {
  switch (type) {
    case POWERUP_BOMB:      activateBomb(row, col); break;
    case POWERUP_LIGHTNING: activateLightning(row, col); break;
    case POWERUP_TINT:      activateTint(); break;
    case POWERUP_GRAVITY:   activateGravity(); break;
    case POWERUP_FREEZE:    activateFreeze(); break;
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
  if (current.type >= POWERUP_BOMB) {
    activatePowerup(current.type, current.y, current.x);
  } else {
    merge();
    clearLines();
  }
  spawn();
}

function spawn() {
  current = next;
  next = nextIsPowerup ? randomPowerup() : randomPiece();
  nextIsPowerup = false;
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
  const isPowerup = colorIndex >= POWERUP_BOMB && colorIndex <= POWERUP_FREEZE;
  const isWildcard = colorIndex === WILDCARD;
  const color = isWildcard ? WILDCARD_COLOR : (COLORS[colorIndex] || '#888');
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  if (isPowerup) {
    context.strokeStyle = 'rgba(255,255,255,0.8)';
    context.lineWidth = 2;
    context.strokeRect(x * size + 2, y * size + 2, size - 4, size - 4);
    const icon = POWERUP_ICONS[colorIndex];
    if (icon) {
      context.font = `${Math.floor(size * 0.55)}px serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = 'rgba(0,0,0,0.7)';
      context.fillText(icon, x * size + size / 2, y * size + size / 2 + 1);
    }
  } else if (isWildcard) {
    context.fillStyle = 'rgba(255,255,255,0.4)';
    context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
    context.font = `${Math.floor(size * 0.5)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#757575';
    context.fillText('✦', x * size + size / 2, y * size + size / 2);
  } else {
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  }
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

  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

  if (freezeUntil && performance.now() < freezeUntil) {
    const secs = Math.ceil((freezeUntil - performance.now()) / 1000);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#b3e5fc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#01579b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`❄ ${secs}s`, canvas.width / 2, 6);
  }
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
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  const frozen = freezeUntil && ts < freezeUntil;
  if (!frozen) dropAccum += dt;
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
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  nextIsPowerup = false;
  linesAtLastPowerup = 0;
  freezeUntil = 0;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
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
