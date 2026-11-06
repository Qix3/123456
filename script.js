/**
 * Анатомия глаза — интерактивная 3D-модель для урока физиологии
 * Зависимости: Three.js r128 (CDN)
 * Точка входа: animate() в конце файла
 * Все глобальные переменные экспортируются в window в конце IIFE
 */
(function () {
  'use strict';

// ==== СЦЕНА ====
const wrap = document.getElementById('canvas-wrap');
let w = wrap.clientWidth, h = wrap.clientHeight;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f19);
const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
camera.position.z = 5;
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(w, h);
renderer.localClippingEnabled = true;
renderer.setClearColor(0x0b0f19);
wrap.appendChild(renderer.domElement);
scene.add(new THREE.AmbientLight(0xffffff, .65));
const keyLight = new THREE.DirectionalLight(0xffffff, .9); keyLight.position.set(5, 4, 6); scene.add(keyLight);
const backLight = new THREE.DirectionalLight(0x6cb8ff, .35); backLight.position.set(-5, -3, 2); scene.add(backLight);

const eyeGroup = new THREE.Group();
const lensGroup = new THREE.Group();
eyeGroup.add(lensGroup);
scene.add(eyeGroup);

// ==== ШЕЙДЕРЫ ====
const cutU = {uCutN:{value:new THREE.Vector3(1, 0, 0)}, uCutD:{value:-99}};   // local-нормаль среза: x = 0, при -99 не отброшено ничего
let cutOn = false;
const scleraU = {uRedness:{value:0}, uYellow:{value:0}, uDryness:{value:0}, uAlpha:{value:1}, uCutN:cutU.uCutN, uCutD:cutU.uCutD};
const irisU = {uDilate:{value:0}, uLight:{value:0}, uBaseColor:{value:new THREE.Color(0x3a7d5d)}, uAlpha:{value:1}, uCutN:cutU.uCutN, uCutD:cutU.uCutD};
const VERT = `varying vec3 vPos;
varying vec3 vNormal;
void main(){
  vPos = position;
  vNormal = normalMatrix * normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const NOISE = `
float hash(vec3 p){
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1.0,0.0,0.0)), f.x),
                 mix(hash(i + vec3(0.0,1.0,0.0)), hash(i + vec3(1.0,1.0,0.0)), f.x), f.y),
             mix(mix(hash(i + vec3(0.0,0.0,1.0)), hash(i + vec3(1.0,0.0,1.0)), f.x),
                 mix(hash(i + vec3(0.0,1.0,1.0)), hash(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z);
}
float noise(vec2 p){ return noise(vec3(p, 0.0)); }
`;
const SCLERA_FRAG = `uniform float uRedness;
uniform float uYellow;
uniform float uDryness;
uniform float uAlpha;
uniform vec3 uCutN;
uniform float uCutD;
varying vec3 vPos;
varying vec3 vNormal;
void main(){
  if (dot(vPos, uCutN) < uCutD) discard;
  vec3 baseColor = vec3(0.96, 0.95, 0.93);
  baseColor = mix(baseColor, vec3(0.9, 0.82, 0.6), clamp(uYellow, 0.0, 1.0) * 0.75);
  float frontMask = smoothstep(1.35, 0.75, vPos.z);
  float n1 = noise(vPos * 7.0);
  float n2 = noise(vPos * 17.0 + 3.0);
  float n3 = noise(vPos * 30.0 + 7.0);
  float veins = smoothstep(0.5, 0.68, n1 * n2) + smoothstep(0.55, 0.72, n2 * n3) * 0.7;
  veins *= frontMask;
  veins = clamp(veins, 0.0, 1.0);
  vec3 col = mix(baseColor, vec3(0.88, 0.12, 0.15), clamp(veins * uRedness, 0.0, 1.0) * 0.85);
  col = mix(col, col * 0.82, clamp(uDryness, 0.0, 1.0) * 0.5);
  float illum = max(dot(normalize(vNormal), normalize(vec3(0.8, 0.8, 1.2))), 0.0) * 0.5 + 0.5;
  if (!gl_FrontFacing) col *= 0.42;
  vec3 outc = clamp(col * illum, 0.0, 1.0);
  // подповерхностное рассеяние: в тенях склера не серая, а тёплая — свет проходит сквозь неё
  vec3 sss = baseColor * (1.0 - illum) * 0.4 * vec3(1.0, 0.95, 0.85);
  outc += sss * 0.35;
  gl_FragColor = vec4(clamp(outc, 0.0, 1.0), uAlpha);
}`;
const IRIS_FRAG = `uniform float uDilate;
uniform float uLight;
uniform vec3 uBaseColor;
uniform float uAlpha;
uniform vec3 uCutN;
uniform float uCutD;
varying vec3 vPos;
varying vec3 vNormal;
void main(){
  if (dot(vPos, uCutN) < uCutD) discard;
  float r = length(vPos.xy);
  float a = atan(vPos.y, vPos.x);
  float fiber = sin(a * 90.0 + noise(vPos.xy * 8.0) * 6.0) * 0.5 + 0.5;
  fiber = smoothstep(0.3, 0.7, fiber);
  // радиальные борозды: 24 складки, смягчённые шумом
  float furrow = sin(a * 24.0 + noise(vPos.xy * 5.0) * 2.4) * 0.5 + 0.5;
  // крипты — тёмные углубления между волокнами
  float crypt = smoothstep(0.52, 0.78, noise(vPos.xy * 22.0 + a * 3.0));
  float collarette = smoothstep(0.22, 0.29, r) * (1.0 - smoothstep(0.30, 0.37, r));
  float limbal = smoothstep(0.55, 0.65, r);
  vec3 col = uBaseColor;
  col = mix(col, col * 0.55, fiber * 0.5);
  col = mix(col, col * 0.55, furrow * 0.30);
  col = mix(col, col * 0.22, crypt * 0.75);
  col = mix(col, col * 1.35 + 0.02, collarette * 0.55 * (1.0 - uLight * 0.45));
  col = mix(col, vec3(0.02, 0.04, 0.08), limbal * 0.85);
  col *= 1.0 + clamp(uDilate, 0.0, 1.0) * 0.15;
  col *= 1.0 - 0.12 * clamp(uLight, 0.0, 1.0);
  float illum = max(normalize(vNormal).z, 0.0) * 0.5 + 0.6;
  gl_FragColor = vec4(clamp(col * illum, 0.0, 1.0), uAlpha);
}`;
const scleraMat = new THREE.ShaderMaterial({uniforms:scleraU, vertexShader:VERT, fragmentShader:NOISE + SCLERA_FRAG, transparent:true, side:THREE.DoubleSide});
const irisMat = new THREE.ShaderMaterial({uniforms:irisU, vertexShader:VERT, fragmentShader:NOISE + IRIS_FRAG, transparent:true, side:THREE.DoubleSide});

const cutN0 = new THREE.Vector3(1, 0, 0);   // сагиттальный срез: плоскость x = 0
const cutPlane = new THREE.Plane(cutN0.clone(), 99);

// В склере есть отверстие на месте лимба: роговица служит её продолжением, а радужка
// видна в просвет. Без этого склера закрывала бы радужку, убранную с глазной оси.
const LIMBUS_HOLE = Math.acos(0.62 / 1.5);
const scleraGeo = new THREE.SphereGeometry(1.5, 96, 64, 0, Math.PI * 2, LIMBUS_HOLE, Math.PI - LIMBUS_HOLE);
scleraGeo.rotateX(Math.PI / 2);   // полюс склеры — вперёд, отверстие — на лимбе
const scleraMesh = new THREE.Mesh(scleraGeo, scleraMat);
eyeGroup.add(scleraMesh);

const irisMesh = new THREE.Mesh(new THREE.CircleGeometry(0.62, 96), irisMat);
irisMesh.position.z = 1.335;   // плоскость лимба: радужка крепится к цилиарному телу, а не висит впереди
lensGroup.add(irisMesh);

const pupilMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({color:0x050505, clippingPlanes:[cutPlane], side:THREE.DoubleSide}));
pupilMesh.position.z = 1.341;
pupilMesh.scale.set(0.10, 0.10, 1);
lensGroup.add(pupilMesh);

const hlMat = new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.85, side:THREE.DoubleSide});
const hl1 = new THREE.Mesh(new THREE.CircleGeometry(0.08, 32), hlMat); hl1.position.set(-0.14, 0.15, 1.489);
const hl2 = new THREE.Mesh(new THREE.CircleGeometry(0.04, 32), hlMat); hl2.position.set(0.17, 0.1, 1.490);
lensGroup.add(hl1, hl2);

// Роговица — не полусфера, а сфероид: основание ложится на лимб (r = 0.75),
// вершина — на переднюю точку склеры (z = 1.50), а в плоскости радужки сечение ≈ 0.63,
// то есть роговица полностью накрывает радужку (0.62), а не «режет» её.
const corneaGeom = new THREE.SphereGeometry(1, 64, 44, 0, Math.PI * 2, 0, Math.PI / 2);
corneaGeom.rotateX(Math.PI / 2);       // купол смотрит вперёд, основание — в плоскости XY
corneaGeom.scale(0.75, 0.75, 0.35);
// роговица — не плёнка-невидимка: тонкий градиент от центра к лимбу, заметен на блике
const CORNEA_FRAG = `uniform float uAlpha;
uniform vec3 uCutN;
uniform float uCutD;
varying vec3 vPos;
varying vec3 vNormal;
void main(){
  if (dot(vPos, uCutN) < uCutD) discard;
  float f = pow(1.0 - abs(normalize(vNormal).z), 2.2);
  vec3 col = mix(vec3(0.62, 0.78, 0.90), vec3(0.97, 0.99, 1.0), f);
  gl_FragColor = vec4(col, clamp(0.035 + 0.10 * f, 0.0, 0.22) * uAlpha);
}`;
const corneaMesh = new THREE.Mesh(corneaGeom, new THREE.ShaderMaterial({
  uniforms:{uAlpha:{value:1}, uCutN:cutU.uCutN, uCutD:cutU.uCutD}, vertexShader:VERT, fragmentShader:CORNEA_FRAG,
  transparent:true, side:THREE.DoubleSide, depthWrite:false, clippingPlanes:[cutPlane]}));
corneaMesh.position.z = 1.15;
lensGroup.add(corneaMesh);

const clickableMeshes = [];
const clipMat = m => { m.clippingPlanes = [cutPlane]; return m; };

// Радужка — не бумажный диск: тонкая коническая «спинка» даёт мембране толщину
const irisBackMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.56, 0.12, 72, 1, true),
  clipMat(new THREE.MeshStandardMaterial({color:0x40291f, roughness:.92, side:THREE.DoubleSide})));
irisBackMesh.rotation.x = Math.PI / 2;
irisBackMesh.position.z = 1.275;
lensGroup.add(irisBackMesh);
const ellipsoid = (rx, rz) => { const g = new THREE.SphereGeometry(1, 48, 32); g.scale(rx, rx, rz); g.computeVertexNormals(); return g; };

const aqueousMesh = new THREE.Mesh(ellipsoid(0.56, 0.21),
  clipMat(new THREE.MeshBasicMaterial({color:0xbfe4ff, transparent:true, opacity:.08, depthWrite:false, side:THREE.DoubleSide})));
aqueousMesh.position.z = 1.21;   // передняя камера: вершина 1.42 — ниже роговичной (1.50)

const lensMesh = new THREE.Mesh(ellipsoid(0.44, 0.25),
  clipMat(new THREE.MeshStandardMaterial({color:0xdfeaf5, roughness:.12, transparent:true, opacity:.5, side:THREE.DoubleSide})));
lensMesh.position.z = 1.05;

const ciliaryMesh = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.07, 16, 64),
  clipMat(new THREE.MeshStandardMaterial({color:0xb5715c, roughness:.85})));
ciliaryMesh.position.z = 1.32;
// ресничная мышца — внутри цилиарного тела; при аккомодации сжимается
const ciliaryMuscleMesh = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 14, 56),
  clipMat(new THREE.MeshStandardMaterial({color:0xa63a2c, roughness:.6})));
ciliaryMuscleMesh.position.z = 1.24;
lensGroup.add(ciliaryMuscleMesh);

const zonuleMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.47, 0.26, 36, 1, true),
  clipMat(new THREE.MeshStandardMaterial({color:0xd9d2c2, wireframe:true, transparent:true, opacity:.45})));
zonuleMesh.rotation.x = Math.PI / 2;
zonuleMesh.position.z = 1.18;

// Стекловидное тело: вместо ровного стекла — шейдер с тонкими волокнами (wisps)
const VIT_FRAG = `uniform float uAlpha;
uniform vec3 uCutN;
uniform float uCutD;
varying vec3 vPos;
varying vec3 vNormal;
void main(){
  if (dot(vPos, uCutN) < uCutD) discard;
  float n = noise(vPos * 4.0);
  float w = smoothstep(0.60, 0.86, 1.0 - abs(n - 0.5) * 2.0);
  w *= 0.45 + 0.55 * noise(vPos * 9.0 + 3.0);
  vec3 col = mix(vec3(0.78, 0.88, 0.95), vec3(0.96, 0.99, 1.0), w);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), clamp(0.06 + w * 0.24, 0.0, 0.42) * uAlpha);
}`;
const vitreousU = {uAlpha:{value:1}, uCutN:cutU.uCutN, uCutD:cutU.uCutD};
const vitreousMat = new THREE.ShaderMaterial({uniforms:vitreousU, vertexShader:VERT, fragmentShader:NOISE + VIT_FRAG,
  transparent:true, depthWrite:false, side:THREE.DoubleSide});
const vitreousMesh = new THREE.Mesh(new THREE.SphereGeometry(1.3, 64, 40), vitreousMat);
vitreousMesh.position.z = -0.08;

const retinaMesh = new THREE.Mesh(new THREE.SphereGeometry(1.45, 64, 48, 0, Math.PI * 2, 0, Math.PI * 0.68),
  clipMat(new THREE.MeshStandardMaterial({color:0xc0705f, roughness:.95, side:THREE.BackSide})));
retinaMesh.rotation.x = -Math.PI / 2;

// Пятна глазного дна — не кружки без толщины, а тонкие «таблетки»: читаются и с торца
const flatPuck = (r, seg, depth = 0.014) => { const g = new THREE.CylinderGeometry(r, r, depth, seg); g.rotateX(Math.PI / 2); return g; };
const maculaMesh = new THREE.Mesh(flatPuck(0.13, 44),
  clipMat(new THREE.MeshBasicMaterial({color:0xd9b45c, side:THREE.DoubleSide})));
maculaMesh.position.set(0.42, 0.02, -1.36);
maculaMesh.rotation.y = -0.3;

const foveaMesh = new THREE.Mesh(flatPuck(0.045, 28, 0.01),
  clipMat(new THREE.MeshBasicMaterial({color:0x8a5a2b, side:THREE.DoubleSide})));
foveaMesh.position.set(0.44, 0.02, -1.355);
foveaMesh.rotation.y = -0.3;

// Диск зрительного нерва — слегка назально и книзу от полюса (макула височнее и выше),
// выпуклый, с экскавацией в центре, откуда выходят сосуды
const DISC_P = new THREE.Vector3(-0.14, -0.04, -1.40);
const discMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16).scale(1, 1, 0.16),
  clipMat(new THREE.MeshBasicMaterial({color:0xf3e6c4, side:THREE.DoubleSide})));
discMesh.position.copy(DISC_P);
const cupMesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14).scale(1, 1, 0.35),
  clipMat(new THREE.MeshBasicMaterial({color:0xa89269})));
cupMesh.position.set(0, 0, 0.021);   // углубление экскавации чуть впереди диска
cupMesh.userData.grp = 'disc';
discMesh.add(cupMesh);

// Зрительный нерв — труба от диска к вершине орбиты. Кривая уже лежит в нужной плоскости,
// поэтому никаких rotation.x: достаточно поставить меш в начало координат
const nerveCurve = new THREE.CatmullRomCurve3([
  DISC_P.clone(), new THREE.Vector3(-0.10, -0.02, -1.70),
  new THREE.Vector3(0, 0, -1.95), new THREE.Vector3(0, 0, -2.55)
]);
const nerveMesh = new THREE.Mesh(new THREE.TubeGeometry(nerveCurve, 40, 0.225, 16, false),
  clipMat(new THREE.MeshStandardMaterial({color:0xe8dfcf, roughness:.8})));
const nerveCapMesh = new THREE.Mesh(new THREE.SphereGeometry(0.226, 28, 18),
  clipMat(new THREE.MeshStandardMaterial({color:0xe8dfcf, roughness:.8})));
nerveCapMesh.position.set(0, 0, -2.55);   // глухой торец трубы в глубине орбиты
nerveMesh.add(nerveCapMesh);

const conjunctivaMesh = new THREE.Mesh(new THREE.SphereGeometry(1.515, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.5),
  clipMat(new THREE.MeshStandardMaterial({color:0xf0c0bd, transparent:true, opacity:.14, depthWrite:false, side:THREE.DoubleSide})));
conjunctivaMesh.rotation.x = Math.PI / 2;

const sphincterMesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 14, 72),
  clipMat(new THREE.MeshBasicMaterial({color:0x9c4a4a, transparent:true, opacity:.45})));
sphincterMesh.position.z = 1.338;

const dilatorMesh = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.022, 14, 72),
  clipMat(new THREE.MeshBasicMaterial({color:0x6b3b3b, transparent:true, opacity:.35})));
dilatorMesh.position.z = 1.334;

// ---- Лимб и эписклера ----
const limbusMesh = new THREE.Mesh(new THREE.TorusGeometry(0.622, 0.03, 16, 120),
  clipMat(new THREE.MeshStandardMaterial({color:0x8d93a3, roughness:.45})));
limbusMesh.position.z = 1.352;

const episcleraGeo = new THREE.SphereGeometry(1.512, 96, 56, 0, Math.PI * 2, Math.acos(0.622 / 1.512), Math.PI - Math.acos(0.622 / 1.512));
episcleraGeo.rotateX(Math.PI / 2);
const episcleraMesh = new THREE.Mesh(episcleraGeo,
  clipMat(new THREE.MeshStandardMaterial({color:0xf6ded8, transparent:true, opacity:.16, depthWrite:false, roughness:.6})));

// Орбитальная впадина — тёмная чаша, к которой крепятся веки и мышцы
const orbitMesh = new THREE.Mesh(new THREE.SphereGeometry(2.2, 56, 36, 0, Math.PI * 2, Math.PI * 0.40, Math.PI * 0.60),
  new THREE.MeshStandardMaterial({color:0x1e1512, roughness:1, side:THREE.BackSide}));
orbitMesh.rotation.x = Math.PI / 2;
orbitMesh.position.z = -0.25;
eyeGroup.add(orbitMesh);

// ---- Веки: складки на шаровом шарнире ----
// Складка — участок сферы чуть больше яблока (верхнее 1.548, нижнее 1.522: при смыкании
// верхнее проходит перед нижним). Край идёт не по кругу, а по дуге: у роговицы выше,
// к уголкам опускается — разрез получается миндалевидным, а не «поясом» поперёк яблока,
// и край не торчит за силуэт глаза.
// Шарнир — ось X через центр яблока: веко катится по роговице, не проваливаясь в неё.
const SKIN = 0x9a6a55, SKIN_RIM = 0xb07d64, MUSC = 0xa8463c, LACR = 0xc98f89;
const UP_R = 1.548, LO_R = 1.522;
const UP_OPEN = 0.16, UP_CLOSE = 0.90, LO_OPEN = -0.10, LO_CLOSE = -0.30;
const LID_CORNER = 1.00, LID_NV = 14;   // азимут уголка глаза и число колец сетки
const lidSmooth = t => t * t * (3 - 2 * t);

// Высота края складки по азимуту phi (0 — центр, ±1 — уголки, ±π — затылок складки)
function lidRimY(sign, phi){
  const ap = Math.abs(phi);
  const yFront = sign > 0 ? 0.92 : -0.80;
  const yCorner = sign > 0 ? 0.10 : -0.14;
  const yBack = sign > 0 ? 1.26 : -1.22;
  if (ap <= LID_CORNER) return yFront + (yCorner - yFront) * lidSmooth(ap / LID_CORNER);
  return yCorner + (yBack - yCorner) * lidSmooth(Math.min(1, (ap - LID_CORNER) / (Math.PI - LID_CORNER)));
}

// Складка как параметрическая сетка по сфере: азимут phi, полярный угол theta от края до полюса
function lidShell(sign, R){
  const NP = 112, pos = [], idx = [];
  for (let i = 0; i <= NP; i++){
    const phi = -Math.PI + (i / NP) * Math.PI * 2;
    const th0 = Math.acos(Math.max(-1, Math.min(1, lidRimY(sign, phi) / R)));
    for (let j = 0; j <= LID_NV; j++){
      const t = j / LID_NV;
      const th = sign > 0 ? th0 * (1 - t) : th0 + (Math.PI - th0) * t;
      pos.push(R * Math.sin(th) * Math.sin(phi), R * Math.cos(th), R * Math.sin(th) * Math.cos(phi));
    }
  }
  for (let i = 0; i < NP; i++)
    for (let j = 0; j < LID_NV; j++){
      const a = i * (LID_NV + 1) + j, b = a + LID_NV + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Ресница: тонкий конус, загнутый вперёд — не палка, а волосок
function lashGeom(){
  const g = new THREE.CylinderGeometry(0.0035, 0.011, 1, 5, 4);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++){
    const y = p.getY(i);
    p.setZ(i, p.getZ(i) + 0.22 * y * y);
    p.setX(i, p.getX(i) * (1 - 0.2 * y));
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

function makeLid(sign, R){
  const hinge = new THREE.Group();
  eyeGroup.add(hinge);
  const shellGeo = lidShell(sign, R);
  // кожа века с мелкими морщинами: процедурно, без текстур
  const skinMat = clipMat(new THREE.MeshStandardMaterial({color:SKIN, roughness:.98, side:THREE.DoubleSide}));
  skinMat.onBeforeCompile = sh => {
    sh.vertexShader = 'varying vec3 vWr;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n  vWr = position;');
    sh.fragmentShader = 'varying vec3 vWr;\nfloat h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
      sh.fragmentShader.replace('#include <dithering_fragment>',
        '#include <dithering_fragment>\n  float wr = smoothstep(0.72, 1.0, abs(sin(vWr.y * 78.0 + h21(floor(vWr.xy * 26.0)) * 6.283)));\n  gl_FragColor.rgb *= 1.0 - 0.05 * wr;');
  };
  const body = new THREE.Mesh(shellGeo, skinMat);

  // Край складки — трубка по той же дуге, чуть внутрь: даёт мокрый край и не торчит за силуэт
  const rimPts = [];
  for (let i = 0; i < 120; i++){
    const phi = -Math.PI + (i / 120) * Math.PI * 2;
    const th = Math.acos(Math.max(-1, Math.min(1, lidRimY(sign, phi) / R)));
    rimPts.push(new THREE.Vector3(
      R * Math.sin(th) * Math.sin(phi), R * Math.cos(th), R * Math.sin(th) * Math.cos(phi)).multiplyScalar((R - 0.033) / R));
  }
  const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 180, 0.021, 8, true),
    clipMat(new THREE.MeshStandardMaterial({color:SKIN_RIM, roughness:.55})));

  // ---- Ресницы: цепочки Верле из трёх точек ----
  // p0 жёстко сидит на краю века, p1 и p2 свободны. Их держат гравитация, пружина
  // к «прямому» направлению и демпфирование, а толчок даёт само веко: корень и точка
  // покоя уезжают вместе с ним, а свободные точки отстают — отсюда лаг при взмахе и
  // лёгкое пружинение при раскрытии.
  const rows = sign > 0 ? 3 : 2, per = sign > 0 ? 20 : 12;
  const lashMesh = new THREE.InstancedMesh(lashGeom(),
    clipMat(new THREE.MeshStandardMaterial({color:0x211512, roughness:.45})), rows * per);
  lashMesh.frustumCulled = false;
  eyeGroup.add(lashMesh);           // матрицы считаем в осях глаза, а не века
  const lashes = [], UPv = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), nor = new THREE.Vector3();
  for (let r = 0; r < rows; r++)
    for (let i = 0; i < per; i++){
      const t = (i + 0.5) / per;
      const span = sign > 0 ? 0.95 : 0.84;
      const phi = (t * 2 - 1) * span + (r - 1) * 0.022;
      const th = Math.acos(Math.max(-1, Math.min(1, lidRimY(sign, phi) / R)));
      const root = new THREE.Vector3(
        R * Math.sin(th) * Math.sin(phi), R * Math.cos(th), R * Math.sin(th) * Math.cos(phi));
      nor.copy(root).normalize();
      // симметричная пара: ресница i и ресница per−1−i получают одни и те же параметры
      const jj = Math.min(i, per - 1 - i);
      const rnd = n => { const s = Math.sin(jj * 12.9898 + r * 78.233 + n * 37.719 + 4.1) * 43758.5453; return s - Math.floor(s); };
      dir.copy(nor).multiplyScalar(sign > 0 ? 0.36 : 0.30).addScaledVector(UPv, sign * 0.95)
        .applyAxisAngle(nor, (rnd(1) * 2 - 1) * 0.2).normalize();   // наклон ±0.2 рад
      const len = sign > 0 ? 0.12 + rnd(2) * 0.09 : 0.09 + rnd(2) * 0.05;
      const p0 = root.multiplyScalar(0.985 - r * 0.011);
      const p1 = p0.clone().addScaledVector(dir, len * 0.5);
      const p2 = p0.clone().addScaledVector(dir, len);
      lashes.push({root: p0, rest: dir.clone(), len, thick: 0.8 + rnd(3) * 0.6,
                   stiff: 0.7 + rnd(4) * 0.6, p1, p2, q1: p1.clone(), q2: p2.clone()});
    }

  const dum = new THREE.Object3D(), AX = new THREE.Vector3(1, 0, 0), qy = new THREE.Quaternion();
  const GRAV = {x: 0, y: -0.02, z: 0}, DAMP = 0.925, SUB = 1 / 120;
  const P0 = new THREE.Vector3(), D = new THREE.Vector3(), V = new THREE.Vector3();
  function lashStep(omega, dt){
    dt = Math.min(0.05, Math.max(0.001, dt || 1 / 60));
    const n = Math.max(1, Math.min(6, Math.round(dt / SUB))), h = dt / n, h2 = h * h;
    const ang = hinge.rotation.x;
    for (let i = 0; i < lashes.length; i++){
      const L = lashes[i], k = 320 * L.stiff, half = L.len * 0.5;
      P0.copy(L.root).applyAxisAngle(AX, ang);
      D.copy(L.rest).applyAxisAngle(AX, ang);
      const r1x = P0.x + D.x * half, r1y = P0.y + D.y * half, r1z = P0.z + D.z * half;
      const r2x = P0.x + D.x * L.len, r2y = P0.y + D.y * L.len, r2z = P0.z + D.z * L.len;
      for (let s = 0; s < n; s++){
        // Верле: p += (p − q)·damp + a·h²
        let vx = (L.p1.x - L.q1.x) * DAMP, vy = (L.p1.y - L.q1.y) * DAMP, vz = (L.p1.z - L.q1.z) * DAMP;
        L.q1.copy(L.p1);
        L.p1.x += vx + (k * (r1x - L.p1.x) + GRAV.x) * h2;
        L.p1.y += vy + (k * (r1y - L.p1.y) + GRAV.y) * h2;
        L.p1.z += vz + (k * (r1z - L.p1.z) + GRAV.z) * h2;
        vx = (L.p2.x - L.q2.x) * DAMP; vy = (L.p2.y - L.q2.y) * DAMP; vz = (L.p2.z - L.q2.z) * DAMP;
        L.q2.copy(L.p2);
        L.p2.x += vx + (k * (r2x - L.p2.x) + GRAV.x) * h2;
        L.p2.y += vy + (k * (r2y - L.p2.y) + GRAV.y) * h2;
        L.p2.z += vz + (k * (r2z - L.p2.z) + GRAV.z) * h2;
        // сегменты не тянутся: длина каждого жёстко L/2
        for (let it = 0; it < 2; it++){
          V.copy(L.p1).sub(P0);
          if (V.lengthSq() < 1e-10) V.copy(D); V.setLength(half);
          L.p1.copy(P0).add(V);
          V.copy(L.p2).sub(L.p1);
          if (V.lengthSq() < 1e-10) V.copy(D); V.setLength(half);
          L.p2.copy(L.p1).add(V);
        }
      }
    }
    for (let i = 0; i < lashes.length; i++){
      const L = lashes[i];
      P0.copy(L.root).applyAxisAngle(AX, ang);
      V.copy(L.p2).sub(P0);
      const len = Math.max(0.02, V.length());
      qy.setFromUnitVectors(UPv, V.multiplyScalar(1 / len));
      dum.position.copy(P0);
      dum.quaternion.copy(qy);
      dum.scale.set(L.thick, len, L.thick);
      dum.updateMatrix();
      lashMesh.setMatrixAt(i, dum.matrix);
    }
    lashMesh.instanceMatrix.needsUpdate = true;
  }
  lashStep(0, 0);

  // Кожа века при смыкании выпячивается: вершины уводим наружу по радиусу (до 0.026)
  const basePos = Float32Array.from(shellGeo.attributes.position.array);
  const wArr = new Float32Array(basePos.length / 3);
  for (let v = 0; v < wArr.length; v++)
    wArr[v] = Math.pow(Math.sin(Math.PI * ((v % (LID_NV + 1)) / LID_NV)), 0.85);
  let bulgeNow = -1;
  function applyBulge(k){
    k = Math.max(0, Math.min(1, k));
    if (Math.abs(k - bulgeNow) < 0.005) return;
    bulgeNow = k;
    const arr = shellGeo.attributes.position.array, amp = 0.026 * k;
    for (let v = 0; v < wArr.length; v++){
      const i3 = v * 3, f = 1 + (amp * wArr[v]) / R;
      arr[i3] = basePos[i3] * f; arr[i3 + 1] = basePos[i3 + 1] * f; arr[i3 + 2] = basePos[i3 + 2] * f;
    }
    shellGeo.attributes.position.needsUpdate = true;
  }

  hinge.add(body, rim);
  body.userData.grp = rim.userData.grp = lashMesh.userData.grp = 'lid';
  return {hinge, body, rim, lashMesh, lashes, lashStep, applyBulge};
}
const upperLid = makeLid(1, UP_R), lowerLid = makeLid(-1, LO_R);

// ---- Физика век: пружина, три фазы моргания, ресницы ----
// смыкание 70 мс (жёсткая пружина, без перелёта) → пауза 40 мс →
// раскрытие 180 мс (мягкая пружина: веко проскакивает открытое положение на 2–3°
// и возвращается — живое моргание, а не симметричная синусоида).
const EyelidRig = {
  upper: upperLid, lower: lowerLid,
  target: 1, a: 1, vUp: 0,   // 1 — открыто, 0 — закрыто
  ptosis: 0, phase: 'idle', phaseT: 0,
  rotU: UP_OPEN, rotL: LO_OPEN,
  open(angle = 1){ this.target = Math.max(0, Math.min(1, angle)); },
  close(angle = 1){ this.target = 1 - Math.max(0, Math.min(1, angle)); },
  blink(duration = 180){ if (this.phase !== 'closing'){ this.phase = 'closing'; this.phaseT = 0; this.blinkDur = Math.max(0.12, duration / 1000); } },
  step(dt){
    dt = Math.min(0.06, Math.max(0.0005, dt));
    if (this.phase !== 'idle'){
      this.phaseT += dt;
      if (this.phase === 'closing' && this.phaseT >= 0.07){ this.phase = 'hold'; this.phaseT = 0; }
      else if (this.phase === 'hold' && this.phaseT >= 0.04){ this.phase = 'opening'; this.phaseT = 0; }
      else if (this.phase === 'opening' && this.phaseT >= (this.blinkDur || 0.18)){ this.phase = 'idle'; this.phaseT = 0; }
    }
    const opening = this.phase === 'opening' || this.phase === 'idle';
    const want = (this.phase === 'closing' || this.phase === 'hold') ? 0
      : this.target * (1 - 0.45 * this.ptosis);
    const k = opening ? 360 : 2200, z = opening ? 0.60 : 1.0;
    const c = 2 * z * Math.sqrt(k);
    let left = dt;
    while (left > 0){
      const h = Math.min(1 / 240, left); left -= h;
      this.vUp += ((want - this.a) * k - this.vUp * c) * h;
      this.a += this.vUp * h;
      if (this.a > 1.07){ this.a = 1.07; if (this.vUp > 0) this.vUp = 0; }   // перелёт 2–3°
      if (this.a < -0.04){ this.a = -0.04; if (this.vUp < 0) this.vUp = 0; }
    }
    const prevU = this.rotU, prevL = this.rotL;
    this.rotU = UP_CLOSE + (UP_OPEN - UP_CLOSE) * this.a;
    this.rotL = LO_CLOSE + (LO_OPEN - LO_CLOSE) * this.a;   // ход нижнего 0.20 рад ≈ 27% хода верхнего
    this.upper.hinge.rotation.x = this.rotU;
    this.lower.hinge.rotation.x = this.rotL;
    const oU = (this.rotU - prevU) / dt, oL = (this.rotL - prevL) / dt;
    this.upper.lashStep(oU, dt);
    this.lower.lashStep(oL, dt);
    this.upper.applyBulge(1 - this.a);
    this.lower.applyBulge(1 - this.a);
  },
  update(){
    const now = performance.now();
    const dt = (now - (this._t || now - 16)) / 1000;
    this._t = now;
    this.step(dt);
  }
};
eyeGroup.add(limbusMesh, episcleraMesh);

const blinkState = { enabled: true, nextBlinkAt: performance.now() + 3000 };
let tearT = 1;   // «свежесть» слёзной плёнки: 1 сразу после моргания, падает до 0.22
function updateBlink(now){
  if (!blinkState.enabled) return;
  if (now >= blinkState.nextBlinkAt){
    EyelidRig.blink(180);
    tearT = 1;
    blinkState.nextBlinkAt = now + 2500 + Math.random() * 4000;
  }
}

// ---- Слёзный аппарат ----
const lacMat = () => clipMat(new THREE.MeshStandardMaterial({color:LACR, roughness:.62}));
const glandA = new THREE.Mesh(ellipsoid(0.32, 0.15), lacMat());
glandA.position.set(1.42, 1.12, -0.86); glandA.rotation.z = -0.5;
const glandB = new THREE.Mesh(ellipsoid(0.19, 0.16), lacMat());
glandB.position.set(1.55, 0.92, -0.92);

function canalMesh(pts){
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.023, 12, false), lacMat());
}
// верхний и нижний канальцы — зеркальны относительно горизонтали y = −0.09 и сходятся в мешке
const canalU = canalMesh([[-1.10, 0.10, 1.06], [-1.30, 0.06, 0.86], [-1.44, -0.08, 0.60], [-1.48, -0.16, 0.44]]);
const canalL = canalMesh([[-1.10, -0.28, 1.06], [-1.30, -0.24, 0.86], [-1.44, -0.10, 0.60], [-1.48, -0.16, 0.44]]);
const sacMesh = new THREE.Mesh(ellipsoid(0.13, 0.16), lacMat());
sacMesh.position.set(-1.52, -0.24, 0.30);

function tubeBetween(a, b, rA, rB){
  const A = new THREE.Vector3(a[0], a[1], a[2]), B = new THREE.Vector3(b[0], b[1], b[2]);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rB, rA, A.distanceTo(B), 32, 1, true), lacMat());
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
}
const ductMesh = tubeBetween([-1.50, -0.34, 0.40], [-1.30, -1.74, 0.02], 0.085, 0.05);

// ---- Глазодвигательные мышцы: объёмное брюшко с сухожилиями на концах ----
// Радиус: 0.02 у вершины орбиты (сухожилие) → 0.10–0.12 в середине (брюшко) → 0.03
// на склере (сухожилие). Брюшко кладётся на глаз и не проваливается внутрь.
function muscleGeo(pts, rMax = 0.085, segs = 64){
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const pos = [], idx = [];
  const P = new THREE.Vector3(), T = new THREE.Vector3(), Rn = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
  for (let i = 0; i <= segs; i++)
  {
    const t = i / segs;
    curve.getPointAt(t, P);
    const r = 0.02 + 0.01 * t + rMax * Math.pow(Math.sin(Math.PI * t), 0.8);
    Rn.copy(P).normalize();
    // осевая линия идёт по склере: брюшко ложится на глаз и прячется под кожей века
    const lenP = P.length(), need = 1.475;
    if (lenP > 1e-4 && P.z > -1.25 && lenP < need) P.multiplyScalar(need / lenP);
    curve.getTangentAt(t, T).normalize();
    N.crossVectors(T, Rn);
    if (N.lengthSq() < 1e-6) N.set(1, 0, 0);
    N.normalize();
    B.crossVectors(N, T).normalize();
    for (let k = 0; k < 12; k++)
    {
      // сечение — плоская лента: широкая по касательной к глазу, тонкая по радиусу
      const a = k / 12 * Math.PI * 2, ca = Math.cos(a) * r * 1.55, sa = Math.sin(a) * r * 0.5;
      pos.push(P.x + N.x * ca + B.x * sa, P.y + N.y * ca + B.y * sa, P.z + N.z * ca + B.z * sa);
    }
    if (i < segs)
    {
      const a0 = i * 12, b0 = a0 + 12;
      for (let k = 0; k < 12; k++)
      {
        const k2 = (k + 1) % 12;
        idx.push(a0 + k, b0 + k, b0 + k2, a0 + k, b0 + k2, a0 + k2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const muscleMesh = (pts, rMax = 0.085) => new THREE.Mesh(muscleGeo(pts, rMax),
  clipMat(new THREE.MeshStandardMaterial({color:MUSC, roughness:.72, side:THREE.DoubleSide})));

// Прямые мышцы: от вершины орбиты по глазному яблоку к склере на 50–52° от полюса,
// то есть примерно в 6 мм позади лимба, а не на полюсе
const rectPath = (dx, dy) => {
  const d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  const pts = [[ux * 0.30, uy * 0.30, -1.98], [ux * 1.20, uy * 1.20, -1.42], [ux * 1.47, uy * 1.47, -0.72]];
  [1.34, 1.14, 0.98].forEach(th =>
    pts.push([ux * Math.sin(th) * 1.556, uy * Math.sin(th) * 1.556, Math.cos(th) * 1.556]));
  return pts;
};
const rsSup = muscleMesh(rectPath(0, 1), 0.125);
const rsInf = muscleMesh(rectPath(0, -1), 0.125);
const rsMed = muscleMesh(rectPath(-1, 0), 0.125);
const rsLat = muscleMesh(rectPath(1, 0), 0.125);
// Косые: верхняя — через блок, нижняя — от медиального дна орбиты
// верхняя и нижняя косые — строго зеркальны относительно горизонтальной плоскости
const OB_SUP = [[-0.36, 0.60, -1.86], [-0.66, 1.10, -0.34], [-0.76, 1.30, 0.32],
                [0.18, 1.32, -0.10], [0.62, 1.10, -0.55]];
const obSup = muscleMesh(OB_SUP, 0.05);
const obInf = muscleMesh(OB_SUP.map(p => [p[0], -p[1], p[2]]), 0.05);

// ---- Слои роговицы: послойная развёртка при фокусе ----
const CORNEA_LAYERS = [
  {ru:'Эпителий', lat:'Epithelium', c:0xbfe4ff},
  {ru:'Боуменова мембрана', lat:'Lamina limitans anterior', c:0x8fd0ff},
  {ru:'Строма', lat:'Stroma', c:0xdff0ff},
  {ru:'Десцеметова мембрана', lat:'Lamina limitans posterior', c:0x9fc0ff},
  {ru:'Эндотелий', lat:'Endothelium', c:0x6fa8e8}
];
const corneaLayers = CORNEA_LAYERS.map((L, i) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.70 - i * 0.03, 56, 28, Math.PI * 0.16, Math.PI * 1.52, 0, Math.PI / 2.6),
    clipMat(new THREE.MeshBasicMaterial({color:L.c, transparent:true, opacity:0, side:THREE.DoubleSide, depthWrite:false})));
  m.rotation.x = Math.PI / 2;
  m.position.z = 1.12;
  m.visible = false;
  lensGroup.add(m);
  return m;
});

// ---- Увеальный тракт: цилиарные отростки и хориоидея ----
// отростки изогнутые, а не шипы: вершина загнута к хрусталику
const procGeo = new THREE.ConeGeometry(0.026, 0.145, 10, 5);
procGeo.translate(0, 0.0725, 0);
{
  const pp = procGeo.attributes.position;
  for (let i = 0; i < pp.count; i++)
  {
    const y = pp.getY(i) / 0.145;
    pp.setZ(i, pp.getZ(i) + 0.055 * y * y);
    pp.setX(i, pp.getX(i) * (1 - 0.25 * y));
  }
  pp.needsUpdate = true;
  procGeo.computeVertexNormals();
}
const procMesh = new THREE.InstancedMesh(procGeo, clipMat(new THREE.MeshStandardMaterial({color:0xbe8474, roughness:.8})), 70);
{
  const dum = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  for (let i = 0; i < 70; i++)
  {
    const a = i / 70 * Math.PI * 2;
    dum.position.set(Math.cos(a) * 0.575, Math.sin(a) * 0.575, 1.315);
    dum.quaternion.setFromUnitVectors(up, dir.set(-Math.cos(a), -Math.sin(a), 0.42).normalize());
    dum.updateMatrix();
    procMesh.setMatrixAt(i, dum.matrix);
  }
  procMesh.instanceMatrix.needsUpdate = true;
}

// Сосудистая оболочка кончается у цилиарного тела, а не закрывает переднюю камеру:
// спереди у неё отверстие на месте лимба, иначе она прячет радужку и хрусталик.
const CHOR_R = 1.458;   // между склерой (1.5) и хориодеей остаётся видимый подслёральный зазор
const chorGeo = new THREE.SphereGeometry(CHOR_R, 96, 56, 0, Math.PI * 2, Math.acos(0.66 / CHOR_R), Math.PI - Math.acos(0.66 / CHOR_R));
chorGeo.rotateX(Math.PI / 2);
{
  const cp = chorGeo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < cp.count; i++)
  {
    v.fromBufferAttribute(cp, i);
    const bump = 1 + Math.sin(v.x * 13.0) * Math.cos(v.y * 15.0) * Math.sin(v.z * 12.0) * 0.009;
    v.multiplyScalar(bump);
    cp.setXYZ(i, v.x, v.y, v.z);
  }
  chorGeo.computeVertexNormals();
}
const choroideaMesh = new THREE.Mesh(chorGeo, clipMat(new THREE.MeshStandardMaterial({color:0x6b1d1d, roughness:.78, side:THREE.DoubleSide})));

// ---- Пигментный эпителий и мембрана Бруха — между хориокапилляром и сетчаткой ----
const RPE_FRAG = `uniform float uAlpha;
uniform vec3 uCutN;
uniform float uCutD;
varying vec3 vPos;
varying vec3 vNormal;
void main(){
  if (dot(vPos, uCutN) < uCutD) discard;
  float g = noise(vPos * 60.0);        // гранулы меланина
  float dark = smoothstep(0.35, 0.72, g);
  vec3 col = mix(vec3(0.35, 0.20, 0.16), vec3(0.06, 0.03, 0.03), dark);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), uAlpha);
}`;
// у обоих слоёв отверстие спереди, иначе их передняя шапка ляжет прямо на радужку
const rpeGeo = new THREE.SphereGeometry(1.452, 72, 48, 0, Math.PI * 2, Math.acos(0.66 / 1.452), Math.PI - Math.acos(0.66 / 1.452));
rpeGeo.rotateX(Math.PI / 2);
const rpeMesh = new THREE.Mesh(rpeGeo,
  new THREE.ShaderMaterial({uniforms:{uAlpha:{value:1}, uCutN:cutU.uCutN, uCutD:cutU.uCutD},
    vertexShader:VERT, fragmentShader:NOISE + RPE_FRAG, transparent:true, side:THREE.DoubleSide, depthWrite:false}));
const BRUCH_FRAG = `uniform float uAlpha;
uniform vec3 uCutN;
uniform float uCutD;
varying vec3 vPos;
varying vec3 vNormal;
void main(){
  if (dot(vPos, uCutN) < uCutD) discard;
  float m = max(smoothstep(0.92, 1.0, abs(sin(vPos.x * 42.0))), smoothstep(0.92, 1.0, abs(sin(vPos.y * 42.0))));
  vec3 col = mix(vec3(0.72, 0.66, 0.52), vec3(0.95, 0.92, 0.82), m);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), (0.35 + 0.45 * m) * uAlpha);
}`;
const bruchGeo = new THREE.SphereGeometry(1.456, 72, 48, 0, Math.PI * 2, Math.acos(0.66 / 1.456), Math.PI - Math.acos(0.66 / 1.456));
bruchGeo.rotateX(Math.PI / 2);
const bruchMesh = new THREE.Mesh(bruchGeo,
  new THREE.ShaderMaterial({uniforms:{uAlpha:{value:1}, uCutN:cutU.uCutN, uCutD:cutU.uCutD},
    vertexShader:VERT, fragmentShader:NOISE + BRUCH_FRAG, transparent:true, side:THREE.DoubleSide, depthWrite:false}));
eyeGroup.add(rpeMesh, bruchMesh);

// ---- Хрусталик: капсула, ядро и радиальные волокна ----
const capsuleMesh = new THREE.Mesh(ellipsoid(0.465, 0.275),
  clipMat(new THREE.MeshStandardMaterial({color:0xe8f4ff, transparent:true, opacity:.2, depthWrite:false, roughness:.08, side:THREE.DoubleSide})));
capsuleMesh.position.z = 1.05;
// ядро с градиентом: центр холоднее, край теплее (шейдер ниже)
const nucU = {uAlpha:{value:1}, uCenter:{value:new THREE.Color(0xf6f1dc)}, uEdge:{value:new THREE.Color(0xdcc9a0)},
  uCutN:cutU.uCutN, uCutD:cutU.uCutD};
const NUC_FRAG = `uniform vec3 uCenter;
uniform vec3 uEdge;
uniform float uAlpha;
uniform vec3 uCutN;
uniform float uCutD;
varying vec3 vPos;
varying vec3 vNormal;
void main(){
  if (dot(vPos, uCutN) < uCutD) discard;
  float t = clamp(length(vPos.xy) / 0.27, 0.0, 1.0);
  vec3 col = mix(uCenter, uEdge, t * t);
  float illum = max(normalize(vNormal).z, 0.0) * 0.45 + 0.6;
  gl_FragColor = vec4(clamp(col * illum, 0.0, 1.0), uAlpha);
}`;
const nuclMat = new THREE.ShaderMaterial({uniforms:nucU, vertexShader:VERT, fragmentShader:NUC_FRAG, transparent:true, side:THREE.DoubleSide});
nuclMat.color = new THREE.Color(0xf0e2c8);   // для совместимости с applyState (цвет ядра при катаракте)
const nucleusMesh = new THREE.Mesh(ellipsoid(0.27, 0.15), nuclMat);
nucleusMesh.position.z = 1.05;
// 200 радиальных волокон от ядра к капсуле — видно на срезе и вблизи
const fiberGeo = new THREE.CylinderGeometry(0.0035, 0.0018, 1, 4, 1, true);
fiberGeo.translate(0, 0.5, 0);
const lensFiberMesh = new THREE.InstancedMesh(fiberGeo, clipMat(new THREE.MeshBasicMaterial({color:0xeef6ff, transparent:true, opacity:.55, side:THREE.DoubleSide})), 200);
{
  const dm = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  for (let i = 0; i < 200; i++)
  {
    const a = i / 200 * Math.PI * 2 * 7 % (Math.PI * 2);          // несколько оборотов — равномерно по кольцу
    const rr = 0.27 + (i % 7) / 7 * 0.17;
    const zz = 1.05 + (((i * 37) % 11) / 11 - 0.5) * 0.34;
    dm.position.set(Math.cos(a) * rr, Math.sin(a) * rr, zz);
    dir.set(Math.cos(a), Math.sin(a), 0.18 * Math.cos(i * 1.7));
    dm.quaternion.setFromUnitVectors(up, dir.normalize());
    dm.scale.set(1, 0.075 + 0.03 * ((i % 5) / 5), 1);
    dm.updateMatrix();
    lensFiberMesh.setMatrixAt(i, dm.matrix);
  }
  lensFiberMesh.instanceMatrix.needsUpdate = true;
}
// передняя капсула тоньше задней — отдельный тонкий слой спереди
const frontCapsule = new THREE.Mesh(ellipsoid(0.455, 0.035),
  clipMat(new THREE.MeshBasicMaterial({color:0xdff0ff, transparent:true, opacity:.25, side:THREE.DoubleSide, depthWrite:false})));
frontCapsule.position.z = 1.315;
lensGroup.add(capsuleMesh, nucleusMesh, lensFiberMesh, frontCapsule);

// «Мутный край» — появляется с возрастом (пресбиопия / катаракта)
const lensHazeMat = clipMat(new THREE.MeshStandardMaterial({color:0xfff0cc, transparent:true, opacity:0, roughness:.92, depthWrite:false, side:THREE.DoubleSide}));
const lensHazeMesh = new THREE.Mesh(new THREE.TorusGeometry(0.435, 0.055, 12, 56), lensHazeMat);
lensHazeMesh.position.z = 1.05;
lensGroup.add(lensHazeMesh);

// ---- Гиалоидный канал в стекловидном теле ----
// гиалоидный канал изогнут — в глазу он не идёт по линейке
const hyaloidMesh = new THREE.Mesh(new THREE.TubeGeometry(
  new THREE.CatmullRomCurve3([new THREE.Vector3(0.02, 0.01, 1.1), new THREE.Vector3(-0.10, 0.06, 0.62),
    new THREE.Vector3(-0.26, 0.02, 0.02), new THREE.Vector3(-0.34, -0.10, -0.68), new THREE.Vector3(-0.40, -0.05, -1.3)]),
  48, 0.028, 12, false), clipMat(new THREE.MeshStandardMaterial({color:0xd8e8f2, transparent:true, opacity:.3, depthWrite:false})));

// ---- Кровеносная система ----
const ART_C = 0xc0392b, VEIN_C = 0x3f6db5;
const artMat = clipMat(new THREE.MeshStandardMaterial({color:ART_C, roughness:.42, emissive:0x4a0f0a, emissiveIntensity:.5}));
const veinMat = clipMat(new THREE.MeshStandardMaterial({color:VEIN_C, roughness:.42, emissive:0x0b1730, emissiveIntensity:.55}));
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const onR = (x, y, z, R) => V3(x, y, z).multiplyScalar(R / Math.hypot(x, y, z));
// Все сосуды — только TubeGeometry: 12 граней в сечении, продольные — по длине кривой (≥ 20)
const vTube = (pts, r, mat, segs = 28) => {
  const curve = new THREE.CatmullRomCurve3(pts);
  const tubular = Math.max(20, segs, Math.round(curve.getLength() / 0.09));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, tubular, r, 12, false), mat);
};
const DISC = DISC_P.clone();

// ---- Центральные сосуды сетчатки: четыре аркады, артерия и вена идут параллельно ----
const RET_R = 1.437;
const retPt = (az, th, r = RET_R) =>
  V3(Math.sin(th) * Math.cos(az) * r, Math.sin(th) * Math.sin(az) * r, -Math.cos(th) * r);

// Дуга по сетчатке. При th0 > 0.15 это ветвь: она начинается на аркаде, а не у диска
function arcade(az, bend, r0, mat, th0 = 0.12, th1 = 0.74){
  const pts = [th0 <= 0.15 ? DISC.clone() : retPt(az, th0)];
  for (let i = 1; i <= 6; i++)
  {
    const t = i / 6, th = th0 + (th1 - th0) * t;
    pts.push(retPt(az + bend * (0.5 * t * t), th));
  }
  return vTube(pts, r0, mat, 26);
}

const aCentral = [vTube([V3(-0.16, 0.02, -2.46), V3(-0.15, -0.02, -1.95), DISC.clone()], 0.028, artMat, 26)];
const vCentral = [vTube([V3(-0.06, 0.09, -2.46), V3(-0.11, 0.05, -1.95), DISC.clone().add(V3(0.06, 0.04, 0.02))], 0.026, veinMat, 26)];

// Верхне- и нижне-височные, верхне- и нижне-назальные аркады; вена идёт рядом с артерией
[[0.78, 0.55], [-0.78, -0.55], [2.36, -0.5], [-2.36, 0.5]].forEach(([az, bend]) => {
  aCentral.push(arcade(az, bend, 0.016, artMat));
  vCentral.push(arcade(az + 0.055, bend, 0.019, veinMat, 0.12, 0.72));
  for (const s of [-0.48, 0.52])   // ветви второго поколения — в 0.65 раза тоньше
  {
    aCentral.push(arcade(az + s, bend, 0.010, artMat, 0.34, 0.88));
    vCentral.push(arcade(az + s + 0.05, bend, 0.012, veinMat, 0.34, 0.86));
  }
});

// аа. ciliares posteriores breves — 10 ветвей симметрично вокруг нерва
const aShort = [];
for (let i = 0; i < 10; i++)
{
  const a = i / 10 * Math.PI * 2, pts = [];
  for (let k = 0; k <= 6; k++)   // от заднего полюса по склере к экватору
  {
    const th = 0.30 + (1.24 - 0.30) * (k / 6);
    pts.push(V3(Math.sin(th) * Math.cos(a), Math.sin(th) * Math.sin(a), -Math.cos(th)).multiplyScalar(1.465));
  }
  aShort.push(vTube(pts, 0.018, artMat, 20));
}

// аа. ciliares posteriores longae — строго две, на 3 и 9 часах: выходят у нерва, идут к лимбу
const aLong = [];
[0, Math.PI].forEach(a => {
  const pts = [];
  for (let k = 0; k <= 8; k++)
  {
    const th = 2.72 + (0.62 - 2.72) * (k / 8);
    pts.push(V3(Math.sin(th) * Math.cos(a), Math.sin(th) * Math.sin(a), Math.cos(th)).multiplyScalar(1.492));
  }
  pts.push(V3(Math.cos(a) * 0.66, Math.sin(a) * 0.66, 1.30));
  aLong.push(vTube(pts, 0.017, artMat, 44));
});
const circulusIridis = new THREE.Mesh(new THREE.TorusGeometry(0.645, 0.018, 14, 80), artMat);
circulusIridis.position.z = 1.36;
aLong.push(circulusIridis);

// аа. ciliares anteriores — шесть через 60°: отходят от мышечных артерий и прободают склеру у лимба
const aAnt = [];
for (let i = 0; i < 6; i++)
{
  const a = i / 6 * Math.PI * 2 + 0.3;
  const d = [Math.cos(a), Math.sin(a)];
  const key = Math.abs(d[0]) > Math.abs(d[1]) ? [Math.sign(d[0]), 0] : [0, Math.sign(d[1])];   // ближайшая прямая мышца
  const p0 = V3(key[0] * 1.40, key[1] * 1.40, 0.72);
  const p1 = V3(d[0] * 1.30, d[1] * 1.30, 1.05);
  const p2 = V3(d[0] * 0.78, d[1] * 0.78, 1.34);
  aAnt.push(vTube([p0, p0.clone().lerp(p1, 0.5), p1, p1.clone().lerp(p2, 0.5), p2], 0.015, artMat, 18));
}
const marginalRing = new THREE.Mesh(new THREE.TorusGeometry(0.685, 0.013, 14, 72), artMat);
marginalRing.position.z = 1.40;
aAnt.push(marginalRing);

const aLacr = [vTube([V3(0.3, 0.75, -1.85), V3(0.85, 1.0, -1.35), V3(1.3, 1.2, -0.85)], 0.016, artMat, 26)];
const aMusc = [
  vTube([V3(0.0, 0.55, -1.85), V3(0.0, 1.2, -0.9), V3(0.0, 1.26, -0.3)], 0.015, artMat, 20),
  vTube([V3(0.5, 0.1, -1.85), V3(1.2, 0.1, -0.9), V3(1.3, 0.05, -0.3)], 0.015, artMat, 20)
];

// vv. vorticosae — четыре вены через 90°, прободают склеру косо, с ампулой у места выхода
const vVort = [];
const sphV = (az, el, r) => V3(Math.cos(el) * Math.cos(az) * r, Math.sin(el) * r, Math.cos(el) * Math.sin(az) * r);
for (let i = 0; i < 4; i++)
{
  const az = i * Math.PI / 2, el = -0.24;   // фазы строго через 90°, без сдвига
  const exit = sphV(az, el, 1.50);
  vVort.push(vTube([sphV(az, el - 0.06, 1.28), exit, sphV(az + 0.32, el + 0.12, 1.88),
                    sphV(az + 0.64, el + 0.22, 2.22)], 0.024, veinMat, 22));
  const amp = new THREE.Mesh(new THREE.SphereGeometry(0.043, 12, 10), veinMat);
  amp.position.copy(exit).multiplyScalar(1.01);
  vVort.push(amp);
}

const vOph = [
  vTube([V3(-0.32, 0.2, -2.0), V3(-0.5, 0.6, -2.55), V3(-0.72, 0.95, -2.95)], 0.05, veinMat, 22),
  vTube([V3(-0.36, -0.3, -2.0), V3(-0.6, -0.7, -2.5), V3(-0.86, -1.05, -2.9)], 0.045, veinMat, 22)
];

const capRet = [
  vTube([DISC.clone(), onR(0.2, 0.3, -1.3, 1.44), onR(0.5, 0.6, -1.1, 1.44)], 0.008, artMat, 18),
  vTube([DISC.clone(), onR(0.25, -0.35, -1.28, 1.44), onR(0.55, -0.7, -1.05, 1.44)], 0.008, artMat, 18),
  vTube([DISC.clone(), onR(-0.95, 0.15, -1.1, 1.44), onR(-1.2, 0.35, -0.75, 1.44)], 0.008, artMat, 18)
];

// ---- Угол передней камеры: трабекулярная сеть и шлеммов канал ----
// Сеть — сто мини-перекладин по кольцу у лимба, канал — тёмно-синее кольцо сразу за ней
const trabMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.005, 0.005, 0.055, 5),
  clipMat(new THREE.MeshStandardMaterial({color:0x8a7658, roughness:.95})), 100);
{
  const dm = new THREE.Object3D();
  for (let i = 0; i < 100; i++)
  {
    const a = i / 100 * Math.PI * 2;
    dm.position.set(Math.cos(a) * 0.60, Math.sin(a) * 0.60, 1.20 + (Math.random() - 0.5) * 0.022);
    dm.rotation.set(0, 0, a + Math.PI / 2 + (Math.random() - 0.5) * 0.7);
    dm.scale.set(1, 0.8 + Math.random() * 0.5, 1);
    dm.updateMatrix();
    trabMesh.setMatrixAt(i, dm.matrix);
  }
  trabMesh.instanceMatrix.needsUpdate = true;
  trabMesh.visible = false;      // видно только на срезе: снаружи их закрывает склера
  eyeGroup.add(trabMesh);
}
const schlemmMesh = new THREE.Mesh(new THREE.TorusGeometry(0.63, 0.015, 10, 96),
  clipMat(new THREE.MeshStandardMaterial({color:0x2b3f7a, roughness:.5, emissive:0x0a1430, emissiveIntensity:.6})));
schlemmMesh.position.z = 1.22;
schlemmMesh.visible = false;
eyeGroup.add(schlemmMesh);

// хориокапиллярный слой — процедурная сетка в шейдере
const CAP_FRAG = `uniform float uAlpha;
uniform vec3 uCutN;
uniform float uCutD;
varying vec3 vPos;
varying vec3 vNormal;
void main(){
  if (dot(vPos, uCutN) < uCutD) discard;
  float n1 = noise(vPos * 17.0);
  float n2 = noise(vPos * 39.0 + 7.0);
  float ridge = 1.0 - abs(n1 - 0.5) * 2.0;
  float mask = smoothstep(0.88, 0.99, ridge) * (0.3 + 0.32 * n2);
  if (mask < 0.06) discard;
  vec3 col = mix(vec3(0.36, 0.04, 0.03), vec3(0.86, 0.26, 0.16), mask * 2.0);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), clamp(mask * 2.2, 0.0, 0.8) * uAlpha);
}`;
const choriocapMat = new THREE.ShaderMaterial({uniforms:{uAlpha:{value:1}, uCutN:cutU.uCutN, uCutD:cutU.uCutD},
  vertexShader:VERT, fragmentShader:NOISE + CAP_FRAG, transparent:true, side:THREE.DoubleSide, depthWrite:false});
const choriocapMesh = new THREE.Mesh(new THREE.SphereGeometry(1.462, 64, 44), choriocapMat);

 // ---- Слои сетчатки (послойный вид) ----
const RETINA_LAYERS = [
  {ru:'Пигментный эпителий', lat:'Stratum pigmentosum', c:0x4a2a22},
  {ru:'Слой палочек и колбочек', lat:'Stratum neuroepitheliale', c:0xb5644f},
  {ru:'Наружная пограничная мембрана', lat:'Membrana limitans externa', c:0xd8b49a},
  {ru:'Наружный ядерный слой', lat:'Stratum nucleare externum', c:0x8f6a8c},
  {ru:'Наружный сетчатый слой', lat:'Stratum plexiforme externum', c:0xc9a3b8},
  {ru:'Внутренний ядерный слой', lat:'Stratum nucleare internum', c:0x7c6a9c},
  {ru:'Внутренняя пограничная мембрана', lat:'Membrana limitans interna', c:0xd0c3d8},
  {ru:'Ганглионарный слой', lat:'Stratum ganglionare', c:0x5b7fa8}
];
const retinaLayers = RETINA_LAYERS.map((L, i) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1.45 - i * 0.011, 56, 36, Math.PI * 0.52, Math.PI * 1.42, 0, Math.PI * 0.68),
    clipMat(new THREE.MeshBasicMaterial({color:L.c, side:THREE.BackSide, transparent:true, opacity:0})));
  m.rotation.x = -Math.PI / 2;
  m.visible = false;
  m.userData.r = 1.45 - i * 0.011;
  eyeGroup.add(m);
  return m;
});

[[scleraMesh,'sclera'], [corneaMesh,'cornea'], [irisMesh,'iris'], [irisBackMesh,'iris'], [pupilMesh,'pupilla'],
 [lensMesh,'lens'], [ciliaryMesh,'corpus-ciliare'], [zonuleMesh,'zonula-ciliaris'], [aqueousMesh,'humor-aquosus'],
 [vitreousMesh,'corpus-vitreum'], [retinaMesh,'retina'], [maculaMesh,'macula-lutea'], [foveaMesh,'fovea-centralis'],
 [discMesh,'discus-nervi-optici'], [nerveMesh,'nervus-opticus'], [conjunctivaMesh,'conjunctiva'],
 [sphincterMesh,'m-sphincter-pupillae'], [dilatorMesh,'m-dilatator-pupillae'],
 [limbusMesh,'limbus'], [episcleraMesh,'episclera'], [choroideaMesh,'choroidea'], [procMesh,'corpus-ciliare'],
 [capsuleMesh,'lens'], [nucleusMesh,'lens'], [lensHazeMesh,'lens'], [hyaloidMesh,'corpus-vitreum'],
 [upperLid.body,'palpebra-superior'], [upperLid.rim,'palpebra-superior'], [upperLid.lashMesh,'palpebra-superior'],
 [lowerLid.body,'palpebra-inferior'], [lowerLid.rim,'palpebra-inferior'], [lowerLid.lashMesh,'palpebra-inferior'],
 [glandA,'glandula-lacrimalis'], [glandB,'glandula-lacrimalis'],
 [canalU,'canaliculus-lacrimalis'], [canalL,'canaliculus-lacrimalis'],
 [sacMesh,'saccus-lacrimalis'], [ductMesh,'ductus-nasolacrimalis'],
 [rsSup,'m-rectus-superior'], [rsInf,'m-rectus-inferior'], [rsMed,'m-rectus-medialis'],
 [rsLat,'m-rectus-lateralis'], [obSup,'m-obliquus-superior'], [obInf,'m-obliquus-inferior']].forEach(([m, id]) => {
  m.userData.id = id;
  clickableMeshes.push(m);
  if (!m.parent) eyeGroup.add(m);
});
const VASC_GROUPS = [
  [aCentral, 'a-centralis-retinae', 'artery'],
  [aShort, 'aa-ciliares-posteriores-breves', 'artery'],
  [aLong, 'aa-ciliares-posteriores-longae', 'artery'],
  [aAnt, 'aa-ciliares-anteriores', 'artery'],
  [aLacr, 'a-lacrimalis', 'artery'],
  [aMusc, 'aa-musculares', 'artery'],
  [vCentral, 'v-centralis-retinae', 'vein'],
  [vVort, 'vv-vorticosae', 'vein'],
  [vOph, 'v-ophthalmica', 'vein'],
  [capRet, 'rete-capillare-retinae', 'cap'],
  [[choriocapMesh], 'choriocapillaris', 'cap']
];
VASC_GROUPS.forEach(([list, id, kind]) => list.forEach(m => {
  m.material = m.material.clone();   // свой материал на сосуд: прозрачностью управляет затухание
  m.userData.id = id;
  m.userData.kind = kind;
  clickableMeshes.push(m);
  if (!m.parent) eyeGroup.add(m);
}));
window.clickableMeshes = clickableMeshes;

// Фокус: затухание остальных частей
const fadeItems = clickableMeshes.map(m => {
  const mat = m.material;
  return {m, mat, sh:!!mat.isShaderMaterial, a:1, base:mat.opacity, dw:mat.depthWrite, grp:m.userData.grp || null, kind:m.userData.kind || null};
});
// роговица — шейдерная плёнка: её прозрачность задаёт шейдер, а не material.opacity,
// поэтому помечаем base < 1, чтобы затухание не сделало её непрозрачной
const corneaItem = fadeItems.find(o => o.m === corneaMesh);
if (corneaItem) corneaItem.base = 0.9;
const retinaItem = fadeItems.find(o => o.m.userData.id === 'retina');
fadeItems.push({m:orbitMesh, mat:orbitMesh.material, sh:false, a:1, base:1, dw:true, grp:null, kind:null});
const focus = {id:null, hover:null};
const camCenter = new THREE.Vector3(), camTo = new THREE.Vector3(), focusLocalCenter = new THREE.Vector3();
const meshById = id => clickableMeshes.find(m => m.userData.id === id);
function centerOf(m, out){ m.updateWorldMatrix(true, false); return out.copy(focusLocalCenter).applyMatrix4(m.matrixWorld); }

let rt, rtHalf, postScene, postCamera, postMat;
const ZOOM_MIN = 2.6, ZOOM_MAX = 8;   // общий диапазон зума для фокуса и колеса
const cbCur = new THREE.Matrix3();
const cbTar = new THREE.Matrix3();

function initPost(){
  rt = new THREE.WebGLRenderTarget(w, h, {minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter});
  // отдельная цель для полукадров: размер точно равен половине экрана, иначе post-квад не совпадёт
  rtHalf = new THREE.WebGLRenderTarget(Math.max(1, Math.floor(w / 2)), h, {minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter});
  postScene = new THREE.Scene();
  postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  postMat = new THREE.ShaderMaterial({
    uniforms:{tDiffuse:{value:rt.texture}, uColorMatrix:{value:cbCur}, uGain:{value:1}, uSat:{value:1}, uBlur:{value:0}, uAperture:{value:0}},
    vertexShader:'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform mat3 uColorMatrix;
      uniform float uGain; uniform float uSat; uniform float uBlur; uniform float uAperture;
      varying vec2 vUv;
      void main(){
        vec3 c;
        // глубина резкости: при фокусе на структуре периферия кадра подрасплывается
        float uB = max(uBlur, uAperture * smoothstep(0.18, 0.85, distance(vUv, vec2(0.5))));
        if (uB > 0.00002){
          vec3 acc = vec3(0.0); float ws = 0.0;
          for (int i = -1; i <= 1; i++){
            for (int j = -1; j <= 1; j++){
              float w = (i == 0 && j == 0) ? 1.0 : (abs(i) + abs(j) == 1 ? 0.65 : 0.32);
              acc += texture2D(tDiffuse, vUv + vec2(float(i), float(j)) * uB).rgb * w;
              ws += w;
            }
          }
          c = acc / ws;
        } else {
          c = texture2D(tDiffuse, vUv).rgb;
        }
        c = uColorMatrix * c;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, uSat);   // насыщенность: колбочки
        c *= uGain;                  // яркость: палочки и колбочки
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`
  });
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));
}

