'use strict';

// =====================================================
// ドロップ定義
// =====================================================
const DROP = {
  fire:    { name:'火',   shape:'circle', c1:'#ff8855', c2:'#dd2200', c3:'#881100', glow:'#ff4400' },
  water:   { name:'水',   shape:'circle', c1:'#88ddff', c2:'#1166dd', c3:'#002288', glow:'#2299ff' },
  wood:    { name:'木',   shape:'circle', c1:'#99ee77', c2:'#229922', c3:'#115511', glow:'#33cc33' },
  light:   { name:'光',   shape:'circle', c1:'#ffee88', c2:'#ddaa00', c3:'#886600', glow:'#ffcc00' },
  dark:    { name:'闇',   shape:'circle', c1:'#cc88ff', c2:'#6611cc', c3:'#330077', glow:'#9922ff' },
  heal:    { name:'回復', shape:'heart',  c1:'#ffaad0', c2:'#ee4488', c3:'#880033', glow:'#ff44aa' },
  poison:  { name:'毒',   shape:'circle', c1:'#ccee44', c2:'#669900', c3:'#334400', glow:'#88cc00' },
  mpoison: { name:'猛毒', shape:'circle', c1:'#ee88ff', c2:'#aa00dd', c3:'#550077', glow:'#cc00ff' },
  jammer:  { name:'邪魔', shape:'circle', c1:'#aaaacc', c2:'#6666aa', c3:'#333366', glow:'#8888cc' },
  bomb:    { name:'爆弾', shape:'circle', c1:'#ffcc88', c2:'#cc6600', c3:'#663300', glow:'#ff8800' },
};
const STANDARD = ['fire','water','wood','light','dark','heal'];
const ALL_DROPS = Object.keys(DROP);

// =====================================================
// 状態
// =====================================================
let G = {
  cols:6, rows:5,
  board:[], initBoard:[],
  mode:'puzzle',       // 'puzzle'|'edit'
  locked:false,        // 操作後ロック
  dragging:false, dragCell:null, heldDrop:null,
  history:[],
  moveCount:0,
  timeLimit:0,
  timerRunning:false, timerStart:0, timerElapsed:0, timerTick:null,
  combos:[],
  customDrop:'fire', customPainting:false,
  jinN:0, jinSelected:[],
  // 消去アニメ
  eraseQueue:[],       // [{row, cells:[{r,c,drop}], startTime}]
  eraseDoneRows:new Set(),  // 消去済みの行
  eraseRafId:null,
  eraseAlphas:{},      // key:"r,c" → alpha
  eraseScales:{},
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
let CS = 72; // セルサイズ

function resizeCanvas() {
  const maxW = Math.min(document.body.clientWidth - 24, 560);
  CS = Math.floor(maxW / G.cols);
  canvas.width  = CS * G.cols;
  canvas.height = CS * G.rows;
  canvas.style.width  = canvas.width  + 'px';
  canvas.style.height = canvas.height + 'px';
}

// =====================================================
// ドロップ描画（本家風SVG相当をCanvasで再現）
// =====================================================
function drawDrop(x, y, id, opts={}) {
  if (!id || !DROP[id]) return;
  const d = DROP[id];
  const {alpha=1, scale=1, lifted=false} = opts;
  const cx = x + CS/2, cy = y + CS/2;
  const R = CS * 0.44 * scale;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (d.shape === 'heart') {
    drawHeartDrop(cx, cy, R, d, lifted);
  } else {
    drawOrbDrop(cx, cy, R, d, lifted);
    drawOrbSymbol(cx, cy, R, id, d);
  }
  ctx.restore();
}

// -------- 球体ドロップ --------
function drawOrbDrop(cx, cy, R, d, lifted) {
  ctx.save();
  // グロー（浮き時）
  if (lifted) {
    const g = ctx.createRadialGradient(cx,cy,R*0.4,cx,cy,R*1.8);
    g.addColorStop(0, d.glow+'99');
    g.addColorStop(1, 'transparent');
    ctx.beginPath(); ctx.arc(cx,cy,R*1.8,0,Math.PI*2);
    ctx.fillStyle=g; ctx.fill();
  }
  // 本体：下部暗め→上部明るめの球体
  const body = ctx.createRadialGradient(cx-R*0.2, cy-R*0.25, R*0.05, cx, cy, R);
  body.addColorStop(0,   d.c1);
  body.addColorStop(0.5, d.c2);
  body.addColorStop(1,   d.c3);
  ctx.shadowColor = lifted ? d.glow : 'rgba(0,0,0,0.5)';
  ctx.shadowBlur  = lifted ? 14 : 4;
  ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2);
  ctx.fillStyle=body; ctx.fill();
  ctx.shadowBlur=0;
  // 上ハイライト白丸
  const hl = ctx.createRadialGradient(cx-R*0.3,cy-R*0.35,0, cx-R*0.15,cy-R*0.2,R*0.55);
  hl.addColorStop(0,'rgba(255,255,255,0.85)');
  hl.addColorStop(0.5,'rgba(255,255,255,0.2)');
  hl.addColorStop(1,'rgba(255,255,255,0)');
  ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2);
  ctx.fillStyle=hl; ctx.fill();
  // 縁
  ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2);
  ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1.2; ctx.stroke();
  ctx.restore();
}

