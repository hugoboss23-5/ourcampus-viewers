// 2026-10-04. Private, real-model Garden Performance Hall review.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const ROLE = Object.freeze({ CHAIR: 1, SHELL: 2, DOOR: 4 });
export const DEFAULT_VIEWS = Object.freeze({
  audience: { p: [22.86, 29, 1.68], t: [22.86, 61, 3.3] },
  foyer: { p: [37, 18, 1.7], t: [14, 6, 2.8] },
  garden: { p: [39, -30, 1.75], t: [21, -6, 3.0] },
  section: { p: [75, -40, 65], t: [25, 43, 0] },
});
export function nativePoint(v) { return new THREE.Vector3(v[0], v[2], -v[1]); }
export function rolesOf(object, root) {
  let role = 0;
  for (let o = object; o; o = o.parent) {
    const name = o.name.toLowerCase().replaceAll('_', ' ');
    if (o.userData.movable_chair === true || /^gph chair\b/.test(name)) role |= ROLE.CHAIR;
    if (/^roof[ -]?events/.test(name) || (/^gph\b/.test(name) && name.includes('ceiling'))) role |= ROLE.SHELL;
    if (o.userData.mode_door === true) role |= ROLE.DOOR;
    if (o === root) break;
  }
  return role;
}
function visibleThroughParents(object, root) {
  for (let o = object; o; o = o.parent) {
    if (!o.visible) return false;
    if (o === root) break;
  }
  return true;
}
function triangleCount(root) {
  let count = 0;
  root.traverse(o => {
    if (!o.isMesh) return;
    const size = o.geometry.index?.count ?? o.geometry.attributes.position?.count ?? 0;
    const draw = Math.max(0, Math.min(size - o.geometry.drawRange.start, o.geometry.drawRange.count));
    count += draw / 3 * (o.isInstancedMesh ? o.count : 1);
  });
  return count;
}

// No welding, simplification, texture changes or material replacement. Unsupported
// geometry remains intact. Transforms are baked only into owned geometry clones.
export function mergeStaticMeshes(root, { animated = false } = {}) {
  root.updateWorldMatrix(true, true);
  const beforeTriangles = triangleCount(root);
  const inverseRoot = root.matrixWorld.clone().invert();
  const groups = new Map();
  let beforeMeshes = 0;
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    beforeMeshes++;
    const geometry = mesh.geometry;
    const material = mesh.material;
    mesh.userData.reviewRole = rolesOf(mesh, root);
    mesh.userData.reviewBaseVisible = mesh.visible;
    if (animated || mesh.isSkinnedMesh || mesh.isInstancedMesh || mesh.children.length ||
        Array.isArray(material) || material.transparent || material.transmission > 0 ||
        Object.keys(geometry.morphAttributes).length || !geometry.attributes.position ||
        !visibleThroughParents(mesh, root) || geometry.drawRange.start !== 0 ||
        mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender ||
        mesh.onAfterRender !== THREE.Object3D.prototype.onAfterRender ||
        mesh.customDepthMaterial || mesh.customDistanceMaterial) return;
    const count = geometry.index?.count ?? geometry.attributes.position.count;
    if (geometry.drawRange.count < count || count % 3 ||
        geometry.groups.some(g => g.start !== 0 || g.count !== count || g.materialIndex !== 0)) return;
    const local = new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld);
    // Mirrored transforms need their original winding and culling semantics.
    if (local.determinant() <= 0) return;
    const signature = Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b))
      .map(([name, a]) => `${name}:${a.itemSize}:${a.normalized}:${a.array?.constructor.name}:${a.gpuType}`).join('|');
    const key = [material.uuid, mesh.userData.reviewRole, mesh.castShadow, mesh.receiveShadow,
      mesh.renderOrder, mesh.layers.mask, !!geometry.index, signature].join(';');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ mesh, local });
  });
  let mergedBatches = 0, replacedMeshes = 0;
  const warnings = [];
  for (const entries of groups.values()) {
    if (entries.length < 2) continue;
    let clones = [], merged;
    try {
      clones = entries.map(({ mesh, local }) => mesh.geometry.clone().applyMatrix4(local));
      merged = mergeGeometries(clones, false);
      if (!merged) { warnings.push('Incompatible attributes retained as individual meshes.'); continue; }
      const sourceCount = entries.reduce((sum, e) => sum + (e.mesh.geometry.index?.count ?? e.mesh.geometry.attributes.position.count), 0);
      if ((merged.index?.count ?? merged.attributes.position.count) !== sourceCount) throw new Error('Merge changed triangle inventory.');
      const first = entries[0].mesh;
      const batch = new THREE.Mesh(merged, first.material);
      batch.name = `Review batch · ${first.material.name || first.material.type} · ${first.userData.reviewRole}`;
      batch.castShadow = first.castShadow;
      batch.receiveShadow = first.receiveShadow;
      batch.renderOrder = first.renderOrder;
      batch.layers.mask = first.layers.mask;
      batch.userData = { reviewRole: first.userData.reviewRole, reviewBaseVisible: true,
        sourceNames: entries.map(e => e.mesh.name), sourceMeshCount: entries.length };
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      root.add(batch);
      for (const { mesh } of entries) mesh.removeFromParent();
      mergedBatches++;
      replacedMeshes += entries.length;
    } catch (error) {
      merged?.dispose();
      warnings.push(error.message);
    } finally { for (const clone of clones) clone.dispose(); }
  }
  let afterMeshes = 0;
  root.traverse(o => { if (o.isMesh) afterMeshes++; });
  const afterTriangles = triangleCount(root);
  if (afterTriangles !== beforeTriangles) throw new Error('Triangle inventory changed during batching.');
  return { beforeMeshes, afterMeshes, beforeTriangles, afterTriangles, mergedBatches, replacedMeshes, warnings };
}