function renderHalf(x){
  const hw = Math.max(1, Math.floor(w / 2));
  renderer.setRenderTarget(rtHalf);          // setRenderTarget сам выставит viewport по размеру цели
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  postMat.uniforms.tDiffuse.value = rtHalf.texture;
  renderer.setScissorTest(true);
  renderer.setViewport(x, 0, hw, h);
  renderer.setScissor(x, 0, hw, h);
  renderer.render(postScene, postCamera);
  postMat.uniforms.tDiffuse.value = rt.texture;
}

function renderFrame(){
  if (state.compare){
    renderer.setScissorTest(true);
    camera.aspect = (w / 2) / h;
    camera.updateProjectionMatrix();
    renderHalf(0);
    applyState(NORMAL_EFF);
    renderHalf(w / 2);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    applyState(current);
    return;
  }
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCamera);
}

// ==== ДАННЫЕ ====
const NORM = {hr:72, rr:16, bpSys:120, bpDia:80, spo2:98};

const ANATOMY = {
  sclera: {ru:'Склера', lat:'Sclera', fn:'Плотная фиброзная оболочка глаза, сохраняет его форму и защищает внутренние структуры; к ней прикрепляются глазодвигательные мышцы.'},
  cornea: {ru:'Роговица', lat:'Cornea', fn:'Прозрачная передняя часть фиброзной оболочки — главная преломляющая поверхность (около 2/3 оптической силы). Сосудов не имеет, иннервирована тройничным нервом; пять слоёв — эпителий, Боуменова мембрана, строма, Десцеметова мембрана, эндотелий. Нажмите — слои развернутся.'},
  iris: {ru:'Радужка', lat:'Iris', fn:'Пигментированная диафрагма с отверстием в центре; две мышцы-антагониста меняют диаметр зрачка и поток света на сетчатку.'},
  pupilla: {ru:'Зрачок', lat:'Pupilla', fn:'Отверстие радужки: в норме 2–4 мм, сужается на свету (парасимпатика, III пара) и расширяется в темноте (симпатика).'},
  lens: {ru:'Хрусталик', lat:'Lens', fn:'Двояковыпуклая линза за радужкой: прозрачная капсула снаружи, плотное ядро (nucleus lentis) внутри. Меняет кривизну при аккомодации; потеря эластичности с возрастом даёт пресбиопию, помутнение капсулы — катаракту.'},
  'corpus-ciliare': {ru:'Цилиарное тело', lat:'Corpus ciliare', fn:'Содержит ресничную мышцу (аккомодация) и 70 цилиарных отростков (processus ciliares), секретирующих водянистую влагу; участвует в оттоке внутриглазной жидкости и в натяжении цинновых связок.'},
  'zonula-ciliaris': {ru:'Цинновы связки', lat:'Zonula ciliaris', fn:'Волокна от ресничного тела к капсуле хрусталика: натянуты — хрусталик уплощён (вдаль), расслаблены — округляется (вблизь).'},
  'humor-aquosus': {ru:'Водянистая влага', lat:'Humor aquosus', fn:'Прозрачная жидкость передней и задней камер: питает роговицу и хрусталик, участвует в поддержании внутриглазного давления.'},
  'corpus-vitreum': {ru:'Стекловидное тело', lat:'Corpus vitreum', fn:'Прозрачный гель, заполняющий заднюю камеру; поддерживает форму глаза и прижимает сетчатку к сосудистой оболочке. Через его центр идёт гиалоидный канал (canalis hyaloideus) — остаток эмбриональной артерии.'},
  retina: {ru:'Сетчатка', lat:'Retina', fn:'Внутренняя оболочка из десяти слоёв — от пигментного эпителия до ганглионарного слоя: палочки отвечают за сумеречное зрение, колбочки — за цветовое. Переключите «Послойно», чтобы слои разошлись.'},
  'macula-lutea': {ru:'Жёлтое пятно', lat:'Macula lutea', fn:'Зона максимальной плотности колбочек; обеспечивает центральное зрение и цветовосприятие.'},
  'fovea-centralis': {ru:'Центральная ямка', lat:'Fovea centralis', fn:'Углубление в центре жёлтого пятна — точка наибольшей остроты зрения, где свет падает прямо на колбочки.'},
  'discus-nervi-optici': {ru:'Диск зрительного нерва', lat:'Discus nervi optici', fn:'Место выхода аксонов ганглиозных клеток; фоторецепторов здесь нет — отсюда «слепое пятно». Нажмите на диск, чтобы запустить тест слепого пятна.'},
  'nervus-opticus': {ru:'Зрительный нерв', lat:'Nervus opticus', fn:'II пара черепных нервов: передаёт сигнал в хиазму, затем в зрительную кору затылочной доли.'},
  conjunctiva: {ru:'Конъюнктива', lat:'Conjunctiva', fn:'Слизистая оболочка, покрывающая склеру и внутреннюю поверхность века; при интоксикации краснеет, при ксерозе сохнет.'},
  'm-sphincter-pupillae': {ru:'Сфинктер зрачка', lat:'M. sphincter pupillae', fn:'Круговая мышца радужки: парасимпатика (ядро Якубовича, III пара) суживает зрачок — миоз.'},
  'm-dilatator-pupillae': {ru:'Дилататор зрачка', lat:'M. dilatator pupillae', fn:'Радиальные волокна радужки: симпатика расширяет зрачок — мидриаз, в том числе при стимуляторах.'},
  choroidea: {ru:'Хориоидея', lat:'Choroidea', fn:'Средняя оболочка увеального тракта между склерой и сетчаткой: тонкая (0,1–0,3 мм) тёмно-красная пластинка с бугристой поверхностью, питает наружные слои сетчатки. Вместе с радужкой и цилиарным телом — сосудистая оболочка.'},
  'a-centralis-retinae': {ru:'Центральная артерия сетчатки', lat:'A. centralis retinae', fn:'Ветвь глазной артерии: входит в зрительный нерв в 10–12 мм от глаза, выходит в центре диска и делится на верхнюю и нижнюю, затем на темпоральные и назальные ветви. Кровоснабжает внутренние слои сетчатки; её окклюзия даёт внезапную потерю зрения.'},
  'v-centralis-retinae': {ru:'Центральная вена сетчатки', lat:'V. centralis retinae', fn:'Идёт параллельно артерии внутри зрительного нерва и отводит кровь от сетчатки. При тромбозе на глазном дне видны множественные кровоизлияния.'},
  'aa-ciliares-posteriores-breves': {ru:'Короткие задние цилиарные артерии', lat:'Aa. ciliares posteriores breves', fn:'6–12 ветвей вокруг зрительного нерва: прободают склеру и образуют хориокапиллярный слой, питают наружные слои сетчатки.'},
  'aa-ciliares-posteriores-longae': {ru:'Длинные задние цилиарные артерии', lat:'Aa. ciliares posteriores longae', fn:'Две ветви в супрахориоидальном пространстве идут к переднему отделу и формируют большой артериальный круг радужки (circulus arteriosus iridis major).'},
  'aa-ciliares-anteriores': {ru:'Передние цилиарные артерии', lat:'Aa. ciliares anteriores', fn:'Отходят от мышечных артерий, прободают склеру у лимба и образуют краевую петлистую сеть — кровоснабжение радужки и цилиарного тела спереди.'},
  'a-lacrimalis': {ru:'Слёзная артерия', lat:'A. lacrimalis', fn:'Ветвь глазной артерии к слёзной железе и латеральным отделам века.'},
  'aa-musculares': {ru:'Мышечные артерии', lat:'Aa. musculares', fn:'Ветви глазной артерии к глазодвигательным мышцам; от них берут начало передние цилиарные артерии.'},
  'vv-vorticosae': {ru:'Вортикозные вены', lat:'Vv. vorticosae', fn:'4–6 крупных вен косо прободают склеру в области экватора и собирают кровь из хориоидеи и цилиарного тела — главный путь оттока.'},
  'v-ophthalmica': {ru:'Глазные вены', lat:'V. ophthalmica superior / inferior', fn:'Главные коллекторы орбиты, уходят в пещеристый синус. Верхняя анастомозирует с венами лица — путь распространения инфекции.'},
  choriocapillaris: {ru:'Хориокапиллярный слой', lat:'Choriocapillaris', fn:'Сеть капилляров между хориоидеей и пигментным эпителием: процедурная сетка, питает фоторецепторы.'},
  'rete-capillare-retinae': {ru:'Капилляры сетчатки', lat:'Rete capillare retinae', fn:'Тонкие ветви от аркад центральных сосудов по внутренней поверхности сетчатки.'},
  limbus: {ru:'Лимб', lat:'Limbus corneae', fn:'Кольцо перехода роговицы в склеру шириной около 1 мм: здесь лежат стволовые клетки роговичного эпителия и лимбальные сосуды.'},
  episclera: {ru:'Эписклера', lat:'Episclera', fn:'Рыхлый сосудистый слой между склерой и конъюнктивой; именно его сосуды расширяются при гиперемии — «красный глаз».'},
  'palpebra-superior': {ru:'Верхнее веко', lat:'Palpebra superior', fn:'Подвижная кожно-мышечная складка с хрящом (tarsus); поднимает её m. levator palpebrae superioris (III пара), а смыкает круговая мышца глаза (VII пара). По переднему краю растут ресницы (cilia): мигание распределяет слёзную плёнку и защищает роговицу.'},
  'palpebra-inferior': {ru:'Нижнее веко', lat:'Palpebra inferior', fn:'Менее подвижная складка с тарзальной пластинкой; на её краю открываются слёзные точки (puncta lacrimalia), через которые слёзы уходят в носослёзный проток.'},
  'glandula-lacrimalis': {ru:'Слёзная железа', lat:'Glandula lacrimalis', fn:'Альвеолярно-трубчатая железа в верхне-наружном углу орбиты: секретирует слёзную жидкость с лизоцимом, омывающую роговицу.'},
  'canaliculus-lacrimalis': {ru:'Слёзные канальцы', lat:'Canaliculi lacrimales', fn:'Два тонких канальца от слёзных точек у медиального угла к слёзному мешку; отводят слёзную жидкость.'},
  'saccus-lacrimalis': {ru:'Слёзный мешок', lat:'Saccus lacrimalis', fn:'Расширение между канальцами и носослёзным протоком; его воспаление — дакриоцистит.'},
  'ductus-nasolacrimalis': {ru:'Носослёзный проток', lat:'Ductus nasolacrimalis', fn:'Канал длиной около 12 мм, открывающийся в нижний носовой ход: так слёзы попадают в нос — отсюда «насморк» при плаче.'},
  'm-rectus-superior': {ru:'Верхняя прямая мышца', lat:'M. rectus superior', fn:'От вершины орбиты к верхней части склеры: поднимает глаз и поворачивает его кнутри (III пара).'},
  'm-rectus-inferior': {ru:'Нижняя прямая мышца', lat:'M. rectus inferior', fn:'Опускает глазное яблоко и слегка вращает его кнутри (III пара).'},
  'm-rectus-medialis': {ru:'Медиальная прямая мышца', lat:'M. rectus medialis', fn:'Приводит глаз к носу — самая сильная из прямых мышц (III пара).'},
  'm-rectus-lateralis': {ru:'Латеральная прямая мышца', lat:'M. rectus lateralis', fn:'Отводит глаз кнаружи (VI пара): при её параличе глаз отклонён кнутри — сходящееся косоглазие.'},
  'm-obliquus-superior': {ru:'Верхняя косая мышца', lat:'M. obliquus superior', fn:'Идёт через блок (trochlea) у медиального края орбиты и поворачивает глаз вниз и кнаружи, вращая его кнутри (IV пара).'},
  'm-obliquus-inferior': {ru:'Нижняя косая мышца', lat:'M. obliquus inferior', fn:'От нижнемедиального края орбиты к заднелатеральной склере: поднимает глаз и вращает его кнаружи (III пара).'}
};

