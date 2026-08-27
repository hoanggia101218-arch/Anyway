// Anyway - エレメント・マーブル (Element Marble)
//
// Original lateral-balance 3D runner: a spirit orb rolls forward automatically down an endless
// procedurally-tilted track (own code, genre-inspired by Drive Mad / Marble Run 3D style
// hyper-casual balance games per output_contrib/MSI/new_games_roadmap.md, no code/art/levels
// reused from any other title). The player only ever steers LEFT/RIGHT: each track segment has
// a random tilt that pulls the ball sideways (a simplified sin(tilt)*g lateral-acceleration
// model, not a real rigid-body physics engine -- this project has no physics library, and a
// fully simulated contact solver is out of scope for a 30-60s feed card), and some segments have
// a hazard gap that swallows the ball if it isn't steered clear in time. Deliberately endless
// with a 3-life system (matching the already-shipped spiral.js) rather than a fixed goal line:
// keeps the mechanic testable/consistent with the one 3D game already verified in this app, and
// suits the vertical feed's swipe-to-replay loop better than a one-shot finish line would.
//
// Classic (non-module) three.js, same file:// reasoning as spiral.js/royale.js/etc.

const MARBLE_ELEMENT_COLORS = [
  0xff6b3d, // 001 ブレイズ (fire)
  0x4fc3f7, // 002 アクア (water)
  0xffcf33, // 003 ボルト (electric)
  0x7ee787, // 004 ガスト (wind)
  0xc99a4a, // 005 テラ (earth)
  0xa8e6ff, // 006 フロスト (ice)
  0xfff4c2, // 007 ライト (light)
  0x8b6cff, // 008 ノクス (dark)
  0x31d158, // 009 リーフ (nature)
  0xff5ec4, // 010 プラズマ (plasma)
];
const MARBLE_HAZARD_COLOR = 0xd63a3a;
const MARBLE_CRYSTAL_COLOR = 0xffe9a8;

// ---------- pure generation/physics helpers (no THREE, no DOM -- kept standalone so they can be
// headlessly exercised the same way flowGenerate/flowCanPour were, see status.json task108) ----------

const MARBLE_TRACK_BASE_HALF = 1.9;
const MARBLE_TRACK_MIN_HALF = 1.05;
const MARBLE_BALL_R = 0.42;
const MARBLE_SEG_LEN = 3.2;

function marbleHalfWidthFor(idx) {
  return Math.max(MARBLE_TRACK_MIN_HALF, MARBLE_TRACK_BASE_HALF - idx * 0.012);
}

// maxTilt ramps from ~5deg to a ~20deg cap as depth increases; sign/magnitude driven by an
// injected [0,1) random so this is deterministically testable outside a real RNG.
// Tuned down from an initial 10deg-to-26deg/idx*0.006 curve (see status.json task108, 2026-08-22
// MSI notes): a headless bot-simulation harness showed the original curve, combined with
// marbleHazardChanceFor's original ramp, made even a reactive bot with realistic camera
// lookahead fail to survive a long run -- the required dodge frequency outpaced how fast the
// lateral-steering model can physically respond. This slower/lower curve keeps the "endless,
// escalating" feel without demanding faster reactions than the steering model can deliver.
function marbleTiltFor(idx, rand01) {
  const maxTilt = Math.min(0.35, 0.09 + idx * 0.004);
  return (rand01 * 2 - 1) * maxTilt;
}

// Capped well below 50% and ramped slower than the original draft (see marbleTiltFor's note
// above for why) -- by idx=65 this caps out at 32% of segments carrying a hazard gap, instead of
// the original curve's 50% by idx=38, which a headless bot-survival simulation showed was
// effectively unsurvivable long-term even for a well-aimed player.
function marbleHazardChanceFor(idx) { return Math.min(0.32, 0.08 + idx * 0.0037); }
function marbleCrystalChanceFor() { return 0.22; }

// Always leaves a full safe strip on one side (gap only ever eats into one edge, never the
// center), so every segment is guaranteed passable -- same "guaranteed gap slice" solvability
// guarantee spiral.js's buildRing uses, adapted to a continuous lateral gap instead of a discrete
// ring slice.
function marbleHazardGapFor(idx, randChance, randWidth, randSide, halfWidth) {
  if (randChance >= marbleHazardChanceFor(idx)) return null;
  const gapWidthFrac = 0.3 + randWidth * 0.3; // 30%-60% of the full track width
  const gapWidth = gapWidthFrac * (halfWidth * 2);
  if (randSide < 0.5) return { from: -halfWidth, to: -halfWidth + gapWidth };
  return { from: halfWidth - gapWidth, to: halfWidth };
}

