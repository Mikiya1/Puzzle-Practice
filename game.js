'use strict';

const DROP_IDS   = ['fire','water','wood','light','dark','heal','poison','mpoison','jammer','bomb'];
const DROP_NAMES = {fire:'火',water:'水',wood:'木',light:'光',dark:'闇',heal:'回復',
                    poison:'毒',mpoison:'猛毒',jammer:'邪魔',bomb:'爆弾'};
const DROP_COLORS= {fire:'#e03000',water:'#1060e0',wood:'#10a010',light:'#d0a000',
                    dark:'#7010c0',heal:'#e03080',poison:'#60a000',mpoison:'#9010c0',
                    jammer:'#506080',bomb:'#c06010'};
const STANDARD   = ['fire','water','wood','light','dark','heal'];

const IMGS = {};
DROP_IDS.forEach(id => {
  const img = new Image();
  img.src = `orbs/orb_${id}.png?t=1777354182`;
  IMGS[id] = img;
});

// =========================================================
// 状態
// =========================================================
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
  totalCombos:[],   // 累積コンボ
  // 消去アニメ
  eraseAnimId:null,
  eraseAlpha:{},      // "r,c" -> 0〜1（消去中の不透明度）
  eraseDrop:{},       // "r,c" -> drop id
  // コンボラベル：消えた場所に「Combo X」を表示
  comboLabels:[],     // [{r, c, n, alpha, time}]
  // 落下アニメ
  fallOffsets:{},     // "r,c" -> y方向のオフセット（負の値=上から落ちてくる）
  fallAnimId:null,
  // 再生
  replayMode:false,
  replaySteps:[],
  replayStep:0,
  replayPlaying:false, replayIntervalId:null,
  showTrail:true,
  replayPaths:[],
  customDrop:'fire', customPainting:false,
  jinN:0, jinSelected:[],
};

// =========================================================
// Canvas
// =========================================================
const canvas = document.getElementById('puzzle-board');
const ctx    = canvas.getContext('2d');
let CS = 72;

function resizeCanvas() {
  const maxW = Math.min(document.body.clientWidth - 24, 560);
  CS = Math.floor(maxW / G.cols);
  canvas.width  = CS * G.cols;
  canvas.height = CS * G.rows;
  canvas.style.width  = canvas.width + 'px';
  canvas.style.height = canvas.height + 'px';
  canvas.style.maxWidth = '100%';
}

// =========================================================
// 描画
// =========================================================
let dragPixel = null, rafId = null;

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 背景
  const bg = ctx.createLinearGradient(0,0,canvas.width,canvas.height);
  bg.addColorStop(0,'#0c1424'); bg.addColorStop(1,'#101c34');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(0,0,canvas.width,canvas.height,10); ctx.fill();

  // グリッド
  ctx.strokeStyle='rgba(255,255,255,0.07)'; ctx.lineWidth=1;
  for(let r=0;r<=G.rows;r++){ctx.beginPath();ctx.moveTo(0,r*CS);ctx.lineTo(canvas.width,r*CS);ctx.stroke();}
  for(let c=0;c<=G.cols;c++){ctx.beginPath();ctx.moveTo(c*CS,0);ctx.lineTo(c*CS,canvas.height);ctx.stroke();}

  if(G.mode==='edit'){
    ctx.fillStyle='rgba(255,200,0,0.04)';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.setLineDash([3,3]);ctx.strokeStyle='rgba(255,200,0,0.3)';ctx.lineWidth=1;
    for(let r=0;r<G.rows;r++) for(let c=0;c<G.cols;c++) ctx.strokeRect(c*CS+.5,r*CS+.5,CS-1,CS-1);
    ctx.setLineDash([]);
  }

  // 再生中、または再生終了後で軌跡保持中の時は表示
  if((G.replayMode || G.keepTrail) && G.showTrail && G.replayPaths && G.replayPaths.length > 1) renderTrail();

  // ドロップ描画（落下オフセット考慮）
  for(let r=0;r<G.rows;r++){
    for(let c=0;c<G.cols;c++){
      // ドラッグ中のセルは描画しない（半透明ゴーストとして元位置に薄く）
      const isDragSrc = G.dragging && G.dragCell && G.dragCell.r===r && G.dragCell.c===c;
      const key=`${r},${c}`;
      const offsetY = G.fallOffsets[key] || 0;

      if(key in G.eraseAlpha){
        // 消去アニメ中
        const a=G.eraseAlpha[key];
        if(a>0.01) drawOrb(c*CS, r*CS+offsetY, G.eraseDrop[key], a, 1, false);
      } else if(!isDragSrc) {
        const drop=G.board[r][c];
        if(drop) drawOrb(c*CS, r*CS+offsetY, drop, 1, 1, false);
      }
    }
  }

  // ドラッグ元位置に薄いゴーストドロップ
  if(G.dragging && G.dragCell && G.heldDrop){
    drawOrb(G.dragCell.c*CS, G.dragCell.r*CS, G.heldDrop, 0.35, 1, false);
  }

  // ドラッグ中のドロップ（指の位置・大きめ・グロー）
  if(G.dragging && dragPixel && G.heldDrop){
    drawOrb(dragPixel.x-CS/2, dragPixel.y-CS/2, G.heldDrop, 1, 1.15, true);
  }

  // コンボラベル「Combo X」を上に重ねて描画
  renderComboLabels();
}

