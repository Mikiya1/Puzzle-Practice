'use strict';

// =====================================================
// ドロップ定義 - 本家パズドラの色に忠実に
// 回復だけ四角形、他は全部円形
// シンボルなし、色と光沢だけで表現
// =====================================================
const DROP = {
  fire:    { name:'火',   shape:'circle', top:'#ff9966', mid:'#ee2200', bot:'#881100' },
  water:   { name:'水',   shape:'circle', top:'#99ddff', mid:'#1166ee', bot:'#003399' },
  wood:    { name:'木',   shape:'circle', top:'#aaee77', mid:'#228811', bot:'#114400' },
  light:   { name:'光',   shape:'circle', top:'#ffff99', mid:'#ddbb00', bot:'#886600' },
  dark:    { name:'闇',   shape:'circle', top:'#cc99ff', mid:'#7722cc', bot:'#330066' },
  heal:    { name:'回復', shape:'rect',   top:'#ffbbdd', mid:'#ee3377', bot:'#880033' },
  poison:  { name:'毒',   shape:'circle', top:'#ddff77', mid:'#559900', bot:'#224400' },
  mpoison: { name:'猛毒', shape:'circle', top:'#ee99ff', mid:'#aa11cc', bot:'#550077' },
  jammer:  { name:'邪魔', shape:'circle', top:'#bbbbdd', mid:'#556688', bot:'#223344' },
  bomb:    { name:'爆弾', shape:'circle', top:'#ffcc88', mid:'#cc5500', bot:'#662200' },
};
const STANDARD = ['fire','water','wood','light','dark','heal'];
const ALL_DROPS = Object.keys(DROP);

// =====================================================
// 状態
// =====================================================
let G = {
  cols:6, rows:5,
  board:[], initBoard:[],
  mode:'puzzle',
  locked:false,
  dragging:false, dragCell:null, heldDrop:null,
  history:[],
  moveCount:0,
  timeLimit:0,
  timerRunning:false, timerStart:0, timerElapsed:0, timerTick:null,
  combos:[],
  customDrop:'fire', customPainting:false,
  jinN:0, jinSelected:[],
  // 消去アニメ管理
  eraseState: null,   // { groups:[{row,cells:[{r,c}],drop,phase:'waiting'|'fading',startTime}], allDone:false }
  eraseAnimId: null,
  // 再生
  replayMode:false, replayBoards:[], replayPaths:[], replayStep:0,
  replayPlaying:false, replayIntervalId:null,
  showTrail:true,
};

// =====================================================
// Canvas
// =====================================================
const canvas = document.getElementById('puzzle-board');
const ctx = canvas.getContext('2d');
let CS = 72;

function resizeCanvas() {
  const maxW = Math.min(document.body.clientWidth - 24, 560);
  CS = Math.floor(maxW / G.cols);
  canvas.width  = CS * G.cols;
  canvas.height = CS * G.rows;
  canvas.style.width  = canvas.width + 'px';
  canvas.style.height = canvas.height + 'px';
}

// =====================================================
// ドロップ描画 - 本家パズドラ風 シンプル球体
// =====================================================
function drawDrop(x, y, id, alpha, scale, lifted) {
  if (!id) return;
  const d = DROP[id];
  if (!d) return;
  alpha = alpha ?? 1;
  scale = scale ?? 1;
  lifted = lifted ?? false;

  const cx = x + CS / 2;
  const cy = y + CS / 2;
  const R  = CS * 0.44 * scale;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (d.shape === 'rect') {
    drawHeartOrb(cx, cy, R, d, lifted);
  } else {
    drawCircleOrb(cx, cy, R, d, lifted);
  }

  ctx.restore();
}

