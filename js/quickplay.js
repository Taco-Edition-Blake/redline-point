/* ============================================================
   MODE LAUNCHERS
   ============================================================ */
function launchMatch(mode){
  gameMode = mode;
  gameActive = true;
  roundFrozen = false;
  matchStartTime = performance.now();
  weaponAmmo = {};
  const unlocked = unlockedWeaponList();
  equipWeapon(WEAPON_DEFS.indexOf(unlocked[0]));
  UI.hud.classList.remove('hidden');
  UI.clickToPlay.classList.remove('hidden');
  UI.gameCanvas.requestPointerLock();
}
UI.quickplayBtn.addEventListener('click', () => {
  UI.menu.classList.add('hidden');
  UI.oppLabel.textContent = 'BOT';
  opponent = new Opponent('soldier');
  resetPlayer(SPAWN_A);
  opponent.pos.copy(SPAWN_B);
  opponent.setPose(SPAWN_B, Math.PI);
  scoreYou = 0; scoreThem = 0; updateScoreUI();
  launchMatch('quickplay');
});
UI.onlineBtn.addEventListener('click', startOnlineMatchmaking);
UI.exitBtn.addEventListener('click', () => {
  if(confirm('Close REDLINE POINT?')){
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#171b17;color:#a9a89c;font-family:Inter,sans-serif;font-size:15px;">You can close this browser tab now.</div>';
    try{ window.close(); }catch(e){}
  }
});

/* ============================================================
   MAIN LOOP
   ============================================================ */
const clock = new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());

  if(gameActive){
    updateMovement(dt);
    if(gameMode==='quickplay') updateBot(dt);
    if(opponent) opponent.update(dt);
    updateTracers(dt);

    const def = WEAPON_DEFS[currentWeaponIndex];
    if(isLMBDown && pointerLocked && def.auto && !roundFrozen) tryFire();
    if(isReloading){
      reloadTimer -= dt;
      if(reloadTimer <= 0) finishReload();
    }

    const targetFov = isAiming ? (def.adsFov ?? ADS_FOV_DEFAULT) : HIP_FOV;
    if(Math.abs(currentFov-targetFov) > 0.05){
      currentFov += (targetFov-currentFov) * Math.min(1, dt*12);
      camera.fov = currentFov;
      camera.updateProjectionMatrix();
    }
    if(weaponViewNode){
      const targetPos = isAiming ? def.adsViewPos : def.viewPos;
      const reloadDip = isReloading ? Math.sin(Math.PI * (1 - Math.max(0,reloadTimer)/def.reloadTime)) * 0.16 : 0;
      weaponViewNode.position.x += (targetPos[0]-weaponViewNode.position.x) * Math.min(1,dt*14);
      weaponViewNode.position.y += ((targetPos[1]-reloadDip)-weaponViewNode.position.y) * Math.min(1,dt*14);
      weaponViewNode.rotation.x = reloadDip * 1.4;
      if(recoilT > 0){
        const baseZ = isAiming ? def.adsViewPos[2] : def.viewPos[2];
        weaponViewNode.position.z = baseZ + recoilT*0.08;
      }
      weaponViewNode.visible = !(isAiming && def.scopeType==='scope');
    }
    if(recoilT > 0) recoilT = Math.max(0, recoilT - dt*6);

    const scoping = isAiming && def.scopeType==='scope';
    const reddotting = isAiming && def.scopeType==='reddot';
    UI.crosshair.style.opacity = isAiming ? '0' : '1';
    UI.scopeOverlay.style.display = scoping ? 'block' : 'none';
    UI.redDot.style.display = reddotting ? 'block' : 'none';

    if(gameMode==='online'){
      lastSentState -= dt;
      if(lastSentState <= 0){
        lastSentState = 1/15;
        sendNet({ t:'s', x:yawObject.position.x, z:yawObject.position.z, ry:yawObject.rotation.y + Math.PI });
      }
    }
    if(!roundFrozen){
      const remain = Math.max(0, ROUND_LIMIT_SECONDS - Math.floor((performance.now()-matchStartTime)/1000));
      UI.timerLine.textContent = `FIRST TO ${WINS_NEEDED} \u2014 ${Math.floor(remain/60)}:${String(remain%60).padStart(2,'0')}`;
      if(remain <= 0) endMatch(scoreYou >= scoreThem);
    }
  }

  renderer.render(scene, camera);
}

/* ============================================================
   BOOT
   ============================================================ */
Promise.all([
  loadAllAssets(p => {
    UI.loadFill.style.width = (p*100).toFixed(0) + '%';
    UI.loadText.textContent = p<1 ? `Loading armory\u2026 ${Math.round(p*100)}%` : 'Ready.';
  }),
  loadProgress()
]).then(() => {
  refreshLevelBadge();
  setTimeout(() => { UI.loadingScreen.classList.add('hidden'); UI.menu.classList.remove('hidden'); }, 250);
  animate();
}).catch(err => {
  UI.loadText.textContent = 'Failed to load models: ' + err.message;
  console.error(err);
});