// Only placed on gap-free segments to keep the "safe strip" guarantee simple to reason about.
function marbleCrystalFor(idx, randChance, randPos, halfWidth, gap) {
  if (gap) return null;
  if (randChance >= marbleCrystalChanceFor()) return null;
  const margin = MARBLE_BALL_R * 1.5;
  const usable = Math.max(0, halfWidth - margin);
  return (randPos * 2 - 1) * usable;
}

// 'ok' | 'edge' (ran off the track entirely) | 'hazard' (fell through a gap). Center-point check
// against the segment's half-width/gap, same simplified single-point collision style spiral.js
// uses for its ring-slice lookup (no full ball-footprint contact solve).
function marbleCheckBoundary(ballX, halfWidth, gap) {
  if (Math.abs(ballX) > halfWidth) return 'edge';
  if (gap && ballX > gap.from && ballX < gap.to) return 'hazard';
  return 'ok';
}

function marbleSlopeAccel(tilt, g) { return Math.sin(tilt) * g; }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    marbleHalfWidthFor, marbleTiltFor, marbleHazardChanceFor, marbleCrystalChanceFor,
    marbleHazardGapFor, marbleCrystalFor, marbleCheckBoundary, marbleSlopeAccel,
    MARBLE_TRACK_BASE_HALF, MARBLE_TRACK_MIN_HALF, MARBLE_BALL_R, MARBLE_SEG_LEN,
  };
}

