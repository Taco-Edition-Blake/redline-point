/* ============================================================
   WEAPON VIEW MODEL (player-held)
   ============================================================ */
let currentWeaponIndex = 0;
let weaponViewNode = null;
let weaponAmmo = {};
let isReloading = false;
let reloadTimer = 0;
let isLMBDown = false;
let isAiming = false;
let currentFov = HIP_FOV;
let lastFireTime = -999;
let recoilT = 0;

function ammoState(def){
  if(!weaponAmmo[def.key]) weaponAmmo[def.key] = { mag: def.magSize, reserve: def.reserveSize };
  return weaponAmmo[def.key];
}
let ammoTickEls = [];
let ammoReserveEl = null;
function buildAmmoTicks(def){
  UI.ammoLine.innerHTML = '';
  const ticks = document.createElement('div');
  ticks.className = 'ammo-ticks';
  ammoTickEls = [];
  for(let i=0;i<def.magSize;i++){
    const t = document.createElement('div');
    t.className = 'ammo-tick';
    ticks.appendChild(t);
    ammoTickEls.push(t);
  }
  ammoReserveEl = document.createElement('div');
  ammoReserveEl.className = 'ammo-reserve';
  UI.ammoLine.appendChild(ticks);
  UI.ammoLine.appendChild(ammoReserveEl);
}
function updateAmmoUI(){
  const def = WEAPON_DEFS[currentWeaponIndex];
  const state = ammoState(def);
  ammoTickEls.forEach((el,i) => el.classList.toggle('spent', i >= state.mag));
  if(ammoReserveEl) ammoReserveEl.textContent = isReloading ? 'RELOADING\u2026 [R]' : `${state.reserve} in reserve`;
}
function tryReload(){
  if(!gameActive || roundFrozen) return;
  const def = WEAPON_DEFS[currentWeaponIndex];
  const state = ammoState(def);
  if(isReloading || state.mag >= def.magSize || state.reserve <= 0) return;
  isReloading = true;
  reloadTimer = def.reloadTime;
  playReloadStartSound();
  updateAmmoUI();
}
function finishReload(){
  const def = WEAPON_DEFS[currentWeaponIndex];
  const state = ammoState(def);
  const needed = def.magSize - state.mag;
  const loaded = Math.min(needed, state.reserve);
  state.mag += loaded;
  state.reserve -= loaded;
  isReloading = false;
  playReloadDoneSound();
  updateAmmoUI();
}
function equipWeapon(index){
  currentWeaponIndex = index;
  const def = WEAPON_DEFS[index];
  ammoState(def);
  if(weaponViewNode) camera.remove(weaponViewNode);
  weaponViewNode = weaponModels[def.key].clone(true);
  weaponViewNode.position.set(...def.viewPos);
  weaponViewNode.rotation.set(...def.viewRot);
  weaponViewNode.traverse(n => { if(n.isMesh) n.castShadow = n.receiveShadow = false; });
  camera.add(weaponViewNode);
  UI.weaponName.textContent = def.name;
  UI.crosshair.classList.toggle('circle', def.key==='shotgun');
  isReloading = false;
  reloadTimer = 0;
  lastFireTime = -999;
  buildAmmoTicks(def);
  updateAmmoUI();
}

/* ============================================================
   OPPONENT (bot or networked peer)
   ============================================================ */
class Opponent {
  constructor(charKey){
    const gltf = characterModels[charKey];
    this.root = gltf.scene.clone(true);
    this.root.traverse(n => { if(n.isMesh) n.castShadow = true; });
    scene.add(this.root);

    this.gunNode = weaponModels['mpsd'].clone(true);
    this.gunNode.position.set(0.30, 1.22, 0.18);
    this.gunNode.rotation.set(0, 0, 0);
    this.gunNode.traverse(n => { if(n.isMesh) n.castShadow = true; });
    this.root.add(this.gunNode);

    this.mixer = null;
    if(gltf.animations && gltf.animations.length){
      this.mixer = new THREE.AnimationMixer(this.root);
      const clip = gltf.animations.find(c => /walk|run|idle/i.test(c.name)) || gltf.animations[0];
      this.mixer.clipAction(clip).play();
    }
    this.shield = 100;
    this.health = 100;
    this.physics = { feetY: 0, velocityY: 0, grounded: true };
    this.wantsJump = false;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.targetPos = new THREE.Vector3();
    this.targetYaw = 0;
  }
  applyDamage(dmg){
    if(this.shield > 0){
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
    }
    if(dmg > 0) this.health = Math.max(0, this.health - dmg);
    return this.health <= 0;
  }
  setPose(pos, yaw){ this.targetPos.copy(pos); this.targetYaw = yaw; }
  update(dt){
    this.pos.lerp(this.targetPos, Math.min(1, dt*10));
    applyGroundPhysics(this.physics, this.pos.x, this.pos.z, dt, this.wantsJump);
    this.wantsJump = false;
    this.root.position.set(this.pos.x, this.physics.feetY, this.pos.z);
    let dy = this.targetYaw - this.yaw;
    while(dy > Math.PI) dy -= Math.PI*2;
    while(dy < -Math.PI) dy += Math.PI*2;
    this.yaw += dy * Math.min(1, dt*10);
    this.root.rotation.y = this.yaw + Math.PI;
    if(this.mixer) this.mixer.update(dt);
  }
  hitBox(){
    const y0 = this.physics.feetY;
    return new THREE.Box3(
      new THREE.Vector3(this.pos.x-0.45, y0, this.pos.z-0.45),
      new THREE.Vector3(this.pos.x+0.45, y0+1.85, this.pos.z+0.45)
    );
  }
  remove(){ scene.remove(this.root); }
}
