'use strict';
// =====================================================
// ドロップ定義（画像ベース）
// =====================================================
const DROP_IDS = ['fire','water','wood','light','dark','heal','poison','mpoison','jammer','bomb'];
const DROP_NAME = {fire:'火',water:'水',wood:'木',light:'光',dark:'闇',heal:'回復',poison:'毒',mpoison:'猛毒',jammer:'邪魔',bomb:'爆弾'};
const DROP_COLOR = {fire:'#dd3300',water:'#1166dd',wood:'#22aa33',light:'#ddaa00',dark:'#8811cc',heal:'#ee4488',poison:'#88bb00',mpoison:'#aa00dd',jammer:'#7777aa',bomb:'#cc6600'};
const STANDARD = ['fire','water','wood','light','dark','heal'];

// 画像ロード
const IMGS = {};
let imgsLoaded = 0;
DROP_IDS.forEach(id => {
  const img = new Image();
  img.onload = () => { imgsLoaded++; if(imgsLoaded===DROP_IDS.length) initGame(); };
  img.onerror = () => { imgsLoaded++; if(imgsLoaded===DROP_IDS.length) initGame(); }; // 失敗時もカウント
  img.src = `orbs/${id}.png`;
  IMGS[id] = img;
});

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
  eraseState: {},   // key:"r,c" → {alpha,scale,drop}
  eraseTimers: [],  // setTimeoutのID群
  eraseRaf: null,
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
// ドロップ描画（PNG画像）
// =====================================================
function drawDrop(x, y, id, opts={}) {
  if (!id) return;
  const {alpha=1, scale=1, lifted=false} = opts;
  const img = IMGS[id];
  const cx = x + CS/2, cy = y + CS/2;
  const sz = CS * scale;
  const dx = cx - sz/2, dy = cy - sz/2;

  ctx.save();
  ctx.globalAlpha = alpha;

  if (lifted) {
    // 浮いてる時の影・グロー
    ctx.shadowColor = DROP_COLOR[id] + 'cc';
    ctx.shadowBlur = 18;
  }

  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, dx, dy, sz, sz);
  } else {
    // 画像未ロードのフォールバック
    ctx.fillStyle = DROP_COLOR[id] || '#888';
    ctx.beginPath();
    ctx.arc(cx, cy, sz*0.44, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.font = `bold ${Math.round(sz*0.22)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(DROP_NAME[id]||'?', cx, cy);
  }

  ctx.restore();
}

// =====================================================
// レンダリング
// =====================================================
let dragPixel = null, rafId = null;

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 背景
  const bg = ctx.createLinearGradient(0,0,canvas.width,canvas.height);
  bg.addColorStop(0,'#0c1424'); bg.addColorStop(1,'#101c34');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(0,0,canvas.width,canvas.height,10); ctx.fill();

  // グリッド
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
  for(let r=0;r<=G.rows;r++){ctx.beginPath();ctx.moveTo(0,r*CS);ctx.lineTo(canvas.width,r*CS);ctx.stroke();}
  for(let c=0;c<=G.cols;c++){ctx.beginPath();ctx.moveTo(c*CS,0);ctx.lineTo(c*CS,canvas.height);ctx.stroke();}

  // 編集モードオーバーレイ
  if(G.mode==='edit') {
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
      const isHeld = G.dragging && G.dragCell && G.dragCell.r===r && G.dragCell.c===c;
      if(isHeld) continue;
      const key = `${r},${c}`;
      const es = G.eraseState[key];
      if(es) {
        // 消去アニメ中
        drawDrop(c*CS, r*CS, es.drop, {alpha:es.alpha, scale:es.scale});
      } else {
        const drop = G.board[r][c];
        if(drop) drawDrop(c*CS, r*CS, drop);
      }
    }
  }

  // ドラッグ中（最前面、浮く）
  if(G.dragging && dragPixel && G.heldDrop) {
    drawDrop(dragPixel.x - CS/2, dragPixel.y - CS/2, G.heldDrop, {scale:1.15, lifted:true});
  }
}

function drawTrail() {
  const path = G.replayPaths.slice(0, G.replayStep+1);
  if(path.length < 2) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,220,40,0.82)'; ctx.lineWidth = CS*0.1;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(255,200,0,0.5)'; ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(path[0].c*CS+CS/2, path[0].r*CS+CS/2);
  for(let i=1;i<path.length;i++) ctx.lineTo(path[i].c*CS+CS/2, path[i].r*CS+CS/2);
  ctx.stroke();
  ctx.shadowBlur=0; ctx.fillStyle='rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(path[0].c*CS+CS/2, path[0].r*CS+CS/2, CS*0.1, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

function sched() {
  if(rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(()=>{ rafId=null; render(); });
}

// =====================================================
// ボード
// =====================================================
function cloneBoard(b) { return b.map(r=>r.slice()); }
function rndDrop(drops) { return drops[Math.floor(Math.random()*drops.length)]; }
function makeBoard(drops) { return Array.from({length:G.rows},()=>Array.from({length:G.cols},()=>rndDrop(drops))); }

function newGame(drops) {
  stopTimer(); resetTimer();
  G.board = makeBoard(drops||STANDARD);
  G.initBoard = cloneBoard(G.board);
  G.history=[]; G.moveCount=0; G.combos=[]; G.locked=false;
  cancelErase();
  updateMoveUI(); updateComboUI(); sched();
}
function resetGame() {
  stopTimer(); resetTimer();
  G.board = cloneBoard(G.initBoard);
  G.history=[]; G.moveCount=0; G.combos=[]; G.locked=false;
  cancelErase();
  updateMoveUI(); updateComboUI(); sched();
}

// =====================================================
// 入力
// =====================================================
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width/rect.width, sy = canvas.height/rect.height;
  const src = e.touches ? e.touches[0] : e;
  return {x:(src.clientX-rect.left)*sx, y:(src.clientY-rect.top)*sy};
}
function toCell(px,py) {
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
  if(G.replayMode) return;
  const pos = getPos(e);
  const cell = toCell(pos.x, pos.y);
  if(!cell) return;

  if(G.mode==='edit') {
    G.customPainting = true;
    G.board[cell.r][cell.c] = G.customDrop;
    sched(); return;
  }
  if(G.locked) return;

  cancelErase();
  G.dragging = true;
  G.dragCell = {...cell};
  G.heldDrop = G.board[cell.r][cell.c];
  G.board[cell.r][cell.c] = null;
  dragPixel = {x:pos.x, y:pos.y};
  if(!G.timerRunning) startTimer();
  sched();
}

function onMove(e) {
  e.preventDefault();
  const pos = getPos(e);

  if(G.customPainting) {
    const cell = toCell(pos.x, pos.y);
    if(cell) { G.board[cell.r][cell.c]=G.customDrop; sched(); }
    return;
  }
  if(!G.dragging) return;
  dragPixel = {x:pos.x, y:pos.y};

  const cell = toCell(pos.x, pos.y);
  if(cell && (cell.r!==G.dragCell.r || cell.c!==G.dragCell.c)) {
    const swapped = G.board[cell.r][cell.c];
    G.board[G.dragCell.r][G.dragCell.c] = swapped;
    G.board[cell.r][cell.c] = null;
    G.history.push({from:{...G.dragCell}, to:{...cell}, swapped});
    G.dragCell = {...cell};
    G.moveCount++;
    updateMoveUI();
  }
  sched();
}

function onEnd(e) {
  if(G.customPainting) {
    G.customPainting = false;
    calcCombos(); sched(); return;
  }
  if(!G.dragging) return;
  G.dragging = false;
  if(G.dragCell) G.board[G.dragCell.r][G.dragCell.c] = G.heldDrop;
  G.heldDrop = null; G.dragCell = null; dragPixel = null;

  stopTimer();
  G.locked = true;
  calcCombos(); sched();
}

// =====================================================
// コンボ計算
// =====================================================
function calcCombos() {
  const {rows,cols,board} = G;
  const matched = Array.from({length:rows},()=>Array(cols).fill(false));

  // 横3連以上
  for(let r=0;r<rows;r++) {
    for(let c=0;c<cols-2;c++) {
      const t=board[r][c]; if(!t) continue;
      if(board[r][c+1]===t && board[r][c+2]===t) {
        let e=c+2; while(e+1<cols&&board[r][e+1]===t) e++;
        for(let i=c;i<=e;i++) matched[r][i]=true;
      }
    }
  }
  // 縦3連以上
  for(let c=0;c<cols;c++) {
    for(let r=0;r<rows-2;r++) {
      const t=board[r][c]; if(!t) continue;
      if(board[r+1][c]===t && board[r+2][c]===t) {
        let e=r+2; while(e+1<rows&&board[e+1][c]===t) e++;
        for(let i=r;i<=e;i++) matched[i][c]=true;
      }
    }
  }

  // FloodFillでグループ化
  const visited = Array.from({length:rows},()=>Array(cols).fill(false));
  const combos = [];
  for(let r=0;r<rows;r++) {
    for(let c=0;c<cols;c++) {
      if(!matched[r][c]||visited[r][c]) continue;
      const type=board[r][c], cells=[];
      const stack=[{r,c}];
      while(stack.length) {
        const {r:cr,c:cc}=stack.pop();
        if(cr<0||cr>=rows||cc<0||cc>=cols||visited[cr][cc]||!matched[cr][cc]||board[cr][cc]!==type) continue;
        visited[cr][cc]=true; cells.push({r:cr,c:cc});
        stack.push({r:cr+1,c:cc},{r:cr-1,c:cc},{r:cr,c:cc+1},{r:cr,c:cc-1});
      }
      combos.push({type,cells});
    }
  }

  G.combos = combos;
  updateComboUI();
  if(combos.length>0) {
    startEraseAnim(combos);
  } else {
    G.locked = false; // コンボなし→即アンロック
  }
}

// =====================================================
// 消去アニメーション：下の行から順番に消える
// =====================================================
function cancelErase() {
  G.eraseTimers.forEach(id => clearTimeout(id));
  G.eraseTimers = [];
  if(G.eraseRaf) { cancelAnimationFrame(G.eraseRaf); G.eraseRaf=null; }
  G.eraseState = {};
}

function startEraseAnim(combos) {
  cancelErase();

  // 全消去セルを収集
  const allCells = combos.flatMap(combo =>
    combo.cells.map(cell => ({r:cell.r, c:cell.c, drop:combo.type}))
  );

  // 行でグループ化、大きい行（下）から順に
  const rowMap = {};
  allCells.forEach(({r,c,drop}) => {
    if(!rowMap[r]) rowMap[r]=[];
    rowMap[r].push({r,c,drop});
  });
  const sortedRows = Object.keys(rowMap).map(Number).sort((a,b)=>b-a);

  // 全セルをeraseStateに登録（最初は非表示）
  allCells.forEach(({r,c,drop}) => {
    G.eraseState[`${r},${c}`] = {alpha:1, scale:1, drop};
  });

  const DELAY = 100;   // 行間の遅延ms
  const FADE  = 220;   // フェード時間ms

  // rafによる継続的な再描画
  function animLoop() {
    sched();
    const anyActive = Object.keys(G.eraseState).length > 0;
    if(anyActive) G.eraseRaf = requestAnimationFrame(animLoop);
  }
  G.eraseRaf = requestAnimationFrame(animLoop);

  let maxEnd = 0;
  sortedRows.forEach((row, idx) => {
    const delay = idx * DELAY;
    const end = delay + FADE;
    if(end > maxEnd) maxEnd = end;

    const tid = setTimeout(() => {
      const rowCells = rowMap[row];
      const start = performance.now();

      function fadeStep(now) {
        const t = Math.min((now-start)/FADE, 1);
        rowCells.forEach(({r,c}) => {
          const key = `${r},${c}`;
          if(G.eraseState[key]) {
            G.eraseState[key].alpha = 1 - t;
            G.eraseState[key].scale = 1 - t*0.3;
          }
        });
        if(t < 1) {
          requestAnimationFrame(fadeStep);
        } else {
          // この行の消去完了 → eraseStateから削除
          rowCells.forEach(({r,c}) => delete G.eraseState[`${r},${c}`]);
        }
      }
      requestAnimationFrame(fadeStep);
    }, delay);
    G.eraseTimers.push(tid);
  });

  // 全消去完了後にアンロック
  const unlockTid = setTimeout(() => {
    G.locked = false;
    G.eraseState = {};
    if(G.eraseRaf) { cancelAnimationFrame(G.eraseRaf); G.eraseRaf=null; }
    sched();
  }, maxEnd + 80);
  G.eraseTimers.push(unlockTid);
}

// =====================================================
// UI
// =====================================================
function updateMoveUI() {
  document.getElementById('move-count').textContent = G.moveCount;
}
function updateComboUI() {
  document.getElementById('combo-count').textContent = G.combos.length;
  const list = document.getElementById('combo-list');
  list.innerHTML = '';
  G.combos.forEach(combo => {
    const b = document.createElement('div');
    b.className = 'combo-badge';
    b.innerHTML = `<div class="badge-dot" style="background:${DROP_COLOR[combo.type]}"></div><span>${DROP_NAME[combo.type]} ${combo.cells.length}個</span>`;
    list.appendChild(b);
  });
}

// =====================================================
// タイマー
// =====================================================
function startTimer() {
  G.timerRunning = true;
  G.timerStart = Date.now() - G.timerElapsed*1000;
  G.timerTick = setInterval(tickTimer, 100);
}
function tickTimer() {
  G.timerElapsed = (Date.now()-G.timerStart)/1000;
  document.getElementById('timer-display').textContent = G.timerElapsed.toFixed(1);
  const bar = document.getElementById('timer-bar');
  if(G.timeLimit > 0) {
    const pct = Math.max(0, 1-G.timerElapsed/G.timeLimit);
    bar.style.width = (pct*100)+'%';
    bar.classList.toggle('warning', pct<0.3);
    if(G.timerElapsed >= G.timeLimit) {
      stopTimer();
      document.getElementById('timer-display').style.color='var(--danger)';
    }
  } else {
    bar.style.width = '100%';
  }
}
function stopTimer() { clearInterval(G.timerTick); G.timerRunning=false; }
function resetTimer() {
  stopTimer(); G.timerElapsed=0;
  document.getElementById('timer-display').textContent='0.0';
  document.getElementById('timer-display').style.color='';
  document.getElementById('timer-bar').style.width='100%';
  document.getElementById('timer-bar').classList.remove('warning');
}

// タイマークリックで設定
document.getElementById('timer-display').style.cursor='pointer';
document.getElementById('timer-display').title='クリックで制限時間を設定';
document.getElementById('timer-display').addEventListener('click',()=>{
  const v=prompt('制限時間（秒）を入力。0で無制限。',G.timeLimit);
  if(v===null) return;
  const n=Math.max(0,parseInt(v)||0);
  G.timeLimit=n;
  const inp=document.getElementById('time-limit-input');
  if(inp) inp.value=n;
  resetTimer();
});

// =====================================================
// ボタン
// =====================================================
document.getElementById('btn-new-random').addEventListener('click',()=>newGame(STANDARD));
document.getElementById('btn-reset').addEventListener('click',resetGame);
document.getElementById('btn-undo').addEventListener('click',()=>{
  if(!G.history.length||G.locked) return;
  const last=G.history.pop();
  G.board[last.from.r][last.from.c]=G.board[last.to.r][last.to.c];
  G.board[last.to.r][last.to.c]=last.swapped;
  G.moveCount=Math.max(0,G.moveCount-1);
  updateMoveUI(); calcCombos(); sched();
});

// 設定パネル
document.getElementById('btn-settings').addEventListener('click',()=>{
  document.getElementById('settings-panel').classList.remove('hidden');
  document.getElementById('settings-overlay').classList.remove('hidden');
});
function closeSettings() {
  document.getElementById('settings-panel').classList.add('hidden');
  document.getElementById('settings-overlay').classList.add('hidden');
}
document.getElementById('btn-settings-close').addEventListener('click',closeSettings);
document.getElementById('settings-overlay').addEventListener('click',closeSettings);
document.querySelectorAll('.size-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.size-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    G.cols=parseInt(btn.dataset.cols); G.rows=parseInt(btn.dataset.rows);
    resizeCanvas(); newGame();
  });
});
document.getElementById('time-limit-input').addEventListener('change',e=>{
  G.timeLimit=Math.max(0,parseInt(e.target.value)||0); resetTimer();
});

// モード切替
document.getElementById('btn-mode-toggle').addEventListener('click',()=>{
  G.mode = G.mode==='puzzle' ? 'edit' : 'puzzle';
  const btn = document.getElementById('btn-mode-toggle');
  btn.dataset.mode = G.mode;
  btn.textContent = G.mode==='edit' ? '🎮 パズルモードへ戻す' : '✏ 盤面編集モード';
  document.getElementById('custom-palette').classList.toggle('hidden', G.mode!=='edit');
  if(G.mode==='edit') { stopTimer(); if(G.replayMode) endReplay(); }
  sched();
});

// 陣
function buildJinPicker(n) {
  G.jinN=n; G.jinSelected=[];
  const list=document.getElementById('jin-color-list');
  list.innerHTML='';
  document.getElementById('jin-need-count').textContent=n;
  STANDARD.forEach(id=>{
    const wrap=document.createElement('div');
    wrap.style.cssText='display:flex;flex-direction:column;align-items:center;gap:3px';
    const chip=document.createElement('div');
    chip.className='jin-color-chip';
    chip.style.cssText='width:44px;height:44px;border-radius:50%;cursor:pointer;border:3px solid transparent;transition:all .15s;overflow:hidden;background:#333';
    chip.title=DROP_NAME[id];
    const img=document.createElement('img');
    img.src=`orbs/${id}.png`; img.style.cssText='width:100%;height:100%;';
    chip.appendChild(img);
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
    const label=document.createElement('div');
    label.style.cssText='font-size:.65rem;color:var(--text2)';
    label.textContent=DROP_NAME[id];
    wrap.appendChild(chip); wrap.appendChild(label);
    list.appendChild(wrap);
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

// カスタムパレット
function buildPalette() {
  const wrap=document.getElementById('palette-drops');
  wrap.innerHTML='';
  DROP_IDS.forEach(id=>{
    const outer=document.createElement('div');
    outer.style.cssText='display:flex;flex-direction:column;align-items:center;gap:2px';
    const chip=document.createElement('div');
    chip.className='palette-drop'+(id===G.customDrop?' selected':'');
    chip.dataset.id=id;
    chip.style.cssText='width:44px;height:44px;border-radius:50%;cursor:pointer;border:3px solid transparent;transition:all .15s;overflow:hidden;background:#222';
    const img=document.createElement('img');
    img.src=`orbs/${id}.png`; img.style.cssText='width:100%;height:100%;';
    chip.appendChild(img);
    chip.addEventListener('click',()=>{
      G.customDrop=id;
      document.querySelectorAll('.palette-drop').forEach(c=>c.classList.remove('selected'));
      chip.classList.add('selected');
    });
    const label=document.createElement('div');
    label.style.cssText='font-size:.6rem;color:var(--text2);white-space:nowrap';
    label.textContent=DROP_NAME[id];
    outer.appendChild(chip); outer.appendChild(label);
    wrap.appendChild(outer);
  });
}

// 再生
document.getElementById('btn-replay').addEventListener('click',startReplay);
function startReplay() {
  if(!G.history.length||G.mode==='edit') return;
  const boards=[cloneBoard(G.initBoard)];
  const paths=[{r:G.history[0].from.r,c:G.history[0].from.c}];
  const tmp=cloneBoard(G.initBoard);
  for(const mv of G.history) {
    const t=tmp[mv.to.r][mv.to.c];
    tmp[mv.to.r][mv.to.c]=tmp[mv.from.r][mv.from.c];
    tmp[mv.from.r][mv.from.c]=t;
    boards.push(cloneBoard(tmp));
    paths.push({r:mv.to.r,c:mv.to.c});
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
  sched();
}
function endReplay() {
  clearInterval(G.replayIntervalId); G.replayPlaying=false; G.replayMode=false;
  document.getElementById('replay-bar').classList.add('hidden');
  document.getElementById('btn-rp-playpause').textContent='▶';
  G.board=cloneBoard(G.replayBoards[G.replayBoards.length-1]||G.initBoard);
  calcCombos(); sched();
}
document.getElementById('btn-rp-prev').addEventListener('click',()=>{G.replayStep=Math.max(0,G.replayStep-1);updateReplayStep();});
document.getElementById('btn-rp-next').addEventListener('click',()=>{G.replayStep=Math.min(G.replayBoards.length-1,G.replayStep+1);updateReplayStep();});
document.getElementById('btn-rp-playpause').addEventListener('click',()=>{
  G.replayPlaying=!G.replayPlaying;
  document.getElementById('btn-rp-playpause').textContent=G.replayPlaying?'⏸':'▶';
  if(G.replayPlaying){
    G.replayIntervalId=setInterval(()=>{
      if(G.replayStep>=G.replayBoards.length-1){G.replayPlaying=false;clearInterval(G.replayIntervalId);document.getElementById('btn-rp-playpause').textContent='▶';return;}
      G.replayStep++; updateReplayStep();
    },100);
  } else {
    clearInterval(G.replayIntervalId);
  }
});
document.getElementById('btn-rp-close').addEventListener('click',endReplay);
document.getElementById('rp-trail-check').addEventListener('change',e=>{G.showTrail=e.target.checked;sched();});

window.addEventListener('resize',()=>{resizeCanvas();sched();});

// =====================================================
// 初期化（画像ロード完了後に呼ばれる）
// =====================================================
function initGame() {
  buildPalette();
  resizeCanvas();
  newGame();
}
