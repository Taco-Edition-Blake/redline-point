/* ============================================================
   CONSTANTS
   ============================================================ */
let ARENA_HALF_X = 12;   // overwritten once the real map loads and reports its footprint
let ARENA_HALF_Z = 8;
const EYE_OFFSET = 1.7;  // height of the camera above whatever ground point is under it
const GRAVITY = -24;
const JUMP_SPEED = 7.4;
const WALK_SPEED = 5.2;
const SPRINT_SPEED = 8.4;
const ADS_WALK_SPEED = 3.0;
const HIP_FOV = 72;
const ADS_FOV_DEFAULT = 46;
const WINS_NEEDED = 3;
const ROUND_LIMIT_SECONDS = 180;
const TRACER_LIFE = 0.09;
const TRACER_POOL_SIZE = 24;
const SPAWN_A = new THREE.Vector3(0, 0, -6.5);
const SPAWN_B = new THREE.Vector3(0, 0, 6.5);

const WEAPON_DEFS = [
  { key:'pistol', name:'PISTOL', unlockLevel:0, dmg:16, rate:0.30, pellets:1, spread:0.020, adsSpread:0.006,
    viewPos:[0.30,-0.28,-0.52], adsViewPos:[0,-0.17,-0.36], viewRot:[0,0,0],
    adsFov:55, scopeType:'none', magSize:10, reserveSize:70, reloadTime:1.0 },
  { key:'shotgun', name:'SHOTGUN', unlockLevel:0, dmg:11, rate:0.95, pellets:8, spread:0.12, adsSpread:0.07,
    viewPos:[0.32,-0.34,-0.62], adsViewPos:[0,-0.21,-0.40], viewRot:[0,Math.PI*0.5,0],
    adsFov:46, scopeType:'none', magSize:6, reserveSize:36, reloadTime:2.4 },
  { key:'submachine', name:'SUBMACHINE GUN', unlockLevel:20, dmg:13, rate:0.085, pellets:1, spread:0.030, adsSpread:0.008,
    viewPos:[0.30,-0.30,-0.55], adsViewPos:[0,-0.19,-0.38], viewRot:[0,Math.PI*0.5,0],
    adsFov:60, scopeType:'reddot', auto:true, magSize:32, reserveSize:192, reloadTime:1.7 },
  { key:'mpsd', name:'MPSD', unlockLevel:40, dmg:15, rate:0.10, pellets:1, spread:0.026, adsSpread:0.007,
    viewPos:[0.30,-0.30,-0.55], adsViewPos:[0,-0.19,-0.38], viewRot:[0,0,0],
    adsFov:58, scopeType:'reddot', auto:true, magSize:24, reserveSize:168, reloadTime:1.8 },
  { key:'sniper', name:'SNIPER RIFLE', unlockLevel:60, dmg:100, rate:1.5, pellets:1, spread:0.0012, adsSpread:0.0001,
    viewPos:[0.32,-0.32,-0.75], adsViewPos:[0,-0.20,-0.42], viewRot:[0,Math.PI*0.5,0],
    adsFov:10, scopeType:'scope', magSize:5, reserveSize:25, reloadTime:2.6 },
  { key:'scarh', name:'SCAR-H', unlockLevel:80, dmg:32, rate:0.14, pellets:1, spread:0.020, adsSpread:0.005,
    viewPos:[0.30,-0.30,-0.60], adsViewPos:[0,-0.19,-0.38], viewRot:[0,Math.PI*0.5,0],
    adsFov:50, scopeType:'reddot', auto:true, magSize:28, reserveSize:168, reloadTime:2.1 },
  { key:'bazooka', name:'BAZOOKA', unlockLevel:100, dmg:180, rate:1.8, pellets:1, spread:0.010, adsSpread:0.004,
    viewPos:[0.30,-0.34,-0.70], adsViewPos:[0,-0.20,-0.44], viewRot:[0,Math.PI*0.5,0],
    adsFov:55, scopeType:'none', magSize:1, reserveSize:3, reloadTime:2.9 },
];

