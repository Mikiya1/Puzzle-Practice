// ========== ドロップ定義 ==========
const DROP = {
  fire:    { id:'fire',    name:'火',     color:'#e8321a', dark:'#8b1500', light:'#ff8877', glow:'rgba(255,80,30,.7)' },
  water:   { id:'water',   name:'水',     color:'#1a7be8', dark:'#003d99', light:'#88ccff', glow:'rgba(30,120,255,.7)' },
  wood:    { id:'wood',    name:'木',     color:'#1eaa38', dark:'#005515', light:'#88ee99', glow:'rgba(30,200,60,.7)' },
  light:   { id:'light',   name:'光',     color:'#e8c81a', dark:'#7a6000', light:'#fffaaa', glow:'rgba(255,230,30,.7)' },
  dark:    { id:'dark',    name:'闇',     color:'#8833dd', dark:'#3a006b', light:'#cc99ff', glow:'rgba(160,60,255,.7)' },
  heal:    { id:'heal',    name:'回復',   color:'#e8508a', dark:'#7a1040', light:'#ffaad0', glow:'rgba(255,80,150,.7)' },
  poison:  { id:'poison',  name:'毒',     color:'#7aaa10', dark:'#3a5000', light:'#ccee66', glow:'rgba(140,200,10,.7)' },
  jammer:  { id:'jammer',  name:'邪魔',   color:'#7070a0', dark:'#303050', light:'#aaaacc', glow:'rgba(120,120,180,.7)' },
  bomb:    { id:'bomb',    name:'爆弾',   color:'#cc6010', dark:'#6a2800', light:'#ffaa66', glow:'rgba(220,120,20,.7)' },
};

const STANDARD = ['fire','water','wood','light','dark','heal'];
const ALL_DROPS = Object.keys(DROP);

// ========== 状態 ==========
let G = {
  cols: 6, rows: 5,
  board: [],
  initBoard: [],
  dragging: false,
  dragCell: null,
  heldDrop: null,
  history: [],
  moveCount: 0,
  timeLimit: 0,   // 0=無制限
  timerRunning: false,
  timerStart: 0,
  timerElapsed: 0,
  timerTick: null,
  combos: [],
  // カスタムモード
  customMode: false,
  customDrop: 'fire',
  customPainting: false,
  // 陣選択
  jinN: 0,
  jinSelected: [],
  // アニメーション
  erasingCells: [],  // [{r,c,drop,progress}]
  eraseAnim: null,
  // 再生
  replayMode: false,
  replayBoards: [],
  replayPaths: [],   // 手順ごとの移動座標
  replayStep: 0,
  replayPlaying: false,
  replayInterval: null,
  showTrail: true,
};

// ========== Canvas ==========
const canvas = document.getElementById('puzzle-board');
const ctx = canvas.getContext('2d');
let CS = 72; // cell size

function resizeCanvas() {
  const maxW = Math.min(document.body.clientWidth - 24, 540);
  CS = Math.floor(maxW / G.cols);
  canvas.width  = CS * G.cols;
  canvas.height = CS * G.rows;
  canvas.style.width  = canvas.width  + 'px';
  canvas.style.height = canvas.height + 'px';
}