const EFFECTS = {
  normal:       { name:'Норма', mechanism:'—',
                  pupil:0.30, redness:0.05, yellow:0, dryness:0, ptosis:0, nystagmus:0,
                  vitals:{hr:0,rr:0,bpSys:0,bpDia:0,spo2:0},
                  timecourse:null, withdrawal:'—' },
  opiates:      { name:'Опиаты', mechanism:'μ-опиоидные рецепторы → возбуждение ядра Эдингера–Вестфаля',
                  pupil:0.10, redness:0.05, yellow:0, dryness:0, ptosis:0.75, nystagmus:0,
                  vitals:{hr:-15, rr:-8, bpSys:-10, bpDia:-6, spo2:-6},
                  timecourse:{onset:'3–5 мин', peak:'15–30 мин', duration:'3–4 часа'},
                  withdrawal:'Мидриаз, слезотечение, зевота, ринорея, «гусиная кожа»' },
  stimulants:   { name:'Стимуляторы', mechanism:'блок обратного захвата дофамина/норадреналина → симпатическая активация',
                  pupil:0.85, redness:0.35, yellow:0, dryness:0.1, ptosis:0, nystagmus:0.4,
                  vitals:{hr:+25, rr:+6, bpSys:+15, bpDia:+10, spo2:0},
                  timecourse:{onset:'1–3 мин', peak:'15–20 мин', duration:'1–3 часа'},
                  withdrawal:'Сонливость, апатия, подавленное настроение' },
  cannabinoids: { name:'Каннабиноиды', mechanism:'CB1-рецепторы',
                  pupil:0.35, redness:0.55, yellow:0, dryness:0.5, ptosis:0.2, nystagmus:0,
                  vitals:{hr:+20, rr:0, bpSys:0, bpDia:0, spo2:0},
                  timecourse:{onset:'5–10 мин', peak:'20–30 мин', duration:'2–3 часа'},
                  withdrawal:'Раздражительность, нарушение сна (лёгкое)' },
  tobacco:      { name:'Табак', mechanism:'никотиновые ацетилхолиновые рецепторы',
                  pupil:0.25, redness:0.15, yellow:0.4, dryness:0.2, ptosis:0, nystagmus:0,
                  vitals:{hr:+10, rr:0, bpSys:+5, bpDia:+3, spo2:0},
                  timecourse:{onset:'секунды', peak:'5–10 мин', duration:'30–60 мин'},
                  withdrawal:'Тяга, раздражительность, снижение концентрации' },
  vape:         { name:'Вейп', mechanism:'никотиновые ацетилхолиновые рецепторы (+ раздражение слизистой пропиленгликолем)',
                  pupil:0.28, redness:0.30, yellow:0, dryness:0.65, ptosis:0, nystagmus:0,
                  vitals:{hr:+8, rr:0, bpSys:+4, bpDia:+2, spo2:0},
                  timecourse:{onset:'секунды', peak:'5 мин', duration:'20–40 мин'},
                  withdrawal:'Тяга, раздражительность' }
};

const SUBS = Object.keys(EFFECTS).map(k => [k, EFFECTS[k].name]);
const CB_MODES = [['normal','Норма'], ['protanopia','Протанопия'], ['deuteranopia','Дейтеранопия'], ['tritanopia','Тританопия'], ['achromatopsia','Ахроматопсия']];
const CB_MATRICES = {
  normal:[1,0,0, 0,1,0, 0,0,1],
  protanopia:[0.567,0.433,0, 0.558,0.442,0, 0,0.242,0.758],
  deuteranopia:[0.625,0.375,0, 0.7,0.3,0, 0,0.3,0.7],
  tritanopia:[0.95,0.05,0, 0,0.433,0.567, 0,0.475,0.525],
  achromatopsia:[0.299,0.587,0.114, 0.299,0.587,0.114, 0.299,0.587,0.114]
};

