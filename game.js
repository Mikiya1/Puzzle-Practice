// ========== ドロップ定義 ==========
// shape: 'circle'=丸, 'rect'=角丸四角
const DROP = {
  fire:    { id:'fire',    name:'火',     shape:'circle', color:'#e03010', dark:'#7a1200', light:'#ff9977', glow:'rgba(240,80,20,.8)' },
  water:   { id:'water',   name:'水',     shape:'circle', color:'#1060d8', dark:'#002880', light:'#88bbff', glow:'rgba(30,100,255,.8)' },
  wood:    { id:'wood',    name:'木',     shape:'circle', color:'#18a030', dark:'#004c10', light:'#88ee99', glow:'rgba(20,180,50,.8)'  },
  light:   { id:'light',   name:'光',     shape:'circle', color:'#d8a800', dark:'#705000', light:'#fff088', glow:'rgba(255,210,20,.8)' },
  dark:    { id:'dark',    name:'闇',     shape:'circle', color:'#7020c8', dark:'#30006a', light:'#cc88ff', glow:'rgba(140,40,240,.8)' },
  heal:    { id:'heal',    name:'回復',   shape:'rect',   color:'#d84070', dark:'#700028', light:'#ffaacc', glow:'rgba(240,60,120,.8)' },
  poison:  { id:'poison',  name:'毒',     shape:'circle', color:'#609000', dark:'#284000', light:'#bbdd44', glow:'rgba(120,180,0,.8)'  },
  mpoison: { id:'mpoison', name:'猛毒',   shape:'circle', color:'#9020c0', dark:'#400060', light:'#dd88ff', glow:'rgba(180,30,220,.8)' },
  jammer:  { id:'jammer',  name:'邪魔',   shape:'circle', color:'#606080', dark:'#282840', light:'#aaaacc', glow:'rgba(100,100,160,.8)'},
  bomb:    { id:'bomb',    name:'爆弾',   shape:'circle', color:'#c05010', dark:'#602000', light:'#ffaa66', glow:'rgba(200,100,10,.8)' },
};

const STANDARD = ['fire','water','wood','light','dark','heal'];
const ALL_DROPS = Object.keys(DROP);

// ========== 状態 ==========
let G = {
  cols: 6, rows: 5,
  board: [],
  initBoard: [],
  mode: 'puzzle',    // 'puzzle' | 'edit'
  dragging: false,
  dragCell: null,
  heldDrop: null,
  history: [],
  moveCount: 0,
  timeLimit: 0,
  timerRunning: false,
  timerStart: 0,
  timerElapsed: 0,
  timerTick: null,
  combos: [],
  // カスタムモード
  customDrop: 'fire',
  customPainting: false,
  // 陣
  jinN: 0,
  jinSelected: [],
  // アニメ
  eraseGroups: [],   // [{cells, drop, alpha, scale}]
  eraseRafId: null,
  // 再生
  replayMode: false,
  replayBoards: [],
  replayPaths: [],
  replayStep: 0,
  replayPlaying: false,
  replayRafId: null,
  replayLastTime: 0,
  showTrail: true,
};

// ========== Canvas ==========
const canvas = document.getElementById('puzzle-board');
const ctx = canvas.getContext('2d');
let CS = 72;

function resizeCanvas() {
  const maxW = Math.min(document.body.clientWidth - 24, 560);
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
  const finalAlpha = alpha * eraseAlpha;

  ctx.save();
  ctx.globalAlpha = finalAlpha;

  if (d.shape === 'rect') {
    drawHealDrop(cx, cy, r, d, lifted, scale);
  } else {
    drawCircleDrop(cx, cy, r, d, lifted);
    // 種類別のシンボル
    drawDropSymbol(cx, cy, r, typeId, d);
  }

  ctx.restore();
}

