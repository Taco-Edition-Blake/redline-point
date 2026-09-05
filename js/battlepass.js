/* ============================================================
   BATTLE PASS / PROGRESSION
   ============================================================ */
const MAX_LEVEL = 100;
function xpForLevel(n){ return Math.round(1500 + 35*n + 4*Math.pow(n, 1.6)); }
function levelFromXp(totalXp){
  let level = 0, spent = 0;
  while(level < MAX_LEVEL){
    const need = xpForLevel(level+1);
    if(spent + need > totalXp) break;
    spent += need; level++;
  }
  return { level, into: totalXp - spent, need: level < MAX_LEVEL ? xpForLevel(level+1) : 0 };
}
function tierReward(n){
  if(n === MAX_LEVEL) return { type:'weapon', label:'BAZOOKA' };
  if(n % 20 === 0){
    const w = WEAPON_DEFS.find(w => w.unlockLevel === n);
    return { type:'weapon', label: w ? w.name : 'New Weapon' };
  }
  return { type:'crate', label:'Gun Crate' };
}
let progress = { totalXp: 0, gold: 0 };
async function loadProgress(){
  try{
    const raw = localStorage.getItem('redline_bp_progress');
    if(raw){ const p = JSON.parse(raw); if(p) progress = { totalXp:p.totalXp||0, gold:p.gold||0 }; }
  }catch(e){ /* private browsing or storage disabled — just start fresh */ }
}
function saveProgress(){
  try{ localStorage.setItem('redline_bp_progress', JSON.stringify(progress)); }catch(e){ /* storage unavailable, progress just won't persist */ }
}
function unlockedWeaponList(){
  const lvl = levelFromXp(progress.totalXp).level;
  return WEAPON_DEFS.filter(w => w.unlockLevel <= lvl);
}
function awardXp(amount){
  const before = levelFromXp(progress.totalXp).level;
  progress.totalXp += amount;
  const after = levelFromXp(progress.totalXp).level;
  let rewardMsg = '';
  for(let lvl = before+1; lvl <= after; lvl++){
    const r = tierReward(lvl);
    if(r.type === 'weapon'){
      rewardMsg += `<br>LEVEL ${lvl}: UNLOCKED ${r.label}`;
    } else {
      const gold = 40 + Math.floor(Math.random()*90);
      progress.gold += gold;
      rewardMsg += `<br>LEVEL ${lvl}: Gun Crate (+${gold} gold)`;
    }
  }
  saveProgress();
  refreshLevelBadge();
  return rewardMsg;
}
function refreshLevelBadge(){
  const lvl = levelFromXp(progress.totalXp).level;
  UI.menuLevelBadge.innerHTML = `LEVEL <b>${lvl}</b> &middot; ${progress.gold} GOLD`;
}
function renderBattlePassPanel(){
  const info = levelFromXp(progress.totalXp);
  UI.bpLevelNum.textContent = info.level;
  UI.bpGoldNum.textContent = progress.gold;
  const pct = info.level >= MAX_LEVEL ? 100 : Math.min(100, (info.into/info.need)*100);
  UI.bpXpFill.style.width = pct + '%';
  UI.bpXpText.textContent = info.level >= MAX_LEVEL ? 'MAX LEVEL REACHED' : `${info.into} / ${info.need} XP to next level`;
  UI.bpTierList.innerHTML = '';
  for(let n=1;n<=MAX_LEVEL;n++){
    const r = tierReward(n);
    const row = document.createElement('div');
    row.className = 'bp-tier' + (n>info.level ? ' locked' : '') + (n===info.level+1 ? ' current' : '');
    row.innerHTML = `<span class="tnum">LV ${n}</span><span class="treward">${r.label}</span><span class="tstate">${n<=info.level?'UNLOCKED':(n===info.level+1?'NEXT':'LOCKED')}</span>`;
    UI.bpTierList.appendChild(row);
  }
}
UI.battlePassBtn.addEventListener('click', () => {
  renderBattlePassPanel();
  UI.menu.classList.add('hidden');
  UI.battlePassPanel.classList.remove('hidden');
});
UI.bpCloseBtn.addEventListener('click', () => {
  UI.battlePassPanel.classList.add('hidden');
  UI.menu.classList.remove('hidden');
});

/* ============================================================
   AUDIO (lightweight procedural reload sounds — no external files)
   ============================================================ */
let audioCtx = null;
function beep(freq, duration, delay, volume){
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime + (delay||0);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume||0.15, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(t0); osc.stop(t0 + duration);
  }catch(e){}
}
function playReloadStartSound(){ beep(220, 0.06, 0, 0.12); beep(180, 0.05, 0.08, 0.10); }
function playReloadDoneSound(){ beep(340, 0.05, 0, 0.14); beep(520, 0.07, 0.06, 0.14); }