// -------- 属性別シンボル --------
function drawOrbSymbol(cx, cy, R, id, d) {
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,0.7)'; ctx.shadowBlur=3;
  const s = R * 0.52; // シンボルサイズ

  switch(id) {
    case 'fire':    drawFire(ctx, cx, cy+R*0.1, s); break;
    case 'water':   drawWaterDrop(ctx, cx, cy+R*0.05, s); break;
    case 'wood':    drawLeaf(ctx, cx, cy+R*0.05, s); break;
    case 'light':   drawStar(ctx, cx, cy+R*0.05, s, 4); break;
    case 'dark':    drawCrescent(ctx, cx, cy, s); break;
    case 'poison':  drawSkull(ctx, cx, cy, s*0.95, d.c2); break;
    case 'mpoison': drawSkull(ctx, cx, cy, s*0.95, d.c2); break;
    case 'jammer':  drawX(ctx, cx, cy, s*0.7); break;
    case 'bomb':    drawBombIcon(ctx, cx, cy+R*0.05, s*0.85); break;
  }
  ctx.shadowBlur=0;
  ctx.restore();
}

function drawFire(ctx, cx, cy, s) {
  ctx.fillStyle='rgba(255,240,80,0.92)';
  ctx.beginPath();
  ctx.moveTo(cx, cy-s*0.9);
  ctx.bezierCurveTo(cx+s*0.7, cy-s*0.2, cx+s*0.5, cy+s*0.5, cx, cy+s*0.4);
  ctx.bezierCurveTo(cx-s*0.5, cy+s*0.5, cx-s*0.7, cy-s*0.2, cx, cy-s*0.9);
  ctx.fill();
  // 内側オレンジ
  ctx.fillStyle='rgba(255,120,20,0.7)';
  ctx.beginPath();
  ctx.moveTo(cx, cy-s*0.4);
  ctx.bezierCurveTo(cx+s*0.35, cy, cx+s*0.25, cy+s*0.4, cx, cy+s*0.4);
  ctx.bezierCurveTo(cx-s*0.25, cy+s*0.4, cx-s*0.35, cy, cx, cy-s*0.4);
  ctx.fill();
}

function drawWaterDrop(ctx, cx, cy, s) {
  ctx.fillStyle='rgba(200,240,255,0.88)';
  ctx.beginPath();
  ctx.moveTo(cx, cy-s*0.9);
  ctx.bezierCurveTo(cx+s*0.7, cy-s*0.1, cx+s*0.6, cy+s*0.6, cx, cy+s*0.6);
  ctx.bezierCurveTo(cx-s*0.6, cy+s*0.6, cx-s*0.7, cy-s*0.1, cx, cy-s*0.9);
  ctx.closePath(); ctx.fill();
}

function drawLeaf(ctx, cx, cy, s) {
  ctx.fillStyle='rgba(200,255,180,0.88)';
  ctx.beginPath();
  ctx.moveTo(cx, cy-s*0.85);
  ctx.bezierCurveTo(cx+s*0.85, cy-s*0.85, cx+s*0.85, cy+s*0.5, cx, cy+s*0.5);
  ctx.bezierCurveTo(cx-s*0.2, cy+s*0.1, cx-s*0.2, cy-s*0.4, cx, cy-s*0.85);
  ctx.fill();
  // 葉脈
  ctx.strokeStyle='rgba(100,200,80,0.6)'; ctx.lineWidth=1; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(cx, cy-s*0.85); ctx.lineTo(cx, cy+s*0.5); ctx.stroke();
}

function drawStar(ctx, cx, cy, s, n) {
  ctx.fillStyle='rgba(255,255,180,0.9)';
  ctx.beginPath();
  for (let i=0;i<n*2;i++) {
    const a = (i*Math.PI/n) - Math.PI/2;
    const r = i%2===0 ? s : s*0.4;
    const px=cx+r*Math.cos(a), py=cy+r*Math.sin(a);
    i===0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py);
  }
  ctx.closePath(); ctx.fill();
}

