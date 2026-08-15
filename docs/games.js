// Anyway - lightweight, safe, self-contained mini games.
// Every mount(container, {onScore, onHint}) returns a cleanup() function.
// No network calls, no eval, no external assets — pure canvas/DOM + JS.

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
function flashEl(el, ms = 120) {
  el.style.filter = 'brightness(1.6) saturate(1.3)';
  setTimeout(() => { el.style.filter = ''; }, ms);
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
      if (onHint && count >= 3 && count % 3 === 0) onHint(`🔥 ${count}連続！`);
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
      if (!announced) { announced = true; if (onHint) onHint(`🏆 自己ベスト更新！ ${score}`); }
    }
  };
}

// ---------- 2. Dodge (アクション) ----------
function mountDodge(container, { onScore, onHint }, config = {}) {
  const blockSpeed = config.blockSpeed ?? 180;
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  onHint('画面の左右をタップ、またはA/Dキーで避けろ！');
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
      const py = canvas.height - 70;
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
    ctx.fillRect(px - pw / 2, canvas.height - 70 - ph / 2, pw, ph);
    drawBurst(ctx, burst, dt);
    if (dead) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('やられた…もう一回', canvas.width / 2, canvas.height / 2);
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
  onHint('2枚めくってペアを揃えよう');
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
function mountFlap(container, { onScore, onHint }, config = {}) {
  const gravity = config.gravity ?? 900;
  onHint('タップで羽ばたいてパイプを避けよう');
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  let by, bv, pipes, score, dead, t, particles;
  const reportBest = makeBestTracker('flap', onHint);
  function reset() {
    by = canvas.height / 2; bv = 0; pipes = []; score = 0; dead = false; t = 0; particles = [];
  }
  reset();
  function flap() {
    if (dead) { reset(); return; }
    bv = -320;
    spawnBurst(particles, bx, by + 10, '#ffd23f', 3);
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
    ctx.fillStyle = '#2f7d4f';
    for (const p of pipes) {
      ctx.fillRect(p.x - 22, 0, 44, p.gy);
      ctx.fillRect(p.x - 22, p.gy + p.gap, 44, canvas.height - p.gy - p.gap);
    }
    ctx.fillStyle = dead ? '#888' : '#ffd23f';
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    drawBurst(ctx, particles, dt);
    if (dead) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('タップでリスタート', canvas.width / 2, canvas.height / 2);
    }
  });

  return () => { stop(); canvas.removeEventListener('pointerdown', flap); canvas.remove(); };
}

// ---------- 10. Slide 2048-lite (パズル) ----------
function mountSlide(container, { onScore, onHint }) {
  onHint('下のボタンで同じ数字を合体させよう(上下スワイプは次のゲームへ移動します)');
  const wrap = document.createElement('div');
  wrap.className = 'grid-dom';
  wrap.style.gridTemplateColumns = 'repeat(4, 1fr)';
  wrap.style.width = 'min(85vw, 320px)';
  wrap.style.height = 'min(85vw, 320px)';
  wrap.style.background = '#1a1a1a';
  container.appendChild(wrap);

  let grid, score, lastAdded, mergedCells;
  const palette = { 2: '#3a3a55', 4: '#3a4a55', 8: '#4a5a45', 16: '#5a5a35', 32: '#6a4a35', 64: '#7a3a35', 128: '#8a3a55' };
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
      const el = document.createElement('div');
      el.className = 'dom-cell';
      el.style.aspectRatio = '1';
      el.style.background = v ? (palette[v] || '#9a3a55') : '#2a2a2a';
      el.style.fontSize = '16px'; el.style.fontWeight = '700';
      el.textContent = v || '';
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
  onHint('タップでブロックを重ねよう。ぴったり合わせるほど高得点！');
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

  function baseYFor(layerIdx) { return (canvas.height - 40) - (layerIdx * layerH) + camY; }

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
      if (perfectStreak >= 3 && perfectStreak % 3 === 0) onHint(`🔥 ${perfectStreak}回連続ぴったり！`);
    } else {
      perfectStreak = 0;
      beep(420, 0.07, 'sine', 0.1);
      spawnBurst(particles, left + overlap / 2, hitY, '#8892b0', 5);
    }
    const visibleLayers = Math.floor((canvas.height - 80) / layerH);
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
    const baseY = canvas.height - 40;
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
      ctx.fillText('タップでリスタート', canvas.width / 2, canvas.height / 2);
    }
  });

  return () => { stop(); canvas.removeEventListener('pointerdown', drop); canvas.remove(); };
}