const GL = [
  {t:'μ-опиоидные рецепторы', s:'μ-опиоидн', d:'Рецепторы, через которые опиаты тормозят нейроны: растормаживается ядро Эдингера–Вестфаля, зрачок стойко суживается.'},
  {t:'CB1-рецептор', s:'CB1', d:'Каннабиноидный рецептор ЦНС и периферии: активация даёт гиперемию, сухость слизистых и тахикардию.'},
  {t:'Никотиновый ацетилхолиновый рецептор', s:'никотинов', d:'nAChR вегетативных ганглиев: никотин кратко возбуждает их, затем наступает вазоконстрикция.'},
  {t:'Симпатическая система', s:'симпатич', d:'Отдел вегетативной нервной системы: расширяет зрачок через m. dilatator pupillae, учащает пульс, суживает сосуды.'},
  {t:'Парасимпатическая система', s:'парасимпатич', d:'Отдел ВНС, ядро Якубовича (III пара): суживает зрачок через m. sphincter pupillae, замедляет пульс.'},
  {t:'Ядро Эдингера–Вестфаля', s:'ядр[а-яё]* Эдингера', d:'Парасимпатическое ядро III пары, управляющее сфинктером зрачка.'},
  {t:'Миоз', s:'миоз', d:'Сужение зрачка — сокращение m. sphincter pupillae (парасимпатика).'},
  {t:'Мидриаз', s:'мидриаз', d:'Расширение зрачка — сокращение m. dilatator pupillae (симпатика).'},
  {t:'Птоз', s:'птоз', d:'Опущение верхнего века при слабости m. levator palpebrae superioris.'},
  {t:'Нистагм', s:'нистагм', d:'Непроизвольные ритмичные колебания глазных яблок, чаще при поражении мозжечка.'},
  {t:'Гиперемия', s:'гипереми', d:'Покраснение из-за расширения сосудов и усиления локального кровотока.'},
  {t:'Ксероз', s:'ксероз', d:'Сухость роговицы и конъюнктивы из-за нестабильной слёзной плёнки.'},
  {t:'Вазоконстрикция', s:'вазоконстрикц', d:'Сужение просвета сосудов — склера бледнеет.'},
  {t:'Вазодилатация', s:'вазодилатац', d:'Расширение сосудов — склера краснеет.'},
  {t:'Аккомодация', s:'аккомодац', d:'Настройка хрусталика на близкое расстояние за счёт ресничной мышцы.'},
  {t:'Брадикардия', s:'брадикарди', d:'Урежение пульса ниже 60 уд/мин.'},
  {t:'Тахикардия', s:'тахикарди', d:'Учащение пульса выше 90 уд/мин.'},
  {t:'Гипертензия', s:'гипертензи', d:'Стойкое повышение артериального давления.'},
  {t:'Гипертермия', s:'гипертерми', d:'Повышение температуры тела выше нормы.'},
  {t:'PERRLA', s:'PERRLA', d:'Pupils, Equal, Round, Reactive to light, Accommodation — стандартная схема оценки зрачков.'}
];
const GL_RE = new RegExp(GL.map(g => '(' + g.s + '[а-яё]*)').join('|'), 'gi');

const QUIZ = [
  {q:'Какой зрачок характерен для опиатов?', o:['Широкий, до 7 мм','Точечный, 2–3 мм','Не изменён'], a:1,
   e:'Опиаты возбуждают ядро Эдингера–Вестфаля: парасимпатика стойко суживает зрачок — миоз.'},
  {q:'Что такое мидриаз?', o:['Расширение зрачка','Сужение зрачка','Опущение верхнего века'], a:0,
   e:'Мидриаз — расширение зрачка за счёт m. dilatator pupillae и симпатической активации.'},
  {q:'Для какой категории характерна выраженная гиперемия склеры?', o:['Опиаты','Табак','Каннабиноиды'], a:2,
   e:'Каннабиноиды через CB1-рецепторы расширяют сосуды конъюнктивы: redness 0.55 — максимум среди категорий.'},
  {q:'Как меняется ЧДД при опиатах?', o:['Повышается на 8','Снижается на 8','Не меняется'], a:1,
   e:'Опиаты угнетают дыхательный центр: 16 − 8 = 8 в минуту, HUD показывает красную зону.'},
  {q:'Какой признак типичен для синдрома отмены опиатов?', o:['Мидриаз, слезотечение, зевота','Миоз и угнетение дыхания','Сухость и желтизна склеры'], a:0,
   e:'Абстиненция после опиатов: мидриаз, слезотечение, зевота, ринорея, «гусиная кожа».'}
];

const lerp = (a, b, t) => a + (b - a) * t;
// Кадронезависимое затухание («средняя физика»): smoothing — доля пути, которая
// остаётся через 1 с, dt — секунды. Одинаково ведёт себя при 30 и 144 FPS, без библиотек.
const damp = (cur, target, smoothing, dt) => cur + (target - cur) * (1 - Math.pow(smoothing, Math.max(0, dt)));
const PUPIL0 = 0.10, PUPILK = 0.25;   // радиус зрачка 0.10–0.35 при радужке 0.62

// ==== ФИЗИОЛОГИЯ ====
const clamp01 = v => Math.max(0, Math.min(1, v));
const LUX_MIN = 0.02, LUX_MAX = 2000, LUX_DEF = 60;
// освещённость на роговице с учётом фонарика: подносим ближе — света больше
const torchLux = () => state.lux * (state.torch ? 1 + 260 * state.torchNear * state.torchNear : 1);
const luxFromSlider = t => LUX_MIN * Math.pow(LUX_MAX / LUX_MIN, t / 100);
const sliderFromLux = l => 100 * Math.log(l / LUX_MIN) / Math.log(LUX_MAX / LUX_MIN);
const radiusForMm = mm => PUPIL0 + (mm - 2) / 6 * PUPILK;

function previewFor(key, dose){
  const s = EFFECTS[key], n = EFFECTS.normal, o = {};
  for (const k of ['pupil', 'redness', 'yellow', 'dryness', 'ptosis', 'nystagmus']) o[k] = lerp(n[k], s[k], dose);
  return o;
}

function effectsFor(key, dose = 1){
  const o = previewFor(key, dose), p = PUPIL0 + o.pupil * PUPILK;
  return {pupil:p, dilate:clamp01((p - 0.16) / 0.19), redness:o.redness, yellow:o.yellow,
    dryness:o.dryness, ptosis:o.ptosis, nystagmus:o.nystagmus};
}

function vitalsFor(key, dose = state.dose){
  const d = EFFECTS[key].vitals;
  return {hr:Math.round(NORM.hr + d.hr * dose), rr:Math.round(NORM.rr + d.rr * dose),
    sys:Math.round(NORM.bpSys + d.bpSys * dose), dia:Math.round(NORM.bpDia + d.bpDia * dose),
    spo2:Math.round(NORM.spo2 + d.spo2 * dose)};
}

// освещённость: световой рефлекс зрачка и активность фоторецепторов
function lightMm(lux){
  return 7.4 - 5.2 * clamp01(Math.log(lux / LUX_MIN) / Math.log(LUX_MAX / LUX_MIN));
}

function pupilMmFromF(f, lux){
  const k = Math.min(1, Math.pow(Math.max(0.05, f / 0.30), 1.4));
  const mm = Math.max(1.6, Math.min(7, 2 + f * 6 + (lightMm(lux) - 3.8) * k - (state.near ? 1.3 : 0)));
  return state.cn3 ? Math.max(mm, 6.4) : mm;   // паралич III пары: сфинктер не сужает зрачок
}

function pupilMm(key = state.cat, dose = state.dose, lux = torchLux()){
  return pupilMmFromF(previewFor(key, dose).pupil, lux);
}

function photoFor(lux){
  const l = Math.log10(Math.max(LUX_MIN, lux));
  return {rods:Math.round(100 * clamp01((1.2 - l) / 2.2)), cones:Math.round(100 * clamp01((l - 0.2) / 1.6))};
}

function reactFor(key, dose = state.dose){
  if (state.cn3) return ['отсутствует', 'bad'];
  const d = Math.abs(previewFor(key, dose).pupil - EFFECTS.normal.pupil);
  return d < 0.06 ? ['живая', 'ok'] : d < 0.25 ? ['вялая', 'warn'] : ['почти отсутствует', 'bad'];
}

function perrlaFor(key = state.cat, dose = state.dose){
  const r = reactFor(key, dose);
  return [['P','Pupils', pupilMm(key, dose).toFixed(1) + ' мм','ok'], ['E','Equal','да','ok'],
    ['R','Round','да','ok'], ['R','Reactive to light', r[0], r[1]], ['L','Accommodation','сохранена','ok']];
}

function vState(k, v){
  if (k === 'hr') return v >= 60 && v <= 90 ? 'ok' : v >= 50 && v <= 110 ? 'warn' : 'bad';
  if (k === 'rr') return v >= 12 && v <= 18 ? 'ok' : v >= 9 && v <= 22 ? 'warn' : 'bad';
  if (k === 'sys') return v >= 110 && v <= 130 ? 'ok' : v >= 100 && v <= 145 ? 'warn' : 'bad';
  if (k === 'dia') return v >= 70 && v <= 85 ? 'ok' : v >= 60 && v <= 95 ? 'warn' : 'bad';
  return v >= 96 ? 'ok' : v >= 92 ? 'warn' : 'bad';
}

// ==== UI ====
const $ = id => document.getElementById(id);
const IRIS_COLORS = {blue:{n:'Голубой', c:0x4f86b8}, green:{n:'Зелёный', c:0x3a7d5d}, brown:{n:'Карий', c:0x6b4a2a}, grey:{n:'Серый', c:0x7d8791}};
const XRAY = new Set(['sclera', 'choroidea', 'retina', 'episclera', 'conjunctiva', 'corpus-vitreum', 'humor-aquosus']);
// Единый объект состояния: сюда пишут только обработчики элементов управления.
// focusStructure()/возврат назад его читают и переприменяют, но никогда не сбрасывают.
const state = {cat:'normal', cb:'normal', compare:false, dose:1, lux:LUX_DEF, rods:120, cones:6, torch:false, torchNear:0, cn3:false, fundus:'normal', adnexa:false, layerView:'flat', iris:'green', vessels:false, arteries:true, veins:true, cutEnabled:false, blinkEnabled:true, age:25, haze:0, near:false, adapt:1};
const irisTar = new THREE.Color(IRIS_COLORS.green.c);
const target = effectsFor('normal');
const current = Object.assign({}, target);
const NORMAL_EFF = effectsFor('normal');
const tip = $('tip');
let quizAnswers = [], quizDone = false;

function glossify(txt){
  return txt.replace(GL_RE, m => {
    const g = GL.find(g => new RegExp('^' + g.s + '[а-яё]*$', 'i').test(m));
    return g ? `<span class="term" data-g="${g.t}">${m}</span>` : m;
  });
}

function setActive(sel, el){ document.querySelectorAll(sel).forEach(b => b.classList.toggle('active', b === el)); }

function buildButtons(){
  const lastSub = SUBS.length % 2 === 1 ? SUBS.length - 1 : -1;   // нечётное число — последняя кнопка на всю ширину
  $('subs').innerHTML = SUBS.map(([k, n], i) => `<button class="btn${i === 0 ? ' active' : ''}${i === lastSub ? ' full-width' : ''}" data-sub="${k}">${n}</button>`).join('');
  $('cbs').innerHTML = CB_MODES.map(([k, n]) => `<button class="btn${k === 'normal' ? ' active' : ''}${k === 'achromatopsia' ? ' full-width' : ''}" data-cb="${k}">${n}</button>`).join('');
  $('terms').innerHTML = GL.map(g => `<span class="chip" data-g="${g.t}">${g.t}</span>`).join('');
  $('iris-opts').innerHTML = Object.keys(IRIS_COLORS).map(k =>
    `<button class="iris-opt${k === state.iris ? ' active' : ''}" data-iris="${k}" style="background:#${IRIS_COLORS[k].c.toString(16).padStart(6, '0')}">${IRIS_COLORS[k].n}</button>`).join('');
}

function renderHUD(){
  $('perrla').innerHTML = perrlaFor(state.cat).map(([k, t, v, st]) =>
    `<div class="pr-row ${st}"><span class="pr-key">${k}</span><span class="pr-name">${t}</span><span class="pr-val">${v}</span></div>`).join('');
  const v = vitalsFor(state.cat);
  const cells = [['ЧСС', v.hr, 'уд/мин', vState('hr', v.hr)], ['ЧДД', v.rr, '/мин', vState('rr', v.rr)],
    ['АД', v.sys + '/' + v.dia, 'мм рт.ст.', vState('sys', v.sys)], ['SpO₂', v.spo2, '%', vState('spo2', v.spo2)]];
  $('vitals').innerHTML = cells.map(([n, val, u, st]) =>
    `<div class="v-cell ${st}"><div class="v-label">${n}</div><div class="v-num">${val} <small>${u}</small></div></div>`).join('');
  $('vignette').classList.toggle('active', cells.some(c => c[3] === 'bad'));
}

function renderText(){
  const s = EFFECTS[state.cat];
  $('sc-meta').textContent = 'доза ' + Math.round(state.dose * 100) + ' %';
  $('sc-name').textContent = s.name;
  $('sc-mech').innerHTML = glossify(s.mechanism);
  $('timecourse').innerHTML = s.timecourse
    ? `<span>начало <b>${s.timecourse.onset}</b></span><span>пик <b>${s.timecourse.peak}</b></span><span>длит. <b>${s.timecourse.duration}</b></span>`
    : '<span>действие отсутствует</span>';
  $('withdrawal').innerHTML = '<b>Синдром отмены.</b> ' + glossify(s.withdrawal);
  $('cmp-a').textContent = s.name.toLowerCase();
}

function setCat(key, el){
  state.cat = key;
  setActive('.btn[data-sub]', el);
  $('subs-cur').textContent = EFFECTS[key].name;
  $('subs-acc').classList.remove('open');
  $('subs-head').setAttribute('aria-expanded', 'false');
  Object.assign(target, effectsFor(key, state.dose));
  renderHUD(); renderText();



}

function setDose(v){
  state.dose = v;
  $('dose-val').textContent = Math.round(v * 100) + ' %';
  Object.assign(target, effectsFor(state.cat, v));
  renderHUD(); renderText();



}

// освещённость 0..1 по логарифмической шкале (0 — ночь, 1 — яркий день)
const luxNorm = l => clamp01(Math.log(Math.max(LUX_MIN, l) / LUX_MIN) / Math.log(LUX_MAX / LUX_MIN));
const T_DEF = luxNorm(LUX_DEF);

// модель зрения: палочки → яркость и сумеречная чувствительность, колбочки → цвет и острота
function visionSim(){
  const r = clamp01(state.rods / 120), c = clamp01(state.cones / 6), t = luxNorm(state.lux) / T_DEF;
  return {
    gain: Math.max(0.06, Math.min(1.7, (0.45 * r + 0.55 * c) * (0.32 + 0.68 * t))),
    sat:  clamp01((0.12 + 0.88 * c) * (0.55 + 0.45 * t)),
    blur: 0.0026 * (1 - c) * Math.max(0, 1.3 - 0.3 * t)
  };
}

function paintSim(){
  const v = visionSim();
  $('sw-line').style.filter = 'saturate(' + Math.round(v.sat * 100) + '%) brightness(' + Math.max(0.2, Math.min(1.2, v.gain)).toFixed(2) + ')';
  drawViewPrev();
}

// ---- Эффект Пуркинье: при слабом свете красное темнеет быстрее синего ----
// t = 0 в скотопическом диапазоне, 1 при ярком свете.
function purkinjeFx(lux){
  const t = clamp01((Math.log10(Math.max(lux, 0.02)) - Math.log10(0.06)) / (Math.log10(80) - Math.log10(0.06)));
  return {t, r: 0.14 + 0.86 * t, g: 0.5 + 0.5 * t, b: 0.8 + 0.2 * t};
}

const LENS_BASE_COL = new THREE.Color(0xdfeaf5), LENS_OLD_COL = new THREE.Color(0xf1dfa6);
const NUC_BASE_COL = new THREE.Color(0xf0e2c8), NUC_OLD_COL = new THREE.Color(0xd3b872);

// Картинка «как видит глаз»: цветные предметы + близкий текст
function drawViewPrev(){
  const cv = $('view-prev');
  if (!cv) return;
  const w = cv.clientWidth || 300, h = 108, dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  if (cv.width !== pw || cv.height !== ph){ cv.width = pw; cv.height = ph; }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const p = purkinjeFx(torchLux());
  const adaptK = 1 - (1 - state.adapt) * (1 - p.t);
  const lum = (0.16 + 0.84 * p.t) * adaptK;
  const haze = state.haze / 100;
  const hb = haze * 2.6;
  const nb = clamp01((state.age - 30) / 50) * 3.2;
  const C = (r, gg, b, k) => 'rgb(' + Math.round(Math.min(255, r * k)) + ',' + Math.round(Math.min(255, gg * k)) + ',' + Math.round(Math.min(255, b * k)) + ')';
  g.fillStyle = '#070c16';
  g.fillRect(0, 0, w, h);
  g.filter = hb > 0.05 ? 'blur(' + hb.toFixed(2) + 'px)' : 'none';
  const baseY = h - 22;
  g.fillStyle = C(40, 48, 62, lum);
  g.fillRect(0, baseY, w, 22);
  // красное яблоко
  const ax = w * 0.13, ay = baseY - 20;
  g.fillStyle = C(214, 62, 48, lum * p.r);
  g.beginPath(); g.ellipse(ax, ay, 16, 15, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = C(80, 160, 90, lum * p.g);
  g.beginPath(); g.ellipse(ax + 6, ay - 14, 7, 4, -0.5, 0, Math.PI * 2); g.fill();
  // синий сосуд
  const bx = w * 0.31;
  g.fillStyle = C(56, 118, 220, lum * p.b);
  g.fillRect(bx, baseY - 40, 24, 40);
  g.fillStyle = C(150, 200, 255, lum * p.b * 0.55);
  g.fillRect(bx + 3, baseY - 45, 18, 5);
  // жёлтая лампа
  const lx = w * 0.5, ly = baseY - 26;
  const glow = g.createRadialGradient(lx, ly, 2, lx, ly, 26);
  glow.addColorStop(0, C(255, 230, 140, lum * p.g * 0.8));
  glow.addColorStop(1, 'rgba(255,230,140,0)');
  g.fillStyle = glow; g.fillRect(lx - 26, ly - 26, 52, 52);
  g.fillStyle = C(240, 200, 70, lum * p.g);
  g.beginPath(); g.arc(lx, ly, 9, 0, Math.PI * 2); g.fill();
  // серая шкала
  for (let i = 0; i < 4; i++){
    const v = 40 + i * 55;
    g.fillStyle = C(v, v, v, lum);
    g.fillRect(w * 0.64 + i * 9, baseY - 26, 8, 26);
  }
  g.filter = 'none';
  // карточка с текстом вблизи — пресбиопия
  const cw = Math.min(112, w * 0.32);
  const cx2 = w - cw - 10, cy2 = 14;
  g.fillStyle = 'rgba(244,246,250,' + (0.18 + 0.82 * lum).toFixed(3) + ')';
  g.fillRect(cx2, cy2, cw, 58);
  g.filter = nb > 0.05 ? 'blur(' + nb.toFixed(2) + 'px)' : 'none';
  g.textAlign = 'center';
  g.fillStyle = 'rgba(18,24,36,' + (0.25 + 0.75 * lum).toFixed(3) + ')';
  g.font = '700 20px system-ui,-apple-system,Segoe UI,sans-serif';
  g.fillText('Е Ш Б', cx2 + cw / 2, cy2 + 28);
  g.font = '600 10px system-ui,-apple-system,Segoe UI,sans-serif';
  g.fillText('текст вблизи', cx2 + cw / 2, cy2 + 45);
  g.textAlign = 'left';
  g.filter = 'none';
  // жёлтая пелена катаракты
  if (haze > 0.02){
    g.fillStyle = 'rgba(236,203,116,' + (0.5 * haze).toFixed(3) + ')';
    g.fillRect(0, 0, w, h);
    const vg = g.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.9);
    vg.addColorStop(0, 'rgba(236,203,116,0)');
    vg.addColorStop(1, 'rgba(208,166,66,' + (0.45 * haze).toFixed(3) + ')');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);
  }
}

function applyAge(){
  const a = Math.max(0, Math.min(80, +$('age').value));
  state.age = a;
  $('age-num').textContent = a + ' лет';
  const k = clamp01((a - 30) / 50);
  const acc = Math.max(0.5, 18.5 - 0.3 * a);
  const np = 100 / acc;
  $('acc-readout').innerHTML = '<span>Объём аккомодации <b>' + acc.toFixed(1).replace('.', ',') + ' дптр</b></span>' +
    '<span>ближайшая точка ясного зрения <b>' + (np >= 100 ? (np / 100).toFixed(1).replace('.', ',') + ' м' : Math.round(np) + ' см') + '</b></span>';
  lensMesh.material.color.copy(LENS_BASE_COL).lerp(LENS_OLD_COL, k);
  nucleusMesh.material.color.copy(NUC_BASE_COL).lerp(NUC_OLD_COL, k);
  const fi = fadeItems.find(o => o.m === lensHazeMesh);
  if (fi) fi.base = 0.85 * k;
  drawViewPrev();
}

function applyHaze(){
  const v = Math.max(0, Math.min(100, +$('haze').value));
  state.haze = v;
  $('haze-num').textContent = v + ' %';
  drawViewPrev();
}

$('age').addEventListener('input', applyAge);
$('haze').addEventListener('input', applyHaze);
applyAge();
applyHaze();

function setLux(l){
  const prev = state.lux;
  state.lux = l;
  $('lux-val').textContent = (l < 1 ? l.toFixed(2).replace('.', ',') : Math.round(l)) + ' лк';
  // резкое затемнение — палочки теряют адаптацию и восстанавливают её постепенно
  if (l < prev * 0.66 && l < 5) state.adapt = 0.04;
  if (l > 20) state.adapt = 1;
  paintSim();
  renderAdapt();
  renderHUD();
}

function renderAdapt(){
  const pct = Math.round(state.adapt * 100);
  const v = $('adapt-val');
  if (!v) return;
  v.textContent = pct + ' %';
  $('adapt-bar').style.width = pct + '%';
  $('adapt-note').textContent = pct >= 100 ? 'палочки адаптированы' : 'палочки набирают чувствительность';
}

function setPhoto(){
  state.rods = +$('rod').value;
  state.cones = +$('cone').value;
  $('rod-num').textContent = state.rods + ' млн';
  $('cone-num').textContent = state.cones.toFixed(1).replace('.', ',') + ' млн';
  paintSim();
}

function setIris(key, el){
  state.iris = key;
  irisTar.setHex(IRIS_COLORS[key].c);
  setActive('.iris-opt', el);
}

function setLayerView(key, el){
  state.layerView = key;
  setActive('.btn[data-lv]', el);
  layersCard(focus.id);
}

function setCb(key, el){
  state.cb = key;
  setActive('.btn[data-cb]', el);
  cbTar.fromArray(CB_MATRICES[key]);
  cbCur.copy(cbTar);
}

function showStructure(id){
  const a = ANATOMY[id];
  if (!a) return;
  $('struct-box').querySelector('#info-title').textContent = a.ru;
  $('struct-lat').textContent = a.lat;
  $('struct-fact').textContent = a.fn;
}

// фонарик: модель и источник света
const torchGroup = new THREE.Group();
const torchBody = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.12, 0.52, 18),
  new THREE.MeshStandardMaterial({color:0x8fa3bd, metalness:.35, roughness:.45}));
torchBody.rotation.x = Math.PI / 2;
const torchLens = new THREE.Mesh(new THREE.CircleGeometry(0.095, 24),
  new THREE.MeshBasicMaterial({color:0xfff4cc}));
torchLens.position.z = 0.27;
const torchLight = new THREE.SpotLight(0xfff3cf, 0, 11, Math.PI / 7, 0.45, 1.1);
torchLight.target.position.set(0, 0, -1);
torchGroup.add(torchBody, torchLens, torchLight, torchLight.target);
torchGroup.visible = false;
scene.add(torchGroup);

const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
const hoverTip = $('hover-tip');
let savedZoom = null;

function pickAt(e){
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1));
  raycaster.setFromCamera(ndc, camera);
  const list = focus.id ? clickableMeshes.filter(m => m.userData.id === focus.id) : clickableMeshes.filter(m => m.visible);
  const hits = raycaster.intersectObjects(list, false)
    .filter(h => h.object.visible && (!cutOn || cutPlane.distanceToPoint(h.point) >= 0));
  const solid = hits.filter(h => !(h.object.material && h.object.material.transparent && h.object.material.opacity < .3));
  const hit = solid[0] || hits[0];
  return hit ? hit.object.userData.id : null;
}

function moveHoverTip(e){
  const tw = hoverTip.offsetWidth;
  hoverTip.style.left = Math.max(8, Math.min(window.innerWidth - tw - 18, e.clientX)) + 'px';
  hoverTip.style.top = Math.max(20, Math.min(window.innerHeight - 16, e.clientY)) + 'px';
}

function updateCursor(){
  renderer.domElement.style.cursor = dragging ? 'grabbing' : (focus.hover ? 'pointer' : 'grab');
}

function setHover(id, e){
  if (focus.hover === id){ if (id && e) moveHoverTip(e); return; }
  focus.hover = id;
  if (id){
    const a = ANATOMY[id];
    hoverTip.innerHTML = a.ru + ' <b>' + a.lat + '</b>';
    hoverTip.classList.add('on');
    if (e) moveHoverTip(e);
  } else hoverTip.classList.remove('on');
  updateCursor();
}

function layersCard(id){
  const cl = $('fc-layers');
  const list = id === 'cornea' ? CORNEA_LAYERS : (id === 'retina' && state.layerView === 'layers' ? RETINA_LAYERS : null);
  if (!list){ cl.innerHTML = ''; cl.classList.remove('on'); return; }
  cl.innerHTML = list.map((L, i) => `<div class="fc-layer"><i style="background:#${L.c.toString(16).padStart(6, '0')}"></i>${i + 1}. ${L.ru}<b>${L.lat}</b></div>`).join('') +
    `<div class="fc-layer" style="color:#526176">${id === 'cornea' ? 'слои развёрнуты от передней поверхности к задней' : 'слои развёрнуты от пигментного эпителия к ганглионарному'}</div>`;
  cl.classList.add('on');
}

// Клинические сценарии «Что будет, если…» — травмы и заболевания, не вещества.
// Ключи — id структур модели и id узлов схемы зрительного центра.
const SCENARIOS = {
  cornea: 'Механическая травма (эрозия роговицы) → резкая боль, слезотечение, светобоязнь (роговичный рефлекс). Заживает за счёт стволовых клеток лимба.',
  lens: 'Помутнение с возрастом — катаракта → постепенное снижение остроты зрения и жёлтоватый оттенок всего поля зрения. Лечится заменой хрусталика (факоэмульсификация с имплантацией интраокулярной линзы).',
  'zonula-ciliaris': 'Разрыв цинновой связки (травма или синдром Марфана) → вывих или подвывих хрусталика: видно край хрусталика, появляется ирригация, возможна вторичная глаукома.',
  retina: 'Отслойка сетчатки → вспышки света, «мушки», пелена или занавес с одной стороны поля зрения. Требует срочной операции: чем дольше отслойка, тем меньше шансов вернуть зрение.',
  'macula-lutea': 'Возрастная макулярная дегенерация → потеря центрального зрения при сохранном периферическом: человек видит боковым зрением, но не может читать и узнавать лица.',
  'discus-nervi-optici': 'Повышенное внутриглазное давление (глаукома) → постепенное повреждение волокон и углубление экскавации диска; сначала теряется периферическое зрение, центральное — в последнюю очередь.',
  'nervus-opticus': 'Окклюзия центральной артерии сетчатки → внезапная безболезненная необратимая слепота: концевая артерия без анастомозов, сетчатка белеет, а в фовеа видна «вишнёвая косточка».',
  chiasm: 'Сдавление опухолью гипофиза → битемпоральная гемианопсия: выпадают наружные (височные) половины полей зрения обоих глаз, потому что в хиазме страдают перекрещенные носовые волокна.',
  tract: 'Поражение зрительного тракта → гомонимная гемианопсия: выпадают одноимённые половины полей зрения обоих глаз (например, обе левые), со стороны поражения — атрофия диска.',
  v1: 'Повреждение первичной зрительной коры → корковая слепота в соответствующем участке поля зрения, при этом макулярная зона часто «щадится» из-за двойного кровоснабжения (ветви ЗСА и СМА).',
  v24: 'Повреждение вентрального потока (нижневисочная кора) → зрительная агнозия: поле зрения сохранено, человек видит цвет и форму, но не узнаёт предмет, лицо или букву. Он не скажет, что держит в руке, но легко ответит, если дать предмет в руки — узнавание через осязание сохраняется.'
};

