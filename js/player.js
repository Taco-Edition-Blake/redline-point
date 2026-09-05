/* ============================================================
   PLAYER STATE
   ============================================================ */
let gameActive = false;
let gameMode = null;
let playerHealth = 100, playerShield = 100;
let scoreYou = 0, scoreThem = 0;
let roundFrozen = false;
let opponent = null;
let matchStartTime = 0;
let velocityY = 0, grounded = true;
const velocity = new THREE.Vector3();
const fwd = new THREE.Vector3();
const right = new THREE.Vector3();

function resetPlayer(pos){
  yawObject.position.copy(pos);
  yawObject.rotation.y = pos.equals(SPAWN_A) ? 0 : Math.PI;
  camera.rotation.x = 0;
  velocityY = 0; grounded = true; isAiming = false;
  playerHealth = 100; playerShield = 100;
  updateHpUI();
}
function applyDamageToPlayer(dmg){
  if(playerShield > 0){
    const absorbed = Math.min(playerShield, dmg);
    playerShield -= absorbed;
    dmg -= absorbed;
  }
  if(dmg > 0) playerHealth = Math.max(0, playerHealth - dmg);
  updateHpUI();
  return playerHealth <= 0;
}
function updateHpUI(){
  UI.shieldFill.style.width = Math.max(0,playerShield) + '%';
  UI.hpFill.style.width = Math.max(0,playerHealth) + '%';
  UI.hpFill.style.background = playerHealth>50 ? 'var(--good)' : (playerHealth>20 ? '#c98a3a' : 'var(--bad)');
  UI.shieldNumber.textContent = Math.max(0, Math.round(playerShield));
  UI.hpNumber.textContent = Math.max(0, Math.round(playerHealth));
}
function updateScoreUI(){ UI.scoreYou.textContent = scoreYou; UI.scoreThem.textContent = scoreThem; }
function centerMsg(html, ms){
  UI.centerMsg.innerHTML = html;
  if(ms) setTimeout(() => { if(UI.centerMsg.innerHTML===html) UI.centerMsg.innerHTML=''; }, ms);
}
function killFeed(text){
  const item = document.createElement('div');
  item.className = 'kf-item';
  item.textContent = text;
  UI.killFeed.appendChild(item);
  setTimeout(() => item.remove(), 4200);
  while(UI.killFeed.children.length > 4) UI.killFeed.removeChild(UI.killFeed.firstChild);
}
function spawnDamageNumber(worldPos, amount){
  const vec = worldPos.clone().project(camera);
  const x = (vec.x*0.5+0.5) * window.innerWidth;
  const y = (-(vec.y*0.5)+0.5) * window.innerHeight;
  const el = document.createElement('div');
  el.className = 'dmg-number';
  el.textContent = '-' + Math.max(1, Math.round(amount));
  el.style.left = x+'px'; el.style.top = y+'px';
  UI.dmgNumbers.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = 'translate(-50%,-160%)'; el.style.opacity = '0'; });
  setTimeout(() => el.remove(), 850);
}

/* ============================================================
   INPUT
   ============================================================ */
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if(gameActive){
    const slot = ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7'].indexOf(e.code);
    if(slot !== -1){
      const unlocked = unlockedWeaponList();
      if(unlocked[slot]) equipWeapon(WEAPON_DEFS.indexOf(unlocked[slot]));
    }
    if(e.code==='KeyR') tryReload();
  }
});
window.addEventListener('keyup', e => keys[e.code] = false);

let pointerLocked = false;
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === UI.gameCanvas;
  UI.clickToPlay.classList.toggle('hidden', pointerLocked || !gameActive);
});
UI.gameCanvas.addEventListener('click', () => { if(gameActive && !pointerLocked) UI.gameCanvas.requestPointerLock(); });
UI.clickToPlay.addEventListener('click', () => { if(gameActive) UI.gameCanvas.requestPointerLock(); });
UI.gameCanvas.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('mousemove', e => {
  if(!pointerLocked) return;
  yawObject.rotation.y -= e.movementX * 0.0022;
  camera.rotation.x = Math.max(-1.3, Math.min(1.3, camera.rotation.x - e.movementY * 0.0022));
});
window.addEventListener('mousedown', e => {
  if(e.button===0 && pointerLocked && gameActive){ isLMBDown = true; tryFire(); }
  if(e.button===2 && pointerLocked && gameActive) isAiming = true;
});
window.addEventListener('mouseup', e => {
  if(e.button===0) isLMBDown = false;
  if(e.button===2) isAiming = false;
});