function drawCrescent(ctx, cx, cy, s) {
  ctx.fillStyle='rgba(230,200,255,0.9)';
  ctx.beginPath(); ctx.arc(cx, cy, s*0.7, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(80,20,140,0.85)';
  ctx.beginPath(); ctx.arc(cx+s*0.28, cy-s*0.1, s*0.58, 0, Math.PI*2); ctx.fill();
}

function drawSkull(ctx, cx, cy, s, bgColor) {
  // 頭蓋骨
  ctx.fillStyle='rgba(255,255,255,0.88)';
  ctx.beginPath(); ctx.ellipse(cx, cy-s*0.1, s*0.55, s*0.55, 0, 0, Math.PI*2); ctx.fill();
  // 顎
  ctx.beginPath();
  ctx.moveTo(cx-s*0.32, cy+s*0.3);
  ctx.lineTo(cx-s*0.32, cy+s*0.62);
  ctx.lineTo(cx+s*0.32, cy+s*0.62);
  ctx.lineTo(cx+s*0.32, cy+s*0.3);
  ctx.fill();
  // 目（黒丸）
  ctx.fillStyle='rgba(20,10,10,0.85)';
  ctx.beginPath(); ctx.ellipse(cx-s*0.22, cy-s*0.12, s*0.16, s*0.2, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx+s*0.22, cy-s*0.12, s*0.16, s*0.2, 0, 0, Math.PI*2); ctx.fill();
  // 鼻
  ctx.fillStyle='rgba(20,10,10,0.7)';
  ctx.beginPath(); ctx.ellipse(cx, cy+s*0.12, s*0.1, s*0.1, 0, 0, Math.PI*2); ctx.fill();
  // 歯
  ctx.fillStyle='rgba(80,60,60,0.6)';
  ctx.beginPath(); ctx.rect(cx-s*0.27, cy+s*0.36, s*0.17, s*0.18); ctx.fill();
  ctx.beginPath(); ctx.rect(cx+s*0.1,  cy+s*0.36, s*0.17, s*0.18); ctx.fill();
}

function drawX(ctx, cx, cy, s) {
  ctx.strokeStyle='rgba(255,255,255,0.9)';
  ctx.lineWidth=s*0.35; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(cx-s,cy-s); ctx.lineTo(cx+s,cy+s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+s,cy-s); ctx.lineTo(cx-s,cy+s); ctx.stroke();
}

function drawBombIcon(ctx, cx, cy, s) {
  // 爆弾本体（黒丸）
  ctx.fillStyle='rgba(40,40,40,0.9)';
  ctx.beginPath(); ctx.arc(cx, cy+s*0.1, s*0.7, 0, Math.PI*2); ctx.fill();
  // 光沢
  ctx.fillStyle='rgba(120,120,120,0.5)';
  ctx.beginPath(); ctx.ellipse(cx-s*0.2, cy-s*0.25, s*0.22, s*0.16, -0.5, 0, Math.PI*2); ctx.fill();
  // 導火線
  ctx.strokeStyle='rgba(200,150,50,0.9)'; ctx.lineWidth=s*0.14; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(cx+s*0.4, cy-s*0.3); ctx.bezierCurveTo(cx+s*0.7,cy-s*0.8,cx+s*0.2,cy-s*1.1,cx+s*0.05,cy-s*0.8); ctx.stroke();
  // 火花
  ctx.fillStyle='rgba(255,200,20,0.9)';
  ctx.beginPath(); ctx.arc(cx+s*0.05, cy-s*0.82, s*0.14, 0, Math.PI*2); ctx.fill();
}

// -------- 回復（ハート型）ドロップ --------
function drawHeartDrop(cx, cy, R, d, lifted) {
  ctx.save();
  const hw = R*0.95, hh = R*0.9, rad = R*0.25;

  // グロー
  if (lifted) {
    const g = ctx.createRadialGradient(cx,cy,R*0.4,cx,cy,R*1.8);
    g.addColorStop(0,d.glow+'99'); g.addColorStop(1,'transparent');
    rrectPath(ctx, cx-hw*1.2, cy-hh*1.2, hw*2.4, hh*2.4, rad+6);
    ctx.fillStyle=g; ctx.fill();
  }

  // 本体
  const body = ctx.createLinearGradient(cx-hw, cy-hh, cx+hw, cy+hh);
  body.addColorStop(0, d.c1); body.addColorStop(0.5, d.c2); body.addColorStop(1, d.c3);
  ctx.shadowColor = lifted ? d.glow : 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = lifted ? 14 : 4;
  rrectPath(ctx, cx-hw, cy-hh, hw*2, hh*2, rad);
  ctx.fillStyle=body; ctx.fill();
  ctx.shadowBlur=0;

  // ハイライト
  const hl = ctx.createLinearGradient(cx-hw, cy-hh, cx-hw, cy);
  hl.addColorStop(0,'rgba(255,255,255,0.72)');
  hl.addColorStop(1,'rgba(255,255,255,0)');
  rrectPath(ctx, cx-hw+2, cy-hh+2, hw*2-4, hh-2, rad*0.7);
  ctx.fillStyle=hl; ctx.fill();

  // 縁
  rrectPath(ctx, cx-hw, cy-hh, hw*2, hh*2, rad);
  ctx.strokeStyle='rgba(0,0,0,0.35)'; ctx.lineWidth=1.2; ctx.stroke();

  // ハートマーク
  drawHeartShape(ctx, cx, cy, R*0.42);
  ctx.restore();
}

function rrectPath(ctx, x,y,w,h,r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
}

function drawHeartShape(ctx, cx, cy, s) {
  ctx.fillStyle='rgba(255,255,255,0.88)';
  ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=3;
  ctx.beginPath();
  ctx.moveTo(cx, cy+s*0.35);
  ctx.bezierCurveTo(cx-s*1.1, cy-s*0.2, cx-s*1.1, cy-s*1.0, cx, cy-s*0.38);
  ctx.bezierCurveTo(cx+s*1.1, cy-s*1.0, cx+s*1.1, cy-s*0.2, cx, cy+s*0.35);
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur=0;
}

// =====================================================
// レンダリング
// =====================================================
let dragPixel=null, rafId=null;

function render() {
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // 背景
  const bg=ctx.createLinearGradient(0,0,canvas.width,canvas.height);
  bg.addColorStop(0,'#0c1424'); bg.addColorStop(1,'#101c34');
  ctx.fillStyle=bg; ctx.beginPath(); ctx.roundRect(0,0,canvas.width,canvas.height,10); ctx.fill();

  // グリッド
  ctx.strokeStyle='rgba(255,255,255,0.07)'; ctx.lineWidth=1;
  for(let r=0;r<=G.rows;r++){ctx.beginPath();ctx.moveTo(0,r*CS);ctx.lineTo(canvas.width,r*CS);ctx.stroke();}
  for(let c=0;c<=G.cols;c++){ctx.beginPath();ctx.moveTo(c*CS,0);ctx.lineTo(c*CS,canvas.height);ctx.stroke();}

  // 編集モードオーバーレイ
  if(G.mode==='edit'){
    ctx.fillStyle='rgba(255,200,0,0.04)'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.setLineDash([3,3]); ctx.strokeStyle='rgba(255,200,0,0.3)'; ctx.lineWidth=1;
    for(let r=0;r<G.rows;r++) for(let c=0;c<G.cols;c++) ctx.strokeRect(c*CS+0.5,r*CS+0.5,CS-1,CS-1);
    ctx.setLineDash([]);
  }

  // 再生軌跡
  if(G.replayMode && G.showTrail && G.replayStep>0) drawTrail();

  // ドロップ描画
  for(let r=0;r<G.rows;r++) {
    for(let c=0;c<G.cols;c++) {
      const isHeld=G.dragging&&G.dragCell&&G.dragCell.r===r&&G.dragCell.c===c;
      if(isHeld) continue;
      const key=`${r},${c}`;
      const drop=G.board[r][c];
      if(!drop) continue;
      // 消去アニメ中？
      if(G.eraseAlphas[key]!==undefined) {
        drawDrop(c*CS,r*CS,G.eraseDrops[key],{alpha:G.eraseAlphas[key],scale:G.eraseScales[key]});
      } else {
        drawDrop(c*CS,r*CS,drop);
      }
    }
  }

  // ドラッグ中（最前面、浮く）
  if(G.dragging&&dragPixel&&G.heldDrop) {
    drawDrop(dragPixel.x-CS/2, dragPixel.y-CS/2, G.heldDrop, {scale:1.18,lifted:true});
  }
}

function drawTrail() {
  const path=G.replayPaths.slice(0,G.replayStep+1);
  if(path.length<2) return;
  ctx.save();
  ctx.strokeStyle='rgba(255,220,40,0.8)'; ctx.lineWidth=CS*0.1;
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.shadowColor='rgba(255,200,0,0.5)'; ctx.shadowBlur=8;
  ctx.beginPath();
  ctx.moveTo(path[0].c*CS+CS/2, path[0].r*CS+CS/2);
  for(let i=1;i<path.length;i++) ctx.lineTo(path[i].c*CS+CS/2, path[i].r*CS+CS/2);
  ctx.stroke();
  ctx.shadowBlur=0; ctx.fillStyle='rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(path[0].c*CS+CS/2,path[0].r*CS+CS/2,CS*0.1,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function sched(){if(rafId)cancelAnimationFrame(rafId);rafId=requestAnimationFrame(()=>{rafId=null;render();});}

// =====================================================
// ボード生成
// =====================================================
function cloneBoard(b){return b.map(r=>r.slice());}
function rndDrop(drops){return drops[Math.floor(Math.random()*drops.length)];}
function shuffle(a){const s=a.slice();for(let i=s.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[s[i],s[j]]=[s[j],s[i]];}return s;}
function makeBoard(drops){return Array.from({length:G.rows},()=>Array.from({length:G.cols},()=>rndDrop(drops)));}

function newGame(drops){
  stopTimer();resetTimer();
  G.board=makeBoard(drops||STANDARD);
  G.initBoard=cloneBoard(G.board);
  G.history=[];G.moveCount=0;G.combos=[];G.locked=false;
  cancelErase();updateMoveUI();updateComboUI();sched();
}
function resetGame(){
  stopTimer();resetTimer();
  G.board=cloneBoard(G.initBoard);
  G.history=[];G.moveCount=0;G.combos=[];G.locked=false;
  cancelErase();updateMoveUI();updateComboUI();sched();
}

// =====================================================
// 入力処理
// =====================================================
function getPos(e){
  const rect=canvas.getBoundingClientRect();
  const sx=canvas.width/rect.width, sy=canvas.height/rect.height;
  const src=e.touches?e.touches[0]:e;
  return{x:(src.clientX-rect.left)*sx, y:(src.clientY-rect.top)*sy};
}
function toCell(px,py){
  const c=Math.floor(px/CS),r=Math.floor(py/CS);
  if(r<0||r>=G.rows||c<0||c>=G.cols)return null;
  return{r,c};
}

canvas.addEventListener('mousedown', onStart,false);
canvas.addEventListener('touchstart',onStart,{passive:false});
canvas.addEventListener('mousemove', onMove,false);
canvas.addEventListener('touchmove', onMove,{passive:false});
canvas.addEventListener('mouseup',   onEnd,false);
canvas.addEventListener('touchend',  onEnd,false);
canvas.addEventListener('mouseleave',onEnd,false);

function onStart(e){
  e.preventDefault();
  if(G.replayMode) return;
  const pos=getPos(e);
  const cell=toCell(pos.x,pos.y);
  if(!cell) return;

  // 編集モード
  if(G.mode==='edit'){
    G.customPainting=true;
    G.board[cell.r][cell.c]=G.customDrop;
    sched(); return;
  }

  // ロック中は操作不可
  if(G.locked) return;

  cancelErase();
  G.dragging=true;
  G.dragCell={...cell};
  G.heldDrop=G.board[cell.r][cell.c];
  G.board[cell.r][cell.c]=null;
  dragPixel={x:pos.x,y:pos.y};
  if(!G.timerRunning) startTimer();
  sched();
}

function onMove(e){
  e.preventDefault();
  const pos=getPos(e);

  if(G.customPainting){
    const cell=toCell(pos.x,pos.y);
    if(cell){G.board[cell.r][cell.c]=G.customDrop;sched();}
    return;
  }
  if(!G.dragging) return;
  dragPixel={x:pos.x,y:pos.y};

  const cell=toCell(pos.x,pos.y);
  if(cell&&(cell.r!==G.dragCell.r||cell.c!==G.dragCell.c)){
    const swapped=G.board[cell.r][cell.c];
    G.board[G.dragCell.r][G.dragCell.c]=swapped;
    G.board[cell.r][cell.c]=null;
    G.history.push({from:{...G.dragCell},to:{...cell},swapped});
    G.dragCell={...cell};
    G.moveCount++;
    updateMoveUI();
  }
  sched();
}

function onEnd(e){
  if(G.customPainting){
    G.customPainting=false;
    calcCombos(); sched(); return;
  }
  if(!G.dragging) return;
  G.dragging=false;
  if(G.dragCell) G.board[G.dragCell.r][G.dragCell.c]=G.heldDrop;
  G.heldDrop=null; G.dragCell=null; dragPixel=null;

  // 手を離したらタイマー停止＋ロック（コンボ表示中は操作不可）
  stopTimer();
  G.locked=true;
  calcCombos();
  sched();
}

// =====================================================
// コンボ計算
// =====================================================
function calcCombos(){
  const {rows,cols,board}=G;
  const matched=Array.from({length:rows},()=>Array(cols).fill(false));
  for(let r=0;r<rows;r++) for(let c=0;c<cols-2;c++){
    const t=board[r][c]; if(!t) continue;
    if(board[r][c+1]===t&&board[r][c+2]===t){
      let e=c+2; while(e+1<cols&&board[r][e+1]===t)e++;
      for(let i=c;i<=e;i++) matched[r][i]=true;
    }
  }
  for(let c=0;c<cols;c++) for(let r=0;r<rows-2;r++){
    const t=board[r][c]; if(!t) continue;
    if(board[r+1][c]===t&&board[r+2][c]===t){
      let e=r+2; while(e+1<rows&&board[e+1][c]===t)e++;
      for(let i=r;i<=e;i++) matched[i][c]=true;
    }
  }
  const visited=Array.from({length:rows},()=>Array(cols).fill(false));
  const combos=[];
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
    if(!matched[r][c]||visited[r][c]) continue;
    const type=board[r][c],cells=[];
    const stack=[{r,c}];
    while(stack.length){
      const{r:cr,c:cc}=stack.pop();
      if(cr<0||cr>=rows||cc<0||cc>=cols||visited[cr][cc]||!matched[cr][cc]||board[cr][cc]!==type)continue;
      visited[cr][cc]=true; cells.push({r:cr,c:cc});
      stack.push({r:cr+1,c:cc},{r:cr-1,c:cc},{r:cr,c:cc+1},{r:cr,c:cc-1});
    }
    combos.push({type,cells});
  }
  G.combos=combos;
  updateComboUI();
  if(combos.length>0) startEraseAnimation(combos);
  else { G.locked=false; } // コンボなしなら即アンロック
}

// =====================================================
// 消去アニメーション：下の行から順に
// =====================================================
let eraseDrops={}; // "r,c" → drop id （消去用）
G.eraseDrops=eraseDrops;

function cancelErase(){
  if(G.eraseRafId){cancelAnimationFrame(G.eraseRafId);G.eraseRafId=null;}
  G.eraseAlphas={}; G.eraseScales={}; G.eraseDrops={};
  G.eraseQueue=[];
}

function startEraseAnimation(combos){
  cancelErase();

  // 全消去セルを収集、ドロップ情報を保存
  const allCells=combos.flatMap(combo=>combo.cells.map(cell=>({...cell,drop:combo.type})));

  // 行ごとにグループ化（大きい行=下が先）
  const rowMap={};
  allCells.forEach(({r,c,drop})=>{
    if(!rowMap[r]) rowMap[r]=[];
    rowMap[r].push({r,c,drop});
  });
  const sortedRows=Object.keys(rowMap).map(Number).sort((a,b)=>b-a);

  // 消去対象をeraseAlphasに登録
  allCells.forEach(({r,c,drop})=>{
    const key=`${r},${c}`;
    G.eraseAlphas[key]=1;
    G.eraseScales[key]=1;
    G.eraseDrops[key]=drop;
  });

  const DELAY_PER_ROW=90;   // 行間隔(ms)
  const FADE_DURATION=200;  // フェード時間(ms)

  // 各行をタイムアウトで順番にフェード
  let maxDelay=0;
  sortedRows.forEach((row,idx)=>{
    const delay=idx*DELAY_PER_ROW;
    maxDelay=delay+FADE_DURATION;
    const cells=rowMap[row];
    setTimeout(()=>{
      const start=performance.now();
      function fadeRow(now){
        const t=Math.min((now-start)/FADE_DURATION,1);
        cells.forEach(({r,c})=>{
          const key=`${r},${c}`;
          G.eraseAlphas[key]=1-t;
          G.eraseScales[key]=1-t*0.35;
        });
        sched();
        if(t<1){G.eraseRafId=requestAnimationFrame(fadeRow);}
        else{
          // この行の消去完了
          cells.forEach(({r,c})=>{ delete G.eraseAlphas[`${r},${c}`]; delete G.eraseScales[`${r},${c}`]; delete G.eraseDrops[`${r},${c}`]; });
          sched();
        }
      }
      G.eraseRafId=requestAnimationFrame(fadeRow);
    }, delay);
  });

  // 全消去完了後にアンロック
  setTimeout(()=>{ G.locked=false; sched(); }, maxDelay+50);
}

// =====================================================
// UI更新
// =====================================================
function updateMoveUI(){ document.getElementById('move-count').textContent=G.moveCount; }
function updateComboUI(){
  document.getElementById('combo-count').textContent=G.combos.length;
  const list=document.getElementById('combo-list');
  list.innerHTML='';
  G.combos.forEach(combo=>{
    const d=DROP[combo.type];
    const b=document.createElement('div');
    b.className='combo-badge';
    b.innerHTML=`<div class="badge-dot" style="background:${d.c2}"></div><span>${d.name} ${combo.cells.length}個</span>`;
    list.appendChild(b);
  });
}

// =====================================================
// タイマー
// =====================================================
function startTimer(){
  G.timerRunning=true;
  G.timerStart=Date.now()-G.timerElapsed*1000;
  G.timerTick=setInterval(tickTimer,100);
}
function tickTimer(){
  G.timerElapsed=(Date.now()-G.timerStart)/1000;
  document.getElementById('timer-display').textContent=G.timerElapsed.toFixed(1);
  const bar=document.getElementById('timer-bar');
  if(G.timeLimit>0){
    const pct=Math.max(0,1-G.timerElapsed/G.timeLimit);
    bar.style.width=(pct*100)+'%';
    bar.classList.toggle('warning',pct<0.3);
    if(G.timerElapsed>=G.timeLimit){stopTimer();document.getElementById('timer-display').style.color='var(--danger)';}
  } else {bar.style.width='100%';}
}
function stopTimer(){clearInterval(G.timerTick);G.timerRunning=false;}
function resetTimer(){
  stopTimer();G.timerElapsed=0;
  document.getElementById('timer-display').textContent='0.0';
  document.getElementById('timer-display').style.color='';
  document.getElementById('timer-bar').style.width='100%';
  document.getElementById('timer-bar').classList.remove('warning');
}

// タイマークリックで制限時間変更
document.getElementById('timer-display').addEventListener('click',()=>{
  const val=prompt('制限時間（秒）を入力。0で無制限。',G.timeLimit);
  if(val===null)return;
  const n=Math.max(0,parseInt(val)||0);
  G.timeLimit=n;
  const inp=document.getElementById('time-limit-input');
  if(inp)inp.value=n;
  resetTimer();
});

// =====================================================
// ボタン
// =====================================================
document.getElementById('btn-new-random').addEventListener('click',()=>newGame(STANDARD));
document.getElementById('btn-reset').addEventListener('click',resetGame);
document.getElementById('btn-undo').addEventListener('click',()=>{
  if(!G.history.length||G.locked)return;
  const last=G.history.pop();
  G.board[last.from.r][last.from.c]=G.board[last.to.r][last.to.c];
  G.board[last.to.r][last.to.c]=last.swapped;
  G.moveCount=Math.max(0,G.moveCount-1);
  updateMoveUI();calcCombos();sched();
});

// 設定パネル
document.getElementById('btn-settings').addEventListener('click',()=>{
  document.getElementById('settings-panel').classList.remove('hidden');
  document.getElementById('settings-overlay').classList.remove('hidden');
});
function closeSettings(){
  document.getElementById('settings-panel').classList.add('hidden');
  document.getElementById('settings-overlay').classList.add('hidden');
}
document.getElementById('btn-settings-close').addEventListener('click',closeSettings);
document.getElementById('settings-overlay').addEventListener('click',closeSettings);
document.querySelectorAll('.size-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.size-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    G.cols=parseInt(btn.dataset.cols);G.rows=parseInt(btn.dataset.rows);
    resizeCanvas();newGame();
  });
});
document.getElementById('time-limit-input').addEventListener('change',e=>{
  G.timeLimit=Math.max(0,parseInt(e.target.value)||0);resetTimer();
});