// ========== ドロップ描画 ==========
function drawDrop(x, y, typeId, opts = {}) {
  const { scale = 1, alpha = 1, lifted = false, eraseAlpha = 1 } = opts;
  if (!typeId) return;
  const d = DROP[typeId];
  if (!d) return;

  const cx = x + CS / 2;
  const cy = y + CS / 2;
  const baseR = CS * 0.44;
  const r = baseR * scale;

  ctx.save();
  ctx.globalAlpha = alpha * eraseAlpha;

  // 浮いてる時の影
  if (lifted) {
    ctx.shadowColor = d.glow;
    ctx.shadowBlur = 20;
  }

  // 外周光 (lifted時)
  if (lifted) {
    const glow = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 1.6);
    glow.addColorStop(0, d.glow);
    glow.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
  }

  // ベース球体
  const grad = ctx.createRadialGradient(
    cx - r * 0.22, cy - r * 0.28, r * 0.05,
    cx, cy, r
  );
  grad.addColorStop(0, d.light);
  grad.addColorStop(0.38, d.color);
  grad.addColorStop(1, d.dark);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.shadowColor = lifted ? d.glow : 'rgba(0,0,0,.5)';
  ctx.shadowBlur = lifted ? 16 : 4;
  ctx.fill();
  ctx.shadowBlur = 0;

  // ハイライト（上部白丸）
  const hl = ctx.createRadialGradient(
    cx - r * 0.28, cy - r * 0.32, 0,
    cx - r * 0.18, cy - r * 0.22, r * 0.52
  );
  hl.addColorStop(0, 'rgba(255,255,255,.78)');
  hl.addColorStop(0.6, 'rgba(255,255,255,.18)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = hl;
  ctx.fill();

  // 下部の反射光
  const refl = ctx.createRadialGradient(cx, cy + r * 0.55, 0, cx, cy + r * 0.55, r * 0.45);
  refl.addColorStop(0, 'rgba(255,255,255,.22)');
  refl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = refl;
  ctx.fill();

  // 縁
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // テキスト
  ctx.shadowBlur = 0;
  const fs = Math.max(9, Math.round(CS * 0.185));
  ctx.font = `bold ${fs}px 'Noto Sans JP', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.shadowColor = 'rgba(0,0,0,.85)';
  ctx.shadowBlur = 3;
  ctx.fillText(d.name, cx, cy + r * 0.54);
  ctx.shadowBlur = 0;

  ctx.restore();
}

// ========== ボード描画 ==========
let dragPixel = null;
let animFrame = null;

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 背景
  const bgGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bgGrad.addColorStop(0, '#0c1525');
  bgGrad.addColorStop(1, '#121e35');
  ctx.fillStyle = bgGrad;
  ctx.roundRect(0, 0, canvas.width, canvas.height, 10);
  ctx.fill();

  // グリッド
  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.lineWidth = 1;
  for (let r = 0; r <= G.rows; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * CS); ctx.lineTo(canvas.width, r * CS); ctx.stroke();
  }
  for (let c = 0; c <= G.cols; c++) {
    ctx.beginPath(); ctx.moveTo(c * CS, 0); ctx.lineTo(c * CS, canvas.height); ctx.stroke();
  }

  // 再生モード：軌跡ライン
  if (G.replayMode && G.showTrail && G.replayStep > 0) {
    drawTrail();
  }

  // ドロップ（ドラッグ中のセルを除く）
  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      const isHeld = G.dragging && G.dragCell && G.dragCell.r === r && G.dragCell.c === c;
      if (isHeld) continue;
      const drop = G.board[r][c];
      if (!drop) continue;

      // 消去アニメーション中？
      const ea = G.erasingCells.find(e => e.r === r && e.c === c);
      if (ea) {
        drawDrop(c * CS, r * CS, ea.drop, { eraseAlpha: 1 - ea.progress, scale: 1 - ea.progress * 0.4 });
      } else {
        drawDrop(c * CS, r * CS, drop);
      }
    }
  }

  // ドラッグ中ドロップ（最前面・浮く）
  if (G.dragging && dragPixel && G.heldDrop) {
    drawDrop(
      dragPixel.x - CS / 2,
      dragPixel.y - CS / 2,
      G.heldDrop,
      { scale: 1.18, lifted: true }
    );
  }

  // カスタムモード：選択中ドロップのハイライト枠
  if (G.customMode && !G.dragging && !G.replayMode) {
    ctx.strokeStyle = 'rgba(255,255,255,.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    for (let r = 0; r < G.rows; r++) {
      for (let c = 0; c < G.cols; c++) {
        ctx.strokeRect(c * CS + 1, r * CS + 1, CS - 2, CS - 2);
      }
    }
    ctx.setLineDash([]);
  }
}

// 軌跡描画
function drawTrail() {
  if (G.replayStep === 0 || !G.replayPaths || G.replayPaths.length === 0) return;
  const path = G.replayPaths.slice(0, G.replayStep);
  if (path.length < 2) return;

  ctx.save();
  ctx.strokeStyle = 'rgba(255, 220, 50, 0.75)';
  ctx.lineWidth = CS * 0.12;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(255,200,0,.5)';
  ctx.shadowBlur = 8;

  ctx.beginPath();
  ctx.moveTo(path[0].c * CS + CS / 2, path[0].r * CS + CS / 2);
  for (let i = 1; i < path.length; i++) {
    ctx.lineTo(path[i].c * CS + CS / 2, path[i].r * CS + CS / 2);
  }
  ctx.stroke();

  // 始点マーク
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.beginPath();
  ctx.arc(path[0].c * CS + CS / 2, path[0].r * CS + CS / 2, CS * 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function scheduleRender() {
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = requestAnimationFrame(() => { animFrame = null; render(); });
}

// ========== ボード生成 ==========
function cloneBoard(b) { return b.map(r => r.slice()); }

function randomDrop(drops) { return drops[Math.floor(Math.random() * drops.length)]; }

function shuffle(a) {
  const s = a.slice();
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [s[i], s[j]] = [s[j], s[i]];
  }
  return s;
}

function buildBoard(drops) {
  return Array.from({ length: G.rows }, () =>
    Array.from({ length: G.cols }, () => randomDrop(drops))
  );
}

// ========== ゲーム操作 ==========
function newGame(drops) {
  stopTimer();
  G.board = buildBoard(drops || STANDARD);
  G.initBoard = cloneBoard(G.board);
  G.history = [];
  G.moveCount = 0;
  G.combos = [];
  G.erasingCells = [];
  resetTimer();
  updateMoveUI();
  updateComboUI();
  scheduleRender();
}

function resetGame() {
  stopTimer();
  G.board = cloneBoard(G.initBoard);
  G.history = [];
  G.moveCount = 0;
  G.combos = [];
  G.erasingCells = [];
  resetTimer();
  updateMoveUI();
  updateComboUI();
  scheduleRender();
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  const src = e.touches ? e.touches[0] : e;
  return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy };
}

function posToCell(px, py) {
  const c = Math.floor(px / CS), r = Math.floor(py / CS);
  if (r < 0 || r >= G.rows || c < 0 || c >= G.cols) return null;
  return { r, c };
}

// ===== ドラッグ =====
canvas.addEventListener('mousedown',  onStart, false);
canvas.addEventListener('touchstart', onStart, { passive: false });
canvas.addEventListener('mousemove',  onMove,  false);
canvas.addEventListener('touchmove',  onMove,  { passive: false });
canvas.addEventListener('mouseup',    onEnd,   false);
canvas.addEventListener('touchend',   onEnd,   false);
canvas.addEventListener('mouseleave', onEnd,   false);

function onStart(e) {
  e.preventDefault();
  const pos = getPos(e);
  const cell = posToCell(pos.x, pos.y);
  if (!cell) return;

  // カスタムモード
  if (G.customMode) {
    G.customPainting = true;
    G.board[cell.r][cell.c] = G.customDrop;
    scheduleRender();
    return;
  }

  if (G.replayMode) return;

  // 通常ドラッグ
  G.dragging = true;
  G.dragCell = { ...cell };
  G.heldDrop = G.board[cell.r][cell.c];
  G.board[cell.r][cell.c] = null;
  dragPixel = { x: pos.x, y: pos.y };
  if (!G.timerRunning) startTimer();
  scheduleRender();
}

function onMove(e) {
  e.preventDefault();
  const pos = getPos(e);

  if (G.customPainting) {
    const cell = posToCell(pos.x, pos.y);
    if (cell) G.board[cell.r][cell.c] = G.customDrop;
    scheduleRender();
    return;
  }

  if (!G.dragging) return;
  dragPixel = { x: pos.x, y: pos.y };

  const cell = posToCell(pos.x, pos.y);
  if (cell && (cell.r !== G.dragCell.r || cell.c !== G.dragCell.c)) {
    const swapped = G.board[cell.r][cell.c];
    G.board[G.dragCell.r][G.dragCell.c] = swapped;
    G.board[cell.r][cell.c] = null;
    G.history.push({ from: { ...G.dragCell }, to: { ...cell }, swapped });
    G.dragCell = { ...cell };
    G.moveCount++;
    updateMoveUI();
  }
  scheduleRender();
}

function onEnd(e) {
  if (G.customPainting) {
    G.customPainting = false;
    calcCombos();
    scheduleRender();
    return;
  }
  if (!G.dragging) return;
  G.dragging = false;
  if (G.dragCell) G.board[G.dragCell.r][G.dragCell.c] = G.heldDrop;
  G.heldDrop = null;
  G.dragCell = null;
  dragPixel = null;
  calcCombos();
  scheduleRender();
}

// ========== コンボ計算 ==========
function calcCombos() {
  const { rows, cols, board } = G;
  // 3つ以上の塊を検出（横3 or 縦3以上の直線グループをfloodFill）
  const matched = Array.from({ length: rows }, () => Array(cols).fill(false));

  // まず横・縦の3連以上をマーク
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 2; c++) {
      const t = board[r][c];
      if (!t) continue;
      if (board[r][c+1] === t && board[r][c+2] === t) {
        let end = c + 2;
        while (end + 1 < cols && board[r][end+1] === t) end++;
        for (let i = c; i <= end; i++) matched[r][i] = true;
      }
    }
  }
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows - 2; r++) {
      const t = board[r][c];
      if (!t) continue;
      if (board[r+1][c] === t && board[r+2][c] === t) {
        let end = r + 2;
        while (end + 1 < rows && board[end+1][c] === t) end++;
        for (let i = r; i <= end; i++) matched[i][c] = true;
      }
    }
  }

  // matchedをfloodFillでグループ化
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const combos = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!matched[r][c] || visited[r][c]) continue;
      const type = board[r][c];
      const cells = [];
      const stack = [{ r, c }];
      while (stack.length) {
        const { r: cr, c: cc } = stack.pop();
        if (cr < 0 || cr >= rows || cc < 0 || cc >= cols) continue;
        if (visited[cr][cc] || !matched[cr][cc] || board[cr][cc] !== type) continue;
        visited[cr][cc] = true;
        cells.push({ r: cr, c: cc });
        stack.push({ r: cr+1, c: cc }, { r: cr-1, c: cc }, { r: cr, c: cc+1 }, { r: cr, c: cc-1 });
      }
      combos.push({ type, cells });
    }
  }

  G.combos = combos;
  updateComboUI();

  if (combos.length > 0) {
    animateErase(combos);
  }
}

// ========== 消去アニメーション ==========
function animateErase(combos) {
  const cells = combos.flatMap(c => c.cells.map(cell => ({
    ...cell,
    drop: G.board[cell.r][cell.c],
    progress: 0,
  })));
  G.erasingCells = cells;

  const duration = 420; // ms
  const start = performance.now();

  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    G.erasingCells.forEach(e => e.progress = t);
    scheduleRender();
    if (t < 1) {
      G.eraseAnim = requestAnimationFrame(tick);
    } else {
      G.erasingCells = [];
      scheduleRender();
    }
  }
  if (G.eraseAnim) cancelAnimationFrame(G.eraseAnim);
  G.eraseAnim = requestAnimationFrame(tick);
}

// ========== UI 更新 ==========
function updateMoveUI() {
  document.getElementById('move-count').textContent = G.moveCount;
}

function updateComboUI() {
  document.getElementById('combo-count').textContent = G.combos.length;
  const list = document.getElementById('combo-list');
  list.innerHTML = '';
  G.combos.forEach(combo => {
    const d = DROP[combo.type];
    const badge = document.createElement('div');
    badge.className = 'combo-badge';
    badge.innerHTML = `<div class="badge-dot" style="background:${d.color}"></div><span>${d.name} ${combo.cells.length}個</span>`;
    list.appendChild(badge);
  });
}

// ========== タイマー ==========
function startTimer() {
  G.timerRunning = true;
  G.timerStart = Date.now() - G.timerElapsed * 1000;
  G.timerTick = setInterval(tickTimer, 100);
}

function tickTimer() {
  G.timerElapsed = (Date.now() - G.timerStart) / 1000;
  const el = document.getElementById('timer-display');
  el.textContent = G.timerElapsed.toFixed(1);

  const bar = document.getElementById('timer-bar');
  if (G.timeLimit > 0) {
    const pct = Math.max(0, 1 - G.timerElapsed / G.timeLimit);
    bar.style.width = (pct * 100) + '%';
    bar.classList.toggle('warning', pct < 0.3);
    if (G.timerElapsed >= G.timeLimit) {
      stopTimer();
      el.style.color = 'var(--danger)';
    }
  } else {
    bar.style.width = '100%';
  }
}

function stopTimer() {
  clearInterval(G.timerTick);
  G.timerRunning = false;
}

function resetTimer() {
  stopTimer();
  G.timerElapsed = 0;
  document.getElementById('timer-display').textContent = '0.0';
  document.getElementById('timer-display').style.color = '';
  document.getElementById('timer-bar').style.width = '100%';
  document.getElementById('timer-bar').classList.remove('warning');
}

// ========== ボタン ==========
document.getElementById('btn-new-random').addEventListener('click', () => newGame(STANDARD));
document.getElementById('btn-reset').addEventListener('click', resetGame);
document.getElementById('btn-undo').addEventListener('click', () => {
  if (!G.history.length) return;
  const last = G.history.pop();
  G.board[last.from.r][last.from.c] = G.board[last.to.r][last.to.c];
  G.board[last.to.r][last.to.c] = last.swapped;
  G.moveCount = Math.max(0, G.moveCount - 1);
  updateMoveUI();
  calcCombos();
  scheduleRender();
});

// ========== 設定パネル ==========
document.getElementById('btn-settings').addEventListener('click', () => {
  document.getElementById('settings-panel').classList.remove('hidden');
  document.getElementById('settings-overlay').classList.remove('hidden');
});
function closeSettings() {
  document.getElementById('settings-panel').classList.add('hidden');
  document.getElementById('settings-overlay').classList.add('hidden');
}
document.getElementById('btn-settings-close').addEventListener('click', closeSettings);
document.getElementById('settings-overlay').addEventListener('click', closeSettings);

document.querySelectorAll('.size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    G.cols = parseInt(btn.dataset.cols);
    G.rows = parseInt(btn.dataset.rows);
    resizeCanvas();
    newGame();
  });
});

document.getElementById('time-limit-input').addEventListener('change', e => {
  G.timeLimit = Math.max(0, parseInt(e.target.value) || 0);
  resetTimer();
});

// ========== 陣選択 ==========
const JIN_COLORS = STANDARD; // 陣は6標準色から選ぶ

function buildJinColorPicker(n) {
  G.jinN = n;
  G.jinSelected = [];
  const list = document.getElementById('jin-color-list');
  list.innerHTML = '';
  document.getElementById('jin-need-count').textContent = n;

  JIN_COLORS.forEach(id => {
    const d = DROP[id];
    const chip = document.createElement('div');
    chip.className = 'jin-color-chip';
    chip.style.background = `radial-gradient(circle at 35% 35%, ${d.light}, ${d.color} 55%, ${d.dark})`;
    chip.title = d.name;
    chip.innerHTML = `<span class="chip-name">${d.name}</span>`;
    chip.addEventListener('click', () => {
      const idx = G.jinSelected.indexOf(id);
      if (idx >= 0) {
        G.jinSelected.splice(idx, 1);
        chip.classList.remove('selected');
      } else {
        if (G.jinSelected.length >= n) {
          // 最初に選んだのを外す
          const oldest = G.jinSelected.shift();
          list.querySelectorAll('.jin-color-chip')[JIN_COLORS.indexOf(oldest)]?.classList.remove('selected');
        }
        G.jinSelected.push(id);
        chip.classList.add('selected');
      }
    });
    list.appendChild(chip);
  });

  document.getElementById('jin-color-picker').classList.remove('hidden');
}

document.querySelectorAll('.jin-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const n = parseInt(btn.dataset.jin);
    document.querySelectorAll('.jin-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    buildJinColorPicker(n);
  });
});

document.getElementById('btn-jin-apply').addEventListener('click', () => {
  const sel = G.jinSelected;
  if (sel.length < G.jinN) {
    alert(`${G.jinN}色選んでください（現在${sel.length}色）`);
    return;
  }
  newGame(sel);
  document.getElementById('jin-color-picker').classList.add('hidden');
  document.querySelectorAll('.jin-btn').forEach(b => b.classList.remove('active'));
  G.jinSelected = [];
});

// ========== カスタムモード ==========
function buildPalette() {
  const wrap = document.getElementById('palette-drops');
  wrap.innerHTML = '';
  ALL_DROPS.forEach(id => {
    const d = DROP[id];
    const chip = document.createElement('div');
    chip.className = 'palette-drop' + (id === G.customDrop ? ' selected' : '');
    chip.style.background = `radial-gradient(circle at 35% 35%, ${d.light}, ${d.color} 55%, ${d.dark})`;
    chip.title = d.name;
    chip.dataset.id = id;
    chip.addEventListener('click', () => {
      G.customDrop = id;
      document.querySelectorAll('.palette-drop').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    });
    wrap.appendChild(chip);
  });
}

document.getElementById('btn-custom-toggle').addEventListener('click', () => {
  G.customMode = !G.customMode;
  const btn = document.getElementById('btn-custom-toggle');
  btn.dataset.active = G.customMode ? 'true' : 'false';
  btn.textContent = `✏ カスタムモード ${G.customMode ? 'ON' : 'OFF'}`;
  document.getElementById('custom-palette').classList.toggle('hidden', !G.customMode);
  if (G.customMode && G.replayMode) endReplay();
  scheduleRender();
});

buildPalette();

// ========== 再生 ==========
document.getElementById('btn-replay').addEventListener('click', startReplay);

function startReplay() {
  if (G.history.length === 0) return;
  if (G.customMode) {
    document.getElementById('btn-custom-toggle').click();
  }

  // 全盤面履歴と移動パスを再構築
  const boards = [cloneBoard(G.initBoard)];
  const paths = [{ r: G.history[0]?.from.r, c: G.history[0]?.from.c }];
  const tempBoard = cloneBoard(G.initBoard);

  for (const mv of G.history) {
    const tmp = tempBoard[mv.to.r][mv.to.c];
    tempBoard[mv.to.r][mv.to.c] = tempBoard[mv.from.r][mv.from.c];
    tempBoard[mv.from.r][mv.from.c] = tmp;
    boards.push(cloneBoard(tempBoard));
    paths.push({ r: mv.to.r, c: mv.to.c });
  }

  G.replayBoards = boards;
  G.replayPaths = paths;
  G.replayMode = true;
  G.replayStep = 0;
  G.replayPlaying = false;
  document.getElementById('replay-bar').classList.remove('hidden');
  updateReplayStep();
}

function updateReplayStep() {
  G.board = cloneBoard(G.replayBoards[G.replayStep]);
  const max = G.replayBoards.length - 1;
  document.getElementById('rp-step-label').textContent = `${G.replayStep}/${max}`;
  scheduleRender();
}

function endReplay() {
  clearInterval(G.replayInterval);
  G.replayPlaying = false;
  G.replayMode = false;
  document.getElementById('replay-bar').classList.add('hidden');
  document.getElementById('btn-rp-playpause').textContent = '▶';
  G.board = cloneBoard(G.replayBoards[G.replayBoards.length - 1]);
  calcCombos();
  scheduleRender();
}

document.getElementById('btn-rp-prev').addEventListener('click', () => {
  G.replayStep = Math.max(0, G.replayStep - 1);
  updateReplayStep();
});

document.getElementById('btn-rp-next').addEventListener('click', () => {
  G.replayStep = Math.min(G.replayBoards.length - 1, G.replayStep + 1);
  updateReplayStep();
});

document.getElementById('btn-rp-playpause').addEventListener('click', () => {
  G.replayPlaying = !G.replayPlaying;
  document.getElementById('btn-rp-playpause').textContent = G.replayPlaying ? '⏸' : '▶';
  if (G.replayPlaying) {
    G.replayInterval = setInterval(() => {
      if (G.replayStep >= G.replayBoards.length - 1) {
        G.replayPlaying = false;
        clearInterval(G.replayInterval);
        document.getElementById('btn-rp-playpause').textContent = '▶';
        return;
      }
      G.replayStep++;
      updateReplayStep();
    }, 120); // 速め
  } else {
    clearInterval(G.replayInterval);
  }
});

document.getElementById('btn-rp-close').addEventListener('click', endReplay);

document.getElementById('rp-trail-check').addEventListener('change', e => {
  G.showTrail = e.target.checked;
  scheduleRender();
});

// ========== リサイズ ==========
window.addEventListener('resize', () => { resizeCanvas(); scheduleRender(); });

// ========== 初期化 ==========
resizeCanvas();
newGame();