// Переприменяет текущее состояние к сцене и к DOM. Ничего не сбрасывает:
// источник правды — объект state, а не локальные копии по экранам.
function applyAllToggles(){
  if (cutOn !== !!state.cutEnabled) setCut(!!state.cutEnabled);
  $('cut-toggle').checked = !!state.cutEnabled;
  $('vasc-toggle').checked = !!state.vessels;
  $('cn3-toggle').checked = !!state.cn3;
  $('blink-toggle').checked = state.blinkEnabled !== false;
  blinkState.enabled = state.blinkEnabled !== false;
  const cbEl = document.querySelector('.btn[data-cb="' + state.cb + '"]');
  if (cbEl && !cbEl.classList.contains('active')) setCb(state.cb, cbEl);
}

function focusStructure(id){
  if (focus.id === id) return;
  const first = !focus.id;
  focus.id = id;
  const m = id ? meshById(id) : null;
  if (m){
    const a = ANATOMY[id];
    setCompare(false);
    $('fc-lat').textContent = a.lat;
    $('fc-name').textContent = a.ru;
    $('fc-fn').textContent = a.fn;
    const scn = SCENARIOS[id] || '';
    $('fc-scn').hidden = !scn;
    $('fc-scn-box').textContent = scn;
    $('fc-scn-box').classList.remove('on');
    layersCard(id);
    $('focus-card').classList.add('on');
    $('hud').classList.add('off');
    // зум пересчитывается при каждом переходе A → B, а сохраняется только уход с волного глаза
    if (first) savedZoom = view.zoomTo;
    const box = new THREE.Box3();
    clickableMeshes.forEach(g => { if (g.userData.id === id) box.expandByObject(g); });
    if (box.isEmpty()) box.setFromObject(m);
    const sph = box.getBoundingSphere(new THREE.Sphere());
    m.worldToLocal(focusLocalCenter.copy(sph.center));
    const fit = sph.radius / Math.tan(camera.fov * Math.PI / 360);
    view.zoomTo = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fit * 2.2));   // камера не заходит внутрь структуры
    showStructure(id);
  } else {
    $('focus-card').classList.remove('on');
    $('hud').classList.remove('off');
    $('fc-scn').hidden = true;
    $('fc-scn-box').classList.remove('on');
    layersCard(null);
    hoverTip.classList.remove('on');
    if (savedZoom !== null){ view.zoomTo = savedZoom; savedZoom = null; }
  }
  applyAllToggles();   // разрез, сосуды, дальтонизм, мигание остаются какими были
  updateCursor();
}

function showTip(el){
  const g = GL.find(g => g.t === el.dataset.g);
  if (!g) return;
  tip.innerHTML = '<b>' + g.t + '</b>' + g.d;
  tip.classList.add('on');
  const r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
  tip.style.left = Math.min(window.innerWidth - tw - 10, Math.max(8, r.left + r.width / 2 - tw / 2)) + 'px';
  tip.style.top = (r.top - th - 8 < 8 ? r.bottom + 8 : r.top - th - 8) + 'px';
}

function setCompare(on){
  if (on && focus.id) focusStructure(null);
  state.compare = on;
  $('cmp-btn').classList.toggle('active', on);
  $('cmp-labels').classList.toggle('on', on);
  $('cmp-line').classList.toggle('on', on);
}

// --- офтальмоскопия: 2D-глазное дно, снимок в отчёт с подписями ---
const FUNDUS_MODES = [['normal','Норма'], ['diabetic','Диабетическая'], ['hyper','Гипертоническая']];
const FUNDUS_TEXT = {
  normal: 'Диск зрительного нерва бледно-розовый, границы чёткие; макула темнее фона, в центре — фовеолярный рефлекс. Артерии узкие и светлые, вены шире и темнее (соотношение около 2:3).',
  diabetic: 'Микроаневризмы и точечные геморрагии, твёрдые экссудаты вокруг макулы, ватные пятна, расширенные извитые вены — картина непролиферативной диабетической ретинопатии.',
  hyper: 'Артерии сужены, с симптомом «медной проволоки»; в местах перекрёстов — артериовенозные врезки, у диска штриховые геморрагии и ватные пятна. Картина гипертонической ретинопатии.'
};

function seeded(seed){ let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = s * 16807 % 2147483647) / 2147483647; }

function fundusBranch(g, x, y, ang, len, w, depth, rnd, bias, color){
  const pts = [[x, y]];
  let px = x, py = y, a = ang;
  const steps = 12;
  for (let i = 0; i < steps; i++){
    a += bias * 0.045 + (rnd() - 0.5) * 0.14;
    px += Math.cos(a) * len / steps;
    py += Math.sin(a) * len / steps;
    pts.push([px, py]);
  }
  g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = Math.max(0.9, w);
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++){
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  g.stroke();
  if (depth <= 0) return;
  const mid = pts[5], end = pts[pts.length - 1], q = pts[8];
  fundusBranch(g, mid[0], mid[1], a + (rnd() > 0.5 ? 0.55 : -0.55) + bias * 0.3, len * 0.52, w * 0.6, depth - 1, rnd, bias, color);
  fundusBranch(g, q[0], q[1], a + (rnd() > 0.5 ? 0.4 : -0.4) + bias * 0.2, len * 0.42, w * 0.45, depth - 1, rnd, bias, color);
  fundusBranch(g, end[0], end[1], a + (rnd() - 0.5) * 0.4, len * 0.62, w * 0.62, depth - 1, rnd, bias, color);
}

function drawFundus(cv, mode){
  const W = 520, dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = W * dpr;
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, W);
  const cx = W / 2, cy = W / 2, R = W * 0.47;
  const hyper = mode === 'hyper', diab = mode === 'diabetic';
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  const bg = g.createRadialGradient(cx * 0.92, cy * 0.9, R * 0.12, cx, cy, R * 1.05);
  bg.addColorStop(0, hyper ? '#c06a34' : '#c4682f');
  bg.addColorStop(0.6, hyper ? '#a3521f' : '#a94f22');
  bg.addColorStop(1, '#4d200d');
  g.fillStyle = bg; g.fillRect(0, 0, W, W);

  const dx = cx + R * 0.40, dy = cy - R * 0.10;   // диск
  const mx = cx - R * 0.34, my = cy + R * 0.04;   // макула
  const art = hyper ? '#e0b784' : '#e8574a', ven = hyper ? '#7d3f22' : '#6b1a26';
  const rnd = seeded(mode.length * 977 + 13);
  // тонкая зернистость фона
  for (let i = 0; i < 420; i++){
    const a = rnd() * Math.PI * 2, r = R * Math.sqrt(rnd()) * 0.98;
    g.fillStyle = rnd() > 0.5 ? 'rgba(255,190,140,.035)' : 'rgba(80,25,10,.05)';
    g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1 + rnd() * 2.5, 0, Math.PI * 2); g.fill();
  }
  const veinW = hyper ? 4.6 : 5.4, artW = hyper ? 3 : 3.6;
  g.filter = 'blur(0.35px)';
  // аркады: вена и артерия идут рядом, огибая макулу
  [[3.62, 1.12, -0.34], [3.2, 0.9, -0.42], [2.5, 1.12, 0.34], [2.92, 0.9, 0.42], [0.62, 0.52, -0.3], [-0.55, 0.48, 0.3]].forEach(([a0, len, b]) => {
    fundusBranch(g, dx + Math.cos(a0) * R * 0.1, dy + Math.sin(a0) * R * 0.1, a0, R * len, veinW, 3, rnd, b, ven);
    fundusBranch(g, dx + Math.cos(a0 + 0.08) * R * 0.1, dy + Math.sin(a0 + 0.08) * R * 0.1,
      a0 + 0.08, R * len * 0.94, artW, 3, rnd, b, art);
  });
  g.filter = 'none';

  const dg = g.createRadialGradient(dx - R * 0.02, dy - R * 0.02, R * 0.01, dx, dy, R * 0.115);
  dg.addColorStop(0, hyper ? '#fff0dc' : '#fff0d4'); dg.addColorStop(1, hyper ? '#d9a877' : '#e6b383');
  g.fillStyle = dg; g.beginPath(); g.ellipse(dx, dy, R * 0.115, R * 0.105, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,238,210,.5)'; g.beginPath(); g.ellipse(dx - R * 0.01, dy - R * 0.01, R * 0.045, R * 0.04, 0, 0, Math.PI * 2); g.fill();
  if (hyper){ g.strokeStyle = 'rgba(255,220,180,.55)'; g.lineWidth = 4; g.beginPath(); g.ellipse(dx, dy, R * 0.12, R * 0.11, 0, 0, Math.PI * 2); g.stroke(); }
  if (diab){ g.fillStyle = 'rgba(120,20,20,.5)'; g.beginPath(); g.arc(dx + R * 0.045, dy + R * 0.04, R * 0.025, 0, Math.PI * 2); g.fill(); }

  const mg = g.createRadialGradient(mx, my, R * 0.01, mx, my, R * 0.19);
  mg.addColorStop(0, 'rgba(80,20,8,.85)'); mg.addColorStop(1, 'rgba(120,45,18,0)');
  g.fillStyle = mg; g.beginPath(); g.arc(mx, my, R * 0.19, 0, Math.PI * 2); g.fill();
  if (!diab){ g.fillStyle = 'rgba(255,240,220,.5)'; g.beginPath(); g.arc(mx, my, R * 0.012, 0, Math.PI * 2); g.fill(); }

  if (diab){
    for (let i = 0; i < 46; i++){
      const a = rnd() * Math.PI * 2, r = R * (0.2 + rnd() * 0.72);
      g.fillStyle = i % 3 === 0 ? 'rgba(120,10,10,.85)' : 'rgba(160,30,30,.7)';
      g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.3 + rnd() * 2.6, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 16; i++){
      const a = rnd() * Math.PI * 2, r = R * (0.18 + rnd() * 0.5);
      g.fillStyle = 'rgba(255,226,140,.9)';
      g.beginPath(); g.arc(mx + Math.cos(a) * r * 0.55, my + Math.sin(a) * r * 0.45, 1.6 + rnd() * 2.4, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 5; i++){
      const a = rnd() * Math.PI * 2, r = R * (0.3 + rnd() * 0.5);
      g.fillStyle = 'rgba(255,246,232,.32)';
      g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 8 + rnd() * 9, 0, Math.PI * 2); g.fill();
    }
  }
  if (hyper){
    for (let i = 0; i < 6; i++){
      const a = rnd() * Math.PI * 2, r = R * (0.35 + rnd() * 0.45);
      g.fillStyle = 'rgba(255,248,236,.34)';
      g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 7 + rnd() * 8, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 10; i++){
      g.strokeStyle = 'rgba(170,25,25,.8)'; g.lineWidth = 2;
      const a = rnd() * Math.PI * 2, r = R * (0.14 + rnd() * 0.3);
      const x = dx + Math.cos(a) * r * 0.6, y = dy + Math.sin(a) * r * 0.6;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 5 + rnd() * 7, y + rnd() * 4 - 2); g.stroke();
    }
    for (let i = 0; i < 8; i++){
      const a = -0.9 + i * 0.22, r = R * 0.45;
      g.strokeStyle = 'rgba(255,214,160,.45)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(dx, dy);
      g.quadraticCurveTo(cx + R * 0.05, cy + Math.sin(a) * r * 0.6, mx, cy + Math.sin(a) * r * 0.9); g.stroke();
    }
  }
  g.restore();
  const vg = g.createRadialGradient(cx, cy, R * 0.72, cx, cy, R);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
  g.fillStyle = vg; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
}

function openFundus(){
  $('modal').classList.add('on');
  $('modal-card').innerHTML = '<h2>Офтальмоскопия</h2>' +
    '<div class="subtitle">Прямая офтальмоскопия: диск, макула и сосуды глазного дна</div>' +
    '<div class="grid3" id="fundus-modes"></div>' +
    '<canvas id="fundus-cv" class="fundus-cv"></canvas>' +
    '<div class="hint-line" id="fundus-text" style="margin-top:10px"></div>' +
    '<div class="actions"><button id="fundus-close">Закрыть</button></div>';
  $('fundus-modes').innerHTML = FUNDUS_MODES.map(([k, n]) => `<button class="btn${k === state.fundus ? ' active' : ''}" data-fm="${k}">${n}</button>`).join('');
  const cv = $('fundus-cv');
  const paint = () => { drawFundus(cv, state.fundus); $('fundus-text').textContent = FUNDUS_TEXT[state.fundus]; };
  $('fundus-modes').querySelectorAll('[data-fm]').forEach(b => b.addEventListener('click', () => {
    state.fundus = b.dataset.fm;
    $('fundus-modes').querySelectorAll('[data-fm]').forEach(x => x.classList.toggle('active', x === b));
    paint();
  }));
  paint();
  $('fundus-close').addEventListener('click', () => $('modal').classList.remove('on'));
}

// снимок для отчёта: подписи поверх кадра, в том числе в режиме сравнения
function reportCanvas(){
  const src = renderer.domElement;
  const cv = document.createElement('canvas');
  cv.width = src.width; cv.height = src.height;
  const g = cv.getContext('2d');
  g.drawImage(src, 0, 0);
  const fs = Math.max(13, Math.round(cv.width * 0.019));
  g.font = '600 ' + fs + 'px system-ui,-apple-system,Segoe UI,sans-serif';
  g.textBaseline = 'top';
  const pad = Math.round(cv.width * 0.016);
  if (state.compare){
    g.fillStyle = 'rgba(8,15,28,.78)'; g.fillRect(0, 0, cv.width, fs * 2.3);
    g.fillStyle = '#7dd3fc';
    g.fillText('НОРМА', pad, pad);
    g.textAlign = 'right';
    g.fillText(EFFECTS[state.cat].name.toUpperCase(), cv.width - pad, pad);
    g.textAlign = 'left';
    g.fillStyle = 'rgba(125,211,252,.85)';
    g.fillRect(Math.round(cv.width / 2) - 1, 0, 2, cv.height);
  }
  g.fillStyle = 'rgba(8,15,28,.78)'; g.fillRect(0, cv.height - fs * 2.3, cv.width, fs * 2.3);
  g.fillStyle = '#e2e8f0';
  g.fillText(EFFECTS[state.cat].name + ' · доза ' + Math.round(state.dose * 100) + ' % · зрачок ' +
    pupilMm().toFixed(1) + ' мм · ' + Math.round(torchLux()) + ' лк', pad, cv.height - fs * 1.75);
  return cv;
}

function openQuiz(){
  quizAnswers = new Array(QUIZ.length).fill(-1);
  quizDone = false;
  $('modal').classList.add('on');
  renderQuiz();
}

function openBlindSpot(){
  $('modal').classList.add('on');
  $('modal-card').innerHTML = '<h2>Демо слепого пятна</h2>' +
    '<div class="subtitle">Диск зрительного нерва — единственное место сетчатки без фоторецепторов</div>' +
    '<div class="bs-stage"><span class="bs-cross">✚</span><span class="bs-dot" id="bs-dot"></span></div>' +
    '<input type="range" id="bs-gap" class="rng" min="60" max="260" value="150">' +
    '<div class="tc"><span>смещение точки <b id="bs-val">150 px</b></span><span>правый глаз</span></div>' +
    '<div class="hint-line" style="margin-top:10px">Закройте левый глаз и смотрите правым только на крестик, не переводя взгляд на точку. Меняйте ползунок или наклоняйтесь к экрану: на каком-то расстоянии точка исчезнет, хотя фон останется.</div>' +
    '<div class="actions"><button id="bs-move">▶ Движение</button><button id="bs-close">Закрыть</button></div>' +
    '<div class="credits">Пятно находится примерно на 15° височнее (справа от центра взгляда), поэтому в тесте точка стоит справа от крестика. Для левого глаза зеркально закройте правый.</div>';
  const dot = $('bs-dot'), gap = $('bs-gap'), moveBtn = $('bs-move');
  let phase = +gap.value, dir = 1, moving = false, timer = 0, last = 0;
  const apply = () => {
    dot.style.left = 'calc(18% + ' + gap.value + 'px)';
    $('bs-val').textContent = gap.value + ' px';
  };
  const step = () => {
    if (!dot.isConnected){ clearInterval(timer); timer = 0; moving = false; return; }
    const now = Date.now();
    const dtS = Math.min(0.2, (now - last) / 1000) || 0.04;
    last = now;
    phase += dir * 70 * dtS;
    if (phase >= 260){ phase = 260; dir = -1; }
    else if (phase <= 60){ phase = 60; dir = 1; }
    gap.value = String(Math.round(phase));
    apply();
  };
  gap.addEventListener('input', () => { phase = +gap.value; apply(); });
  moveBtn.addEventListener('click', () => {
    moving = !moving;
    moveBtn.textContent = moving ? '⏸ Стоп' : '▶ Движение';
    if (moving){ last = Date.now(); if (!timer) timer = setInterval(step, 40); }
    else if (timer){ clearInterval(timer); timer = 0; }
  });
  apply();
  $('bs-close').addEventListener('click', () => { moving = false; $('modal').classList.remove('on'); });
}

// ---- Тест Амслера: сетка для проверки макулы ----
let amsDegen = false;
function drawAmsler(){
  const cv = $('ams-cv');
  if (!cv) return;
  const S = 600, g = cv.getContext('2d');
  cv.width = S; cv.height = S;
  g.fillStyle = '#f7f7f2';
  g.fillRect(0, 0, S, S);
  const warp = (x, y) => {
    if (!amsDegen) return [x, y];
    const dx = x - S / 2, dy = y - S / 2;
    const d = Math.hypot(dx, dy) || 1;
    const amp = 22 * Math.exp(-(d * d) / (2 * 120 * 120)) * Math.sin(d / 22);
    return [x + dx / d * amp, y + dy / d * amp];
  };
  const N = 12, step = S / N;
  g.strokeStyle = '#1b2433';
  g.lineWidth = 1.6;
  g.lineCap = 'round';
  for (let i = 1; i < N; i++){
    g.beginPath();
    for (let t = 0; t <= S; t += 12){
      const w2 = warp(i * step, t);
      if (t === 0) g.moveTo(w2[0], w2[1]); else g.lineTo(w2[0], w2[1]);
    }
    g.stroke();
    g.beginPath();
    for (let t = 0; t <= S; t += 12){
      const w2 = warp(t, i * step);
      if (t === 0) g.moveTo(w2[0], w2[1]); else g.lineTo(w2[0], w2[1]);
    }
    g.stroke();
  }
  g.strokeStyle = '#0b1220';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, S - 3, S - 3);
  if (amsDegen){
    const rg = g.createRadialGradient(S / 2, S / 2, 8, S / 2, S / 2, 100);
    rg.addColorStop(0, 'rgba(30,30,34,.9)');
    rg.addColorStop(.55, 'rgba(64,61,56,.55)');
    rg.addColorStop(1, 'rgba(64,61,56,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, S, S);
  }
  g.fillStyle = amsDegen ? '#e46a6a' : '#d13b3b';
  g.beginPath(); g.arc(S / 2, S / 2, 5, 0, Math.PI * 2); g.fill();
}

function openAmsler(){
  $('modal').classList.add('on');
  amsDegen = false;
  $('modal-card').innerHTML = '<h2>Тест Амслера</h2>' +
    '<div class="subtitle">Сетка для проверки макулы: смотрите на красную точку с 30–40 см одним глазом</div>' +
    '<canvas id="ams-cv" class="ams-cv"></canvas>' +
    '<div class="grid2" id="ams-modes" style="margin-top:10px">' +
      '<button class="btn active" data-ams="0">Норма</button>' +
      '<button class="btn" data-ams="1">Макулярная дегенерация</button></div>' +
    '<div class="hint-line" style="margin-top:10px">При возрастной макулярной дегенерации прямые линии искривляются (метаморфопсия), а в центре появляется расплывчатое тёмное пятно — скотома. Так видит мир человек с поражением жёлтого пятна, хотя по краям поля зрения всё остаётся.</div>' +
    '<div class="actions"><button id="ams-close">Закрыть</button></div>';
  drawAmsler();
  $('ams-modes').querySelectorAll('[data-ams]').forEach(b => b.addEventListener('click', () => {
    amsDegen = b.dataset.ams === '1';
    $('ams-modes').querySelectorAll('[data-ams]').forEach(x => x.classList.toggle('active', x === b));
    drawAmsler();
  }));
  $('ams-close').addEventListener('click', () => $('modal').classList.remove('on'));
}

// ---- Звезда астигматизма: лучи одного меридиана расплываются ----
let astigOn = false, astigAxis = 90;
function drawAstig(){
  const cv = $('astig-cv');
  if (!cv) return;
  const S = 600, g = cv.getContext('2d');
  cv.width = S; cv.height = S;
  g.filter = 'none';
  g.fillStyle = '#f7f7f2';
  g.fillRect(0, 0, S, S);
  const cx = S / 2, cy = S / 2, R = S / 2 - 30, N = 24;
  const ax = astigAxis * Math.PI / 180;
  g.strokeStyle = '#111a24';
  g.lineWidth = 8;
  for (let i = 0; i < N; i++){
    const th = i * Math.PI * 2 / N;
    const bl = astigOn ? Math.abs(Math.sin(th - ax)) * 4.2 : 0;
    g.filter = bl > 0.15 ? 'blur(' + bl.toFixed(2) + 'px)' : 'none';
    g.beginPath();
    g.moveTo(cx + Math.cos(th) * 24, cy + Math.sin(th) * 24);
    g.lineTo(cx + Math.cos(th) * R, cy + Math.sin(th) * R);
    g.stroke();
  }
  g.filter = 'none';
  g.fillStyle = '#111a24';
  g.beginPath(); g.arc(cx, cy, 22, 0, Math.PI * 2); g.fill();
}

function openAstig(){
  $('modal').classList.add('on');
  astigOn = false;
  astigAxis = 90;
  $('modal-card').innerHTML = '<h2>Звезда астигматизма</h2>' +
    '<div class="subtitle">Лучистая звезда: при астигматизме часть лучей всегда вне фокуса</div>' +
    '<canvas id="astig-cv" class="star-cv"></canvas>' +
    '<div class="grid2" id="astig-modes" style="margin-top:10px"><button class="btn active" data-ast="0">Норма</button><button class="btn" data-ast="1">Астигматизм</button></div>' +
    '<input type="range" id="astig-axis" class="rng" min="0" max="180" step="5" value="90" style="margin-top:10px">' +
    '<div class="tc"><span>ось цилиндра</span><b id="astig-axis-val">90°</b></div>' +
    '<div class="hint-line" style="margin-top:10px">При астигматизме роговица или хрусталик имеют разную кривизну в разных меридианах: лучи, идущие по одному меридиану, собираются в фокус, а перпендикулярные ему размываются. Человек видит одни линии звезды резкими, другие — расплывчатыми; поворот оси показывает, какой меридиан страдает.</div>' +
    '<div class="actions"><button id="astig-close">Закрыть</button></div>';
  drawAstig();
  $('astig-modes').querySelectorAll('[data-ast]').forEach(b => b.addEventListener('click', () => {
    astigOn = b.dataset.ast === '1';
    $('astig-modes').querySelectorAll('[data-ast]').forEach(x => x.classList.toggle('active', x === b));
    drawAstig();
  }));
  const axis = $('astig-axis');
  axis.addEventListener('input', () => {
    astigAxis = +axis.value;
    $('astig-axis-val').textContent = axis.value + '°';
    drawAstig();
  });
  $('astig-close').addEventListener('click', () => $('modal').classList.remove('on'));
}

// ---- Поля зрения: моновидение ----
let vfMode = 'both';
function drawFields(){
  const cv = $('vf-cv');
  if (!cv) return;
  const W = 640, H = 240, g = cv.getContext('2d');
  cv.width = W; cv.height = H;
  const X = a => (a + 100) / 200 * W;
  const gy = H * 0.66;
  const sky = g.createLinearGradient(0, 0, 0, gy);
  sky.addColorStop(0, '#0a1728');
  sky.addColorStop(1, '#1b4258');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, gy);
  g.fillStyle = '#12241a';
  g.fillRect(0, gy, W, H - gy);
  g.strokeStyle = 'rgba(148,163,184,.25)';
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, gy); g.lineTo(W, gy); g.stroke();
  const box = (a, w, h, col) => { const x = X(a); g.fillStyle = col; g.fillRect(x - w / 2, gy - h, w, h); };
  // дерево
  box(-88, 9, 34, '#6b4a2a');
  g.fillStyle = '#2f6b3a';
  g.beginPath(); g.moveTo(X(-88), gy - 66); g.lineTo(X(-88) - 24, gy - 32); g.lineTo(X(-88) + 24, gy - 32); g.closePath(); g.fill();
  // дом
  box(-55, 52, 38, '#cbb894');
  g.fillStyle = '#8a3b32';
  g.beginPath(); g.moveTo(X(-55) - 32, gy - 38); g.lineTo(X(-55), gy - 62); g.lineTo(X(-55) + 32, gy - 38); g.closePath(); g.fill();
  // машина
  box(-22, 44, 16, '#c4443a');
  g.fillStyle = '#101820';
  g.beginPath(); g.arc(X(-22) - 12, gy - 2, 5, 0, 6.3); g.arc(X(-22) + 12, gy - 2, 5, 0, 6.3); g.fill();
  // человек
  g.fillStyle = '#2f6fe0';
  g.fillRect(X(32) - 4, gy - 36, 8, 22);
  g.beginPath(); g.arc(X(32), gy - 42, 6, 0, 6.3); g.fill();
  // фонарь (светится)
  const lx = X(66);
  const glow = g.createRadialGradient(lx, gy - 62, 2, lx, gy - 62, 24);
  glow.addColorStop(0, 'rgba(255,225,140,.9)');
  glow.addColorStop(1, 'rgba(255,225,140,0)');
  g.fillStyle = glow; g.fillRect(lx - 24, gy - 86, 48, 48);
  box(66, 5, 58, '#3a4657');
  g.fillStyle = '#facc15';
  g.beginPath(); g.arc(lx, gy - 62, 7, 0, 6.3); g.fill();
  // столб
  box(93, 7, 54, '#4a5568');
  // шкала углов
  g.fillStyle = 'rgba(148,163,184,.75)';
  g.font = '600 11px system-ui,sans-serif';
  g.textAlign = 'center';
  [-100, -50, 0, 50, 100].forEach(a => g.fillText(a + '°', X(a), H - 6));
  // маска невидимого
  const ranges = vfMode === 'both' ? [] : vfMode === 'right' ? [[-100, -60]] : [[60, 100]];
  ranges.forEach(r => {
    const x0 = X(r[0]), x1 = X(r[1]);
    g.fillStyle = 'rgba(3,7,14,.95)';
    g.fillRect(x0, 0, x1 - x0, H);
    g.strokeStyle = 'rgba(56,189,248,.55)';
    g.lineWidth = 2;
    g.setLineDash([7, 6]);
    g.beginPath();
    g.moveTo(vfMode === 'right' ? x1 : x0, 0);
    g.lineTo(vfMode === 'right' ? x1 : x0, H);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(148,163,184,.9)';
    g.font = '600 13px system-ui,sans-serif';
    g.fillText('не видно', (x0 + x1) / 2, H / 2);
  });
  // слепые пятна
  const spots = vfMode === 'left' ? [-15] : vfMode === 'right' ? [15] : [-15, 15];
  spots.forEach(a => {
    const x = X(a), y = gy - 58;
    g.fillStyle = 'rgba(2,4,10,.88)';
    g.beginPath(); g.arc(x, y, 6, 0, 6.3); g.fill();
    g.strokeStyle = 'rgba(250,204,21,.6)';
    g.lineWidth = 1.5;
    g.setLineDash([3, 3]);
    g.beginPath(); g.arc(x, y, 11, 0, 6.3); g.stroke();
    g.setLineDash([]);
  });
}