/* ============================================================
   COMBAT
   ============================================================ */
function tryFire(){
  const def = WEAPON_DEFS[currentWeaponIndex];
  if(isReloading || roundFrozen) return;
  const state = ammoState(def);
  if(state.mag <= 0) return;
  const now = performance.now()/1000;
  if(now - lastFireTime < def.rate) return;
  lastFireTime = now;
  recoilT = 1;

  if(gameMode==='online') sendNet({ t:'shot' });

  const spread = isAiming ? def.adsSpread : def.spread;
  const muzzleOrigin = (weaponViewNode || camera).getWorldPosition(new THREE.Vector3());
  const camOrigin = camera.getWorldPosition(new THREE.Vector3());
  const camQuat = camera.getWorldQuaternion(new THREE.Quaternion());
  const baseDir = new THREE.Vector3(0,0,-1).applyQuaternion(camQuat);
  const rightVec = new THREE.Vector3(1,0,0).applyQuaternion(camQuat);
  const upVec = new THREE.Vector3(0,1,0).applyQuaternion(camQuat);
  const box = opponent ? opponent.hitBox() : null;

  let hits = 0, firstHitPoint = null;
  for(let i=0;i<def.pellets;i++){
    const theta = Math.random()*Math.PI*2;
    const r = spread * Math.sqrt(Math.random());
    const dir = baseDir.clone()
      .addScaledVector(rightVec, Math.cos(theta)*r)
      .addScaledVector(upVec, Math.sin(theta)*r)
      .normalize();

    const wallHit = raycastObstacles(camOrigin, dir, 40);
    let hitPoint = null;
    if(box){
      const target = new THREE.Vector3();
      if(new THREE.Ray(camOrigin, dir).intersectBox(box, target)){
        const distToOpp = camOrigin.distanceTo(target);
        if(distToOpp < wallHit.dist - 0.02){
          hits++; hitPoint = target;
          if(!firstHitPoint) firstHitPoint = target.clone();
        }
      }
    }
    if(i < 3){
      const far = hitPoint || wallHit.point;
      spawnTracer(muzzleOrigin, far.clone().sub(muzzleOrigin).normalize(), muzzleOrigin.distanceTo(far));
    }
  }

  state.mag -= 1;
  updateAmmoUI();
  if(hits > 0 && opponent){
    const dmg = def.dmg * hits;
    spawnDamageNumber(firstHitPoint, dmg);
    if(gameMode==='quickplay'){ if(opponent.applyDamage(dmg)) onOpponentKilled(); }
    else if(gameMode==='online'){ sendNet({ t:'hit', d:dmg }); }
  }
}

function onOpponentKilled(){
  scoreYou++; updateScoreUI();
  killFeed(gameMode==='online' ? 'You eliminated your opponent' : 'You eliminated the bot');
  centerMsg('ROUND TO YOU <small>+250 XP</small>', 1800);
  awardXp(250);
  roundFrozen = true;
  if(scoreYou >= WINS_NEEDED){ endMatch(true); return; }
  setTimeout(startRound, 1900);
}
function onPlayerKilled(){
  scoreThem++; updateScoreUI();
  killFeed(gameMode==='online' ? 'Your opponent eliminated you' : 'The bot eliminated you');
  centerMsg('ROUND LOST', 1800);
  roundFrozen = true;
  if(scoreThem >= WINS_NEEDED){ endMatch(false); return; }
  setTimeout(startRound, 1900);
}
function startRound(){
  roundFrozen = false;
  resetPlayer(SPAWN_A);
  if(opponent){
    opponent.health = 100; opponent.shield = 100; opponent.hopY = 0;
    opponent.setPose(SPAWN_B, Math.PI); opponent.pos.copy(SPAWN_B);
  }
  if(gameMode==='online') sendNet({ t:'roundready' });
}
function endMatch(won){
  gameActive = false;
  document.exitPointerLock();
  const bonus = won ? 500 : 100;
  const rewardMsg = awardXp(bonus);
  centerMsg((won?'VICTORY':'DEFEAT') + `<small>+${bonus} XP${rewardMsg}<br>Returning to menu&hellip;</small>`, 3400);
  if(gameMode==='online') teardownNetwork();
  setTimeout(() => {
    UI.hud.classList.add('hidden');
    UI.clickToPlay.classList.add('hidden');
    if(opponent){ opponent.remove(); opponent = null; }
    refreshLevelBadge();
    UI.menu.classList.remove('hidden');
  }, 3400);
}