// 丸ドロップ（火水木光闇毒お邪魔爆弾）
function drawCircleDrop(cx, cy, r, d, lifted) {
  if (lifted) {
    ctx.shadowColor = d.glow;
    ctx.shadowBlur = 18;
    // 外周グロー
    const outerGlow = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.65);
    outerGlow.addColorStop(0, d.glow);
    outerGlow.addColorStop(1, 'transparent');
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.65, 0, Math.PI*2);
    ctx.fillStyle = outerGlow; ctx.fill();
  }

  // 球体グラデーション
  const grad = ctx.createRadialGradient(cx - r*0.22, cy - r*0.3, r*0.04, cx, cy, r);
  grad.addColorStop(0,    d.light);
  grad.addColorStop(0.35, d.color);
  grad.addColorStop(1,    d.dark);
  ctx.shadowColor = lifted ? d.glow : 'rgba(0,0,0,.55)';
  ctx.shadowBlur  = lifted ? 12 : 5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = grad; ctx.fill();
  ctx.shadowBlur = 0;

  // 上ハイライト
  const hl = ctx.createRadialGradient(cx-r*0.27, cy-r*0.34, 0, cx-r*0.18, cy-r*0.22, r*0.53);
  hl.addColorStop(0, 'rgba(255,255,255,.8)');
  hl.addColorStop(0.5,'rgba(255,255,255,.2)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = hl; ctx.fill();

  // 下反射
  const refl = ctx.createRadialGradient(cx, cy+r*0.58, 0, cx, cy+r*0.58, r*0.4);
  refl.addColorStop(0,'rgba(255,255,255,.25)');
  refl.addColorStop(1,'rgba(255,255,255,0)');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = refl; ctx.fill();

  // 縁取り
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.2; ctx.stroke();
}

// 回復ドロップ（角丸四角＋ハートマーク）
function drawHealDrop(cx, cy, r, d, lifted, scale) {
  const hw = r * 1.0;  // 横幅半分
  const hh = r * 0.95; // 縦幅半分
  const rad = r * 0.28; // 角丸半径
  const lx = cx - hw, ty = cy - hh, w = hw*2, h = hh*2;

  if (lifted) {
    ctx.shadowColor = d.glow; ctx.shadowBlur = 18;
    const og = ctx.createRadialGradient(cx, cy, r*0.5, cx, cy, r*1.7);
    og.addColorStop(0, d.glow); og.addColorStop(1, 'transparent');
    roundRect(ctx, lx-r*0.3, ty-r*0.3, w+r*0.6, h+r*0.6, rad+r*0.2);
    ctx.fillStyle = og; ctx.fill();
  }

  // 本体
  const grad = ctx.createLinearGradient(lx, ty, lx, ty+h);
  grad.addColorStop(0, d.light);
  grad.addColorStop(0.4, d.color);
  grad.addColorStop(1, d.dark);
  ctx.shadowColor = lifted ? d.glow : 'rgba(0,0,0,.55)';
  ctx.shadowBlur  = lifted ? 12 : 5;
  roundRect(ctx, lx, ty, w, h, rad);
  ctx.fillStyle = grad; ctx.fill();
  ctx.shadowBlur = 0;

  // ハイライト
  const hl = ctx.createLinearGradient(lx, ty, lx, ty+h*0.5);
  hl.addColorStop(0, 'rgba(255,255,255,.7)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  roundRect(ctx, lx+r*0.08, ty+r*0.08, w-r*0.16, h*0.5, rad*0.7);
  ctx.fillStyle = hl; ctx.fill();

  // 縁取り
  roundRect(ctx, lx, ty, w, h, rad);
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.2; ctx.stroke();

  // ハートマーク
  const hs = r * 0.46 * scale;
  drawHeart(ctx, cx, cy - r*0.08, hs);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
  ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r);
  ctx.closePath();
}