function openFields(){
  $('modal').classList.add('on');
  vfMode = 'both';
  $('modal-card').innerHTML = '<h2>Поля зрения: моновидение</h2>' +
    '<div class="subtitle">Одна и та же сцена — как её видит один глаз и оба вместе</div>' +
    '<canvas id="vf-cv" class="vf-cv"></canvas>' +
    '<div class="grid3" id="vf-modes" style="margin-top:10px"><button class="btn active" data-vf="both">Оба глаза</button><button class="btn" data-vf="right">Только правый</button><button class="btn" data-vf="left">Только левый</button></div>' +
    '<div class="hint-line" id="vf-note" style="margin-top:10px"></div>' +
    '<div class="actions"><button id="vf-close">Закрыть</button></div>';
  const note = () => {
    $('vf-note').textContent = vfMode === 'both'
      ? 'Вместе глаза дают поле около 200°: каждая сторона видна обоими глазами, а в центре — бинокулярная зона с объёмом.'
      : vfMode === 'right'
        ? 'Только правый глаз: от −60° до +100°. Височный «серп» справа (60–100°) видит только он, и именно этот участок теряется при закрытии правого глаза.'
        : 'Только левый глаз: от −100° до +60°. Его височный серп — слева, от −100° до −60°; всё остальное перекрыто вторым глазом.';
  };
  drawFields();
  note();
  $('vf-modes').querySelectorAll('[data-vf]').forEach(b => b.addEventListener('click', () => {
    vfMode = b.dataset.vf;
    $('vf-modes').querySelectorAll('[data-vf]').forEach(x => x.classList.toggle('active', x === b));
    drawFields();
    note();
  }));
  $('vf-close').addEventListener('click', () => $('modal').classList.remove('on'));
}

// ---- Бинокулярное зрение: два конуса обзора и зона стереозрения ----
let binocD = 60;
function drawBinoc(){
  const cv = $('binoc-cv');
  if (!cv) return;
  const W = 640, H = 300, g = cv.getContext('2d');
  cv.width = W; cv.height = H;
  g.fillStyle = '#060b16';
  g.fillRect(0, 0, W, H);
  const ex = 70, eyeY = [105, 195], fy = 150;
  const k = Math.pow(clamp01((binocD - 20) / 380), 0.72);
  const fx = 155 + (W - 235) * k;
  const ang = 0.34;
  const cones = eyeY.map(y => {
    const a = Math.atan2(fy - y, fx - ex);
    return [[ex, y], [ex + Math.cos(a - ang) * 900, y + Math.sin(a - ang) * 900], [ex + Math.cos(a + ang) * 900, y + Math.sin(a + ang) * 900]];
  });
  const poly = pts => {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
  };
  cones.forEach(c => {
    poly(c);
    g.fillStyle = 'rgba(56,189,248,.12)';
    g.fill();
    g.strokeStyle = 'rgba(56,189,248,.45)';
    g.lineWidth = 1.5;
    g.setLineDash([6, 5]);
    g.stroke();
    g.setLineDash([]);
  });
  // пересечение конусов — зона стереозрения
  g.save();
  poly(cones[0]);
  g.clip();
  poly(cones[1]);
  g.fillStyle = 'rgba(167,139,250,.3)';
  g.fill();
  g.restore();
  // бинокулярный аппарат (вид сверху)
  eyeY.forEach(y => {
    g.fillStyle = '#dbeafe';
    g.beginPath(); g.arc(ex, y, 13, 0, 6.3); g.fill();
    g.fillStyle = '#0b1220';
    g.beginPath(); g.arc(ex + 5, y, 6, 0, 6.3); g.fill();
  });
  g.font = '600 11px system-ui,sans-serif';
  g.textAlign = 'center';
  g.fillStyle = '#94a3b8';
  g.fillText('левый', ex, eyeY[0] - 20);
  g.fillText('правый', ex, eyeY[1] + 28);
  g.strokeStyle = 'rgba(250,204,21,.45)';
  g.lineWidth = 1;
  g.setLineDash([4, 4]);
  eyeY.forEach(y => { g.beginPath(); g.moveTo(ex, y); g.lineTo(fx, fy); g.stroke(); });
  g.setLineDash([]);
  g.fillStyle = '#facc15';
  g.beginPath(); g.arc(fx, fy, 7, 0, 6.3); g.fill();
  g.fillStyle = '#c4b5fd';
  g.font = '600 11px system-ui,sans-serif';
  g.fillText('зона стереозрения', Math.max(170, fx - 80), fy + 58);
  g.fillStyle = '#64748b';
  g.fillText('монокулярно', 430, 26);
  g.fillText('монокулярно', 430, H - 14);
}

function openBinoc(){
  $('modal').classList.add('on');
  binocD = 60;
  $('modal-card').innerHTML = '<h2>Бинокулярное зрение</h2>' +
    '<div class="subtitle">Вид сверху: два конуса обзора, их пересечение — зона, где мозг видит глубину</div>' +
    '<canvas id="binoc-cv" class="binoc-cv"></canvas>' +
    '<input type="range" id="binoc-d" class="rng" min="20" max="400" value="60" style="margin-top:10px">' +
    '<div class="tc"><span>расстояние до точки фиксации</span><b id="binoc-d-val">60 см</b></div>' +
    '<div class="hint-line" id="binoc-note" style="margin-top:10px"></div>' +
    '<div class="actions"><button id="binoc-close">Закрыть</button></div>';
  const note = () => {
    const conv = 2 * Math.atan(3.25 / binocD) * 180 / Math.PI;
    $('binoc-note').textContent = 'Конвергенция ' + conv.toFixed(1).replace('.', ',') + '°. ' +
      'Чем ближе точка фиксации, тем сильнее сведены глаза и уже общая зона стереозрения; на расстоянии 20–30 см она минимальна, дальше — расширяется.';
  };
  drawBinoc();
  note();
  const d = $('binoc-d');
  d.addEventListener('input', () => {
    binocD = +d.value;
    $('binoc-d-val').textContent = binocD + ' см';
    drawBinoc();
    note();
  });
  $('binoc-close').addEventListener('click', () => $('modal').classList.remove('on'));
}

// ---- Цветовая адаптация: последовательный образ ----
const AI_PAIRS = {red:['#d8342f', '#2fd3d8'], green:['#2fae62', '#cf3fb8'], blue:['#2f6fe0', '#e0c22f']};
const AI_NAMES = {red:'красный', green:'зелёный', blue:'синий'};
let aiColor = 'red', aiPhase = 'idle', aiLeft = 10, aiFade = 0, aiTimer = 0;
const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function drawAfter(){
  const cv = $('ai-cv');
  if (!cv) return;
  const S = 300, g = cv.getContext('2d');
  cv.width = S; cv.height = S;
  const pair = AI_PAIRS[aiColor];
  if (aiPhase !== 'after'){
    g.fillStyle = '#0f1626';
    g.fillRect(0, 0, S, S);
    g.fillStyle = pair[0];
    g.beginPath(); g.arc(S / 2, S / 2, 92, 0, 6.3); g.fill();
    g.textAlign = 'center';
    if (aiPhase === 'look'){
      g.fillStyle = 'rgba(255,255,255,.92)';
      g.font = '700 44px system-ui,sans-serif';
      g.fillText(String(Math.max(1, Math.ceil(aiLeft))), S / 2, S / 2 + 15);
      g.font = '600 12px system-ui,sans-serif';
      g.fillStyle = 'rgba(255,255,255,.7)';
      g.fillText('смотрите не моргая', S / 2, S - 22);
    } else {
      g.fillStyle = 'rgba(226,232,240,.8)';
      g.font = '600 12px system-ui,sans-serif';
      g.fillText('нажмите «Смотреть 10 с»', S / 2, S - 20);
    }
    return;
  }
  g.fillStyle = '#f2f3f5';
  g.fillRect(0, 0, S, S);
  const c = hex2rgb(pair[1]);
  const a = Math.max(0, 0.62 * (1 - aiFade / 5));
  const rg = g.createRadialGradient(S / 2, S / 2, 18, S / 2, S / 2, 104);
  rg.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(3) + ')');
  rg.addColorStop(0.7, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a * 0.55).toFixed(3) + ')');
  rg.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
  g.fillStyle = rg;
  g.beginPath(); g.arc(S / 2, S / 2, 104, 0, 6.3); g.fill();
  g.fillStyle = 'rgba(15,22,38,.55)';
  g.font = '600 11px system-ui,sans-serif';
  g.textAlign = 'center';
  g.fillText('дополнительный цвет гаснет', S / 2, S - 18);
}

function startAfter(){
  clearInterval(aiTimer);
  aiPhase = 'look';
  aiLeft = 10;
  aiFade = 0;
  const t0 = Date.now();
  drawAfter();
  aiTimer = setInterval(() => {
    if (!document.getElementById('ai-cv') || !$('modal').classList.contains('on')){ clearInterval(aiTimer); aiPhase = 'idle'; return; }
    const el = Date.now() - t0;
    if (el < 10000){
      aiLeft = (10000 - el) / 1000;
      drawAfter();
      return;
    }
    clearInterval(aiTimer);
    aiPhase = 'after';
    const ta = Date.now();
    drawAfter();
    aiTimer = setInterval(() => {
      if (!document.getElementById('ai-cv') || !$('modal').classList.contains('on')){ clearInterval(aiTimer); aiPhase = 'idle'; return; }
      aiFade = (Date.now() - ta) / 1000;
      drawAfter();
      if (aiFade >= 5){ clearInterval(aiTimer); aiPhase = 'idle'; drawAfter(); }
    }, 100);
  }, 200);
}

function openAfter(){
  $('modal').classList.add('on');
  clearInterval(aiTimer);
  aiPhase = 'idle';
  aiColor = 'red';
  $('modal-card').innerHTML = '<h2>Цветовая адаптация</h2>' +
    '<div class="subtitle">Посмотрите 10 секунд на цветное пятно, затем переведите взгляд на белое поле</div>' +
    '<canvas id="ai-cv" class="ai-cv"></canvas>' +
    '<div class="grid3" id="ai-colors" style="margin-top:10px"><button class="btn active" data-ai="red">Красный</button><button class="btn" data-ai="green">Зелёный</button><button class="btn" data-ai="blue">Синий</button></div>' +
    '<div class="actions" style="margin-top:10px"><button id="ai-start">Смотреть 10 с</button><button id="ai-close">Закрыть</button></div>' +
    '<div class="hint-line" style="margin-top:10px">Колбочки, долго смотревшие на один цвет, устают: на белом фоне они отвечают слабее соседей, и мозг видит дополнительный цвет — красный даёт голубой образ, зелёный — пурпурный, синий — жёлтый. Привыкание колбочек — та же адаптация, что и у палочек в темноте.</div>';
  drawAfter();
  $('ai-colors').querySelectorAll('[data-ai]').forEach(b => b.addEventListener('click', () => {
    aiColor = b.dataset.ai;
    clearInterval(aiTimer);
    aiPhase = 'idle';
    $('ai-colors').querySelectorAll('[data-ai]').forEach(x => x.classList.toggle('active', x === b));
    drawAfter();
  }));
  $('ai-start').addEventListener('click', startAfter);
  $('ai-close').addEventListener('click', () => { clearInterval(aiTimer); aiPhase = 'idle'; $('modal').classList.remove('on'); });
}

// ---- Глазодоминантные колонки ----
function drawColumns(){
  const cv = $('vc-cols');
  if (!cv) return;
  const W = cv.clientWidth || 560, H = cv.clientHeight || 92;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)){
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const widths = [26, 14, 22, 16, 30, 12, 24, 18, 28, 14, 20, 16];
  let x = 6, i = 0;
  while (x < W - 8){
    const w = Math.min(widths[i % widths.length], W - 8 - x);
    if (w <= 0) break;
    g.fillStyle = i % 2 === 0 ? 'rgba(56,189,248,.72)' : 'rgba(239,68,68,.68)';
    g.fillRect(x, 24, w, H - 50);
    x += w + 2;
    i++;
  }
  g.font = '600 9px system-ui,sans-serif';
  g.textAlign = 'left';
  g.fillStyle = '#cbd5e1';
  g.fillText('поверхность коры', 6, 16);
  g.fillStyle = 'rgba(56,189,248,.9)';
  g.fillRect(6, H - 18, 10, 8);
  g.fillStyle = '#94a3b8';
  g.fillText('левый глаз', 21, H - 11);
  g.fillStyle = 'rgba(239,68,68,.85)';
  g.fillRect(100, H - 18, 10, 8);
  g.fillStyle = '#94a3b8';
  g.fillText('правый глаз', 115, H - 11);
}

// ---- Саккады при чтении ----
let sacTimer = 0, sacStep = 0;
const SAC_LINES = ['Глаз читает не плавно, а скачками:', 'взгляд задерживается на слове,', 'затем перепрыгивает дальше.'];
function sacLayout(g){
  g.font = '600 22px Georgia,serif';
  const pts = [];
  SAC_LINES.forEach((line, li) => {
    const words = line.split(' ');
    let x = 34;
    const y = 62 + li * 54;
    words.forEach(w => {
      const ww = g.measureText(w).width;
      pts.push({x: x + ww / 2, y: y - 7, word: w});
      x += ww + 13;
    });
  });
  return pts;
}
function drawSaccade(){
  const cv = $('sac-cv');
  if (!cv) return;
  const W = 640, H = 250, g = cv.getContext('2d');
  cv.width = W; cv.height = H;
  g.fillStyle = '#101826';
  g.fillRect(0, 0, W, H);
  const pts = sacLayout(g);
  g.textAlign = 'left';
  SAC_LINES.forEach((line, li) => {
    g.fillStyle = 'rgba(226,232,240,.92)';
    g.fillText(line, 34, 62 + li * 54);
  });
  g.strokeStyle = 'rgba(250,204,21,.45)';
  g.lineWidth = 1.5;
  g.setLineDash([4, 4]);
  for (let i = 0; i < sacStep; i++){
    g.beginPath();
    g.moveTo(pts[i].x, pts[i].y);
    g.lineTo(pts[i + 1].x, pts[i + 1].y);
    g.stroke();
  }
  g.setLineDash([]);
  const cur = pts[Math.min(sacStep, pts.length - 1)];
  const glow = g.createRadialGradient(cur.x, cur.y, 2, cur.x, cur.y, 18);
  glow.addColorStop(0, 'rgba(250,204,21,.9)');
  glow.addColorStop(1, 'rgba(250,204,21,0)');
  g.fillStyle = glow;
  g.beginPath(); g.arc(cur.x, cur.y, 18, 0, 6.3); g.fill();
  g.fillStyle = '#facc15';
  g.beginPath(); g.arc(cur.x, cur.y, 5, 0, 6.3); g.fill();
  g.font = '600 11px system-ui,sans-serif';
  g.fillStyle = 'rgba(148,163,184,.9)';
  g.fillText('фиксаций: ' + (sacStep + 1) + ' · саккад: ' + sacStep, 34, H - 12);
  const el = $('sac-note');
  if (el){
    const txt = sacStep === 0 ? 'Взгляд стоит на первом слове: это зрительная фиксация.'
      : sacStep >= pts.length - 1 ? 'Строка прочитана: ' + (sacStep + 1) + ' фиксаций и ' + sacStep + ' скачков.'
      : 'Саккада: взгляд перескочил на следующее слово и снова замер.';
    if (el.textContent !== txt) el.textContent = txt;
  }
}
function sacPlay(){
  clearInterval(sacTimer);
  sacStep = 0;
  drawSaccade();
  sacTimer = setInterval(() => {
    if (!document.getElementById('sac-cv') || !$('modal').classList.contains('on')){ clearInterval(sacTimer); return; }
    const total = SAC_LINES.join(' ').split(' ').length;
    if (sacStep >= total - 1){ clearInterval(sacTimer); return; }
    sacStep++;
    drawSaccade();
  }, 420);
}
function openSaccade(){
  $('modal').classList.add('on');
  clearInterval(sacTimer);
  sacStep = 0;
  $('modal-card').innerHTML = '<h2>Саккады при чтении</h2>' +
    '<div class="subtitle">Глаз не скользит по строке, а перескакивает: фиксация — скачок — фиксация</div>' +
    '<canvas id="sac-cv" class="vf-cv"></canvas>' +
    '<div class="hint-line" id="sac-note" style="margin-top:10px"></div>' +
    '<div class="actions" style="margin-top:10px"><button id="sac-play">▶ Запустить</button><button id="sac-close">Закрыть</button></div>' +
    '<div class="hint-line" style="margin-top:10px">При чтении глаз делает 3–4 саккады в секунду — по одному скачку на слово или два; сами скачки длятся 20–40 мс, а между ними глаз стоит (фиксация около 250 мс). В это время мозг и «фотографирует» текст, поэтому при быстром чтении часть слов пропускается.</div>';
  drawSaccade();
  $('sac-play').addEventListener('click', sacPlay);
  $('sac-close').addEventListener('click', () => { clearInterval(sacTimer); $('modal').classList.remove('on'); });
}

// ---- Квиз: порядок пути сигнала ----
const PQ_STAGES = [
  ['photoreceptors', 'Фоторецепторы'],
  ['bipolar', 'Биполярные клетки'],
  ['ganglion', 'Ганглиозные клетки'],
  ['optic-nerve', 'Зрительный нерв'],
  ['chiasm', 'Хиазма'],
  ['lgn', 'ЛКТ таламуса'],
  ['v1', 'Кора V1']
];
let pqPool = [], pqSlots = [];
function pqRender(){
  const pool = $('pq-pool'), slots = $('pq-slots');
  if (!pool || !slots) return;
  pool.innerHTML = pqPool.map(i => '<button class="pq-chip" draggable="true" data-i="' + i + '">' + PQ_STAGES[i][1] + '</button>').join('') ||
    '<span class="hint-line" style="margin:0">все этапы разложены — проверьте</span>';
  slots.innerHTML = pqSlots.map((i, n) => '<div class="pq-slot" data-slot="' + n + '">' +
    (i == null ? '<span class="pq-num">' + (n + 1) + '</span>' : '<span class="pq-num">' + (n + 1) + '</span><button class="pq-chip" data-out="' + n + '">' + PQ_STAGES[i][1] + '</button>') +
    '</div>').join('');
  pool.querySelectorAll('[data-i]').forEach(b => {
    b.addEventListener('click', () => {
      const i = +b.dataset.i;
      const n = pqSlots.indexOf(null);
      if (n < 0) return;
      pqSlots[n] = i;
      pqPool = pqPool.filter(x => x !== i);
      pqRender();
    });
    b.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', b.dataset.i); });
  });
  slots.querySelectorAll('[data-out]').forEach(b => b.addEventListener('click', () => {
    const n = +b.dataset.out;
    pqPool.push(pqSlots[n]);
    pqSlots[n] = null;
    pqRender();
  }));
  slots.querySelectorAll('.pq-slot').forEach(sl => {
    sl.addEventListener('dragover', e => { e.preventDefault(); sl.classList.add('over'); });
    sl.addEventListener('dragleave', () => sl.classList.remove('over'));
    sl.addEventListener('drop', e => {
      e.preventDefault();
      sl.classList.remove('over');
      const i = +e.dataTransfer.getData('text/plain');
      if (isNaN(i)) return;
      const n = +sl.dataset.slot;
      const prev = pqSlots[n];
      pqSlots[n] = i;
      pqPool = pqPool.filter(x => x !== i);
      if (prev != null) pqPool.push(prev);
      pqRender();
    });
  });
}
function pqCheck(){
  const note = $('pq-note');
  if (pqSlots.some(x => x == null)){ note.textContent = 'Сначала разложите все семь этапов — в каждом слоте один узел.'; return; }
  let ok = 0;
  $('pq-slots').querySelectorAll('.pq-slot').forEach((sl, n) => {
    const right = pqSlots[n] === n;
    sl.classList.toggle('ok', right);
    sl.classList.toggle('bad', !right);
    if (right) ok++;
  });
  note.textContent = ok === 7 ? 'Верно: 7 из 7. Сигнал идёт от фоторецепторов в кору именно так.' : 'Верно ' + ok + ' из 7 — зелёным отмечены правильные позиции, остальные сдвинуты.';
}
function openPathQuiz(){
  $('modal').classList.add('on');
  pqPool = PQ_STAGES.map((_, i) => i).sort(() => Math.random() - 0.5);
  pqSlots = new Array(7).fill(null);
  $('modal-card').innerHTML = '<h2>Путь сигнала по порядку</h2>' +
    '<div class="subtitle">Перетащите (или нажмите) узлы в слоты: от сетчатки до коры</div>' +
    '<div class="pq-pool" id="pq-pool"></div>' +
    '<div class="pq-slots" id="pq-slots"></div>' +
    '<div class="actions" style="margin-top:12px"><button id="pq-check">Проверить</button><button id="pq-reset">Заново</button><button id="pq-close">Закрыть</button></div>' +
    '<div class="hint-line" id="pq-note" style="margin-top:10px">На телефоне достаточно нажимать на таблички: первая попадёт в слот 1, вторая в 2 и так далее. Нажать на слот — вернуть узел назад.</div>';
  pqRender();
  $('pq-check').addEventListener('click', pqCheck);
  $('pq-reset').addEventListener('click', () => {
    pqPool = PQ_STAGES.map((_, i) => i).sort(() => Math.random() - 0.5);
    pqSlots = new Array(7).fill(null);
    $('pq-note').textContent = 'Начнём заново: разложите семь этапов.';
    pqRender();
  });
  $('pq-close').addEventListener('click', () => $('modal').classList.remove('on'));
}

// ---- Таймлайн фототрансдукции ----
const PT_STEPS = [
  ['Фотон поглощён', 'Квант света попадает в ретиналь родопсина: 11-цис изомер переходит в полностью-транс, белок меняет форму и становится активным (метародопсин II).'],
  ['Активация трансдуцина', 'Метародопсин II обменивает ГДФ на ГТФ у трансдуцина — G-белка. Один активный родопсин включает десятки трансдуцинов: так слабый сигнал усиливается.'],
  ['Запуск ФДЭ', 'Активный трансдуцин включает фосфодиэстеразу — фермент, который гидролизует цГМФ. Это главный этап усиления каскада.'],
  ['Каналы закрываются', 'Уровень цГМФ в цитоплазме падает, натриевые каналы мембраны запираются: приток Na⁺ и Ca²⁺ прекращается.'],
  ['Гиперполяризация', 'Мембрана уходит с −40 до −70 мВ: фоторецептор гиперполяризуется, медиатор выделяется меньше, и сигнал уходит в биполяры. Единственный рецептор, который отвечает на стимул не возбуждением, а торможением.']
];
let ptStep = 0;
function drawPhoto(){
  const cv = $('pt-cv');
  if (!cv) return;
  const W = 640, H = 250, g = cv.getContext('2d');
  cv.width = W; cv.height = H;
  g.fillStyle = '#060b16';
  g.fillRect(0, 0, W, H);
  // мембрана диска
  g.fillStyle = 'rgba(148,163,184,.22)';
  g.fillRect(0, 172, W, 6);
  g.fillStyle = 'rgba(148,163,184,.12)';
  g.fillRect(0, 184, W, 6);
  const items = [
    {s:0, x:70, y:64, r:16, lab:'фотон', col:'250,204,21'},
    {s:0, x:155, y:118, r:28, lab:'родопсин', col:'56,189,248'},
    {s:1, x:285, y:118, r:22, lab:'трансдуцин', col:'167,139,250'},
    {s:2, x:410, y:118, r:24, lab:'ФДЭ', col:'34,211,238'},
    {s:3, x:505, y:70, r:14, lab:'цГМФ', col:'52,211,153'},
    {s:3, x:592, y:118, r:20, lab:'канал', col:'244,114,182'}
  ];
  // стрелки
  [[155, 118, 258, 118], [312, 118, 382, 118], [434, 118, 484, 88], [524, 78, 570, 106]].forEach(a => {
    const reached = a[0] > 300 ? ptStep >= 2 : ptStep >= 1;
    g.strokeStyle = 'rgba(148,163,184,' + (reached ? 0.75 : 0.25) + ')';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(a[2], a[3]); g.stroke();
  });
  items.forEach(it => {
    const reached = ptStep >= it.s;
    g.fillStyle = 'rgba(' + it.col + ',' + (reached ? 0.3 : 0.07) + ')';
    g.beginPath(); g.arc(it.x, it.y, it.r, 0, 6.3); g.fill();
    g.strokeStyle = 'rgba(' + it.col + ',' + (reached ? 1 : 0.28) + ')';
    g.lineWidth = reached ? 2.5 : 1.5;
    g.stroke();
    g.fillStyle = reached ? '#e2e8f0' : '#64748b';
    g.font = '600 10px system-ui,sans-serif';
    g.textAlign = 'center';
    g.fillText(it.lab, it.x, it.y + it.r + 14);
  });
  // потенциал
  const vm = ptStep >= 4 ? -70 : -40;
  const bx = 26, by = 210, bw = 300, bh = 14;
  g.fillStyle = 'rgba(148,163,184,.18)';
  g.fillRect(bx, by, bw, bh);
  const frac = (vm + 40) / -30;   // 0 при -40, 1 при -70
  g.fillStyle = ptStep >= 4 ? '#22d3ee' : '#94a3b8';
  g.fillRect(bx, by, Math.max(6, bw * frac), bh);
  g.fillStyle = '#cbd5e1';
  g.font = '600 11px system-ui,sans-serif';
  g.textAlign = 'left';
  g.fillText('потенциал мембраны: ' + vm + ' мВ', bx, by - 8);
  g.fillStyle = '#64748b';
  g.fillText('−70 мВ — гиперполяризация', bx + bw + 14, by + 12);
  g.textAlign = 'right';
  g.fillStyle = '#7dd3fc';
  g.fillText('шаг ' + (ptStep + 1) + ' / ' + PT_STEPS.length, W - 14, 20);
}
function ptApply(){
  drawPhoto();
  $('pt-title').textContent = PT_STEPS[ptStep][0];
  $('pt-body').textContent = PT_STEPS[ptStep][1];
  $('pt-next').textContent = ptStep >= PT_STEPS.length - 1 ? '↻ Сначала' : 'Далее →';
}
function openPhoto(){
  $('modal').classList.add('on');
  ptStep = 0;
  $('modal-card').innerHTML = '<h2>Фототрансдукция по шагам</h2>' +
    '<div class="subtitle">Как один фотон превращается в нервный сигнал</div>' +
    '<canvas id="pt-cv" class="vf-cv"></canvas>' +
    '<div class="info-box" style="margin-top:10px"><div id="pt-title" style="font-weight:700;color:#e2e8f0"></div><div id="pt-body" style="margin-top:4px;color:#94a3b8"></div></div>' +
    '<div class="actions" style="margin-top:10px"><button id="pt-next">Далее →</button><button id="pt-close">Закрыть</button></div>' +
    '<div class="hint-line" style="margin-top:10px">Каскад усиливает сигнал в тысячи раз: одна молекула родопсина активирует много трансдуцинов, каждый трансдуцин — свою ФДЭ, а та успевает расщепить тысячи молекул цГМФ.</div>';
  ptApply();
  $('pt-next').addEventListener('click', () => {
    ptStep = ptStep >= PT_STEPS.length - 1 ? 0 : ptStep + 1;
    ptApply();
  });
  $('pt-close').addEventListener('click', () => $('modal').classList.remove('on'));
}