// ---------- 12. Aim Timing (タイミング) ----------
function mountAim(container, { onScore, onHint }, config = {}) {
  const startSpeed = config.startSpeed ?? 220;
  onHint('マーカーが緑の枠に来た瞬間にタップ！外すとライフが減るよ');
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
    ctx.fillText(dead ? 'タップでリスタート' : 'タップでストップ！', canvas.width / 2, barY - 40);
    for (let i = 0; i < maxLives; i++) {
      ctx.fillStyle = i < lives ? '#ff4b4b' : 'rgba(255,255,255,0.2)';
      ctx.beginPath(); ctx.arc(barX + 10 + i * 22, barY + 40, 7, 0, Math.PI * 2); ctx.fill();
    }
    drawBurst(ctx, particles, dt);
  });

  return () => { stop(); canvas.removeEventListener('pointerdown', tap); canvas.remove(); };
}

// ---------- 15. Merge Drop (パズル, スイカゲーム風) ----------
// Fruits fall under simple gravity into a walled container; touching same-tier fruits merge
// into the next tier. No physics engine — a handful of Euler-integrated circles with a couple
// of resolution passes per frame is plenty stable at the low body counts this game produces.
const MERGE_FRUITS = [
  { emoji: '🍒', color: '#ff4d6d', rf: 0.048 },
  { emoji: '🍓', color: '#ff3355', rf: 0.062 },
  { emoji: '🍇', color: '#9b5fff', rf: 0.078 },
  { emoji: '🍊', color: '#ff9f2e', rf: 0.096 },
  { emoji: '🍎', color: '#ff4433', rf: 0.116 },
  { emoji: '🍐', color: '#b8e04a', rf: 0.138 },
  { emoji: '🍑', color: '#ffb3c6', rf: 0.162 },
  { emoji: '🍉', color: '#31d158', rf: 0.19 },
];
function mountMerge(container, { onScore, onHint }, config = {}) {
  onHint('ドラッグで位置を決めて指を離すと落下。同じ果物同士をくっつけて合体させよう！');
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  const reportBest = makeBestTracker('merge', onHint);
  const combo = makeCombo(1200);
  const wallX = 10;
  const floorY = canvas.height - 10;
  const overLineY = canvas.height * 0.16;
  const dropY = canvas.height * 0.09;
  const autoDropAfter = config.autoDropAfter ?? 3.2;
  const gravity = 980;

  let bodies, score, dead, particles, dragging, activeTier, nextTier, activeX, dropTimer, overTimer, popText;
  function radiusFor(tier) { return Math.max(10, canvas.width * MERGE_FRUITS[tier].rf); }
  function pickTier() {
    const maxTier = Math.min(2 + Math.floor(score / 40), 4);
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
  }
  reset();

  function clampActiveX() {
    const r = radiusFor(activeTier);
    activeX = Math.max(wallX + r, Math.min(canvas.width - wallX - r, activeX));
  }
  function dropActive() {
    if (dead || !bodies) return;
    const r = radiusFor(activeTier);
    bodies.push({ x: activeX, y: dropY + r, vx: 0, vy: 40, r, tier: activeTier, settle: 0 });
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

  function mergeAt(i, j) {
    const a = bodies[i], b = bodies[j];
    const newTier = a.tier + 1;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const combo_n = combo.hit(onHint);
    if (newTier >= MERGE_FRUITS.length) {
      score += 40; onScore(score); reportBest(score);
      sfx.win();
      spawnBurst(particles, mx, my, '#ffd23f', 24);
      popText.push({ x: mx, y: my, t: 0, text: '🎉 MEGA!' });
    } else {
      score += (newTier + 1) * 4; onScore(score); reportBest(score);
      spawnBurst(particles, mx, my, MERGE_FRUITS[newTier].color, 10 + newTier * 2);
      popText.push({ x: mx, y: my, t: 0, text: `+${(newTier + 1) * 4}` });
      bodies.push({ x: mx, y: my, vx: 0, vy: -60, r: radiusFor(newTier), tier: newTier, settle: 0 });
    }
    bodies.splice(Math.max(i, j), 1);
    bodies.splice(Math.min(i, j), 1);
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
        if (merges.length) { merges.sort((m1, m2) => Math.max(...m2) - Math.max(...m1)); merges.forEach(([i, j]) => mergeAt(i, j)); }
        else break;
      }

      let overNow = false;
      for (const bd of bodies) { if (bd.settle !== undefined && bd.y - bd.r < overLineY && Math.abs(bd.vy) < 40) overNow = true; }
      overTimer = overNow ? overTimer + dt : Math.max(0, overTimer - dt * 2);
      if (overTimer > 1.1) {
        dead = true; sfx.gameover(); flashEl(canvas); reportBest(score);
      }
    }

    ctx.fillStyle = '#1a2440'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(wallX, overLineY); ctx.lineTo(canvas.width - wallX, overLineY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 3;
    ctx.strokeRect(wallX, overLineY, canvas.width - wallX * 2, floorY - overLineY);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const bd of bodies) {
      const f = MERGE_FRUITS[bd.tier];
      ctx.beginPath(); ctx.fillStyle = f.color; ctx.arc(bd.x, bd.y, bd.r, 0, Math.PI * 2); ctx.fill();
      ctx.font = `${Math.round(bd.r * 1.3)}px sans-serif`;
      ctx.fillText(f.emoji, bd.x, bd.y + bd.r * 0.05);
    }

    if (!dead) {
      const r = radiusFor(activeTier);
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.fillStyle = MERGE_FRUITS[activeTier].color; ctx.arc(activeX, dropY + r, r, 0, Math.PI * 2); ctx.fill();
      ctx.font = `${Math.round(r * 1.3)}px sans-serif`;
      ctx.fillText(MERGE_FRUITS[activeTier].emoji, activeX, dropY + r + r * 0.05);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(activeX, dropY + r * 2); ctx.lineTo(activeX, floorY); ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('NEXT', canvas.width - wallX - 22, 16);
      const nr = Math.min(16, radiusFor(nextTier) * 0.55);
      ctx.beginPath(); ctx.fillStyle = MERGE_FRUITS[nextTier].color; ctx.arc(canvas.width - wallX - 22, 40, nr, 0, Math.PI * 2); ctx.fill();
      ctx.font = `${Math.round(nr * 1.3)}px sans-serif`; ctx.fillStyle = '#fff';
      ctx.fillText(MERGE_FRUITS[nextTier].emoji, canvas.width - wallX - 22, 40 + nr * 0.05);
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
      ctx.fillText('ゲームオーバー', canvas.width / 2, canvas.height / 2 - 16);
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('タップでリスタート', canvas.width / 2, canvas.height / 2 + 14);
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
  onHint('矢印キー/下のパッドでゴール🏁を目指せ！壁は通れない、危険マスでライフが減る');

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
      if (lives <= 0) { dead = true; sfx.gameover(); onHint('タップでリスタート'); }
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
    ctx.fillText('❤️'.repeat(Math.max(0, lives)), 8, 20);
    if (dead) {
      ctx.textAlign = 'center'; ctx.font = 'bold 16px sans-serif';
      ctx.fillText('タップでリスタート', canvas.width / 2, canvas.height / 2);
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
function mountFillItAll(container, { onScore, onHint }, config = {}) {
  onHint('下のボタン(WASD/矢印キーもOK)で1マスずつ進み、部屋のマスを全部ぬろう。自分の跡に触れたら終了！');
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  const cell = 26;
  const cols = Math.max(4, Math.floor(canvas.width / cell));
  const rows = Math.max(4, Math.floor(canvas.height / cell));
  const reportBest = makeBestTracker('fillitall', onHint);

  let level = 1, filled, trail, head, score = 0, dead = false, particles = [], levelCells = 0, transitioning = false;

  function levelSize() {
    // Grows the covered target each level, capped at the full board so later levels stay
    // beatable within the fixed canvas grid rather than needing an ever-bigger board.
    return Math.min(cols * rows, 8 + level * 4);
  }

  function startLevel() {
    filled = new Set();
    trail = [];
    levelCells = levelSize();
    head = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
    trail.push(head);
    filled.add(head.y * cols + head.x);
    dead = false;
  }
  startLevel();

  const dirMap = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  function step(d) {
    if (dead || !d || transitioning) return;
    const nx = head.x + d.x, ny = head.y + d.y;
    // Bumping the room's edge is just a blocked move (this is a bounded puzzle room, not a
    // hazard) — only crossing your own trail actually ends the run, matching the original
    // "尻尾が頭に追いつくとゲームオーバー" self-collision rule.
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) { shakeEl(canvas); return; }
    const idx = ny * cols + nx;
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
    spawnBurst(particles, nx * cell + cell / 2, ny * cell + cell / 2, '#31d158', 6);
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

  const stop = loopRAF((dt) => {
    ctx.fillStyle = '#101418'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let x = 0; x <= cols; x++) { ctx.beginPath(); ctx.moveTo(x * cell, 0); ctx.lineTo(x * cell, rows * cell); ctx.stroke(); }
    for (let y = 0; y <= rows; y++) { ctx.beginPath(); ctx.moveTo(0, y * cell); ctx.lineTo(cols * cell, y * cell); ctx.stroke(); }
    ctx.fillStyle = '#3fa7ff';
    for (const p of trail) ctx.fillRect(p.x * cell + 1, p.y * cell + 1, cell - 2, cell - 2);
    ctx.fillStyle = dead ? '#777' : '#ffd23f';
    ctx.fillRect(head.x * cell + 1, head.y * cell + 1, cell - 2, cell - 2);
    drawBurst(ctx, particles, dt);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`Lv.${level}  ${filled.size}/${levelCells}`, 8, 18);
    if (dead) {
      ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('タップ/ボタンでリスタート', canvas.width / 2, canvas.height / 2);
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
  onHint('ジョイスティックで操縦、自動で発射！敵を撃墜してスコアを稼ごう。右下ボタンでブースト');
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
  overlay.textContent = 'タップでリスタート';
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

const GAME_DEFS = [
  { id: 'dodge', title: 'ブロック避け', genre: 'アクション', mount: mountDodge,
    params: [{ key: 'blockSpeed', label: 'ブロックの速さ', min: 120, max: 400, step: 20, default: 180 }] },
  { id: 'memory', title: '神経衰弱', genre: '記憶', mount: mountMemory,
    choiceParams: [{ key: 'symbols', label: 'キャラクターを8個選ぶ', count: 8,
      options: ['🐱','🐶','🐼','🦊','🐸','🐵','🦁','🐯','🐰','🐹','🐨','🦄','🐷','🐮','🐔','🦋','🐢','🐙'] }] },
  { id: 'flap', title: 'はばたき飛行', genre: 'アクション', mount: mountFlap,
    params: [{ key: 'gravity', label: '重力の強さ', min: 600, max: 1200, step: 50, default: 900 }] },
  { id: 'slide', title: 'スライド合体パズル', genre: 'パズル', mount: mountSlide },
  { id: 'stack', title: '積み上げタワー', genre: 'タイミング', mount: mountStack,
    params: [{ key: 'speedStart', label: 'ブロックの速さ', min: 80, max: 240, step: 10, default: 140 }] },
  { id: 'aim', title: 'ねらえ！ピタッとタイミング', genre: 'タイミング', mount: mountAim,
    params: [{ key: 'startSpeed', label: 'マーカーの速さ', min: 120, max: 360, step: 20, default: 220 }] },
  { id: 'merge', title: 'フルーツマージ', genre: 'パズル', mount: mountMerge,
    params: [{ key: 'autoDropAfter', label: '自動落下までの時間(秒)', min: 1.5, max: 6, step: 0.5, default: 3.2 }] },
  // No params/choiceParams: the whole "config" IS the user-drawn config.layout grid (see
  // maze-editor.js), there's nothing left to slider-tune once a course is posted.
  { id: 'mymaze', title: '自分のコース', genre: 'アクション', mount: mountMyMaze },
  // Original puzzle inspired by grid-covering snake games (poki.com/jp/g/longcat) at the
  // user's request, 2026-08-14 — own code/art, not a copy. See mountFillItAll above.
  { id: 'fillitall', title: 'ぜんぶぬろう！', genre: 'パズル', mount: mountFillItAll },
  // Original 3D air-combat game (2026-08-14 user request). See mountSkyDuel above.
  { id: 'skyduel', title: 'スカイデュエル', genre: 'アクション', mount: mountSkyDuel },
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
GAME_DEFS.forEach((def) => { def._jaTitle = def.title; def._jaGenre = def.genre; });
function applyGameDefsI18n() {
  if (!window.I18N) return;
  const t = window.I18N.t;
  GAME_DEFS.forEach((def) => {
    def.title = t('game_title_' + def.id);
    if (def.title === 'game_title_' + def.id) def.title = def._jaTitle; // no translation for this game yet -> ja fallback
    const genreKey = GENRE_KEY_BY_JA[def._jaGenre];
    def.genre = genreKey ? t('genre_' + genreKey) : def._jaGenre;
    if (def.genre === 'genre_' + genreKey) def.genre = def._jaGenre;
  });
}
window.applyGameDefsI18n = applyGameDefsI18n;