const MODEL_PATHS = {
  map:        'https://github.com/Taco-Edition-Blake/redline-point/releases/download/assets/map.glb',
  pistol:     '3D/pistol.glb',
  shotgun:    '3D/shotgun.glb',
  submachine: '3D/submachine.glb',
  mpsd:       '3D/mpsd.glb',
  sniper:     '3D/sniper.glb',
  scarh:      '3D/scarh.glb',
  bazooka:    '3D/bazooka.glb',
  soldier:    '3D/soldier.glb',
  swat:       '3D/swat.glb',
};

/* ============================================================
   CACHED DOM REFS (avoid repeated getElementById in hot paths)
   ============================================================ */
const UI = {};
['loadingScreen','loadFill','loadText','menu','searchPanel','searchStatus','cancelSearch',
 'clickToPlay','dmgNumbers','gameCanvas','hud','crosshair','redDot','scopeOverlay',
 'shieldFill','shieldNumber','hpFill','hpNumber','weaponName','weaponHint','ammoLine',
 'scoreYou','scoreThem','oppLabel','timerLine','killFeed','centerMsg',
 'quickplayBtn','onlineBtn','exitBtn',
 'battlePassBtn','battlePassPanel','bpCloseBtn','bpLevelNum','bpGoldNum','bpXpFill','bpXpText','bpTierList','menuLevelBadge',
 'pauseOverlay','resumeBtn','pauseHomeBtn'
].forEach(id => UI[id] = document.getElementById(id));

/* ============================================================
   SCENE / RENDERER
   ============================================================ */
