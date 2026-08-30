// Anyway - lightweight, safe, self-contained mini games.
// Every mount(container, {onScore, onHint}) returns a cleanup() function.
// No network calls, no eval, no external assets — pure canvas/DOM + JS.

// task55 Phase3 (2026-08-15, Toshiba): translate a per-game hint/UI string if i18n.js has it
// for the current language, otherwise fall back to the Japanese string that was always here.
// Each mount() runs fresh per card-activation, so unlike GAME_DEFS' title/genre (which need
// live re-application via I18N.onLangChange, see games.js bottom) these hints just need to
// read whatever the current language is at the moment a game actually mounts -- no listener
// needed, next mount naturally picks up any language change made in between.
function gt(key, fallback) {
  if (!window.I18N) return fallback;
  const v = window.I18N.t(key);
  return v === key ? fallback : v;
}

// task108 (MSI, 2026-08-23): canvas-drawn UI can't use CSS env()/calc(), so this reads the
// --safe-bottom custom property (style.css :root, itself `env(safe-area-inset-bottom, 0px)`)
// that DOM-positioned controls (.dpad etc.) already consume via calc(). Used by mountFort/
// mountSpiritShop so their own bottom-anchored rows clear #bottom-nav on real devices with a
// home-indicator safe area the same way the DOM controls now do (see style.css :root comment --
// found via a real iPhone screenshot; headless verification can't reproduce this since
// env(safe-area-inset-bottom) is always 0px with no device to emulate a safe area from).
function getSafeBottom() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom'));
  return Number.isFinite(v) ? v : 0;
}

function makeCanvas(container) {
  const c = document.createElement('canvas');
  c.width = container.clientWidth;
  c.height = container.clientHeight;
  container.appendChild(c);
  return c;
}

// Tap-only D-pad so directional games never compete with the feed's vertical swipe-to-next gesture.
function makeDpad(container, onPress) {
  const dpad = document.createElement('div');
  dpad.className = 'dpad';
  [['up', '▲'], ['left', '◀'], ['right', '▶'], ['down', '▼']].forEach(([key, label]) => {
    const b = document.createElement('button');
    b.className = key; b.textContent = label;
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); onPress(key); });
    dpad.appendChild(b);
  });
  container.appendChild(dpad);
  return dpad;
}

// Round drag-joystick for games with continuous (not grid-locked) movement.
// e.stopPropagation() on every pointer event, same guard makeDpad uses, so dragging the
// knob never gets read as the feed's vertical swipe-to-next-game gesture.
function makeJoystick(container, onMove) {
  const base = document.createElement('div');
  base.className = 'joystick-base';
  const knob = document.createElement('div');
  knob.className = 'joystick-knob';
  base.appendChild(knob);
  container.appendChild(base);

  const maxR = 30;
  let activeId = null;

  function update(clientX, clientY) {
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    let dx = clientX - cx, dy = clientY - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(dist, maxR);
    dx = (dx / dist) * clamped; dy = (dy / dist) * clamped;
    knob.style.transform = `translate(${dx - 24}px, ${dy - 24}px)`;
    onMove({ x: dx / maxR, y: dy / maxR });
  }
  function reset() {
    knob.style.transform = 'translate(-50%, -50%)';
    onMove({ x: 0, y: 0 });
  }

  base.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    activeId = e.pointerId;
    try { base.setPointerCapture(activeId); } catch (err) { /* best-effort */ }
    update(e.clientX, e.clientY);
  });
  base.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activeId) return;
    e.stopPropagation();
    update(e.clientX, e.clientY);
  });
  function onEnd(e) {
    if (e.pointerId !== activeId) return;
    e.stopPropagation();
    activeId = null;
    reset();
  }
  base.addEventListener('pointerup', onEnd);
  base.addEventListener('pointercancel', onEnd);

  return base;
}

function loopRAF(fn) {
  let last = performance.now();
  const id = setInterval(() => {
    const t = performance.now();
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    fn(dt, t);
  }, 16);
  return () => { clearInterval(id); };
}

// ---------- Shared "juice": synthesized SFX, combo streaks, personal-best callouts ----------
// Everything here is generated with the Web Audio API — no audio files, so games.js stays
// free of external assets. AudioContext is created lazily on first sound; every call site is
// already inside a user-gesture handler (tap), so autoplay restrictions don't apply.
let _actx = null;
function _audioCtx() {
  if (!_actx) { try { _actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { _actx = null; } }
  return _actx;
}
function beep(freq, dur = 0.09, type = 'sine', gain = 0.12) {
  const ctx = _audioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type; osc.frequency.value = freq;
  g.gain.value = gain;
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.connect(g); g.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + dur);
}
const sfx = {
  score: (comboLevel = 0) => beep(520 + Math.min(comboLevel, 10) * 40, 0.09, 'sine', 0.14),
  note: (freq) => beep(freq, 0.22, 'sine', 0.16),
  bad: () => beep(120, 0.18, 'sawtooth', 0.12),
  gameover: () => { beep(200, 0.22, 'sawtooth', 0.14); setTimeout(() => beep(140, 0.28, 'sawtooth', 0.12), 110); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.12, 'sine', 0.14), i * 90)); },
};

// Flashes a canvas/element brighter for a beat — cheap "hit stop" feedback with no new DOM.
// Tracks a per-element token so an overlapping call (e.g. a cascade merge landing mid-flash)
// extends the flash instead of getting its filter wiped early by the FIRST call's timeout --
// measured: without this, two flashEl() calls 30ms apart went dark at ~90ms instead of ~120ms,
// reading as a flicker/stutter rather than one sustained flash during dense combo cascades.
function flashEl(el, ms = 120) {
  el.style.filter = 'brightness(1.6) saturate(1.3)';
  const token = (el._flashToken = (el._flashToken || 0) + 1);
  setTimeout(() => { if (el._flashToken === token) el.style.filter = ''; }, ms);
}

// Quick CSS scale-pop on a DOM cell for a success moment — no new elements, just a transform pulse.
function popScale(el, scale = 1.2, ms = 220) {
  el.style.transition = `transform ${ms}ms cubic-bezier(.34,1.56,.64,1)`;
  el.style.transform = `scale(${scale})`;
  setTimeout(() => { el.style.transform = 'scale(1)'; }, ms);
}

// Quick left-right shake for a miss — mirrors popScale's success pulse so misses read as clearly
// as hits do, not just via the sfx.bad() beep.
function shakeEl(el, ms = 220) {
  el.style.transition = `transform ${ms}ms ease`;
  el.style.transform = 'translateX(-6px)';
  setTimeout(() => { el.style.transform = 'translateX(6px)'; }, ms * 0.33);
  setTimeout(() => { el.style.transform = 'translateX(0)'; }, ms * 0.66);
}

// Canvas particle burst — small dots flung outward and fading, for "success confetti" on a
// canvas game's own loopRAF. Caller owns the array; call spawnBurst() on a hit and drawBurst()
// every frame so particles keep animating even after the burst call returns.
function spawnBurst(list, x, y, color = '#fff', count = 12) {
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const speed = 90 + Math.random() * 140;
    list.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 0.5, maxLife: 0.5, color });
  }
}
function drawBurst(ctx, list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) { list.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt;
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// Consecutive-success streak: pitch rises with the streak, and every 3rd hit flashes a hint.
function makeCombo(resetMs = 1800) {
  let count = 0, lastT = 0;
  return {
    hit(onHint) {
      const now = performance.now();
      count = (now - lastT < resetMs) ? count + 1 : 1;
      lastT = now;
      sfx.score(count);
      if (onHint && count >= 3 && count % 3 === 0) onHint(gt('hint_combo_streak', '🔥 {n}連続！').replace('{n}', count));
      return count;
    },
    miss() { count = 0; sfx.bad(); },
    get() { return count; },
  };
}

// Per-device personal best (localStorage), announced once per play session via the hint line.
function getBest(id) { return Number(localStorage.getItem('anyway_best_' + id) || 0); }
function makeBestTracker(id, onHint) {
  let best = getBest(id), announced = false;
  return function report(score) {
    if (score > best) {
      best = score;
      localStorage.setItem('anyway_best_' + id, String(best));
      if (!announced) { announced = true; if (onHint) onHint(gt('hint_best_update', '🏆 自己ベスト更新！ {n}').replace('{n}', score)); }
    }
  };
}

// ---------- 2. Dodge (アクション) ----------
function mountDodge(container, { onScore, onHint }, config = {}) {
  const blockSpeed = config.blockSpeed ?? 180;
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  onHint(gt('hint_dodge', '画面の左右をタップ、またはA/Dキーで避けろ！'));
  let px = canvas.width / 2, pw = 44, ph = 44, speed = 320;
  let blocks = [], t = 0, score = 0, dead = false, dir = 0, spawnEvery = 0.9, spawnT = 0, burst = [];
  const reportBest = makeBestTracker('dodge', onHint);

  function reset() { px = canvas.width / 2; blocks = []; t = 0; score = 0; dead = false; spawnEvery = 0.9; burst = []; }
  reset();

  function keydown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') dir = -1;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') dir = 1;
  }
  function keyup(e) {
    if ((e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') && dir === -1) dir = 0;
    if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && dir === 1) dir = 0;
  }
  function pointerdown(e) {
    const x = (e.clientX ?? (e.touches && e.touches[0].clientX)) - canvas.getBoundingClientRect().left;
    dir = x < canvas.width / 2 ? -1 : 1;
  }
  function pointerup() { dir = 0; }
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  canvas.addEventListener('pointerdown', pointerdown);
  canvas.addEventListener('pointerup', pointerup);

  const stop = loopRAF((dt) => {
    if (dead) {
      if (t > 1) reset();
      t += dt;
    } else {
      t += dt;
      score = Math.floor(t * 10);
      onScore(score);
      px += dir * speed * dt;
      px = Math.max(pw / 2, Math.min(canvas.width - pw / 2, px));
      spawnT += dt;
      spawnEvery = Math.max(0.35, 0.9 - t * 0.01);
      if (spawnT > spawnEvery) {
        spawnT = 0;
        blocks.push({ x: Math.random() * (canvas.width - 30) + 15, y: -20, s: 40 + Math.random() * 30, vy: blockSpeed + t * 4 });
      }
      for (const b of blocks) b.y += b.vy * dt;
      blocks = blocks.filter(b => b.y < canvas.height + 40);
      const py = canvas.height - 130; // stay clear of the app's bottom-nav + side-action buttons
      for (const b of blocks) {
        const dx = Math.abs(b.x - px), dy = Math.abs(b.y - py);
        if (dx < (b.s + pw) / 2 - 6 && dy < (b.s + ph) / 2 - 6) {
          dead = true; t = 0;
          sfx.gameover(); flashEl(canvas); reportBest(score);
        } else if (!b.grazed && dy < (b.s + ph) / 2 + 4) {
          // Rewards a close call (block passes right by the player) with a small "phew" cue —
          // the game's only discrete "success" moment since scoring itself is continuous.
          b.grazed = true;
          sfx.score(0);
          spawnBurst(burst, px, py, '#4ea8ff', 6);
        }
      }
    }
    ctx.fillStyle = '#151530'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffb020';
    for (const b of blocks) ctx.fillRect(b.x - b.s / 2, b.y - b.s / 2, b.s, b.s);
    ctx.fillStyle = dead ? '#555' : '#4ea8ff';
    ctx.fillRect(px - pw / 2, canvas.height - 130 - ph / 2, pw, ph);
    drawBurst(ctx, burst, dt);
    if (dead) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(gt('memory_fail_retry', 'やられた…もう一回'), canvas.width / 2, canvas.height / 2);
    }
  });

  return () => {
    stop();
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    canvas.removeEventListener('pointerdown', pointerdown);
    canvas.removeEventListener('pointerup', pointerup);
    canvas.remove();
  };
}

// ---------- 3. Memory (記憶) ----------
function mountMemory(container, { onScore, onHint }, config = {}) {
  onHint(gt('hint_memory', '2枚めくってペアを揃えよう'));
  const wrap = document.createElement('div');
  wrap.className = 'grid-dom';
  wrap.style.gridTemplateColumns = 'repeat(4, 1fr)';
  wrap.style.width = 'min(90vw, 360px)';
  wrap.style.height = 'min(90vw, 360px)';
  container.appendChild(wrap);

  const symbols = (config.symbols && config.symbols.length === 8)
    ? config.symbols
    : ['🐱','🐶','🐼','🦊','🐸','🐵','🦁','🐯'];
  let score = 0, cells = [], flipped = [], lock = false;
  const combo = makeCombo();
  const reportBest = makeBestTracker('memory', onHint);

  function build() {
    wrap.innerHTML = '';
    const deck = [...symbols, ...symbols].sort(() => Math.random() - 0.5);
    cells = deck.map((sym, i) => {
      const el = document.createElement('div');
      el.className = 'dom-cell';
      el.style.background = '#2a2a2a';
      el.style.aspectRatio = '1';
      el.textContent = '';
      el.dataset.sym = sym;
      el.dataset.open = '0';
      el.addEventListener('pointerdown', () => flip(el));
      wrap.appendChild(el);
      return el;
    });
    flipped = [];
  }
  function flip(el) {
    if (lock || el.dataset.open === '1' || flipped.includes(el)) return;
    el.dataset.open = '1';
    el.textContent = el.dataset.sym;
    el.style.background = '#3a3a55';
    flipped.push(el);
    if (flipped.length === 2) {
      lock = true;
      setTimeout(() => {
        const [a, b] = flipped;
        if (a.dataset.sym === b.dataset.sym) {
          a.style.background = '#1f6f3f'; b.style.background = '#1f6f3f';
          popScale(a); popScale(b);
          score++; onScore(score);
          combo.hit(onHint);
          reportBest(score);
          if (cells.every(c => c.dataset.open === '1')) { sfx.win(); setTimeout(build, 600); }
        } else {
          a.dataset.open = '0'; b.dataset.open = '0';
          a.textContent = ''; b.textContent = '';
          a.style.background = '#2a2a2a'; b.style.background = '#2a2a2a';
          shakeEl(a); shakeEl(b);
          combo.miss();
        }
        flipped = []; lock = false;
      }, 550);
    }
  }
  build();

  return () => { wrap.remove(); };
}

// ---------- 6. Flap (アクション) ----------
// task108 (MSI, 2026-08-23, user request): was an unmistakable Flappy Bird reskin (plain green
// rectangle pipes, flat yellow circle bird) -- physics/scoring/difficulty-curve are untouched
// (same generic tap-to-flap mechanic every "flappy" clone shares, not the identifying part) but
// the obstacle shape changed from flat rectangles to jagged crystal spires (polygon path, see
// drawCrystalSpire below) and the bird to a glowing element orb (reuses the same radial-gradient
// "energy orb" look as mountMerge's drawOrb, for a consistent visual identity across the app
// rather than Flappy Bird's plain circle) that cycles through Anyway's own element colors.
function mountFlap(container, { onScore, onHint }, config = {}) {
  const gravity = config.gravity ?? 900;
  onHint(gt('hint_flap', 'タップで羽ばたいて結晶の尖塔を避けよう'));
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  let by, bv, pipes, score, dead, t, particles;
  const reportBest = makeBestTracker('flap', onHint);
  function birdColor() { return SPIRITSHOP_ELEMENTS[score % SPIRITSHOP_ELEMENTS.length].color; }
  function reset() {
    by = canvas.height / 2; bv = 0; pipes = []; score = 0; dead = false; t = 0; particles = [];
  }
  reset();
  function flap() {
    if (dead) { reset(); return; }
    bv = -320;
    spawnBurst(particles, bx, by + 10, birdColor(), 3);
  }
  canvas.addEventListener('pointerdown', flap);

  // Difficulty curve: gap narrows and pipes speed up gradually as score rises (each pipe keeps
  // the gap/speed it was spawned with, so on-screen pipes never change size mid-flight).
  const bx = canvas.width * 0.28, br = 16;
  let spawnT = 0;
  const stop = loopRAF((dt) => {
    if (!dead) {
      bv += gravity * dt; by += bv * dt;
      spawnT += dt;
      const spawnGap = Math.max(1.0, 1.5 - score * 0.02);
      if (spawnT > spawnGap) {
        spawnT = 0;
        const gy = 80 + Math.random() * (canvas.height - 260);
        const gap = Math.max(120, 170 - score * 2.5);
        const speed = Math.min(280, 160 + score * 4);
        pipes.push({ x: canvas.width + 30, gy, gap, speed, passed: false });
      }
      for (const p of pipes) p.x -= p.speed * dt;
      pipes = pipes.filter(p => p.x > -40);
      for (const p of pipes) {
        if (!p.passed && p.x < bx) {
          p.passed = true; score++; onScore(score); sfx.score(Math.min(score, 8));
          spawnBurst(particles, bx, by, '#ffd23f', 8);
        }
        if (p.x < bx + br + 20 && p.x > bx - br - 20) {
          if (by - br < p.gy || by + br > p.gy + p.gap) dead = true;
        }
      }
      if (by - br < 0 || by + br > canvas.height) dead = true;
      if (dead) { sfx.gameover(); flashEl(canvas); spawnBurst(particles, bx, by, '#ff4b4b', 16); reportBest(score); }
    }
    ctx.fillStyle = '#1a2a3a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Jagged crystal spire instead of a flat pipe rectangle: a zigzag outer edge (tip
    // protruding toward the gap) drawn as one filled polygon per spire.
    function drawSpire(x, topY, bottomY, growDown) {
      const w = 44, teeth = 4, toothH = (bottomY - topY) / teeth;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, growDown ? topY : bottomY);
      for (let i = 0; i <= teeth; i++) {
        const y = growDown ? topY + i * toothH : bottomY - i * toothH;
        const inset = (i % 2 === 1) ? w * 0.32 : 0;
        ctx.lineTo(x - w / 2 + inset, y);
      }
      for (let i = teeth; i >= 0; i--) {
        const y = growDown ? topY + i * toothH : bottomY - i * toothH;
        const inset = (i % 2 === 1) ? w * 0.32 : 0;
        ctx.lineTo(x + w / 2 - inset, y);
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      g.addColorStop(0, '#5b3fa8'); g.addColorStop(0.5, '#8a6fd9'); g.addColorStop(1, '#5b3fa8');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    for (const p of pipes) {
      drawSpire(p.x, 0, p.gy, true);
      drawSpire(p.x, p.gy + p.gap, canvas.height, false);
    }
    const orbColor = dead ? '#888' : birdColor();
    const og = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, br * 0.1, bx, by, br);
    og.addColorStop(0, '#ffffff'); og.addColorStop(0.4, orbColor); og.addColorStop(1, orbColor);
    ctx.beginPath(); ctx.fillStyle = og; ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    drawBurst(ctx, particles, dt);
    if (dead) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(gt('restart_hint', 'タップでリスタート'), canvas.width / 2, canvas.height / 2);
    }
  });

  return () => { stop(); canvas.removeEventListener('pointerdown', flap); canvas.remove(); };
}

