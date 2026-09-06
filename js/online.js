/* ============================================================
   NETWORKING (WebRTC matchmaking via shared storage as a lobby board)
   ============================================================ */
let pc=null, dc=null, netRole=null, searchTimeout=null, netPollInterval=null, myLobbyKey=null, lastSentState=0;
function log(...a){ console.log('[net]', ...a); }

async function waitIceComplete(pc, timeoutMs=4000){
  if(pc.iceGatheringState==='complete') return;
  await new Promise(resolve => {
    let done = false;
    const t = setTimeout(() => { if(!done){ done=true; resolve(); } }, timeoutMs);
    pc.addEventListener('icegatheringstatechange', function h(){
      if(pc.iceGatheringState==='complete' && !done){
        done = true; clearTimeout(t); resolve();
        pc.removeEventListener('icegatheringstatechange', h);
      }
    });
  });
}
function setupDataChannelHandlers(){
  dc.onopen = () => { log('datachannel open'); beginOnlineMatch(); };
  dc.onclose = () => { if(gameActive) handleOpponentLeft(); };
  dc.onmessage = ev => { let msg; try{ msg = JSON.parse(ev.data); }catch(e){ return; } handleNetMessage(msg); };
}
function handleNetMessage(msg){
  if(!opponent) return;
  if(msg.t==='s'){
    opponent.setPose(new THREE.Vector3(msg.x,0,msg.z), msg.ry);
  } else if(msg.t==='hit'){
    if(roundFrozen) return;
    if(applyDamageToPlayer(msg.d)){ sendNet({ t:'died' }); onPlayerKilled(); }
  } else if(msg.t==='died'){
    onOpponentKilled();
  }
}
function sendNet(obj){ if(dc && dc.readyState==='open') dc.send(JSON.stringify(obj)); }

async function startOnlineMatchmaking(){
  if(typeof window.storage === 'undefined'){
    alert('Online matchmaking needs a shared backend to pair two players, which this deployed site doesn\'t have yet (it relied on a Claude.ai-only feature that isn\'t part of a real website). Use Quickplay for now — ask about a friend-code / PeerJS-based version if you want real online play on the deployed site.');
    return;
  }
  UI.menu.classList.add('hidden');
  UI.searchPanel.classList.remove('hidden');
  UI.searchStatus.textContent = 'Looking for another player who has this page open\u2026';

  const myId = Math.random().toString(36).slice(2,10);
  pc = new RTCPeerConnection({ iceServers:[{ urls:'stun:stun.l.google.com:19302' }] });
  pc.onconnectionstatechange = () => {
    if((pc.connectionState==='failed' || pc.connectionState==='disconnected') && !gameActive){
      failSearch('Connection to the other player failed. Their network may block direct connections.');
    }
  };
  searchTimeout = setTimeout(() => failSearch('No opponent found in time.'), 45000);

  let joined = false;
  try{
    const list = await window.storage.list('lobby:', true);
    for(const k of (list && list.keys) || []){
      let entry; try{ entry = await window.storage.get(k, true); }catch(e){ continue; }
      if(!entry) continue;
      let data; try{ data = JSON.parse(entry.value); }catch(e){ continue; }
      if(data.status==='waiting' && (Date.now()-data.ts) < 40000 && data.hostId!==myId){
        joined = await tryJoinLobby(k, data, myId);
        if(joined) break;
      }
    }
  }catch(e){ log('lobby scan failed', e); }

  if(!joined) await hostLobby(myId);
}
async function hostLobby(myId){
  netRole = 'host';
  dc = pc.createDataChannel('game');
  setupDataChannelHandlers();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIceComplete(pc);
  myLobbyKey = 'lobby:' + myId;
  await window.storage.set(myLobbyKey, JSON.stringify({ status:'waiting', hostId:myId, offer:pc.localDescription.sdp, ts:Date.now() }), true);
  netPollInterval = setInterval(async () => {
    try{
      const res = await window.storage.get(myLobbyKey, true);
      if(!res) return;
      const data = JSON.parse(res.value);
      if(data.status==='matched' && data.answer && pc.signalingState==='have-local-offer'){
        await pc.setRemoteDescription({ type:'answer', sdp:data.answer });
        clearInterval(netPollInterval); netPollInterval = null;
        UI.searchStatus.textContent = 'Opponent found. Connecting\u2026';
      }
    }catch(e){}
  }, 1200);
}
async function tryJoinLobby(key, hostData, myId){
  try{
    netRole = 'guest';
    pc.ondatachannel = ev => { dc = ev.channel; setupDataChannelHandlers(); };
    await pc.setRemoteDescription({ type:'offer', sdp:hostData.offer });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitIceComplete(pc);
    await window.storage.set(key, JSON.stringify({ status:'matched', hostId:hostData.hostId, offer:hostData.offer, answer:pc.localDescription.sdp, guestId:myId, ts:Date.now() }), true);
    UI.searchStatus.textContent = 'Opponent found. Connecting\u2026';
    return true;
  }catch(e){ log('join failed', e); return false; }
}
function failSearch(reason){
  cleanupNetAttempt();
  UI.searchPanel.classList.add('hidden');
  UI.menu.classList.remove('hidden');
  alert(reason + '\n\nTry Quickplay instead, or search again in a moment.');
}
function cleanupNetAttempt(){
  if(searchTimeout){ clearTimeout(searchTimeout); searchTimeout = null; }
  if(netPollInterval){ clearInterval(netPollInterval); netPollInterval = null; }
  if(myLobbyKey){ window.storage.delete(myLobbyKey, true).catch(()=>{}); myLobbyKey = null; }
}
function teardownNetwork(){
  cleanupNetAttempt();
  if(dc){ try{ dc.close(); }catch(e){} dc = null; }
  if(pc){ try{ pc.close(); }catch(e){} pc = null; }
}
function handleOpponentLeft(){
  if(!gameActive) return;
  gameActive = false;
  document.exitPointerLock();
  centerMsg('OPPONENT DISCONNECTED<small>Returning to menu&hellip;</small>', 2600);
  teardownNetwork();
  setTimeout(() => {
    UI.hud.classList.add('hidden');
    if(opponent){ opponent.remove(); opponent = null; }
    UI.menu.classList.remove('hidden');
  }, 2600);
}
UI.cancelSearch.addEventListener('click', () => {
  teardownNetwork();
  UI.searchPanel.classList.add('hidden');
  UI.menu.classList.remove('hidden');
});
function beginOnlineMatch(){
  cleanupNetAttempt();
  UI.searchPanel.classList.add('hidden');
  UI.oppLabel.textContent = 'OPPONENT';
  opponent = new Opponent(netRole==='host' ? 'swat' : 'soldier');
  const mySpawn = netRole==='host' ? SPAWN_A : SPAWN_B;
  const oppSpawn = netRole==='host' ? SPAWN_B : SPAWN_A;
  resetPlayer(mySpawn);
  opponent.pos.copy(oppSpawn);
  opponent.setPose(oppSpawn, netRole==='host' ? Math.PI : 0);
  scoreYou = 0; scoreThem = 0; updateScoreUI();
  launchMatch('online');
}