const renderer = new THREE.WebGLRenderer({ canvas: UI.gameCanvas, antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc6e8);
scene.fog = new THREE.Fog(0x8fc6e8, 26, 90);

const camera = new THREE.PerspectiveCamera(HIP_FOV, window.innerWidth/window.innerHeight, 0.05, 200);
const yawObject = new THREE.Object3D();
yawObject.position.copy(SPAWN_A);
yawObject.add(camera);
scene.add(yawObject);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
renderer.setSize(window.innerWidth, window.innerHeight);

scene.add(new THREE.HemisphereLight(0xcfd8c0, 0x1b1f16, 0.9));
const sun = new THREE.DirectionalLight(0xfff2df, 1.05);
sun.position.set(12, 20, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -25; sun.shadow.camera.right = 25;
sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25;
scene.add(sun);

/* ============================================================
   ARENA (loaded from the real map model — collision is generated
   automatically from its geometry once it loads, see loadAllAssets)
   ============================================================ */
let mapRoot = null;
const obstacleBoxes = [];
const _groundRay = new THREE.Raycaster();
const _groundOrigin = new THREE.Vector3();
const _groundDir = new THREE.Vector3(0, -1, 0);

function getGroundHeight(x, z, fallback){
  if(!mapRoot) return fallback;
  _groundOrigin.set(x, 60, z);
  _groundRay.set(_groundOrigin, _groundDir);
  _groundRay.far = 140;
  const hits = _groundRay.intersectObject(mapRoot, true);
  return hits.length ? hits[0].point.y : fallback;
}

function buildMapCollision(root){
  const box = new THREE.Box3();
  root.traverse(node => {
    if(!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    // "Plane"-named meshes are the terrain/ground itself — used only for the
    // ground-height raycast above, not as a horizontal-blocking obstacle.
    if(/^plane/i.test(node.name)) return;
    box.setFromObject(node);
    const size = new THREE.Vector3();
    box.getSize(size);
    if(size.x < 0.05 || size.z < 0.05) return; // skip degenerate/paper-thin decor
    obstacleBoxes.push(box.clone());
  });
  const full = new THREE.Box3().setFromObject(root);
  ARENA_HALF_X = Math.max(2, full.max.x - 1);
  ARENA_HALF_Z = Math.max(2, full.max.z - 1);
}

function raycastObstacles(origin, dir, maxRange){
  let nearestDist = maxRange;
  let nearestPoint = origin.clone().add(dir.clone().multiplyScalar(maxRange));
  const ray = new THREE.Ray(origin, dir);
  const pt = new THREE.Vector3();
  for(const b of obstacleBoxes){
    if(ray.intersectBox(b, pt)){
      const d = origin.distanceTo(pt);
      if(d < nearestDist){ nearestDist = d; nearestPoint = pt.clone(); }
    }
  }
  return { dist: nearestDist, point: nearestPoint };
}

function resolveCollision(pos, feetY, radius){
  for(const box of obstacleBoxes){
    if(feetY >= box.max.y - 0.08) continue; // standing on top of this object — don't push sideways off it
    const cx = Math.max(box.min.x, Math.min(pos.x, box.max.x));
    const cz = Math.max(box.min.z, Math.min(pos.z, box.max.z));
    const dx = pos.x-cx, dz = pos.z-cz;
    const distSq = dx*dx + dz*dz;
    if(distSq < radius*radius){
      const dist = Math.sqrt(distSq) || 0.0001;
      const push = radius - dist;
      pos.x += (dx/dist)*push;
      pos.z += (dz/dist)*push;
    }
  }
  pos.x = Math.max(-ARENA_HALF_X, Math.min(ARENA_HALF_X, pos.x));
  pos.z = Math.max(-ARENA_HALF_Z, Math.min(ARENA_HALF_Z, pos.z));
}

/* ============================================================
   ASSET LOADING
   ============================================================ */
const loader = new THREE.GLTFLoader();
function loadModel(key){
  return new Promise((resolve, reject) => {
    loader.load(MODEL_PATHS[key], resolve, undefined,
      err => reject(new Error('Could not load ' + MODEL_PATHS[key] +
        ' \u2014 make sure the "3D" folder sits next to index.html. (' + (err && err.message || err) + ')')));
  });
}
function normalizeByHeight(obj, targetH){
  const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
  obj.scale.setScalar(targetH / (size.y || 1));
  obj.position.y -= new THREE.Box3().setFromObject(obj).min.y;
  return obj;
}
function normalizeByLength(obj, targetLen){
  const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
  obj.scale.setScalar(targetLen / (Math.max(size.x,size.y,size.z) || 1));
  return obj;
}

const weaponModels = {};
const characterModels = {};

async function loadAllAssets(onProgress){
  const keys = Object.keys(MODEL_PATHS);
  for(let i=0;i<keys.length;i++){
    const key = keys[i];
    const gltf = await loadModel(key);
    if(key==='map'){
      mapRoot = gltf.scene;
      scene.add(mapRoot);
      buildMapCollision(mapRoot);
    } else if(key==='soldier' || key==='swat'){
      normalizeByHeight(gltf.scene, 1.8);
      characterModels[key] = gltf;
    } else {
      normalizeByLength(gltf.scene, 0.62);
      weaponModels[key] = gltf.scene;
    }
    onProgress((i+1)/keys.length);
  }
}

/* ============================================================
   TRACER POOL (reused meshes — avoids per-shot alloc/GC churn)
   ============================================================ */
const UP_AXIS = new THREE.Vector3(0,1,0);
const tracerGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6, 1, true);
const tracerPool = [];
for(let i=0;i<TRACER_POOL_SIZE;i++){
  const mesh = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color:0xfff0b8, transparent:true, opacity:0 }));
  mesh.visible = false;
  scene.add(mesh);
  tracerPool.push({ mesh, life:0 });
}
let tracerCursor = 0;
function spawnTracer(origin, dir, length){
  length = Math.max(0.4, length);
  const slot = tracerPool[tracerCursor];
  tracerCursor = (tracerCursor+1) % tracerPool.length;
  slot.mesh.scale.set(1, length, 1);
  slot.mesh.position.copy(origin).addScaledVector(dir, length/2);
  slot.mesh.quaternion.setFromUnitVectors(UP_AXIS, dir);
  slot.mesh.visible = true;
  slot.mesh.material.opacity = 0.95;
  slot.life = TRACER_LIFE;
}
function updateTracers(dt){
  for(const t of tracerPool){
    if(t.life <= 0) continue;
    t.life -= dt;
    if(t.life <= 0){ t.mesh.visible = false; }
    else t.mesh.material.opacity = (t.life/TRACER_LIFE) * 0.95;
  }
}