/* ============================================================
   MOVEMENT
   ============================================================ */
function updateMovement(dt){
  if(!pointerLocked || roundFrozen) return;
  const sprinting = (keys.ShiftLeft || keys.ShiftRight) && !isAiming;
  const speed = isAiming ? ADS_WALK_SPEED : (sprinting ? SPRINT_SPEED : WALK_SPEED);
  fwd.set(0,0,-1).applyQuaternion(yawObject.quaternion); fwd.y = 0; fwd.normalize();
  right.set(1,0,0).applyQuaternion(yawObject.quaternion); right.y = 0; right.normalize();
  velocity.set(0,0,0);
  if(keys.KeyW) velocity.add(fwd);
  if(keys.KeyS) velocity.sub(fwd);
  if(keys.KeyD) velocity.add(right);
  if(keys.KeyA) velocity.sub(right);
  if(velocity.lengthSq() > 0) velocity.normalize().multiplyScalar(speed*dt);
  const next = yawObject.position.clone().add(velocity);
  resolveCollision(next, 0.5);
  yawObject.position.x = next.x;
  yawObject.position.z = next.z;

  if(keys.Space && grounded){ velocityY = JUMP_SPEED; grounded = false; }
  velocityY += GRAVITY*dt;
  yawObject.position.y += velocityY*dt;
  if(yawObject.position.y <= EYE_HEIGHT){ yawObject.position.y = EYE_HEIGHT; velocityY = 0; grounded = true; }
}

/* ============================================================
   BOT AI (quickplay)
   ============================================================ */
let botFireCooldown = 0, botStrafeDir = 1, botStrafeT = 0, botSprinting = true;
let botVelocityY = 0, botGrounded = true, botJumpTimer = 1.5;

function updateBot(dt){
  if(!opponent || roundFrozen) return;
  const toPlayer = new THREE.Vector3().subVectors(yawObject.position, opponent.pos); toPlayer.y = 0;
  const dist = toPlayer.length();
  const dir = toPlayer.clone().normalize();

  botStrafeT += dt;
  if(botStrafeT > 2.2){ botStrafeT = 0; botStrafeDir *= -1; botSprinting = Math.random() < 0.75; }
  const strafe = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(botStrafeDir);
  const move = new THREE.Vector3();
  if(dist > 9) move.add(dir);
  else if(dist < 4) move.sub(dir);
  move.add(strafe.multiplyScalar(0.6));
  const botSpeed = botSprinting ? SPRINT_SPEED : WALK_SPEED;
  if(move.lengthSq() > 0) move.normalize().multiplyScalar(botSpeed*dt);
  const next = opponent.pos.clone().add(move);
  resolveCollision(next, 0.5);
  opponent.setPose(next, Math.atan2(-dir.x, -dir.z));

  botJumpTimer -= dt;
  if(botJumpTimer <= 0){
    botJumpTimer = 1.2 + Math.random()*2.2;
    if(botGrounded && Math.random() < 0.55){ botVelocityY = JUMP_SPEED; botGrounded = false; }
  }
  if(!botGrounded || opponent.hopY > 0){
    botVelocityY += GRAVITY*dt;
    opponent.hopY = Math.max(0, opponent.hopY + botVelocityY*dt);
    if(opponent.hopY <= 0){ opponent.hopY = 0; botVelocityY = 0; botGrounded = true; }
  }

  botFireCooldown -= dt;
  if(botFireCooldown <= 0 && dist < 16){
    botFireCooldown = 0.55 + Math.random()*0.5;
    const missChance = Math.min(0.8, 0.32 + dist/24);
    const aimDir = dir.clone();
    aimDir.x += (Math.random()-0.5)*0.14;
    aimDir.z += (Math.random()-0.5)*0.14;
    aimDir.normalize();
    const muzzle = opponent.gunNode.getWorldPosition(new THREE.Vector3());
    const wallHit = raycastObstacles(muzzle, aimDir, dist+2);
    const blocked = wallHit.dist < dist - 0.3;
    spawnTracer(muzzle, aimDir, blocked ? wallHit.dist : dist+2);
    if(!blocked && Math.random() > missChance){
      if(applyDamageToPlayer(8 + Math.random()*10)) onPlayerKilled();
    }
  }
}
