/* ==========================================
   パズドラ練習 - ゲームロジック
   ========================================== */

// ========== ドロップ定義 ==========
const DROP_TYPES = {
  fire:    { id: 'fire',    name: '火',     color: '#ff5a3c', glow: '#ff2200' },
  water:   { id: 'water',   name: '水',     color: '#3ab8ff', glow: '#0088ff' },
  wood:    { id: 'wood',    name: '木',     color: '#44d668', glow: '#00cc44' },
  light:   { id: 'light',   name: '光',     color: '#ffe93c', glow: '#ffcc00' },
  dark:    { id: 'dark',    name: '闇',     color: '#b06cff', glow: '#8800ff' },
  heal:    { id: 'heal',    name: '回復',   color: '#ff8fb8', glow: '#ff4499' },
  poison:  { id: 'poison',  name: '毒',     color: '#a0c020', glow: '#80a000' },
  mpoison: { id: 'mpoison', name: '猛毒',   color: '#d060e0', glow: '#aa00cc' },
  jammer:  { id: 'jammer',  name: 'お邪魔', color: '#808090', glow: '#606070' },
  bomb:    { id: 'bomb',    name: '爆弾',   color: '#ff9020', glow: '#cc6600' },
};

const STANDARD_DROPS = ['fire','water','wood','light','dark','heal'];
const ALL_DROPS = Object.keys(DROP_TYPES);

// ========== ゲーム状態 ==========
let state = {
  cols: 6,
  rows: 5,
  board: [],           // 現在のボード [row][col] = drop_id
  initialBoard: [],    // リセット用
  activeDrops: STANDARD_DROPS.slice(), // 使用中のドロップ種類
  dragging: false,
  dragCell: null,      // {row, col}
  heldDrop: null,      // ドラッグ中のドロップID
  moveHistory: [],     // [{from, to, swapped}]
  moveCount: 0,
  moveLimit: 0,
  timerRunning: false,
  timerStart: null,
  timerElapsed: 0,
  timerInterval: null,
  combos: [],
  replayMode: false,
  replayStep: 0,
};

// ========== Canvas セットアップ ==========
const canvas = document.getElementById('puzzle-board');
const ctx = canvas.getContext('2d');
let CELL_SIZE = 80;

function updateCanvasSize() {
  const maxW = Math.min(document.body.clientWidth - 32, 700);
  CELL_SIZE = Math.floor(maxW / state.cols);
  canvas.width  = CELL_SIZE * state.cols;
  canvas.height = CELL_SIZE * state.rows;
  canvas.style.width  = canvas.width  + 'px';
  canvas.style.height = canvas.height + 'px';
}

