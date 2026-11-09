/** 2026-10-04. PRIVATE CANDIDATE. Native tree geometry is never edited.
 * Call only on a privately owned scene, outside render(). No automatic install.
 * Sources: https://threejs.org/docs/pages/WebGLRenderTarget.html,
 * https://threejs.org/docs/pages/InstancedMesh.html,
 * https://threejs.org/docs/pages/ShaderMaterial.html; local Three r186 renderer.
 * Atlas: 8 camera azimuths x 3 elevations x 8 tree yaw orientations, linear HDR.
 * Approximation: snapped view/yaw, flat depth, no received/self shadows or local
 * lights on the cards. Ground/building shadows still require native casters.
 */
import * as THREE from './vendor/three.module.js';

const PARTS = ['branches', 'leaves', 'trunk'];
const AZIMUTHS = 8, YAWS = 8, ELEVATIONS = [0, 35, 70];
const TILE = 128, ROWS = YAWS * ELEVATIONS.length, THRESHOLD = 64;
const TAU = Math.PI * 2, UP = new THREE.Vector3(0, 1, 0);
const fail = message => { throw new Error('Tree impostors: ' + message); };
const close = (a, b, epsilon = 1e-5) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= epsilon);
const bin = (angle, n) => ((Math.round(angle / TAU * n) % n) + n) % n;
const visible = object => { for (let o = object; o; o = o.parent) if (!o.visible) return false; return true; };

// All three primitives come from one exported mesh, with the same instance root.
// Do not infer correspondence from material names or bounds alone: compare every
// complete world transform, in order, then reject missing/mismatched companions.
function inspectTrees(scene, meshes) {
  if (!meshes.length || new Set(meshes).size !== meshes.length) fail('empty/duplicate tree list');
  scene.updateMatrixWorld(true);
  const templates = new Map(), groups = new Map(), owners = [];
  const local = new THREE.Matrix4();
  for (const mesh of meshes) {
    const part = PARTS.find(p => mesh.material?.name?.includes('tree_small_02_' + p));
    const native = mesh.userData.nativeTreeGeometry;
    if (!mesh.isInstancedMesh || !part || !native?.attributes.position || mesh.count < 1 ||
        mesh.userData.kind !== 'specified_grove_tree_visual' || mesh.instanceColor || mesh.morphTexture ||
        native.morphAttributes?.position?.length || mesh.material.transparent || !mesh.material.isMeshStandardMaterial)
      fail('unsupported native tree primitive ' + mesh.name);
    let ancestor = mesh; while (ancestor && ancestor !== scene) ancestor = ancestor.parent;
    if (!ancestor) fail('tree is outside supplied scene');
    const prior = templates.get(part);
    if (prior && (prior.geometry !== native || prior.material !== mesh.material)) fail('multiple templates for ' + part);
    templates.set(part, {geometry: native, material: mesh.material});
    const matrices = [];
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, local);
      matrices.push(new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, local));
    }
    const key = matrices.map(m => m.elements.map(v => Math.round(v * 1e5)).join(',')).join(';');
    if (!groups.has(key)) groups.set(key, {parts: new Map(), matrices, far: false});
    const group = groups.get(key);
    if (group.parts.has(part) || group.matrices.some((m, i) => !close(m.elements, matrices[i].elements)))
      fail('ambiguous three-part tree correspondence');
    const owner = {mesh, count: mesh.count, geometry: mesh.geometry, world: mesh.matrixWorld.clone(),
      instanceMatrix: mesh.instanceMatrix, version: mesh.instanceMatrix.version, native, material: mesh.material};
    owners.push(owner); group.parts.set(part, owner);
  }
  if (templates.size !== 3 || [...groups.values()].some(g => g.parts.size !== 3)) fail('incomplete three-part tile');
  const bounds = new THREE.Box3();
  for (const t of templates.values()) {
    // Compute from actual positions on a private Box3, leaving source caches alone.
    bounds.union(new THREE.Box3().setFromBufferAttribute(t.geometry.attributes.position));
  }
  const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  if (Math.abs(size.y - 4.55700394) > .01 || Math.abs(bounds.min.y) > .01 || Math.abs(center.x) > .01 || Math.abs(center.z) > .01)
    fail('source tree coordinates differ from verified 4.557 m Y-up template');
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y])
    for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
  const tiles = [...groups.values()];
  for (const tile of tiles) tile.trees = tile.matrices.map(matrix => {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); matrix.decompose(p, q, s);
    const recomposed = new THREE.Matrix4().compose(p, q, s);
    if (s.x <= 0 || Math.abs(s.x - s.y) > 1e-5 || Math.abs(s.x - s.z) > 1e-5 ||
        UP.clone().applyQuaternion(q).distanceTo(UP) > 1e-5 || !close(recomposed.elements, matrix.elements))
      fail('tree transform is not an upright uniform scale');
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    return {center: center.clone().applyMatrix4(matrix), scale: s.x, yaw: bin(Math.atan2(forward.x, forward.z), YAWS),
      corners: corners.map(v => v.clone().applyMatrix4(matrix))};
  });
  return {templates, tiles, owners, center, diameter: size.length() * 1.06, treeCount: tiles.reduce((n, t) => n + t.trees.length, 0)};
}