export function setModelVisibility(root, { view, chairs, doorsOpen }) {
  root.traverse(o => {
    if (!o.isMesh) return;
    const role = o.userData.reviewRole ?? rolesOf(o, root);
    const base = o.userData.reviewBaseVisible ?? true;
    o.visible = base && !(role & ROLE.CHAIR && !chairs) &&
      !(role & ROLE.SHELL && (view === 'section' || view === 'plan')) &&
      !(role & ROLE.DOOR && doorsOpen);
  });
}

async function boot() {
  const $ = id => document.getElementById(id);
  const viewport = $('viewport');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  viewport.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Three-dimensional hall model; drag to orbit, scroll to zoom');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e6e1d7');
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  room.dispose(); pmrem.dispose();
  const hemi = new THREE.HemisphereLight(0xe8eff5, 0x93816b, 1.6);
  const sun = new THREE.DirectionalLight(0xffe7c5, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = .025;
  sun.shadow.bias = -.00008;
  scene.add(hemi, sun, sun.target);
  const perspective = new THREE.PerspectiveCamera(52, 1, .05, 1000);
  const plan = new THREE.OrthographicCamera(-60, 60, 60, -60, .1, 1000);
  plan.up.set(0, 0, -1);
  let camera = perspective;
  let controls = makeControls(camera);
  function makeControls(activeCamera) {
    const orbit = new OrbitControls(activeCamera, renderer.domElement);
    orbit.enableDamping = true; orbit.dampingFactor = .12;
    orbit.minDistance = .35; orbit.maxDistance = 350;
    orbit.maxPolarAngle = Math.PI * .97;
    orbit.addEventListener('change', requestRender);
    orbit.addEventListener('start', () => { transition = null; requestRender(); });
    return orbit;
  }
  let model, receipt = null, bounds, frame = null, transition = null;
  let previousFrame = 0, intervals = [], lastHUD = 0;
  let draws = 0;
  const state = { view: 'audience', lighting: 'day', chairs: true, doorsOpen: false };
  const stageLights = [];
  const diagnostic = { loaded: false, state, merge: null, receipt: null, frameCount: 0, fps: null, render: null };
  window.__hallReview = diagnostic;
  const captions = { audience: 'From the audience, toward the stage', foyer: 'A garden foyer for arrival and intermission', garden: 'The garden approach and entrance', section: 'Roof and ceiling removed to reveal the room', plan: 'The hall from above, with roof and ceiling removed' };
  function requestRender() { if (frame === null) frame = requestAnimationFrame(render); }
  function invalidateShadows() { renderer.shadowMap.needsUpdate = true; requestRender(); }
  function render(now) {
    frame = null;
    if (transition) {
      const t = Math.min(1, (now - transition.start) / transition.duration);
      const eased = t * t * (3 - 2 * t);
      camera.position.lerpVectors(transition.from, transition.to, eased);
      controls.target.lerpVectors(transition.targetFrom, transition.targetTo, eased);
      if (t === 1) transition = null;
    }
    const changed = controls.update();
    renderer.render(scene, camera);
    draws++;
    if (previousFrame && now - previousFrame < 250) {
      intervals.push(now - previousFrame);
      if (intervals.length > 45) intervals.shift();
    } else intervals = [];
    previousFrame = now;
    if (now - lastHUD > 350 && intervals.length >= 8) {
      const fps = 1000 * intervals.length / intervals.reduce((sum, v) => sum + v, 0);
      diagnostic.fps = Number(fps.toFixed(1));
      $('performance').textContent = `${Math.round(fps)} fps · last movement`;
      lastHUD = now;
    }
    diagnostic.frameCount = draws;
    diagnostic.render = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    if (changed || transition) requestRender();
  }
  function resize() {
    const width = viewport.clientWidth, height = viewport.clientHeight;
    renderer.setSize(width, height, false);
    perspective.aspect = width / height;
    perspective.updateProjectionMatrix();
    if (bounds) {
      const size = bounds.getSize(new THREE.Vector3());
      const halfHeight = Math.max(size.z / 2, size.x / (2 * perspective.aspect)) * 1.10;
      plan.left = -halfHeight * perspective.aspect;
      plan.right = halfHeight * perspective.aspect;
      plan.top = halfHeight; plan.bottom = -halfHeight;
      plan.updateProjectionMatrix();
    }
    requestRender();
  }
  new ResizeObserver(resize).observe(viewport);
  resize();
  function applyLighting() {
    const evening = state.lighting === 'evening';
    scene.background.set(evening ? '#292f32' : '#e6e1d7');
    scene.environmentIntensity = evening ? .28 : .5;
    hemi.intensity = evening ? .72 : 1.6;
    sun.intensity = evening ? .10 : 2.2;
    sun.color.set(evening ? 0xa7bbd8 : 0xffe7c5);
    renderer.toneMappingExposure = evening ? 1.10 : 1.05;
    for (const light of stageLights) light.intensity = light.userData.reviewIntensity * (evening ? 1 : .65);
    document.querySelectorAll('[data-light]').forEach(b => b.setAttribute('aria-pressed', b.dataset.light === state.lighting));
    invalidateShadows();
  }
  function setView(name, immediate = false) {
    state.view = name;
    transition = null;
    const next = name === 'plan' ? plan : perspective;
    if (camera !== next) {
      controls.dispose(); camera = next; controls = makeControls(camera);
    }
    controls.enableRotate = name !== 'plan';
    let to, target;
    if (name === 'plan') {
      target = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      to = target.clone().add(new THREE.Vector3(0, Math.max(size.x, size.z) * 1.5 + size.y, 0));
      camera.up.set(0, 0, -1);
    } else {
      const candidate = ['foyer','garden'].includes(name) ? DEFAULT_VIEWS[name] : receipt?.views?.[name];
      const valid = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
      const view = valid(candidate?.p) && valid(candidate?.t) ? candidate : DEFAULT_VIEWS[name];
      to = nativePoint(view.p); target = nativePoint(view.t);
      camera.up.set(0, 1, 0);
      perspective.fov = name === 'foyer' ? 60 : name === 'section' ? 44 : 52;
      perspective.updateProjectionMatrix();
    }
    // Flush the previous orbit's damping before changing viewpoint.
    const damping = controls.enableDamping;
    controls.enableDamping = false; controls.update(); controls.enableDamping = damping;
    if (immediate || name === 'plan' || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      camera.position.copy(to); controls.target.copy(target); controls.update();
    } else {
      transition = { start: performance.now(), duration: 650, from: camera.position.clone(), to,
        targetFrom: controls.target.clone(), targetTo: target };
    }
    setModelVisibility(model, state);
    $('view-caption').textContent = captions[name];
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === name));
    invalidateShadows();
  }
  const receiptPromise = fetch(new URL('./assets/garden-hall-design-study-20261004/build-receipt.json', import.meta.url), { cache: 'no-store' })
    .then(response => response.ok ? response.json() : null).catch(() => null);
  const gltf = await new GLTFLoader().loadAsync(new URL('./assets/garden-hall-design-study-20261004/garden-hall.glb', import.meta.url).href, event => {
    if (event.total > 0) {
      $('load-progress').max = event.total; $('load-progress').value = event.loaded;
      $('loading-detail').textContent = `Loading the actual design model · ${Math.round(event.loaded / event.total * 100)}%`;
    } else if (event.loaded > 0) $('loading-detail').textContent = `Loading the actual design model · ${(event.loaded / 1048576).toFixed(1)} MB`;
  });
  receipt = await receiptPromise;
  diagnostic.receipt = receipt ? { date: receipt.date, status: receipt.status } : null;
  $('loading-detail').textContent = 'Preparing materials and views…';
  model = gltf.scene;
  model.name = 'Garden Performance Hall';
  model.traverse(o => {
    if (o.isMesh) {
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      o.castShadow = materials.every(m => !m.transparent && !(m.transmission > 0));
      o.receiveShadow = true;
    }
    if (o.isLight) {
      // Retain authored lights in the scene, with a bounded real-time selection.
      o.userData.reviewOriginalIntensity = o.intensity;
      const stage = o.isSpotLight && /stage[ _]wash/i.test(o.name) && stageLights.length < 3;
      o.visible = stage;
      o.castShadow = stage;
      if (stage) {
        o.userData.reviewIntensity = Math.min(o.intensity, 3500);
        o.shadow.mapSize.set(1024, 1024);
        o.shadow.normalBias = .012;
        o.shadow.bias = -.00005;
        o.shadow.camera.near = .1;
        o.shadow.camera.far = 80;
        stageLights.push(o);
      }
    }
  });
  diagnostic.merge = mergeStaticMeshes(model, { animated: gltf.animations.length > 0 });
  scene.add(model);
  bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const extent = bounds.getSize(new THREE.Vector3()).length();
  sun.position.copy(center).add(new THREE.Vector3(-65, 110, 45));
  sun.target.position.copy(center);
  const radius = extent * .55;
  Object.assign(sun.shadow.camera, { left: -radius, right: radius, top: radius, bottom: -radius, near: 1, far: extent + 300 });
  sun.shadow.camera.updateProjectionMatrix();
  diagnostic.lighting = { activeAuthoredSpots: stageLights.length, intensityCapCandela: 3500, mode: 'Architectural study lighting; not a photometric simulation' };
  diagnostic.model = { name: model.name, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
  resize(); applyLighting(); setView('audience', true);
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  document.querySelectorAll('[data-light]').forEach(button => button.addEventListener('click', () => { state.lighting = button.dataset.light; applyLighting(); }));
  $('chairs').addEventListener('click', () => {
    state.chairs = !state.chairs;
    $('chairs').textContent = state.chairs ? 'Chairs on' : 'Chairs off';
    $('chairs').setAttribute('aria-pressed', state.chairs);
    setModelVisibility(model, state); invalidateShadows();
  });
  $('doors').addEventListener('click', () => {
    state.doorsOpen = !state.doorsOpen;
    $('doors').textContent = state.doorsOpen ? 'Close doors' : 'Open doors';
    $('doors').setAttribute('aria-pressed', state.doorsOpen);
    setModelVisibility(model, state); invalidateShadows();
  });
  $('view-controls').disabled = false; $('scene-controls').disabled = false;
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  diagnostic.loaded = true;
  $('loading').hidden = true;
  $('performance').textContent = 'Ready · drag to explore';
  requestRender();
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); showError('The 3D view was interrupted. Reload to return to the hall.');
  });
}
function showError(message) {
  document.getElementById('loading').hidden = false;
  document.getElementById('loading').classList.add('error');
  document.getElementById('loading-title').textContent = 'The hall could not open';
  document.getElementById('loading-detail').textContent = message;
  document.getElementById('load-progress').hidden = true;
  document.getElementById('performance').textContent = 'Model unavailable';
  const retry = document.getElementById('retry');
  retry.hidden = false; retry.onclick = () => location.reload();
}
if (typeof document !== 'undefined') boot().catch(error => {
  console.error('Garden hall review failed:', error);
  showError('The model could not be loaded. Check the connection and try again.');
});
