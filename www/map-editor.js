// map-editor.js
// Interactive 3D map editor: orbit camera (wheel=zoom, middle-drag=pan, right-drag=rotate),
// pointer drag-and-drop placement of live rotating 3D spirit models + map items onto the
// map's ground plane. Reuses spirit-models.js (extracted from elements-gallery.html, task 12)
// so placed characters are the exact same tested 3D geometry/animation, not flat icons.
//
// Exposes window.MapEditor.mount(container, opts) for app.js to call.
// See renderTemplateGrid() in app.js for the caller.
//
// Classic (non-module) script on purpose, same reason as spirit-models.js: this app is
// opened directly via file:// as well as http(s), and file:// blocks `type="module"`/`import`
// entirely. THREE (with THREE.OrbitControls) and window.SpiritModels must already be loaded
// via classic <script> tags in index.html before this file.
//
// Everything below is wrapped in an IIFE: spirit-models.js is ALSO a classic script, and its
// top-level `function buildBlaze() {...}` etc. declarations create bindings directly in the
// shared global scope (unlike an ES module's scope). Destructuring those same names out of
// window.SpiritModels as top-level `const` here -- without this wrapper -- would redeclare
// identifiers that already exist globally and throw "has already been declared" at parse time.
(function () {
const OrbitControls = THREE.OrbitControls;
const {
  disposeGroup, buildBlaze, buildAqua, buildVolt, buildGust, buildTerra,
  buildFrost, buildLight, buildNox, buildLeaf, buildPlasma,
} = window.SpiritModels;

const CHAR_BUILDERS = {
  blaze: buildBlaze, aqua: buildAqua, volt: buildVolt, gust: buildGust, terra: buildTerra,
  frost: buildFrost, light: buildLight, nox: buildNox, leaf: buildLeaf, plasma: buildPlasma,
};

const MAX_CHARACTERS = 8;
// No cap on item placements (2026-08-14 user correction: "30" was never meant as a placement
// limit -- there are only 6 item types to choose from, and creators should be able to place as
// many as they want). Infinity keeps itemCount() >= MAX_ITEMS harmless everywhere it's checked.
const MAX_ITEMS = Infinity;
// All 6 season1 map photos are 1280x800 (1.6:1) -- the ground is built to match that aspect
// ratio (a rectangle, not a circle) instead of guessing/cropping to a circle.
const GROUND_HALF_X = 4.6;
const GROUND_HALF_Z = GROUND_HALF_X / 1.6;
const GROUND_HEIGHT = 0.5;
const CHAR_SCALE = 0.62;
const ITEM_SCALE = 0.75;

// Darkens (amt<0) or lightens (amt>0) a "#rrggbb" color; falls back to a neutral gray for
// anything else (named colors, missing value) since ground-side shading doesn't need to be exact.
function shadeColor(hex, amt) {
  if (typeof hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(hex)) return "#3a3a3a";
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp(((n >> 16) & 255) * (1 + amt));
  const g = clamp(((n >> 8) & 255) * (1 + amt));
  const b = clamp((n & 255) * (1 + amt));
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}

// ------------------------------------------------------------------
// アイテム(6種): それぞれのマップに合わせて配置する簡易ローポリオブジェクト。
// キャラと同じ { group, update(t,dt), dispose() } インターフェースにして
// 配置/アニメーションのコードを共通化する。
// ------------------------------------------------------------------
function buildTeleporter() {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.06, 12, 32),
    new THREE.MeshStandardMaterial({ color: 0x33e6ff, emissive: 0x33e6ff, emissiveIntensity: 1.2, roughness: 0.3 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 32),
    new THREE.MeshStandardMaterial({ color: 0x0d2e3a, emissive: 0x1199bb, emissiveIntensity: 0.6, transparent: true, opacity: 0.75 })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.02;
  group.add(disc);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.05, 1.4, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x66f2ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
  );
  beam.position.y = 0.75;
  group.add(beam);
  return {
    group,
    update(t) {
      ring.rotation.z = t * 1.4;
      ring.position.y = 0.05 + Math.sin(t * 2) * 0.02;
      const s = 1 + Math.sin(t * 3) * 0.05;
      beam.scale.set(s, 1, s);
    },
    dispose() { disposeGroup(group); },
  };
}

function buildHealSpot() {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 32),
    new THREE.MeshStandardMaterial({ color: 0x0d3a1a, emissive: 0x2ecc71, emissiveIntensity: 0.5, transparent: true, opacity: 0.7 })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.02;
  group.add(disc);
  const crossMat = new THREE.MeshStandardMaterial({ color: 0x2ecc71, emissive: 0x2ecc71, emissiveIntensity: 1.0 });
  const crossGroup = new THREE.Group();
  crossGroup.add(
    new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), crossMat),
    new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.12), crossMat)
  );
  crossGroup.position.y = 0.6;
  group.add(crossGroup);
  return {
    group,
    update(t) {
      crossGroup.position.y = 0.55 + Math.sin(t * 1.6) * 0.08;
      crossGroup.rotation.y = t * 0.8;
    },
    dispose() { disposeGroup(group); },
  };
}