function lightingState(scene, approximateLocalLighting = false) {
  const lights = [], values = [scene.environment?.uuid, scene.environment?.version, scene.environmentIntensity, ...scene.environmentRotation.toArray()];
  let supported = !scene.overrideMaterial, ignoredLocalLights = 0;
  scene.traverse(light => {
    if (!light.isLight || !visible(light) || light.intensity === 0) return;
    if (approximateLocalLighting && (light.isPointLight || light.isSpotLight)) { ignoredLocalLights++; return; }
    if (!(light.isDirectionalLight || light.isHemisphereLight || light.isAmbientLight)) supported = false;
    lights.push(light);
    values.push(light.uuid, light.type, light.intensity, ...light.color.toArray(), light.layers.mask);
    if (light.groundColor) values.push(...light.groundColor.toArray());
    if (light.isDirectionalLight) values.push(...light.getWorldPosition(new THREE.Vector3()).sub(light.target.getWorldPosition(new THREE.Vector3())).normalize().toArray());
    if (light.isHemisphereLight) values.push(...light.getWorldPosition(new THREE.Vector3()).normalize().toArray());
  });
  return {lights, supported, ignoredLocalLights, key: JSON.stringify(values)};
}

function bakeAtlas(renderer, scene, data, approximateLocalLighting = false) {
  const lighting = lightingState(scene, approximateLocalLighting);
  if (!lighting.supported) fail('bake requires daylight directional/hemisphere/ambient lights; local lights need full detail');
  if (renderer.xr?.isPresenting || renderer.clippingPlanes.length || renderer.localClippingEnabled) fail('XR/clipping bake unsupported');
  if (renderer.getRenderTarget()) fail('bake must run outside a composer/render-target pass');
  if (!renderer.extensions.has('EXT_color_buffer_float')) fail('linear HDR render target unsupported');
  const width = TILE * AZIMUTHS, height = TILE * ROWS;
  if (Math.max(width, height) > renderer.capabilities.maxTextureSize) fail('atlas exceeds GPU texture limit');
  const target = new THREE.WebGLRenderTarget(width, height, {type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: true, stencilBuffer: false});
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  target.texture.name = 'Private actual-tree linear HDR atlas';
  const bakeScene = new THREE.Scene(), subject = new THREE.Group(), materials = [], clonedLights = [];
  bakeScene.environment = scene.environment; bakeScene.environmentIntensity = scene.environmentIntensity;
  bakeScene.environmentRotation.copy(scene.environmentRotation); bakeScene.add(subject);
  for (const t of data.templates.values()) {
    const material = t.material.clone(); materials.push(material);
    const mesh = new THREE.Mesh(t.geometry, material); mesh.frustumCulled = false; subject.add(mesh);
  }
  for (const original of lighting.lights) {
    const light = original.clone(false); clonedLights.push(light); light.castShadow = false;
    light.position.copy(original.getWorldPosition(new THREE.Vector3()));
    if (light.isDirectionalLight) {
      light.target = new THREE.Object3D(); light.target.position.copy(original.target.getWorldPosition(new THREE.Vector3())); bakeScene.add(light.target);
    }
    bakeScene.add(light);
  }
  const half = data.diameter / 2, distance = data.diameter * 2;
  const bakeCamera = new THREE.OrthographicCamera(-half, half, half, -half, .01, distance * 3); bakeCamera.layers.enableAll();
  const saved = {target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(),
    viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()), scissorTest: renderer.getScissorTest(),
    clear: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), autoClear: renderer.autoClear,
    toneMapping: renderer.toneMapping, outputColorSpace: renderer.outputColorSpace,
    shadowEnabled: renderer.shadowMap.enabled, shadowNeedsUpdate: renderer.shadowMap.needsUpdate,
    xr: renderer.xr?.enabled, infoAutoReset: renderer.info.autoReset, infoRender: {...renderer.info.render}};
  let complete = false;
  try {
    // Bake scene-linear radiance. Composer OutputPass/direct renderer performs the
    // final tone mapping once when the card is drawn; no display-space double map.
    renderer.toneMapping = THREE.NoToneMapping; renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.shadowMap.enabled = false; if (renderer.xr) renderer.xr.enabled = false;
    renderer.info.autoReset = false; renderer.autoClear = false; renderer.setClearColor(0, 0);
    renderer.setRenderTarget(target); renderer.setScissorTest(false); renderer.clear(true, true, true);
    renderer.setScissorTest(true);
    for (let yaw = 0; yaw < YAWS; yaw++) {
      subject.rotation.y = yaw / YAWS * TAU;
      for (let elevation = 0; elevation < ELEVATIONS.length; elevation++) for (let az = 0; az < AZIMUTHS; az++) {
        const a = az / AZIMUTHS * TAU, e = THREE.MathUtils.degToRad(ELEVATIONS[elevation]);
        bakeCamera.position.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(distance).add(data.center);
        bakeCamera.lookAt(data.center); bakeCamera.updateMatrixWorld(true);
        const row = yaw * ELEVATIONS.length + elevation;
        // Render-target viewport coordinates are physical pixels, not CSS pixels.
        target.viewport.set(az * TILE, row * TILE, TILE, TILE); target.scissor.copy(target.viewport); target.scissorTest = true;
        renderer.setRenderTarget(target); renderer.clear(true, true, true); renderer.render(bakeScene, bakeCamera);
      }
    }
    complete = true;
    return {target, lightingKey: lighting.key, ignoredLocalLights: lighting.ignoredLocalLights};
  } finally {
    renderer.setRenderTarget(saved.target, saved.face, saved.mip);
    renderer.setViewport(saved.viewport); renderer.setScissor(saved.scissor); renderer.setScissorTest(saved.scissorTest);
    renderer.setClearColor(saved.clear, saved.alpha); renderer.autoClear = saved.autoClear;
    renderer.toneMapping = saved.toneMapping; renderer.outputColorSpace = saved.outputColorSpace;
    renderer.shadowMap.enabled = saved.shadowEnabled; renderer.shadowMap.needsUpdate = saved.shadowNeedsUpdate;
    if (renderer.xr) renderer.xr.enabled = saved.xr;
    renderer.info.autoReset = saved.infoAutoReset; Object.assign(renderer.info.render, saved.infoRender);
    // Only owned material/light copies and this owned target are ever disposed.
    materials.forEach(m => m.dispose()); clonedLights.forEach(l => l.shadow?.dispose());
    if (!complete) target.dispose();
  }
}