// ---- Экзамен наоборот: функция → структура ----
let revDeck = [], revIdx = 0, revScore = 0;
function revBuild(){
  const keys = Object.keys(ANATOMY).filter(k => ANATOMY[k].fn && ANATOMY[k].fn.length > 70 && ANATOMY[k].ru);
  const pick = keys.slice().sort(() => Math.random() - 0.5).slice(0, 8);
  revDeck = pick.map(k => {
    const others = keys.filter(x => x !== k).sort(() => Math.random() - 0.5).slice(0, 3);
    const opts = [k].concat(others).sort(() => Math.random() - 0.5);
    return {ans: k, fn: ANATOMY[k].fn, opts};
  });
}
function revRender(){
  const body = $('rev-body');
  if (!body) return;
  if (revIdx >= revDeck.length){
    body.innerHTML = '<div class="info-box" style="margin-top:10px"><div style="font-weight:700;color:#e2e8f0">Результат: ' + revScore + ' из ' + revDeck.length + '</div>' +
      '<div style="margin-top:4px;color:#94a3b8">' + (revScore === revDeck.length ? 'Идеально: функция и структура связаны.' : 'Повторите карточки структур — там те же формулировки.') + '</div></div>';
    return;
  }
  const q = revDeck[revIdx];
  body.innerHTML = '<div class="tc" style="margin-top:10px"><span>вопрос ' + (revIdx + 1) + ' / ' + revDeck.length + '</span><span>верно: ' + revScore + '</span></div>' +
    '<div class="info-box" style="margin-top:8px"><div style="color:#e2e8f0">' + q.fn.slice(0, 190) + (q.fn.length > 190 ? '…' : '') + '</div></div>' +
    '<div class="grid2" id="rev-opts" style="margin-top:10px">' + q.opts.map((k, i) => '<button class="btn" data-i="' + i + '">' + ANATOMY[k].ru + '</button>').join('') + '</div>';
  body.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => {
    const k = q.opts[+b.dataset.i];
    if (k === q.ans) revScore++;
    body.querySelectorAll('[data-i]').forEach(x => {
      const isAns = q.opts[+x.dataset.i] === q.ans;
      if (isAns) x.classList.add('active');
      if (x === b && !isAns) x.style.borderColor = '#ef4444';
      x.disabled = true;
    });
    revIdx++;
    setTimeout(revRender, 750);
  }));
}
function openReverse(){
  $('modal').classList.add('on');
  revBuild();
  revIdx = 0;
  revScore = 0;
  $('modal-card').innerHTML = '<h2>Экзамен наоборот</h2>' +
    '<div class="subtitle">Показана функция — выберите структуру</div>' +
    '<div id="rev-body"></div>' +
    '<div class="actions" style="margin-top:10px"><button id="rev-close">Закрыть</button></div>' +
    '<div class="hint-line" style="margin-top:10px">Вопросы собраны из тех же описаний, что и карточки структур, — если сомневаетесь, вернитесь к модели и посмотрите карточку.</div>';
  revRender();
  $('rev-close').addEventListener('click', () => $('modal').classList.remove('on'));
}

// ---- Зрительный центр: плоская схема пути сигнала ----
const VISUAL_PATH = [
  {id:'photoreceptors', num:1, x:95, y:450, row:'b', lat:'Photoreceptores (bacilli et coni)', ru:'Фоторецепторы сетчатки', t1:'Фоторецепторы', t2:'палочки и колбочки',
    fn:'Преобразование света в электрический сигнал — фототрансдукция: квант света меняет форму родопсина (палочки) или йодопсина (колбочки), запускается каскад с трансдуцином и фосфодиэстеразой, и рецептор гиперполяризуется. Палочки работают в сумерках и дают чёрно-белую картину, колбочки — цвет и высокую остроту в центре сетчатки.'},
  {id:'bipolar', num:2, x:285, y:450, row:'b', lat:'Cellulae bipolares', ru:'Биполярные клетки', t1:'Биполярные', t2:'клетки ON/OFF',
    fn:'ON- и OFF-биполяры — первичная обработка сигнала. Они связывают фоторецепторы с ганглиозными клетками и сразу делят поток на два канала: ON-биполяр возбуждается, когда центр его рецептивного поля освещён, OFF — когда затемнён. Так сетчатка кодирует перепады яркости, а не абсолютный уровень света.'},
  {id:'ganglion', num:3, x:475, y:450, row:'b', lat:'Cellulae ganglionares retinae', ru:'Ганглиозные клетки', t1:'Ганглиозные', t2:'P-клетки, цвет',
    fn:'Единственные нейроны сетчатки, дающие потенциалы действия: их аксоны собираются в зрительный нерв. P-клетки (парвоцеллюлярные) отвечают за центральное зрение и цвет, M-клетки — за движение и грубую форму; ближе к макуле доля P-клеток резко растёт.'},
  {id:'optic-nerve', num:4, x:665, y:450, row:'b', lat:'Nervus opticus (n. II)', ru:'Зрительный нерв', t1:'Зрительный нерв', t2:'II пара, папилломакулярный',
    fn:'Передача сигнала к хиазме. Папилломакулярный пучок идёт в центре нерва и несёт информацию от макулы — самой важной зоны сетчатки. Волокна от носовой и височной половин идут в нём раздельно, поэтому поражение нерва даёт слепоту на этом глазу, отек диска и его атрофию.'},
  {id:'chiasm', num:5, x:855, y:450, row:'b', lat:'Chiasma opticum', ru:'Перекрёст (хиазма)', t1:'Хиазма', t2:'перекрёст носовых',
    fn:'Носовые волокна перекрещиваются на противоположную сторону, височные остаются на своей. После хиазмы каждый зрительный тракт несёт информацию от одноимённых половин сетчатки обоих глаз, то есть от противоположного поля зрения.'},
  {id:'tract', num:6, x:1045, y:450, row:'b', lat:'Tractus opticus', ru:'Зрительный тракт', t1:'Зрительный тракт', t2:'tractus opticus',
    fn:'Несёт информацию от противоположных половин поля зрения к латеральному коленчатому телу; небольшая часть волокон уходит в верхний бугорок четверохолмия — это путь зрачкового рефлекса и ориентировочной реакции на свет.'},
  {id:'lgn', num:7, x:1045, y:205, row:'t', lat:'Corpus geniculatum laterale thalami', ru:'Латеральное коленчатое тело', t1:'ЛКТ таламуса', t2:'6 слоёв, P-слои 3–6',
    fn:'Главный подкорковый центр зрения: шесть слоёв. P-слои (3, 4, 5, 6) обслуживают центральное зрение и цвет, M-слои (1 и 2) — движение. Каждый слой получает волокна строго от своей половины сетчатки, поэтому ретинотопия здесь сохраняется.'},
  {id:'radiation', num:8, x:800, y:205, row:'t', lat:'Radiatio optica (fasciculus Gratioleti)', ru:'Зрительная лучистость', t1:'Лучистость', t2:'пучок Грациоле',
    fn:'Аксоны нейронов ЛКТ веером идут через височную и теменную доли к затылочному полюсу. Верхние пучки несут нижние квадранты поля зрения, нижние — верхние; поэтому очаговые поражения дают квадрантные выпадения, а не полную гемианопсию.'},
  {id:'v1', num:9, x:555, y:205, row:'t', lat:'Cortex visualis primarius, sulcus calcarinus', ru:'Первичная зрительная кора V1', t1:'Кора V1', t2:'шпорная борозда',
    fn:'Лежит в области шпорной борозды затылочной доли. Корковое увеличение: фовеа занимает 50–60 % площади V1, хотя на сетчатке это доли процента, — поэтому центральное зрение представлено так широко. Здесь выделяются ориентация линий, контраст, границы и цветовой признак.'},
  {id:'v24', num:10, x:310, y:205, row:'t', lat:'Cortex visualis associativus (V2–V4)', ru:'Вторичная кора V2–V4', t1:'Кора V2–V4', t2:'«что?» и «где?»',
    fn:'Вентральный поток «что?» (V2 → V4 → нижневисочная кора) распознаёт объекты, цвет и лица; дорсальный поток «где?» (V2 → V5/MT → теменная кора) отвечает за движение и пространство и управляет движениями глаз. Это уже не карта сетчатки, а разбор зрительной сцены.'},
];
const VISUAL_LINKS = [['photoreceptors','bipolar'],['bipolar','ganglion'],['ganglion','optic-nerve'],['optic-nerve','chiasm'],['chiasm','tract'],['tract','lgn'],['lgn','radiation'],['radiation','v1'],['v1','v24']];
let vcSel = null;

function showBrainNode(id){
  const box = $('bc-info');
  const n = id ? VISUAL_PATH.find(v => v.id === id) : null;
  if (!n){
    box.innerHTML = '<div class="bi-lat">выберите этап</div><h3>Путь зрительного сигнала</h3>' +
      '<p>Нажмите на любой кружок — появится латинское название, русское имя и функция этого этапа. Сигнал идёт слева направо: три слоя сетчатки → нерв → хиазма → тракт, затем поднимается в таламус и возвращается назад в затылочную долю.</p>';
    return;
  }
  const scn = SCENARIOS[id] || (id === 'optic-nerve' ? SCENARIOS['nervus-opticus'] : '') || '';
  box.innerHTML = '<div class="bi-lat">' + n.lat + '</div><h3>' + n.num + '. ' + n.ru + '</h3><p>' + n.fn + '</p>' +
    (scn ? '<button class="scn-btn">⚠ Что будет, если…</button><div class="scn-box">' + scn + '</div>' : '');
}

$('bc-info').addEventListener('click', e => {
  const b = e.target.closest('.scn-btn');
  if (b) b.nextElementSibling.classList.toggle('on');
});

function buildBrain(){
  const byId = {};
  VISUAL_PATH.forEach(n => { byId[n.id] = n; });
  const links = VISUAL_LINKS.map(([a, b]) => {
    const A = byId[a], B = byId[b];
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
    const x1 = A.x + dx / len * 35, y1 = A.y + dy / len * 35;
    const x2 = B.x - dx / len * 39, y2 = B.y - dy / len * 39;
    return '<line class="vc-link" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) +
      '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" marker-end="url(#vc-arrow)"/>';
  }).join('');
  const nodes = VISUAL_PATH.map(n => {
    const top = n.row === 't';
    const y1 = top ? n.y - 52 : n.y + 52, y2 = top ? n.y - 68 : n.y + 68;
    return '<g class="vc-node" data-id="' + n.id + '" tabindex="0" role="button" aria-label="' + n.ru + '">' +
      '<circle cx="' + n.x + '" cy="' + n.y + '" r="30"/>' +
      '<text class="vc-num" x="' + n.x + '" y="' + (n.y + 6) + '">' + n.num + '</text>' +
      '<text class="vc-lbl" x="' + n.x + '" y="' + y1 + '">' + n.t1 + '</text>' +
      '<text class="vc-sub" x="' + n.x + '" y="' + y2 + '">' + n.t2 + '</text></g>';
  }).join('');
  const streams = '<g id="vc-streams">' +
    '<path class="vc-stream v" d="M548,168 C470,140 396,140 318,166"/>' +
    '<path class="vc-stream d" d="M566,236 C648,298 752,320 878,332"/>' +
    '<text class="vc-stream-lab v" x="398" y="132">что?</text>' +
    '<text class="vc-stream-lab d" x="800" y="352">где?</text>' +
    '</g>';
  $('bc-flow').innerHTML = '<svg id="vc-svg" viewBox="0 0 1160 560" role="img" aria-label="Путь зрительного сигнала от сетчатки до коры">' +
    '<defs><marker id="vc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
    '<path d="M0,0 L10,5 L0,10 z" fill="#38bdf8" opacity=".8"/></marker></defs>' + links + streams + nodes + '</svg>';
  $('bc-flow').querySelectorAll('.vc-node').forEach(g => {
    const pick = () => {
      const id = g.dataset.id;
      vcSel = vcSel === id ? null : id;
      $('bc-flow').querySelectorAll('.vc-node').forEach(x => x.classList.toggle('on', x.dataset.id === vcSel));
      showBrainNode(vcSel);
    };
    g.addEventListener('click', pick);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });
  showBrainNode(vcSel);
  if (!$('brain').dataset.streamBound){
    $('brain').dataset.streamBound = '1';
    $('brain').querySelectorAll('.bc-tool').forEach(b => b.addEventListener('click', () => {
      const grp = $('vc-streams'), on = b.classList.contains('on');
      $('brain').querySelectorAll('.bc-tool').forEach(x => x.classList.remove('on'));
      grp.classList.remove('on-v', 'on-d');
      if (!on){ b.classList.add('on'); grp.classList.add(b.dataset.stream === 'v' ? 'on-v' : 'on-d'); }
    }));
  }
}

function openBrain(){ $('brain').classList.add('on'); startVcLab(); }

// ---- Лабораторные демонстрации внутри схемы зрительного центра ----
let vcRaf = 0, rfDist = 0;

function drawMagnification(){
  const cv = $('vc-mag');
  if (!cv) return;
  const W = cv.clientWidth || 560, H = cv.clientHeight || 132;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)){
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const pad = 10, barW = W - pad * 2;
  const bar = (y, frac, col, label, sub) => {
    g.fillStyle = 'rgba(148,163,184,.18)';
    g.fillRect(pad, y, barW, 22);
    const w = Math.max(4, barW * frac);
    g.fillStyle = col;
    g.fillRect(pad + (barW - w) / 2, y, w, 22);
    g.fillStyle = '#cbd5e1';
    g.font = '600 10px system-ui,sans-serif';
    g.fillText(label, pad, y + 35);
    g.fillStyle = '#64748b';
    g.font = '500 9px system-ui,sans-serif';
    g.fillText(sub, pad, y + 46);
  };
  bar(4, 0.03, 'rgba(250,204,21,.95)', 'Сетчатка: фовеа ≈ 1 % рецепторов', 'крошечная точка в центре макулы');
  bar(58, 0.56, 'rgba(56,189,248,.95)', 'Кора V1: фовеа 50–60 % площади', 'огромная зона в затылочной доле');
  g.fillStyle = '#94a3b8';
  g.font = '500 9px system-ui,sans-serif';
  g.fillText('Тот же участок поля зрения занимает в мозге непропорционально больше места', pad, 122);
}

function drawRF(){
  const cv = $('vc-rf');
  if (!cv) return;
  const W = cv.clientWidth || 560, H = cv.clientHeight || 190;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)){
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#060b16';
  g.fillRect(0, 0, W, H);
  const cx = W * 0.32, cy = H / 2, R = Math.min(H * 0.38, W * 0.24);
  g.fillStyle = 'rgba(56,189,248,.06)';
  g.beginPath(); g.arc(cx, cy, R, 0, 6.3); g.fill();
  g.strokeStyle = 'rgba(56,189,248,.35)';
  g.lineWidth = 1.5;
  g.stroke();
  g.fillStyle = 'rgba(56,189,248,.14)';
  g.beginPath(); g.arc(cx, cy, R * 0.42, 0, 6.3); g.fill();
  g.strokeStyle = 'rgba(56,189,248,.55)';
  g.stroke();
  g.textAlign = 'center';
  g.fillStyle = '#7dd3fc';
  g.font = '600 9px system-ui,sans-serif';
  g.fillText('центр', cx, cy + 3);
  g.fillStyle = '#94a3b8';
  g.fillText('периферия', cx, cy - R * 0.72);
  const d = rfDist / 100;
  const px = cx + Math.cos(-0.6) * R * d, py = cy + Math.sin(-0.6) * R * d;
  g.fillStyle = 'rgba(250,250,235,.95)';
  g.beginPath(); g.arc(px, py, Math.max(5, R * 0.14), 0, 6.3); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.4)';
  g.lineWidth = 1;
  g.stroke();
  const resp = clamp01(Math.exp(-Math.pow(d / 0.34, 2)) - 0.75 * Math.exp(-Math.pow((d - 0.95) / 0.3, 2)));
  const bx = W - 74, bh = H - 60;
  g.fillStyle = 'rgba(148,163,184,.16)';
  g.fillRect(bx, 26, 26, bh);
  g.fillStyle = resp > 0.6 ? '#22c55e' : resp > 0.15 ? '#facc15' : '#ef4444';
  g.fillRect(bx, 26 + bh * (1 - resp), 26, bh * resp);
  g.fillStyle = '#cbd5e1';
  g.font = '600 10px system-ui,sans-serif';
  g.fillText('ответ', bx + 13, 18);
  g.fillText(Math.round(resp * 100) + '%', bx + 13, 26 + bh + 15);
  g.textAlign = 'left';
  const lab = resp > 0.5 ? 'в центре — сильный ответ'
    : resp > 0.15 ? 'частично в центре — слабее'
    : d > 0.9 ? 'только периферия — торможение'
    : 'на границе — почти нет ответа';
  const el = $('vc-rf-val');
  if (el && el.textContent !== lab) el.textContent = lab;
}

function buildVcCards(){
  const host = $('vc-cards');
  if (!host || host.dataset.built) return;
  host.dataset.built = '1';
  host.innerHTML = [
    ['simple', 'Простая', 'линия своего угла в строгом месте поля'],
    ['complex', 'Сложная', 'та же ориентация, но где угодно в поле'],
    ['hyper', 'Сверхсложная', 'угол или конец линии; прямая не возбуждает']
  ].map(c => '<div class="vcn-card"><canvas id="vcn-' + c[0] + '" width="300" height="200"></canvas>' +
    '<div class="vcn-cap"><b>' + c[1] + '</b> · ' + c[2] + '</div></div>').join('');
}

function vcCard(id, kind, t){
  const cv = document.getElementById(id);
  if (!cv) return;
  const g = cv.getContext('2d'), W = 300, H = 200;
  g.fillStyle = '#060b16';
  g.fillRect(0, 0, W, H);
  const cx = 96, cy = H / 2, R = 62;
  g.fillStyle = 'rgba(56,189,248,.05)';
  g.beginPath(); g.arc(cx, cy, R, 0, 6.3); g.fill();
  g.strokeStyle = 'rgba(56,189,248,.35)';
  g.lineWidth = 1.5;
  g.stroke();
  let resp = 0;
  if (kind === 'simple'){
    const ph = (t % 3) / 3;
    const x = cx - R + ph * 2 * R;
    resp = Math.exp(-Math.pow((x - cx) / 26, 2));
    g.strokeStyle = '#f8fafc';
    g.lineWidth = 6;
    g.beginPath(); g.moveTo(x, cy - 44); g.lineTo(x, cy + 44); g.stroke();
  } else if (kind === 'complex'){
    const ph = (t % 3) / 3;
    const x = cx - R + ph * 2 * R;
    resp = 0.92;
    g.strokeStyle = '#f8fafc';
    g.lineWidth = 6;
    g.beginPath(); g.moveTo(x, cy - 44); g.lineTo(x, cy + 44); g.stroke();
  } else {
    const corner = (t % 4) < 2;
    resp = corner ? 0.9 : 0.05;
    g.strokeStyle = corner ? '#f8fafc' : '#94a3b8';
    g.lineWidth = 6;
    g.beginPath();
    if (corner){
      g.moveTo(cx - 22, cy + 30);
      g.lineTo(cx + 14, cy + 30);
      g.lineTo(cx + 14, cy - 26);
    } else {
      g.moveTo(cx - 26, cy);
      g.lineTo(cx + 26, cy);
    }
    g.stroke();
    g.fillStyle = '#64748b';
    g.font = '600 10px system-ui,sans-serif';
    g.fillText(corner ? 'угол' : 'линия', 8, 16);
  }
  const bx = 226, bh = 140;
  g.fillStyle = 'rgba(148,163,184,.16)';
  g.fillRect(bx, 30, 26, bh);
  g.fillStyle = resp > 0.6 ? '#22c55e' : resp > 0.15 ? '#facc15' : '#ef4444';
  g.fillRect(bx, 30 + bh * (1 - resp), 26, bh * resp);
  g.textAlign = 'center';
  g.fillStyle = '#cbd5e1';
  g.font = '600 10px system-ui,sans-serif';
  g.fillText('ответ', bx + 13, 22);
  g.fillText(Math.round(resp * 100) + '%', bx + 13, 30 + bh + 14);
  g.textAlign = 'left';
}

function vcLabLoop(){
  if (!$('brain').classList.contains('on')){ vcRaf = 0; return; }
  const t = performance.now() * 0.001;
  vcCard('vcn-simple', 'simple', t);
  vcCard('vcn-complex', 'complex', t);
  vcCard('vcn-hyper', 'hyper', t);
  vcRaf = requestAnimationFrame(vcLabLoop);
}

function startVcLab(){
  buildVcCards();
  drawMagnification();
  drawRF();
  drawColumns();
  const t0 = performance.now() * 0.001;
  vcCard('vcn-simple', 'simple', t0);
  vcCard('vcn-complex', 'complex', t0);
  vcCard('vcn-hyper', 'hyper', t0);
  if (!vcRaf) vcRaf = requestAnimationFrame(vcLabLoop);
}

function renderQuiz(){
  $('modal-card').innerHTML = '<h2>Проверка знаний</h2><div class="subtitle">5 вопросов по категориям и признакам</div>' +
    QUIZ.map((q, i) => `<div class="q" id="q${i}"><div class="q-text">${i + 1}. ${q.q}</div>` +
      q.o.map((o, oi) => `<button class="q-opt" data-q="${i}" data-o="${oi}">${o}</button>`).join('') +
      `<div class="q-why">${q.e}</div></div>`).join('') +
    '<div class="actions"><button id="quiz-check">Проверить</button><button id="quiz-close">Закрыть</button></div><div id="quiz-score"></div>';
  $('modal-card').querySelectorAll('.q-opt').forEach(b => b.addEventListener('click', () => {
    if (quizDone) return;
    quizAnswers[+b.dataset.q] = +b.dataset.o;
    b.parentElement.querySelectorAll('.q-opt').forEach(x => x.classList.toggle('sel', x === b));
  }));
  $('quiz-check').addEventListener('click', scoreQuiz);
  $('quiz-close').addEventListener('click', () => $('modal').classList.remove('on'));
}

function scoreQuiz(){
  quizDone = true;
  let score = 0;
  QUIZ.forEach((q, i) => {
    const card = $('q' + i), picked = quizAnswers[i];
    card.classList.add('done');
    card.querySelectorAll('.q-opt').forEach((b, oi) => {
      b.classList.remove('sel');
      if (oi === q.a) b.classList.add('right');
      else if (oi === picked) b.classList.add('wrong');
    });
    if (picked === q.a) score++;
  });
  $('quiz-score').textContent = `Результат: ${score} из ${QUIZ.length}. Верные ответы подсвечены зелёным.`;
}

function saveFile(name, url){
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
}

function exportReport(){
  const wasCompare = state.compare;
  if (wasCompare) setCompare(false);   // снимаем цельный кадр, а не половину
  renderFrame();
  saveFile('eye-report.png', reportCanvas().toDataURL('image/png'));
  if (wasCompare) setCompare(true);
  const s = EFFECTS[state.cat], v = vitalsFor(state.cat);
  const lines = [
    'ОТКРЫТЫЙ УРОК ПО ФИЗИОЛОГИИ — ОТЧЁТ ПО ГЛАЗУ',
    'Дата: ' + new Date().toLocaleString('ru-RU'), '',
    'Категория: ' + s.name + ' · доза ' + Math.round(state.dose * 100) + ' %',
    'Механизм: ' + s.mechanism,
    'Зрачок: ' + pupilMm().toFixed(1) + ' мм · освещённость ' + Math.round(torchLux()) + ' лк' + (state.cn3 ? ' · рефлекс отсутствует (III пара)' : ''),
    'Фоторецепторы: палочки ' + state.rods + ' млн, колбочки ' + state.cones.toFixed(1).replace('.', ',') + ' млн',
    'Симуляция зрения: ' + state.cb, '',
    'PERRLA: ' + perrlaFor(state.cat).map(r => r[0] + ' (' + r[1] + ') — ' + r[2]).join('; '), '',
    'ВИТАЛЬНЫЕ ПОКАЗАТЕЛИ',
    'ЧСС: ' + v.hr + ' уд/мин · ЧДД: ' + v.rr + '/мин · АД: ' + v.sys + '/' + v.dia + ' мм рт.ст. · SpO₂: ' + v.spo2 + '%', '',
    'ФАРМАКОКИНЕТИКА: ' + (s.timecourse ? 'начало ' + s.timecourse.onset + ' · пик ' + s.timecourse.peak + ' · длительность ' + s.timecourse.duration : '—'), '',
    'СИНДРОМ ОТМЕНЫ: ' + s.withdrawal, '',
    'Демонстрационный материал для урока физиологии. Признаки — ориентировочные учебные значения, не клинический диагностический инструмент. Медицинская помощь при интоксикации — 103 (Узбекистан).'
  ];
  const blob = new Blob([lines.join('\n')], {type:'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  saveFile('eye-report.txt', url);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function reset(){
  setCat('normal', document.querySelector('.btn[data-sub="normal"]'));
  setCb('normal', document.querySelector('.btn[data-cb="normal"]'));
  setCompare(false);
  focusStructure(null);
  $('dose').value = 100; setDose(1);
  $('lux').value = Math.round(sliderFromLux(LUX_DEF)); setLux(LUX_DEF);
  $('rod').value = 120; $('cone').value = 6; setPhoto();
  $('cut-toggle').checked = false;
  setCut(false);
  $('adnexa-toggle').checked = false;
  state.adnexa = false;
  EyelidRig.open(1);
  setLayerView('flat', document.querySelector('.btn[data-lv="flat"]'));
  setIris('green', document.querySelector('.iris-opt[data-iris="green"]'));
  $('vasc-toggle').checked = false;
  state.vessels = false; state.arteries = true; state.veins = true;
  document.querySelectorAll('.btn[data-vasc]').forEach(b => b.classList.add('active'));
  $('torch-toggle').checked = false; state.torch = false;
  $('torch-near').value = 0; state.torchNear = 0;
  $('cn3-toggle').checked = false; state.cn3 = false;
  $('age').value = 25; applyAge();
  $('haze').value = 0; applyHaze();
  $('near-toggle').checked = false; state.near = false;
  state.adapt = 1; renderAdapt();
  state.fundus = 'normal';
  $('blink-toggle').checked = true;
  state.blinkEnabled = true;
  blinkState.enabled = true;
  blinkState.nextBlinkAt = performance.now() + 3000;
  Object.assign(current, target);
  cbCur.copy(cbTar);
}

buildButtons();
document.querySelectorAll('.btn[data-sub]').forEach(b => b.addEventListener('click', () => setCat(b.dataset.sub, b)));
document.querySelectorAll('.btn[data-cb]').forEach(b => b.addEventListener('click', () => setCb(b.dataset.cb, b)));
document.addEventListener('mouseover', e => { const el = e.target.closest('.term,.chip'); if (el) showTip(el); });
document.addEventListener('mouseout', e => { if (e.target.closest('.term,.chip')) tip.classList.remove('on'); });
document.addEventListener('click', e => { const el = e.target.closest('.term,.chip'); if (el) { e.preventDefault(); showTip(el); } });
$('subs-head').addEventListener('click', () => {
  const acc = $('subs-acc'), on = !acc.classList.contains('open');
  acc.classList.toggle('open', on);
  $('subs-head').setAttribute('aria-expanded', on);
});
$('dose').addEventListener('input', e => setDose(e.target.value / 100));
$('lux').addEventListener('input', e => setLux(luxFromSlider(+e.target.value)));
$('rod').addEventListener('input', setPhoto);
$('cone').addEventListener('input', setPhoto);
document.querySelectorAll('.rc-lbl[data-focus]').forEach(el => el.addEventListener('click', () => focusStructure(el.dataset.focus)));
$('adnexa-toggle').addEventListener('change', e => { state.adnexa = e.target.checked; });
document.querySelectorAll('.btn[data-lv]').forEach(b => b.addEventListener('click', () => setLayerView(b.dataset.lv, b)));
$('iris-opts').addEventListener('click', e => { const b = e.target.closest('[data-iris]'); if (b) setIris(b.dataset.iris, b); });
$('vasc-toggle').addEventListener('change', e => { state.vessels = e.target.checked; });
$('blink-toggle').addEventListener('change', e => { state.blinkEnabled = e.target.checked; blinkState.enabled = e.target.checked; if (e.target.checked) blinkState.nextBlinkAt = performance.now() + 1200; });
$('blink-btn').addEventListener('click', () => EyelidRig.blink(180));
document.querySelectorAll('.btn[data-vasc]').forEach(b => b.addEventListener('click', () => {
  const key = b.dataset.vasc === 'artery' ? 'arteries' : 'veins';
  state[key] = !state[key];
  b.classList.toggle('active', state[key]);
}));
$('cut-toggle').addEventListener('change', e => setCut(e.target.checked));
$('cmp-btn').addEventListener('click', () => setCompare(!state.compare));
$('brain-btn').addEventListener('click', openBrain);
$('brain-close').addEventListener('click', () => $('brain').classList.remove('on'));
$('brain').addEventListener('click', e => { if (e.target.id === 'brain') $('brain').classList.remove('on'); });
buildBrain();
$('quiz-btn').addEventListener('click', openQuiz);
$('report-btn').addEventListener('click', exportReport);
$('reset-btn').addEventListener('click', reset);
$('torch-toggle').addEventListener('change', e => { state.torch = e.target.checked; renderHUD(); });
$('torch-near').addEventListener('input', e => { state.torchNear = +e.target.value / 100; renderHUD(); });
$('cn3-toggle').addEventListener('change', e => { state.cn3 = e.target.checked; renderHUD(); });
$('fundus-btn').addEventListener('click', openFundus);
$('bs-open').addEventListener('click', openBlindSpot);
$('astig-open').addEventListener('click', openAstig);
$('binoc-open').addEventListener('click', openBinoc);
$('sacc-open').addEventListener('click', openSaccade);
$('pq-open').addEventListener('click', openPathQuiz);
$('pt-open').addEventListener('click', openPhoto);
$('rev-open').addEventListener('click', openReverse);
$('ai-open').addEventListener('click', openAfter);
$('vc-rf-dist').addEventListener('input', e => { rfDist = +e.target.value; drawRF(); });
window.addEventListener('resize', () => { if (document.getElementById('vc-mag')) { drawMagnification(); drawRF(); drawColumns(); } });
$('vf-open').addEventListener('click', openFields);
$('adapt-btn').addEventListener('click', () => { state.adapt = 0.04; renderAdapt(); drawViewPrev(); });
$('near-toggle').addEventListener('change', e => { state.near = e.target.checked; renderHUD(); });
$('ams-open').addEventListener('click', openAmsler);
window.addEventListener('resize', () => drawViewPrev());
$('fc-close').addEventListener('click', () => focusStructure(null));
$('fc-scn').addEventListener('click', () => $('fc-scn-box').classList.toggle('on'));
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if ($('brain').classList.contains('on')) { $('brain').classList.remove('on'); return; }
  if ($('modal').classList.contains('on')) $('modal').classList.remove('on');
  else focusStructure(null);
});
$('modal').addEventListener('click', e => { if (e.target.id === 'modal') $('modal').classList.remove('on'); });
cbTar.fromArray(CB_MATRICES.normal);
cbCur.copy(cbTar);
$('dose').value = 100;
$('lux').value = Math.round(sliderFromLux(LUX_DEF));
setDose(1);
setLux(LUX_DEF);
$('rod').value = 120; $('cone').value = 6; setPhoto();   // setDose/setLux/setPhoto уже отрисовывают HUD и текст
setCut(false);

