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
  img.src = `orbs/${id}.png?v=4`;
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
  // コンボ: 1手で消えた全コンボを累積
  totalCombos:[],   // 累積コンボ一覧（表示用）
  eraseAnimId:null,
  eraseAlpha:{},    // "r,c" -> 0〜1
  eraseDrop:{},     // "r,c" -> drop id
  // 再生
  replayMode:false,
  // replayStepsは各ステップの盤面+コンボ消去情報を持つ
  replaySteps:[],   // [{board, combos:[{type,cells}], afterBoard}]
  replayStep:0,
  replayPlaying:false, replayIntervalId:null,
  replaySubStep:'move', // 'move'|'erase'
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
  const bg = ctx.createLinearGradient(0,0,canvas.width,canvas.height);
  bg.addColorStop(0,'#0c1424'); bg.addColorStop(1,'#101c34');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(0,0,canvas.width,canvas.height,10); ctx.fill();

  ctx.strokeStyle='rgba(255,255,255,0.07)'; ctx.lineWidth=1;
  for(let r=0;r<=G.rows;r++){ctx.beginPath();ctx.moveTo(0,r*CS);ctx.lineTo(canvas.width,r*CS);ctx.stroke();}
  for(let c=0;c<=G.cols;c++){ctx.beginPath();ctx.moveTo(c*CS,0);ctx.lineTo(c*CS,canvas.height);ctx.stroke();}

  if(G.mode==='edit'){
    ctx.fillStyle='rgba(255,200,0,0.04)';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.setLineDash([3,3]);ctx.strokeStyle='rgba(255,200,0,0.3)';ctx.lineWidth=1;
    for(let r=0;r<G.rows;r++) for(let c=0;c<G.cols;c++) ctx.strokeRect(c*CS+.5,r*CS+.5,CS-1,CS-1);
    ctx.setLineDash([]);
  }

  if(G.replayMode && G.showTrail && G.replayStep>0) renderTrail();

  for(let r=0;r<G.rows;r++){
    for(let c=0;c<G.cols;c++){
      if(G.dragging && G.dragCell && G.dragCell.r===r && G.dragCell.c===c) continue;
      const key=`${r},${c}`;
      if(key in G.eraseAlpha){
        const a=G.eraseAlpha[key];
        if(a>0.01) drawOrb(c*CS, r*CS, G.eraseDrop[key], a, 1-(1-a)*0.25, false);
      } else {
        const drop=G.board[r][c];
        if(drop) drawOrb(c*CS, r*CS, drop, 1, 1, false);
      }
    }
  }

  if(G.dragging && dragPixel && G.heldDrop)
    drawOrb(dragPixel.x-CS/2, dragPixel.y-CS/2, G.heldDrop, 1, 1.2, true);
}

function drawOrb(x, y, id, alpha, scale, lifted) {
  const img = IMGS[id];
  const cx = x+CS/2, cy = y+CS/2;
  const s = CS * 0.88 * scale;
  ctx.save();
  ctx.globalAlpha = alpha ?? 1;
  if(lifted){ ctx.shadowColor=DROP_COLORS[id]||'#fff'; ctx.shadowBlur=CS*0.35; }
  if(img && img.complete && img.naturalWidth>0){
    ctx.drawImage(img, cx-s/2, cy-s/2, s, s);
  } else {
    const g=ctx.createRadialGradient(cx-s*.2,cy-s*.25,s*.02,cx,cy,s*.44);
    g.addColorStop(0,'#fff'); g.addColorStop(.4,DROP_COLORS[id]||'#888'); g.addColorStop(1,'#000');
    ctx.beginPath(); ctx.arc(cx,cy,s*.44,0,Math.PI*2); ctx.fillStyle=g; ctx.fill();
  }
  ctx.shadowBlur=0; ctx.restore();
}

