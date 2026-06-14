# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step required — this is a zero-dependency vanilla JavaScript project.

**Simplest (open directly):**
```
start index.html
```

**Recommended (local server to avoid browser file restrictions):**
```bash
python -m http.server 8000
# then open http://localhost:8000
```

Any static server works (`npx serve .`, `php -S localhost:8000`, etc.).

## Architecture

Three interdependent files — no modules, no bundler:

| File | Role |
|------|------|
| `index.html` | DOM: main canvas (300×600), next-piece canvas (120×120), HUD panel, pause/game-over overlay |
| `style.css` | Dark arcade theme; flexbox layout; `backdrop-filter` on overlay |
| `game.js` | All game logic and rendering (~305 lines) |

### game.js structure

**State** (module-level variables): `board` (20×10 matrix), `current`/`next` piece objects, `score`/`lines`/`level`, `paused`/`gameOver`, timing accumulators.

**Game loop**: `requestAnimationFrame` → `loop(ts)` accumulates `dt`; auto-drops piece when `dt ≥ dropInterval`; calls `draw()` every frame.

**Key functions:**
- `collide(shape, x, y)` — wall + locked-block collision
- `tryRotate()` — clockwise rotation with ±0/±1/±2 column wall kicks
- `clearLines()` — removes complete rows, updates score/level, adjusts `dropInterval`
- `hardDrop()` / `softDrop()` — instant vs. accelerated descent
- `ghostY()` — computes ghost-piece landing row
- `spawn()` — promotes `next` to `current`, generates new `next`
- `draw()` — renders board, ghost, active piece, HUD via Canvas 2D API

**Scoring:** 1/2/3/4 lines = 100/300/500/800 × level; hard drop +2 pts/cell; soft drop +1 pt/row. Level increments every 10 lines. Speed: `dropInterval = max(100, 1000 − (level−1) × 90)` ms.

**Controls** (single `keydown` listener): `←/→` move, `↑`/`X` rotate, `↓` soft drop, `Space` hard drop, `P` pause.

## Key constants (game.js top)

`COLS = 10`, `ROWS = 20`, `BLOCK = 30` (px), `COLORS[]` (7 piece colors), `LINE_SCORES[]`.