// ==== АНИМАЦИЯ ====
const view = {rotY:-0.15, rotX:0.05, zoom:6, zoomTo:6};
let dragging = false, px = 0, py = 0, downX = 0, downY = 0, sway = 1, idleUntil = 0;
let spinY = 0, spinX = 0, spinUntil = 0, lastT = 0;
// скорости затухания damp(): доля пути, остающаяся через секунду
const ZOOM_DAMP = 0.004, CAM_DAMP = 0.0015, SPIN_DAMP = 0.067;

renderer.domElement.addEventListener('pointerdown', e => {
  dragging = true; px = e.clientX; py = e.clientY; downX = e.clientX; downY = e.clientY; idleUntil = 0;
  try { renderer.domElement.setPointerCapture(e.pointerId); } catch(_) {}
  updateCursor();
});
window.addEventListener('pointermove', e => {
  if (!dragging) return;
  const dy = (e.clientX - px) * 0.008, dx = (e.clientY - py) * 0.006;
  view.rotY += dy;
  view.rotX = Math.max(-0.9, Math.min(0.9, view.rotX + dx));
  px = e.clientX; py = e.clientY;
  spinY = Math.max(-0.09, Math.min(0.09, dy));
  spinX = Math.max(-0.07, Math.min(0.07, dx));
});
function release(){
  if (!dragging) return;
  dragging = false; idleUntil = performance.now() + 2000;
  spinUntil = performance.now() + 1500;   // инерция: плавное торможение около 1–1,5 с
  spinY *= 0.12; spinX *= 0.12;          // чтобы выбег не уносил глаз слишком далеко
  updateCursor();
}
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
renderer.domElement.addEventListener('pointerleave', release);
let hoverTick = 0;
renderer.domElement.addEventListener('pointermove', e => {
  if (dragging) return;
  const now = performance.now();
  if (now - hoverTick < 50) return;
  hoverTick = now;
  setHover(pickAt(e), e);
});
renderer.domElement.addEventListener('pointerleave', () => setHover(null));
renderer.domElement.addEventListener('pointerup', e => {
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
  const id = pickAt(e);
  if (id && id === focus.id){ focusStructure(null); return; }   // повторный клик — сброс
  focusStructure(id);
  if (id === 'discus-nervi-optici') openBlindSpot();
});
renderer.domElement.addEventListener('wheel', e => {
  e.preventDefault();
  view.zoomTo = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, view.zoomTo + e.deltaY * 0.002));
}, {passive:false});

function onResize(){
  w = wrap.clientWidth; h = wrap.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  if (rt) rt.setSize(w, h);
  if (rtHalf) rtHalf.setSize(Math.max(1, Math.floor(w / 2)), h);
}
window.addEventListener('resize', onResize);

let luxCur = LUX_DEF, layerMix = 0, retinaMix = 0, adaptTick = 0;
const sim = {gain:1, sat:1, blur:0};
function applyState(v){
  const t = performance.now() * 0.001;
  // радиус только запоминается: реально зрачок едет за ним с задержкой ~200 мс (ЧАСТЬ 8, п.4)
  pupilTargetR = radiusForMm(pupilMmFromF((v.pupil - PUPIL0) / PUPILK, luxCur));
  scleraU.uRedness.value = v.redness;
  scleraU.uYellow.value = v.yellow;
  scleraU.uDryness.value = v.dryness;
  irisU.uDilate.value = v.dilate;
  EyelidRig.ptosis = v.ptosis;
  lensGroup.position.x = Math.sin(t * 14) * 0.025 * v.nystagmus;
  lensGroup.position.y = Math.cos(t * 11) * 0.01 * v.nystagmus;
}

function setCut(on){
  cutOn = on;
  state.cutEnabled = !!on;
  const d = cutU.uCutD.value;   // величину среза плавно ведёт extrasTick (ЧАСТЬ 8, п.17)
  cutU.uCutN.value.set(1, 0, 0);
  cutPlane.constant = on ? 0 : 99;
  cutPlane.normal.copy(cutN0).applyQuaternion(eyeGroup.quaternion);
  // разрез: при включённом срезе склера и роговица рендерятся только лицевыми гранями,
  // иначе при взгляде изнутри видна их внутренняя «подкладка» из убранной половины
  // трабекулярная сеть и шлеммов канал — только в разрезе: снаружи они не видны,
  // а через отверстие лимба торчали бы синей полоской поперёк роговицы
  trabMesh.visible = schlemmMesh.visible = on;
  const cutSide = on ? THREE.FrontSide : THREE.DoubleSide;
  scleraMat.side = cutSide; scleraMat.needsUpdate = true;
  corneaMesh.material.side = cutSide; corneaMesh.material.needsUpdate = true;
  // материалы сосудов клонированы — у них собственные uniform'ы, синхронизируем все
  scene.traverse(o => {
    const u = o.material && o.material.uniforms;
    if (!u) return;
    if (u.uCutD) u.uCutD.value = d;
    if (u.uCutN) u.uCutN.value.set(1, 0, 0);
  });
  $('cut-toggle').checked = on;
}

function animate(){
  requestAnimationFrame(animate);
  const t = performance.now() * 0.001;
  const dt = Math.min(0.06, Math.max(0.001, t - lastT));
  lastT = t;
  updateBlink(performance.now());
  // слёзная плёнка: блик на роговице тускнеет между морганиями, моргание его «обновляет»
  tearT = Math.max(0.22, tearT - dt / 9);
  hlMat.opacity = 0.34 + 0.56 * tearT;
  const hs = 0.9 + 0.14 * tearT;
  hl1.scale.setScalar(hs);
  // тёмная адаптация идёт во времени
  if (state.adapt < 1){
    state.adapt = Math.min(1, state.adapt + dt / 25);
    adaptTick++;
    if (adaptTick % 5 === 0 || state.adapt >= 1){ renderAdapt(); drawViewPrev(); }
  }
  luxCur = lerp(luxCur, torchLux(), 0.12);
  // фонарик: подносим источник света к глазу
  const tn = state.torch ? state.torchNear : 0;
  torchGroup.visible = state.torch;
  if (state.torch){
    torchGroup.position.set(-1.9 + 0.7 * tn, -0.75 + 0.25 * tn, 3.1 - 1.05 * tn);
    torchGroup.lookAt(camCenter.x * 0.4, camCenter.y * 0.4, 0);
  }
  torchLight.intensity = state.torch ? 3.2 + 9 * tn : 0;
  for (const k in current) current[k] = lerp(current[k], target[k], 0.07);
  const ce = cbCur.elements, te = cbTar.elements;
  for (let i = 0; i < 9; i++) ce[i] = lerp(ce[i], te[i], 0.08);

  applyState(current);
  EyelidRig.update();

  const vs = visionSim();
  sim.gain = lerp(sim.gain, vs.gain, 0.08);
  sim.sat = lerp(sim.sat, vs.sat, 0.08);
  sim.blur = lerp(sim.blur, vs.blur, 0.08);
  if (postMat){
    postMat.uniforms.uGain.value = sim.gain;
    postMat.uniforms.uSat.value = sim.sat;
    postMat.uniforms.uBlur.value = sim.blur;
  }
  extrasTick(t, dt);

  layerMix = lerp(layerMix, focus.id === 'cornea' ? 1 : 0, 0.11);
  for (let i = 0; i < corneaLayers.length; i++)
  {
    const L = corneaLayers[i];
    L.visible = layerMix > 0.02;
    L.material.opacity = 0.6 * layerMix * (1 - i * 0.05);
    L.position.z = 1.12 + (4 - i) * 0.15 * layerMix;
  }

  const retOn = state.layerView === 'layers' && (focus.id === 'retina' || cutOn);
  retinaMix = lerp(retinaMix, retOn ? 1 : 0, 0.12);
  retinaLayers.forEach((L, i) =>
  {
    L.visible = retinaMix > 0.02;
    L.material.opacity = 0.9 * retinaMix;
    L.scale.setScalar(Math.max(0.5, (L.userData.r + (1.455 - i * 0.042 - L.userData.r) * retinaMix)) / L.userData.r);
  });
  if (retinaItem) retinaItem.base = 1 - 0.97 * retinaMix;
  irisU.uBaseColor.value.lerp(irisTar, 0.08);

  if (focus.id){
    // Изоляция: остаётся только выбранная структура, остальное не рисуется вовсе.
    // Через opacity этого не сделать: wireframe-сетка и InstancedMesh при 0.04 дают
    // «белые призраки», а шейдерные материалы живут в uAlpha — поэтомуvisible = false.
    const fid = focus.id;
    for (const o of fadeItems)
    {
      if (o.m.userData.id === fid)
      {
        o.a = 1;
        o.m.visible = true;
        o.mat.transparent = o.base < 1;
        o.mat.opacity = o.base;
        if (o.sh && o.mat.uniforms && o.mat.uniforms.uAlpha) o.mat.uniforms.uAlpha.value = 1;
        o.mat.depthWrite = o.dw;
        o.mat.depthTest = true;
        o.m.renderOrder = 0;
      }
      else
      {
        o.a = 0;
        o.m.visible = false;
        o.mat.opacity = 0;
        if (o.sh && o.mat.uniforms && o.mat.uniforms.uAlpha) o.mat.uniforms.uAlpha.value = 0;
        o.mat.depthWrite = false;
        o.mat.transparent = true;
        o.m.renderOrder = 0;
      }
    }
    // вспомогательные слои: только те, что принадлежат выбранной структуре
    corneaLayers.forEach(L => { L.visible = fid === 'cornea'; });
    retinaLayers.forEach(L => { L.visible = fid === 'retina' && retOn; });
    retSlices.forEach(S => { S.visible = fid === 'retina' && retOn; });
    flowMesh.visible = fid === 'humor-aquosus' || fid === 'corpus-ciliare';
    tearMesh.visible = false;
    hl1.visible = hl2.visible = hl3.visible = (fid === 'cornea' || fid === 'lens');
    upperLid.lashMesh.visible = lowerLid.lashMesh.visible = false;
    procMesh.visible = fid === 'corpus-ciliare';
    ciliaryMuscleMesh.visible = fid === 'corpus-ciliare';
    lensFiberMesh.visible = fid === 'lens';
    trabMesh.visible = schlemmMesh.visible = false;
    orbitMesh.visible = false;
    torchGroup.visible = state.torch;
    if (retinaItem) retinaItem.base = fid === 'retina' ? 1 : 0;
  } else {
    // общий вид: мягкое затухание только при наведении и по тестам
    for (const o of fadeItems){
      const id = o.m.userData.id;
      const hot = id && id === focus.hover;
      let ft = 1;
      if (focus.hover) ft = hot ? 1 : 0.5;
      if (o.grp === 'lid' && state.adnexa) ft *= 0.03;
      if (o.kind)
      {
        const on = state.vessels && (o.kind === 'artery' ? state.arteries : o.kind === 'vein' ? state.veins : true);
        if (!on) ft = 0;
      }
      o.a = lerp(o.a, ft, 0.13);
      const kx = state.vessels && XRAY.has(id) ? 0.16 : 1;
      const tr = hot || o.a < 0.995 || o.base < 1 || kx < 1;
      if (o.mat.transparent !== tr) o.mat.transparent = tr;
      if (o.sh && o.mat.uniforms && o.mat.uniforms.uAlpha) o.mat.uniforms.uAlpha.value = o.a * kx;
      else o.mat.opacity = o.base * o.a * kx;
      o.mat.depthWrite = (o.a > 0.95 && kx > 0.95) ? o.dw : false;
      if (o.mat.depthTest === hot) o.mat.depthTest = !hot;
      o.m.renderOrder = hot ? 20 : 0;
      o.m.visible = o.a > 0.04;
    }
    orbitMesh.visible = true;
    upperLid.lashMesh.visible = lowerLid.lashMesh.visible = true;
    lensFiberMesh.visible = true;
    ciliaryMuscleMesh.visible = true;
    if (retinaItem) retinaItem.base = 1 - 0.97 * retinaMix;
  }
  if (focus.id){ const fm = meshById(focus.id); if (fm) centerOf(fm, camTo); }
  else camTo.set(0, 0, 0);
  camCenter.x = damp(camCenter.x, camTo.x, CAM_DAMP, dt);
  camCenter.y = damp(camCenter.y, camTo.y, CAM_DAMP, dt);
  camCenter.z = damp(camCenter.z, camTo.z, CAM_DAMP, dt);
  view.zoom = damp(view.zoom, view.zoomTo, ZOOM_DAMP, dt);
  if (!dragging && performance.now() < spinUntil && Math.abs(spinY) + Math.abs(spinX) > 1e-4)
  {
    view.rotY += spinY * 60 * dt;
    view.rotX = Math.max(-0.9, Math.min(0.9, view.rotX + spinX * 60 * dt));
    spinY = damp(spinY, 0, SPIN_DAMP, dt);
    spinX = damp(spinX, 0, SPIN_DAMP, dt);
  }
  camera.position.set(camCenter.x, camCenter.y, camCenter.z + Math.max(2.1, view.zoom));   // камера не залетает внутрь глаза
  camera.lookAt(camCenter);
  const swayTo = dragging || performance.now() < idleUntil ? 0 : 1;
  sway = lerp(sway, swayTo, 0.05);
  eyeGroup.rotation.x = view.rotX + Math.cos(t * 0.4) * 0.012 * sway;
  eyeGroup.rotation.y = view.rotY + Math.sin(t * 0.6) * 0.02 * sway;
  // плоскость среза жёстко связана с глазом: world-нормаль для клиппинга = local-нормаль в шейдерах
  cutPlane.normal.copy(cutN0).applyQuaternion(eyeGroup.quaternion);
  renderFrame();
}

// -- Живая динамика: аккомодация, пульс, потоки, микросаккады (не секция) --
let pupilTargetR = 0.1, pupilNowR = null, accNow = 0, tearGlow = 0;
let microImp = 0, microImpY = 0, microNext = 0, cuppingNow = 0, cutTween = 1, dofNow = 0, prevPhase = 'idle';

// 8.3 поток водянистой влаги: 100 частиц от отростков через зрачок в угол камеры
const flowN = 100;
const flowMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.011, 8, 6),
  new THREE.MeshBasicMaterial({color:0xa8dcff, transparent:true, opacity:.5, depthWrite:false}), flowN);
flowMesh.frustumCulled = false;
eyeGroup.add(flowMesh);
const flowDum = new THREE.Object3D();
const flowP = [];
for (let i = 0; i < flowN; i++)
  flowP.push({u: Math.random(), a: (i % 12) / 12 * Math.PI * 2 + (i % 5) * 0.06, sp: 0.22 + ((i * 7) % 11) / 11 * 0.12});

// 8.5 слёзная плёнка — появляется после моргания и испаряется
const tearGeo = new THREE.SphereGeometry(1, 64, 40, 0, Math.PI * 2, 0, Math.PI / 2);
tearGeo.rotateX(Math.PI / 2);
tearGeo.scale(0.766, 0.766, 0.362);
const tearMesh = new THREE.Mesh(tearGeo,
  new THREE.MeshBasicMaterial({color:0xdff2ff, transparent:true, opacity:0, side:THREE.DoubleSide, depthWrite:false}));
tearMesh.position.z = 1.15;
lensGroup.add(tearMesh);

// 8.8 третье изображение Пуркинье — от передней поверхности хрусталика
const hl3 = new THREE.Mesh(new THREE.CircleGeometry(0.13, 32),
  new THREE.MeshBasicMaterial({color:0xfff3cf, transparent:true, opacity:.16, side:THREE.DoubleSide, depthWrite:false}));
hl3.position.set(0.05, -0.05, 1.305);
lensGroup.add(hl3);

// 8.13 глаз светится изнутри
const innerLight = new THREE.SpotLight(0xffe7b8, 0.10, 3, 0.22, 0.8, 1.4);
innerLight.position.set(0, 0, 1.35);
innerLight.target.position.set(0, 0, 2.4);
scene.add(innerLight, innerLight.target);

// 8.19 срезы слоёв сетчатки — плоские диски в плоскости разреза
const retSlices = [];
for (let i = 0; i < 8; i++)
{
  const m = new THREE.Mesh(new THREE.CircleGeometry(1.442 - i * 0.004, 48),
    new THREE.MeshBasicMaterial({color:RETINA_LAYERS[i].c, transparent:true, opacity:0, side:THREE.DoubleSide, depthWrite:false}));
  m.rotation.y = Math.PI / 2;
  m.visible = false;
  eyeGroup.add(m);
  retSlices.push(m);
}

// 8.20 счётчик кадров по клавише F
const fpsEl = document.createElement('div');
fpsEl.style.cssText = 'position:fixed;right:12px;top:10px;z-index:80;font:12px/1.4 ui-monospace,Menlo,monospace;color:#9ff;' +
  'background:rgba(4,10,16,.62);padding:3px 8px;border-radius:6px;display:none;pointer-events:none';
document.body.appendChild(fpsEl);
addEventListener('keydown', e => {
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А')
    fpsEl.style.display = fpsEl.style.display === 'none' ? 'block' : 'none';
});
let fpsAcc = 0, fpsN = 0;

function extrasTick(t, dt){
  // 8.1 аккомодация: 400 мс с мягким easing
  accNow += ((state.near ? 1 : 0) - accNow) * Math.min(1, dt * 5);
  const a = accNow * accNow * (3 - 2 * accNow);
  lensMesh.scale.set(1 + 0.05 * a, 1 + 0.05 * a, 1 + 0.15 * a);
  capsuleMesh.scale.set(1 + 0.05 * a, 1 + 0.05 * a, 1 + 0.15 * a);
  frontCapsule.position.z = 1.29 + 0.04 * a;
  lensFiberMesh.scale.z = 1 + 0.12 * a;
  ciliaryMuscleMesh.scale.setScalar(1 - 0.05 * a);
  ciliaryMesh.scale.setScalar(1 - 0.02 * a);
  zonuleMesh.scale.set(1 + 0.03 * a, 1 + 0.03 * a, 1 - 0.06 * a);

  // 8.2 пульс артерий в такт ЧСС
  const hr = (vitalsFor(state.cat) || {}).hr || 72;
  const pulse = 1 + 0.2 * Math.sin(t * Math.PI * 2 * hr / 60);
  for (let i = 0; i < fadeItems.length; i++)
  {
    const o = fadeItems[i];
    if (o.kind === 'artery' && o.mat.emissive) o.mat.emissiveIntensity = 0.5 * pulse;
  }

  // 8.4 зрачок догоняет цель за ~200 мс и сужается при взгляде вблизи
  if (pupilNowR === null) pupilNowR = pupilTargetR;
  pupilNowR += (pupilTargetR - pupilNowR) * Math.min(1, dt * 5.5);
  const pr = pupilNowR * (1 - 0.30 * a);
  pupilMesh.scale.set(pr, pr, 1);
  sphincterMesh.scale.set(pr, pr, 1);

  // 8.3 поток влаги
  for (let i = 0; i < flowN; i++)
  {
    const P = flowP[i];
    P.u += dt * P.sp;
    if (P.u > 1){ P.u -= 1; P.a = (i % 12) / 12 * Math.PI * 2 + Math.random() * 0.4; }
    const u = P.u, a0 = P.a, m = 1 - u;
    const x0 = Math.cos(a0) * 0.575, y0 = Math.sin(a0) * 0.575, z0 = 1.31;
    const x1 = Math.cos(a0 + 0.9) * 0.22, y1 = Math.sin(a0 + 0.9) * 0.22, z1 = 1.37;
    const x2 = Math.cos(a0 + 1.7) * 0.60, y2 = Math.sin(a0 + 1.7) * 0.60, z2 = 1.19;
    flowDum.position.set(m * m * x0 + 2 * m * u * x1 + u * u * x2,
                         m * m * y0 + 2 * m * u * y1 + u * u * y2,
                         m * m * z0 + 2 * m * u * z1 + u * u * z2);
    flowDum.scale.setScalar(1 - 0.5 * u);
    flowDum.updateMatrix();
    flowMesh.setMatrixAt(i, flowDum.matrix);
  }
  flowMesh.instanceMatrix.needsUpdate = true;
  flowMesh.visible = cutOn || focus.id === 'humor-aquosus' || focus.id === 'corpus-ciliare' || state.near;

  // 8.5 слёзная плёнка: обновляется при раскрытии века и испаряется за ~1 с
  if (EyelidRig.phase !== prevPhase){
    if (EyelidRig.phase === 'opening' || EyelidRig.phase === 'idle') tearGlow = 1;
    prevPhase = EyelidRig.phase;
  }
  tearGlow = Math.max(0, tearGlow - dt / 1.1);
  tearMesh.material.opacity = 0.16 * tearGlow;
  tearMesh.visible = tearGlow > 0.01;

  // 8.9 микросаккады — мелкие толчки каждые 1.5–3 с
  if (t > microNext)
  {
    microNext = t + 1.5 + Math.random() * 1.5;
    microImp = (Math.random() - 0.5) * 0.02;
    microImpY = (Math.random() - 0.5) * 0.014;
  }
  microImp *= Math.pow(0.015, dt);
  microImpY *= Math.pow(0.015, dt);
  if (Math.abs(microImp) + Math.abs(microImpY) > 1e-5)
  {
    eyeGroup.rotation.x += microImp;
    eyeGroup.rotation.y += microImpY;
  }

  // 8.10 глубина резкости при фокусе на структуре
  dofNow += ((focus.id ? 1 : 0) - dofNow) * Math.min(1, dt * 3.5);
  if (postMat) postMat.uniforms.uAperture.value = dofNow * 0.012;

  // 8.15 купол диска при глаукоме/застойном диске
  cuppingNow += ((state.fundus === 'hyper' ? 1 : 0) - cuppingNow) * Math.min(1, dt * 1.2);
  cupMesh.position.z = 0.021 - 0.05 * cuppingNow;
  cupMesh.scale.set(1 - 0.4 * cuppingNow, 1 - 0.4 * cuppingNow, 1 - 0.5 * cuppingNow);

  // 8.17 разрез рассекает плавно, а не рывком
  cutTween += ((cutOn ? 0 : 1) - cutTween) * Math.min(1, dt * 9);
  if (cutOn && cutTween < 0.01) cutTween = 0;
  if (!cutOn && cutTween > 0.99) cutTween = 1;
  const cd = -99 * cutTween;
  if (Math.abs(cd - cutU.uCutD.value) > 0.3)
  {
    cutU.uCutD.value = cd;
    for (let i = 0; i < fadeItems.length; i++)
    {
      const u = fadeItems[i].mat.uniforms;
      if (u && u.uCutD) u.uCutD.value = cd;
    }
    [rpeMesh, bruchMesh].forEach(m => { if (m.material.uniforms.uCutD) m.material.uniforms.uCutD.value = cd; });
  }

  // 8.18 радужка реагирует на свет: складки сужаются, колларетта бледнеет
  irisU.uLight.value = Math.max(0, Math.min(1, (Math.log10(Math.max(1, luxCur)) - 1.1) / 1.9));

  // 8.19 слои сетчатки раздвигаются вдоль оси и получают видимый срез
  for (let i = 0; i < retSlices.length; i++)
  {
    retSlices[i].visible = retinaMix > 0.02;
    retSlices[i].material.opacity = 0.5 * retinaMix * (1 - i * 0.06);
    retSlices[i].position.z = -0.03 * i * retinaMix;
    retinaLayers[i].position.z = -0.035 * i * retinaMix;
  }

  // 8.20 счётчик кадров
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5)
  {
    fpsEl.textContent = Math.round(fpsN / fpsAcc) + ' FPS';
    fpsAcc = 0; fpsN = 0;
  }
}

Object.assign(window, {blinkState, updateBlink, scene, camera, renderer, cutPlane, setCut, eyeGroup, lensGroup, pupilMesh, EyelidRig, eyelidRig:EyelidRig, upperLid, lowerLid, corneaLayers, retinaLayers, choroideaMesh, procMesh, irisU, setIris, setLayerView, openBlindSpot, openFundus, drawFundus, openAmsler, drawAmsler, openAstig, drawAstig, openFields, drawFields, openSaccade, sacPlay, drawSaccade, openPathQuiz, pqRender, pqCheck, openPhoto, drawPhoto, ptApply, openReverse, revRender, drawColumns, openBinoc, drawBinoc, openAfter, drawAfter, startAfter, aiState: () => ({phase: aiPhase, left: aiLeft, fade: aiFade}), startVcLab, drawRF, drawMagnification, vcCard, drawViewPrev, applyAge, applyHaze, renderAdapt, purkinjeFx, lensHazeMesh, hlMat, reportCanvas, clickableMeshes, ANATOMY, EFFECTS, state, current, target, setCompare, perrlaFor, vitalsFor, pupilMm, focus, focusStructure, fadeItems, camCenter});
initPost();
animate();

  // Экспорт для тестов и внешних вызовов
  window.initPost = initPost;
  window.animate = animate;
})();