// ========== ドロップ描画 ==========
function drawDrop(ctx, x, y, size, typeId, options = {}) {
  if (!typeId || typeId === 'empty') return;
  const drop = DROP_TYPES[typeId];
  if (!drop) return;
  const { scale = 1, alpha = 1, selected = false } = options;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = (size * 0.43) * scale;

  ctx.save();
  ctx.globalAlpha = alpha;

  // グロー
  if (selected) {
    const glow = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 1.8);
    glow.addColorStop(0, drop.color + 'aa');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // ドロップ本体（グラデーション球）
  const grad = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.1, cx, cy, r);
  grad.addColorStop(0, lightenColor(drop.color, 60));
  grad.addColorStop(0.45, drop.color);
  grad.addColorStop(1, darkenColor(drop.color, 40));

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // ハイライト
  const hl = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 0, cx - r * 0.2, cy - r * 0.25, r * 0.55);
  hl.addColorStop(0, 'rgba(255,255,255,0.7)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = hl;
  ctx.fill();

  // 縁取り
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // テキスト
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 4;
  const fontSize = Math.max(10, Math.round(size * 0.2));
  ctx.font = `bold ${fontSize}px 'Noto Sans JP', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(drop.name, cx, cy + r * 0.55);
  ctx.shadowBlur = 0;

  ctx.restore();
}

function lightenColor(hex, amount) {
  const r = Math.min(255, parseInt(hex.slice(1,3),16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3,5),16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5,7),16) + amount);
  return `rgb(${r},${g},${b})`;
}
function darkenColor(hex, amount) {
  const r = Math.max(0, parseInt(hex.slice(1,3),16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3,5),16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5,7),16) - amount);
  return `rgb(${r},${g},${b})`;
}

// ========== ボード描画 ==========
let dragPixel = null; // {x, y} canvas座標

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 背景
  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, '#0d1528');
  bg.addColorStop(1, '#131e35');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // グリッドライン
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let r = 0; r <= state.rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL_SIZE);
    ctx.lineTo(canvas.width, r * CELL_SIZE);
    ctx.stroke();
  }
  for (let c = 0; c <= state.cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL_SIZE, 0);
    ctx.lineTo(c * CELL_SIZE, canvas.height);
    ctx.stroke();
  }

  // ドロップ描画（ドラッグ中のものは除く）
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const isHeld = state.dragging && state.dragCell?.row === r && state.dragCell?.col === c;
      if (isHeld) continue;
      const drop = state.board[r][c];
      if (drop) {
        drawDrop(ctx, c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, drop);
      }
    }
  }

  // ドラッグ中のドロップ（最前面）
  if (state.dragging && dragPixel && state.heldDrop) {
    drawDrop(
      ctx,
      dragPixel.x - CELL_SIZE / 2,
      dragPixel.y - CELL_SIZE / 2,
      CELL_SIZE,
      state.heldDrop,
      { scale: 1.15, selected: true }
    );
  }
}

// ========== ボード生成 ==========
function generateBoard(preset = null) {
  const { rows, cols, activeDrops } = state;
  const board = [];
  const drops = preset ? buildPreset(preset, rows, cols) : null;
  for (let r = 0; r < rows; r++) {
    board.push([]);
    for (let c = 0; c < cols; c++) {
      board[r].push(drops ? drops[r][c] : randomDrop(activeDrops));
    }
  }
  return board;
}

function randomDrop(drops) {
  return drops[Math.floor(Math.random() * drops.length)];
}

// ========== プリセット生成 ==========
function buildPreset(name, rows, cols) {
  const b = Array.from({length: rows}, () => Array(cols).fill('fire'));

  const fill = (dropList) => {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        b[r][c] = randomDrop(dropList);
  };

  const fillPattern = (pattern) => {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const idx = (r * cols + c) % pattern.length;
        b[r][c] = pattern[idx];
      }
  };

  switch(name) {
    case 'random': fill(state.activeDrops); break;

    case '3color': {
      const picks = shuffle(STANDARD_DROPS).slice(0,3);
      fill(picks); break;
    }
    case '4color': {
      const picks = shuffle(STANDARD_DROPS).slice(0,4);
      fill(picks); break;
    }
    case '5color': {
      const picks = shuffle(STANDARD_DROPS).slice(0,5);
      fill(picks); break;
    }
    case '6color':
      fill(['fire','water','wood','light','dark','heal']); break;

    case '7color':
      fill(['fire','water','wood','light','dark','heal','poison']); break;

    case 'healrow': {
      fill(['fire','water','wood','light','dark']);
      // 最下段を回復で埋める
      for (let c = 0; c < cols; c++) b[rows-1][c] = 'heal';
      break;
    }
    case 'firerow': {
      fill(['water','wood','light','dark','heal']);
      for (let c = 0; c < cols; c++) b[rows-1][c] = 'fire';
      break;
    }
    case 'cross': {
      fill(['fire','water','wood','dark','heal']);
      const midRow = Math.floor(rows/2);
      const midCol = Math.floor(cols/2);
      for (let c = 0; c < cols; c++) b[midRow][c] = 'light';
      for (let r = 0; r < rows; r++) b[r][midCol] = 'light';
      break;
    }
    case 'checker': {
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          b[r][c] = (r + c) % 2 === 0 ? 'fire' : 'water';
      break;
    }
    default: fill(state.activeDrops);
  }
  return b;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ========== ドラッグ操作 ==========
function getCell(px, py) {
  const c = Math.floor(px / CELL_SIZE);
  const r = Math.floor(py / CELL_SIZE);
  if (r < 0 || r >= state.rows || c < 0 || c >= state.cols) return null;
  return { row: r, col: c };
}

function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

canvas.addEventListener('mousedown',  onDragStart);
canvas.addEventListener('touchstart', onDragStart, { passive: false });
canvas.addEventListener('mousemove',  onDragMove);
canvas.addEventListener('touchmove',  onDragMove, { passive: false });
canvas.addEventListener('mouseup',    onDragEnd);
canvas.addEventListener('touchend',   onDragEnd);
canvas.addEventListener('mouseleave', onDragEnd);

function onDragStart(e) {
  if (state.replayMode) return;
  e.preventDefault();
  const pos = getCanvasPos(e);
  const cell = getCell(pos.x, pos.y);
  if (!cell) return;
  state.dragging = true;
  state.dragCell = { ...cell };
  state.heldDrop = state.board[cell.row][cell.col];
  state.board[cell.row][cell.col] = null;
  dragPixel = { x: pos.x, y: pos.y };

  // タイマー開始
  if (!state.timerRunning) startTimer();

  render();
}

function onDragMove(e) {
  if (!state.dragging) return;
  e.preventDefault();
  const pos = getCanvasPos(e);
  dragPixel = { x: pos.x, y: pos.y };

  const cell = getCell(pos.x, pos.y);
  if (cell && (cell.row !== state.dragCell.row || cell.col !== state.dragCell.col)) {
    // 移動先のドロップを元の位置に置く（入れ替え）
    const swappedDrop = state.board[cell.row][cell.col];
    state.board[state.dragCell.row][state.dragCell.col] = swappedDrop;
    state.board[cell.row][cell.col] = null;

    state.moveHistory.push({
      from: { ...state.dragCell },
      to: { ...cell },
      swapped: swappedDrop,
    });
    state.dragCell = { ...cell };
    state.moveCount++;
    updateMoveCount();
  }

  render();
}

function onDragEnd(e) {
  if (!state.dragging) return;
  state.dragging = false;

  if (state.dragCell) {
    state.board[state.dragCell.row][state.dragCell.col] = state.heldDrop;
  }
  state.heldDrop = null;
  state.dragCell = null;
  dragPixel = null;

  render();
  calcCombos();
}

// ========== コンボ計算 ==========
function calcCombos() {
  const { rows, cols, board } = state;
  const visited = Array.from({length: rows}, () => Array(cols).fill(false));
  const combos = [];

  // 連鎖チェック
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (visited[r][c] || !board[r][c]) continue;
      const type = board[r][c];
      const group = [];
      floodFill(r, c, type, visited, group, board, rows, cols);
      if (group.length >= 3) {
        combos.push({ type, cells: group, count: group.length });
      }
    }
  }

  state.combos = combos;
  updateComboDisplay();
}

function floodFill(r, c, type, visited, group, board, rows, cols) {
  if (r < 0 || r >= rows || c < 0 || c >= cols) return;
  if (visited[r][c] || board[r][c] !== type) return;
  // 3つ以上繋がりチェック（横・縦の直線3つ以上を基準）
  visited[r][c] = true;
  group.push({ r, c });
  floodFill(r+1, c, type, visited, group, board, rows, cols);
  floodFill(r-1, c, type, visited, group, board, rows, cols);
  floodFill(r, c+1, type, visited, group, board, rows, cols);
  floodFill(r, c-1, type, visited, group, board, rows, cols);
}

// ========== コンボ表示更新 ==========
function updateComboDisplay() {
  document.getElementById('combo-count').textContent = state.combos.length;

  const list = document.getElementById('combo-list');
  list.innerHTML = '';
  state.combos.forEach(combo => {
    const drop = DROP_TYPES[combo.type];
    const badge = document.createElement('div');
    badge.className = 'combo-badge';
    badge.innerHTML = `
      <div class="badge-dot" style="background:${drop.color}"></div>
      <span>${drop.name} ${combo.count}個</span>
    `;
    list.appendChild(badge);
  });

  if (state.combos.length >= 3) {
    showComboPopup(state.combos.length);
  }
}

function showComboPopup(n) {
  const popup = document.getElementById('combo-popup');
  popup.textContent = `${n} コンボ！`;
  popup.classList.remove('hidden');
  clearTimeout(popup._timeout);
  popup._timeout = setTimeout(() => popup.classList.add('hidden'), 1800);
}

// ========== タイマー ==========
function startTimer() {
  state.timerRunning = true;
  state.timerStart = Date.now() - state.timerElapsed * 1000;
  state.timerInterval = setInterval(() => {
    state.timerElapsed = (Date.now() - state.timerStart) / 1000;
    document.getElementById('timer').textContent = state.timerElapsed.toFixed(1);
  }, 100);
}

function stopTimer() {
  clearInterval(state.timerInterval);
  state.timerRunning = false;
}

function resetTimer() {
  stopTimer();
  state.timerElapsed = 0;
  state.timerRunning = false;
  document.getElementById('timer').textContent = '0.0';
}

// ========== 手数表示更新 ==========
function updateMoveCount() {
  const el = document.getElementById('move-count');
  el.textContent = state.moveCount;
  if (state.moveLimit > 0 && state.moveCount >= state.moveLimit) {
    el.style.color = 'var(--danger)';
  } else {
    el.style.color = '';
  }
}

// ========== ボードをディープコピー ==========
function cloneBoard(b) {
  return b.map(row => row.slice());
}

// ========== ボタン操作 ==========
document.getElementById('btn-new').addEventListener('click', () => {
  newBoard();
});

document.getElementById('btn-reset').addEventListener('click', () => {
  resetBoard();
});

document.getElementById('btn-undo').addEventListener('click', () => {
  undoMove();
});

document.getElementById('btn-replay').addEventListener('click', () => {
  startReplay();
});

function newBoard(preset = null) {
  stopTimer();
  state.board = generateBoard(preset);
  state.initialBoard = cloneBoard(state.board);
  state.moveHistory = [];
  state.moveCount = 0;
  state.combos = [];
  resetTimer();
  updateMoveCount();
  updateComboDisplay();
  document.getElementById('combo-popup').classList.add('hidden');
  render();
}

function resetBoard() {
  stopTimer();
  state.board = cloneBoard(state.initialBoard);
  state.moveHistory = [];
  state.moveCount = 0;
  state.combos = [];
  resetTimer();
  updateMoveCount();
  updateComboDisplay();
  document.getElementById('combo-popup').classList.add('hidden');
  render();
}

function undoMove() {
  if (state.moveHistory.length === 0) return;
  const last = state.moveHistory.pop();
  // 入れ替えを戻す
  state.board[last.from.row][last.from.col] = state.board[last.to.row][last.to.col];
  state.board[last.to.row][last.to.col] = last.swapped;
  state.moveCount = Math.max(0, state.moveCount - 1);
  updateMoveCount();
  calcCombos();
  render();
}

// ========== リプレイ ==========
let replayBoards = [];

function startReplay() {
  if (state.moveHistory.length === 0) return;

  // 全手順を再現
  replayBoards = [cloneBoard(state.initialBoard)];
  const tempBoard = cloneBoard(state.initialBoard);
  for (const move of state.moveHistory) {
    const tmp = tempBoard[move.to.row][move.to.col];
    tempBoard[move.to.row][move.to.col] = tempBoard[move.from.row][move.from.col];
    tempBoard[move.from.row][move.from.col] = tmp;
    replayBoards.push(cloneBoard(tempBoard));
  }

  state.replayMode = true;
  state.replayStep = 0;
  document.getElementById('replay-controls').classList.remove('hidden');
  updateReplayStep();
}

function updateReplayStep() {
  const max = replayBoards.length - 1;
  state.board = cloneBoard(replayBoards[state.replayStep]);
  document.getElementById('replay-step').textContent = `${state.replayStep} / ${max}`;
  render();
}

document.getElementById('btn-replay-prev').addEventListener('click', () => {
  state.replayStep = Math.max(0, state.replayStep - 1);
  updateReplayStep();
});

document.getElementById('btn-replay-next').addEventListener('click', () => {
  state.replayStep = Math.min(replayBoards.length - 1, state.replayStep + 1);
  updateReplayStep();
});

let replayAutoInterval = null;
document.getElementById('btn-replay-play').addEventListener('click', () => {
  if (replayAutoInterval) {
    clearInterval(replayAutoInterval);
    replayAutoInterval = null;
    document.getElementById('btn-replay-play').textContent = '▶';
    return;
  }
  document.getElementById('btn-replay-play').textContent = '⏸';
  replayAutoInterval = setInterval(() => {
    if (state.replayStep >= replayBoards.length - 1) {
      clearInterval(replayAutoInterval);
      replayAutoInterval = null;
      document.getElementById('btn-replay-play').textContent = '▶';
      return;
    }
    state.replayStep++;
    updateReplayStep();
  }, 400);
});

document.getElementById('btn-replay-close').addEventListener('click', () => {
  clearInterval(replayAutoInterval);
  replayAutoInterval = null;
  state.replayMode = false;
  document.getElementById('replay-controls').classList.add('hidden');
  state.board = cloneBoard(replayBoards[replayBoards.length - 1]);
  render();
  calcCombos();
});

// ========== 設定パネル ==========
const settingsPanel = document.getElementById('settings-panel');

// オーバーレイ追加
const overlay = document.createElement('div');
overlay.id = 'settings-overlay';
document.getElementById('app').appendChild(overlay);

document.getElementById('btn-settings').addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
  overlay.classList.toggle('active');
});
overlay.addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
  overlay.classList.remove('active');
});

// サイズボタン
document.querySelectorAll('.size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.cols = parseInt(btn.dataset.cols);
    state.rows = parseInt(btn.dataset.rows);
    updateCanvasSize();
    newBoard();
  });
});

// プリセットボタン
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    newBoard(btn.dataset.preset);
    settingsPanel.classList.add('hidden');
    overlay.classList.remove('active');
  });
});

// 移動制限
document.getElementById('move-limit').addEventListener('change', (e) => {
  state.moveLimit = parseInt(e.target.value);
});

// 適用ボタン
document.getElementById('btn-apply-settings').addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
  overlay.classList.remove('active');
  newBoard();
});

// ========== カラーパレット設定 ==========
function buildColorPalette() {
  const palette = document.getElementById('color-palette');
  palette.innerHTML = '';
  ALL_DROPS.forEach(id => {
    const drop = DROP_TYPES[id];
    const chip = document.createElement('div');
    chip.className = 'color-chip' + (state.activeDrops.includes(id) ? ' active' : '');
    chip.title = drop.name;
    chip.style.background = drop.color;
    chip.innerHTML = `<div class="chip-check">${state.activeDrops.includes(id) ? '✓' : ''}</div>`;
    chip.addEventListener('click', () => {
      const idx = state.activeDrops.indexOf(id);
      if (idx >= 0) {
        if (state.activeDrops.length <= 2) return; // 最低2色
        state.activeDrops.splice(idx, 1);
        chip.classList.remove('active');
        chip.querySelector('.chip-check').textContent = '';
      } else {
        state.activeDrops.push(id);
        chip.classList.add('active');
        chip.querySelector('.chip-check').textContent = '✓';
      }
    });
    palette.appendChild(chip);
  });
}

// ========== リサイズ対応 ==========
window.addEventListener('resize', () => {
  updateCanvasSize();
  render();
});

// ========== 初期化 ==========
function init() {
  buildColorPalette();
  updateCanvasSize();
  newBoard();
}

init();