function drawCircleOrb(cx, cy, R, d, lifted) {
  // ======= 浮き時のグロー =======
  if (lifted) {
    ctx.shadowColor = d.mid;
    ctx.shadowBlur  = R * 0.8;
  }

  // ======= 本体グラデーション =======
  // 本家は左上から光が当たる球体
  const g = ctx.createRadialGradient(
    cx - R * 0.28, cy - R * 0.32, R * 0.02,
    cx,            cy,             R
  );
  g.addColorStop(0,    d.top);
  g.addColorStop(0.45, d.mid);
  g.addColorStop(1,    d.bot);

  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;

  // ======= 外周に薄い縁取り =======
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = R * 0.06;
  ctx.stroke();

  // ======= 上部ハイライト（白い光沢） =======
  // 本家の特徴: 左上に楕円形の大きめハイライト
  const hl = ctx.createRadialGradient(
    cx - R * 0.3, cy - R * 0.35, 0,
    cx - R * 0.15, cy - R * 0.2, R * 0.58
  );
  hl.addColorStop(0,   'rgba(255,255,255,0.88)');
  hl.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  hl.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = hl;
  ctx.fill();

  // ======= 下部の微弱な反射光 =======
  const rf = ctx.createRadialGradient(cx, cy + R * 0.6, 0, cx, cy + R * 0.6, R * 0.42);
  rf.addColorStop(0,   'rgba(255,255,255,0.2)');
  rf.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = rf;
  ctx.fill();

  // ======= 名前テキスト（小さく下部に） =======
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur  = 3;
  ctx.font = `bold ${Math.round(R * 0.42)}px 'Noto Sans JP', sans-serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(d.name, cx, cy + R * 0.48);
  ctx.shadowBlur = 0;
}

function drawHeartOrb(cx, cy, R, d, lifted) {
  // 回復は角丸四角形
  const hw = R * 0.96, hh = R * 0.88, r = R * 0.22;
  const lx = cx - hw, ty = cy - hh;

  if (lifted) {
    ctx.shadowColor = d.mid;
    ctx.shadowBlur  = R * 0.8;
  }

  // 本体
  const g = ctx.createLinearGradient(lx, ty, lx, ty + hh * 2);
  g.addColorStop(0,   d.top);
  g.addColorStop(0.5, d.mid);
  g.addColorStop(1,   d.bot);
  rrect(cx - hw, cy - hh, hw * 2, hh * 2, r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.shadowBlur = 0;

  // 縁
  rrect(cx - hw, cy - hh, hw * 2, hh * 2, r);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth   = R * 0.06;
  ctx.stroke();

  // ハイライト
  const hl = ctx.createLinearGradient(lx, ty, lx, ty + hh);
  hl.addColorStop(0, 'rgba(255,255,255,0.75)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  rrect(cx - hw + 2, cy - hh + 2, hw * 2 - 4, hh - 2, r * 0.6);
  ctx.fillStyle = hl;
  ctx.fill();

  // ハートマーク（白）
  const s = R * 0.45;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur  = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.32);
  ctx.bezierCurveTo(cx - s * 1.1, cy - s * 0.18, cx - s * 1.1, cy - s * 0.95, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx + s * 1.1, cy - s * 0.95, cx + s * 1.1, cy - s * 0.18, cx, cy + s * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
}

function rrect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);     ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);     ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x, y + r);         ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}

// =====================================================
// レンダリング
// =====================================================
let dragPixel = null, rafId = null;

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 背景
  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, '#0c1424');
  bg.addColorStop(1, '#101c34');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, 10);
  ctx.fill();

  // グリッド線
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth   = 1;
  for (let r = 0; r <= G.rows; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * CS); ctx.lineTo(canvas.width, r * CS); ctx.stroke();
  }
  for (let c = 0; c <= G.cols; c++) {
    ctx.beginPath(); ctx.moveTo(c * CS, 0); ctx.lineTo(c * CS, canvas.height); ctx.stroke();
  }

  // 編集モード
  if (G.mode === 'edit') {
    ctx.fillStyle = 'rgba(255,200,0,0.04)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255,200,0,0.3)';
    ctx.lineWidth   = 1;
    for (let r = 0; r < G.rows; r++)
      for (let c = 0; c < G.cols; c++)
        ctx.strokeRect(c * CS + 0.5, r * CS + 0.5, CS - 1, CS - 1);
    ctx.setLineDash([]);
  }

  // 再生軌跡
  if (G.replayMode && G.showTrail && G.replayStep > 0) renderTrail();

  // ---- ドロップ描画 ----
  // 消去アニメ中のセルをまとめる
  const eraseMap = buildEraseMap();

  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      // ドラッグ中は元のセルを空に見せる
      if (G.dragging && G.dragCell && G.dragCell.r === r && G.dragCell.c === c) continue;

      const key = `${r},${c}`;
      if (eraseMap[key]) {
        const { drop, alpha, scale } = eraseMap[key];
        drawDrop(c * CS, r * CS, drop, alpha, scale, false);
      } else {
        const drop = G.board[r][c];
        if (drop) drawDrop(c * CS, r * CS, drop, 1, 1, false);
      }
    }
  }

  // ドラッグ中のドロップ（最前面・浮く）
  if (G.dragging && dragPixel && G.heldDrop) {
    drawDrop(
      dragPixel.x - CS / 2,
      dragPixel.y - CS / 2,
      G.heldDrop, 1, 1.18, true
    );
  }
}

// 消去アニメのアルファ・スケールマップを作る
function buildEraseMap() {
  const map = {};
  if (!G.eraseState) return map;
  const now = performance.now();
  const FADE = 220; // フェード時間ms

  G.eraseState.groups.forEach(group => {
    if (group.phase === 'waiting') return;
    const t = Math.min((now - group.startTime) / FADE, 1);
    const alpha = 1 - t;
    const scale = 1 - t * 0.3;
    group.cells.forEach(({ r, c }) => {
      map[`${r},${c}`] = { drop: group.drop, alpha, scale };
    });
  });
  return map;
}

function renderTrail() {
  const path = G.replayPaths.slice(0, G.replayStep + 1);
  if (path.length < 2) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,220,40,0.82)';
  ctx.lineWidth   = CS * 0.1;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.shadowColor = 'rgba(255,200,0,0.5)';
  ctx.shadowBlur  = 8;
  ctx.beginPath();
  ctx.moveTo(path[0].c * CS + CS / 2, path[0].r * CS + CS / 2);
  for (let i = 1; i < path.length; i++)
    ctx.lineTo(path[i].c * CS + CS / 2, path[i].r * CS + CS / 2);
  ctx.stroke();
  ctx.shadowBlur  = 0;
  ctx.fillStyle   = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(path[0].c * CS + CS / 2, path[0].r * CS + CS / 2, CS * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function sched() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => { rafId = null; render(); });
}

// =====================================================
// ボード生成
// =====================================================
function cloneBoard(b) { return b.map(r => r.slice()); }
function rnd(drops)    { return drops[Math.floor(Math.random() * drops.length)]; }
function shuffle(a)    { const s=a.slice(); for(let i=s.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[s[i],s[j]]=[s[j],s[i]];} return s; }
function makeBoard(drops) {
  return Array.from({ length: G.rows }, () =>
    Array.from({ length: G.cols }, () => rnd(drops))
  );
}

function newGame(drops) {
  stopTimer(); resetTimer();
  stopEraseAnim();
  G.board     = makeBoard(drops || STANDARD);
  G.initBoard = cloneBoard(G.board);
  G.history   = [];
  G.moveCount = 0;
  G.combos    = [];
  G.locked    = false;
  G.eraseState = null;
  updateMoveUI(); updateComboUI(); sched();
}

function resetGame() {
  stopTimer(); resetTimer();
  stopEraseAnim();
  G.board     = cloneBoard(G.initBoard);
  G.history   = [];
  G.moveCount = 0;
  G.combos    = [];
  G.locked    = false;
  G.eraseState = null;
  updateMoveUI(); updateComboUI(); sched();
}

// =====================================================
// 入力処理
// =====================================================
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  const src = e.touches ? e.touches[0] : e;
  return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy };
}
function toCell(px, py) {
  const c = Math.floor(px / CS), r = Math.floor(py / CS);
  if (r < 0 || r >= G.rows || c < 0 || c >= G.cols) return null;
  return { r, c };
}

canvas.addEventListener('mousedown',  onStart, false);
canvas.addEventListener('touchstart', onStart, { passive: false });
canvas.addEventListener('mousemove',  onMove,  false);
canvas.addEventListener('touchmove',  onMove,  { passive: false });
canvas.addEventListener('mouseup',    onEnd,   false);
canvas.addEventListener('touchend',   onEnd,   false);
canvas.addEventListener('mouseleave', onEnd,   false);

function onStart(e) {
  e.preventDefault();
  if (G.replayMode) return;
  const pos  = getPos(e);
  const cell = toCell(pos.x, pos.y);
  if (!cell) return;

  if (G.mode === 'edit') {
    G.customPainting = true;
    G.board[cell.r][cell.c] = G.customDrop;
    sched();
    return;
  }

  if (G.locked) return;
  stopEraseAnim();
  G.eraseState = null;

  G.dragging  = true;
  G.dragCell  = { ...cell };
  G.heldDrop  = G.board[cell.r][cell.c];
  G.board[cell.r][cell.c] = null;
  dragPixel   = { x: pos.x, y: pos.y };
  if (!G.timerRunning) startTimer();
  sched();
}

function onMove(e) {
  e.preventDefault();
  const pos = getPos(e);

  if (G.customPainting) {
    const cell = toCell(pos.x, pos.y);
    if (cell) { G.board[cell.r][cell.c] = G.customDrop; sched(); }
    return;
  }
  if (!G.dragging) return;

  dragPixel = { x: pos.x, y: pos.y };
  const cell = toCell(pos.x, pos.y);
  if (cell && (cell.r !== G.dragCell.r || cell.c !== G.dragCell.c)) {
    const swapped = G.board[cell.r][cell.c];
    G.board[G.dragCell.r][G.dragCell.c] = swapped;
    G.board[cell.r][cell.c] = null;
    G.history.push({ from: { ...G.dragCell }, to: { ...cell }, swapped });
    G.dragCell = { ...cell };
    G.moveCount++;
    updateMoveUI();
  }
  sched();
}

function onEnd(e) {
  if (G.customPainting) {
    G.customPainting = false;
    calcCombos();
    sched();
    return;
  }
  if (!G.dragging) return;

  G.dragging = false;
  if (G.dragCell) G.board[G.dragCell.r][G.dragCell.c] = G.heldDrop;
  G.heldDrop = null;
  G.dragCell = null;
  dragPixel  = null;

  stopTimer();        // 手を離したらタイマー止める
  G.locked = true;   // コンボ消去が終わるまでロック
  calcCombos();
  sched();
}

// =====================================================
// コンボ計算
// =====================================================
function calcCombos() {
  const { rows, cols, board } = G;
  const matched = Array.from({ length: rows }, () => Array(cols).fill(false));

  // 横3連以上
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 2; c++) {
      const t = board[r][c];
      if (!t) continue;
      if (board[r][c+1] === t && board[r][c+2] === t) {
        let e = c + 2;
        while (e + 1 < cols && board[r][e+1] === t) e++;
        for (let i = c; i <= e; i++) matched[r][i] = true;
      }
    }
  }
  // 縦3連以上
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows - 2; r++) {
      const t = board[r][c];
      if (!t) continue;
      if (board[r+1][c] === t && board[r+2][c] === t) {
        let e = r + 2;
        while (e + 1 < rows && board[e+1][c] === t) e++;
        for (let i = r; i <= e; i++) matched[i][c] = true;
      }
    }
  }

  // floodFillでグループ化
  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const combos  = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!matched[r][c] || visited[r][c]) continue;
      const type  = board[r][c];
      const cells = [];
      const stack = [{ r, c }];
      while (stack.length) {
        const { r: cr, c: cc } = stack.pop();
        if (cr < 0 || cr >= rows || cc < 0 || cc >= cols) continue;
        if (visited[cr][cc] || !matched[cr][cc] || board[cr][cc] !== type) continue;
        visited[cr][cc] = true;
        cells.push({ r: cr, c: cc });
        stack.push({ r:cr+1,c:cc }, { r:cr-1,c:cc }, { r:cr,c:cc+1 }, { r:cr,c:cc-1 });
      }
      combos.push({ type, cells });
    }
  }

  G.combos = combos;
  updateComboUI();

  if (combos.length > 0) {
    startEraseAnim(combos);
  } else {
    G.locked = false; // コンボなし → 即アンロック
  }
}

// =====================================================
// 消去アニメーション
// 本家パズドラ: 下の行から順番に光って消える
// =====================================================
function stopEraseAnim() {
  if (G.eraseAnimId) { cancelAnimationFrame(G.eraseAnimId); G.eraseAnimId = null; }
}

function startEraseAnim(combos) {
  stopEraseAnim();

  // 全コンボセルを行ごとに分類
  const rowMap = {};
  combos.forEach(combo => {
    combo.cells.forEach(({ r, c }) => {
      if (!rowMap[r]) rowMap[r] = { drop: combo.type, cells: [] };
      rowMap[r].cells.push({ r, c });
    });
  });

  // 下の行から順に並べる（行番号が大きい = 下）
  const sortedRows = Object.keys(rowMap).map(Number).sort((a, b) => b - a);

  const DELAY_PER_ROW = 80;  // 行ごとの遅延 ms
  const FADE_TIME     = 220; // フェードアウト時間 ms

  // groupsに変換
  const groups = sortedRows.map((row, idx) => ({
    row,
    drop:      rowMap[row].drop,
    cells:     rowMap[row].cells,
    phase:     'waiting',
    startTime: 0,
    delay:     idx * DELAY_PER_ROW,
  }));

  G.eraseState = { groups, startTime: performance.now(), FADE_TIME };

  // アニメーションループ
  function loop(now) {
    if (!G.eraseState) return;
    const elapsed = now - G.eraseState.startTime;
    let allDone = true;

    G.eraseState.groups.forEach(group => {
      if (group.phase === 'done') return;

      if (group.phase === 'waiting' && elapsed >= group.delay) {
        group.phase     = 'fading';
        group.startTime = now;
      }

      if (group.phase === 'fading') {
        const t = (now - group.startTime) / FADE_TIME;
        if (t >= 1) {
          group.phase = 'done';
        } else {
          allDone = false;
        }
      } else {
        allDone = false;
      }
    });

    sched();

    if (allDone) {
      G.eraseState  = null;
      G.eraseAnimId = null;
      G.locked      = false; // アンロック
      sched();
    } else {
      G.eraseAnimId = requestAnimationFrame(loop);
    }
  }

  G.eraseAnimId = requestAnimationFrame(loop);
}

// =====================================================
// UI更新
// =====================================================
function updateMoveUI() {
  document.getElementById('move-count').textContent = G.moveCount;
}

function updateComboUI() {
  document.getElementById('combo-count').textContent = G.combos.length;
  const list = document.getElementById('combo-list');
  list.innerHTML = '';
  G.combos.forEach(combo => {
    const d = DROP[combo.type];
    const b = document.createElement('div');
    b.className = 'combo-badge';
    b.innerHTML = `<div class="badge-dot" style="background:${d.mid}"></div><span>${d.name} ${combo.cells.length}個</span>`;
    list.appendChild(b);
  });
}

// =====================================================
// タイマー
// =====================================================
function startTimer() {
  G.timerRunning = true;
  G.timerStart   = Date.now() - G.timerElapsed * 1000;
  G.timerTick    = setInterval(tickTimer, 100);
}
function tickTimer() {
  G.timerElapsed = (Date.now() - G.timerStart) / 1000;
  document.getElementById('timer-display').textContent = G.timerElapsed.toFixed(1);
  const bar = document.getElementById('timer-bar');
  if (G.timeLimit > 0) {
    const pct = Math.max(0, 1 - G.timerElapsed / G.timeLimit);
    bar.style.width = (pct * 100) + '%';
    bar.classList.toggle('warning', pct < 0.3);
    if (G.timerElapsed >= G.timeLimit) {
      stopTimer();
      G.locked = true;
      document.getElementById('timer-display').style.color = 'var(--danger)';
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

// タイマー表示クリックで制限時間変更
document.getElementById('timer-display').addEventListener('click', () => {
  const val = prompt('制限時間（秒）を入力。0で無制限。', G.timeLimit);
  if (val === null) return;
  const n = Math.max(0, parseInt(val) || 0);
  G.timeLimit = n;
  const inp = document.getElementById('time-limit-input');
  if (inp) inp.value = n;
  resetTimer();
});

// =====================================================
// ボタン群
// =====================================================
document.getElementById('btn-new-random').addEventListener('click', () => newGame(STANDARD));
document.getElementById('btn-reset').addEventListener('click', resetGame);
document.getElementById('btn-undo').addEventListener('click', () => {
  if (!G.history.length || G.locked) return;
  const last = G.history.pop();
  G.board[last.from.r][last.from.c] = G.board[last.to.r][last.to.c];
  G.board[last.to.r][last.to.c]     = last.swapped;
  G.moveCount = Math.max(0, G.moveCount - 1);
  updateMoveUI(); calcCombos(); sched();
});

// 設定パネル
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

// モード切替
document.getElementById('btn-mode-toggle').addEventListener('click', () => {
  G.mode = G.mode === 'puzzle' ? 'edit' : 'puzzle';
  const btn = document.getElementById('btn-mode-toggle');
  btn.dataset.mode  = G.mode;
  btn.textContent   = G.mode === 'edit' ? '🎮 パズルモードへ戻す' : '✏ 盤面編集モード';
  document.getElementById('custom-palette').classList.toggle('hidden', G.mode !== 'edit');
  if (G.mode === 'edit') {
    stopTimer();
    if (G.replayMode) endReplay();
  }
  sched();
});

// =====================================================
// 陣選択
// =====================================================
function buildJinPicker(n) {
  G.jinN = n; G.jinSelected = [];
  const list = document.getElementById('jin-color-list');
  list.innerHTML = '';
  document.getElementById('jin-need-count').textContent = n;

  STANDARD.forEach(id => {
    const d    = DROP[id];
    const chip = document.createElement('div');
    chip.className  = 'jin-color-chip';
    chip.style.background = `radial-gradient(circle at 32% 32%, ${d.top}, ${d.mid} 55%, ${d.bot})`;
    chip.title = d.name;
    chip.innerHTML = `<span class="chip-name">${d.name}</span>`;
    chip.addEventListener('click', () => {
      const idx = G.jinSelected.indexOf(id);
      if (idx >= 0) {
        G.jinSelected.splice(idx, 1);
        chip.classList.remove('selected');
      } else {
        if (G.jinSelected.length >= n) {
          const old = G.jinSelected.shift();
          const oldChip = list.querySelectorAll('.jin-color-chip')[STANDARD.indexOf(old)];
          if (oldChip) oldChip.classList.remove('selected');
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
    document.querySelectorAll('.jin-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    buildJinPicker(parseInt(btn.dataset.jin));
  });
});

document.getElementById('btn-jin-apply').addEventListener('click', () => {
  if (G.jinSelected.length < G.jinN) { alert(`${G.jinN}色選んでください`); return; }
  newGame(G.jinSelected);
  document.getElementById('jin-color-picker').classList.add('hidden');
  document.querySelectorAll('.jin-btn').forEach(b => b.classList.remove('active'));
  G.jinSelected = [];
});

// =====================================================
// カスタムパレット
// =====================================================
function buildPalette() {
  const wrap = document.getElementById('palette-drops');
  wrap.innerHTML = '';
  ALL_DROPS.forEach(id => {
    const d    = DROP[id];
    const col  = document.createElement('div');
    col.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px';

    const chip = document.createElement('div');
    chip.className    = 'palette-drop' + (id === G.customDrop ? ' selected' : '');
    chip.dataset.id   = id;
    const isRect = d.shape === 'rect';
    chip.style.cssText = [
      'width:44px',
      `height:${isRect ? '38px' : '44px'}`,
      `border-radius:${isRect ? '8px' : '50%'}`,
      `background:radial-gradient(circle at 32% 32%, ${d.top}, ${d.mid} 55%, ${d.bot})`,
      'cursor:pointer',
      'border:3px solid transparent',
      'transition:all .15s',
      'flex-shrink:0',
    ].join(';');
    chip.addEventListener('click', () => {
      G.customDrop = id;
      document.querySelectorAll('.palette-drop').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
    });

    const label = document.createElement('div');
    label.style.cssText  = 'font-size:.6rem;color:var(--text2);white-space:nowrap';
    label.textContent    = d.name;

    col.appendChild(chip);
    col.appendChild(label);
    wrap.appendChild(col);
  });
}

// =====================================================
// 再生
// =====================================================
document.getElementById('btn-replay').addEventListener('click', startReplay);

function startReplay() {
  if (!G.history.length || G.mode === 'edit') return;
  const boards = [cloneBoard(G.initBoard)];
  const paths  = [{ r: G.history[0].from.r, c: G.history[0].from.c }];
  const tmp    = cloneBoard(G.initBoard);
  for (const mv of G.history) {
    const t = tmp[mv.to.r][mv.to.c];
    tmp[mv.to.r][mv.to.c]     = tmp[mv.from.r][mv.from.c];
    tmp[mv.from.r][mv.from.c] = t;
    boards.push(cloneBoard(tmp));
    paths.push({ r: mv.to.r, c: mv.to.c });
  }
  G.replayBoards    = boards;
  G.replayPaths     = paths;
  G.replayMode      = true;
  G.replayStep      = 0;
  G.replayPlaying   = false;
  document.getElementById('replay-bar').classList.remove('hidden');
  updateReplayStep();
}

function updateReplayStep() {
  G.board = cloneBoard(G.replayBoards[G.replayStep]);
  const max = G.replayBoards.length - 1;
  document.getElementById('rp-step-label').textContent = `${G.replayStep}/${max}`;
  sched();
}

function endReplay() {
  clearInterval(G.replayIntervalId);
  G.replayPlaying = false;
  G.replayMode    = false;
  document.getElementById('replay-bar').classList.add('hidden');
  document.getElementById('btn-rp-playpause').textContent = '▶';
  G.board = cloneBoard(G.replayBoards[G.replayBoards.length - 1] || G.initBoard);
  calcCombos();
  sched();
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
    G.replayIntervalId = setInterval(() => {
      if (G.replayStep >= G.replayBoards.length - 1) {
        G.replayPlaying = false;
        clearInterval(G.replayIntervalId);
        document.getElementById('btn-rp-playpause').textContent = '▶';
        return;
      }
      G.replayStep++;
      updateReplayStep();
    }, 100);
  } else {
    clearInterval(G.replayIntervalId);
  }
});
document.getElementById('btn-rp-close').addEventListener('click', endReplay);
document.getElementById('rp-trail-check').addEventListener('change', e => {
  G.showTrail = e.target.checked;
  sched();
});

// =====================================================
// リサイズ・初期化
// =====================================================
window.addEventListener('resize', () => { resizeCanvas(); sched(); });

buildPalette();
resizeCanvas();
newGame();