// ---------- 10. Element Merge Grid (パズル) ----------
// task108 (MSI, 2026-08-23, user request): was a raw-number 4x4 grid (2/4/8/16...) -- visually
// unmistakable as 2048 (a genuinely open/generic mechanic with no active enforcement history,
// but "everyone would call this 2048" per the user, so worth the same treatment as the
// フルーツマージ->エレメント・フュージョン reskin). Merge logic/scoring is byte-for-byte
// unchanged (still internally tracks powers of 2) -- only the display swaps raw numbers for
// Anyway's own 10-element icon/color set (SPIRITSHOP_ELEMENTS, referenced at call time so its
// later declaration in this file is fine), tier = log2(value)-1 cycling through all 10 so a
// long game keeps producing a *different*-looking element rather than repeating icon-less
// numbers past tier 7 the way the old palette silently fell back to one fixed color for
// everything above 128.
function mountSlide(container, { onScore, onHint }) {
  onHint(gt('hint_slide', '下のボタンで同じ属性を合体させよう(上下スワイプは次のゲームへ移動します)'));
  const wrap = document.createElement('div');
  wrap.className = 'grid-dom';
  wrap.style.gridTemplateColumns = 'repeat(4, 1fr)';
  wrap.style.width = 'min(85vw, 320px)';
  wrap.style.height = 'min(85vw, 320px)';
  wrap.style.background = '#1a1a1a';
  container.appendChild(wrap);

  let grid, score, lastAdded, mergedCells;
  function tileFor(v) {
    if (!v) return null;
    const tier = Math.round(Math.log2(v)) - 1;
    return SPIRITSHOP_ELEMENTS[((tier % SPIRITSHOP_ELEMENTS.length) + SPIRITSHOP_ELEMENTS.length) % SPIRITSHOP_ELEMENTS.length];
  }
  const reportBest = makeBestTracker('slide', onHint);

  function reset() {
    grid = Array.from({ length: 4 }, () => Array(4).fill(0));
    score = 0; lastAdded = null; mergedCells = [];
    addTile(); addTile(); render();
  }
  function addTile() {
    const empty = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (!grid[y][x]) empty.push([x, y]);
    if (!empty.length) return;
    const [x, y] = empty[Math.floor(Math.random() * empty.length)];
    grid[y][x] = Math.random() < 0.9 ? 2 : 4;
    lastAdded = { x, y };
  }
  function render() {
    wrap.innerHTML = '';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const v = grid[y][x];
      const tile = tileFor(v);
      const el = document.createElement('div');
      el.className = 'dom-cell';
      el.style.aspectRatio = '1';
      el.style.background = tile ? tile.color : '#2a2a2a';
      el.style.fontSize = '22px'; el.style.fontWeight = '700';
      el.textContent = tile ? tile.icon : '';
      if (lastAdded && lastAdded.x === x && lastAdded.y === y) {
        el.style.transform = 'scale(0.3)'; el.style.opacity = '0';
        requestAnimationFrame(() => {
          el.style.transition = 'transform 0.18s ease-out, opacity 0.18s ease-out';
          el.style.transform = 'scale(1)'; el.style.opacity = '1';
        });
      } else if (mergedCells.some(p => p.x === x && p.y === y)) {
        popScale(el, 1.15);
      }
      wrap.appendChild(el);
    }
  }
  function slide(dir) {
    let moved = false, merged = false, mergedMax = 0;
    const newMerged = [];
    const range = [0, 1, 2, 3];
    const order = (dir === 'right' || dir === 'down') ? [...range].reverse() : range;
    function get(x, y) { return grid[y][x]; }
    function set(x, y, v) { grid[y][x] = v; }
    for (let i = 0; i < 4; i++) {
      let line = [];
      for (const j of order) {
        line.push(dir === 'left' || dir === 'right' ? get(j, i) : get(i, j));
      }
      let vals = line.filter(v => v);
      for (let k = 0; k < vals.length - 1; k++) {
        if (vals[k] === vals[k + 1]) {
          vals[k] *= 2; score += vals[k]; vals.splice(k + 1, 1);
          merged = true; mergedMax = Math.max(mergedMax, vals[k]);
          newMerged.push({ i, k });
        }
      }
      while (vals.length < 4) vals.push(0);
      for (let k = 0; k < 4; k++) {
        const j = order[k];
        const nv = vals[k];
        if (dir === 'left' || dir === 'right') { if (get(j, i) !== nv) moved = true; set(j, i, nv); }
        else { if (get(i, j) !== nv) moved = true; set(i, j, nv); }
      }
    }
    if (moved) {
      // Merge indices (i = line, k = compacted position) map to grid coords via order[k];
      // padding vals with trailing zeros never shifts an already-recorded k, so this stays valid.
      mergedCells = newMerged.map(({ i, k }) => {
        const j = order[k];
        return (dir === 'left' || dir === 'right') ? { x: j, y: i } : { x: i, y: j };
      });
      addTile(); onScore(score); render(); reportBest(score);
      if (merged) beep(300 + Math.log2(mergedMax) * 60, 0.1, 'sine', 0.14);
    } else {
      shakeEl(wrap);
    }
    const full = grid.every(row => row.every(v => v));
    if (full) { sfx.win(); setTimeout(reset, 800); }
  }
  reset();

  function keydown(e) {
    const map = {
      ArrowLeft: 'left', a: 'left', A: 'left',
      ArrowRight: 'right', d: 'right', D: 'right',
      ArrowUp: 'up', w: 'up', W: 'up',
      ArrowDown: 'down', s: 'down', S: 'down',
    };
    if (map[e.key]) { e.preventDefault(); slide(map[e.key]); }
  }
  window.addEventListener('keydown', keydown);
  const dpad = makeDpad(container, (key) => slide(key));

  return () => {
    window.removeEventListener('keydown', keydown);
    dpad.remove();
    wrap.remove();
  };
}

// ---------- 11. Stack Tower (タイミング) ----------
function mountStack(container, { onScore, onHint }, config = {}) {
  const speedStart = config.speedStart ?? 140;
  onHint(gt('hint_stack', 'タップでブロックを重ねよう。ぴったり合わせるほど高得点！'));
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  const layerH = 30;
  const reportBest = makeBestTracker('stack', onHint);
  const palette = ['#4ea8ff', '#31d158', '#ffd23f', '#ff8ad8', '#b06bff', '#ff9f4b'];
  let stack, moving, score, dead, camY, perfectStreak, particles = [];

  function spawnMoving() {
    const last = stack[stack.length - 1];
    const dir = Math.random() < 0.5 ? -1 : 1;
    moving = { x: dir < 0 ? canvas.width : -last.w, w: last.w, dir, speed: speedStart + score * 9, color: palette[stack.length % palette.length] };
  }
  function reset() {
    stack = [{ x: canvas.width / 2 - 60, w: 120, color: palette[0] }];
    score = 0; dead = false; camY = 0; perfectStreak = 0; particles = [];
    spawnMoving();
  }
  reset();

  function baseYFor(layerIdx) { return (canvas.height - 130) - (layerIdx * layerH) + camY; } // stay clear of the app's bottom-nav

  function drop() {
    if (dead) { reset(); return; }
    const last = stack[stack.length - 1];
    const left = Math.max(moving.x, last.x);
    const right = Math.min(moving.x + moving.w, last.x + last.w);
    const overlap = right - left;
    if (overlap <= 4) {
      dead = true; sfx.gameover(); flashEl(canvas); reportBest(score);
      spawnBurst(particles, moving.x + moving.w / 2, baseYFor(stack.length - 1), '#ff4b4b', 20);
      return;
    }
    const perfect = overlap >= last.w - 6;
    stack.push({ x: left, w: overlap, color: moving.color });
    score++; onScore(score);
    reportBest(score);
    const hitY = baseYFor(stack.length - 1);
    if (perfect) {
      perfectStreak++;
      sfx.score(perfectStreak);
      spawnBurst(particles, left + overlap / 2, hitY, moving.color, perfectStreak >= 3 ? 18 : 10);
      if (perfectStreak >= 3 && perfectStreak % 3 === 0) onHint(gt('hint_stack_perfect_streak', '🔥 {n}回連続ぴったり！').replace('{n}', perfectStreak));
    } else {
      perfectStreak = 0;
      beep(420, 0.07, 'sine', 0.1);
      spawnBurst(particles, left + overlap / 2, hitY, '#8892b0', 5);
    }
    const visibleLayers = Math.floor((canvas.height - 170) / layerH);
    if (stack.length > visibleLayers) camY = (stack.length - visibleLayers) * layerH;
    spawnMoving();
  }
  canvas.addEventListener('pointerdown', drop);

  const stop = loopRAF((dt) => {
    if (!dead) {
      moving.x += moving.dir * moving.speed * dt;
      if (moving.x <= -moving.w || moving.x >= canvas.width) moving.dir *= -1;
    }
    ctx.fillStyle = '#141425'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const baseY = canvas.height - 130;
    stack.forEach((b, i) => {
      const y = baseY - (i * layerH) + camY;
      if (y < -layerH || y > canvas.height) return;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, y, b.w, layerH - 2);
    });
    if (!dead) {
      const movingY = baseY - (stack.length * layerH) + camY;
      ctx.fillStyle = moving.color;
      ctx.fillRect(moving.x, movingY, moving.w, layerH - 2);
    }
    drawBurst(ctx, particles, dt);
    if (dead) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(gt('restart_hint', 'タップでリスタート'), canvas.width / 2, canvas.height / 2);
    }
  });

  return () => { stop(); canvas.removeEventListener('pointerdown', drop); canvas.remove(); };
}

// ---------- 12. Aim Timing (タイミング) ----------
function mountAim(container, { onScore, onHint }, config = {}) {
  const startSpeed = config.startSpeed ?? 220;
  onHint(gt('hint_aim', 'マーカーが緑の枠に来た瞬間にタップ！外すとライフが減るよ'));
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  const reportBest = makeBestTracker('aim', onHint);
  const combo = makeCombo();
  const maxLives = 3;
  let pos, dir, speed, score, zoneStart, zoneW, barW, barX, lives, dead, particles = [];

  function newZone() {
    zoneW = Math.max(24, 90 - score * 5);
    zoneStart = Math.random() * (barW - zoneW);
  }
  function reset() {
    score = 0; pos = 0; dir = 1; speed = startSpeed; lives = maxLives; dead = false; particles = [];
    barW = canvas.width * 0.8; barX = canvas.width * 0.1;
    newZone();
  }
  reset();

  function tap() {
    if (dead) { reset(); return; }
    const barY = canvas.height / 2 - 4;
    if (pos >= zoneStart && pos <= zoneStart + zoneW) {
      score++; onScore(score);
      combo.hit(onHint);
      reportBest(score);
      speed += 18;
      spawnBurst(particles, barX + pos, barY, '#31d158', 12);
    } else {
      combo.miss();
      flashEl(canvas);
      spawnBurst(particles, barX + pos, barY, '#ff4b4b', 8);
      lives--;
      if (lives <= 0) {
        dead = true; sfx.gameover(); reportBest(score);
        return;
      }
    }
    newZone();
  }
  canvas.addEventListener('pointerdown', tap);

  const stop = loopRAF((dt) => {
    if (!dead) {
      pos += dir * speed * dt;
      if (pos < 0) { pos = 0; dir = 1; }
      if (pos > barW) { pos = barW; dir = -1; }
    }
    ctx.fillStyle = '#141425'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const barY = canvas.height / 2 - 4;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(barX, barY, barW, 8);
    ctx.fillStyle = '#31d158';
    ctx.fillRect(barX + zoneStart, barY - 6, zoneW, 20);
    if (!dead) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(barX + pos - 2, barY - 14, 4, 36);
    }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(dead ? gt('restart_hint', 'タップでリスタート') : 'タップでストップ！', canvas.width / 2, barY - 40);
    for (let i = 0; i < maxLives; i++) {
      ctx.fillStyle = i < lives ? '#ff4b4b' : 'rgba(255,255,255,0.2)';
      ctx.beginPath(); ctx.arc(barX + 10 + i * 22, barY + 40, 7, 0, Math.PI * 2); ctx.fill();
    }
    drawBurst(ctx, particles, dt);
  });

  return () => { stop(); canvas.removeEventListener('pointerdown', tap); canvas.remove(); };
}

// ---------- 15. Element Fusion (パズル) ----------
// task108 (MSI, 2026-08-23, user request): was themed with the exact fruit set + progression
// order (cherry/strawberry/grape/orange/apple/pear/peach/watermelon) that makes Suika Game
// instantly recognizable -- "everyone would call this a Suika clone" per the user's own words.
// Physics/tiers/scoring are untouched (still 8 tiers, same rf progression, same drop-and-merge
// loop -- that generic mechanic predates Suika Game itself and isn't the identifying signature),
// only the *visual identity* changed: 8 of Anyway's own 10 elements (SPIRITSHOP_ELEMENTS' own
// icon/color pairs, reused for consistency with spiritshop rather than inventing a second
// palette) rendered as glowing orbs (radial-gradient fill, see render loop below) instead of
// flat-filled fruit circles -- reads as "energy crystal fusion", not "fruit merge".
const MERGE_FRUITS = [
  { emoji: '🔥', color: '#e6551a', rf: 0.048 },
  { emoji: '💧', color: '#0288d1', rf: 0.062 },
  { emoji: '⚡', color: '#e6a800', rf: 0.078 },
  { emoji: '🌪️', color: '#4c9a2a', rf: 0.096 },
  { emoji: '🪨', color: '#6b7a3c', rf: 0.116 },
  { emoji: '❄️', color: '#3d94c2', rf: 0.138 },
  { emoji: '✨', color: '#d9a53a', rf: 0.162 },
  { emoji: '🌑', color: '#4a2a80', rf: 0.19 },
];
function mountMerge(container, { onScore, onHint }, config = {}) {
  onHint(gt('hint_merge', 'ドラッグで位置を決めて指を離すと落下。同じ属性のエレメントをくっつけて融合させよう！'));
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  const reportBest = makeBestTracker('merge', onHint);
  const combo = makeCombo(1200);
  const wallX = 10;
  const floorY = canvas.height - 130; // stay clear of the app's bottom-nav + side-action buttons
  const overLineY = canvas.height * 0.16;
  const dropY = canvas.height * 0.09;
  const autoDropAfter = config.autoDropAfter ?? 3.2;
  const gravity = 980;

  let bodies, score, dead, particles, dragging, activeTier, nextTier, activeX, dropTimer, overTimer, popText;
  function radiusFor(tier) { return Math.max(10, canvas.width * MERGE_FRUITS[tier].rf); }
  function pickTier() {
    const maxTier = Math.min(2 + Math.floor(score / 40), 5);
    const weights = [];
    for (let t = 0; t <= maxTier; t++) weights.push(Math.pow(0.62, t));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let t = 0; t <= maxTier; t++) { r -= weights[t]; if (r <= 0) return t; }
    return 0;
  }
  function reset() {
    bodies = []; score = 0; dead = false; particles = []; dragging = false;
    overTimer = 0; dropTimer = 0; popText = [];
    activeTier = pickTier(); nextTier = pickTier();
    activeX = canvas.width / 2;
    onScore(score); // otherwise the score badge keeps showing the previous run's final score until the first merge
  }
  reset();

  function clampActiveX() {
    const r = radiusFor(activeTier);
    activeX = Math.max(wallX + r, Math.min(canvas.width - wallX - r, activeX));
  }
  function dropActive() {
    if (dead || !bodies) return;
    const r = radiusFor(activeTier);
    bodies.push({ x: activeX, y: dropY + r, vx: 0, vy: 40, r, tier: activeTier });
    activeTier = nextTier; nextTier = pickTier(); dropTimer = 0; clampActiveX();
  }
  function pointerX(e) {
    const rect = canvas.getBoundingClientRect();
    return (e.clientX ?? (e.touches && e.touches[0].clientX)) - rect.left;
  }
  function pointerdown(e) {
    if (dead) { reset(); return; }
    dragging = true;
    activeX = pointerX(e); clampActiveX();
  }
  function pointermove(e) {
    if (!dragging) return;
    activeX = pointerX(e); clampActiveX();
  }
  function pointerup() {
    if (!dragging) return;
    dragging = false;
    dropActive();
  }
  canvas.addEventListener('pointerdown', pointerdown);
  canvas.addEventListener('pointermove', pointermove);
  canvas.addEventListener('pointerup', pointerup);
  canvas.addEventListener('pointercancel', pointerup);

  // During a dense cascade, several merges can land within a few pixels of each other -- their
  // popText labels spawn near their own (x,y) and drift by the same -t*40, so if two spawn
  // anywhere within their shared ~0.8s lifetime they stay visually stacked the whole time
  // (measured: thousands of overlapping render pairs in a headless stress test). `popText` only
  // ever holds still-alive entries (dead ones are spliced during render), so checking against
  // all of them -- not just very-fresh ones -- is what actually prevents that stacking.
  function spawnPopText(x, y, text) {
    let px = x;
    // Push clear of any conflicting label and re-scan from the top, since moving past one can
    // land on top of another -- a single top-to-bottom pass can't guarantee that (verified via
    // headless test: a flat one-shot offset still left some labels 4px apart). The guard caps
    // worst-case iterations; if it's ever hit the label still renders, just not perfectly spread.
    for (let guard = 0; guard < 20; guard++) {
      // Compare against each existing label's CURRENT (already-drifted) y, not its spawn y --
      // an older label has drifted up by p.t*40 already, so a raw-spawn-y comparison understates
      // how close it actually renders to a brand-new label spawning nearby a moment later.
      const conflict = popText.find(p => Math.abs((p.y - p.t * 40) - y) < 16 && Math.abs(p.x - px) < 22);
      if (!conflict) break;
      px = conflict.x + 22;
    }
    popText.push({ x: px, y, t: 0, text });
  }

  // Takes body OBJECT REFERENCES (not array indices) so it stays correct no matter what else
  // has already been spliced out of `bodies` this pass -- see the pass loop below for why.
  function mergeAt(a, b) {
    const newTier = a.tier + 1;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const combo_n = combo.hit(onHint);
    if (newTier >= MERGE_FRUITS.length) {
      score += 40; onScore(score); reportBest(score);
      sfx.win();
      spawnBurst(particles, mx, my, '#ffd23f', 24);
      spawnPopText(mx, my, '🎉 MEGA!');
    } else {
      score += (newTier + 1) * 4; onScore(score); reportBest(score);
      spawnBurst(particles, mx, my, MERGE_FRUITS[newTier].color, 10 + newTier * 2);
      spawnPopText(mx, my, `+${(newTier + 1) * 4}`);
      bodies.push({ x: mx, y: my, vx: 0, vy: -60, r: radiusFor(newTier), tier: newTier });
    }
    bodies.splice(bodies.indexOf(a), 1);
    bodies.splice(bodies.indexOf(b), 1);
    if (combo_n >= 2) flashEl(canvas, 90);
  }

  const stop = loopRAF((dt) => {
    if (!dead) {
      dropTimer += dt;
      if (dropTimer > autoDropAfter && !dragging) dropActive();

      for (const bd of bodies) {
        bd.vy += gravity * dt;
        bd.x += bd.vx * dt; bd.y += bd.vy * dt;
        if (bd.x - bd.r < wallX) { bd.x = wallX + bd.r; bd.vx *= -0.25; }
        if (bd.x + bd.r > canvas.width - wallX) { bd.x = canvas.width - wallX - bd.r; bd.vx *= -0.25; }
        if (bd.y + bd.r > floorY) { bd.y = floorY - bd.r; bd.vy = 0; bd.vx *= 0.85; }
      }
      // A few relaxation passes keep overlapping circles from tunneling through each other;
      // merges are collected first and applied after the pass so splice indices stay valid.
      for (let pass = 0; pass < 3; pass++) {
        const merges = [];
        for (let i = 0; i < bodies.length; i++) {
          for (let j = i + 1; j < bodies.length; j++) {
            const a = bodies[i], b = bodies[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 0.001;
            const minDist = a.r + b.r;
            if (dist < minDist) {
              if (a.tier === b.tier && !merges.some(m => m.includes(i) || m.includes(j))) {
                merges.push([i, j]);
              } else {
                const overlap = (minDist - dist) / 2;
                const nx = dx / dist, ny = dy / dist;
                a.x -= nx * overlap; a.y -= ny * overlap;
                b.x += nx * overlap; b.y += ny * overlap;
                a.vx -= nx * 8; b.vx += nx * 8;
              }
            }
          }
        }
        // Resolve indices to object refs up front, before any splicing happens -- mergeAt()
        // itself removes by reference, so once resolved these stay correct through the whole
        // forEach even after an earlier merge in this pass has shrunk/reindexed `bodies`.
        if (merges.length) { merges.map(([i, j]) => [bodies[i], bodies[j]]).forEach(([a, b]) => mergeAt(a, b)); }
        else break;
      }

      let overNow = false;
      for (const bd of bodies) { if (bd.y - bd.r < overLineY && Math.abs(bd.vy) < 40) overNow = true; }
      overTimer = overNow ? overTimer + dt : Math.max(0, overTimer - dt * 2);
      if (overTimer > 1.1) {
        dead = true; sfx.gameover(); flashEl(canvas); reportBest(score);
      }
    }

    ctx.fillStyle = '#1a2440'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Danger telegraph: the over-line was a static faint dash regardless of how close a pile
    // sat to triggering game over, so death always landed as a surprise with no warning beat.
    // Now it reddens/pulses/fills in step with overTimer (0..1.1s) so a rising pile gives the
    // player a fair, escalating signal before it's fatal.
    const dangerT = Math.min(1, overTimer / 1.1);
    const pulse = dangerT > 0.3 ? 0.6 + 0.4 * Math.sin(performance.now() / 110) : 1;
    if (dangerT > 0) {
      ctx.fillStyle = `rgba(255,60,60,${dangerT * 0.18 * pulse})`;
      ctx.fillRect(wallX, 0, canvas.width - wallX * 2, overLineY);
    }
    ctx.strokeStyle = dangerT > 0
      ? `rgba(255,${Math.round(90 - 70 * dangerT)},${Math.round(90 - 70 * dangerT)},${(0.35 + 0.5 * dangerT) * pulse})`
      : 'rgba(255,255,255,0.15)';
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(wallX, overLineY); ctx.lineTo(canvas.width - wallX, overLineY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = dangerT > 0 ? `rgba(255,80,80,${(0.4 + 0.5 * dangerT) * pulse})` : 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(wallX, overLineY, canvas.width - wallX * 2, floorY - overLineY);

    // task108 (MSI, 2026-08-23): radial-gradient glow instead of a flat-filled circle -- reads
    // as a crystal/energy orb, not a cartoon fruit (see MERGE_FRUITS comment above for why).
    // Local darken helper (not reused from map-editor.js's shadeColor -- separate file/scope).
    function darken(hex, amt) {
      const n = parseInt(hex.slice(1), 16);
      const r = Math.max(0, ((n >> 16) & 255) * (1 + amt));
      const g2 = Math.max(0, ((n >> 8) & 255) * (1 + amt));
      const b = Math.max(0, (n & 255) * (1 + amt));
      return `rgb(${r | 0},${g2 | 0},${b | 0})`;
    }
    function drawOrb(x, y, r, color) {
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, color); g.addColorStop(1, darken(color, -0.3));
      ctx.beginPath(); ctx.fillStyle = g; ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = Math.max(1, r * 0.06); ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const bd of bodies) {
      const f = MERGE_FRUITS[bd.tier];
      drawOrb(bd.x, bd.y, bd.r, f.color);
      ctx.font = `${Math.round(bd.r * 1.1)}px sans-serif`;
      ctx.fillText(f.emoji, bd.x, bd.y + bd.r * 0.05);
    }

    if (!dead) {
      const r = radiusFor(activeTier);
      ctx.globalAlpha = 0.9;
      drawOrb(activeX, dropY + r, r, MERGE_FRUITS[activeTier].color);
      ctx.font = `${Math.round(r * 1.1)}px sans-serif`;
      ctx.fillText(MERGE_FRUITS[activeTier].emoji, activeX, dropY + r + r * 0.05);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(activeX, dropY + r * 2); ctx.lineTo(activeX, floorY); ctx.stroke();
      ctx.setLineDash([]);

      // Auto-drop telegraph: while undragged, the fruit used to fall on its own after
      // autoDropAfter with zero warning -- a hidden timer, so idle players got surprised by a
      // drop they never asked for. This ring fills in around the fruit as the timer approaches
      // firing, and pulses orange in the last quarter, so the drop always has a visible cue first.
      if (!dragging) {
        const dropFrac = Math.min(1, dropTimer / autoDropAfter);
        if (dropFrac > 0.05) {
          const ringR = r + 7;
          const urgent = dropFrac > 0.75;
          const pulse = urgent ? 0.55 + 0.45 * Math.sin(performance.now() / 90) : 1;
          ctx.strokeStyle = urgent ? `rgba(255,140,60,${0.55 + 0.4 * pulse})` : 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(activeX, dropY + r, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * dropFrac);
          ctx.stroke();
        }
      }

      // Card chrome (.overlay-top: search button + genre tag) sits at top:16px, right:16px,
      // reaching roughly to y=48 on screen -- drawing this canvas-native "NEXT" indicator at
      // y=16 (its original position) put it directly behind/through that pill, unreadable
      // wherever they overlapped. Starting at y=66 clears it with margin.
      ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('NEXT', canvas.width - wallX - 22, 66);
      const nr = Math.min(16, radiusFor(nextTier) * 0.55);
      drawOrb(canvas.width - wallX - 22, 90, nr, MERGE_FRUITS[nextTier].color);
      ctx.font = `${Math.round(nr * 1.3)}px sans-serif`; ctx.fillStyle = '#fff';
      ctx.fillText(MERGE_FRUITS[nextTier].emoji, canvas.width - wallX - 22, 90 + nr * 0.05);
    }

    for (let i = popText.length - 1; i >= 0; i--) {
      const p = popText[i]; p.t += dt;
      if (p.t > 0.8) { popText.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, 1 - p.t / 0.8);
      ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 16px sans-serif';
      ctx.fillText(p.text, p.x, p.y - p.t * 40);
      ctx.globalAlpha = 1;
    }
    drawBurst(ctx, particles, dt);

    if (dead) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif';
      ctx.fillText(gt('game_over', 'ゲームオーバー'), canvas.width / 2, canvas.height / 2 - 16);
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(gt('restart_hint', 'タップでリスタート'), canvas.width / 2, canvas.height / 2 + 14);
    }
  });

  return () => {
    stop();
    canvas.removeEventListener('pointerdown', pointerdown);
    canvas.removeEventListener('pointermove', pointermove);
    canvas.removeEventListener('pointerup', pointerup);
    canvas.removeEventListener('pointercancel', pointerup);
    canvas.remove();
  };
}