/** No render hooks are installed. Integration must wrap the existing shadow pass
 * with api.withNativeShadows(() => oldShadowRender(...args)); update before color.
 * setMode('adaptive'|'full'|'original'); original restores entry geometry/counts.
 * Lighting changes automatically fall back to native; call rebake() outside a
 * frame to refresh, then update(). dispose() must precede model asset disposal.
 * With preserveSelectedGeometry=true, caller runs its existing tree LOD selector
 * BEFORE every adaptive update. Non-card trees and fallback retain that geometry;
 * only native/distanceTreeGeometry references are accepted. Full mode is native.
 * approximateLocalLighting=true explicitly omits point/spot lighting ONLY from
 * distant tree pictures. Native trees/buildings retain all lights. Caller rebakes
 * after changing sun/sky/environment; moving local lights do not invalidate it.
 */
export async function createTreeImpostors({renderer, scene, camera, treeMeshes, requestRender = () => {}, preserveSelectedGeometry = false, approximateLocalLighting = false}) {
  if (!renderer?.isWebGLRenderer || !scene?.isScene || !camera?.isPerspectiveCamera || !Array.isArray(treeMeshes)) fail('renderer/scene/perspective camera/tree list required');
  if (typeof preserveSelectedGeometry !== 'boolean' || typeof approximateLocalLighting !== 'boolean') fail('detail/lighting options must be boolean');
  const data = inspectTrees(scene, treeMeshes);
  let atlas = bakeAtlas(renderer, scene, data, approximateLocalLighting), mode = 'original', disposed = false, shadowDepth = 0;
  const plane = new THREE.PlaneGeometry(1, 1), cells = new THREE.InstancedBufferAttribute(new Float32Array(data.treeCount * 2), 2);
  plane.setAttribute('atlasCell', cells);
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  // UniformsUtils clones textures; a GPU render-target texture must retain identity.
  uniforms.atlas = {value: atlas.target.texture};
  const material = new THREE.ShaderMaterial({uniforms, fog: true, toneMapped: true, transparent: false, depthWrite: true,
    vertexShader: `attribute vec2 atlasCell;
      varying vec2 atlasUV;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      #include <fog_pars_vertex>
      void main() {
        atlasUV = (atlasCell + mix(vec2(${.5 / TILE}), vec2(${1 - .5 / TILE}), uv)) / vec2(${AZIMUTHS}.0, ${ROWS}.0);
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D atlas;
      varying vec2 atlasUV;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      #include <fog_pars_fragment>
      void main() {
        vec4 sampleColor = texture2D(atlas, atlasUV);
        if (sampleColor.a < 0.5) discard;
        gl_FragColor = vec4(sampleColor.rgb, 1.0);
        #include <logdepthbuf_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`});
  const proxies = new THREE.InstancedMesh(plane, material, data.treeCount);
  proxies.name = 'PRIVATE distant-tree atlas cards'; proxies.count = 0; proxies.frustumCulled = false;
  proxies.castShadow = false; proxies.receiveShadow = false; proxies.raycast = () => {}; proxies.layers.enableAll();
  proxies.instanceMatrix.setUsage(THREE.DynamicDrawUsage); cells.setUsage(THREE.DynamicDrawUsage);
  scene.add(proxies);
  const stats = {mode, trees: data.treeCount, nativeTrees: data.treeCount, impostorTrees: 0, atlasViews: AZIMUTHS * ROWS,
    atlasSize: [TILE * AZIMUTHS, TILE * ROWS], thresholdPixels: THRESHOLD, fallback: null, localLightingApproximation: approximateLocalLighting, ignoredLocalLights: atlas.ignoredLocalLights};
  const position = new THREE.Vector3(), point = new THREE.Vector3(), direction = new THREE.Vector3();
  const card = new THREE.Matrix4(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), sceneInverse = new THREE.Matrix4();
  function restore(original = false, keepSelected = false) {
    for (const owner of data.owners) { owner.mesh.count = owner.count; if (!keepSelected) owner.mesh.geometry = original ? owner.geometry : owner.native; }
    proxies.count = 0; stats.nativeTrees = data.treeCount; stats.impostorTrees = 0;
  }
  function update() {
    if (disposed) fail('disposed');
    if (shadowDepth) fail('update during native shadow callback');
    stats.mode = mode; stats.fallback = null;
    if (mode !== 'adaptive') { restore(mode === 'original'); return {...stats}; }
    if (preserveSelectedGeometry && data.owners.some(owner => owner.mesh.geometry !== owner.native &&
        (!owner.mesh.userData.distanceTreeGeometry?.isBufferGeometry || owner.mesh.geometry !== owner.mesh.userData.distanceTreeGeometry))) {
      restore(false, true); fail('selected geometry must be the native or registered distance tree geometry');
    }
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const current = lightingState(scene, approximateLocalLighting);
    stats.ignoredLocalLights = current.ignoredLocalLights;
    if (!current.supported || current.key !== atlas.lightingKey) { restore(false, preserveSelectedGeometry); stats.fallback = 'Lighting changed: full detail until rebake'; return {...stats}; }
    for (const owner of data.owners) if (owner.mesh.material !== owner.material || owner.mesh.instanceMatrix !== owner.instanceMatrix ||
        owner.mesh.instanceMatrix.version !== owner.version || !close(owner.mesh.matrixWorld.elements, owner.world.elements)) {
      restore(false, preserveSelectedGeometry); stats.fallback = 'Tree transforms/materials changed: recreate candidate'; return {...stats};
    }
    camera.getWorldPosition(position); sceneInverse.copy(scene.matrixWorld).invert();
    let count = 0;
    const heightPixels = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    for (const tile of data.tiles) {
      let far = true;
      const first = tile.parts.get('trunk').mesh;
      const shown = visible(first) && camera.layers.test(first.layers);
      // Conservative: a complete tile stays native if any constituent is large.
      for (const tree of tile.trees) {
        let lo = Infinity, hi = -Infinity;
        for (const corner of tree.corners) {
          point.copy(corner).applyMatrix4(camera.matrixWorldInverse);
          if (point.z >= -camera.near) { far = false; break; }
          point.applyMatrix4(camera.projectionMatrix); lo = Math.min(lo, point.y); hi = Math.max(hi, point.y);
        }
        direction.copy(position).sub(tree.center);
        const elevation = THREE.MathUtils.radToDeg(Math.atan2(direction.y, Math.hypot(direction.x, direction.z)));
        if (!far || (hi - lo) * heightPixels / 2 > (tile.far ? THRESHOLD : THRESHOLD - 8) || elevation < -10 || elevation > 85) { far = false; break; }
      }
      // If primitive visibility differs, keep original pieces; do not resurrect hidden leaves.
      for (const owner of tile.parts.values()) if (visible(owner.mesh) !== visible(first) || owner.mesh.layers.mask !== first.layers.mask) far = false;
      tile.far = far && shown;
      for (const owner of tile.parts.values()) { if (!preserveSelectedGeometry) owner.mesh.geometry = owner.native; owner.mesh.count = tile.far ? 0 : owner.count; }
      if (!tile.far) continue;
      for (const tree of tile.trees) {
        direction.copy(position).sub(tree.center);
        const az = bin(Math.atan2(direction.x, direction.z), AZIMUTHS);
        const degrees = THREE.MathUtils.radToDeg(Math.atan2(direction.y, Math.hypot(direction.x, direction.z)));
        let elevation = 0;
        for (let j = 1; j < ELEVATIONS.length; j++) if (Math.abs(degrees - ELEVATIONS[j]) < Math.abs(degrees - ELEVATIONS[elevation])) elevation = j;
        card.lookAt(position, tree.center, UP); rotation.setFromRotationMatrix(card);
        scale.setScalar(tree.scale * data.diameter); card.compose(tree.center, rotation, scale).premultiply(sceneInverse);
        proxies.setMatrixAt(count, card); cells.setXY(count, az, tree.yaw * ELEVATIONS.length + elevation); count++;
      }
    }
    proxies.count = count; proxies.instanceMatrix.needsUpdate = true; cells.needsUpdate = true;
    stats.impostorTrees = count; stats.nativeTrees = data.treeCount - count;
    return {...stats};
  }
  return {
    update, get stats() { return {...stats}; },
    setMode(value) { if (!['original', 'full', 'adaptive'].includes(value)) fail('unknown mode'); mode = value; update(); requestRender(); },
    withNativeShadows(render) {
      if (disposed) fail('disposed');
      if (typeof render !== 'function') fail('native shadow callback required');
      const before = data.owners.map(o => [o.mesh.geometry, o.mesh.count]); shadowDepth++;
      try { for (const owner of data.owners) { owner.mesh.geometry = owner.native; owner.mesh.count = owner.count; } return render(); }
      finally { data.owners.forEach((o, i) => { o.mesh.geometry = before[i][0]; o.mesh.count = before[i][1]; }); shadowDepth--; }
    },
    async rebake() {
      if (disposed || shadowDepth) fail('cannot rebake now');
      restore(false, preserveSelectedGeometry); const previous = atlas;
      atlas = bakeAtlas(renderer, scene, data, approximateLocalLighting); uniforms.atlas.value = atlas.target.texture; previous.target.dispose();
      update(); requestRender();
    },
    dispose() {
      if (disposed) return; if (shadowDepth) fail('dispose during shadow callback');
      restore(true); proxies.removeFromParent(); proxies.dispose(); plane.dispose(); material.dispose(); atlas.target.dispose(); disposed = true;
    }
  };
}