function renderTrail(){
  const path = G.replayPaths.slice(0, G.replayStep+1);
  if(path.length<2) return;
  ctx.save();
  ctx.strokeStyle='rgba(255,220,40,.85)'; ctx.lineWidth=CS*.1;
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.shadowColor='rgba(255,200,0,.5)'; ctx.shadowBlur=8;
  ctx.beginPath(); ctx.moveTo(path[0].c*CS+CS/2, path[0].r*CS+CS/2);
  for(let i=1;i<path.length;i++) ctx.lineTo(path[i].c*CS+CS/2, path[i].r*CS+CS/2);
  ctx.stroke();
  ctx.shadowBlur=0; ctx.fillStyle='rgba(255,255,255,.9)';
  ctx.beginPath(); ctx.arc(path[0].c*CS+CS/2, path[0].r*CS+CS/2, CS*.1, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

function sched(){ if(rafId) cancelAnimationFrame(rafId); rafId=requestAnimationFrame(()=>{rafId=null;render();}); }

// =========================================================
// ボード
// =========================================================
function cloneBoard(b){ return b.map(r=>r.slice()); }
function rnd(drops){ return drops[Math.floor(Math.random()*drops.length)]; }
function makeBoard(drops){ return Array.from({length:G.rows},()=>Array.from({length:G.cols},()=>rnd(drops))); }

function newGame(drops){
  cancelErase(); stopTimer(); resetTimer();
  G.board=makeBoard(drops||STANDARD);
  G.initBoard=cloneBoard(G.board);
  G.history=[]; G.moveCount=0; G.totalCombos=[]; G.locked=false;
  updateMoveUI(); updateComboUI(); sched();
}
function resetGame(){
  cancelErase(); stopTimer(); resetTimer();
  G.board=cloneBoard(G.initBoard);
  G.history=[]; G.moveCount=0; G.totalCombos=[]; G.locked=false;
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
  G.dragging=true; G.dragCell={...cell};
  G.heldDrop=G.board[cell.r][cell.c]; G.board[cell.r][cell.c]=null;
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
    const swapped=G.board[cell.r][cell.c];
    G.board[G.dragCell.r][G.dragCell.c]=swapped;
    G.board[cell.r][cell.c]=null;
    G.history.push({from:{...G.dragCell},to:{...cell},swapped});
    G.dragCell={...cell}; G.moveCount++; updateMoveUI();
  }
  sched();
}
function onEnd(e){
  if(G.customPainting){G.customPainting=false; runComboChain(false); return;}
  if(!G.dragging) return;
  G.dragging=false;
  if(G.dragCell) G.board[G.dragCell.r][G.dragCell.c]=G.heldDrop;
  G.heldDrop=null; G.dragCell=null; dragPixel=null;
  stopTimer(); G.locked=true;
  G.totalCombos=[];  // 新しい手なのでコンボをリセット
  runComboChain(false);
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
  return combos;
}

// コンボチェーン: 消去→落下→再検出を繰り返す
function runComboChain(isReplay){
  const combos = detectCombos(G.board);
  if(combos.length===0){
    G.locked=false; sched(); return;
  }
  // 今回の手で消えるコンボを累積
  G.totalCombos = [...G.totalCombos, ...combos];
  updateComboUI();
  startEraseAnim(combos, ()=>{
    applyGravity(()=>{
      runComboChain(isReplay);
    });
  });
}

// =========================================================
// 消去アニメ（全セル同時フェード）
// =========================================================
function cancelErase(){
  if(G.eraseAnimId){cancelAnimationFrame(G.eraseAnimId);G.eraseAnimId=null;}
  G.eraseAlpha={}; G.eraseDrop={};
}

function startEraseAnim(combos, onDone){
  cancelErase();
  combos.forEach(combo=>{
    combo.cells.forEach(({r,c})=>{
      const key=`${r},${c}`;
      G.eraseAlpha[key]=1.0;
      G.eraseDrop[key]=combo.type;
    });
  });

  const FADE=350;
  const start=performance.now();
  function loop(now){
    const t=Math.min((now-start)/FADE,1.0);
    for(const key in G.eraseAlpha) G.eraseAlpha[key]=1.0-t;
    sched();
    if(t<1.0){
      G.eraseAnimId=requestAnimationFrame(loop);
    } else {
      for(const key in G.eraseAlpha){
        const[r,c]=key.split(',').map(Number);
        G.board[r][c]=null;
      }
      G.eraseAlpha={}; G.eraseDrop={};
      G.eraseAnimId=null;
      sched();
      if(onDone) onDone();
    }
  }
  G.eraseAnimId=requestAnimationFrame(loop);
}

// 重力
function applyGravity(callback){
  const{rows,cols,board}=G;
  for(let c=0;c<cols;c++){
    let writeRow=rows-1;
    for(let r=rows-1;r>=0;r--){
      if(board[r][c]!==null){
        board[writeRow][c]=board[r][c];
        if(writeRow!==r) board[r][c]=null;
        writeRow--;
      }
    }
    for(let r=writeRow;r>=0;r--) board[r][c]=null;
  }
  sched();
  setTimeout(callback, 180);
}

// =========================================================
// UI
// =========================================================
function updateMoveUI(){ document.getElementById('move-count').textContent=G.moveCount; }
function updateComboUI(){
  // コンボ数はtotalCombosの長さ
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
document.getElementById('btn-new-random').addEventListener('click',()=>newGame(STANDARD));
document.getElementById('btn-reset').addEventListener('click',resetGame);
document.getElementById('btn-undo').addEventListener('click',()=>{
  if(!G.history.length||G.locked) return;
  cancelErase();
  const last=G.history.pop();
  G.board[last.from.r][last.from.c]=G.board[last.to.r][last.to.c];
  G.board[last.to.r][last.to.c]=last.swapped;
  G.moveCount=Math.max(0,G.moveCount-1);
  G.totalCombos=[];
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
    resizeCanvas(); newGame();
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
    img.src=`orbs/${id}.png?v=4`; img.style.cssText='width:100%;height:100%;object-fit:cover;display:block';
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
    img.src=`orbs/${id}.png?v=4`; img.style.cssText='width:100%;height:100%;object-fit:cover;display:block';
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
// 手順ごとに盤面+コンボ消去+落ちコンを完全再現
// =========================================================
document.getElementById('btn-replay').addEventListener('click',startReplay);

function buildReplaySteps(){
  // 各ステップ: 移動後の盤面、その盤面でのコンボ連鎖を全て記録
  const steps=[];
  const tmp=cloneBoard(G.initBoard);

  for(const mv of G.history){
    const before=cloneBoard(tmp);
    const t=tmp[mv.to.r][mv.to.c];
    tmp[mv.to.r][mv.to.c]=tmp[mv.from.r][mv.from.c];
    tmp[mv.from.r][mv.from.c]=t;
    const after=cloneBoard(tmp);

    // この移動後の連鎖を全て計算
    const chains=[]; // [{combos, afterBoard}]
    const sim=cloneBoard(tmp);
    let chainCombos=detectCombos(sim);
    while(chainCombos.length>0){
      const boardBefore=cloneBoard(sim);
      chainCombos.forEach(combo=>{
        combo.cells.forEach(({r,c})=>{ sim[r][c]=null; });
      });
      // 重力
      for(let c=0;c<G.cols;c++){
        let wr=G.rows-1;
        for(let r=G.rows-1;r>=0;r--){
          if(sim[r][c]!==null){sim[wr][c]=sim[r][c];if(wr!==r)sim[r][c]=null;wr--;}
        }
        for(let r=wr;r>=0;r--) sim[r][c]=null;
      }
      chains.push({combos:chainCombos, boardAfter:cloneBoard(sim)});
      chainCombos=detectCombos(sim);
    }

    steps.push({
      from:mv.from, to:mv.to,
      boardBefore:before,
      boardAfter:after,
      chains,
      finalBoard:cloneBoard(sim),
    });
  }
  return steps;
}

function startReplay(){
  if(!G.history.length||G.mode==='edit') return;
  cancelErase();
  const steps=buildReplaySteps();

  // 再生用パス（移動軌跡）
  const paths=[{r:G.history[0].from.r,c:G.history[0].from.c}];
  G.history.forEach(mv=>paths.push({r:mv.to.r,c:mv.to.c}));

  G.replaySteps=steps;
  G.replayPaths=paths;
  G.replayMode=true;
  G.replayStep=0;
  G.replayPlaying=false;
  G.totalCombos=[];
  G.eraseAlpha={}; G.eraseDrop={};

  document.getElementById('replay-bar').classList.remove('hidden');
  // 最初は開始盤面
  G.board=cloneBoard(steps[0].boardBefore);
  sched();
  updateComboUI();
}

// 再生: 1ステップ進む（移動→コンボ消去チェーン→次へ）
function replayAdvance(){
  if(G.replayStep>=G.replaySteps.length){ endReplay(); return; }
  const step=G.replaySteps[G.replayStep];

  // 移動後盤面を表示
  G.board=cloneBoard(step.boardAfter);
  G.totalCombos=[];
  document.getElementById('rp-step-label').textContent=`${G.replayStep+1}/${G.replaySteps.length}`;
  sched();

  // チェーンをアニメで再生
  function runChain(chainIdx){
    if(chainIdx>=step.chains.length){
      // このステップ完了、次へ
      G.board=cloneBoard(step.finalBoard);
      G.replayStep++;
      document.getElementById('rp-step-label').textContent=`${G.replayStep}/${G.replaySteps.length}`;
      sched();
      if(G.replayPlaying){
        // 自動再生中は次ステップへ
        setTimeout(()=>{ if(G.replayPlaying) replayAdvance(); }, 400);
      }
      return;
    }
    const chain=step.chains[chainIdx];
    G.totalCombos=[...G.totalCombos,...chain.combos];
    updateComboUI();
    // 消去前の盤面を復元してアニメ
    G.board=cloneBoard(chainIdx===0 ? step.boardAfter : step.chains[chainIdx-1].boardAfter);
    startEraseAnim(chain.combos, ()=>{
      G.board=cloneBoard(chain.boardAfter);
      sched();
      setTimeout(()=>runChain(chainIdx+1), 250);
    });
  }

  if(step.chains.length>0){
    setTimeout(()=>runChain(0), 100);
  } else {
    G.replayStep++;
    document.getElementById('rp-step-label').textContent=`${G.replayStep}/${G.replaySteps.length}`;
    if(G.replayPlaying) setTimeout(()=>{ if(G.replayPlaying) replayAdvance(); }, 200);
  }
}

function endReplay(){
  cancelErase();
  clearInterval(G.replayIntervalId); G.replayPlaying=false; G.replayMode=false;
  document.getElementById('replay-bar').classList.add('hidden');
  document.getElementById('btn-rp-playpause').textContent='▶';
  // 最終盤面を表示
  if(G.replaySteps.length>0){
    G.board=cloneBoard(G.replaySteps[G.replaySteps.length-1].finalBoard);
  }
  G.eraseAlpha={}; G.eraseDrop={}; G.locked=false;
  G.totalCombos=[]; updateComboUI(); sched();
}

document.getElementById('btn-rp-prev').addEventListener('click',()=>{
  if(G.replayStep<=0) return;
  cancelErase();
  G.replayStep=Math.max(0,G.replayStep-1);
  const step=G.replaySteps[G.replayStep];
  G.board=cloneBoard(step ? step.boardBefore : G.initBoard);
  G.totalCombos=[]; updateComboUI();
  document.getElementById('rp-step-label').textContent=`${G.replayStep}/${G.replaySteps.length}`;
  sched();
});
document.getElementById('btn-rp-next').addEventListener('click',()=>{
  if(G.replayStep>=G.replaySteps.length) return;
  cancelErase();
  replayAdvance();
});
document.getElementById('btn-rp-playpause').addEventListener('click',()=>{
  G.replayPlaying=!G.replayPlaying;
  document.getElementById('btn-rp-playpause').textContent=G.replayPlaying?'⏸':'▶';
  if(G.replayPlaying) replayAdvance();
});
document.getElementById('btn-rp-close').addEventListener('click',endReplay);
document.getElementById('rp-trail-check').addEventListener('change',e=>{G.showTrail=e.target.checked;sched();});

window.addEventListener('resize',()=>{resizeCanvas();sched();});
buildPalette();
resizeCanvas();
newGame();