// ---------- 16. My Maze (アクション, ユーザーが自分でグリッドを描いて作る2Dコース) ----------
// The drawing tool itself lives in maze-editor.js (window.MazeEditor.mount, reached from the
// "+" create flow's first card) -- this is only the *play* side, mounted like any other
// GAME_DEFS entry once a course has been posted. Cell encoding (0 empty/1 wall/2 hazard/3
// start/4 goal) is shared with the editor via window.MAZE_CELL below so the two files agree
// on what a layout means without a load-order dependency in either direction (maze-editor.js
// loads after games.js and reads window.MAZE_CELL; it never needs games.js's other helpers,
// and games.js never needs anything from maze-editor.js).
const MAZE_CELL = { EMPTY: 0, WALL: 1, HAZARD: 2, START: 3, GOAL: 4 };
window.MAZE_CELL = MAZE_CELL;

function mazeIdx(cols, x, y) { return y * cols + x; }
function mazeFindCell(layout, type) {
  const i = layout.cells.indexOf(type);
  if (i === -1) return null;
  return { x: i % layout.cols, y: Math.floor(i / layout.cols) };
}
// Used both as the play-mode fallback (a post saved with no/corrupt layout) and as the
// editor's freshly-opened starting grid, so a brand new course is postable immediately.
function mazeDefaultLayout() {
  const cols = 9, rows = 13;
  const cells = new Array(cols * rows).fill(MAZE_CELL.EMPTY);
  cells[mazeIdx(cols, 1, 1)] = MAZE_CELL.START;
  cells[mazeIdx(cols, cols - 2, rows - 2)] = MAZE_CELL.GOAL;
  return { cols, rows, cells };
}
window.mazeDefaultLayout = mazeDefaultLayout;

function mountMyMaze(container, { onScore, onHint }, config = {}) {
  const layout = (config && config.layout && config.layout.cells && config.layout.cells.length === config.layout.cols * config.layout.rows)
    ? config.layout : mazeDefaultLayout();
  const cols = layout.cols, rows = layout.rows, cells = layout.cells;
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');

  const cell = Math.max(10, Math.floor(Math.min(canvas.width / cols, canvas.height / rows)));
  const offX = (canvas.width - cell * cols) / 2;
  const offY = (canvas.height - cell * rows) / 2;
  const startCell = mazeFindCell(layout, MAZE_CELL.START) || { x: 0, y: 0 };
  const goalCell = mazeFindCell(layout, MAZE_CELL.GOAL) || { x: cols - 1, y: rows - 1 };
  const CELL_COLORS = {
    [MAZE_CELL.EMPTY]: '#20222a', [MAZE_CELL.WALL]: '#5a5f6e', [MAZE_CELL.HAZARD]: '#a83232',
    [MAZE_CELL.START]: '#31d158', [MAZE_CELL.GOAL]: '#ffd23f',
  };

  let px = startCell.x, py = startCell.y, lives = 3, score = 0, dead = false, shakeT = 0, burst = [];
  const combo = makeCombo();
  const reportBest = makeBestTracker('mymaze', onHint);
  onHint(gt('hint_mymaze', '矢印キー/下のパッドでゴール🏁を目指せ！壁は通れない、危険マスでライフが減る'));

  function isWall(x, y) { return x < 0 || y < 0 || x >= cols || y >= rows || cells[mazeIdx(cols, x, y)] === MAZE_CELL.WALL; }
  function isHazard(x, y) { return x >= 0 && y >= 0 && x < cols && y < rows && cells[mazeIdx(cols, x, y)] === MAZE_CELL.HAZARD; }
  function respawn() { px = startCell.x; py = startCell.y; }
  function resetGame() { lives = 3; score = 0; dead = false; respawn(); }

  function tryMove(dx, dy) {
    if (dead) { resetGame(); return; }
    const nx = px + dx, ny = py + dy;
    if (isWall(nx, ny)) { shakeT = 0.15; sfx.bad(); return; }
    px = nx; py = ny;
    if (isHazard(px, py)) {
      lives -= 1;
      combo.miss();
      spawnBurst(burst, offX + px * cell + cell / 2, offY + py * cell + cell / 2, '#ff4b4b', 14);
      if (lives <= 0) { dead = true; sfx.gameover(); onHint(gt('restart_hint', gt('restart_hint', 'タップでリスタート'))); }
      else respawn();
      return;
    }
    if (px === goalCell.x && py === goalCell.y) {
      score += 1; onScore(score);
      combo.hit(onHint);
      reportBest(score);
      spawnBurst(burst, offX + px * cell + cell / 2, offY + py * cell + cell / 2, '#ffd23f', 18);
      sfx.win();
      respawn();
    }
  }

  const dpad = makeDpad(container, (key) => {
    if (key === 'up') tryMove(0, -1);
    else if (key === 'down') tryMove(0, 1);
    else if (key === 'left') tryMove(-1, 0);
    else if (key === 'right') tryMove(1, 0);
  });
  function onKey(e) {
    if (e.key === 'ArrowUp' || e.key === 'w') tryMove(0, -1);
    else if (e.key === 'ArrowDown' || e.key === 's') tryMove(0, 1);
    else if (e.key === 'ArrowLeft' || e.key === 'a') tryMove(-1, 0);
    else if (e.key === 'ArrowRight' || e.key === 'd') tryMove(1, 0);
  }
  window.addEventListener('keydown', onKey);
  function onTap() { if (dead) resetGame(); }
  canvas.addEventListener('pointerdown', onTap);

  const stop = loopRAF((dt) => {
    if (shakeT > 0) shakeT -= dt;
    const jitter = shakeT > 0 ? (Math.random() - 0.5) * 6 : 0;
    ctx.fillStyle = '#14151a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(jitter, 0);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        ctx.fillStyle = CELL_COLORS[cells[mazeIdx(cols, x, y)]] ?? CELL_COLORS[MAZE_CELL.EMPTY];
        ctx.fillRect(offX + x * cell, offY + y * cell, cell - 1, cell - 1);
      }
    }
    ctx.fillStyle = dead ? 'rgba(255,255,255,0.3)' : '#4ea8ff';
    ctx.beginPath();
    ctx.arc(offX + px * cell + cell / 2, offY + py * cell + cell / 2, cell * 0.32, 0, Math.PI * 2);
    ctx.fill();
    drawBurst(ctx, burst, dt);
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('❤️'.repeat(Math.max(0, lives)), 8, 40);
    if (dead) {
      ctx.textAlign = 'center'; ctx.font = 'bold 16px sans-serif';
      ctx.fillText(gt('restart_hint', 'タップでリスタート'), canvas.width / 2, canvas.height / 2);
    }
  });

  return () => {
    stop();
    window.removeEventListener('keydown', onKey);
    canvas.removeEventListener('pointerdown', onTap);
    dpad.remove();
    canvas.remove();
  };
}

// ---------- 17. Fill It All (パズル, 自作オリジナル) ----------
// Grid-covering snake puzzle: step one cell per input (no auto-scroll/timer, unlike Snake),
// paint every cell of the room without crossing your own trail. Clearing the room advances to
// a bigger one; touching the trail/a wall ends the run. Own design/implementation — not a copy
// of any third-party game's code or art, just the same "cover the board without crossing
// yourself" puzzle idea classic to grid-snake games.
// task98 (2026-08-20): 3000 hand-generated, solver-verified levels (tier 1-40, Toshiba/PC-C,
// see output_contrib/Toshiba/fillitall_levels/) loaded from fillitall_levels_data.js as a plain
// <script> global (window.FILLITALL_LEVELS_RAW), not fetch() -- this file's own header promises
// "No network calls... pure canvas/DOM + JS", and index.html loads via file:// as well as
// http(s) where fetch() of a local file is CORS-blocked outright. Each entry is a compact tuple
// [tier, difficultyCode, cols, rows, start, obstacles, cells] to keep the bundle small; expanded
// once here into objects instead of decoding the tuple shape at every level start.
const FILLITALL_LEVELS = (() => {
  const raw = window.FILLITALL_LEVELS_RAW;
  if (!Array.isArray(raw)) return null;
  const names = window.FILLITALL_DIFFICULTY_NAMES || ['easy', 'normal', 'hard', 'expert', 'master'];
  return raw.map(([tier, diffCode, cols, rows, start, obstacles, cells]) => ({
    tier, difficulty: names[diffCode] || '?', cols, rows, start, obstacles, cells,
  }));
})();

function mountFillItAll(container, { onScore, onHint }, config = {}) {
  onHint(gt('hint_fillitall', '下のボタン(WASD/矢印キーもOK)で1マスずつ進み、部屋のマスを全部ぬろう。自分の跡に触れたら終了！自分の跡以外の壁マスは通れないよ'));
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  // HUD_H must clear the app's own fixed-position overlays (#user-bar top:12-48px,
  // .score-badge top:56-~84px, see style.css) -- it used to be 46px, which left the
  // canvas-drawn "Lv.X n/m"/"Tier..." lines below drawn right underneath/behind those
  // pills instead of below them. 130px clears both with margin.
  const BASE_CELL = 26, MIN_CELL = 12, MAX_CELL = 34, PAD = 4, HUD_H = 130;
  // Fallback board size for the endless procedural mode once all 3000 curated levels are
  // cleared -- unchanged from the original fixed-grid behavior.
  const baseCols = Math.max(4, Math.floor(canvas.width / BASE_CELL));
  const baseRows = Math.max(4, Math.floor(canvas.height / BASE_CELL));
  const reportBest = makeBestTracker('fillitall', onHint);

  let level = 1, filled, trail, head, score = 0, dead = false, particles = [], levelCells = 0, transitioning = false;
  let curCols = baseCols, curRows = baseRows, cell = BASE_CELL, offsetX = 0, offsetY = HUD_H;
  let obstacles = new Set(), curTier = null, curDifficulty = null;

  function levelSize() {
    // Grows the covered target each level, capped at the full board so later (procedural)
    // levels stay beatable within the fixed canvas grid rather than needing an ever-bigger board.
    return Math.min(curCols * curRows, 8 + level * 4);
  }

  function layoutBoard() {
    cell = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(Math.min(
      (canvas.width - PAD * 2) / curCols,
      (canvas.height - HUD_H - PAD * 2) / curRows
    ))));
    offsetX = Math.floor((canvas.width - curCols * cell) / 2);
    offsetY = HUD_H + Math.floor((canvas.height - HUD_H - curRows * cell) / 2);
  }

  function startLevel() {
    filled = new Set();
    trail = [];
    const data = FILLITALL_LEVELS;
    if (data && level <= data.length) {
      const lv = data[level - 1];
      curCols = lv.cols; curRows = lv.rows;
      obstacles = new Set(lv.obstacles.map(([x, y]) => y * curCols + x));
      levelCells = lv.cells;
      curTier = lv.tier; curDifficulty = lv.difficulty;
      head = { x: lv.start[0], y: lv.start[1] };
    } else {
      // Endless mode: 3000 curated levels cleared, keep going with the original random growth.
      curCols = baseCols; curRows = baseRows;
      obstacles = new Set();
      curTier = null; curDifficulty = null;
      levelCells = levelSize();
      head = { x: Math.floor(Math.random() * curCols), y: Math.floor(Math.random() * curRows) };
    }
    layoutBoard();
    trail.push(head);
    filled.add(head.y * curCols + head.x);
    dead = false;
  }
  startLevel();

  const dirMap = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  function step(d) {
    if (dead || !d || transitioning) return;
    const nx = head.x + d.x, ny = head.y + d.y;
    // Bumping the room's edge or a level's built-in obstacle wall is just a blocked move (this
    // is a bounded puzzle room, not a hazard) — only crossing your own trail actually ends the
    // run, matching the original "尻尾が頭に追いつくとゲームオーバー" self-collision rule.
    if (nx < 0 || ny < 0 || nx >= curCols || ny >= curRows) { shakeEl(canvas); return; }
    const idx = ny * curCols + nx;
    if (obstacles.has(idx)) { shakeEl(canvas); return; }
    if (filled.has(idx)) {
      dead = true;
      sfx.gameover(); flashEl(canvas); shakeEl(canvas);
      reportBest(score);
      return;
    }
    head = { x: nx, y: ny };
    trail.push(head);
    filled.add(idx);
    score++; onScore(score);
    reportBest(score);
    spawnBurst(particles, offsetX + nx * cell + cell / 2, offsetY + ny * cell + cell / 2, '#31d158', 6);
    sfx.score(Math.min(3, level));
    if (filled.size >= levelCells) {
      sfx.win();
      score += 10; onScore(score);
      level++;
      // Guard against the 320ms celebration pause: without this, extra input arriving before
      // startLevel() actually resets `filled`/`levelCells` would re-satisfy the same
      // filled.size >= levelCells check on every further move and stack the +10 bonus
      // repeatedly for a single level clear.
      transitioning = true;
      setTimeout(() => { startLevel(); transitioning = false; }, 320);
    }
  }
  function keydown(e) {
    const key = {
      ArrowUp: 'up', w: 'up', W: 'up',
      ArrowDown: 'down', s: 'down', S: 'down',
      ArrowLeft: 'left', a: 'left', A: 'left',
      ArrowRight: 'right', d: 'right', D: 'right',
    }[e.key];
    if (key) step(dirMap[key]);
  }
  window.addEventListener('keydown', keydown);
  const dpad = makeDpad(container, (key) => step(dirMap[key]));
  function tapCanvas() {
    if (dead) { level = 1; score = 0; onScore(score); startLevel(); }
  }
  canvas.addEventListener('pointerdown', tapCanvas);

  const DIFF_COLOR = { easy: '#31d158', normal: '#3fa7ff', hard: '#ffd23f', expert: '#ff9f3f', master: '#ff5a5a' };
  const stop = loopRAF((dt) => {
    ctx.fillStyle = '#101418'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let x = 0; x <= curCols; x++) { ctx.beginPath(); ctx.moveTo(offsetX + x * cell, offsetY); ctx.lineTo(offsetX + x * cell, offsetY + curRows * cell); ctx.stroke(); }
    for (let y = 0; y <= curRows; y++) { ctx.beginPath(); ctx.moveTo(offsetX, offsetY + y * cell); ctx.lineTo(offsetX + curCols * cell, offsetY + y * cell); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    for (const idx of obstacles) {
      const ox = idx % curCols, oy = (idx - ox) / curCols;
      ctx.fillRect(offsetX + ox * cell + 1, offsetY + oy * cell + 1, cell - 2, cell - 2);
    }
    ctx.fillStyle = '#3fa7ff';
    for (const p of trail) ctx.fillRect(offsetX + p.x * cell + 1, offsetY + p.y * cell + 1, cell - 2, cell - 2);
    ctx.fillStyle = dead ? '#777' : '#ffd23f';
    ctx.fillRect(offsetX + head.x * cell + 1, offsetY + head.y * cell + 1, cell - 2, cell - 2);
    drawBurst(ctx, particles, dt);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`Lv.${level}  ${filled.size}/${levelCells}`, 8, 100);
    if (curTier) {
      ctx.fillStyle = DIFF_COLOR[curDifficulty] || '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`Tier ${curTier} ・ ${gt('diff_' + curDifficulty, curDifficulty)}`, 8, 118);
    }
    if (dead) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(gt('restart_hint_button', 'タップ/ボタンでリスタート'), canvas.width / 2, canvas.height / 2);
    }
  });

  return () => {
    stop();
    window.removeEventListener('keydown', keydown);
    canvas.removeEventListener('pointerdown', tapCanvas);
    dpad.remove();
    canvas.remove();
  };
}

// ---------- 18. Sky Duel (3D空戦, 自作オリジナル) ----------
// User request (2026-08-14): an original 3D air-combat game, after seeing a video of an AI
// building an impressive one. Only the video's title was fetchable (not its transcript/prompts),
// so this is built fresh from this project's own established Three.js patterns (see
// spirit-models.js's scene/renderer/animate setup) rather than referencing that video's actual
// content. Classic (non-module) THREE + OrbitControls + GLTFLoader are already loaded globally
// by index.html for the character gallery/map editor; this reuses that same global THREE
// instead of adding a new dependency. All geometry is procedural primitives (boxes/cones/
// cylinders), matching how every other character/prop in this codebase is built — no new
// external model/asset files.
function buildJet(color, scale = 1) {
  // Second pass (2026-08-15, after user feedback that the first version looked low-quality):
  // more hull segments, swept trapezoidal wings (two angled panels per side instead of one flat
  // rectangle), a canopy with actual frame ribs, intakes, wingtip nav lights, a ventral fin, and
  // an afterburner ring -- still 100% procedural primitives, no external model files, just a lot
  // more of them arranged with more attention to real jet proportions.
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x14141a, roughness: 0.55, metalness: 0.4 });
  const panelMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.75), roughness: 0.4, metalness: 0.5 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.08, metalness: 0.7, emissive: 0x2a5a7a, emissiveIntensity: 0.35 });

  // Fuselage built from two tapered cylinder segments (front narrows to the nose, rear narrows
  // to the tailpipe) instead of one uniform taper -- reads as a real aircraft cross-section
  // rather than a simple cone-to-cone blend.
  const front = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 1.5, 10), bodyMat);
  front.rotation.x = Math.PI / 2;
  front.position.z = -0.65;
  g.add(front);
  const rear = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 1.3, 10), panelMat);
  rear.rotation.x = Math.PI / 2;
  rear.position.z = 0.75;
  g.add(rear);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 10), darkMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -1.75;
  g.add(nose);

  // Canopy: glass bubble plus a couple of thin frame ribs across it for a "real cockpit" read.
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), glassMat);
  cockpit.position.set(0, 0.32, -0.55);
  cockpit.scale.set(0.95, 0.85, 1.5);
  g.add(cockpit);
  for (const dz of [-0.9, -0.55, -0.2]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 0.06), darkMat);
    rib.position.set(0, 0.5, dz);
    g.add(rib);
  }

  // Intakes: small boxes flanking the front fuselage.
  for (const side of [-1, 1]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.55), darkMat);
    intake.position.set(side * 0.42, -0.08, -0.35);
    g.add(intake);
  }

  // Swept wings: a wide root panel plus a narrower, further-back tip panel per side, so the
  // silhouette tapers and sweeps instead of reading as one flat rectangle.
  for (const side of [-1, 1]) {
    const root = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.07, 1.15), bodyMat);
    root.position.set(side * 0.85, -0.05, 0.25);
    root.rotation.z = side * -0.05;
    g.add(root);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.06, 0.65), panelMat);
    tip.position.set(side * 1.75, -0.06, 0.62);
    tip.rotation.y = side * 0.32;
    tip.rotation.z = side * -0.05;
    g.add(tip);
    const navLight = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6),
      new THREE.MeshStandardMaterial({ color: side < 0 ? 0xff3b3b : 0x3bff6a, emissive: side < 0 ? 0xff3b3b : 0x3bff6a, emissiveIntensity: 1.2 }));
    navLight.position.set(side * 2.3, -0.06, 0.85);
    g.add(navLight);
  }

  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.55), bodyMat);
  tailWing.position.set(0, 0.05, 1.2);
  g.add(tailWing);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.85), darkMat);
  fin.position.set(0, 0.45, 1.2);
  fin.rotation.x = -0.12;
  g.add(fin);
  const ventralFin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.5), darkMat);
  ventralFin.position.set(0, -0.32, 1.15);
  g.add(ventralFin);

  const engineGeo = new THREE.CylinderGeometry(0.17, 0.21, 0.5, 8);
  const engineMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.4, metalness: 0.7 });
  const afterburnerMat = new THREE.MeshStandardMaterial({ color: 0xff6a2b, emissive: 0xff6a2b, emissiveIntensity: 0.9 });
  for (const side of [-1, 1]) {
    const engine = new THREE.Mesh(engineGeo, engineMat);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side * 0.32, -0.06, 1.35);
    g.add(engine);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 6, 10), afterburnerMat);
    ring.position.set(side * 0.32, -0.06, 1.6);
    g.add(ring);
  }

  g.scale.setScalar(scale);
  g.userData.hitRadius = 1.5 * scale;
  return g;
}