// モード切替
document.getElementById('btn-mode-toggle').addEventListener('click',()=>{
  G.mode=G.mode==='puzzle'?'edit':'puzzle';
  const btn=document.getElementById('btn-mode-toggle');
  btn.dataset.mode=G.mode;
  btn.textContent=G.mode==='edit'?'🎮 パズルモードへ戻す':'✏ 盤面編集モード';
  document.getElementById('custom-palette').classList.toggle('hidden',G.mode!=='edit');
  if(G.mode==='edit'){stopTimer();if(G.replayMode)endReplay();}
  sched();
});

// 陣
function buildJinPicker(n){
  G.jinN=n;G.jinSelected=[];
  const list=document.getElementById('jin-color-list');
  list.innerHTML='';
  document.getElementById('jin-need-count').textContent=n;
  STANDARD.forEach(id=>{
    const d=DROP[id];
    const chip=document.createElement('div');
    chip.className='jin-color-chip';
    chip.style.background=`radial-gradient(circle at 35% 35%,${d.c1},${d.c2} 55%,${d.c3})`;
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
        G.jinSelected.push(id);chip.classList.add('selected');
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

// パレット
function buildPalette(){
  const wrap=document.getElementById('palette-drops');
  wrap.innerHTML='';
  ALL_DROPS.forEach(id=>{
    const d=DROP[id];
    const wrap2=document.createElement('div');
    wrap2.style.cssText='display:flex;flex-direction:column;align-items:center;gap:3px';
    const chip=document.createElement('div');
    chip.className='palette-drop'+(id===G.customDrop?' selected':'');
    chip.dataset.id=id;
    const isHeart=d.shape==='heart';
    chip.style.cssText=`width:44px;height:${isHeart?'38px':'44px'};border-radius:${isHeart?'8px':'50%'};background:radial-gradient(circle at 35% 35%,${d.c1},${d.c2} 55%,${d.c3});cursor:pointer;border:3px solid transparent;transition:all .15s;flex-shrink:0`;
    chip.addEventListener('click',()=>{
      G.customDrop=id;
      document.querySelectorAll('.palette-drop').forEach(c=>c.classList.remove('selected'));
      chip.classList.add('selected');
    });
    const label=document.createElement('div');
    label.style.cssText='font-size:.6rem;color:var(--text2);white-space:nowrap';
    label.textContent=d.name;
    wrap2.appendChild(chip);
    wrap2.appendChild(label);
    wrap.appendChild(wrap2);
  });
}

// 再生
document.getElementById('btn-replay').addEventListener('click',startReplay);
function startReplay(){
  if(!G.history.length||G.mode==='edit')return;
  const boards=[cloneBoard(G.initBoard)];
  const paths=[{r:G.history[0].from.r,c:G.history[0].from.c}];
  const tmp=cloneBoard(G.initBoard);
  for(const mv of G.history){
    const t=tmp[mv.to.r][mv.to.c];
    tmp[mv.to.r][mv.to.c]=tmp[mv.from.r][mv.from.c];
    tmp[mv.from.r][mv.from.c]=t;
    boards.push(cloneBoard(tmp));
    paths.push({r:mv.to.r,c:mv.to.c});
  }
  G.replayBoards=boards;G.replayPaths=paths;
  G.replayMode=true;G.replayStep=0;G.replayPlaying=false;
  document.getElementById('replay-bar').classList.remove('hidden');
  updateReplayStep();
}
function updateReplayStep(){
  G.board=cloneBoard(G.replayBoards[G.replayStep]);
  const max=G.replayBoards.length-1;
  document.getElementById('rp-step-label').textContent=`${G.replayStep}/${max}`;
  sched();
}
function endReplay(){
  clearInterval(G.replayIntervalId);G.replayPlaying=false;G.replayMode=false;
  document.getElementById('replay-bar').classList.add('hidden');
  document.getElementById('btn-rp-playpause').textContent='▶';
  G.board=cloneBoard(G.replayBoards[G.replayBoards.length-1]||G.initBoard);
  calcCombos();sched();
}
document.getElementById('btn-rp-prev').addEventListener('click',()=>{G.replayStep=Math.max(0,G.replayStep-1);updateReplayStep();});
document.getElementById('btn-rp-next').addEventListener('click',()=>{G.replayStep=Math.min(G.replayBoards.length-1,G.replayStep+1);updateReplayStep();});
document.getElementById('btn-rp-playpause').addEventListener('click',()=>{
  G.replayPlaying=!G.replayPlaying;
  document.getElementById('btn-rp-playpause').textContent=G.replayPlaying?'⏸':'▶';
  if(G.replayPlaying){
    G.replayIntervalId=setInterval(()=>{
      if(G.replayStep>=G.replayBoards.length-1){G.replayPlaying=false;clearInterval(G.replayIntervalId);document.getElementById('btn-rp-playpause').textContent='▶';return;}
      G.replayStep++;updateReplayStep();
    },100);
  }else{clearInterval(G.replayIntervalId);}
});
document.getElementById('btn-rp-close').addEventListener('click',endReplay);
document.getElementById('rp-trail-check').addEventListener('change',e=>{G.showTrail=e.target.checked;sched();});

window.addEventListener('resize',()=>{resizeCanvas();sched();});

// 初期化
buildPalette();
resizeCanvas();
newGame();