function buildEnergyBall() {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.28, 1),
    new THREE.MeshStandardMaterial({ color: 0xffcc33, emissive: 0xff9900, emissiveIntensity: 1.1, roughness: 0.25 })
  );
  core.position.y = 0.5;
  group.add(core);
  const orbs = [];
  for (let i = 0; i < 3; i++) {
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffaa33, emissiveIntensity: 1.0 })
    );
    orb.userData = { baseAngle: (i / 3) * Math.PI * 2, radius: 0.42, speed: 1.2 + i * 0.15 };
    group.add(orb);
    orbs.push(orb);
  }
  return {
    group,
    update(t) {
      core.rotation.y = t * 0.9;
      core.rotation.x = t * 0.5;
      core.position.y = 0.5 + Math.sin(t * 2) * 0.05;
      for (const orb of orbs) {
        const u = orb.userData;
        const ang = u.baseAngle + t * u.speed;
        orb.position.set(Math.cos(ang) * u.radius, 0.5 + Math.sin(t * 3 + u.baseAngle) * 0.1, Math.sin(ang) * u.radius);
      }
    },
    dispose() { disposeGroup(group); },
  };
}

function buildStealthGrass() {
  const group = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x3f8f3f, roughness: 0.8, side: THREE.DoubleSide });
  const blades = [];
  for (let i = 0; i < 14; i++) {
    const h = 0.35 + Math.random() * 0.25;
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.05, h, 4), bladeMat);
    const ang = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.45;
    blade.position.set(Math.cos(ang) * r, h / 2, Math.sin(ang) * r);
    blade.rotation.y = Math.random() * Math.PI;
    blade.userData = { phase: Math.random() * Math.PI * 2 };
    group.add(blade);
    blades.push(blade);
  }
  return {
    group,
    update(t) {
      for (const b of blades) b.rotation.z = Math.sin(t * 1.5 + b.userData.phase) * 0.15;
    },
    dispose() { disposeGroup(group); },
  };
}

function buildHouse() {
  const group = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), new THREE.MeshStandardMaterial({ color: 0xd9b382, roughness: 0.9 }));
  wall.position.y = 0.3;
  group.add(wall);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.5, 4), new THREE.MeshStandardMaterial({ color: 0xa8432f, roughness: 0.8 }));
  roof.position.y = 0.85;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.35, 0.05), new THREE.MeshStandardMaterial({ color: 0x5a3a20 }));
  door.position.set(0, 0.18, 0.46);
  group.add(door);
  return { group, update() {}, dispose() { disposeGroup(group); } };
}

function buildRock() {
  const group = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 0), new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 1.0, flatShading: true }));
  rock.position.y = 0.25;
  rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
  rock.scale.set(1, 0.75, 0.9);
  group.add(rock);
  return { group, update() {}, dispose() { disposeGroup(group); } };
}

// Not in ITEM_DEFS (players don't place these) -- used only by buildGround()'s automatic
// land-decoration scatter, addressing "the map should have real 3D stuff on it, not just a
// flat photo" without needing hand-authored building/tree positions per map.
function buildTree() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.35, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 }));
  trunk.position.y = 0.175;
  group.add(trunk);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f8f4a, roughness: 0.9, flatShading: true });
  const leaf1 = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 7), leafMat);
  leaf1.position.y = 0.55;
  group.add(leaf1);
  const leaf2 = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.38, 7), leafMat);
  leaf2.position.y = 0.82;
  group.add(leaf2);
  group.rotation.y = Math.random() * Math.PI * 2;
  const s = 0.8 + Math.random() * 0.5;
  group.scale.setScalar(s);
  return { group, update() {}, dispose() { disposeGroup(group); } };
}