function drawOrb(x, y, id, alpha, scale, lifted) {
  const img = IMGS[id];
  const cx = x+CS/2, cy = y+CS/2;
  const s = CS * 0.88 * scale;
  ctx.save();
  ctx.globalAlpha = alpha ?? 1;
  if(lifted){ ctx.shadowColor=DROP_COLORS[id]||'#fff'; ctx.shadowBlur=CS*0.4; }
  if(img && img.complete && img.naturalWidth>0){
    ctx.drawImage(img, cx-s/2, cy-s/2, s, s);
  } else {
    const g=ctx.createRadialGradient(cx-s*.2,cy-s*.25,s*.02,cx,cy,s*.44);
    g.addColorStop(0,'#fff'); g.addColorStop(.4,DROP_COLORS[id]||'#888'); g.addColorStop(1,'#000');
    ctx.beginPath(); ctx.arc(cx,cy,s*.44,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
  }
  ctx.shadowBlur=0; ctx.restore();
}

// 「Combo X」ピンク文字（本家風）
function renderComboLabels(){
  G.comboLabels.forEach(label=>{
    if(label.alpha<=0) return;
    const cx = label.c*CS + CS/2;
    const cy = label.r*CS + CS/2;
    ctx.save();
    ctx.globalAlpha = label.alpha;
    const fontSize = Math.round(CS*0.32);
    ctx.font = `bold ${fontSize}px 'Orbitron', 'Noto Sans JP', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 縁取り（黒）
    ctx.lineWidth = fontSize * 0.18;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(`Combo ${label.n}`, cx, cy);
    // 本体（ピンク〜マゼンタ）
    const grad = ctx.createLinearGradient(cx, cy-fontSize/2, cx, cy+fontSize/2);
    grad.addColorStop(0, '#ff66cc');
    grad.addColorStop(1, '#ff1188');
    ctx.fillStyle = grad;
    ctx.fillText(`Combo ${label.n}`, cx, cy);
    ctx.restore();
  });
}

function renderTrail(){
  // keepTrail（終了後保持）の場合は全部、再生中は現在位置まで
  const endIdx = G.keepTrail ? G.replayPaths.length : (G.replayStep+1);
  const path = G.replayPaths.slice(0, endIdx);
  if(path.length<2) return;
  ctx.save();
  ctx.strokeStyle='rgba(255,220,40,.85)'; ctx.lineWidth=CS*.1;
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.shadowColor='rgba(255,200,0,.5)'; ctx.shadowBlur=8;
  ctx.beginPath(); ctx.moveTo(path[0].c*CS+CS/2, path[0].r*CS+CS/2);
  for(let i=1;i<path.length;i++) ctx.lineTo(path[i].c*CS+CS/2, path[i].r*CS+CS/2);
  ctx.stroke();
  ctx.shadowBlur=0;
  // 始点（緑）
  ctx.fillStyle='rgba(60,255,120,.95)';
  ctx.beginPath(); ctx.arc(path[0].c*CS+CS/2, path[0].r*CS+CS/2, CS*.13, 0, Math.PI*2); ctx.fill();
  // 終点（赤）
  if(path.length>1){
    const last = path[path.length-1];
    ctx.fillStyle='rgba(255,80,80,.95)';
    ctx.beginPath(); ctx.arc(last.c*CS+CS/2, last.r*CS+CS/2, CS*.13, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

function sched(){ if(rafId) cancelAnimationFrame(rafId); rafId=requestAnimationFrame(()=>{rafId=null;render();}); }

// =========================================================
// ボード
// =========================================================
function cloneBoard(b){ return b.map(r=>r.slice()); }
function rnd(drops){ return drops[Math.floor(Math.random()*drops.length)]; }

// ランダム配置：3個以上揃いが出ないように1個ずつ配置
function makeBoardNoCombo(drops){
  const {rows, cols} = G;
  const board = Array.from({length:rows}, ()=>Array(cols).fill(null));
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      // このセルに置けない色（左2個か上2個と同じ色はNG）
      const forbidden = new Set();
      if(c>=2 && board[r][c-1] && board[r][c-1]===board[r][c-2]) forbidden.add(board[r][c-1]);
      if(r>=2 && board[r-1][c] && board[r-1][c]===board[r-2][c]) forbidden.add(board[r-1][c]);
      const ok = drops.filter(d=>!forbidden.has(d));
      board[r][c] = rnd(ok.length>0 ? ok : drops);
    }
  }
  return board;
}

function makeBoard(drops){ return Array.from({length:G.rows},()=>Array.from({length:G.cols},()=>rnd(drops))); }

function newGame(drops, noCombo=false){
  cancelErase(); stopTimer(); resetTimer();
  G.board = noCombo ? makeBoardNoCombo(drops||STANDARD) : makeBoard(drops||STANDARD);
  G.initBoard=cloneBoard(G.board);
  G.history=[]; G.moveCount=0; G.totalCombos=[]; G.locked=false;
  G.comboLabels=[]; G.fallOffsets={};
  G.keepTrail=false; G.replayPaths=[];
  updateMoveUI(); updateComboUI(); sched();
}
function resetGame(){
  cancelErase(); stopTimer(); resetTimer();
  G.board=cloneBoard(G.initBoard);
  G.history=[]; G.moveCount=0; G.totalCombos=[]; G.locked=false;
  G.comboLabels=[]; G.fallOffsets={};
  G.keepTrail=false; G.replayPaths=[];
  updateMoveUI(); updateComboUI(); sched();
}

// =========================================================
// 入力
// =========================================================
function getPos(e){
  const rect=canvas.getBoundingClientRect();
  const sx=canvas.width/rect.width, sy=canvas.height/rect.height;
  const src=e.touches?e.touches[0]:e;
  return{x:(src.clientX-rect.left)*sx, y:(src.clientY-rect.top)*sy};
}
function toCell(px,py){
  const c=Math.floor(px/CS),r=Math.floor(py/CS);
  if(r<0||r>=G.rows||c<0||c>=G.cols) return null;
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
  const pos=getPos(e), cell=toCell(pos.x,pos.y);
  if(!cell) return;
  if(G.mode==='edit'){
    G.customPainting=true; G.board[cell.r][cell.c]=G.customDrop; sched(); return;
  }
  if(G.locked) return;
  cancelErase();
  G.comboLabels=[]; // 前のコンボラベルを消す
  G.keepTrail=false; // 軌跡もクリア
  G.dragging=true; G.dragCell={...cell};
  G.heldDrop=G.board[cell.r][cell.c];
  // 元位置にドロップを残す（半透明で表示するため）
  dragPixel={x:pos.x,y:pos.y};
  if(!G.timerRunning) startTimer();
  sched();
}
function onMove(e){
  e.preventDefault();
  const pos=getPos(e);
  if(G.customPainting){
    const cell=toCell(pos.x,pos.y);
    if(cell){G.board[cell.r][cell.c]=G.customDrop;sched();} return;
  }
  if(!G.dragging) return;
  dragPixel={x:pos.x,y:pos.y};
  const cell=toCell(pos.x,pos.y);
  if(cell&&(cell.r!==G.dragCell.r||cell.c!==G.dragCell.c)){
    // 隣のドロップを元位置に押し出す
    const targetDrop = G.board[cell.r][cell.c];
    G.board[G.dragCell.r][G.dragCell.c] = targetDrop;
    G.board[cell.r][cell.c] = G.heldDrop;  // 移動先には常にheldDropを置く
    G.history.push({from:{...G.dragCell},to:{...cell},swapped:targetDrop});
    G.dragCell={...cell};
    G.moveCount++; updateMoveUI();
  }
  sched();
}
function onEnd(e){
  if(G.customPainting){G.customPainting=false; runComboChain(); return;}
  if(!G.dragging) return;
  G.dragging=false;
  // heldDropは既にG.dragCellの位置に設定済み（onMoveで処理）
  G.heldDrop=null; G.dragCell=null; dragPixel=null;
  stopTimer(); G.locked=true;
  G.totalCombos=[]; G.comboLabels=[];
  runComboChain();
  sched();
}

// =========================================================
// コンボ計算
// =========================================================
function detectCombos(board){
  const{rows,cols}=G;
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
    const type=board[r][c], cells=[];
    const stack=[{r,c}];
    while(stack.length){
      const{r:cr,c:cc}=stack.pop();
      if(cr<0||cr>=rows||cc<0||cc>=cols||visited[cr][cc]||!matched[cr][cc]||board[cr][cc]!==type) continue;
      visited[cr][cc]=true; cells.push({r:cr,c:cc});
      stack.push({r:cr+1,c:cc},{r:cr-1,c:cc},{r:cr,c:cc+1},{r:cr,c:cc-1});
    }
    combos.push({type,cells});
  }
  // コンボの順序：下にあるものから先（行が大きい順）
  combos.sort((a,b)=>{
    const aMaxR = Math.max(...a.cells.map(c=>c.r));
    const bMaxR = Math.max(...b.cells.map(c=>c.r));
    return bMaxR - aMaxR;
  });
  return combos;
}

// コンボ連鎖：1コンボずつ順番に消し、全部消えたら落下、再判定
function runComboChain(){
  const combos = detectCombos(G.board);
  if(combos.length===0){
    G.locked=false;
    sched();
    // 1.5秒後にコンボラベル消去
    setTimeout(()=>{ fadeComboLabels(); }, 1200);
    return;
  }

  G.totalCombos = [...G.totalCombos, ...combos];
  updateComboUI();

  // 1コンボずつ順番に消去
  eraseCombosOneByOne(combos, 0, ()=>{
    // 全コンボ消去完了 → 落下
    animateFall(()=>{
      runComboChain();
    });
  });
}

// コンボを1個ずつ順番に消す（本家風）
function eraseCombosOneByOne(combos, idx, onDone){
  if(idx >= combos.length){ onDone(); return; }
  const combo = combos[idx];
  const comboNum = G.totalCombos.indexOf(combo) + 1;

  // コンボラベルを表示（中央セル）
  const cells = combo.cells;
  const avgR = cells.reduce((s,c)=>s+c.r,0)/cells.length;
  const avgC = cells.reduce((s,c)=>s+c.c,0)/cells.length;
  const labelR = Math.round(avgR);
  const labelC = Math.round(avgC);
  G.comboLabels.push({r:labelR, c:labelC, n:comboNum, alpha:1.0});

  // セルを消去アニメに登録
  cells.forEach(({r,c})=>{
    G.eraseAlpha[`${r},${c}`] = 1.0;
    G.eraseDrop[`${r},${c}`] = combo.type;
  });

  const FADE = 220;  // 1コンボの消去時間
  const DELAY_BETWEEN = 120;  // 次のコンボまでの間隔
  const start = performance.now();

  function animFade(now){
    const t = Math.min((now-start)/FADE, 1.0);
    cells.forEach(({r,c})=>{ G.eraseAlpha[`${r},${c}`] = 1.0-t; });
    sched();
    if(t<1.0){
      G.eraseAnimId = requestAnimationFrame(animFade);
    } else {
      // このコンボのセルをboardから削除
      cells.forEach(({r,c})=>{
        G.board[r][c] = null;
        delete G.eraseAlpha[`${r},${c}`];
        delete G.eraseDrop[`${r},${c}`];
      });
      sched();
      // 次のコンボへ
      setTimeout(()=>eraseCombosOneByOne(combos, idx+1, onDone), DELAY_BETWEEN);
    }
  }
  G.eraseAnimId = requestAnimationFrame(animFade);
}

// 落下アニメ：nullセルの上のドロップが落ちてくる
function animateFall(onDone){
  const{rows,cols,board}=G;

  // 各列について、新しい配置を計算
  const moves = []; // [{from:{r,c}, to:{r,c}, drop}]
  for(let c=0;c<cols;c++){
    let writeRow = rows-1;
    for(let r=rows-1;r>=0;r--){
      if(board[r][c]!==null){
        if(writeRow!==r){
          moves.push({fromR:r, toR:writeRow, c, drop:board[r][c]});
        }
        writeRow--;
      }
    }
  }

  if(moves.length===0){ onDone(); return; }

  // boardを最終状態に更新しつつ、fallOffsetsで視覚的に上から落とす
  const newBoard = Array.from({length:rows}, ()=>Array(cols).fill(null));
  for(let c=0;c<cols;c++){
    let writeRow = rows-1;
    for(let r=rows-1;r>=0;r--){
      if(board[r][c]!==null){
        newBoard[writeRow][c] = board[r][c];
        writeRow--;
      }
    }
  }

  // moves: 元の位置 -> 新しい位置 への変換
  // fallOffsets: 新しい位置から見て、現在は何ピクセル上にいるか
  G.fallOffsets = {};
  moves.forEach(m=>{
    const dy = (m.fromR - m.toR) * CS;  // 落下する距離
    const key = `${m.toR},${m.c}`;
    G.fallOffsets[key] = -dy; // 負の値=現在は上方向にいる
  });

  G.board = newBoard;

  const FALL_DURATION = 250;
  const start = performance.now();

  function animFall(now){
    const t = Math.min((now-start)/FALL_DURATION, 1.0);
    // ease-in（重力風加速）
    const eased = t*t;

    let active = false;
    Object.keys(G.fallOffsets).forEach(key=>{
      const orig = G.fallOffsets[key];
      // origは負の値、徐々に0に近づく
      const current = orig * (1 - eased);
      if(Math.abs(current) > 0.5){
        G.fallOffsets[key] = orig; // 保持（後でcurrentで書き換える）
        active = true;
      }
    });

    // 描画用に現在のオフセットを計算したものを別マップで持つ
    const renderOffsets = {};
    Object.keys(G.fallOffsets).forEach(key=>{
      const orig = G.fallOffsets[key];
      renderOffsets[key] = orig * (1 - eased);
    });
    // 一時的にfallOffsetsを描画用に置き換え
    const tmp = G.fallOffsets;
    G.fallOffsets = renderOffsets;
    sched();
    G.fallOffsets = tmp;

    if(t<1.0){
      G.fallAnimId = requestAnimationFrame(animFall);
    } else {
      G.fallOffsets = {};
      G.fallAnimId = null;
      sched();
      setTimeout(onDone, 100);
    }
  }
  G.fallAnimId = requestAnimationFrame(animFall);
}

function cancelErase(){
  if(G.eraseAnimId){cancelAnimationFrame(G.eraseAnimId);G.eraseAnimId=null;}
  if(G.fallAnimId){cancelAnimationFrame(G.fallAnimId);G.fallAnimId=null;}
  G.eraseAlpha={}; G.eraseDrop={}; G.fallOffsets={};
}

// コンボラベルをフェードアウト
function fadeComboLabels(){
  if(G.comboLabels.length===0) return;
  const FADE=600;
  const start=performance.now();
  function loop(now){
    const t=Math.min((now-start)/FADE,1.0);
    G.comboLabels.forEach(l=>{ l.alpha = 1.0-t; });
    sched();
    if(t<1.0) requestAnimationFrame(loop);
    else { G.comboLabels=[]; sched(); }
  }
  requestAnimationFrame(loop);
}

// =========================================================
// UI
// =========================================================
function updateMoveUI(){ document.getElementById('move-count').textContent=G.moveCount; }
function updateComboUI(){
  document.getElementById('combo-count').textContent=G.totalCombos.length;
  const list=document.getElementById('combo-list'); list.innerHTML='';
  G.totalCombos.forEach(combo=>{
    const b=document.createElement('div'); b.className='combo-badge';
    b.innerHTML=`<div class="badge-dot" style="background:${DROP_COLORS[combo.type]}"></div><span>${DROP_NAMES[combo.type]} ${combo.cells.length}個</span>`;
    list.appendChild(b);
  });
}

// =========================================================
// タイマー
// =========================================================
function startTimer(){
  G.timerRunning=true; G.timerStart=Date.now()-G.timerElapsed*1000;
  G.timerTick=setInterval(tickTimer,100);
}
function tickTimer(){
  G.timerElapsed=(Date.now()-G.timerStart)/1000;
  document.getElementById('timer-display').textContent=G.timerElapsed.toFixed(1);
  const bar=document.getElementById('timer-bar');
  if(G.timeLimit>0){
    const pct=Math.max(0,1-G.timerElapsed/G.timeLimit);
    bar.style.width=(pct*100)+'%'; bar.classList.toggle('warning',pct<0.3);
    if(G.timerElapsed>=G.timeLimit){stopTimer();G.locked=true;document.getElementById('timer-display').style.color='var(--danger)';}
  } else bar.style.width='100%';
}
function stopTimer(){ clearInterval(G.timerTick); G.timerRunning=false; }
function resetTimer(){
  stopTimer(); G.timerElapsed=0;
  document.getElementById('timer-display').textContent='0.0';
  document.getElementById('timer-display').style.color='';
  document.getElementById('timer-bar').style.width='100%';
  document.getElementById('timer-bar').classList.remove('warning');
}
document.getElementById('timer-display').style.cursor='pointer';
document.getElementById('timer-display').addEventListener('click',()=>{
  if(G.timerRunning||G.locked) return;
  const val=prompt('制限時間（秒）を入力。0で無制限。',G.timeLimit);
  if(val===null) return;
  G.timeLimit=Math.max(0,parseInt(val)||0);
  const inp=document.getElementById('time-limit-input');
  if(inp) inp.value=G.timeLimit;
  resetTimer();
});

// =========================================================
// ボタン
// =========================================================
document.getElementById('btn-new-random').addEventListener('click',()=>newGame(STANDARD, true));
document.getElementById('btn-reset').addEventListener('click',resetGame);
document.getElementById('btn-undo').addEventListener('click',()=>{
  if(!G.history.length||G.locked) return;
  cancelErase();
  const last=G.history.pop();
  G.board[last.from.r][last.from.c]=G.board[last.to.r][last.to.c];
  G.board[last.to.r][last.to.c]=last.swapped;
  G.moveCount=Math.max(0,G.moveCount-1);
  G.totalCombos=[]; G.comboLabels=[];
  updateMoveUI(); updateComboUI(); sched();
});

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
    G.cols=parseInt(btn.dataset.cols); G.rows=parseInt(btn.dataset.rows);
    resizeCanvas(); newGame(STANDARD, true);
  });
});
document.getElementById('time-limit-input').addEventListener('change',e=>{
  G.timeLimit=Math.max(0,parseInt(e.target.value)||0); resetTimer();
});
document.getElementById('btn-mode-toggle').addEventListener('click',()=>{
  G.mode=G.mode==='puzzle'?'edit':'puzzle';
  const btn=document.getElementById('btn-mode-toggle');
  btn.dataset.mode=G.mode;
  btn.textContent=G.mode==='edit'?'🎮 パズルモードへ戻す':'✏ 盤面編集モード';
  document.getElementById('custom-palette').classList.toggle('hidden',G.mode!=='edit');
  if(G.mode==='edit'){stopTimer();if(G.replayMode)endReplay();}
  sched();
});

// =========================================================
// 陣
// =========================================================
function buildJinPicker(n){
  G.jinN=n; G.jinSelected=[];
  const list=document.getElementById('jin-color-list');
  list.innerHTML='';
  document.getElementById('jin-need-count').textContent=n;
  STANDARD.forEach(id=>{
    const chip=document.createElement('div');
    chip.className='jin-color-chip'; chip.title=DROP_NAMES[id]; chip.style.overflow='hidden';
    const img=document.createElement('img');
    img.src=`orbs/orb_${id}.png`; img.style.cssText='width:100%;height:100%;object-fit:cover;display:block';
    chip.appendChild(img);
    const lbl=document.createElement('span'); lbl.className='chip-name'; lbl.textContent=DROP_NAMES[id];
    chip.appendChild(lbl);
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
    btn.classList.add('active'); buildJinPicker(parseInt(btn.dataset.jin));
  });
});
document.getElementById('btn-jin-apply').addEventListener('click',()=>{
  if(G.jinSelected.length<G.jinN){alert(`${G.jinN}色選んでください`);return;}
  newGame(G.jinSelected);
  document.getElementById('jin-color-picker').classList.add('hidden');
  document.querySelectorAll('.jin-btn').forEach(b=>b.classList.remove('active'));
  G.jinSelected=[];
});

// =========================================================
// カスタムパレット
// =========================================================
function buildPalette(){
  const wrap=document.getElementById('palette-drops'); wrap.innerHTML='';
  DROP_IDS.forEach(id=>{
    const col=document.createElement('div');
    col.style.cssText='display:flex;flex-direction:column;align-items:center;gap:3px';
    const chip=document.createElement('div');
    chip.className='palette-drop'+(id===G.customDrop?' selected':'');
    chip.dataset.id=id;
    chip.style.cssText='width:44px;height:44px;border-radius:50%;overflow:hidden;cursor:pointer;border:3px solid transparent;transition:all .15s;flex-shrink:0';
    const img=document.createElement('img');
    img.src=`orbs/orb_${id}.png`; img.style.cssText='width:100%;height:100%;object-fit:cover;display:block';
    chip.appendChild(img);
    chip.addEventListener('click',()=>{
      G.customDrop=id;
      document.querySelectorAll('.palette-drop').forEach(c=>c.classList.remove('selected'));
      chip.classList.add('selected');
    });
    const label=document.createElement('div');
    label.style.cssText='font-size:.6rem;color:var(--text2);white-space:nowrap';
    label.textContent=DROP_NAMES[id];
    col.appendChild(chip); col.appendChild(label); wrap.appendChild(col);
  });
}

// =========================================================
// 再生
// =========================================================
document.getElementById('btn-replay').addEventListener('click',startReplay);

function startReplay(){
  if(!G.history.length||G.mode==='edit') return;
  cancelErase();

  // 各手順の盤面スナップショット
  const boards=[cloneBoard(G.initBoard)];
  const tmp=cloneBoard(G.initBoard);
  for(const mv of G.history){
    const t=tmp[mv.to.r][mv.to.c];
    tmp[mv.to.r][mv.to.c]=tmp[mv.from.r][mv.from.c];
    tmp[mv.from.r][mv.from.c]=t;
    boards.push(cloneBoard(tmp));
  }

  const paths=[{r:G.history[0].from.r,c:G.history[0].from.c}];
  G.history.forEach(mv=>paths.push({r:mv.to.r,c:mv.to.c}));

  G.replaySteps=boards;
  G.replayPaths=paths;
  G.replayMode=true;
  G.replayStep=0;
  G.replayPlaying=false;
  G.totalCombos=[]; G.comboLabels=[];

  document.getElementById('replay-bar').classList.remove('hidden');
  G.board=cloneBoard(boards[0]);
  document.getElementById('rp-step-label').textContent=`0/${boards.length-1}`;
  sched();
}

function endReplay(){
  cancelErase();
  clearInterval(G.replayIntervalId); G.replayPlaying=false; G.replayMode=false;
  document.getElementById('replay-bar').classList.add('hidden');
  document.getElementById('btn-rp-playpause').textContent='▶';
  if(G.replaySteps.length>0){
    G.board=cloneBoard(G.replaySteps[G.replaySteps.length-1]);
  }
  G.totalCombos=[]; G.comboLabels=[]; G.locked=false;
  G.keepTrail=true;  // 軌跡を画面に残す
  // 最終盤面でコンボ判定して消去再生
  runComboChain();
  sched();
}

document.getElementById('btn-rp-prev').addEventListener('click',()=>{
  if(G.replayStep<=0) return;
  cancelErase();
  G.replayStep--;
  G.board=cloneBoard(G.replaySteps[G.replayStep]);
  document.getElementById('rp-step-label').textContent=`${G.replayStep}/${G.replaySteps.length-1}`;
  sched();
});
document.getElementById('btn-rp-next').addEventListener('click',()=>{
  if(G.replayStep>=G.replaySteps.length-1) return;
  cancelErase();
  G.replayStep++;
  G.board=cloneBoard(G.replaySteps[G.replayStep]);
  document.getElementById('rp-step-label').textContent=`${G.replayStep}/${G.replaySteps.length-1}`;
  sched();
});
document.getElementById('btn-rp-playpause').addEventListener('click',()=>{
  G.replayPlaying=!G.replayPlaying;
  document.getElementById('btn-rp-playpause').textContent=G.replayPlaying?'⏸':'▶';
  if(G.replayPlaying){
    G.replayIntervalId=setInterval(()=>{
      if(G.replayStep>=G.replaySteps.length-1){
        G.replayPlaying=false;clearInterval(G.replayIntervalId);
        document.getElementById('btn-rp-playpause').textContent='▶';
        // 最終盤面でコンボ消去再生
        endReplay();
        return;
      }
      G.replayStep++;
      G.board=cloneBoard(G.replaySteps[G.replayStep]);
      document.getElementById('rp-step-label').textContent=`${G.replayStep}/${G.replaySteps.length-1}`;
      sched();
    },120);
  } else clearInterval(G.replayIntervalId);
});
document.getElementById('btn-rp-close').addEventListener('click',()=>{
  cancelErase();
  G.replayMode=false; G.replayPlaying=false;
  clearInterval(G.replayIntervalId);
  document.getElementById('replay-bar').classList.add('hidden');
  document.getElementById('btn-rp-playpause').textContent='▶';
  if(G.replaySteps.length>0){
    G.board=cloneBoard(G.replaySteps[G.replaySteps.length-1]);
  }
  G.totalCombos=[]; G.comboLabels=[]; G.locked=false;
  G.keepTrail=true;  // 軌跡を保持
  sched();
});
document.getElementById('rp-trail-check').addEventListener('change',e=>{G.showTrail=e.target.checked;sched();});

window.addEventListener('resize',()=>{resizeCanvas();sched();});
buildPalette();
resizeCanvas();
newGame(STANDARD, true);