function mountMarble(container, { onScore, onHint }, config = {}) {
  container.style.position = 'relative';
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  // ---------- renderer / scene / camera ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 2; skyCanvas.height = 256;
  const skyCtx = skyCanvas.getContext('2d');
  const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 256);
  skyGrad.addColorStop(0, '#2a3a6e');
  skyGrad.addColorStop(0.5, '#5a4a8e');
  skyGrad.addColorStop(1, '#1a1030');
  skyCtx.fillStyle = skyGrad;
  skyCtx.fillRect(0, 0, 2, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0x241c40, 14, 46);

  // Third-person chase camera (perspective, not orthographic): unlike spiral's stacked rings,
  // the track recedes straight ahead here, so ordinary depth-scaling reads correctly instead of
  // cluttering the frame the way it did for spiral's nested-ring view.
  const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 200);

  const hemi = new THREE.HemisphereLight(0xd8dcff, 0x181430, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.4);
  sun.position.set(5, 10, 6);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x6fa8ff, 0.45);
  fill.position.set(-6, -3, -4);
  scene.add(fill);

  // ---------- ball ----------
  const elementIdx = Math.floor(Math.random() * MARBLE_ELEMENT_COLORS.length);
  const ballColor = MARBLE_ELEMENT_COLORS[elementIdx];
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(MARBLE_BALL_R, 20, 16),
    new THREE.MeshPhysicalMaterial({ color: ballColor, roughness: 0.25, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.2, emissive: ballColor, emissiveIntensity: 0.25 })
  );
  ball.position.set(0, 0.5, 6.4);
  scene.add(ball);
  const ballLight = new THREE.PointLight(ballColor, 1.1, 7);
  ball.add(ballLight);

  // ---------- track segments ----------
  const matCache = new Map();
  function matFor(hex, emissive) {
    const key = hex + ':' + (emissive ? 1 : 0);
    if (matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshStandardMaterial({
      color: hex, roughness: 0.55, metalness: 0.06,
      emissive: emissive ? hex : 0x000000, emissiveIntensity: emissive ? 0.5 : 0,
    });
    matCache.set(key, m);
    return m;
  }
  const hazardStripeMat = matFor(MARBLE_HAZARD_COLOR, true);
  const crystalGeo = new THREE.OctahedronGeometry(0.28, 0);
  const crystalMat = matFor(MARBLE_CRYSTAL_COLOR, true);

  const SEG_THICK = 0.4;
  const segments = []; // { zFront, group, halfWidth, tilt, gap, crystal, crystalMesh, crystalTaken, passed }
  let nextSegIndex = 0;

  function buildSegment(idx) {
    const zFront = -idx * MARBLE_SEG_LEN - MARBLE_SEG_LEN * 2;
    const halfWidth = marbleHalfWidthFor(idx);
    const tilt = marbleTiltFor(idx, Math.random());
    const gap = marbleHazardGapFor(idx, Math.random(), Math.random(), Math.random(), halfWidth);
    const crystalX = marbleCrystalFor(idx, Math.random(), Math.random(), halfWidth, gap);

    const group = new THREE.Group();
    group.position.set(0, 0, zFront - MARBLE_SEG_LEN / 2);
    group.rotation.z = tilt;
    scene.add(group);

    const elementHex = MARBLE_ELEMENT_COLORS[idx % MARBLE_ELEMENT_COLORS.length];
    if (!gap) {
      const geo = new THREE.BoxGeometry(halfWidth * 2, SEG_THICK, MARBLE_SEG_LEN * 0.94);
      const mesh = new THREE.Mesh(geo, matFor(elementHex, false));
      group.add(mesh);
    } else {
      // two slabs either side of the gap, leaving a visible hole with a hazard-striped edge
      const leftW = gap.from - (-halfWidth);
      const rightW = halfWidth - gap.to;
      if (leftW > 0.02) {
        const geo = new THREE.BoxGeometry(leftW, SEG_THICK, MARBLE_SEG_LEN * 0.94);
        const mesh = new THREE.Mesh(geo, matFor(elementHex, false));
        mesh.position.x = -halfWidth + leftW / 2;
        group.add(mesh);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, SEG_THICK * 1.05, MARBLE_SEG_LEN * 0.94), hazardStripeMat);
        stripe.position.x = gap.from;
        group.add(stripe);
      }
      if (rightW > 0.02) {
        const geo = new THREE.BoxGeometry(rightW, SEG_THICK, MARBLE_SEG_LEN * 0.94);
        const mesh = new THREE.Mesh(geo, matFor(elementHex, false));
        mesh.position.x = halfWidth - rightW / 2;
        group.add(mesh);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, SEG_THICK * 1.05, MARBLE_SEG_LEN * 0.94), hazardStripeMat);
        stripe.position.x = gap.to;
        group.add(stripe);
      }
    }

    let crystalMesh = null;
    if (crystalX !== null) {
      crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
      crystalMesh.position.set(crystalX, 0.9, 0);
      group.add(crystalMesh);
    }

    segments.push({ zFront, group, halfWidth, tilt, gap, crystal: crystalX, crystalMesh, crystalTaken: false, passed: false, index: idx });
    nextSegIndex = idx + 1;
  }
  for (let i = 0; i < 12; i++) buildSegment(i);

  function recycleSegmentsBehind(ballZ) {
    while (segments.length && segments[0].zFront > ballZ + MARBLE_SEG_LEN * 3) {
      const old = segments.shift();
      scene.remove(old.group);
      old.group.traverse((n) => { if (n.isMesh && n.geometry !== crystalGeo) n.geometry.dispose(); });
    }
  }

  const leadInSeg = { halfWidth: MARBLE_TRACK_BASE_HALF, tilt: 0, gap: null };
  function segmentAt(z) {
    for (const s of segments) {
      if (z <= s.zFront && z > s.zFront - MARBLE_SEG_LEN) return s;
    }
    return leadInSeg;
  }

  // ---------- particles ----------
  const particles = [];
  const particleGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  function burst(pos, hex, count) {
    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(particleGeo, matFor(hex, true));
      p.position.copy(pos);
      scene.add(p);
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 3;
      particles.push({ mesh: p, vel: new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 3, Math.sin(a) * sp), life: 0.6, maxLife: 0.6 });
    }
  }

  // ---------- HUD ----------
  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute; left:12px; top:12px; z-index:6; display:flex; gap:10px; align-items:center; pointer-events:none; font-family:inherit;';
  hud.innerHTML = `<div id="mb-lives" style="font-size:16px; letter-spacing:2px; text-shadow:0 1px 3px rgba(0,0,0,0.6);">❤️❤️❤️</div>`;
  container.appendChild(hud);
  const livesEl = hud.querySelector('#mb-lives');

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute; inset:0; z-index:8; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:10px; background:rgba(8,6,20,0.72); color:#fff; text-align:center; padding:24px; display:none;';
  container.appendChild(overlay);

  // ---------- state ----------
  let lives = 3;
  let score = 0;
  let dead = false;
  let started = false;
  let forwardSpeed = 5.5;
  let velX = 0;
  // reportBest's onHint fires the shared .hint-text toast, which has no z-index and paints
  // after .game-mount in the DOM -- it renders on top of ANY overlay shown that frame. gameOver()
  // calls reportBest() synchronously right before showOverlay(), so a fresh best used to draw its
  // "New best!" toast smeared across the game-over card's own text. Capture the message instead
  // and fold it into the overlay HTML below (same fix shape as the mount-hint/overlay bug fixed
  // 2026-08-25).
  let pendingBestHint = null;
  const reportBest = makeBestTracker('marble', (msg) => { pendingBestHint = msg; });
  let shakeT = 0;
  let invulnT = 0;

  const GRAVITY_LATERAL = 6.2;
  const LATERAL_DAMP = 1.4;
  const STEER_SENS = 0.09;
  const MAX_VEL = 6.5;
  const CRYSTAL_CAPTURE_R = 0.55;

  function updateLives() { livesEl.textContent = '❤️'.repeat(Math.max(0, lives)) + '🖤'.repeat(Math.max(0, 3 - lives)); }
  updateLives();

  function showOverlay(html) { overlay.innerHTML = html; overlay.style.display = 'flex'; }
  function hideOverlay() { overlay.style.display = 'none'; }

  function startRun() { started = true; hideOverlay(); onHint(gt('hint_marble', '左右にドラッグしてバランスを取ろう！傾斜に流されないよう気をつけて')); }
  showOverlay(`<div style="font-size:34px;">🔮</div><div style="font-weight:800; font-size:17px;">${gt('marble_title', 'エレメント・マーブル')}</div><div style="font-size:13px; opacity:0.85; max-width:240px;">${gt('marble_intro', '左右にドラッグして傾斜の流れに逆らい、コースを転がり続けよう。結晶を集めるとボーナス！')}</div><div style="margin-top:6px; font-size:13px; opacity:0.7;">${gt('tap_to_start', 'タップでスタート')}</div>`);

  function gameOver() {
    dead = true;
    sfx.gameover();
    pendingBestHint = null;
    reportBest(score);
    const bestLine = pendingBestHint ? `<div style="font-size:13px; color:#ffd166; margin-top:2px;">${pendingBestHint}</div>` : '';
    showOverlay(`<div style="font-size:30px;">💥</div><div style="font-weight:800; font-size:18px;">${gt('score_label', 'スコア')}: ${score}</div>${bestLine}<div style="font-size:13px; opacity:0.75;">${gt('restart_hint', 'タップでリスタート')}</div>`);
  }

  function resetRun() {
    lives = 3; score = 0; dead = false; started = false; forwardSpeed = 5.5; velX = 0; invulnT = 0;
    onScore(0);
    updateLives();
    for (const s of segments) { scene.remove(s.group); s.group.traverse((n) => { if (n.isMesh && n.geometry !== crystalGeo) n.geometry.dispose(); }); }
    segments.length = 0;
    nextSegIndex = 0;
    for (let i = 0; i < 12; i++) buildSegment(i);
    ball.position.set(0, 0.5, 6.4);
    showOverlay(`<div style="font-size:34px;">🔮</div><div style="font-weight:800; font-size:17px;">${gt('marble_title', 'エレメント・マーブル')}</div><div style="font-size:13px; opacity:0.7;">${gt('tap_to_start', 'タップでスタート')}</div>`);
  }

  function onTap() {
    if (!started) { startRun(); return; }
    if (dead) { resetRun(); return; }
  }
  container.addEventListener('pointerdown', onTap);

  // ---------- drag-to-steer (whole-canvas drag; stopPropagation so it never fights the feed's
  // vertical swipe-to-next-game gesture, same guard makeDpad/makeJoystick/spiral use) ----------
  let dragId = null, lastX = 0;
  function onDown(e) {
    if (e.target.closest('button')) return;
    dragId = e.pointerId; lastX = e.clientX;
    e.stopPropagation();
  }
  function onMove(e) {
    if (e.pointerId !== dragId) return;
    e.stopPropagation();
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    velX = Math.max(-MAX_VEL, Math.min(MAX_VEL, velX + dx * STEER_SENS));
  }
  function onUp(e) { if (e.pointerId === dragId) { dragId = null; e.stopPropagation(); } }
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointercancel', onUp);

  function handleFall(kind) {
    if (invulnT > 0 || dead) return;
    lives -= 1; updateLives();
    invulnT = 1.1; shakeT = 0.25; velX = 0;
    sfx.bad(); flashEl(renderer.domElement, 140);
    burst(new THREE.Vector3(ball.position.x, ball.position.y, ball.position.z), kind === 'hazard' ? MARBLE_HAZARD_COLOR : 0xffffff, 12);
    if (lives <= 0) { gameOver(); return; }
    // forgiveness respawn: snap back to the centerline of the current segment rather than
    // ending the run outright, matching spiral's knockback-not-instant-death hazard handling
    ball.position.x = 0;
  }

  // ---------- main loop ----------
  const stop = loopRAF((dt, t) => {
    if (shakeT > 0) shakeT -= dt;
    if (invulnT > 0) invulnT -= dt;

    if (started && !dead) {
      ball.position.z -= forwardSpeed * dt;
      forwardSpeed = Math.min(12, forwardSpeed + dt * 0.12);

      const seg = segmentAt(ball.position.z);
      velX += marbleSlopeAccel(seg.tilt, GRAVITY_LATERAL) * dt;
      velX -= velX * LATERAL_DAMP * dt;
      velX = Math.max(-MAX_VEL, Math.min(MAX_VEL, velX));
      ball.position.x += velX * dt;
      ball.rotation.z -= velX * dt * 1.6;
      ball.rotation.x -= forwardSpeed * dt * 1.6;

      if (invulnT <= 0) {
        const state = marbleCheckBoundary(ball.position.x, seg.halfWidth, seg.gap);
        if (state !== 'ok') handleFall(state);
      }

      if (seg.crystal !== null && seg.crystal !== undefined && !seg.crystalTaken && Math.abs(ball.position.x - seg.crystal) < CRYSTAL_CAPTURE_R) {
        seg.crystalTaken = true;
        score += 5; onScore(score); sfx.win();
        onHint(gt('marble_crystal_bonus', '💎 結晶ゲット！+5'));
        if (seg.crystalMesh) { seg.crystalMesh.visible = false; }
        burst(new THREE.Vector3(ball.position.x, 0.9 + seg.group.position.y, seg.group.position.z), MARBLE_CRYSTAL_COLOR, 10);
      }

      for (const s of segments) {
        if (s.passed) continue;
        if (ball.position.z <= s.zFront - MARBLE_SEG_LEN) {
          s.passed = true;
          score += 1; onScore(score); sfx.score(Math.min(score, 8));
        }
      }

      if (nextSegIndex - segments[0].index < 40 && ball.position.z < segments[segments.length - 1].zFront + MARBLE_SEG_LEN * 6) {
        buildSegment(nextSegIndex);
      }
      recycleSegmentsBehind(ball.position.z);
    }

    for (const s of segments) {
      if (s.crystalMesh && s.crystalMesh.visible) s.crystalMesh.rotation.y = t * 0.002;
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vel.y -= 9 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.life -= dt;
      p.mesh.material.emissiveIntensity = Math.max(0, (p.life / p.maxLife)) * 0.8;
      p.mesh.scale.setScalar(Math.max(0.05, p.life / p.maxLife));
      if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); }
    }

    const shakeX = shakeT > 0 ? (Math.random() - 0.5) * 0.2 : 0;
    camera.position.set(ball.position.x * 0.35 + shakeX, ball.position.y + 3.4, ball.position.z + 6.2);
    camera.lookAt(ball.position.x * 0.5, ball.position.y, ball.position.z - 7);

    renderer.render(scene, camera);
  });

  return () => {
    stop();
    container.removeEventListener('pointerdown', onTap);
    renderer.domElement.removeEventListener('pointerdown', onDown);
    renderer.domElement.removeEventListener('pointermove', onMove);
    renderer.domElement.removeEventListener('pointerup', onUp);
    renderer.domElement.removeEventListener('pointercancel', onUp);
    hud.remove();
    overlay.remove();
    for (const p of particles) scene.remove(p.mesh);
    for (const s of segments) s.group.traverse((n) => { if (n.isMesh && n.geometry !== crystalGeo) n.geometry.dispose(); });
    crystalGeo.dispose(); particleGeo.dispose();
    for (const m of matCache.values()) m.dispose();
    ball.geometry.dispose(); ball.material.dispose();
    skyTex.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

window.mountMarble = mountMarble;
