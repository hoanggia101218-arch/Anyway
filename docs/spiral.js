// Anyway - エレメント・スパイラル (Element Spiral)
//
// Original vertical-first 3D descent game: a spirit ball falls forever down a tower of rotating
// elemental rings. The player drags left/right to rotate the WHOLE TOWER (the ball never moves in
// X/Z, only falls in Y) until the gap in the next ring lines up with the ball's fixed position.
// This is a genre riff (spiral-tower descent, familiar from several mobile hits) reimagined with
// Anyway's own 10-element cast, its own scoring/hazard rules, and its own art (no assets, no code,
// from any other game are reused) -- see the "作り直し" note in status.json task107 for the design
// rationale. Deliberately NOT a "land and stop" mechanic (that would need real rigid-body contact
// resolution against a rotating frame, which is a much harder physics problem); the ball always
// falls continuously, so a "miss" costs a life via animated knockback but the run keeps moving.
//
// Classic (non-module) three.js, same file:// reasoning as the rest of this app.

const ELEMENT_COLORS = [
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
const HAZARD_COLOR = 0xd63a3a;
const HAZARD_STRIPE = 0x2a1010;
const GATE_GLOW = 0xffe9a8;

function mountSpiral(container, { onScore, onHint }, config = {}) {
  container.style.position = 'relative';
  // Defensive fallback: if this mounts before the container has been laid out (rare timing edge
  // case -- e.g. a fast card swap), clientWidth/Height can briefly read 0, which would divide by
  // zero building the camera's aspect ratio. Fall back to the viewport size in that case.
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  // ---------- renderer / scene / camera ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Vertical gradient "descending through a chasm of light" sky, generated at runtime (no image
  // assets), same technique mountSkyDuel uses for its horizon.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 2; skyCanvas.height = 256;
  const skyCtx = skyCanvas.getContext('2d');
  const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 256);
  skyGrad.addColorStop(0, '#1c1440');
  skyGrad.addColorStop(0.5, '#3a2a6e');
  skyGrad.addColorStop(1, '#0b0a1a');
  skyCtx.fillStyle = skyGrad;
  skyCtx.fillRect(0, 0, 2, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0x120e2c, 18, 58);

  // Orthographic, not perspective: a perspective camera close enough to read individual ring
  // segments makes the nearest blocks balloon in size while far ones shrink, which reads as
  // visual clutter instead of a legible descending tower. Orthographic keeps every block the
  // same on-screen scale regardless of depth -- the standard choice for this genre (Helix Jump,
  // Stack Ball) and the fix for that clutter.
  const aspect = width / height;
  const VIEW_SIZE = 8.5;
  const camera = new THREE.OrthographicCamera(-VIEW_SIZE * aspect, VIEW_SIZE * aspect, VIEW_SIZE, -VIEW_SIZE, 0.1, 200);

  const hemi = new THREE.HemisphereLight(0xcfd0ff, 0x14102c, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.5);
  sun.position.set(6, 12, 8);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x6fa8ff, 0.5);
  fill.position.set(-8, -4, -6);
  scene.add(fill);

  // ---------- ball ----------
  const elementIdx = Math.floor(Math.random() * ELEMENT_COLORS.length);
  const ballColor = ELEMENT_COLORS[elementIdx];
  const BALL_R = 0.55;
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 20, 16),
    new THREE.MeshPhysicalMaterial({ color: ballColor, roughness: 0.25, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.2, emissive: ballColor, emissiveIntensity: 0.25 })
  );
  ball.position.set(0, 6, 0);
  scene.add(ball);
  const ballLight = new THREE.PointLight(ballColor, 1.2, 8);
  ball.add(ballLight);

  // ---------- central pole ----------
  const POLE_R = 0.5;
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(POLE_R, POLE_R, 4000, 12, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2a2740, roughness: 0.7, side: THREE.BackSide })
  );
  pole.position.y = -1980;
  scene.add(pole);

  // ---------- tower (rotates as one group; player input only ever changes tower.rotation.y) ----------
  const tower = new THREE.Group();
  scene.add(tower);

  const RING_R = 3.1;
  const SLICES = 8;
  const SLICE_ANGLE = (Math.PI * 2) / SLICES;
  const SEG_W = RING_R * SLICE_ANGLE * 0.86; // small gap between adjacent segments so slice edges read visually
  const SEG_H = 0.5;
  const SEG_D = 1.05;
  const RING_GAP_Y = 3.0;

  // task108 (MSI, 2026-08-23, user request): purely decorative -- a real twisting ribbon wound
  // around the tower so the silhouette actually reads as a *spiral* (matching this game's own
  // name) instead of Helix Jump's signature "plain stack of rotating discs" look. Deliberately
  // NOT touching ring/ball/collision code at all: the ball's fixed-X/Z-only-falls-in-Y design
  // (see file header) means giving the RINGS themselves a lateral spiral offset would need
  // reworking the gap-alignment math that assumes a fixed ball position under a purely-Y-rotating
  // tower -- too large a change to make safely without a way to verify it deep into actual
  // gameplay. This ribbon is a separate, non-interactive mesh riding along on `tower` (so it
  // still turns with player input, staying visually attached) that never intersects the ball.
  {
    const RIBBON_TURNS = 90, RIBBON_DEPTH = 900, RIBBON_R = RING_R + 0.35, RIBBON_POINTS = 720;
    const pts = [];
    for (let i = 0; i <= RIBBON_POINTS; i++) {
      const f = i / RIBBON_POINTS;
      const a = f * Math.PI * 2 * RIBBON_TURNS;
      pts.push(new THREE.Vector3(Math.cos(a) * RIBBON_R, -f * RIBBON_DEPTH, Math.sin(a) * RIBBON_R));
    }
    const ribbonCurve = new THREE.CatmullRomCurve3(pts);
    const ribbonGeo = new THREE.TubeGeometry(ribbonCurve, RIBBON_POINTS, 0.06, 5, false);
    const ribbonColors = new Float32Array((ribbonGeo.attributes.position.count) * 3);
    const tmpColor = new THREE.Color();
    for (let i = 0; i < ribbonGeo.attributes.position.count; i++) {
      const f = (i / ribbonGeo.attributes.position.count) * ELEMENT_COLORS.length;
      tmpColor.set(ELEMENT_COLORS[Math.floor(f) % ELEMENT_COLORS.length]);
      ribbonColors[i * 3] = tmpColor.r; ribbonColors[i * 3 + 1] = tmpColor.g; ribbonColors[i * 3 + 2] = tmpColor.b;
    }
    ribbonGeo.setAttribute('color', new THREE.BufferAttribute(ribbonColors, 3));
    const ribbonMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.35, metalness: 0.15, emissiveIntensity: 0.25,
      emissive: 0xffffff, transparent: true, opacity: 0.85,
    });
    const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
    ribbon.position.y = -RING_GAP_Y * 2;
    tower.add(ribbon);
  }

  const segGeo = new THREE.BoxGeometry(SEG_W, SEG_H, SEG_D);
  const gateGeo = new THREE.BoxGeometry(SEG_W, SEG_H * 1.15, SEG_D);
  const matCache = new Map();
  function matFor(hex, emissive) {
    const key = hex + ':' + (emissive ? 1 : 0);
    if (matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshStandardMaterial({
      color: hex, roughness: 0.5, metalness: 0.08,
      emissive: emissive ? hex : 0x000000, emissiveIntensity: emissive ? 0.55 : 0,
    });
    matCache.set(key, m);
    return m;
  }
  const hazardStripeMat = matFor(HAZARD_STRIPE, false);

  // difficulty curve: hazard density ramps with descent depth, capped so it never becomes unfair
  function hazardChanceFor(ringIndex) { return Math.min(0.42, 0.1 + ringIndex * 0.012); }
  function gateChanceFor(ringIndex) { return Math.max(0.05, 0.16 - ringIndex * 0.004); }

  // Each ring: { y, group, slices: [{type:'gap'|'platform'|'hazard'|'gate', mesh}], passed }
  const rings = [];
  let nextRingIndex = 0;

  function buildRing(ringIndex) {
    const y = -ringIndex * RING_GAP_Y - RING_GAP_Y * 2;
    const group = new THREE.Group();
    group.position.y = y;
    // each ring's own gap rotation offset -- keeps the descent path snaking left/right instead of
    // a single straight lane, which is what actually makes rotating the tower a real decision
    group.rotation.y = Math.random() * Math.PI * 2;
    tower.add(group);

    const slices = [];
    const hazardChance = hazardChanceFor(ringIndex);
    const gateChance = gateChanceFor(ringIndex);
    // guarantee at least one gap per ring so the ring is always solvable
    const guaranteedGapSlice = Math.floor(Math.random() * SLICES);
    for (let s = 0; s < SLICES; s++) {
      const angle = s * SLICE_ANGLE;
      let type;
      if (s === guaranteedGapSlice) type = 'gap';
      else {
        const r = Math.random();
        if (r < gateChance) type = 'gate';
        else if (r < gateChance + hazardChance) type = 'hazard';
        else type = 'platform';
      }
      let mesh = null;
      if (type !== 'gap') {
        const geo = type === 'gate' ? gateGeo : segGeo;
        const hex = type === 'hazard' ? HAZARD_COLOR : type === 'gate' ? GATE_GLOW : ELEMENT_COLORS[ringIndex % ELEMENT_COLORS.length];
        mesh = new THREE.Mesh(geo, matFor(hex, type === 'gate'));
        mesh.position.set(Math.cos(angle) * RING_R, 0, Math.sin(angle) * RING_R);
        mesh.rotation.y = -angle;
        group.add(mesh);
        if (type === 'hazard') {
          const stripe = new THREE.Mesh(new THREE.BoxGeometry(SEG_W * 0.94, SEG_H * 0.3, SEG_D * 1.02), hazardStripeMat);
          stripe.position.copy(mesh.position);
          stripe.rotation.y = mesh.rotation.y;
          group.add(stripe);
        }
      }
      slices.push({ type, mesh });
    }
    rings.push({ y, group, slices, passed: false, index: ringIndex });
    nextRingIndex = ringIndex + 1;
  }
  for (let i = 0; i < 10; i++) buildRing(i);

  function recycleRingsAbove(ballY) {
    // rings well above the ball are pure GC weight; drop the oldest once we're deep enough past it
    while (rings.length && rings[0].y > ballY + RING_GAP_Y * 3) {
      const old = rings.shift();
      tower.remove(old.group);
      old.group.traverse((n) => { if (n.isMesh && n.geometry !== segGeo && n.geometry !== gateGeo) n.geometry.dispose(); });
    }
  }

  // ---------- particles (small emissive cubes, consistent with the box-based art direction) ----------
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

  // ---------- HUD (DOM overlay, matches the rest of the app's convention) ----------
  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute; left:12px; top:12px; z-index:6; display:flex; gap:10px; align-items:center; pointer-events:none; font-family:inherit;';
  hud.innerHTML = `<div id="sp-lives" style="font-size:16px; letter-spacing:2px; text-shadow:0 1px 3px rgba(0,0,0,0.6);">❤️❤️❤️</div>`;
  container.appendChild(hud);
  const livesEl = hud.querySelector('#sp-lives');

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute; inset:0; z-index:8; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:10px; background:rgba(8,6,20,0.72); color:#fff; text-align:center; padding:24px; display:none;';
  container.appendChild(overlay);

  // ---------- state ----------
  let lives = 3;
  let score = 0;
  let dead = false;
  let started = false;
  let fallSpeed = 2.6;
  // See marble.js's reportBest comment: gameOver() calls reportBest() synchronously right
  // before showOverlay(), and the shared .hint-text toast (no z-index, paints after .game-mount)
  // would render on top of the game-over card. Capture the message and fold it into the overlay
  // HTML instead of letting it fire as a toast.
  let pendingBestHint = null;
  const reportBest = makeBestTracker('spiral', (msg) => { pendingBestHint = msg; });
  let shakeT = 0;
  let invulnT = 0;

  function updateLives() { livesEl.textContent = '❤️'.repeat(Math.max(0, lives)) + '🖤'.repeat(Math.max(0, 3 - lives)); }
  updateLives();

  function showOverlay(html) { overlay.innerHTML = html; overlay.style.display = 'flex'; }
  function hideOverlay() { overlay.style.display = 'none'; }

  function startRun() {
    started = true;
    hideOverlay();
    onHint(gt('hint_spiral', 'ドラッグでタワーを回して、隙間に落ちよう！属性ゲートを通るとボーナス'));
  }
  showOverlay(`<div style="font-size:34px;">🌀</div><div style="font-weight:800; font-size:17px;">${gt('spiral_title', 'エレメント・スパイラル')}</div><div style="font-size:13px; opacity:0.85; max-width:240px;">${gt('spiral_intro', 'ドラッグしてタワーを回し、隙間を狙って落ちよう。属性ゲート(光る段)を通るとボーナス！')}</div><div style="margin-top:6px; font-size:13px; opacity:0.7;">${gt('tap_to_start', 'タップでスタート')}</div>`);

  function gameOver() {
    dead = true;
    sfx.gameover();
    pendingBestHint = null;
    reportBest(score);
    const bestLine = pendingBestHint ? `<div style="font-size:13px; color:#ffd166; margin-top:2px;">${pendingBestHint}</div>` : '';
    showOverlay(`<div style="font-size:30px;">💥</div><div style="font-weight:800; font-size:18px;">${gt('score_label', 'スコア')}: ${score}</div>${bestLine}<div style="font-size:13px; opacity:0.75;">${gt('restart_hint', 'タップでリスタート')}</div>`);
  }

  function resetRun() {
    lives = 3; score = 0; dead = false; started = false; fallSpeed = 2.6; invulnT = 0;
    onScore(0);
    updateLives();
    for (const r of rings) { tower.remove(r.group); r.group.traverse((n) => { if (n.isMesh && n.geometry !== segGeo && n.geometry !== gateGeo) n.geometry.dispose(); }); }
    rings.length = 0;
    nextRingIndex = 0;
    for (let i = 0; i < 10; i++) buildRing(i);
    ball.position.set(0, 6, 0);
    tower.rotation.y = 0;
    showOverlay(`<div style="font-size:34px;">🌀</div><div style="font-weight:800; font-size:17px;">${gt('spiral_title', 'エレメント・スパイラル')}</div><div style="font-size:13px; opacity:0.7;">${gt('tap_to_start', 'タップでスタート')}</div>`);
  }

  function onTap() {
    if (!started) { startRun(); return; }
    if (dead) { resetRun(); return; }
  }
  container.addEventListener('pointerdown', onTap);

  // ---------- drag-to-rotate (whole-canvas drag; stopPropagation so it never fights the feed's
  // vertical swipe-to-next-game gesture, same guard makeDpad/makeJoystick use) ----------
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
    tower.rotation.y += dx * 0.012;
  }
  function onUp(e) { if (e.pointerId === dragId) { dragId = null; e.stopPropagation(); } }
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointercancel', onUp);

  // ---------- main loop ----------
  const stop = loopRAF((dt, t) => {
    if (shakeT > 0) shakeT -= dt;
    if (invulnT > 0) invulnT -= dt;

    if (started && !dead) {
      ball.position.y -= fallSpeed * dt;
      fallSpeed = Math.min(7.5, fallSpeed + dt * 0.045);

      // ring-crossing collision: check any ring whose y just got passed this frame
      for (const ring of rings) {
        if (ring.passed) continue;
        if (ball.position.y <= ring.y + SEG_H) {
          ring.passed = true;
          const ballAngleWorld = 0; // ball is always rendered at local (0,y,0); "world angle" of the fixed drop line
          const towerAngle = ((-tower.rotation.y % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          const ringLocalAngle = ((towerAngle - ring.group.rotation.y) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
          const sliceIdx = Math.floor(ringLocalAngle / SLICE_ANGLE) % SLICES;
          const slice = ring.slices[sliceIdx];
          const worldPos = new THREE.Vector3(0, ring.y, 0);
          if (slice.type === 'gap') {
            score += 1; onScore(score); sfx.score(Math.min(score, 8));
          } else if (slice.type === 'gate') {
            score += 5; onScore(score); sfx.win();
            burst(worldPos, GATE_GLOW, 14);
            onHint(gt('spiral_gate_bonus', '⚡ 属性ゲート！+5'));
          } else if (slice.type === 'hazard') {
            score += 1; onScore(score);
            if (invulnT <= 0) {
              lives -= 1; updateLives();
              invulnT = 1.1; shakeT = 0.25;
              sfx.bad(); flashEl(renderer.domElement, 140);
              burst(worldPos, HAZARD_COLOR, 12);
              if (lives <= 0) { gameOver(); }
            }
          } else { // platform: safe filler, small deflection only
            score += 1; onScore(score);
            burst(worldPos, ELEMENT_COLORS[ring.index % ELEMENT_COLORS.length], 5);
          }
        }
      }

      if (nextRingIndex - rings[0].index < 40 && ball.position.y < rings[rings.length - 1].y + RING_GAP_Y * 6) {
        buildRing(nextRingIndex);
      }
      recycleRingsAbove(ball.position.y);
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

    const shakeX = shakeT > 0 ? (Math.random() - 0.5) * 0.25 : 0;
    // Pulled back and aimed at a shallower angle than the first pass -- looking nearly straight
    // down the pole crammed every ring into one cluttered mass near the bottom of the frame.
    // A wider offset + a lookAt target well below the ball spreads the descending rings out
    // down the screen instead, which is what actually reads as "a tower receding into the depth".
    camera.position.set(shakeX, ball.position.y + 10, 10);
    camera.lookAt(0, ball.position.y - 3, 0);

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
    for (const r of rings) r.group.traverse((n) => { if (n.isMesh && n.geometry !== segGeo && n.geometry !== gateGeo) n.geometry.dispose(); });
    segGeo.dispose(); gateGeo.dispose(); particleGeo.dispose();
    for (const m of matCache.values()) m.dispose();
    pole.geometry.dispose(); pole.material.dispose();
    ball.geometry.dispose(); ball.material.dispose();
    skyTex.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

window.mountSpiral = mountSpiral;