const ITEM_DEFS = [
  { type: "teleporter", label: "瞬間移動", icon: "🌀", build: buildTeleporter },
  { type: "heal", label: "回復スポット", icon: "💚", build: buildHealSpot },
  { type: "energy", label: "エネルギーボール", icon: "🔮", build: buildEnergyBall },
  { type: "grass", label: "ステルス草原", icon: "🌾", build: buildStealthGrass },
  { type: "house", label: "家", icon: "🏠", build: buildHouse },
  { type: "rock", label: "岩", icon: "🪨", build: buildRock },
];

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
.me-root { position: absolute; inset: 0; display: flex; flex-direction: column; background: #14151a; overflow: hidden; }
.me-stage { position: relative; flex: 1; min-height: 0; }
.me-stage canvas { display: block; width: 100%; height: 100%; touch-action: none; }
.me-back { position: absolute; top: 10px; left: 10px; z-index: 4; appearance: none; border: none; border-radius: 999px;
  padding: 7px 14px; font-size: 13px; font-weight: 600; background: rgba(20,20,26,0.6); color: #fff; cursor: pointer; }
.me-hint { position: absolute; top: 10px; right: 10px; z-index: 4; font-size: 11px; color: #fff; opacity: 0.75;
  background: rgba(20,20,26,0.5); border-radius: 8px; padding: 6px 9px; max-width: 46%; text-align: right; line-height: 1.5; pointer-events: none; }
.me-bubble { position: absolute; left: 10px; bottom: 10px; z-index: 4; background: rgba(20,20,26,0.72); color: #fff;
  border-radius: 12px; padding: 10px 14px; max-width: min(70%, 360px); pointer-events: none; }
.me-bubble-name { font-size: 15px; font-weight: 700; }
.me-bubble-element { font-size: 11px; opacity: 0.8; margin-left: 6px; }
.me-bubble-line { font-size: 12px; opacity: 0.9; margin-top: 3px; }
.me-counter { position: absolute; right: 10px; bottom: 10px; z-index: 4; font-size: 11px; color: #fff;
  background: rgba(20,20,26,0.6); border-radius: 8px; padding: 5px 9px; pointer-events: none; }
.me-delbtn { position: absolute; z-index: 5; left: 10px; bottom: 56px; appearance: none; border: none; border-radius: 999px;
  padding: 7px 14px; font-size: 12px; font-weight: 600; background: rgba(220,60,60,0.85); color: #fff; cursor: pointer; display: none; }
.me-tray { flex-shrink: 0; background: rgba(15,15,20,0.92); border-top: 1px solid rgba(255,255,255,0.08); }
.me-tray-head { display: flex; align-items: center; gap: 8px; padding: 6px 10px; }
.me-tray-tabs { display: flex; gap: 6px; flex: 1; }
.me-tray-tab { appearance: none; border: 1px solid rgba(255,255,255,0.2); border-radius: 999px; padding: 5px 12px;
  font-size: 12px; font-weight: 600; background: rgba(255,255,255,0.06); color: #fff; cursor: pointer; }
.me-tray-tab.active { background: #fff; color: #14151a; }
.me-tray-toggle { appearance: none; border: none; border-radius: 999px; width: 30px; height: 30px; font-size: 16px;
  font-weight: 700; background: rgba(255,255,255,0.12); color: #fff; cursor: pointer; line-height: 1; }
.me-tray-body { display: flex; gap: 10px; overflow-x: auto; padding: 4px 10px 12px; }
.me-tray.collapsed .me-tray-body { display: none; }
.me-tray.collapsed .me-tray-tabs { display: none; }
.me-avatar, .me-item-btn { flex-shrink: 0; width: 58px; display: flex; flex-direction: column; align-items: center; gap: 4px;
  background: none; border: none; cursor: grab; touch-action: none; }
.me-avatar-face, .me-item-face { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 22px; border: 2px solid transparent; }
.me-avatar-face { color: #fff; }
.me-item-face { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.25); }
.me-avatar.selected .me-avatar-face, .me-item-btn.selected .me-item-face { border-color: #fff; }
.me-avatar-label, .me-item-label { font-size: 10px; color: #fff; text-align: center; opacity: 0.85; white-space: nowrap; }
.me-confirm-row { display: flex; gap: 8px; padding: 0 10px 10px; }
.me-confirm { flex: 1; appearance: none; border: none; border-radius: 10px; padding: 11px; font-size: 14px; font-weight: 700;
  background: #fff; color: #14151a; cursor: pointer; }
.me-confirm:disabled { opacity: 0.4; cursor: default; }
.me-ghost { position: fixed; z-index: 999; pointer-events: none; width: 48px; height: 48px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; font-size: 22px; color: #fff;
  box-shadow: 0 4px 14px rgba(0,0,0,0.4); transform: translate(-50%, -50%); opacity: 0.9; }
.me-rules { padding: 6px 10px 12px; display: flex; flex-direction: column; gap: 12px; }
.me-rules-row { display: flex; flex-direction: column; gap: 6px; }
.me-rules-label { font-size: 12px; color: #fff; opacity: 0.75; }
.me-rules-opts { display: flex; gap: 8px; }
.me-rules-opt { appearance: none; border: 1px solid rgba(255,255,255,0.25); border-radius: 999px; padding: 7px 14px;
  font-size: 12px; font-weight: 600; background: rgba(255,255,255,0.06); color: #fff; cursor: pointer; }
.me-rules-opt.selected { background: #fff; color: #14151a; }
`;
  document.head.appendChild(style);
}

// Real 3D terrain instead of a flat painted disc: a rectangular slab (matching the map
// photo's actual aspect ratio, not cropped to a circle) whose TOP surface is displaced per
// vertex from the photo's own pixels -- bluish pixels (rivers/lakes) carve a depression,
// everything else gets a mild noise-free relief from luminance. A translucent water plane
// sits over the carved depressions so rivers actually read as water, not just a low patch.
// Shared by the editor (mount()) and the 3D play mode (games.js mountElementArena3D) via
// window.MapEditor.buildGround so both render identical terrain for the same map.
function isWaterPixel(r, g, b) {
  return b > r * 1.15 && b > g * 1.05 && b > 55;
}

function buildGround(scene, { photoUrl, mapColor }) {
  const halfX = GROUND_HALF_X, halfZ = GROUND_HALF_Z;
  const segX = 48, segZ = Math.round(48 / 1.6);

  const topMat = new THREE.MeshStandardMaterial({ color: mapColor || "#3a3a3a", roughness: 0.95 });
  const sideMat = new THREE.MeshStandardMaterial({ color: shadeColor(mapColor, -0.35), roughness: 1 });
  const geo = new THREE.BoxGeometry(halfX * 2, GROUND_HEIGHT, halfZ * 2, segX, 1, segZ);
  // BoxGeometry group order is [+X, -X, +Y(top), -Y(bottom), +Z, -Z] -- only the top gets the photo.
  const mesh = new THREE.Mesh(geo, [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
  mesh.position.y = -GROUND_HEIGHT / 2;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(halfX * 2, halfZ * 2),
    new THREE.MeshStandardMaterial({ color: 0x2a7fb0, transparent: true, opacity: 0.55, roughness: 0.2 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.09;
  scene.add(water);

  // Populated with actual 3D trees/rocks scattered on land once the photo loads (see below) --
  // not an exact reproduction of each map's real buildings (no per-map position data exists,
  // only the flat rendered photos), but real standing 3D objects instead of nothing.
  const decorations = [];

  // Filled in once the photo's pixels are read (see below); null until then, so heightAt()
  // returns flat ground (0) for anything placed before the async load finishes.
  let heightAtUV = null;
  // Public: world-space (x,z) -> local terrain height at that point. Used so user-placed
  // items/characters (editor) and the player/decorations (3D play mode) sit flush with the
  // actual relief instead of a flat y=0 that ignores the carved/bumped terrain under them.
  function heightAt(worldX, worldZ) {
    if (!heightAtUV) return 0;
    const u = (worldX + halfX) / (halfX * 2);
    const v = (worldZ + halfZ) / (halfZ * 2);
    return heightAtUV(u, v).h;
  }
  // Anything placed synchronously right after buildGround() (the 3D play mode places the
  // player + every decoration/item in the same tick) runs BEFORE the photo has finished
  // loading, so heightAt() only has the flat-ground fallback to give it -- onHeightReady()
  // lets callers re-snap those Y positions once the real heightmap is actually available.
  // Fires immediately if the map has no photo at all (heightAtUV will just stay flat).
  let heightReady = !photoUrl;
  const heightReadyCallbacks = [];
  function onHeightReady(cb) {
    if (heightReady) cb();
    else heightReadyCallbacks.push(cb);
  }
  function markHeightReady() {
    heightReady = true;
    heightReadyCallbacks.forEach((cb) => cb());
    heightReadyCallbacks.length = 0;
  }

  if (photoUrl) {
    // THREE.Loader defaults `crossOrigin` to "anonymous", which ImageLoader then sets as the
    // <img>'s crossorigin attribute. That's harmless over http(s), but this app is also opened
    // directly via file:// -- and Chrome refuses anonymous-CORS-mode requests for file:// image
    // loads even when the image sits right next to the page, silently failing (no load, no
    // error event our onLoad/catch would see) and leaving the ground on its flat fallback
    // mapColor forever. These map photos are always same-directory assets that never need CORS,
    // so just don't set the attribute at all (crossOrigin undefined skips it entirely).
    const texLoader = new THREE.TextureLoader();
    texLoader.crossOrigin = undefined;
    texLoader.load(photoUrl, (tex) => {
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      else if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;
      topMat.map = tex;
      topMat.needsUpdate = true;

      // Sample the loaded image's own pixels for the heightmap -- same-origin (this file
      // ships its own map photos), so canvas pixel reads aren't CORS-tainted. If they ever
      // are (e.g. a future remote-hosted photo), getImageData throws and displacement is
      // skipped entirely -- the ground just stays flat-but-textured, never crashes.
      try {
        const img = tex.image;
        const cw = 128, ch = Math.round(128 / 1.6);
        const canvas = document.createElement("canvas");
        canvas.width = cw; canvas.height = ch;
        const ctx2d = canvas.getContext("2d");
        ctx2d.drawImage(img, 0, 0, cw, ch);
        const data = ctx2d.getImageData(0, 0, cw, ch).data;

        function sampleColor(u, v) {
          const px = Math.max(0, Math.min(cw - 1, Math.floor(u * cw)));
          const py = Math.max(0, Math.min(ch - 1, Math.floor(v * ch)));
          const i = (py * cw + px) * 4;
          return [data[i], data[i + 1], data[i + 2]];
        }

        heightAtUV = function (u, v) {
          const [r, g, b] = sampleColor(u, v);
          if (isWaterPixel(r, g, b)) return { h: -0.22, water: true };
          return { h: ((r + g + b) / 3 - 128) / 128 * 0.05, water: false };
        };

        const posAttr = geo.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
          const vx = posAttr.getX(i), vy = posAttr.getY(i), vz = posAttr.getZ(i);
          if (vy <= GROUND_HEIGHT / 2 - 0.001) continue; // only the top surface gets displaced
          const u = (vx + halfX) / (halfX * 2);
          const v = (vz + halfZ) / (halfZ * 2);
          posAttr.setY(i, GROUND_HEIGHT / 2 + heightAtUV(u, v).h);
        }
        posAttr.needsUpdate = true;
        geo.computeVertexNormals();

        // Jittered grid so decorations spread across the whole map instead of clustering,
        // skipping water and a clearing around the center (where the player/camera starts).
        const cols = 6, rows = Math.max(3, Math.round(cols / 1.6));
        for (let cy = 0; cy < rows; cy++) {
          for (let cx = 0; cx < cols; cx++) {
            const u = (cx + 0.5 + (Math.random() - 0.5) * 0.7) / cols;
            const v = (cy + 0.5 + (Math.random() - 0.5) * 0.7) / rows;
            const wx = (u - 0.5) * halfX * 2, wz = (v - 0.5) * halfZ * 2;
            if (Math.hypot(wx, wz) < 1.3) continue; // spawn clearing
            const sample = heightAtUV(u, v);
            if (sample.water) continue;
            // Bug (found 2026-08-15): this used to place a tree or rock at EVERY non-water grid
            // point on EVERY map, with no regard for what the map actually is -- season1_map3
            // (a sci-fi city with paved black roads, no nature anywhere) was getting pine trees
            // scattered across it just like the grassland village. Read the ground photo's own
            // sampled color (already computed for the heightmap, see sampleColor above) and only
            // place trees on grass-green ground; dark/paved (urban) ground gets no decorations
            // at all; anything else (sand, stone, etc.) gets rocks only, never trees.
            const [dr, dg, db] = sampleColor(u, v);
            const dAvg = (dr + dg + db) / 3;
            // avg>25 (not >50): map3's own park ground color (mat_park, (0.08,0.30,0.16) in
            // Blender = ~(20,77,41) in 0-255, avg~46) is legitimately grass-green by the ratio
            // check but darker than a >50 floor would allow -- that floor was miscalibrated
            // against this project's actual palette and would have suppressed trees in the one
            // place (the park) they're supposed to be, the opposite of the intended fix.
            const isGrassy = dg > dr * 1.1 && dg > db * 1.1 && dAvg > 25;
            const isPaved = dAvg < 45;
            if (isPaved) continue;
            const inst = isGrassy ? (Math.random() < 0.72 ? buildTree() : buildRock()) : buildRock();
            // Decorations are added directly to `scene` (siblings of the ground mesh, not
            // its children), so they need the ground's WORLD-space surface height here, not
            // the local geometry-space one. mesh.position.y (-GROUND_HEIGHT/2) already
            // cancels the top face's local +GROUND_HEIGHT/2 offset -- world surface height at
            // any point is simply the raw sampled `h`. Using `GROUND_HEIGHT/2 + h` here (the
            // LOCAL value) placed every tree/rock floating GROUND_HEIGHT/2 (0.25 units) above
            // the actual terrain.
            inst.group.position.set(wx, sample.h, wz);
            scene.add(inst.group);
            decorations.push(inst);
          }
        }
      } catch (err) { /* CORS-tainted or unreadable image -- ground stays flat, still textured */ }
      markHeightReady();
    });
  }

  return {
    mesh, water, decorations, halfX, halfZ, heightAt, onHeightReady,
    update(t) {
      water.position.y = -0.09 + Math.sin(t * 0.6) * 0.008;
      water.material.opacity = 0.5 + Math.sin(t * 0.8) * 0.05;
      for (const d of decorations) d.update(t);
    },
  };
}

/**
 * @param {HTMLElement} container
 * @param {Object} opts
 * @param {string} opts.mapName
 * @param {string} [opts.mapPhotoUrl]
 * @param {string} [opts.mapColor]
 * @param {Array<{id:string,name:string,element:string,color:string,icon:string,skillLine:string,ultimateName:string}>} opts.characters
 * @param {(charId: string, placements: Array) => void} opts.onConfirm
 * @param {() => void} opts.onBack
 */
function mount(container, opts) {
  injectStyles();
  const { mapName, mapPhotoUrl, mapColor, characters, onConfirm, onBack } = opts;

  container.innerHTML = "";
  const root = document.createElement("div");
  root.className = "me-root";
  container.appendChild(root);

  const stage = document.createElement("div");
  stage.className = "me-stage";
  root.appendChild(stage);

  const backBtn = document.createElement("button");
  backBtn.className = "me-back";
  backBtn.textContent = "← マップ選択に戻る";
  backBtn.addEventListener("click", () => { if (onBack) onBack(); });
  stage.appendChild(backBtn);

  const hint = document.createElement("div");
  hint.className = "me-hint";
  hint.textContent = "ホイールでズーム / 右ドラッグで回転 / 中ボタンドラッグで移動\nキャラ・アイテムは下の一覧からドラッグしてマップに配置";
  hint.style.whiteSpace = "pre-line";
  stage.appendChild(hint);

  const bubble = document.createElement("div");
  bubble.className = "me-bubble";
  stage.appendChild(bubble);

  const counter = document.createElement("div");
  counter.className = "me-counter";
  stage.appendChild(counter);

  const delBtn = document.createElement("button");
  delBtn.className = "me-delbtn";
  delBtn.textContent = "🗑 選択中を削除";
  stage.appendChild(delBtn);

  // ---------------- Three.js scene ----------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  stage.insertBefore(renderer.domElement, hint);
  renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

  const bg = mapColor || "#223";
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bg);
  scene.fog = new THREE.Fog(new THREE.Color(bg).getHex(), 9, 22);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 6.8, 9.2);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x30302a, 1.05);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(4, 7, 4);
  key.castShadow = true;
  scene.add(key);

  const ground = buildGround(scene, { photoUrl: mapPhotoUrl, mapColor });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.target.set(0, 0.4, 0);
  controls.minDistance = 2.2;
  controls.maxDistance = 14;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.update();

  function resize() {
    const w = stage.clientWidth || 1;
    const h = stage.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);
  resize();

  // ---------------- placement state ----------------
  const placed = []; // { kind, id, x, z, inst, ts }
  let primaryCharPlacement = null; // last-selected character placement, drives confirm button
  let selectedPlacement = null; // currently selected placed object (for deletion)
  const rules = { timeLimit: 0, difficulty: 1 }; // carried through to config.mapLayout.rules
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();

  function charCount() { return placed.filter((p) => p.kind === "character").length; }
  function itemCount() { return placed.filter((p) => p.kind === "item").length; }

  function updateCounter() {
    counter.textContent = `キャラ ${charCount()}/${MAX_CHARACTERS} ・ アイテム ${itemCount()}個`;
  }

  function showBubbleFor(charDef) {
    if (!charDef) { bubble.innerHTML = ""; return; }
    bubble.innerHTML = `<div class="me-bubble-name">${escapeHtml(charDef.name)}<span class="me-bubble-element">#${escapeHtml(charDef.element)}属性</span></div>
      <div class="me-bubble-line">技: ${escapeHtml(charDef.skillLine || "")}</div>
      <div class="me-bubble-line">必殺技: ${escapeHtml(charDef.ultimateName || "")}</div>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function screenToGround(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    const ok = raycaster.ray.intersectPlane(groundPlane, hit);
    if (!ok) return null;
    hit.x = Math.max(-ground.halfX, Math.min(ground.halfX, hit.x));
    hit.z = Math.max(-ground.halfZ, Math.min(ground.halfZ, hit.z));
    return hit;
  }

  function placeCharacter(charDef, x, z) {
    if (charCount() >= MAX_CHARACTERS) return null;
    const inst = buildCharacterInstance(charDef.id, scene);
    if (!inst) return null;
    inst.group.position.set(x, ground.heightAt(x, z), z);
    inst.group.scale.setScalar(CHAR_SCALE);
    const record = { kind: "character", id: charDef.id, x, z, inst, def: charDef };
    placed.push(record);
    primaryCharPlacement = record;
    selectPlacement(record);
    updateCounter();
    return record;
  }

  function placeItem(itemDef, x, z) {
    if (itemCount() >= MAX_ITEMS) return null;
    const inst = itemDef.build();
    inst.group.position.set(x, ground.heightAt(x, z), z);
    inst.group.scale.setScalar(ITEM_SCALE);
    scene.add(inst.group);
    const record = { kind: "item", id: itemDef.type, x, z, inst, def: itemDef };
    placed.push(record);
    updateCounter();
    return record;
  }

  function selectPlacement(record) {
    selectedPlacement = record;
    delBtn.style.display = record ? "block" : "none";
    if (record && record.kind === "character") {
      primaryCharPlacement = record;
      showBubbleFor(record.def);
      confirmBtn.disabled = false;
      confirmBtn.textContent = `${record.def.name}で投稿する →`;
    }
  }

  function removePlacement(record) {
    const idx = placed.indexOf(record);
    if (idx === -1) return;
    placed.splice(idx, 1);
    // character build()/dispose() (spirit-models.js) manage their own scene.add/remove;
    // item builders here don't touch the scene themselves (placeItem() adds them), so
    // removal must explicitly take them back out too.
    if (record.kind === "item") scene.remove(record.inst.group);
    record.inst.dispose();
    if (selectedPlacement === record) selectPlacement(null);
    if (primaryCharPlacement === record) {
      const nextChar = placed.find((p) => p.kind === "character") || null;
      primaryCharPlacement = nextChar;
      if (nextChar) { selectPlacement(nextChar); }
      else { showBubbleFor(null); confirmBtn.disabled = true; confirmBtn.textContent = "キャラを配置してください"; }
    }
    updateCounter();
  }

  delBtn.addEventListener("click", () => { if (selectedPlacement) removePlacement(selectedPlacement); });

  // click (no drag) on the canvas selects a placed object
  let downPt = null;
  renderer.domElement.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    downPt = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (e.button !== 0 || !downPt) return;
    const moved = Math.hypot(e.clientX - downPt.x, e.clientY - downPt.y);
    downPt = null;
    if (moved > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const groups = placed.map((p) => p.inst.group);
    const hits = raycaster.intersectObjects(groups, true);
    if (hits.length === 0) { selectPlacement(null); return; }
    let obj = hits[0].object;
    while (obj.parent && !groups.includes(obj)) obj = obj.parent;
    const record = placed.find((p) => p.inst.group === obj);
    if (record) selectPlacement(record);
  });

  // ---------------- bottom tray ----------------
  const tray = document.createElement("div");
  tray.className = "me-tray";
  root.appendChild(tray);

  const trayHead = document.createElement("div");
  trayHead.className = "me-tray-head";
  tray.appendChild(trayHead);

  const tabs = document.createElement("div");
  tabs.className = "me-tray-tabs";
  const charTab = document.createElement("button");
  charTab.className = "me-tray-tab active";
  charTab.textContent = "🧑‍🚀 キャラ";
  const itemTab = document.createElement("button");
  itemTab.className = "me-tray-tab";
  itemTab.textContent = "🧰 アイテム";
  const rulesTab = document.createElement("button");
  rulesTab.className = "me-tray-tab";
  rulesTab.textContent = "⚙️ ルール";
  tabs.appendChild(charTab);
  tabs.appendChild(itemTab);
  tabs.appendChild(rulesTab);
  trayHead.appendChild(tabs);

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "me-tray-toggle";
  toggleBtn.textContent = "−";
  trayHead.appendChild(toggleBtn);
  toggleBtn.addEventListener("click", () => {
    const collapsed = tray.classList.toggle("collapsed");
    toggleBtn.textContent = collapsed ? "+" : "−";
  });

  const trayBody = document.createElement("div");
  trayBody.className = "me-tray-body";
  tray.appendChild(trayBody);

  const confirmRow = document.createElement("div");
  confirmRow.className = "me-confirm-row";
  const confirmBtn = document.createElement("button");
  confirmBtn.className = "me-confirm";
  confirmBtn.textContent = "キャラを配置してください";
  confirmBtn.disabled = true;
  confirmRow.appendChild(confirmBtn);
  tray.appendChild(confirmRow);

  confirmBtn.addEventListener("click", () => {
    if (!primaryCharPlacement) return;
    const placements = placed.map((p) => ({ kind: p.kind, id: p.id, x: p.x, z: p.z }));
    if (onConfirm) onConfirm(primaryCharPlacement.id, placements, rules);
  });

  function renderCharTab() {
    trayBody.innerHTML = "";
    characters.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "me-avatar";
      btn.dataset.kind = "character";
      btn.dataset.id = c.id;
      btn.innerHTML = `<span class="me-avatar-face" style="background:${c.color}">${c.icon || ""}</span><span class="me-avatar-label">${escapeHtml(c.name)}</span>`;
      wireDrag(btn, "character", c);
      trayBody.appendChild(btn);
    });
  }
  function renderItemTab() {
    trayBody.innerHTML = "";
    ITEM_DEFS.forEach((it) => {
      const btn = document.createElement("button");
      btn.className = "me-item-btn";
      btn.dataset.kind = "item";
      btn.dataset.id = it.type;
      btn.innerHTML = `<span class="me-item-face">${it.icon}</span><span class="me-item-label">${escapeHtml(it.label)}</span>`;
      wireDrag(btn, "item", it);
      trayBody.appendChild(btn);
    });
  }
  const TIME_LIMIT_OPTIONS = [
    { value: 0, label: "なし" }, { value: 60, label: "60秒" },
    { value: 120, label: "120秒" }, { value: 180, label: "180秒" },
  ];
  const DIFFICULTY_OPTIONS = [
    { value: 0.7, label: "遅い" }, { value: 1, label: "普通" }, { value: 1.4, label: "速い" },
  ];
  function renderRulesTab() {
    trayBody.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "me-rules";
    wrap.innerHTML = `
      <div class="me-rules-row"><span class="me-rules-label">制限時間</span><div class="me-rules-opts" data-key="timeLimit"></div></div>
      <div class="me-rules-row"><span class="me-rules-label">敵の出現速度</span><div class="me-rules-opts" data-key="difficulty"></div></div>
    `;
    trayBody.appendChild(wrap);
    function buildOptGroup(key, options) {
      const host = wrap.querySelector(`.me-rules-opts[data-key="${key}"]`);
      options.forEach((opt) => {
        const b = document.createElement("button");
        b.className = "me-rules-opt";
        b.textContent = opt.label;
        b.classList.toggle("selected", rules[key] === opt.value);
        b.addEventListener("click", () => {
          rules[key] = opt.value;
          host.querySelectorAll(".me-rules-opt").forEach((el) => el.classList.remove("selected"));
          b.classList.add("selected");
        });
        host.appendChild(b);
      });
    }
    buildOptGroup("timeLimit", TIME_LIMIT_OPTIONS);
    buildOptGroup("difficulty", DIFFICULTY_OPTIONS);
  }
  function setActiveTab(activeBtn) {
    [charTab, itemTab, rulesTab].forEach((b) => b.classList.toggle("active", b === activeBtn));
  }
  charTab.addEventListener("click", () => { setActiveTab(charTab); renderCharTab(); });
  itemTab.addEventListener("click", () => { setActiveTab(itemTab); renderItemTab(); });
  rulesTab.addEventListener("click", () => { setActiveTab(rulesTab); renderRulesTab(); });
  renderCharTab();

  // ---------------- drag-and-drop from tray to ground ----------------
  let ghost = null;
  function wireDrag(el, kind, def) {
    // Listeners go on `document`, not `el`: once the pointer leaves the tray button
    // (which it always does, since the drop target is the canvas elsewhere on screen),
    // an element-scoped listener stops receiving events unless pointer capture is active.
    // setPointerCapture() itself is best-effort (wrapped in try/catch below) since it can
    // throw NotFoundError in some browsers/edge cases, which would otherwise abort the
    // whole handler and silently break every drag.
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* best-effort; document listeners still work */ }
      ghost = document.createElement("div");
      ghost.className = "me-ghost";
      ghost.style.background = kind === "character" ? def.color : "rgba(255,255,255,0.18)";
      ghost.textContent = kind === "character" ? (def.icon || "") : def.icon;
      ghost.style.left = e.clientX + "px";
      ghost.style.top = e.clientY + "px";
      document.body.appendChild(ghost);

      const onMove = (ev) => {
        if (ghost) { ghost.style.left = ev.clientX + "px"; ghost.style.top = ev.clientY + "px"; }
      };
      const onUp = (ev) => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        if (ghost) { ghost.remove(); ghost = null; }
        const hit = screenToGround(ev.clientX, ev.clientY);
        if (hit) {
          if (kind === "character") placeCharacter(def, hit.x, hit.z);
          else placeItem(def, hit.x, hit.z);
        }
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    });
  }

  // ---------------- render loop ----------------
  const clock = new THREE.Clock();
  let rafId = null;
  function animate() {
    rafId = requestAnimationFrame(animate);
    const dt = clock.getDelta();
    const t = clock.elapsedTime;
    controls.update();
    ground.update(t);
    for (const p of placed) { if (p.inst.update) p.inst.update(t, dt); }
    renderer.render(scene, camera);
  }
  animate();

  updateCounter();

  return {
    destroy() {
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      for (const p of placed) p.inst.dispose();
      placed.length = 0;
      disposeGround(ground);
      renderer.dispose();
      controls.dispose();
      container.innerHTML = "";
    },
  };
}

function disposeGround(ground) {
  ground.mesh.geometry.dispose();
  (Array.isArray(ground.mesh.material) ? ground.mesh.material : [ground.mesh.material]).forEach((m) => {
    if (m.map) m.map.dispose();
    m.dispose();
  });
  ground.water.geometry.dispose();
  ground.water.material.dispose();
  for (const d of ground.decorations) d.dispose();
}

// Reused by games.js's 3D "play your created map" mode (mountElementCharacter's mapLayout
// branch) so it builds the exact same character/item models as the editor instead of a
// second, drifting copy of this geometry.
// spirit-models.js's buildX() functions were authored for the solo gallery view (one
// character alone in an otherwise-empty scene): each one adds its OWN full lighting rig
// (hemisphere + 2 directional + point light) AND a large translucent "spotlight" ground
// disc (CircleGeometry radius 3.2) as children of the character's own root group. Reused
// as-is in the map editor/arena's shared scene, every placed character stacks another
// copy of that lighting + disc on top of the real terrain -- extra lights wash out the
// scene and the disc reads as a glowing halo under each character. Strip both here, once,
// at the single shared entry point both the editor and the 3D play mode call through.
function stripEmbeddedLightingAndDisc(group) {
  const toRemove = [];
  group.traverse((obj) => {
    if (obj === group) return;
    if (obj.isLight) { toRemove.push(obj); return; }
    if (obj.isMesh && obj.geometry && obj.geometry.type === "CircleGeometry") {
      const radius = obj.geometry.parameters && obj.geometry.parameters.radius;
      if (radius && radius >= 2) toRemove.push(obj); // the big ground disc, not small accent circles
    }
  });
  for (const obj of toRemove) {
    if (obj.parent) obj.parent.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m && m.dispose());
  }
}

function buildCharacterInstance(charId, scene) {
  const builder = CHAR_BUILDERS[charId];
  if (!builder) return null;
  const inst = builder(scene, () => {});
  stripEmbeddedLightingAndDisc(inst.group);
  return inst;
}
function buildItemInstance(type) {
  const def = ITEM_DEFS.find((d) => d.type === type);
  return def ? def.build() : null;
}

window.MapEditor = {
  mount,
  buildCharacterInstance,
  buildItemInstance,
  buildGround,
  disposeGround,
  ITEM_DEFS,
  CHAR_SCALE,
  ITEM_SCALE,
  GROUND_HALF_X,
  GROUND_HALF_Z,
};
})();