function drawHeart(ctx, cx, cy, size) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 3;
  ctx.beginPath();
  const s = size;
  ctx.moveTo(cx, cy + s * 0.3);
  ctx.bezierCurveTo(cx - s*1.0, cy - s*0.2, cx - s*1.0, cy - s*0.9, cx, cy - s*0.35);
  ctx.bezierCurveTo(cx + s*1.0, cy - s*0.9, cx + s*1.0, cy - s*0.2, cx, cy + s*0.3);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ドロップ種別シンボル（毒・猛毒・お邪魔・爆弾・通常）
function drawDropSymbol(cx, cy, r, typeId, d) {
  ctx.save();
  const fs = Math.max(8, r * 0.38);

  if (typeId === 'poison' || typeId === 'mpoison') {
    // 髑髏マーク
    drawSkull(ctx, cx, cy, r * 0.48);
  } else if (typeId === 'jammer') {
    // ×マーク
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = r * 0.18;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 3;
    const s = r * 0.3;
    ctx.beginPath(); ctx.moveTo(cx-s, cy-s); ctx.lineTo(cx+s, cy+s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx+s, cy-s); ctx.lineTo(cx-s, cy+s); ctx.stroke();
    ctx.shadowBlur = 0;
  } else if (typeId === 'bomb') {
    // 爆弾マーク（★）
    drawStar(ctx, cx, cy + r*0.05, r * 0.34);
  } else {
    // 通常は漢字1文字
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 4;
    ctx.font = `bold ${fs}px 'Noto Sans JP',sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(d.name, cx, cy + r*0.52);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawSkull(ctx, cx, cy, r) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 2;
  // 頭
  ctx.beginPath(); ctx.arc(cx, cy - r*0.1, r*0.7, 0, Math.PI*2); ctx.fill();
  // 顎
  ctx.fillRect(cx - r*0.4, cy + r*0.4, r*0.8, r*0.5);
  // 目（黒）
  ctx.fillStyle = DROP[ctx._skullId || 'poison'].color;
  ctx.beginPath(); ctx.arc(cx - r*0.27, cy - r*0.1, r*0.22, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r*0.27, cy - r*0.1, r*0.22, 0, Math.PI*2); ctx.fill();
  // 鼻
  ctx.beginPath(); ctx.arc(cx, cy + r*0.18, r*0.13, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawStar(ctx, cx, cy, r) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,150,.92)';
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 3;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i * 4 * Math.PI / 5) - Math.PI/2;
    const b = (i * 4 * Math.PI / 5 + 2*Math.PI/5) - Math.PI/2;
    if (i === 0) ctx.moveTo(cx + r*Math.cos(a), cy + r*Math.sin(a));
    else ctx.lineTo(cx + r*Math.cos(a), cy + r*Math.sin(a));
    ctx.lineTo(cx + r*0.4*Math.cos(b), cy + r*0.4*Math.sin(b));
  }
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ========== ボード描画 ==========
let dragPixel = null;
let rafId = null;

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 背景
  const bg = ctx.createLinearGradient(0,0,canvas.width,canvas.height);
  bg.addColorStop(0,'#0c1525'); bg.addColorStop(1,'#111e35');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(0,0,canvas.width,canvas.height,10); ctx.fill();

  // グリッド
  ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1;
  for (let r=0;r<=G.rows;r++){ctx.beginPath();ctx.moveTo(0,r*CS);ctx.lineTo(canvas.width,r*CS);ctx.stroke();}
  for (let c=0;c<=G.cols;c++){ctx.beginPath();ctx.moveTo(c*CS,0);ctx.lineTo(c*CS,canvas.height);ctx.stroke();}

  // 編集モード表示
  if (G.mode === 'edit') {
    ctx.fillStyle = 'rgba(255,200,0,.04)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 再生軌跡
  if (G.replayMode && G.showTrail && G.replayStep > 0) drawTrail();

  // 消去アニメ中セル
  const erasingSet = new Set(G.eraseGroups.flatMap(g => g.cells.map(c => `${c.r},${c.c}`)));

  // ドロップ描画
  for (let r=0;r<G.rows;r++) {
    for (let c=0;c<G.cols;c++) {
      const isHeld = G.dragging && G.dragCell && G.dragCell.r===r && G.dragCell.c===c;
      if (isHeld) continue;
      const drop = G.board[r][c];
      if (!drop) continue;
      if (erasingSet.has(`${r},${c}`)) continue; // 消去アニメは後で
      drawDrop(c*CS, r*CS, drop);
    }
  }

  // 消去アニメ
  G.eraseGroups.forEach(g => {
    g.cells.forEach(cell => {
      drawDrop(cell.c*CS, cell.r*CS, g.drop, { eraseAlpha: g.alpha, scale: g.scale });
    });
  });

  // ドラッグ中ドロップ（最前面）
  if (G.dragging && dragPixel && G.heldDrop) {
    drawDrop(dragPixel.x - CS/2, dragPixel.y - CS/2, G.heldDrop, { scale:1.18, lifted:true });
  }

  // 編集モード：カーソルセルのハイライト枠
  if (G.mode === 'edit') {
    ctx.strokeStyle = 'rgba(255,220,0,.4)'; ctx.lineWidth=1.5; ctx.setLineDash([3,3]);
    for (let r=0;r<G.rows;r++) for (let c=0;c<G.cols;c++)
      ctx.strokeRect(c*CS+1,r*CS+1,CS-2,CS-2);
    ctx.setLineDash([]);
  }
}

function drawTrail() {
  const path = G.replayPaths.slice(0, G.replayStep + 1);
  if (path.length < 2) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,220,40,.8)';
  ctx.lineWidth = CS * 0.11;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(255,200,0,.5)'; ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(path[0].c*CS+CS/2, path[0].r*CS+CS/2);
  for (let i=1;i<path.length;i++) ctx.lineTo(path[i].c*CS+CS/2, path[i].r*CS+CS/2);
  ctx.stroke();
  // 始点
  ctx.shadowBlur=0; ctx.fillStyle='rgba(255,255,255,.95)';
  ctx.beginPath(); ctx.arc(path[0].c*CS+CS/2, path[0].r*CS+CS/2, CS*0.1, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

function scheduleRender() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(()=>{rafId=null;render();});
}

// ========== ボード生成 ==========
function cloneBoard(b) { return b.map(r=>r.slice()); }
function randomDrop(drops) { return drops[Math.floor(Math.random()*drops.length)]; }
function shuffle(a) {
  const s=a.slice();
  for(let i=s.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[s[i],s[j]]=[s[j],s[i]];}
  return s;
}
function buildBoard(drops) {
  return Array.from({length:G.rows},()=>Array.from({length:G.cols},()=>randomDrop(drops)));
}

// ========== ゲーム操作 ==========
function newGame(drops) {
  stopTimer(); resetTimer();
  G.board = buildBoard(drops || STANDARD);
  G.initBoard = cloneBoard(G.board);
  G.history = []; G.moveCount = 0; G.combos = [];
  cancelEraseAnim();
  updateMoveUI(); updateComboUI();
  scheduleRender();
}

function resetGame() {
  stopTimer(); resetTimer();
  G.board = cloneBoard(G.initBoard);
  G.history = []; G.moveCount = 0; G.combos = [];
  cancelEraseAnim();
  updateMoveUI(); updateComboUI();
  scheduleRender();
}

// ========== 入力 ==========
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width/rect.width, sy = canvas.height/rect.height;
  const src = e.touches ? e.touches[0] : e;
  return { x:(src.clientX-rect.left)*sx, y:(src.clientY-rect.top)*sy };
}
function posToCell(px,py) {
  const c=Math.floor(px/CS), r=Math.floor(py/CS);
  if(r<0||r>=G.rows||c<0||c>=G.cols) return null;
  return {r,c};
}

canvas.addEventListener('mousedown',  onStart, false);
canvas.addEventListener('touchstart', onStart, {passive:false});
canvas.addEventListener('mousemove',  onMove,  false);
canvas.addEventListener('touchmove',  onMove,  {passive:false});
canvas.addEventListener('mouseup',    onEnd,   false);
canvas.addEventListener('touchend',   onEnd,   false);
canvas.addEventListener('mouseleave', onEnd,   false);

function onStart(e) {
  e.preventDefault();
  const pos = getPos(e);
  const cell = posToCell(pos.x, pos.y);
  if (!cell) return;

  if (G.mode === 'edit') {
    G.customPainting = true;
    G.board[cell.r][cell.c] = G.customDrop;
    scheduleRender(); return;
  }
  if (G.replayMode) return;

  G.dragging = true;
  G.dragCell = {...cell};
  G.heldDrop = G.board[cell.r][cell.c];
  G.board[cell.r][cell.c] = null;
  dragPixel = {x:pos.x, y:pos.y};
  if (!G.timerRunning) startTimer();
  scheduleRender();
}

function onMove(e) {
  e.preventDefault();
  const pos = getPos(e);

  if (G.customPainting) {
    const cell = posToCell(pos.x, pos.y);
    if (cell) { G.board[cell.r][cell.c] = G.customDrop; scheduleRender(); }
    return;
  }
  if (!G.dragging) return;
  dragPixel = {x:pos.x, y:pos.y};

  const cell = posToCell(pos.x, pos.y);
  if (cell && (cell.r!==G.dragCell.r || cell.c!==G.dragCell.c)) {
    const swapped = G.board[cell.r][cell.c];
    G.board[G.dragCell.r][G.dragCell.c] = swapped;
    G.board[cell.r][cell.c] = null;
    G.history.push({from:{...G.dragCell}, to:{...cell}, swapped});
    G.dragCell = {...cell};
    G.moveCount++;
    updateMoveUI();
  }
  scheduleRender();
}

function onEnd(e) {
  if (G.customPainting) {
    G.customPainting = false;
    calcCombos(); scheduleRender(); return;
  }
  if (!G.dragging) return;
  G.dragging = false;
  if (G.dragCell) G.board[G.dragCell.r][G.dragCell.c] = G.heldDrop;
  G.heldDrop = null; G.dragCell = null; dragPixel = null;
  stopTimer();
  calcCombos(); scheduleRender();
}

// ========== コンボ計算 ==========
function calcCombos() {
  const {rows, cols, board} = G;
  const matched = Array.from({length:rows},()=>Array(cols).fill(false));

  for (let r=0;r<rows;r++) for (let c=0;c<cols-2;c++) {
    const t=board[r][c]; if(!t) continue;
    if(board[r][c+1]===t && board[r][c+2]===t){
      let e=c+2; while(e+1<cols&&board[r][e+1]===t)e++;
      for(let i=c;i<=e;i++) matched[r][i]=true;
    }
  }
  for (let c=0;c<cols;c++) for (let r=0;r<rows-2;r++) {
    const t=board[r][c]; if(!t) continue;
    if(board[r+1][c]===t && board[r+2][c]===t){
      let e=r+2; while(e+1<rows&&board[e+1][c]===t)e++;
      for(let i=r;i<=e;i++) matched[i][c]=true;
    }
  }

  const visited = Array.from({length:rows},()=>Array(cols).fill(false));
  const combos = [];
  for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
    if(!matched[r][c]||visited[r][c]) continue;
    const type=board[r][c], cells=[];
    const stack=[{r,c}];
    while(stack.length){
      const {r:cr,c:cc}=stack.pop();
      if(cr<0||cr>=rows||cc<0||cc>=cols||visited[cr][cc]||!matched[cr][cc]||board[cr][cc]!==type) continue;
      visited[cr][cc]=true; cells.push({r:cr,c:cc});
      stack.push({r:cr+1,c:cc},{r:cr-1,c:cc},{r:cr,c:cc+1},{r:cr,c:cc-1});
    }
    combos.push({type, cells});
  }

  G.combos = combos;
  updateComboUI();
  if (combos.length > 0) animateEraseSequential(combos);
}

// ========== 消去アニメーション（下の列から順番に） ==========
function cancelEraseAnim() {
  if (G.eraseRafId) cancelAnimationFrame(G.eraseRafId);
  G.eraseRafId = null;
  G.eraseGroups = [];
}

function animateEraseSequential(combos) {
  cancelEraseAnim();

  // 全消去セルを列ごとにグループ化し、下の列から順に消す
  const allCells = combos.flatMap(combo => combo.cells.map(cell => ({...cell, drop: combo.type})));

  // 行でソート（大きい行=下から先に消す）
  const byRow = {};
  allCells.forEach(cell => {
    const key = cell.r;
    if (!byRow[key]) byRow[key] = [];
    byRow[key].push(cell);
  });
  const rows = Object.keys(byRow).map(Number).sort((a,b)=>b-a); // 下から順

  const PER_ROW_MS = 80;   // 1行ごとの遅延
  const FADE_MS    = 200;  // フェード時間

  rows.forEach((row, idx) => {
    const cells = byRow[row];
    const drop = cells[0].drop; // 同コンボセルなので同色
    const group = { cells, drop, alpha: 1, scale: 1 };

    setTimeout(() => {
      G.eraseGroups.push(group);
      const start = performance.now();
      function tick(now) {
        const t = Math.min((now - start) / FADE_MS, 1);
        group.alpha = 1 - t;
        group.scale = 1 - t * 0.4;
        scheduleRender();
        if (t < 1) {
          G.eraseRafId = requestAnimationFrame(tick);
        } else {
          G.eraseGroups = G.eraseGroups.filter(g => g !== group);
          scheduleRender();
        }
      }
      G.eraseRafId = requestAnimationFrame(tick);
    }, idx * PER_ROW_MS);
  });
}

// ========== UI更新 ==========
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
  document.getElementById('timer-display').textContent = G.timerElapsed.toFixed(1);
  const bar = document.getElementById('timer-bar');
  if (G.timeLimit > 0) {
    const pct = Math.max(0, 1 - G.timerElapsed / G.timeLimit);
    bar.style.width = (pct*100)+'%';
    bar.classList.toggle('warning', pct < 0.3);
    if (G.timerElapsed >= G.timeLimit) {
      stopTimer();
      document.getElementById('timer-display').style.color = 'var(--danger)';
    }
  } else {
    bar.style.width = '100%';
  }
}
function stopTimer() { clearInterval(G.timerTick); G.timerRunning = false; }
function resetTimer() {
  stopTimer(); G.timerElapsed = 0;
  document.getElementById('timer-display').textContent = '0.0';
  document.getElementById('timer-display').style.color = '';
  document.getElementById('timer-bar').style.width = '100%';
  document.getElementById('timer-bar').classList.remove('warning');
}

// タイマー表示クリックで入力
document.getElementById('timer-display').style.cursor = 'pointer';
document.getElementById('timer-display').title = 'クリックで時間制限を設定';
document.getElementById('timer-display').addEventListener('click', () => {
  const input = document.getElementById('time-limit-input');
  const val = prompt('制限時間を秒で入力（0で無制限）', G.timeLimit);
  if (val === null) return;
  const n = Math.max(0, parseInt(val) || 0);
  G.timeLimit = n;
  if (input) input.value = n;
  resetTimer();
});

// ========== モード切替 ==========
document.getElementById('btn-mode-toggle').addEventListener('click', () => {
  G.mode = G.mode === 'puzzle' ? 'edit' : 'puzzle';
  const btn = document.getElementById('btn-mode-toggle');
  btn.textContent = G.mode === 'edit' ? '🎮 パズルモード切替' : '✏ 編集モード切替';
  btn.dataset.mode = G.mode;
  document.getElementById('custom-palette').classList.toggle('hidden', G.mode !== 'edit');
  if (G.mode === 'edit') {
    stopTimer();
    if (G.replayMode) endReplay();
  }
  scheduleRender();
});

// ========== ボタン ==========
document.getElementById('btn-new-random').addEventListener('click', ()=>newGame(STANDARD));
document.getElementById('btn-reset').addEventListener('click', resetGame);
document.getElementById('btn-undo').addEventListener('click', ()=>{
  if (!G.history.length) return;
  const last = G.history.pop();
  G.board[last.from.r][last.from.c] = G.board[last.to.r][last.to.c];
  G.board[last.to.r][last.to.c] = last.swapped;
  G.moveCount = Math.max(0, G.moveCount-1);
  updateMoveUI(); calcCombos(); scheduleRender();
});

// ========== 設定パネル ==========
document.getElementById('btn-settings').addEventListener('click', ()=>{
  document.getElementById('settings-panel').classList.remove('hidden');
  document.getElementById('settings-overlay').classList.remove('hidden');
});
function closeSettings(){
  document.getElementById('settings-panel').classList.add('hidden');
  document.getElementById('settings-overlay').classList.add('hidden');
}
document.getElementById('btn-settings-close').addEventListener('click', closeSettings);
document.getElementById('settings-overlay').addEventListener('click', closeSettings);

document.querySelectorAll('.size-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.size-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    G.cols=parseInt(btn.dataset.cols); G.rows=parseInt(btn.dataset.rows);
    resizeCanvas(); newGame();
  });
});

document.getElementById('time-limit-input').addEventListener('change', e=>{
  G.timeLimit = Math.max(0, parseInt(e.target.value)||0);
  resetTimer();
});

// ========== 陣 ==========
function buildJinPicker(n) {
  G.jinN=n; G.jinSelected=[];
  const list = document.getElementById('jin-color-list');
  list.innerHTML='';
  document.getElementById('jin-need-count').textContent=n;
  STANDARD.forEach(id=>{
    const d=DROP[id];
    const chip=document.createElement('div');
    chip.className='jin-color-chip';
    chip.style.background=`radial-gradient(circle at 35% 35%,${d.light},${d.color} 55%,${d.dark})`;
    chip.title=d.name;
    chip.innerHTML=`<span class="chip-name">${d.name}</span>`;
    chip.addEventListener('click',()=>{
      const idx=G.jinSelected.indexOf(id);
      if(idx>=0){G.jinSelected.splice(idx,1);chip.classList.remove('selected');}
      else{
        if(G.jinSelected.length>=n){
          const old=G.jinSelected.shift();
          list.querySelectorAll('.jin-color-chip')[STANDARD.indexOf(old)]?.classList.remove('selected');
        }
        G.jinSelected.push(id); chip.classList.add('selected');
      }
    });
    list.appendChild(chip);
  });
  document.getElementById('jin-color-picker').classList.remove('hidden');
}

document.querySelectorAll('.jin-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.jin-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    buildJinPicker(parseInt(btn.dataset.jin));
  });
});

document.getElementById('btn-jin-apply').addEventListener('click',()=>{
  if(G.jinSelected.length<G.jinN){alert(`${G.jinN}色選んでください`);return;}
  newGame(G.jinSelected);
  document.getElementById('jin-color-picker').classList.add('hidden');
  document.querySelectorAll('.jin-btn').forEach(b=>b.classList.remove('active'));
  G.jinSelected=[];
});

// ========== カスタムパレット ==========
function buildPalette() {
  const wrap = document.getElementById('palette-drops');
  wrap.innerHTML='';
  ALL_DROPS.forEach(id=>{
    const d=DROP[id];
    const chip=document.createElement('div');
    chip.className='palette-drop'+(id===G.customDrop?' selected':'');
    chip.title=d.name;
    chip.dataset.id=id;
    if (d.shape === 'rect') {
      chip.style.borderRadius='6px';
    }
    chip.style.background=`radial-gradient(circle at 35% 35%,${d.light},${d.color} 55%,${d.dark})`;
    chip.addEventListener('click',()=>{
      G.customDrop=id;
      document.querySelectorAll('.palette-drop').forEach(c=>c.classList.remove('selected'));
      chip.classList.add('selected');
    });
    // ラベル
    const label = document.createElement('div');
    label.style.cssText='position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);font-size:.58rem;color:var(--text2);white-space:nowrap;pointer-events:none';
    label.textContent=d.name;
    chip.style.position='relative';
    chip.appendChild(label);
    wrap.appendChild(chip);
  });
}

// ========== 再生 ==========
document.getElementById('btn-replay').addEventListener('click', startReplay);

function startReplay() {
  if (G.history.length===0) return;
  if (G.mode==='edit') return;

  const boards=[cloneBoard(G.initBoard)];
  const paths=[{r:G.history[0].from.r, c:G.history[0].from.c}];
  const tmp=cloneBoard(G.initBoard);
  for (const mv of G.history) {
    const t=tmp[mv.to.r][mv.to.c];
    tmp[mv.to.r][mv.to.c]=tmp[mv.from.r][mv.from.c];
    tmp[mv.from.r][mv.from.c]=t;
    boards.push(cloneBoard(tmp));
    paths.push({r:mv.to.r, c:mv.to.c});
  }

  G.replayBoards=boards; G.replayPaths=paths;
  G.replayMode=true; G.replayStep=0; G.replayPlaying=false;
  document.getElementById('replay-bar').classList.remove('hidden');
  updateReplayStep();
}

function updateReplayStep() {
  G.board=cloneBoard(G.replayBoards[G.replayStep]);
  const max=G.replayBoards.length-1;
  document.getElementById('rp-step-label').textContent=`${G.replayStep}/${max}`;
  scheduleRender();
}

function endReplay() {
  if (G.replayRafId) cancelAnimationFrame(G.replayRafId);
  G.replayRafId=null; G.replayPlaying=false; G.replayMode=false;
  document.getElementById('replay-bar').classList.add('hidden');
  document.getElementById('btn-rp-playpause').textContent='▶';
  G.board=cloneBoard(G.replayBoards[G.replayBoards.length-1]||G.initBoard);
  calcCombos(); scheduleRender();
}

document.getElementById('btn-rp-prev').addEventListener('click',()=>{
  G.replayStep=Math.max(0,G.replayStep-1); updateReplayStep();
});
document.getElementById('btn-rp-next').addEventListener('click',()=>{
  G.replayStep=Math.min(G.replayBoards.length-1,G.replayStep+1); updateReplayStep();
});

let replayIntervalId=null;
document.getElementById('btn-rp-playpause').addEventListener('click',()=>{
  G.replayPlaying=!G.replayPlaying;
  document.getElementById('btn-rp-playpause').textContent=G.replayPlaying?'⏸':'▶';
  if (G.replayPlaying) {
    replayIntervalId=setInterval(()=>{
      if(G.replayStep>=G.replayBoards.length-1){
        G.replayPlaying=false; clearInterval(replayIntervalId);
        document.getElementById('btn-rp-playpause').textContent='▶'; return;
      }
      G.replayStep++; updateReplayStep();
    }, 100);
  } else {
    clearInterval(replayIntervalId);
  }
});

document.getElementById('btn-rp-close').addEventListener('click',endReplay);
document.getElementById('rp-trail-check').addEventListener('change',e=>{G.showTrail=e.target.checked;scheduleRender();});

// ========== リサイズ ==========
window.addEventListener('resize',()=>{resizeCanvas();scheduleRender();});

// ========== 初期化 ==========
buildPalette();
resizeCanvas();
newGame();