function disposeObject3D(obj) {
  obj.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
  });
}

function mountSkyDuel(container, { onScore, onHint }, config = {}) {
  onHint(gt('hint_skyduel', 'ジョイスティックで操縦、自動で発射！敵を撃墜してスコアを稼ごう。右下ボタンでブースト'));
  container.style.position = 'relative';
  const width = container.clientWidth, height = container.clientHeight;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Golden-hour gradient sky as a tiny generated canvas texture, not an image asset -- keeps
  // the "zero external files, everything built at runtime" approach used everywhere else in
  // this file, while giving the horizon some atmosphere instead of a single flat sky color.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 2; skyCanvas.height = 256;
  const skyCtx = skyCanvas.getContext('2d');
  const skyGrad = skyCtx.createLinearGradient(0, 0, 0, 256);
  skyGrad.addColorStop(0, '#4a7fd6');
  skyGrad.addColorStop(0.55, '#a9c9e8');
  skyGrad.addColorStop(0.78, '#ffcf9a');
  skyGrad.addColorStop(1, '#ff9a6b');
  skyCtx.fillStyle = skyGrad;
  skyCtx.fillRect(0, 0, 2, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  scene.background = skyTex;
  const fogColor = 0xffc79a;
  scene.fog = new THREE.Fog(fogColor, 60, 260);

  const camera = new THREE.PerspectiveCamera(62, width / height, 0.1, 1000);
  const baseFov = 62;

  const hemi = new THREE.HemisphereLight(0xffe8c8, 0x2a4a6a, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
  sun.position.set(40, 60, -30);
  scene.add(sun);
  // Cool blue fill from the opposite side so the shadowed side of the jet doesn't go flat black
  // -- cheap two-light setup instead of true GI, but reads much less "flat" than hemi+sun alone.
  const fill = new THREE.DirectionalLight(0x6fa8ff, 0.6);
  fill.position.set(-30, 20, 40);
  scene.add(fill);

  // Animated ocean via a vertex-displacement ShaderMaterial (two overlapping sine waves,
  // sampled per-vertex) instead of a flat ground plane or a texture asset -- same "procedural
  // shader water" approach the reference video used to get a lot of visual mileage for free.
  const oceanMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColorDeep: { value: new THREE.Color(0x0f4a68) }, uColorShallow: { value: new THREE.Color(0x3fa0c0) } },
    vertexShader: `
      uniform float uTime;
      varying float vHeight;
      void main() {
        vec3 pos = position;
        float h = sin(pos.x * 0.045 + uTime * 0.7) * 1.6 + sin(pos.y * 0.03 - uTime * 0.5) * 1.3;
        pos.z += h;
        vHeight = h;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColorDeep;
      uniform vec3 uColorShallow;
      varying float vHeight;
      void main() {
        float t = clamp(vHeight * 0.3 + 0.5, 0.0, 1.0);
        gl_FragColor = vec4(mix(uColorDeep, uColorShallow, t), 1.0);
      }
    `,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 80, 80), oceanMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -40;
  scene.add(ground);

  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.85 });
  const clouds = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const cluster = new THREE.Group();
    const puffs = 2 + Math.floor(Math.random() * 3);
    for (let j = 0; j < puffs; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(3 + Math.random() * 2.5, 7, 6), cloudMat);
      puff.position.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 4);
      cluster.add(puff);
    }
    cluster.position.set((Math.random() - 0.5) * 500, 10 + Math.random() * 70, (Math.random() - 0.5) * 500);
    clouds.add(cluster);
  }
  scene.add(clouds);

  const player = buildJet(0x3fa7ff, 1);
  player.rotation.order = 'YXZ';
  player.position.set(0, 20, 0);
  scene.add(player);

  let pitch = 0, roll = 0, pitchTarget = 0, rollTarget = 0, yaw = 0;
  let speed = 26, boosting = false;
  let fovPulse = 0; // brief FOV widen on a kill, decays each frame -- cheap "impact" punch
  let score = 0, health = 5, dead = false, gameOverAt = 0;
  const maxHealth = 5;
  const reportBest = makeBestTracker('skyduel', onHint);

  const bulletGeo = new THREE.SphereGeometry(0.1, 6, 6);
  const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffe15a });
  const enemyBulletMat = new THREE.MeshBasicMaterial({ color: 0xff4b4b });
  let bullets = []; // { mesh, vel, owner: 'player'|'enemy' }
  let enemies = []; // { group, spawnT, fireT }
  let particles = []; // { mesh, vel, life, maxLife }

  const particleGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  function explode(pos, color) {
    const mat = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(particleGeo, mat);
      mesh.position.copy(pos);
      scene.add(mesh);
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI;
      const spd = 6 + Math.random() * 10;
      particles.push({
        mesh,
        vel: new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)).multiplyScalar(spd),
        life: 0.6, maxLife: 0.6,
      });
    }
  }

  // Wingtip vapor: small white puffs shed from both wingtips while banking hard, fading fast.
  // Cheap (reuses the same particle list/geometry style as explosions) but reads as "hard
  // turn" the way condensation vapor does on a real fighter under high-G maneuvers.
  const vaporMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
  const vaporGeo = new THREE.SphereGeometry(0.16, 5, 4);
  let vaporAcc = 0;
  function emitVapor(dt) {
    const bank = Math.abs(roll);
    if (bank < 0.55) return;
    vaporAcc += dt * (bank - 0.55) * 18;
    while (vaporAcc >= 1) {
      vaporAcc -= 1;
      for (const side of [-1.55, 1.55]) {
        const local = new THREE.Vector3(side, -0.05, 0.3);
        const world = local.applyMatrix4(player.matrixWorld);
        const mesh = new THREE.Mesh(vaporGeo, vaporMat);
        mesh.position.copy(world);
        scene.add(mesh);
        particles.push({ mesh, vel: new THREE.Vector3(0, -0.3, 0), life: 0.5, maxLife: 0.5 });
      }
    }
  }

  function spawnEnemy() {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(player.quaternion);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(player.quaternion);
    const ahead = player.position.clone()
      .add(forward.multiplyScalar(70 + Math.random() * 40))
      .add(side.multiplyScalar((Math.random() - 0.5) * 60))
      .add(new THREE.Vector3(0, (Math.random() - 0.5) * 24, 0));
    const jet = buildJet(0xff4b4b, 1);
    jet.position.copy(ahead);
    jet.lookAt(player.position);
    scene.add(jet);
    enemies.push({ group: jet, fireT: 1 + Math.random() * 2 });
  }

  let spawnTimer = 1.5;
  const joystick = makeJoystick(container, ({ x, y }) => {
    rollTarget = x * 0.9;
    pitchTarget = -y * 0.6;
  });
  const boostBtn = document.createElement('button');
  boostBtn.className = 'skyduel-boost-btn';
  boostBtn.textContent = '🚀';
  boostBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); boosting = true; });
  boostBtn.addEventListener('pointerup', (e) => { e.stopPropagation(); boosting = false; });
  boostBtn.addEventListener('pointercancel', () => { boosting = false; });
  container.appendChild(boostBtn);

  const missileAmmoEl_ref = { el: null };
  const missileBtn = document.createElement('button');
  missileBtn.className = 'skyduel-missile-btn';
  missileBtn.textContent = '🎯';
  missileBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); fireMissile(); });
  container.appendChild(missileBtn);

  const hud = document.createElement('div');
  hud.className = 'skyduel-hud';
  hud.innerHTML = `<div class="skyduel-score">0</div><div class="skyduel-health"><div class="skyduel-health-fill"></div></div><div class="skyduel-ammo">🎯 4</div>`;
  container.appendChild(hud);
  const scoreEl = hud.querySelector('.skyduel-score');
  const healthFillEl = hud.querySelector('.skyduel-health-fill');
  missileAmmoEl_ref.el = hud.querySelector('.skyduel-ammo');

  const reticle = document.createElement('div');
  reticle.className = 'skyduel-reticle';
  reticle.innerHTML = '<div class="skyduel-reticle-h"></div><div class="skyduel-reticle-v"></div>';
  container.appendChild(reticle);

  const overlay = document.createElement('div');
  overlay.className = 'skyduel-overlay hidden';
  overlay.textContent = gt('restart_hint', 'タップでリスタート');
  container.appendChild(overlay);

  function resetRun() {
    for (const b of bullets) { scene.remove(b.mesh); }
    bullets = [];
    for (const en of enemies) { scene.remove(en.group); disposeObject3D(en.group); }
    enemies = [];
    player.position.set(0, 20, 0);
    pitch = 0; roll = 0; yaw = 0; pitchTarget = 0; rollTarget = 0;
    player.rotation.set(0, 0, 0);
    speed = 26;
    score = 0; health = maxHealth; dead = false;
    scoreEl.textContent = '0';
    healthFillEl.style.width = '100%';
    overlay.classList.add('hidden');
    spawnTimer = 1.5;
  }

  function takeDamage() {
    health = Math.max(0, health - 1);
    healthFillEl.style.width = (health / maxHealth * 100) + '%';
    flashEl(container, 160);
    sfx.bad();
    if (health <= 0 && !dead) {
      dead = true;
      gameOverAt = performance.now();
      explode(player.position, 0xffb020);
      sfx.gameover();
      reportBest(score);
      setTimeout(() => overlay.classList.remove('hidden'), 400);
    }
  }

  function fireBullet(from, quat, owner) {
    const mesh = new THREE.Mesh(bulletGeo, owner === 'player' ? bulletMat : enemyBulletMat);
    mesh.position.copy(from);
    scene.add(mesh);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    bullets.push({ mesh, vel: dir.multiplyScalar(owner === 'player' ? 110 : 60), owner, life: 3 });
  }

  // Missile: a second, stronger weapon alongside the auto-firing gun -- limited ammo (slowly
  // regenerates), only launches while the reticle has a lock, and homes in on its target by
  // steering its velocity toward the target each frame instead of flying a straight line.
  const missileGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6);
  const missileMat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.4, metalness: 0.5 });
  let missiles = []; // { mesh, vel, target, life }
  let missileAmmo = 4, missileRegenT = 0;
  let lockedEnemy = null;

  function findLockTarget() {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(player.quaternion);
    let best = null, bestDot = 0.94; // ~20 degree cone
    for (const en of enemies) {
      const toEnemy = en.group.position.clone().sub(player.position);
      const dist = toEnemy.length();
      if (dist > 140 || dist < 0.01) continue;
      toEnemy.normalize();
      const dot = fwd.dot(toEnemy);
      if (dot > bestDot) { bestDot = dot; best = en; }
    }
    return best;
  }

  function fireMissile() {
    if (missileAmmo <= 0 || !lockedEnemy || dead) { sfx.bad(); return; }
    missileAmmo--;
    updateMissileAmmoUI();
    const mesh = new THREE.Mesh(missileGeo, missileMat);
    mesh.position.copy(player.position).add(new THREE.Vector3(0.9, -0.1, -1).applyQuaternion(player.quaternion));
    mesh.quaternion.copy(player.quaternion);
    scene.add(mesh);
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(player.quaternion);
    missiles.push({ mesh, vel: dir.multiplyScalar(50), target: lockedEnemy, life: 4 });
    sfx.note(880);
  }

  function updateMissileAmmoUI() {
    if (missileAmmoEl_ref.el) missileAmmoEl_ref.el.textContent = '🎯 ' + missileAmmo;
  }

  let playerFireTimer = 0;

  function onTap() {
    if (dead && performance.now() - gameOverAt > 350) resetRun();
  }
  container.addEventListener('pointerdown', onTap);

  const clock = { last: performance.now() };
  const stop = loopRAF((dt) => {
    if (!dead) {
      // Arcade bank-turn flight model: roll/pitch ease toward joystick targets, yaw derives
      // from the current bank angle (rolling right gradually turns the nose right), and the
      // plane always moves forward along its own local -Z axis -- simpler and far more
      // controllable on touch than full free-flight physics.
      roll += (rollTarget - roll) * Math.min(1, dt * 5);
      pitch += (pitchTarget - pitch) * Math.min(1, dt * 5);
      yaw -= roll * 0.8 * dt;
      player.rotation.set(pitch, yaw, roll);
      const targetSpeed = boosting ? 46 : 26;
      speed += (targetSpeed - speed) * Math.min(1, dt * 2);
      player.translateZ(-speed * dt);
      if (player.position.y < -30) { player.position.y = -30; takeDamage(); }
      if (player.position.y > 140) player.position.y = 140;
      emitVapor(dt);

      playerFireTimer -= dt;
      if (playerFireTimer <= 0) {
        playerFireTimer = 0.22;
        const nosePos = player.position.clone().add(new THREE.Vector3(0, 0, -1.8).applyQuaternion(player.quaternion));
        fireBullet(nosePos, player.quaternion, 'player');
      }

      spawnTimer -= dt;
      const maxEnemies = Math.min(6, 2 + Math.floor(score / 4));
      if (spawnTimer <= 0 && enemies.length < maxEnemies) {
        spawnTimer = Math.max(0.6, 1.8 - score * 0.03);
        spawnEnemy();
      }

      lockedEnemy = findLockTarget();
      reticle.classList.toggle('locked', !!lockedEnemy);

      if (missileAmmo < 4) {
        missileRegenT -= dt;
        if (missileRegenT <= 0) { missileRegenT = 6; missileAmmo++; updateMissileAmmoUI(); }
      }

      for (let i = enemies.length - 1; i >= 0; i--) {
        const en = enemies[i];
        const toPlayer = player.position.clone().sub(en.group.position);
        const dist = toPlayer.length();
        if (dist > 220) {
          scene.remove(en.group); disposeObject3D(en.group); enemies.splice(i, 1);
          for (const m of missiles) if (m.target === en) m.target = null;
          if (lockedEnemy === en) lockedEnemy = null;
          continue;
        }
        en.group.lookAt(player.position);
        en.group.translateZ(-16 * dt);
        en.fireT -= dt;
        if (en.fireT <= 0 && dist < 90) {
          en.fireT = 1.6 + Math.random() * 1.2;
          fireBullet(en.group.position.clone(), en.group.quaternion, 'enemy');
        }
        if (dist < 2.6) {
          explode(en.group.position, 0xff6a2b);
          scene.remove(en.group); disposeObject3D(en.group); enemies.splice(i, 1);
          for (const m of missiles) if (m.target === en) m.target = null;
          if (lockedEnemy === en) lockedEnemy = null;
          takeDamage();
        }
      }

      for (let i = missiles.length - 1; i >= 0; i--) {
        const m = missiles[i];
        if (m.target && enemies.includes(m.target)) {
          const toTarget = m.target.group.position.clone().sub(m.mesh.position).normalize();
          m.vel.lerp(toTarget.multiplyScalar(60), Math.min(1, dt * 2.5));
        }
        m.mesh.position.addScaledVector(m.vel, dt);
        m.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), m.vel.clone().normalize());
        m.life -= dt;
        if (Math.random() < 0.6) {
          const smoke = new THREE.Mesh(vaporGeo, vaporMat);
          smoke.position.copy(m.mesh.position);
          scene.add(smoke);
          particles.push({ mesh: smoke, vel: new THREE.Vector3(0, 0.2, 0), life: 0.4, maxLife: 0.4 });
        }
        let hit = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
          if (m.mesh.position.distanceTo(enemies[j].group.position) < 2.0) {
            const killed = enemies[j].group;
            explode(killed.position, 0xffb020);
            scene.remove(killed); disposeObject3D(killed); enemies.splice(j, 1);
            for (const mm of missiles) if (mm.target && mm.target.group === killed) mm.target = null;
            if (lockedEnemy && lockedEnemy.group === killed) lockedEnemy = null;
            score += 3; onScore(score); reportBest(score);
            scoreEl.textContent = String(score);
            sfx.win();
            fovPulse = 1.5;
            hit = true;
            break;
          }
        }
        if (hit || m.life <= 0) {
          scene.remove(m.mesh);
          missiles.splice(i, 1);
        }
      }

      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.mesh.position.addScaledVector(b.vel, dt);
        b.life -= dt;
        let hit = false;
        if (b.owner === 'player') {
          for (let j = enemies.length - 1; j >= 0; j--) {
            if (b.mesh.position.distanceTo(enemies[j].group.position) < 1.6) {
              const killed = enemies[j].group;
              explode(killed.position, 0xffd23f);
              scene.remove(killed); disposeObject3D(killed); enemies.splice(j, 1);
              for (const m of missiles) if (m.target && m.target.group === killed) m.target = null;
              if (lockedEnemy && lockedEnemy.group === killed) lockedEnemy = null;
              score++; onScore(score); reportBest(score);
              scoreEl.textContent = String(score);
              sfx.score(Math.min(score, 10));
              fovPulse = 1;
              hit = true;
              break;
            }
          }
        } else if (b.mesh.position.distanceTo(player.position) < 1.4) {
          hit = true;
          takeDamage();
        }
        if (hit || b.life <= 0 || b.mesh.position.distanceTo(player.position) > 260) {
          scene.remove(b.mesh);
          bullets.splice(i, 1);
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); continue; }
        p.vel.y -= 9 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.scale.setScalar(Math.max(0, p.life / p.maxLife));
      }
    }

    const camOffset = new THREE.Vector3(0, 2.4, 7.5);
    const desired = camOffset.clone().applyQuaternion(player.quaternion).add(player.position);
    camera.position.lerp(desired, 1 - Math.pow(0.0008, dt));
    const lookTarget = player.position.clone().add(new THREE.Vector3(0, 0.6, -8).applyQuaternion(player.quaternion));
    camera.lookAt(lookTarget);

    fovPulse = Math.max(0, fovPulse - dt * 3);
    camera.fov = baseFov + fovPulse * 10;
    camera.updateProjectionMatrix();

    oceanMat.uniforms.uTime.value += dt;
    renderer.render(scene, camera);
  });

  return () => {
    stop();
    container.removeEventListener('pointerdown', onTap);
    joystick.remove();
    boostBtn.remove();
    missileBtn.remove();
    hud.remove();
    reticle.remove();
    overlay.remove();
    for (const b of bullets) scene.remove(b.mesh);
    for (const m of missiles) scene.remove(m.mesh);
    for (const en of enemies) { scene.remove(en.group); disposeObject3D(en.group); }
    for (const p of particles) scene.remove(p.mesh);
    disposeObject3D(player);
    disposeObject3D(clouds);
    ground.geometry.dispose(); oceanMat.dispose();
    bulletGeo.dispose(); bulletMat.dispose(); enemyBulletMat.dispose(); particleGeo.dispose(); cloudMat.dispose();
    vaporGeo.dispose(); vaporMat.dispose(); skyTex.dispose();
    missileGeo.dispose(); missileMat.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

// ---------- 19. Spirit Shop (アクション, 自作オリジナル) ----------
// task86(調査主導開発): Poki/Yandex Gamesの人気タイトル調査(2026-08-19)で「Monkey Mart」
// (お店を切り盛りするタップ経営ゲーム)がPoki上位に居続けていることが分かった。その核である
// 「お客さんの注文を見て、正しい品を渡す」というタップ照合の面白さだけを抜き出し、絵柄は
// コピーせず既存の10属性精霊(trapdojo.js/app.jsのSPIRIT_AVATARSと同じ色・アイコン)を
// お客さん役にした自作オリジナルのスコアアタックとして実装(60秒、他ゲームと同じ
// onScore/onHint/comboの共通基盤に乗せている)。
const SPIRITSHOP_ELEMENTS = [
  { id: 'blaze', color: '#e6551a', icon: '🔥' },
  { id: 'aqua', color: '#0288d1', icon: '💧' },
  { id: 'volt', color: '#e6a800', icon: '⚡' },
  { id: 'gust', color: '#4c9a2a', icon: '🌪️' },
  { id: 'terra', color: '#6b7a3c', icon: '🪨' },
  { id: 'frost', color: '#3d94c2', icon: '❄️' },
  { id: 'light', color: '#d9a53a', icon: '✨' },
  { id: 'nox', color: '#4a2a80', icon: '🌑' },
  { id: 'leaf', color: '#4f8a2c', icon: '🌿' },
  { id: 'plasma', color: '#6a3fc0', icon: '🔮' },
];
function mountSpiritShop(container, { onScore, onHint }, config = {}) {
  const patienceSec = config.patienceSec ?? 6;
  const roundSec = 60;
  const maxCustomers = 4;
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  onHint(gt('hint_spiritshop', '同じ色・マークの素材をタップしてお客さんの精霊に渡そう！なるべく多く、なるべく速く！'));

  let stalls = [];
  function layout() {
    const w = canvas.width, h = canvas.height;
    const cols = 5, rows = 2;
    const size = Math.min(w / cols, h * 0.12) * 0.86;
    const gapX = w / cols, gapY = size * 1.3;
    // task108 (MSI, 2026-08-23): was `h - rows * gapY - 16` -- a flat 16px margin with zero
    // awareness of #bottom-nav or the home-indicator safe area at all, so the stall row rendered
    // partly underneath the opaque nav bar on real devices (found via a real iPhone screenshot;
    // see the --safe-bottom comment in style.css :root for why headless verification couldn't
    // catch this). 140px matches BOTTOM_SAFE's base clearance in mountFort above, which was
    // tuned against the same #bottom-nav/.overlay-bottom stack this game also sits behind.
    const startY = h - rows * gapY - (140 + getSafeBottom());
    stalls = SPIRITSHOP_ELEMENTS.map((el, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      return { el, x: gapX * col + gapX / 2, y: startY + row * gapY + size / 2, r: size / 2 };
    });
  }

  let customers, score, burst, t, spawnT, dead, deadT, served, missed, combo;
  function reset() {
    customers = []; score = 0; burst = []; t = 0; spawnT = 0;
    dead = false; deadT = 0; served = 0; missed = 0; combo = makeCombo(1500);
  }
  layout();
  reset();
  const reportBest = makeBestTracker('spiritshop', onHint);

  function spawnCustomer() {
    if (customers.length >= maxCustomers) return;
    const used = new Set(customers.map(c => c.slot));
    let slot = 0;
    while (used.has(slot) && slot < maxCustomers) slot++;
    if (slot >= maxCustomers) return;
    const el = SPIRITSHOP_ELEMENTS[Math.floor(Math.random() * SPIRITSHOP_ELEMENTS.length)];
    const per = canvas.width / maxCustomers;
    const patience = Math.max(3.2, patienceSec - t * 0.03);
    customers.push({ el, slot, x: per * slot + per / 2, y: canvas.height * 0.24, patience, maxPatience: patience });
  }

  function serve(el) {
    const idx = customers.findIndex(c => c.el.id === el.id);
    if (idx === -1) { combo.miss(); return; }
    const c = customers[idx];
    customers.splice(idx, 1);
    const streak = combo.hit(onHint);
    score += 10 + Math.min(streak, 12) * 2;
    served++;
    onScore(score);
    spawnBurst(burst, c.x, c.y, el.color, 14);
  }

  function pointerdown(e) {
    if (dead) { reset(); return; }
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX ?? (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY ?? (e.touches && e.touches[0].clientY)) - rect.top;
    for (const s of stalls) {
      const dx = x - s.x, dy = y - s.y;
      if (dx * dx + dy * dy <= s.r * s.r * 1.5) { serve(s.el); return; }
    }
  }
  canvas.addEventListener('pointerdown', pointerdown);

  const stop = loopRAF((dt) => {
    if (dead) {
      deadT += dt;
      if (deadT > 2.2) reset();
    } else {
      t += dt;
      if (t >= roundSec) {
        dead = true; deadT = 0;
        sfx.gameover(); reportBest(score);
      } else {
        spawnT += dt;
        const spawnEvery = Math.max(0.7, 1.7 - t * 0.018);
        if (spawnT > spawnEvery) { spawnT = 0; spawnCustomer(); }
        for (let i = customers.length - 1; i >= 0; i--) {
          const c = customers[i];
          c.patience -= dt;
          if (c.patience <= 0) { customers.splice(i, 1); missed++; combo.miss(); }
        }
      }
    }

    ctx.fillStyle = '#1c1030'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(10, 8, canvas.width - 20, 7);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(10, 8, (canvas.width - 20) * Math.max(0, 1 - t / roundSec), 7);

    for (const c of customers) {
      ctx.beginPath(); ctx.arc(c.x, c.y, 24, 0, Math.PI * 2);
      ctx.fillStyle = c.el.color; ctx.fill();
      ctx.font = '22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.el.icon, c.x, c.y);
      const frac = Math.max(0, c.patience / c.maxPatience);
      ctx.strokeStyle = frac > 0.3 ? '#7CFC90' : '#ff5a5a';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(c.x, c.y, 30, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
    }

    for (const s of stalls) {
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.globalAlpha = 0.85; ctx.fillStyle = s.el.color; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = `${Math.max(12, s.r)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.el.icon, s.x, s.y);
    }

    drawBurst(ctx, burst, dt);

    if (dead) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(gt('game_over', 'ゲームオーバー'), canvas.width / 2, canvas.height / 2 - 16);
      ctx.font = '18px sans-serif';
      ctx.fillText(`✅ ${served}  ❌ ${missed}`, canvas.width / 2, canvas.height / 2 + 16);
    }
  });

  return () => {
    stop();
    canvas.removeEventListener('pointerdown', pointerdown);
    canvas.remove();
  };
}

// ---------- 20. Runner (アクション, 自作オリジナル) ----------
// task86(調査主導開発): Poki 2026年8月調査でSubway Surfers/Temple Run 2型の横スクロール
// 障害物よけランナーが上位常連であることを確認。既存のdodge(縦に降ってくるブロックを左右に
// 避ける)/mymaze(自作コース走行)とは異なる「一定速度で自動的に進み、ジャンプ/スライディング
// で障害物を避ける」という核メカニクスだけを抽出し、絵柄・世界観は完全オリジナル(既存ゲーム
// と同じダークトーンの背景+単色シルエットのプレイヤー)で実装。
function mountRunner(container, { onScore, onHint }, config = {}) {
  const obstacleSpeedStart = config.obstacleSpeedStart ?? 260;
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  onHint(gt('hint_runner', '上をタップでジャンプ、下をタップ(長押し)でスライディング！障害物をよけて走り抜けろ'));

  const groundY = canvas.height - 130; // dodgeと同じ、下部ナビ/アクションボタンを避ける高さ
  const px = canvas.width * 0.22, pw = 34;
  const standH = 46, duckH = 26;
  const gravity = 1900, jumpV = -620;

  let py, pvy, ducking, jumping;
  let obstacles, t, score, dead, spawnT, spawnEvery, burst, passedCount, combo;
  const reportBest = makeBestTracker('runner', onHint);

  function reset() {
    py = groundY; pvy = 0; ducking = false; jumping = false;
    obstacles = []; t = 0; score = 0; dead = false; spawnT = 0; spawnEvery = 1.3; burst = [];
    passedCount = 0; combo = makeCombo(2000);
  }
  reset();

  function doJump() {
    if (dead) { reset(); return; }
    if (!jumping && !ducking) { pvy = jumpV; jumping = true; sfx.note(660); }
  }
  function startDuck() {
    if (dead) { reset(); return; }
    if (!jumping) ducking = true;
  }
  function endDuck() { ducking = false; }

  function pointerdown(e) {
    const rect = canvas.getBoundingClientRect();
    const y = (e.clientY ?? (e.touches && e.touches[0].clientY)) - rect.top;
    if (y < canvas.height * 0.5) doJump(); else startDuck();
  }
  function pointerup() { endDuck(); }
  canvas.addEventListener('pointerdown', pointerdown);
  canvas.addEventListener('pointerup', pointerup);
  canvas.addEventListener('pointercancel', pointerup);

  function keydown(e) {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') doJump();
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') startDuck();
  }
  function keyup(e) {
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') endDuck();
  }
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);

  function spawnObstacle() {
    const speed = Math.min(560, obstacleSpeedStart + t * 9);
    if (Math.random() < 0.42) {
      // 頭上をふさぐバー — スライディングでくぐる
      obstacles.push({ type: 'high', x: canvas.width + 30, w: 30, barH: 14, gapAboveGround: 34, speed, passed: false });
    } else {
      // 地面の障害物 — ジャンプで飛び越える
      obstacles.push({ type: 'low', x: canvas.width + 30, w: 30, h: 40, speed, passed: false });
    }
  }

  const stop = loopRAF((dt) => {
    if (dead) {
      t += dt;
      if (t > 1.4) reset();
    } else {
      t += dt;
      score = Math.floor(t * 10) + passedCount * 3;
      onScore(score);

      if (jumping) {
        pvy += gravity * dt; py += pvy * dt;
        if (py >= groundY) { py = groundY; pvy = 0; jumping = false; }
      } else {
        py = groundY;
      }

      spawnT += dt;
      spawnEvery = Math.max(0.7, 1.3 - t * 0.012);
      if (spawnT > spawnEvery) { spawnT = 0; spawnObstacle(); }

      for (const o of obstacles) o.x -= o.speed * dt;
      obstacles = obstacles.filter(o => o.x > -60);

      const curH = ducking ? duckH : standH;
      const playerTop = py - curH, playerBottom = py;

      for (const o of obstacles) {
        if (!o.passed && o.x + o.w < px - pw / 2) {
          o.passed = true; passedCount++;
          combo.hit(onHint);
          spawnBurst(burst, px, groundY - curH / 2, '#7CFC90', 6);
        }
        const overlapX = o.x < px + pw / 2 && o.x + o.w > px - pw / 2;
        if (overlapX) {
          let hit = false;
          if (o.type === 'low') {
            if (playerBottom > groundY - o.h) hit = true;
          } else {
            const barBottom = groundY - o.gapAboveGround;
            if (playerTop < barBottom) hit = true;
          }
          if (hit) {
            dead = true; t = 0;
            sfx.gameover(); flashEl(canvas); reportBest(score); combo.miss();
          }
        }
      }
    }

    ctx.fillStyle = '#16241c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, groundY + 2); ctx.lineTo(canvas.width, groundY + 2); ctx.stroke();

    ctx.fillStyle = '#c65b2e';
    for (const o of obstacles) {
      if (o.type === 'low') {
        ctx.fillRect(o.x, groundY - o.h, o.w, o.h);
      } else {
        const barBottom = groundY - o.gapAboveGround;
        ctx.fillRect(o.x, barBottom - o.barH, o.w, o.barH);
      }
    }

    const curH = ducking ? duckH : standH;
    ctx.fillStyle = dead ? '#555' : '#4ea8ff';
    ctx.fillRect(px - pw / 2, groundY - curH, pw, curH);

    drawBurst(ctx, burst, dt);

    if (dead) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(gt('restart_hint', 'タップでリスタート'), canvas.width / 2, canvas.height / 2);
    }
  });

  return () => {
    stop();
    canvas.removeEventListener('pointerdown', pointerdown);
    canvas.removeEventListener('pointerup', pointerup);
    canvas.removeEventListener('pointercancel', pointerup);
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('keyup', keyup);
    canvas.remove();
  };
}

// ---------- 21. Element Connect (パズル, Onet Connect/PaoPao風ペア消し) ----------
// task86(調査主導開発): 2026-08-29のWebSearch調査でYandex Gamesに定番の"Onet Connect
// (PaoPao)"型ペアマッチが確認できた。同じ絵柄2枚を、曲がり角2回以内の線でつなげると消せる
// という核メカニクスだけを抽出し、絵柄は既存10属性精霊(SPIRITSHOP_ELEMENTSを再利用)にした
// 自作オリジナル。コード(経路探索・盤面生成)は本ファイル独自実装で、既存作品のコードは
// 一切参照していない。findConnectPath()は「直進0コスト・方向転換1コスト」の0-1 BFSで、
// 盤面の外周1マス分の余白(パディング)を経路が通れるようにしてあるので、盤の端同士も
// 定番のOnet同様「壁の外を回る」形でつながる。
const CONNECT_COLS = 8, CONNECT_ROWS = 5; // 40マス = 20ペア = 10属性 x 4枚ちょうど
function findConnectPath(grid, R, C, r1, c1, r2, c2) {
  const isOpen = (r, c) => r >= 0 && r < R && c >= 0 && c < C &&
    (grid[r][c] == null || (r === r1 && c === c1) || (r === r2 && c === c2));
  if (!isOpen(r1, c1) || !isOpen(r2, c2)) return null;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const key = (r, c, d) => r + ',' + c + ',' + d;
  const best = new Map(), parent = new Map();
  best.set(key(r1, c1, -1), 0);
  const dq = [{ r: r1, c: c1, d: -1, turns: 0 }];
  let goal = null;
  while (dq.length) {
    const cur = dq.shift();
    if (cur.r === r2 && cur.c === c2) { goal = cur; break; }
    for (let d = 0; d < 4; d++) {
      const nr = cur.r + DIRS[d][0], nc = cur.c + DIRS[d][1];
      if (!isOpen(nr, nc)) continue;
      const turnCost = (cur.d === -1 || cur.d === d) ? 0 : 1;
      const nt = cur.turns + turnCost;
      if (nt > 2) continue;
      const k = key(nr, nc, d);
      if (best.has(k) && best.get(k) <= nt) continue;
      best.set(k, nt);
      const nxt = { r: nr, c: nc, d, turns: nt };
      parent.set(k, cur);
      if (turnCost === 0) dq.unshift(nxt); else dq.push(nxt);
    }
  }
  if (!goal) return null;
  const path = [[goal.r, goal.c]];
  let node = goal;
  while (!(node.r === r1 && node.c === c1)) {
    node = parent.get(key(node.r, node.c, node.d));
    path.push([node.r, node.c]);
  }
  path.reverse();
  return path;
}
function mountConnect(container, { onScore, onHint }) {
  const roundSec = 60;
  const rows = CONNECT_ROWS, cols = CONNECT_COLS;
  const R = rows + 2, C = cols + 2; // 外周1マスは経路専用のパディング(見えないが通行可)
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  onHint(gt('hint_connect', '同じ精霊を2つタップしてつなげよう！曲がり角2回以内でつながる相手だけが消せるよ'));
  const reportBest = makeBestTracker('connect', onHint);

  let cellSize, originX, originY;
  function layout() {
    cellSize = Math.min(canvas.width / (cols + 2), canvas.height / (rows + 2)) * 0.94;
    originX = (canvas.width - cellSize * (cols + 2)) / 2;
    originY = (canvas.height - cellSize * (rows + 2)) / 2;
  }
  function cellCenter(r, c) { return [originX + c * cellSize + cellSize / 2, originY + r * cellSize + cellSize / 2]; }

  let grid, score, served, t, dead, deadT, selected, burst, flashPath, combo;
  function collectByType() {
    const map = new Map();
    for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) {
      const v = grid[r][c];
      if (v == null) continue;
      if (!map.has(v)) map.set(v, []);
      map.get(v).push([r, c]);
    }
    return map;
  }
  function hasAnyMove() {
    for (const cells of collectByType().values()) {
      for (let i = 0; i < cells.length; i++)
        for (let j = i + 1; j < cells.length; j++)
          if (findConnectPath(grid, R, C, cells[i][0], cells[i][1], cells[j][0], cells[j][1])) return true;
    }
    return false;
  }
  function reshuffleRemaining() {
    const cells = [], vals = [];
    for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) {
      if (grid[r][c] != null) { cells.push([r, c]); vals.push(grid[r][c]); }
    }
    for (let attempt = 0; attempt < 40; attempt++) {
      for (let i = vals.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [vals[i], vals[j]] = [vals[j], vals[i]];
      }
      cells.forEach(([r, c], i) => { grid[r][c] = vals[i]; });
      if (hasAnyMove()) return;
    }
  }
  function generateBoard() {
    grid = Array.from({ length: R }, () => Array(C).fill(null));
    const pairCount = (rows * cols) / 2;
    const values = [];
    for (let i = 0; i < pairCount; i++) { const el = i % SPIRITSHOP_ELEMENTS.length; values.push(el, el); }
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    let k = 0;
    for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) grid[r][c] = values[k++];
    if (!hasAnyMove()) reshuffleRemaining();
  }
  function boardEmpty() {
    for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) if (grid[r][c] != null) return false;
    return true;
  }
  function reset() {
    score = 0; served = 0; t = 0; dead = false; deadT = 0; selected = null; burst = []; flashPath = null;
    combo = makeCombo(1500);
    generateBoard();
  }
  layout();
  reset();

  function tryMatch(r, c) {
    const sel = selected;
    selected = null;
    if (grid[sel.r][sel.c] !== grid[r][c]) { combo.miss(); selected = { r, c }; return; }
    const path = findConnectPath(grid, R, C, sel.r, sel.c, r, c);
    if (!path) { combo.miss(); selected = { r, c }; return; }
    grid[sel.r][sel.c] = null; grid[r][c] = null;
    const streak = combo.hit(onHint);
    score += 10 + Math.min(streak, 12) * 2;
    served++;
    onScore(score);
    const [x1, y1] = cellCenter(sel.r, sel.c), [x2, y2] = cellCenter(r, c);
    spawnBurst(burst, x1, y1, '#fff', 8);
    spawnBurst(burst, x2, y2, '#fff', 8);
    flashPath = { pts: path.map(([pr, pc]) => cellCenter(pr, pc)), t: 0.28 };
    if (boardEmpty()) {
      score += 50; onScore(score); reportBest(score);
      onHint(gt('hint_connect_cleared', '✨ 全消し達成！新しい盤面でボーナス+50'));
      generateBoard();
    } else if (!hasAnyMove()) {
      reshuffleRemaining();
    }
  }

  function pointerdown(e) {
    if (dead) { reset(); return; }
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX ?? (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY ?? (e.touches && e.touches[0].clientY)) - rect.top;
    const c = Math.floor((x - originX) / cellSize), r = Math.floor((y - originY) / cellSize);
    if (r < 1 || r > rows || c < 1 || c > cols || grid[r][c] == null) return;
    if (!selected) { selected = { r, c }; return; }
    if (selected.r === r && selected.c === c) { selected = null; return; }
    tryMatch(r, c);
  }
  canvas.addEventListener('pointerdown', pointerdown);

  const stop = loopRAF((dt) => {
    if (dead) {
      deadT += dt;
      if (deadT > 2.2) reset();
    } else {
      t += dt;
      if (t >= roundSec) { dead = true; deadT = 0; sfx.gameover(); reportBest(score); }
    }
    if (flashPath) { flashPath.t -= dt; if (flashPath.t <= 0) flashPath = null; }

    ctx.fillStyle = '#1a1030'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(10, 8, canvas.width - 20, 7);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(10, 8, (canvas.width - 20) * Math.max(0, 1 - t / roundSec), 7);

    const tileR = cellSize * 0.42;
    for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) {
      const v = grid[r][c];
      if (v == null) continue;
      const el = SPIRITSHOP_ELEMENTS[v];
      const [x, y] = cellCenter(r, c);
      const isSel = selected && selected.r === r && selected.c === c;
      ctx.beginPath(); ctx.arc(x, y, tileR, 0, Math.PI * 2);
      ctx.globalAlpha = 0.9; ctx.fillStyle = el.color; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = isSel ? '#ffffff' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = isSel ? 4 : 2; ctx.stroke();
      ctx.font = `${Math.max(12, tileR)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(el.icon, x, y);
    }

    if (flashPath && flashPath.pts.length > 1) {
      ctx.globalAlpha = Math.max(0, flashPath.t / 0.28);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
      ctx.beginPath();
      flashPath.pts.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    drawBurst(ctx, burst, dt);

    if (dead) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(gt('game_over', 'ゲームオーバー'), canvas.width / 2, canvas.height / 2 - 16);
      ctx.font = '18px sans-serif';
      ctx.fillText(`✅ ${served}`, canvas.width / 2, canvas.height / 2 + 16);
    }
  });

  return () => {
    stop();
    canvas.removeEventListener('pointerdown', pointerdown);
    canvas.remove();
  };
}

// ---------- 22. Element Hex (パズル, Hexellent/Blocky Blast風カラーマッチ) ----------
// task108 (MSI, 2026-08-21): Poki実機調査で現在トレンド4位だった"Blocky Blast Puzzle"系の
// グリッド消しパズルと、事前WebSearch調査のHexellent(ヘックスパズル)を参考にした自作
// オリジナル。六角形グリッド(flat-top, odd-q offset座標)上で同色の連結グループ(3つ以上)を
// タップして消すカラーマッチパズル。ドラッグ配置ではなく既存グリッドをタップで消す操作に
// 絞ることで無人検証でもロジックのバグを見つけやすくしてある。own code、既存作品のコード・
// 素材は一切再利用していない。
const HEX_COLS = 7, HEX_ROWS = 7;
const HEX_COLORS = ['#ff5a3c', '#3ca7ff', '#ffe14d', '#4ed17a', '#9b6bff'];
// odd-q offset(flat-top)の標準隣接テーブル。同一列の上下(N/S)+隣接列の斜め4方向(NE/SE/NW/SW)。
function hexNeighbors(col, row) {
  const dirs = (col % 2 === 0)
    ? [[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [0, 1]]
    : [[1, 1], [1, 0], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const out = [];
  for (const [dc, dr] of dirs) {
    const c = col + dc, r = row + dr;
    if (c >= 0 && c < HEX_COLS && r >= 0 && r < HEX_ROWS) out.push([c, r]);
  }
  return out;
}
function mountHex(container, { onScore, onHint }) {
  onHint(gt('hint_hex', '同じ色を3つ以上つなげてタップで消そう！'));
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  const reportBest = makeBestTracker('hex', onHint);
  let grid, score, particles, size, originX, originY, shakeCells, shakeT;

  function layout() {
    size = Math.min(
      canvas.width / (1.5 * (HEX_COLS - 1) + 2),
      canvas.height / (Math.sqrt(3) * (HEX_ROWS + 0.5))
    ) * 0.92;
    const boardW = 1.5 * size * (HEX_COLS - 1) + 2 * size;
    const boardH = Math.sqrt(3) * size * (HEX_ROWS + 0.5);
    originX = (canvas.width - boardW) / 2 + size;
    originY = (canvas.height - boardH) / 2 + size * Math.sqrt(3) / 2;
  }
  function cellCenter(col, row) {
    const x = originX + col * size * 1.5;
    const y = originY + row * size * Math.sqrt(3) + (col % 2 === 1 ? size * Math.sqrt(3) / 2 : 0);
    return [x, y];
  }
  function randomColor() { return Math.floor(Math.random() * HEX_COLORS.length); }
  function floodFill(col, row) {
    const color = grid[col][row];
    if (color < 0) return [];
    const stack = [[col, row]], seen = new Set([col + ',' + row]), out = [[col, row]];
    while (stack.length) {
      const [c, r] = stack.pop();
      for (const [nc, nr] of hexNeighbors(c, r)) {
        const key = nc + ',' + nr;
        if (seen.has(key) || grid[nc][nr] !== color) continue;
        seen.add(key);
        stack.push([nc, nr]);
        out.push([nc, nr]);
      }
    }
    return out;
  }
  function maxGroupSize() {
    const seen = new Set();
    let max = 0;
    for (let c = 0; c < HEX_COLS; c++) for (let r = 0; r < HEX_ROWS; r++) {
      const key = c + ',' + r;
      if (seen.has(key) || grid[c][r] < 0) continue;
      const group = floodFill(c, r);
      group.forEach(([gc, gr]) => seen.add(gc + ',' + gr));
      max = Math.max(max, group.length);
    }
    return max;
  }
  function hasAnyMove() {
    const seen = new Set();
    for (let c = 0; c < HEX_COLS; c++) for (let r = 0; r < HEX_ROWS; r++) {
      const key = c + ',' + r;
      if (seen.has(key) || grid[c][r] < 0) continue;
      const group = floodFill(c, r);
      group.forEach(([gc, gr]) => seen.add(gc + ',' + gr));
      if (group.length >= 3) return true;
    }
    return false;
  }
  function reshuffle() {
    const values = [];
    for (let c = 0; c < HEX_COLS; c++) for (let r = 0; r < HEX_ROWS; r++) if (grid[c][r] >= 0) values.push(grid[c][r]);
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    let k = 0;
    for (let c = 0; c < HEX_COLS; c++) for (let r = 0; r < HEX_ROWS; r++) if (grid[c][r] >= 0) grid[c][r] = values[k++];
  }
  function freshGrid() { return Array.from({ length: HEX_COLS }, () => Array.from({ length: HEX_ROWS }, () => randomColor())); }
  function reset() {
    grid = freshGrid();
    let guard = 0;
    while (maxGroupSize() >= 5 && guard++ < 30) grid = freshGrid();
    score = 0; particles = []; shakeCells = []; shakeT = 0;
  }
  layout();
  reset();

  function applyGravity() {
    for (let c = 0; c < HEX_COLS; c++) {
      const vals = [];
      for (let r = 0; r < HEX_ROWS; r++) if (grid[c][r] >= 0) vals.push(grid[c][r]);
      const missing = HEX_ROWS - vals.length;
      const newCol = Array(HEX_ROWS).fill(-1);
      for (let i = 0; i < missing; i++) newCol[i] = randomColor();
      for (let i = 0; i < vals.length; i++) newCol[missing + i] = vals[i];
      grid[c] = newCol;
    }
  }
  function pick(px, py) {
    let best = null, bestD = Infinity;
    for (let c = 0; c < HEX_COLS; c++) for (let r = 0; r < HEX_ROWS; r++) {
      const [cx, cy] = cellCenter(c, r);
      const d = (cx - px) * (cx - px) + (cy - py) * (cy - py);
      if (d < bestD) { bestD = d; best = [c, r]; }
    }
    return (best && bestD <= size * size) ? best : null;
  }
  function pointerdown(e) {
    const rect = canvas.getBoundingClientRect();
    const cell = pick(e.clientX - rect.left, e.clientY - rect.top);
    if (!cell) return;
    const [c, r] = cell;
    const group = floodFill(c, r);
    if (group.length >= 3) {
      score += group.length * group.length * 10;
      onScore(score); reportBest(score);
      sfx.score(Math.min(group.length, 10));
      group.forEach(([gc, gr]) => {
        const [x, y] = cellCenter(gc, gr);
        spawnBurst(particles, x, y, HEX_COLORS[grid[gc][gr]], 10);
        grid[gc][gr] = -1;
      });
      applyGravity();
      if (!hasAnyMove()) { reshuffle(); onHint(gt('hint_hex_reshuffle', '手詰まり…配置をシャッフルしました')); }
    } else {
      sfx.bad();
      shakeCells = group; shakeT = 0.22;
    }
  }
  canvas.addEventListener('pointerdown', pointerdown);

  function drawHex(cx, cy, r, color) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * 60 * i;
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2; ctx.stroke();
  }
  const stop = loopRAF((dt) => {
    if (shakeT > 0) shakeT -= dt;
    ctx.fillStyle = '#141425'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let c = 0; c < HEX_COLS; c++) for (let r = 0; r < HEX_ROWS; r++) {
      const color = grid[c][r];
      if (color < 0) continue;
      let [x, y] = cellCenter(c, r);
      if (shakeT > 0 && shakeCells.some(([sc, sr]) => sc === c && sr === r)) x += Math.sin(shakeT * 60) * 4;
      drawHex(x, y, size * 0.92, HEX_COLORS[color]);
    }
    drawBurst(ctx, particles, dt);
  });
  return () => { stop(); canvas.removeEventListener('pointerdown', pointerdown); canvas.remove(); };
}

// ---------- Element Flow (パズル) ----------
// task108 (MSI, 2026-08-21): new_games_roadmap.md記載の実装順(ヘクス→フロー→マーブル)の2本目。
// Color Block Jam/Water Sort Puzzle型の色分けソートパズル。own code/オリジナル実装(ジャンルの
// 標準ルール=同色の上澄みを空き/同色レーンへ注ぐ、を10属性テーマの色で自作)。
const FLOW_COLORS = ['#ff5a3c', '#3ca7ff', '#ffe14d', '#4ed17a', '#9b6bff', '#ff8fd6', '#4a2a80'];
const FLOW_CAPACITY = 4;

function flowTopColor(tube) { return tube.length ? tube[tube.length - 1] : -1; }
function flowTopRunLength(tube) {
  if (!tube.length) return 0;
  const c = tube[tube.length - 1];
  let n = 0;
  for (let i = tube.length - 1; i >= 0 && tube[i] === c; i--) n++;
  return n;
}
// Returns how many orbs would move (0 = illegal): dst must be empty or share src's top color,
// and have room. This one function backs both the actual pour and the deadlock scan below.
function flowCanPour(tubes, src, dst) {
  if (src === dst) return 0;
  const s = tubes[src], d = tubes[dst];
  if (!s.length) return 0;
  const room = FLOW_CAPACITY - d.length;
  if (room <= 0) return 0;
  if (d.length && flowTopColor(d) !== flowTopColor(s)) return 0;
  return Math.min(flowTopRunLength(s), room);
}
function flowIsSolved(tubes) {
  return tubes.every(t => t.length === 0 || (t.length === FLOW_CAPACITY && t.every(c => c === t[0])));
}
function flowHasMove(tubes) {
  for (let i = 0; i < tubes.length; i++) for (let j = 0; j < tubes.length; j++) {
    if (flowCanPour(tubes, i, j) > 0) return true;
  }
  return false;
}
// How far `tubes` is from solved: count of tubes that are neither empty nor a uniform full stack.
// Used only to steer flowIsSolvable's search toward promising states (see below).
function flowMessiness(tubes) {
  let n = 0;
  for (const t of tubes) {
    if (t.length === 0) continue;
    if (t.length !== FLOW_CAPACITY || !t.every(c => c === t[0])) n++;
  }
  return n;
}
// Is `tubes` reachable to a solved state via legal (color-matched) pours? Used only inside
// flowGenerate below (a handful of calls per new puzzle, not a hot per-frame path). Best-first
// (greedy on flowMessiness, frontier capped to the most-promising branches) rather than plain
// BFS -- verified empirically (headless JScript harness, task108) to resolve puzzles plain BFS
// couldn't within the same node budget, since uniform breadth-first wastes most of a limited
// budget on branches that don't reduce messiness at all.
function flowIsSolvable(tubes, maxNodes = 20000) {
  const key = (ts) => ts.map(t => t.join(',')).join('|');
  const seen = new Set([key(tubes)]);
  let frontier = [{ t: tubes, h: flowMessiness(tubes) }];
  let nodes = 0;
  while (frontier.length && nodes < maxNodes) {
    frontier.sort((a, b) => a.h - b.h);
    const cur = frontier.shift();
    if (flowIsSolved(cur.t)) return true;
    for (let i = 0; i < cur.t.length; i++) for (let j = 0; j < cur.t.length; j++) {
      const amt = flowCanPour(cur.t, i, j);
      if (amt <= 0) continue;
      const clone = cur.t.map(x => x.slice());
      const c = clone[i][clone[i].length - 1];
      for (let k = 0; k < amt; k++) { clone[i].pop(); clone[j].push(c); }
      const kk = key(clone);
      if (seen.has(kk)) continue;
      seen.add(kk);
      frontier.push({ t: clone, h: flowMessiness(clone) });
      nodes++;
    }
    if (frontier.length > 4000) frontier.length = 4000; // keep only the best-looking branches
  }
  return false;
}
// Generated by "unsolving" a solved board: move a random-length top run onto a random OTHER tube
// with room, ignoring color (this is the reverse of a solve-pour, not a solve-pour itself -- a
// forward color-matched shuffle from a solved board can only ever relocate whole full tubes
// between each other, since no two tubes share a color yet, so it can never actually fragment/mix
// them). flowIsSolvable() then confirms the scrambled result is still reachable back to solved
// before it's handed to the player; if not (rare), the whole scramble is retried.
function flowScramble(numColors, numTubes, scrambleSteps) {
  const tubes = Array.from({ length: numTubes }, () => []);
  for (let c = 0; c < numColors; c++) for (let k = 0; k < FLOW_CAPACITY; k++) tubes[c].push(c);
  for (let m = 0; m < scrambleSteps; m++) {
    const src = Math.floor(Math.random() * numTubes);
    if (!tubes[src].length) continue;
    const dst = Math.floor(Math.random() * numTubes);
    if (dst === src) continue;
    const room = FLOW_CAPACITY - tubes[dst].length;
    if (room <= 0) continue;
    const maxRun = flowTopRunLength(tubes[src]);
    const moveN = 1 + Math.floor(Math.random() * Math.min(maxRun, room));
    const c = tubes[src][tubes[src].length - 1];
    for (let k = 0; k < moveN; k++) { tubes[src].pop(); tubes[dst].push(c); }
  }
  return tubes;
}
function flowGenerate(numColors) {
  const numTubes = numColors + 2;
  for (let guard = 0; guard < 12; guard++) {
    const tubes = flowScramble(numColors, numTubes, 30 + numColors * 8);
    if (!flowIsSolved(tubes) && flowHasMove(tubes) && flowIsSolvable(tubes)) return tubes;
  }
  // Fallback (should be very rare -- headless testing, task108, never triggered this for
  // numColors<=6): a much lighter scramble is closer to solved and therefore both far more
  // likely to already satisfy the checks above and far cheaper to verify if it doesn't.
  for (let guard = 0; guard < 8; guard++) {
    const tubes = flowScramble(numColors, numTubes, numColors * 2);
    if (!flowIsSolved(tubes) && flowHasMove(tubes) && flowIsSolvable(tubes)) return tubes;
  }
  return flowScramble(numColors, numTubes, numColors); // last resort: trivially solvable, barely scrambled
}

function mountFlow(container, { onScore, onHint }) {
  onHint(gt('hint_flow', 'レーンをタップして選び、別のレーンをタップして同じ色を注ごう！全部同じ色で1本にまとめよう'));
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  const reportBest = makeBestTracker('flow', onHint);
  let tubes, colors, level, score, selected, particles, solving;
  let tubeW, tubeH, gap, startX, baseY, orbR;

  function layout() {
    const n = tubes.length;
    const availW = canvas.width - 32;
    tubeW = Math.max(28, Math.min(52, (availW - (n - 1) * 10) / n));
    gap = n > 1 ? (availW - tubeW * n) / (n - 1) : 0;
    const totalW = tubeW * n + gap * (n - 1);
    startX = (canvas.width - totalW) / 2;
    orbR = tubeW * 0.36;
    tubeH = orbR * 2 * FLOW_CAPACITY + 16;
    baseY = canvas.height - 150; // stay clear of the app's bottom-nav + side-action buttons
  }
  function newPuzzle() {
    // Capped at 6 (not FLOW_COLORS.length=7): keeps tube count <=8 for narrow mobile screens, and
    // keeps flowGenerate's solvability search (flowIsSolvable) fast and reliable -- verified via
    // headless testing (task108) that 7-color/9-tube boards make that search notably slower/less
    // reliable within its node budget than 6-color/8-tube ones.
    colors = Math.min(4 + Math.floor(level / 2), 6);
    tubes = flowGenerate(colors);
    selected = -1; solving = false;
    layout(); // tube count changes with level, so layout must recompute every puzzle, not just once
  }
  function reset() { level = 0; score = 0; particles = []; newPuzzle(); }
  reset();

  function tubeRect(i) {
    const x = startX + i * (tubeW + gap);
    return { x, y: baseY - tubeH, w: tubeW, h: tubeH };
  }
  function pick(px, py) {
    for (let i = 0; i < tubes.length; i++) {
      const r = tubeRect(i);
      if (px >= r.x - gap / 2 && px <= r.x + r.w + gap / 2 && py >= r.y - 20 && py <= baseY + 10) return i;
    }
    return null;
  }
  function pour(src, dst) {
    const amt = flowCanPour(tubes, src, dst);
    if (amt <= 0) return false;
    const c = tubes[src][tubes[src].length - 1];
    for (let k = 0; k < amt; k++) { tubes[src].pop(); tubes[dst].push(c); }
    score += amt * 10;
    onScore(score);
    sfx.score(amt);
    reportBest(score);
    const r = tubeRect(dst);
    spawnBurst(particles, r.x + r.w / 2, r.y + r.h - (tubes[dst].length - 1) * orbR * 2 - orbR, FLOW_COLORS[c], 8);
    if (flowIsSolved(tubes)) {
      solving = true;
      sfx.win();
      score += 100; onScore(score); reportBest(score);
      onHint(gt('hint_flow_solved', '✨ クリア！次のパズルへ'));
      setTimeout(() => { level++; newPuzzle(); }, 900);
    } else if (!flowHasMove(tubes)) {
      solving = true;
      onHint(gt('hint_flow_stuck', '手詰まり…新しいパズルに切り替えます'));
      setTimeout(() => { newPuzzle(); }, 1200);
    }
    return true;
  }
  function pointerdown(e) {
    if (solving) return;
    const rect = canvas.getBoundingClientRect();
    const i = pick(e.clientX - rect.left, e.clientY - rect.top);
    if (i === null) return;
    if (selected === -1) {
      if (tubes[i].length) selected = i;
    } else if (selected === i) {
      selected = -1;
    } else {
      const ok = pour(selected, i);
      selected = ok ? -1 : (tubes[i].length ? i : -1);
    }
  }
  canvas.addEventListener('pointerdown', pointerdown);

  function drawTube(i) {
    const r = tubeRect(i);
    ctx.strokeStyle = i === selected ? '#ffe14d' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = i === selected ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(r.x, r.y);
    ctx.lineTo(r.x, r.y + r.h);
    ctx.quadraticCurveTo(r.x, r.y + r.h + 8, r.x + 8, r.y + r.h + 8);
    ctx.lineTo(r.x + r.w - 8, r.y + r.h + 8);
    ctx.quadraticCurveTo(r.x + r.w, r.y + r.h + 8, r.x + r.w, r.y + r.h);
    ctx.lineTo(r.x + r.w, r.y);
    ctx.stroke();
    const t = tubes[i];
    for (let k = 0; k < t.length; k++) {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h - k * orbR * 2 - orbR;
      ctx.fillStyle = FLOW_COLORS[t[k]];
      ctx.beginPath(); ctx.arc(cx, cy, orbR * 0.86, 0, Math.PI * 2); ctx.fill();
    }
  }
  const stop = loopRAF((dt) => {
    ctx.fillStyle = '#141425'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < tubes.length; i++) drawTube(i);
    drawBurst(ctx, particles, dt);
  });
  return () => { stop(); canvas.removeEventListener('pointerdown', pointerdown); canvas.remove(); };
}

// ---------- Element Fort (アクション) ----------
// 2026-08-22 (MSI, user request via live session): Clash Royale-inspired 1-lane tower push duel
// vs an AI bot. Own code/original -- extracts only the core loop (elixir resource that refills
// over time, gated deployment of auto-fighting units, push each other's tower) and reskins it
// with the existing 10-element spirit roster; deliberately drops the deck-building/2-lane/
// buildings-and-spells/live-PvP-matchmaking side of the source material to fit Anyway's ~45s
// feed-card format (see output_contrib/MSI/element_fort_clash_royale_analysis.md for the full
// analysis + scoping rationale). Real PvP (reusing royale.js/trapdojo.js's Supabase realtime
// pattern) is an explicit future candidate, not attempted here.
// task108 (MSI, 2026-08-22/23, user-directed quality pass): `sprite` is a path to a character-
// art PNG (assets/element_sprites/<id>.png, transparent background). All 10 are now cropped
// directly from the official per-character design sheets in キャラクター素材/ (the "正面" 3D
// render on each) via scripts/_msi_crop_official_sprite.ps1 -- using the canonical art instead of
// freshly-generated reinterpretations keeps every element visually on-brand and consistent with
// each other (an earlier pass generated blaze/aqua/volt via Gemini from a text description alone,
// which drifted off-model -- e.g. volt came out purple instead of the character's actual yellow/
// black -- so those three were replaced with official-sheet crops too). fortSpriteFor below still
// falls back to color+icon if a sprite is ever missing/fails to load, so this can never hard-break.
const FORT_ELEMENTS = [
  { id: 'blaze', color: '#e6551a', icon: '🔥', cost: 3, hp: 80, atk: 40, speed: 0.16, sprite: 'assets/element_sprites/blaze.png' },
  { id: 'aqua', color: '#0288d1', icon: '💧', cost: 3, hp: 110, atk: 25, speed: 0.14, sprite: 'assets/element_sprites/aqua.png' },
  { id: 'volt', color: '#e6a800', icon: '⚡', cost: 2, hp: 50, atk: 35, speed: 0.26, sprite: 'assets/element_sprites/volt.png' },
  { id: 'gust', color: '#4c9a2a', icon: '🌪️', cost: 2, hp: 60, atk: 22, speed: 0.24, sprite: 'assets/element_sprites/gust.png' },
  { id: 'terra', color: '#6b7a3c', icon: '🪨', cost: 5, hp: 220, atk: 20, speed: 0.09, sprite: 'assets/element_sprites/terra.png' },
  { id: 'frost', color: '#3d94c2', icon: '❄️', cost: 4, hp: 130, atk: 45, speed: 0.10, sprite: 'assets/element_sprites/frost.png' },
  { id: 'light', color: '#d9a53a', icon: '✨', cost: 3, hp: 100, atk: 30, speed: 0.15, sprite: 'assets/element_sprites/light.png' },
  { id: 'nox', color: '#4a2a80', icon: '🌑', cost: 3, hp: 70, atk: 50, speed: 0.20, sprite: 'assets/element_sprites/nox.png' },
  { id: 'leaf', color: '#4f8a2c', icon: '🌿', cost: 4, hp: 150, atk: 28, speed: 0.12, sprite: 'assets/element_sprites/leaf.png' },
  { id: 'plasma', color: '#6a3fc0', icon: '🔮', cost: 6, hp: 200, atk: 55, speed: 0.13, sprite: 'assets/element_sprites/plasma.png' },
];
// Shared, lazily-populated image cache keyed by element id -- loaded once per page session
// (not per mount) so re-entering the Fort card repeatedly never re-fetches the same PNGs.
// Returns the Image once decoded and ready to draw, or null (caller falls back to color+icon)
// while it's still loading or if the element has no sprite at all.
const _fortSpriteCache = {};
function fortSpriteFor(el) {
  if (!el.sprite) return null;
  let entry = _fortSpriteCache[el.id];
  if (!entry) {
    const img = new Image();
    entry = _fortSpriteCache[el.id] = { img, ready: false };
    img.onload = () => { entry.ready = true; };
    img.src = el.sprite;
  }
  return entry.ready ? entry.img : null;
}
const FORT_MAX_ELIXIR = 10;
const FORT_ELIXIR_REGEN_SEC = 2.2; // seconds per +1 elixir
const FORT_ENGAGE_RANGE = 0.045; // lane-fraction distance at which two troops start fighting
const FORT_TOWER_ATK = 26;
const FORT_TOWER_HP = 260;
const FORT_MATCH_SECONDS = 48;
// task108 (MSI, 2026-08-24, CEO-provided art): 4 hand-drawn top-down battlefield maps (own
// commission, see 3D素材/Gemini_Generated_Image_ya7axaya7axaya7a.jpg for the original 4-up
// sheet this was cropped from -- assets/element_fort_maps/<id>.jpg). Each shows the same
// structure this game already used blindly (a start flag at the bottom, a goal flag at the top,
// a crossing at the midline) but drawn with an actual path: a wide open lane on the left, one
// down the middle, and one on the right, meeting at the midline crossing. FORT_LANE_X assigns
// troops to whichever of those three paths their drop point was closest to, instead of every
// troop marching straight up the dead-center pixel column regardless of map -- so "where can a
// character walk" now has a real answer per map, matching Clash Royale's own two/three-lane
// pushing rather than the single fixed rail this had before.
const FORT_MAPS = [
  { id: 'grassland', name: '草原の村', image: 'assets/element_fort_maps/grassland.jpg' },
  { id: 'forest', name: '深緑の森', image: 'assets/element_fort_maps/forest.jpg' },
  { id: 'desert', name: '乾いた渓谷', image: 'assets/element_fort_maps/desert.jpg' },
  { id: 'urban', name: '未来都市', image: 'assets/element_fort_maps/urban.jpg' },
];
const FORT_LANE_X = [0.24, 0.5, 0.76]; // left / center / right, as a fraction of canvas width
function fortLaneFromX(px, canvasWidth) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < FORT_LANE_X.length; i++) {
    const d = Math.abs(px - FORT_LANE_X[i] * canvasWidth);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
const _fortMapCache = {};
function fortMapImageFor(map) {
  let entry = _fortMapCache[map.id];
  if (!entry) {
    const img = new Image();
    entry = _fortMapCache[map.id] = { img, ready: false };
    img.onload = () => { entry.ready = true; };
    img.src = map.image;
  }
  return entry.ready ? entry.img : null;
}

function fortRandomCard() { return Math.floor(Math.random() * FORT_ELEMENTS.length); }
// `id` is a per-match monotonic counter (state.nextTroopId) rather than array index, so
// mountFort's render loop can tell "this troop died this tick" apart from "this troop just
// hasn't been pushed yet" purely by identity, across the array splice in fortTick below.
function fortMakeTroop(state, elementIdx, side, lane) {
  const el = FORT_ELEMENTS[elementIdx];
  const id = (state.nextTroopId = (state.nextTroopId || 0) + 1);
  return { id, el, side, lane: lane ?? 1, hp: el.hp, maxHp: el.hp, pos: side === 'player' ? 0 : 1, attacking: null, spawnT: 0 };
}
// Advances the whole battle by dt seconds: elixir regen, troop movement, combat, tower damage.
// Pure over `state` (mutates it in place and returns it) so it's callable identically from the
// real game loop and from a headless test harness -- no canvas/DOM/timer access inside.
function fortTick(state, dt) {
  state.playerElixir = Math.min(FORT_MAX_ELIXIR, state.playerElixir + dt / FORT_ELIXIR_REGEN_SEC);
  state.aiElixir = Math.min(FORT_MAX_ELIXIR, state.aiElixir + dt / FORT_ELIXIR_REGEN_SEC);

  // Pair up engaged troops (closest opposing pair *in the same lane* within FORT_ENGAGE_RANGE),
  // mutual damage -- lanes only block combat pairing, not movement; a lane with no defender lets
  // its attacker walk straight to that lane's share of the tower unopposed.
  const players = state.troops.filter(t => t.side === 'player' && t.hp > 0);
  const ais = state.troops.filter(t => t.side === 'ai' && t.hp > 0);
  for (const p of players) p.attacking = null;
  for (const a of ais) a.attacking = null;
  for (const p of players) {
    let best = null, bestD = FORT_ENGAGE_RANGE;
    for (const a of ais) {
      if (a.attacking || a.lane !== p.lane) continue;
      const d = Math.abs(p.pos - a.pos);
      if (d <= bestD) { best = a; bestD = d; }
    }
    if (best) { p.attacking = best; best.attacking = p; }
  }
  for (const t of state.troops) {
    if (t.hp <= 0) continue;
    if (t.attacking) {
      t.attacking.hp -= t.el.atk * dt;
      continue; // engaged troops hold position instead of advancing
    }
    if (t.side === 'player') {
      if (t.pos < 1) { t.pos = Math.min(1, t.pos + t.el.speed * dt); continue; }
      state.aiTowerHp = Math.max(0, state.aiTowerHp - t.el.atk * dt);
      t.hp -= FORT_TOWER_ATK * dt;
    } else {
      if (t.pos > 0) { t.pos = Math.max(0, t.pos - t.el.speed * dt); continue; }
      state.playerTowerHp = Math.max(0, state.playerTowerHp - t.el.atk * dt);
      t.hp -= FORT_TOWER_ATK * dt;
    }
  }
  // task108 (MSI, 2026-08-22, quality pass): record who died *this* tick (position + side +
  // color) before they're spliced out, so the render loop can spawn a death burst/sfx without
  // fortTick itself touching canvas/particles -- keeps this function pure/headless-testable.
  state.deadThisTick = state.troops.filter(t => t.hp <= 0).map(t => ({ pos: t.pos, side: t.side, lane: t.lane, color: t.el.color }));
  state.troops = state.troops.filter(t => t.hp > 0);
  state.elapsed += dt;
  return state;
}
function fortWinner(state) {
  if (state.playerTowerHp <= 0 && state.aiTowerHp <= 0) return 'draw';
  if (state.aiTowerHp <= 0) return 'player';
  if (state.playerTowerHp <= 0) return 'ai';
  if (state.elapsed >= FORT_MATCH_SECONDS) {
    if (state.playerTowerHp === state.aiTowerHp) return 'draw';
    return state.playerTowerHp > state.aiTowerHp ? 'player' : 'ai';
  }
  return null;
}
// Simple rule-based opponent: deploys a random affordable card roughly every couple of seconds,
// biased faster when the player is pushing (mirrors "defend when under pressure").
function fortAiMaybeDeploy(state, dt) {
  state.aiTimer = (state.aiTimer || 0) - dt;
  if (state.aiTimer > 0) return null;
  const pressured = state.troops.some(t => t.side === 'player' && t.pos > 0.55);
  state.aiTimer = pressured ? (0.6 + Math.random() * 0.6) : (1.4 + Math.random() * 1.6);
  const affordable = FORT_ELEMENTS.map((el, i) => i).filter(i => FORT_ELEMENTS[i].cost <= state.aiElixir);
  if (!affordable.length) return null;
  const idx = affordable[Math.floor(Math.random() * affordable.length)];
  state.aiElixir -= FORT_ELEMENTS[idx].cost;
  const lane = Math.floor(Math.random() * FORT_LANE_X.length);
  state.troops.push(fortMakeTroop(state, idx, 'ai', lane));
  return idx;
}
// task108 (MSI, 2026-08-22, quality pass §7-3 item 3): every card used to play the same
// generic sfx.score(0) beep on deploy regardless of element. Derives a distinct-but-consistent
// deploy chime per element from its own stats (no per-element hand-tuned table to keep in sync
// as FORT_ELEMENTS grows) -- heavier/tankier troops (high hp) lean toward a rounder waveform
// and slightly longer tail, hard-hitters (high atk) lean toward a sharper waveform, and faster
// troops pitch higher. Pure function of `el`, so headless-testable without an AudioContext.
function fortSfxFor(el) {
  const freq = 300 + el.speed * 900 + el.atk * 2;
  const type = el.atk >= 40 ? 'square' : (el.hp >= 150 ? 'triangle' : 'sine');
  const dur = 0.1 + Math.min(1, el.hp / 220) * 0.06;
  return { freq, type, gain: 0.13, dur };
}

function mountFort(container, { onScore, onHint }) {
  onHint(gt('hint_fort', 'カードをドラッグして自陣側の好きな位置にドロップ！エリクサーがたまったら出せる、敵タワーを壊せ'));
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  const reportBest = makeBestTracker('fort', onHint);
  // One map per feed-card visit (not re-rolled every reset()) -- picking a new map every 1.4s
  // reset would be visually jarring mid-session; this only changes when the card is re-mounted.
  const fortMap = FORT_MAPS[Math.floor(Math.random() * FORT_MAPS.length)];
  let state, hand, score, particles, ended, cardRects;

  function newHand() { return [fortRandomCard(), fortRandomCard(), fortRandomCard(), fortRandomCard()]; }
  function reset() {
    state = { playerElixir: 5, aiElixir: 5, troops: [], playerTowerHp: FORT_TOWER_HP, aiTowerHp: FORT_TOWER_HP, elapsed: 0, aiTimer: 1, deadThisTick: [] };
    hand = newHand();
    score = 0; particles = []; ended = false;
  }
  reset();

  const HAND_H = 74;
  // BOTTOM_SAFE clears the app's own fixed bottom overlays: .overlay-bottom (title/creator
  // text, spans roughly bottom:92px-132px) and #bottom-nav (spans bottom:0-74px) -- see
  // style.css. The whole HAND_H-tall card row needs to sit *above* bottom:132px, not just
  // above bottom:16px (the old value), or its lower portion renders underneath the opaque
  // #bottom-nav bar (cost numbers clipped) and the elixir bar lands directly on top of the
  // title/creator text (verified via a headless screenshot: both were visibly happening).
  // Computed once (not module-level) since it depends on getSafeBottom(), which can only be
  // read once the DOM/CSS is actually attached; stable for the life of one mount.
  const BOTTOM_SAFE = 140 + getSafeBottom();
  function layoutCards() {
    const n = hand.length;
    const w = Math.min(74, (canvas.width - 16 * (n + 1)) / n);
    const totalW = w * n + 16 * (n - 1);
    const startX = (canvas.width - totalW) / 2;
    const y = canvas.height - HAND_H - BOTTOM_SAFE;
    cardRects = hand.map((_, i) => ({ x: startX + i * (w + 16), y, w, h: HAND_H }));
  }
  layoutCards();

  function laneY(pos) {
    const top = 90, bottom = canvas.height - HAND_H - BOTTOM_SAFE - 20;
    return bottom - pos * (bottom - top);
  }
  // task108 (MSI, 2026-08-23, user-directed rework): the original interaction was tap-a-card-to-
  // instant-deploy-at-your-tower -- no placement choice at all, which reads as an idle auto-
  // battler (user's comparison: "にゃんこ大戦争") rather than Clash Royale's core "grab a card,
  // drop it where you want" mechanic. This replaces that with real drag-and-drop: press a card,
  // drag it up into the field, and release to deploy at that spot -- anywhere in your own half
  // of the lane (pos 0..0.5; the river at pos 0.5 is the hard limit, matching the source
  // material's "you can only place on your side" rule). A release with near-zero drag distance
  // is still treated as a quick "deploy near my tower" tap, so single-tap play keeps working.
  function playCard(i, dropPos, dropLane) {
    if (ended) return;
    const idx = hand[i];
    const el = FORT_ELEMENTS[idx];
    if (el.cost > state.playerElixir) { sfx.bad(); return; }
    state.playerElixir -= el.cost;
    const troop = fortMakeTroop(state, idx, 'player', dropLane);
    troop.pos = dropPos;
    state.troops.push(troop);
    hand[i] = fortRandomCard();
    const p = fortSfxFor(el);
    beep(p.freq, p.dur, p.type, p.gain);
    spawnBurst(particles, FORT_LANE_X[dropLane] * canvas.width, laneY(dropPos), el.color, 6);
  }
  const RIVER_POS = 0.5;
  let dragging = null; // { cardIndex, startX, startY, curX, curY }
  function cardAt(px, py) {
    for (let i = 0; i < cardRects.length; i++) {
      const r = cardRects[i];
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
    }
    return -1;
  }
  function pointerdown(e) {
    if (ended) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const i = cardAt(px, py);
    if (i >= 0) dragging = { cardIndex: i, startX: px, startY: py, curX: px, curY: py };
  }
  function pointermove(e) {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    dragging.curX = e.clientX - rect.left;
    dragging.curY = e.clientY - rect.top;
  }
  function pointerup(e) {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const dist = Math.hypot(px - dragging.startX, py - dragging.startY);
    const top = 90, bottom = canvas.height - HAND_H - BOTTOM_SAFE - 20, river = laneY(RIVER_POS);
    const cardIndex = dragging.cardIndex;
    dragging = null;
    // quick tap -> deploy near own tower, in whichever lane was tapped
    if (dist < 10) { playCard(cardIndex, 0.12, fortLaneFromX(px, canvas.width)); return; }
    if (py < river || py > bottom) return; // dropped past the river or back over the hand -- cancel
    const pos = Math.max(0, Math.min(RIVER_POS, (bottom - py) / (bottom - top)));
    playCard(cardIndex, pos, fortLaneFromX(px, canvas.width));
  }
  function pointercancel() { dragging = null; }
  canvas.addEventListener('pointerdown', pointerdown);
  canvas.addEventListener('pointermove', pointermove);
  canvas.addEventListener('pointerup', pointerup);
  canvas.addEventListener('pointercancel', pointercancel);
  function drawTowerBar(x, y, w, hp, maxHp, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x, y, w, 8);
    ctx.fillStyle = color; ctx.fillRect(x, y, w * Math.max(0, hp / maxHp), 8);
  }
  // task108 (MSI, 2026-08-27, precision audit): this used to be a single flat #3a3a55
  // fillRect for BOTH towers -- a plain gray box with no icon and no visual distinction
  // between player/enemy, jarring against the photoreal map art and the sprited troops
  // around it (found via headless screenshot review). Team-tinted rounded rect + a castle
  // icon reads as an actual tower instead of a placeholder, matching the polish level of
  // the rest of the scene.
  function drawTowerIcon(x, y, w, h, tint) {
    ctx.save();
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = `${h - 4}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🏯', x + w / 2, y + h / 2 + 1);
    ctx.restore();
  }
  const stop = loopRAF((dt) => {
    if (!ended) {
      const prevAiHp = state.aiTowerHp, prevPlayerHp = state.playerTowerHp;
      fortAiMaybeDeploy(state, dt);
      fortTick(state, dt);
      const dealt = prevAiHp - state.aiTowerHp;
      if (dealt > 0) {
        score += Math.round(dealt); onScore(score); reportBest(score);
        // task108 (MSI, 2026-08-22, quality pass §7-3 item 2): a trickle of sparks at the
        // tower being hit -- capped per-frame so a troop parked at the tower for several
        // seconds reads as "sustained impact", not an ever-growing particle pile.
        spawnBurst(particles, canvas.width / 2, laneY(1) - 10, '#ff5a3c', Math.min(3, Math.ceil(dealt / 8)));
      }
      if (prevPlayerHp - state.playerTowerHp > 0) {
        spawnBurst(particles, canvas.width / 2, laneY(0) + 10, '#4ea8ff', Math.min(3, Math.ceil((prevPlayerHp - state.playerTowerHp) / 8)));
      }
      // Troops used to just vanish the instant their hp hit 0 -- no burst, no sfx, nothing
      // marked the kill. deadThisTick (populated by fortTick above) drives a pop burst + a
      // soft beep per kill instead, on both sides so losses read as clearly as kills do.
      for (const d of state.deadThisTick) {
        spawnBurst(particles, FORT_LANE_X[d.lane] * canvas.width + (d.side === 'player' ? -10 : 10), laneY(d.pos), d.color, 8);
      }
      if (state.deadThisTick.length) beep(170, 0.09, 'triangle', 0.08);
      const w = fortWinner(state);
      if (w) {
        ended = true;
        if (w === 'player') {
          sfx.win(); score += 150; onHint(gt('hint_fort_win', '🏆 敵タワーを撃破！勝利！'));
          spawnBurst(particles, canvas.width / 2, laneY(1) - 10, '#ff5a3c', 28);
        } else if (w === 'ai') {
          sfx.gameover(); onHint(gt('hint_fort_lose', '…タワーが陥落した。次の試合へ'));
          spawnBurst(particles, canvas.width / 2, laneY(0) + 10, '#4ea8ff', 28);
        } else {
          onHint(gt('hint_fort_draw', '引き分け！次の試合へ'));
        }
        if (w !== 'draw') shakeEl(canvas, 260);
        onScore(score); reportBest(score);
        setTimeout(reset, 1400);
      }
    }
    ctx.fillStyle = '#101026'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    // task108 (MSI, 2026-08-24, CEO-provided art): cover-fit the chosen battlefield image behind
    // everything else. Dimmed so troop sprites/HP bars/particles stay readable on top of busy
    // art (same "dim the scenery, keep the gameplay legible" approach as royale.js/cup.js's map
    // backgrounds -- see map_background_mismatch_fix.md for why that pattern exists at all).
    const mapImg = fortMapImageFor(fortMap);
    if (mapImg) {
      const ir = mapImg.width / mapImg.height, cr = canvas.width / canvas.height;
      let dw, dh;
      if (ir > cr) { dh = canvas.height; dw = dh * ir; } else { dw = canvas.width; dh = dw / ir; }
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.drawImage(mapImg, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
      ctx.restore();
    }

    // task108 (MSI, 2026-08-23): while dragging a card, dim the enemy half and highlight the
    // player's own half (down to the river) as the valid drop zone -- makes the "you can only
    // place on your side" rule (see playCard's comment) visible instead of just enforced.
    if (dragging) {
      const top = 90, bottom = canvas.height - HAND_H - BOTTOM_SAFE - 20, river = laneY(RIVER_POS);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, top, canvas.width, river - top);
      ctx.fillStyle = 'rgba(78,209,122,0.10)'; ctx.fillRect(0, river, canvas.width, bottom - river);
      // task108 (MSI, 2026-08-24): lane guide lines so "which of the 3 paths am I dropping
      // into" is visible while dragging, not just inferred after the fact.
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
      for (const lx of FORT_LANE_X) {
        ctx.beginPath(); ctx.moveTo(lx * canvas.width, top); ctx.lineTo(lx * canvas.width, bottom); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = 'rgba(120,170,255,0.35)'; ctx.lineWidth = 2;
    const riverY = laneY(RIVER_POS);
    ctx.beginPath(); ctx.moveTo(0, riverY); ctx.lineTo(canvas.width, riverY); ctx.stroke();

    drawTowerBar(canvas.width / 2 - 40, laneY(1) - 26, 80, state.aiTowerHp, FORT_TOWER_HP, '#ff5a3c');
    drawTowerIcon(canvas.width / 2 - 22, laneY(1) - 20, 44, 20, 'rgba(214,64,36,0.65)');
    drawTowerBar(canvas.width / 2 - 40, laneY(0) + 12, 80, state.playerTowerHp, FORT_TOWER_HP, '#4ea8ff');
    drawTowerIcon(canvas.width / 2 - 22, laneY(0), 44, 20, 'rgba(30,110,220,0.65)');

    // task108 (MSI, 2026-08-23): single master pose per element (no walk/attack frame sheets
    // exist), so movement/combat is animated procedurally instead of via frame-swapping --
    // idle/advancing troops get a speed-scaled bob + squash-stretch ("walk cycle" read through
    // one image, same trick 2D hyper-casual games use for single-sprite characters), and engaged
    // troops get a punchy scale-up + lean-toward-target pulse on a fixed cadence layered on top
    // of (not replacing) the continuous-damage combat model in fortTick.
    for (const t of state.troops) {
      t.animPhase = (t.animPhase || 0) + dt;
      t.spawnT = Math.min(0.22, (t.spawnT || 0) + dt);
      // task108 (MSI, 2026-08-24): troops now walk their assigned lane's path (left/center/
      // right, per FORT_LANE_X) instead of a single fixed rail down the exact center pixel --
      // see FORT_LANE_X's own comment for why. The two troops sharing a lane still separate by
      // a few px (side offset) purely so they don't fully overlap when both stack up on it.
      const x = FORT_LANE_X[t.lane] * canvas.width + (t.side === 'player' ? -10 : 10);
      const baseY = laneY(t.pos);
      let bobY = 0, scaleX = 1, scaleY = 1;
      if (t.attacking) {
        const cycle = (t.animPhase % 0.35) / 0.35;
        const punch = cycle < 0.25 ? Math.sin((cycle / 0.25) * Math.PI) : 0;
        scaleX = 1 + punch * 0.14; scaleY = 1 - punch * 0.10;
        bobY = (t.side === 'player' ? -1 : 1) * punch * 4; // lean toward the opponent
      } else {
        const freq = 5 + t.el.speed * 14;
        const wave = Math.sin(t.animPhase * freq);
        bobY = wave * 2.5;
        scaleX = 1 + wave * 0.05; scaleY = 1 - wave * 0.05;
      }
      // task108 (MSI, 2026-08-24): newly-dropped troops used to just pop into existence at full
      // size on frame one. A quick scale-in (ease-out over ~0.22s) reads as "landing" instead --
      // cheap, but it's the difference between a sprite appearing and a sprite arriving.
      const spawnScale = t.spawnT >= 0.22 ? 1 : 1 - Math.pow(1 - t.spawnT / 0.22, 2) * 0.6;
      scaleX *= spawnScale; scaleY *= spawnScale;
      const y = baseY + bobY;
      const sprite = fortSpriteFor(t.el);
      if (sprite) {
        const dh = 34 * scaleY, dw = (34 * (sprite.width / sprite.height)) * scaleX;
        ctx.drawImage(sprite, x - dw / 2, y - dh / 2, dw, dh);
      } else {
        ctx.fillStyle = t.el.color;
        ctx.beginPath(); ctx.ellipse(x, y, 14 * scaleX, 14 * scaleY, 0, 0, Math.PI * 2); ctx.fill();
        ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(t.el.icon, x, y);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - 14, y - 22, 28, 4);
      ctx.fillStyle = '#4ed17a'; ctx.fillRect(x - 14, y - 22, 28 * Math.max(0, t.hp / t.maxHp), 4);
    }
    drawBurst(ctx, particles, dt);

    // Dragged card follows the pointer as an enlarged ghost, so "grab and drop" reads clearly.
    if (dragging) {
      const el = FORT_ELEMENTS[hand[dragging.cardIndex]];
      const ghostSprite = fortSpriteFor(el);
      const gx = dragging.curX, gy = dragging.curY;
      ctx.globalAlpha = 0.85;
      if (ghostSprite) {
        const dh = 46, dw = dh * (ghostSprite.width / ghostSprite.height);
        ctx.drawImage(ghostSprite, gx - dw / 2, gy - dh / 2, dw, dh);
      } else {
        ctx.fillStyle = el.color;
        ctx.beginPath(); ctx.arc(gx, gy, 18, 0, Math.PI * 2); ctx.fill();
        ctx.font = '18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(el.icon, gx, gy);
      }
      ctx.globalAlpha = 1;
    }

    // Elixir bar
    const eBarX = 16, eBarY = canvas.height - HAND_H - BOTTOM_SAFE - 18, eBarW = canvas.width - 32;
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(eBarX, eBarY, eBarW, 10);
    ctx.fillStyle = '#c060ff'; ctx.fillRect(eBarX, eBarY, eBarW * (state.playerElixir / FORT_MAX_ELIXIR), 10);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(Math.floor(state.playerElixir) + '/' + FORT_MAX_ELIXIR, eBarX, eBarY - 4);

    // Hand cards (the one currently being dragged renders as an empty slot -- its ghost is
    // drawn near the pointer instead, above)
    for (let i = 0; i < cardRects.length; i++) {
      const r = cardRects[i], el = FORT_ELEMENTS[hand[i]];
      if (dragging && dragging.cardIndex === i) {
        ctx.fillStyle = '#141425'; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
        ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]);
        continue;
      }
      const affordable = el.cost <= state.playerElixir;
      ctx.fillStyle = affordable ? '#2a2a45' : '#1a1a2a';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      // task108 (MSI, 2026-08-22, quality pass §7-3 item 4): a slow breathing glow on the
      // border of every affordable card, so "ready to play" is legible at a glance instead of
      // only differing from "too expensive" by a slightly brighter fill color.
      const pulse = affordable ? 0.5 + 0.5 * Math.sin(performance.now() / 260) : 0;
      ctx.strokeStyle = affordable ? el.color : 'rgba(255,255,255,0.15)'; ctx.lineWidth = affordable ? 2 + pulse * 1.4 : 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      const cardSprite = fortSpriteFor(el);
      if (cardSprite) {
        const dh = r.h * 0.62, dw = dh * (cardSprite.width / cardSprite.height);
        if (!affordable) ctx.globalAlpha = 0.45;
        ctx.drawImage(cardSprite, r.x + r.w / 2 - dw / 2, r.y + 4, dw, dh);
        ctx.globalAlpha = 1;
      } else {
        ctx.font = '22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = affordable ? '#fff' : '#666';
        ctx.fillText(el.icon, r.x + r.w / 2, r.y + r.h / 2 - 10);
      }
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = affordable ? '#fff' : '#666';
      ctx.fillText(String(el.cost), r.x + r.w / 2, r.y + r.h - 12);
    }
  });

  return () => {
    stop();
    canvas.removeEventListener('pointerdown', pointerdown);
    canvas.removeEventListener('pointermove', pointermove);
    canvas.removeEventListener('pointerup', pointerup);
    canvas.removeEventListener('pointercancel', pointercancel);
    canvas.remove();
  };
}

// ---------- 23. Element Trail (パズル, Longcat風スライド塗りつぶし) ----------
// task108 (MSI, 2026-08-21): poki.com/jp/g/longcatを実際にChromeで操作して分析した結果、
// 核心メカニクスは「1マスずつ移動」ではなく「入力方向へ壁/障害物/自分の跡にぶつかるまで
// 一気にスライドする」ことだと判明(既存の『ぜんぶぬろう!』task68/85はTiho1マス移動で別物)。
// 既存ゲーム・Toshibaのマップ生成ループ(task85)とは競合しないよう、これは新規の別ゲームとして
// own codeで実装。キャラクターはPokiの猫キャラではなく、この10体のエレメント精霊を使用
// (画像アセットは使わず、trapdojo.js/characters.jsのELEMENT_COLORSと同じ配色をcanvas上に
// 手続き的に描画。全10属性を即カバーでき、画像生成・ダウンロード待ちが不要なため)。
// 8ステージは全て、幅優先探索の自作ソルバーで実際に解けることを検証済み(推測なし)。
const TRAIL_LEVELS = [
  { start: [1, 2], rows: ['... ', '... ', ' ...', ' ...'] },
  { start: [0, 0], rows: ['....', '....', '....', '....'] },
  { start: [3, 1], rows: ['X .. ', '.....', '.....', '   ..', '   ..'] },
  { start: [0, 2], rows: ['..  ..', '..  ..', '......', '......'] },
  { start: [3, 1], rows: ['......', '....X.', '......', '..    ', ' .    '] },
  { start: [3, 2], rows: ['   .. ', '  ... ', '..... ', ' .... ', 'X.... ', ' ....X'] },
  { start: [2, 4], rows: [' ..   ', ' ....X', ' .....', ' .....', '....  ', '....  ', '  ..  '] },
  { start: [0, 4], rows: ['....', '....', '....', '....', '....', '....', '.X..', '. ..'] },
];
const TRAIL_ELEMENTS = [
  { id: 'blaze', core: '#ff5a3c' }, { id: 'aqua', core: '#3ba7ff' }, { id: 'volt', core: '#ffe14d' },
  { id: 'gust', core: '#4de0c0' }, { id: 'terra', core: '#b8834f' }, { id: 'frost', core: '#9fe8ff' },
  { id: 'light', core: '#fff2b3' }, { id: 'nox', core: '#8b5cf6' }, { id: 'leaf', core: '#4caf50' },
  { id: 'plasma', core: '#ff3ec8' },
];
function mountTrail(container, { onScore, onHint }) {
  onHint(gt('hint_trail', '矢印/ボタンで進む方向へ、壁か障害物まで一気にスライド！全マスを塗りつぶそう'));
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  const reportBest = makeBestTracker('trail', onHint);
  // Same fix as mountFillItAll above: HUD_H must clear the app's own fixed #user-bar/
  // .score-badge overlays (see style.css), not just be a small cosmetic top margin.
  const HUD_H = 110, PAD = 8;
  let cols, rowsN, grid, cell, offsetX, offsetY;
  let levelIdx, head, filled, targetCount, score, dead, particles, element, transitioning;

  function parseLevel(lv) {
    rowsN = lv.rows.length;
    cols = Math.max(...lv.rows.map((r) => r.length));
    grid = lv.rows.map((r) => r.padEnd(cols, ' '));
  }
  function layoutBoard() {
    cell = Math.max(16, Math.min(46, Math.floor(Math.min(
      (canvas.width - PAD * 2) / cols,
      (canvas.height - HUD_H - PAD * 2) / rowsN
    ))));
    offsetX = Math.floor((canvas.width - cols * cell) / 2);
    offsetY = HUD_H + Math.floor((canvas.height - HUD_H - rowsN * cell) / 2);
  }
  function isFloor(c, r) { return c >= 0 && c < cols && r >= 0 && r < rowsN && grid[r][c] !== ' '; }
  function isObstacle(c, r) { return isFloor(c, r) && grid[r][c] === 'X'; }
  function passable(c, r) { return isFloor(c, r) && !isObstacle(c, r); }
  function anyMoveLeft() {
    for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nc = head.x + dc, nr = head.y + dr;
      if (passable(nc, nr) && !filled.has(nc + ',' + nr)) return true;
    }
    return false;
  }
  function startLevel(idx) {
    const lv = TRAIL_LEVELS[idx % TRAIL_LEVELS.length];
    parseLevel(lv);
    layoutBoard();
    element = TRAIL_ELEMENTS[idx % TRAIL_ELEMENTS.length];
    head = { x: lv.start[0], y: lv.start[1] };
    filled = new Set([head.x + ',' + head.y]);
    targetCount = 0;
    for (let r = 0; r < rowsN; r++) for (let c = 0; c < cols; c++) if (passable(c, r)) targetCount++;
    dead = false; particles = []; transitioning = false;
  }
  levelIdx = 0; score = 0; startLevel(levelIdx);

  function slide(dir) {
    if (dead || !dir || transitioning) return;
    let x = head.x, y = head.y, moved = 0;
    while (true) {
      const nx = x + dir.x, ny = y + dir.y;
      if (!passable(nx, ny)) break;
      const key = nx + ',' + ny;
      if (filled.has(key)) break;
      x = nx; y = ny; filled.add(key); moved++;
      spawnBurst(particles, offsetX + x * cell + cell / 2, offsetY + y * cell + cell / 2, element.core, 4);
    }
    if (moved === 0) { shakeEl(canvas); return; }
    head = { x, y };
    score += moved; onScore(score); reportBest(score);
    sfx.score(Math.min(moved, 6));
    if (filled.size >= targetCount) {
      sfx.win(); score += 20; onScore(score); reportBest(score);
      transitioning = true;
      onHint(gt('hint_trail_clear', 'クリア！次のステージへ'));
      setTimeout(() => { levelIdx++; startLevel(levelIdx); }, 420);
      return;
    }
    if (!anyMoveLeft()) {
      dead = true; sfx.gameover(); flashEl(canvas); reportBest(score);
      onHint(gt('hint_trail_stuck', '手詰まり…タップでこのステージをやり直し'));
    }
  }
  const DIR = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  function keydown(e) {
    const key = {
      ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down',
      ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
    }[e.key];
    if (key) { e.preventDefault(); slide(DIR[key]); }
  }
  window.addEventListener('keydown', keydown);
  const dpad = makeDpad(container, (key) => slide(DIR[key]));
  function tapCanvas() { if (dead) startLevel(levelIdx); }
  canvas.addEventListener('pointerdown', tapCanvas);

  function drawFace(cx, cy, r, color) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#1a1a2a';
    ctx.beginPath(); ctx.arc(cx - r * 0.32, cy - r * 0.08, r * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * 0.32, cy - r * 0.08, r * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy + r * 0.18, r * 0.28, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }
  const stop = loopRAF((dt) => {
    ctx.fillStyle = '#12121e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < rowsN; r++) for (let c = 0; c < cols; c++) {
      if (!isFloor(c, r)) continue;
      const x = offsetX + c * cell, y = offsetY + r * cell;
      if (isObstacle(c, r)) {
        ctx.fillStyle = '#2a2a38';
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.strokeRect(x + 4, y + 4, cell - 8, cell - 8);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      }
    }
    for (const key of filled) {
      const [c, r] = key.split(',').map(Number);
      if (c === head.x && r === head.y) continue;
      ctx.fillStyle = element.core;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(offsetX + c * cell + 2, offsetY + r * cell + 2, cell - 4, cell - 4);
      ctx.globalAlpha = 1;
    }
    drawFace(offsetX + head.x * cell + cell / 2, offsetY + head.y * cell + cell / 2, cell * 0.42, dead ? '#777' : element.core);
    drawBurst(ctx, particles, dt);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`Lv.${levelIdx + 1}  ${filled.size}/${targetCount}`, 8, 100);
    if (dead) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(gt('restart_hint_button', 'タップ/ボタンでリスタート'), canvas.width / 2, canvas.height / 2);
    }
  });

  return () => {
    stop();
    window.removeEventListener('keydown', keydown);
    canvas.removeEventListener('pointerdown', tapCanvas);
    dpad.remove();
    canvas.remove();
  };
}

const GAME_DEFS = [
  { id: 'dodge', title: 'ブロック避け', genre: 'アクション', mount: mountDodge,
    params: [{ key: 'blockSpeed', label: 'ブロックの速さ', min: 120, max: 400, step: 20, default: 180 }] },
  { id: 'memory', title: '神経衰弱', genre: '記憶', mount: mountMemory,
    choiceParams: [{ key: 'symbols', label: 'キャラクターを8個選ぶ', count: 8,
      options: ['🐱','🐶','🐼','🦊','🐸','🐵','🦁','🐯','🐰','🐹','🐨','🦄','🐷','🐮','🐔','🦋','🐢','🐙'] }] },
  { id: 'flap', title: 'はばたき飛行', genre: 'アクション', mount: mountFlap,
    params: [{ key: 'gravity', label: '重力の強さ', min: 600, max: 1200, step: 50, default: 900 }] },
  { id: 'slide', title: 'エレメント・グリッド', genre: 'パズル', mount: mountSlide },
  { id: 'stack', title: '積み上げタワー', genre: 'タイミング', mount: mountStack,
    params: [{ key: 'speedStart', label: 'ブロックの速さ', min: 80, max: 240, step: 10, default: 140 }] },
  { id: 'aim', title: 'ねらえ！ピタッとタイミング', genre: 'タイミング', mount: mountAim,
    params: [{ key: 'startSpeed', label: 'マーカーの速さ', min: 120, max: 360, step: 20, default: 220 }] },
  { id: 'merge', title: 'エレメント・フュージョン', genre: 'パズル', mount: mountMerge,
    params: [{ key: 'autoDropAfter', label: '自動落下までの時間(秒)', min: 1.5, max: 6, step: 0.5, default: 3.2 }] },
  // No params/choiceParams: the whole "config" IS the user-drawn config.layout grid (see
  // maze-editor.js), there's nothing left to slider-tune once a course is posted.
  { id: 'mymaze', title: '自分のコース', genre: 'アクション', mount: mountMyMaze },
  // Original puzzle inspired by grid-covering snake games (poki.com/jp/g/longcat) at the
  // user's request, 2026-08-14 — own code/art, not a copy. See mountFillItAll above.
  { id: 'fillitall', title: 'ぜんぶぬろう！', genre: 'パズル', mount: mountFillItAll },
  // Original 3D air-combat game (2026-08-14 user request). See mountSkyDuel above.
  { id: 'skyduel', title: 'スカイデュエル', genre: 'アクション', mount: mountSkyDuel },
  // task63: realtime N-player battle royale. Lives in its own file (royale.js, loaded after
  // this one) since it needs its own Supabase realtime client + a lot of sync/combat code that
  // doesn't belong in this file's solo-game collection. Wrapped in an arrow function (rather
  // than `mount: window.RoyaleGame.mount` directly) so the window.RoyaleGame lookup happens at
  // mount-CALL time, not at this array's construction time -- a card only actually mounts long
  // after every <script> tag has loaded, so this works regardless of the two files' load order.
  { id: 'royale', title: 'エレメント・ロワイヤル', genre: 'アクション',
    mount: (container, cbs, config) => window.RoyaleGame.mount(container, cbs, config) },
  // task63/82: the other half of the "エレメント" ruleset pair (4vs4 soccer). Same deferred-
  // wrapper reasoning as 'royale' above -- window.CupGame is looked up at mount-call time so
  // load order between cup.js and this file doesn't matter.
  { id: 'cup', title: 'エレメント・カップ', genre: 'アクション',
    mount: (container, cbs, config) => window.CupGame.mount(container, cbs, config) },
  // task80: Level Devil-inspired "1 screen, 1 mean trick" platformer. Solo + 4-player coop
  // (quick-match via time-windowed Supabase room key, see trapdojo.js runCoop). Own file for
  // the same reason as royale/cup: its own Supabase realtime client + a lot of stage/physics
  // code that doesn't belong in this file. Same deferred-wrapper reasoning as royale/cup above.
  { id: 'trapdojo', title: 'トラップ道場', genre: 'アクション',
    mount: (container, cbs, config) => window.TrapDojo.mount(container, cbs, config) },
  // task86: Monkey Mart(Poki上位常連)着想のタップ経営スコアアタック。既存10属性精霊を
  // お客さん役にした自作オリジナル。SPIRITSHOP_ELEMENTS/mountSpiritShop定義は本ファイル上部。
  { id: 'spiritshop', title: 'スピリット・ショップ', genre: 'アクション', mount: mountSpiritShop,
    params: [{ key: 'patienceSec', label: 'お客さんの待ち時間(秒)', min: 3.5, max: 8, step: 0.5, default: 6 }] },
  // task86: Subway Surfers/Temple Run型(Poki上位常連)着想の横スクロール障害物よけ
  // ランナー。ジャンプ/スライディングの核メカニクスだけを抽出した自作オリジナル。
  // mountRunner定義は本ファイル上部。
  { id: 'runner', title: '障害物よけランナー', genre: 'アクション', mount: mountRunner,
    params: [{ key: 'obstacleSpeedStart', label: '障害物の速さ', min: 180, max: 360, step: 20, default: 260 }] },
  // task86: Onet Connect/PaoPao(Yandex Games定番)着想のペアマッチパズル。曲がり角2回以内
  // でつながる同じ精霊2枚を消す自作オリジナル。mountConnect定義は本ファイル上部。
  { id: 'connect', title: 'エレメント・コネクト', genre: 'パズル', mount: mountConnect },
  // 2026-08-20 DELL: 縦型フィード専用の新規3Dゲーム。回転するタワーのリングを縫って落ち続ける
  // オリジナル降下ゲーム(genre-inspiredだがどの既存作品のコード・素材も再利用していない、
  // 独自の10属性テーマ+ゲート/ハザード判定)。own file(spiral.js)なので royale/cup/trapdojo と
  // 同じ理由でdeferred-wrapper(mount-call時にwindow.mountSpiralを解決、load順に依存しない)。
  { id: 'spiral', title: 'エレメント・スパイラル', genre: 'アクション',
    mount: (container, cbs, config) => window.mountSpiral(container, cbs, config) },
  // task108 (MSI, 2026-08-21): Poki実機調査(トレンド4位"Blocky Blast Puzzle")+事前調査の
  // Hexellent着想。六角形グリッドの同色連結タップ消し。own code/オリジナル。
  { id: 'hex', title: 'エレメント・ヘクス', genre: 'パズル', mount: mountHex },
  // task108 (MSI, 2026-08-21): ロードマップの実装順2本目。Water Sort Puzzle着想の色分けソート
  // パズル。own code/オリジナル。
  { id: 'flow', title: 'エレメント・フロー', genre: 'パズル', mount: mountFlow },
  // task108 (MSI, 2026-08-22): ロードマップの実装順3本目・最後。Drive Mad/Marble Run 3D着想の
  // 左右チルト物理バランス走行。own file(marble.js)なので royale/cup/trapdojo/spiral と同じ
  // 理由でdeferred-wrapper(mount-call時にwindow.mountMarbleを解決、load順に依存しない)。
  { id: 'marble', title: 'エレメント・マーブル', genre: 'アクション',
    mount: (container, cbs, config) => window.mountMarble(container, cbs, config) },
  // 2026-08-22 (MSI, user request): Clash Royale-inspired 1-lane tower push duel vs AI. See
  // mountFort above for the full design-scoping rationale.
  { id: 'fort', title: 'エレメント・フォート', genre: 'アクション', mount: mountFort },
  // task108 (MSI, 2026-08-22): poki.com/jp/g/longcatを実機Chromeで操作分析した結果着想の
  // スライド塗りつぶしパズル。own code/オリジナル。8ステージは自作BFSソルバーで解けることを
  // 検証済み。詳細はmountTrail定義部のコメント参照。
  { id: 'trail', title: 'エレメント・トレイル', genre: 'パズル', mount: mountTrail },
];

window.GAME_DEFS = GAME_DEFS;

// task55 Phase2 (2026-08-15, Toshiba): translate GAME_DEFS' title/genre in place whenever the
// language changes, instead of touching every one of the dozen+ app.js call sites that read
// def.title/def.genre directly. Original Japanese is kept on _jaTitle/_jaGenre so switching
// back to 'ja' (or any language missing a specific game's translation) always has a safe
// fallback. This file loads before i18n.js (see index.html script order), so `window.I18N`
// isn't available yet at top-level here -- app.js calls window.applyGameDefsI18n() once after
// i18n.js is loaded, and registers it with I18N.onLangChange for live switching.
const GENRE_KEY_BY_JA = { 'アクション': 'action', 'タイミング': 'timing', 'パズル': 'puzzle', '記憶': 'memory' };
GAME_DEFS.forEach((def) => {
  def._jaTitle = def.title; def._jaGenre = def.genre;
  (def.params || []).forEach((p) => { p._jaLabel = p.label; });
  (def.choiceParams || []).forEach((p) => { p._jaLabel = p.label; });
});
function applyGameDefsI18n() {
  if (!window.I18N) return;
  const t = window.I18N.t;
  GAME_DEFS.forEach((def) => {
    def.title = t('game_title_' + def.id);
    if (def.title === 'game_title_' + def.id) def.title = def._jaTitle; // no translation for this game yet -> ja fallback
    const genreKey = GENRE_KEY_BY_JA[def._jaGenre];
    def.genre = genreKey ? t('genre_' + genreKey) : def._jaGenre;
    if (def.genre === 'genre_' + genreKey) def.genre = def._jaGenre;
    // task55 Phase4 (2026-08-15): same in-place-translate pattern for the create-post form's
    // slider/choice labels (renderCreateForm in app.js reads p.label directly, unchanged).
    (def.params || []).forEach((p) => {
      const key = 'param_label_' + def.id + '_' + p.key;
      p.label = t(key);
      if (p.label === key) p.label = p._jaLabel;
    });
    (def.choiceParams || []).forEach((p) => {
      const key = 'param_label_' + def.id + '_' + p.key;
      p.label = t(key);
      if (p.label === key) p.label = p._jaLabel;
    });
  });
}
window.applyGameDefsI18n = applyGameDefsI18n;
