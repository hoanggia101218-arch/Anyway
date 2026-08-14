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

// ---------- 1. Reaction (反射神経) ----------
function mountReaction(container, { onScore, onHint }, config = {}) {
  const maxWait = config.maxWait ?? 1500;
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  let score = 0, state = 'waiting', deadline = performance.now() + 500 + Math.random() * maxWait, readyDeadline = 0, msg = '';
  let burst = [];
  const combo = makeCombo();
  const reportBest = makeBestTracker('reaction', onHint);
  onHint('赤いうちは待って、緑になったらタップ！');

  // Difficulty curve: as score climbs, the target shrinks and the reaction window (time
  // allowed once it turns green before it counts as a miss) tightens — early taps stay forgiving.
  function radiusFor(s) { return Math.min(canvas.width, canvas.height) * 0.22 * Math.max(0.55, 1 - s * 0.03); }
  function reactionWindowFor(s) { return Math.max(500, 1100 - s * 35); }

  function onPointer() {
    if (state === 'ready') {
      score++; onScore(score);
      combo.hit(onHint);
      reportBest(score);
      msg = '';
      spawnBurst(burst, canvas.width / 2, canvas.height / 2, '#31d158', 14);
      state = 'waiting';
      deadline = performance.now() + 500 + Math.random() * maxWait;
    } else if (state === 'waiting') {
      msg = '早い！';
      combo.miss();
      deadline = performance.now() + 500 + Math.random() * maxWait;
    }
  }
  canvas.addEventListener('pointerdown', onPointer);

  const stop = loopRAF((dt, t) => {
    if (state === 'waiting' && t > deadline) { state = 'ready'; readyDeadline = t + reactionWindowFor(score); }
    if (state === 'ready' && t > readyDeadline) {
      msg = '遅い！';
      combo.miss();
      state = 'waiting';
      deadline = performance.now() + 500 + Math.random() * maxWait;
    }
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.fillStyle = state === 'ready' ? '#31d158' : '#ff4b4b';
    const r = radiusFor(score);
    ctx.arc(canvas.width / 2, canvas.height / 2, r, 0, Math.PI * 2);
    ctx.fill();
    drawBurst(ctx, burst, dt);
    ctx.fillStyle = '#fff'; ctx.font = '18px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(msg, canvas.width / 2, canvas.height / 2 + r + 36);
  });

  return () => { stop(); canvas.removeEventListener('pointerdown', onPointer); canvas.remove(); };
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

// ---------- 4. Whack (アクション) ----------
function mountWhack(container, { onScore, onHint }, config = {}) {
  const popDuration = config.popDuration ?? 700;
  onHint('光ったモグラを素早くタップ！');
  const wrap = document.createElement('div');
  wrap.className = 'grid-dom';
  wrap.style.gridTemplateColumns = 'repeat(3, 1fr)';
  wrap.style.width = 'min(85vw, 320px)';
  wrap.style.height = 'min(85vw, 320px)';
  container.appendChild(wrap);

  let score = 0, holes = [], activeIdx = -1, timer = null, hideTimer = null;
  const combo = makeCombo();
  const reportBest = makeBestTracker('whack', onHint);
  for (let i = 0; i < 9; i++) {
    const el = document.createElement('div');
    el.className = 'dom-cell';
    el.style.background = '#3a2a1a';
    el.style.aspectRatio = '1';
    el.style.fontSize = '30px';
    el.addEventListener('pointerdown', () => {
      if (i === activeIdx) {
        score++; onScore(score);
        combo.hit(onHint);
        reportBest(score);
        popScale(el, 1.3);
        el.textContent = '';
        activeIdx = -1;
        clearTimeout(hideTimer);
      } else {
        shakeEl(el);
        combo.miss();
      }
    });
    holes.push(el);
    wrap.appendChild(el);
  }
  function pop() {
    if (activeIdx !== -1) holes[activeIdx].textContent = '';
    activeIdx = Math.floor(Math.random() * 9);
    holes[activeIdx].textContent = '🐹';
    const dur = Math.max(320, popDuration - score * 10);
    hideTimer = setTimeout(() => {
      if (activeIdx !== -1) holes[activeIdx].textContent = '';
      activeIdx = -1;
    }, dur);
  }
  function schedule() {
    clearInterval(timer);
    timer = setInterval(pop, Math.max(420, 850 - score * 12));
  }
  schedule();
  pop();
  const rampTimer = setInterval(schedule, 2000);

  return () => { clearInterval(timer); clearInterval(rampTimer); clearTimeout(hideTimer); wrap.remove(); };
}

// ---------- 5. Simon (記憶) ----------
function mountSimon(container, { onScore, onHint }, config = {}) {
  onHint('光った順番どおりにボタンを押そう');
  const wrap = document.createElement('div');
  wrap.className = 'grid-dom';
  wrap.style.gridTemplateColumns = 'repeat(2, 1fr)';
  wrap.style.width = 'min(70vw, 260px)';
  wrap.style.height = 'min(70vw, 260px)';
  container.appendChild(wrap);

  const colors = (config.colors && config.colors.length === 4)
    ? config.colors
    : ['#ff4b4b', '#4ea8ff', '#ffd23f', '#31d158'];
  let seq = [], input = [], score = 0, playing = true, btns = [];
  const notes = [261.6, 329.6, 392.0, 523.3];
  const reportBest = makeBestTracker('simon', onHint);
  colors.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = 'dom-cell';
    el.style.background = c;
    el.style.opacity = '0.55';
    el.addEventListener('pointerdown', () => onPress(i));
    btns.push(el);
    wrap.appendChild(el);
  });

  function flash(i, dur = 380, play = true) {
    if (play) sfx.note(notes[i]);
    return new Promise(res => {
      btns[i].style.opacity = '1';
      setTimeout(() => { btns[i].style.opacity = '0.55'; res(); }, dur);
    });
  }
  async function playSeq() {
    playing = false;
    await new Promise(r => setTimeout(r, 400));
    for (const i of seq) { await flash(i); await new Promise(r => setTimeout(r, 150)); }
    playing = true; input = [];
  }
  function nextRound() { seq.push(Math.floor(Math.random() * 4)); playSeq(); }
  function onPress(i) {
    if (!playing) return;
    flash(i, 200);
    popScale(btns[i], 1.12, 160);
    input.push(i);
    const idx = input.length - 1;
    if (input[idx] !== seq[idx]) { sfx.bad(); shakeEl(wrap); seq = []; input = []; nextRound(); return; }
    if (input.length === seq.length) {
      score = Math.max(score, seq.length - 1); onScore(score);
      reportBest(score);
      sfx.win();
      btns.forEach((b, bi) => setTimeout(() => popScale(b, 1.08, 160), bi * 40));
      setTimeout(nextRound, 500);
    }
  }
  nextRound();

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

// ---------- 7. Math Rush (クイズ) ----------
function mountMathRush(container, { onScore, onHint }, config = {}) {
  const timeLimit = config.timeLimit ?? 5000;
  onHint('正しい答えをすばやくタップ！');
  const wrap = document.createElement('div');
  wrap.style.textAlign = 'center';
  wrap.style.width = '80vw';
  wrap.style.maxWidth = '340px';
  const q = document.createElement('div');
  q.style.fontSize = '40px'; q.style.fontWeight = '800'; q.style.marginBottom = '24px';
  const barWrap = document.createElement('div');
  barWrap.style.height = '6px'; barWrap.style.background = '#333'; barWrap.style.borderRadius = '3px'; barWrap.style.marginBottom = '24px';
  const bar = document.createElement('div');
  bar.style.height = '100%'; bar.style.background = '#fe2c55'; bar.style.borderRadius = '3px'; bar.style.width = '100%';
  barWrap.appendChild(bar);
  const ansWrap = document.createElement('div');
  ansWrap.style.display = 'grid'; ansWrap.style.gridTemplateColumns = 'repeat(3, 1fr)'; ansWrap.style.gap = '10px';
  wrap.appendChild(q); wrap.appendChild(barWrap); wrap.appendChild(ansWrap);
  container.appendChild(wrap);

  let score = 0, answer = 0, timeLeft = 0, total = 5000, timer, answered = false;
  const combo = makeCombo();
  const reportBest = makeBestTracker('mathrush', onHint);

  function newQuestion() {
    answered = false;
    const a = Math.floor(Math.random() * 20) + 1, b = Math.floor(Math.random() * 20) + 1;
    const op = Math.random() < 0.5 ? '+' : '-';
    answer = op === '+' ? a + b : a - b;
    q.textContent = `${a} ${op} ${b} = ?`;
    const opts = new Set([answer]);
    while (opts.size < 3) opts.add(answer + Math.floor(Math.random() * 9) - 4);
    const arr = [...opts].sort(() => Math.random() - 0.5);
    ansWrap.innerHTML = '';
    arr.forEach(v => {
      const b2 = document.createElement('button');
      b2.textContent = v; b2.className = 'dom-cell';
      b2.style.background = '#2a2a2a'; b2.style.color = '#fff'; b2.style.border = 'none';
      b2.style.padding = '14px 0'; b2.style.fontSize = '18px'; b2.style.borderRadius = '10px';
      b2.addEventListener('pointerdown', () => {
        if (answered) return;
        answered = true;
        if (v === answer) {
          score++; onScore(score);
          combo.hit(onHint);
          reportBest(score);
          b2.style.background = '#31d158';
          popScale(b2, 1.18);
        } else {
          combo.miss();
          b2.style.background = '#ff4b4b';
          shakeEl(b2);
        }
        setTimeout(newQuestion, 140);
      });
      ansWrap.appendChild(b2);
    });
    total = Math.max(1800, timeLimit - score * 120); timeLeft = total;
  }
  newQuestion();
  timer = setInterval(() => {
    if (answered) return;
    timeLeft -= 100;
    bar.style.width = Math.max(0, (timeLeft / total) * 100) + '%';
    if (timeLeft <= 0) { combo.miss(); newQuestion(); }
  }, 100);

  return () => { clearInterval(timer); wrap.remove(); };
}

// ---------- 8. Color Match (反射神経) ----------
function mountColorMatch(container, { onScore, onHint }) {
  onHint('表示された「文字の色」と同じ色を、時間内にタップ！');
  const wrap = document.createElement('div');
  wrap.style.textAlign = 'center'; wrap.style.width = '80vw'; wrap.style.maxWidth = '340px';
  const word = document.createElement('div');
  word.style.fontSize = '42px'; word.style.fontWeight = '800'; word.style.marginBottom = '20px';
  const barWrap = document.createElement('div');
  barWrap.style.height = '6px'; barWrap.style.background = '#333'; barWrap.style.borderRadius = '3px'; barWrap.style.marginBottom = '20px';
  const bar = document.createElement('div');
  bar.style.height = '100%'; bar.style.background = '#fe2c55'; bar.style.borderRadius = '3px'; bar.style.width = '100%';
  barWrap.appendChild(bar);
  const opts = document.createElement('div');
  opts.style.display = 'grid'; opts.style.gridTemplateColumns = 'repeat(2, 1fr)'; opts.style.gap = '12px';
  wrap.appendChild(word); wrap.appendChild(barWrap); wrap.appendChild(opts);
  container.appendChild(wrap);

  const names = [['あか', '#ff4b4b'], ['あお', '#4ea8ff'], ['みどり', '#31d158'], ['きいろ', '#ffd23f']];
  let score = 0, correctColor = '', timeLeft = 0, total = 2600, timer, answered = false;
  const combo = makeCombo();
  const reportBest = makeBestTracker('colormatch', onHint);

  function round() {
    answered = false;
    const textPick = names[Math.floor(Math.random() * 4)];
    const colorPick = names[Math.floor(Math.random() * 4)];
    word.textContent = textPick[0];
    word.style.color = colorPick[1];
    correctColor = colorPick[1];
    opts.innerHTML = '';
    const shuffled = [...names].sort(() => Math.random() - 0.5);
    shuffled.forEach(([n, c]) => {
      const b = document.createElement('button');
      b.className = 'dom-cell'; b.style.background = c; b.style.border = '3px solid transparent'; b.style.padding = '20px 0'; b.style.borderRadius = '10px';
      b.addEventListener('pointerdown', () => {
        if (answered) return;
        answered = true;
        if (c === correctColor) {
          score++; onScore(score);
          combo.hit(onHint);
          reportBest(score);
          b.style.borderColor = '#fff';
          popScale(b, 1.15);
        } else {
          combo.miss();
          shakeEl(b);
          flashEl(word);
        }
        setTimeout(round, 140);
      });
      opts.appendChild(b);
    });
    total = Math.max(1200, 2600 - score * 60); timeLeft = total;
  }
  round();
  timer = setInterval(() => {
    if (answered) return;
    timeLeft -= 100;
    bar.style.width = Math.max(0, (timeLeft / total) * 100) + '%';
    if (timeLeft <= 0) { combo.miss(); round(); }
  }, 100);

  return () => { clearInterval(timer); wrap.remove(); };
}

// ---------- 9. Snake (クラシック) ----------
function mountSnake(container, { onScore, onHint }, config = {}) {
  const startInterval = config.startInterval ?? 140;
  onHint('下のボタンで操作(WASD/矢印キーもOK)。上下スワイプは次のゲームへ移動します');
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  const cell = 18;
  const cols = Math.floor(canvas.width / cell), rows = Math.floor(canvas.height / cell);
  let snake, dir, food, score, acc, interval, dead, particles;
  const reportBest = makeBestTracker('snake', onHint);
  function reset() {
    snake = [{ x: Math.floor(cols / 2), y: Math.floor(rows / 2) }];
    dir = { x: 1, y: 0 }; score = 0; acc = 0; interval = startInterval; dead = false; particles = [];
    placeFood();
  }
  function placeFood() {
    food = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
  }
  reset();
  const dirMap = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  function applyDir(d) {
    if (d && !(d.x === -dir.x && d.y === -dir.y)) dir = d;
    if (dead) reset();
  }
  function keydown(e) {
    const key = {
      ArrowUp: 'up', w: 'up', W: 'up',
      ArrowDown: 'down', s: 'down', S: 'down',
      ArrowLeft: 'left', a: 'left', A: 'left',
      ArrowRight: 'right', d: 'right', D: 'right',
    }[e.key];
    if (key) applyDir(dirMap[key]);
  }
  window.addEventListener('keydown', keydown);
  const dpad = makeDpad(container, (key) => applyDir(dirMap[key]));
  function tapCanvas() { if (dead) reset(); }
  canvas.addEventListener('pointerdown', tapCanvas);

  const stop = loopRAF((dt) => {
    if (!dead) {
      acc += dt * 1000;
      if (acc > interval) {
        acc = 0;
        const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
        if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows || snake.some(s => s.x === head.x && s.y === head.y)) {
          dead = true;
          sfx.gameover(); flashEl(canvas);
          spawnBurst(particles, head.x * cell + cell / 2, head.y * cell + cell / 2, '#ff4b4b', 16);
          reportBest(score);
        } else {
          snake.unshift(head);
          if (head.x === food.x && head.y === food.y) {
            score++; onScore(score); interval = Math.max(70, interval - 2); placeFood();
            sfx.score(Math.min(score, 8));
            spawnBurst(particles, head.x * cell + cell / 2, head.y * cell + cell / 2, '#ffd23f', 8);
          } else snake.pop();
        }
      }
    }
    ctx.fillStyle = '#0e1a10'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ff4b4b'; ctx.fillRect(food.x * cell, food.y * cell, cell - 2, cell - 2);
    ctx.fillStyle = dead ? '#777' : '#31d158';
    for (const s of snake) ctx.fillRect(s.x * cell, s.y * cell, cell - 2, cell - 2);
    drawBurst(ctx, particles, dt);
    if (dead) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
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

// ---------- 13. Color Flow (反射神経) ----------
function mountFlow(container, { onScore, onHint }, config = {}) {
  const startSpeed = config.startSpeed ?? 160;
  onHint('上の丸と同じ色のボールだけをタップ！ミスするとライフが減るよ');
  const canvas = makeCanvas(container);
  const ctx = canvas.getContext('2d');
  const reportBest = makeBestTracker('flow', onHint);
  const combo = makeCombo();
  const maxLives = 3;
  const palette = (config.colors && config.colors.length === 4)
    ? config.colors
    : ['#ff4b4b', '#4ea8ff', '#31d158', '#ffd23f'];
  let target, balls, score, spawnT, lives, dead, particles = [];

  function pickTarget() { target = palette[Math.floor(Math.random() * palette.length)]; }
  function reset() { score = 0; balls = []; spawnT = 0; lives = maxLives; dead = false; particles = []; pickTarget(); }
  reset();

  function loseLife(x, y) {
    combo.miss();
    lives--;
    spawnBurst(particles, x, y, '#ff4b4b', 8);
    if (lives <= 0) { dead = true; sfx.gameover(); flashEl(canvas); reportBest(score); }
  }

  function spawn() {
    const color = palette[Math.floor(Math.random() * palette.length)];
    balls.push({ x: Math.random() * (canvas.width - 60) + 30, y: -20, r: 22, color });
  }
  function tapAt(x, y) {
    let hitIdx = -1;
    balls.forEach((b, i) => { if (hitIdx === -1 && Math.hypot(b.x - x, b.y - y) < b.r + 10) hitIdx = i; });
    if (hitIdx === -1) return;
    const b = balls[hitIdx];
    balls.splice(hitIdx, 1);
    if (b.color === target) {
      score++; onScore(score);
      combo.hit(onHint);
      reportBest(score);
      spawnBurst(particles, b.x, b.y, b.color, 10);
      pickTarget();
    } else {
      flashEl(canvas);
      loseLife(b.x, b.y);
    }
  }
  function pointerdown(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX ?? (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY ?? (e.touches && e.touches[0].clientY)) - rect.top;
    if (dead) { reset(); return; }
    tapAt(x, y);
  }
  canvas.addEventListener('pointerdown', pointerdown);

  const stop = loopRAF((dt) => {
    if (!dead) {
      spawnT += dt;
      const spawnEvery = Math.max(0.45, 1.1 - score * 0.02);
      if (spawnT > spawnEvery) { spawnT = 0; spawn(); }
      balls.forEach(b => b.y += (startSpeed + score * 4) * dt);
      balls = balls.filter(b => {
        if (b.y > canvas.height + 30) {
          if (b.color === target && !dead) loseLife(b.x, canvas.height - 10);
          return false;
        }
        return true;
      });
    }
    ctx.fillStyle = '#101020'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('ターゲット', canvas.width / 2, 22);
    ctx.beginPath(); ctx.fillStyle = target; ctx.arc(canvas.width / 2, 40, 12, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < maxLives; i++) {
      ctx.fillStyle = i < lives ? '#ff4b4b' : 'rgba(255,255,255,0.2)';
      ctx.beginPath(); ctx.arc(canvas.width / 2 - 36 + i * 20, 40, 6, 0, Math.PI * 2); ctx.fill();
    }
    balls.forEach(b => { ctx.beginPath(); ctx.fillStyle = b.color; ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); });
    drawBurst(ctx, particles, dt);
    if (dead) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('タップでリスタート', canvas.width / 2, canvas.height / 2);
    }
  });

  return () => { stop(); canvas.removeEventListener('pointerdown', pointerdown); canvas.remove(); };
}

// ---------- 14. Element Arena: full Season 1 "Element Awakening" roster (アクション) ----------
// One data-driven engine shared by all 10 characters — a new character is a data entry
// (stats/skills/passive/silhouette), not a new game. Character art is drawn procedurally in
// canvas (no external image assets yet) to match the reference sheets — swappable for real
// exported sprites later without touching the engine below (only drawTopper() would change).
//
// Each kit maps onto a small set of reusable skill types (dash / aoe / heal / buff / drain)
// so a character's 通常攻撃+スキル1-3+必殺技+パッシブ from the design sheet becomes config,
// not bespoke code.
const ELEMENT_CHARACTERS = {
  blaze: {
    name: 'ブレイズ', element: '炎', topper: 'flame', primaryColor: '#ff5a2b', secondaryColor: '#ffb020',
    baseHp: 100, baseAtk: 14, baseSpd: 160, normalAttackName: '3連続炎スラッシュ',
    skills: [
      { name: 'ファイアダッシュ', type: 'dash', cooldown: 4, mult: 1.5, color: '#ff8a3d', icon: '🔥' },
      { name: 'フレイムサークル', type: 'aoe', cooldown: 6, mult: 1.3, radius: 70, color: '#ff5a2b', icon: '🔥' },
      { name: 'バーニングチャージ', type: 'buff', cooldown: 9, duration: 4, color: '#ffd23f', icon: '⚡' },
    ],
    ultimate: { name: 'フェニックスバースト', mult: 3 },
    passive: { type: 'hp_scaling_atk', mid: 1.3, big: 1.6 },
  },
  aqua: {
    name: 'アクア', element: '水', topper: 'droplet', primaryColor: '#4ea8ff', secondaryColor: '#bfe6ff',
    baseHp: 110, baseAtk: 11, baseSpd: 150, normalAttackName: 'ウォーターボール',
    skills: [
      { name: 'ヒーリングレイン', type: 'heal', cooldown: 7, healRatio: 0.25, color: '#bfe6ff', icon: '💧' },
      { name: 'バブルシールド', type: 'buff', cooldown: 9, duration: 4, color: '#4ea8ff', icon: '🫧' },
      { name: 'オーシャンウェーブ', type: 'aoe', cooldown: 6, mult: 1.2, radius: 75, color: '#2f7dc9', icon: '🌊' },
    ],
    ultimate: { name: 'ピュアアクアバースト', mult: 2.6 },
    passive: { type: 'regen', rate: 3 },
  },
  volt: {
    name: 'ボルト', element: '雷', topper: 'lightning', primaryColor: '#ffd23f', secondaryColor: '#fff2a8',
    baseHp: 85, baseAtk: 13, baseSpd: 210, normalAttackName: 'ライトニングスラッシュ',
    skills: [
      { name: 'サンダーダッシュ', type: 'dash', cooldown: 3.5, mult: 1.4, color: '#ffd23f', icon: '⚡' },
      { name: 'エレキボール', type: 'aoe', cooldown: 5, mult: 1.1, radius: 60, color: '#ffe98a', icon: '⚡' },
      { name: 'ライトニングストーム', type: 'aoe', cooldown: 7, mult: 1.6, radius: 90, color: '#ffd23f', icon: '⛈️' },
    ],
    ultimate: { name: 'サンダーオーバードライブ', mult: 2.8 },
    passive: { type: 'speed_boost', mult: 1.2 },
  },
  gust: {
    name: 'ガスト', element: '風', topper: 'leaf', primaryColor: '#6bd97a', secondaryColor: '#bdf5c4',
    baseHp: 90, baseAtk: 12, baseSpd: 190, normalAttackName: 'ウィンドスラッシュ',
    skills: [
      { name: 'エアダッシュ', type: 'dash', cooldown: 3.5, mult: 1.3, color: '#6bd97a', icon: '💨' },
      { name: 'エアループ', type: 'aoe', cooldown: 6, mult: 1.2, radius: 70, color: '#9ff0ad', icon: '🌀' },
      { name: 'トルネードステップ', type: 'aoe', cooldown: 7, mult: 1.4, radius: 80, color: '#6bd97a', icon: '🌪️' },
    ],
    ultimate: { name: 'グランドストーム', mult: 2.7 },
    passive: { type: 'dodge_chance', chance: 0.25 },
  },
  terra: {
    name: 'テラ', element: '岩', topper: 'rocky', primaryColor: '#8a7355', secondaryColor: '#b7c98a',
    baseHp: 140, baseAtk: 15, baseSpd: 120, normalAttackName: 'ストーンパンチ',
    skills: [
      { name: 'アースシールド', type: 'buff', cooldown: 8, duration: 4, color: '#b7c98a', icon: '🛡️' },
      { name: '大地の壁', type: 'aoe', cooldown: 6, mult: 1.2, radius: 65, color: '#8a7355', icon: '🧱' },
      { name: 'マウンテンクラッシュ', type: 'aoe', cooldown: 7, mult: 1.5, radius: 85, color: '#6b5a3f', icon: '⛰️' },
    ],
    ultimate: { name: 'ジオインパクト', mult: 3.2 },
    passive: { type: 'hp_scaling_def', mid: 0.75, big: 0.5 },
  },
  frost: {
    name: 'フロスト', element: '氷', topper: 'crystal', primaryColor: '#7fd6f2', secondaryColor: '#d8f4ff',
    baseHp: 105, baseAtk: 12, baseSpd: 140, normalAttackName: 'アイスニードル',
    skills: [
      { name: 'フリーズブレス', type: 'aoe', cooldown: 5, mult: 1.1, radius: 65, color: '#a8ecff', icon: '❄️' },
      { name: 'アイスフィールド', type: 'aoe', cooldown: 6, mult: 1.2, radius: 75, color: '#7fd6f2', icon: '❄️' },
      { name: 'ブリザード', type: 'aoe', cooldown: 7, mult: 1.5, radius: 85, color: '#d8f4ff', icon: '🌨️' },
    ],
    ultimate: { name: 'グレイシャルバースト', mult: 2.9 },
    passive: { type: 'hp_scaling_def', mid: 0.8, big: 0.55 },
  },
  light: {
    name: 'ライト', element: '光', topper: 'halo', primaryColor: '#ffe9a8', secondaryColor: '#ffffff',
    baseHp: 100, baseAtk: 12, baseSpd: 160, normalAttackName: 'ライトボルト',
    skills: [
      { name: 'ヒールライト', type: 'heal', cooldown: 7, healRatio: 0.22, color: '#fff6d8', icon: '✨' },
      { name: 'プロテクション', type: 'buff', cooldown: 8, duration: 4, color: '#ffe9a8', icon: '🛡️' },
      { name: 'セイクリッドレイ', type: 'buff', cooldown: 9, duration: 4, color: '#ffffff', icon: '✨' },
    ],
    ultimate: { name: 'ホーリーライトバースト', mult: 2.7 },
    passive: { type: 'cooldown_reduction', mult: 1.2 },
  },
  nox: {
    name: 'ノクス', element: '闇', topper: 'shadow', primaryColor: '#6b4fc9', secondaryColor: '#2a1a4a',
    baseHp: 90, baseAtk: 16, baseSpd: 175, normalAttackName: 'シャドウスラッシュ',
    skills: [
      { name: 'ダークステップ', type: 'dash', cooldown: 3.5, mult: 1.5, color: '#6b4fc9', icon: '🌑' },
      { name: '暗闇', type: 'aoe', cooldown: 6, mult: 1.2, radius: 70, color: '#3a2a6a', icon: '🌑' },
      { name: 'カースドレイン', type: 'drain', cooldown: 7, mult: 1.4, radius: 70, color: '#8a6fe0', icon: '🩸' },
    ],
    ultimate: { name: 'ダークネスフィナーレ', mult: 3.1 },
    passive: { type: 'crit_chance', chance: 0.25 },
  },
  leaf: {
    name: 'リーフ', element: '植物', topper: 'flower', primaryColor: '#7fcf6b', secondaryColor: '#ffb6d5',
    baseHp: 115, baseAtk: 11, baseSpd: 150, normalAttackName: 'リーフショット',
    skills: [
      { name: 'つるの拘束', type: 'aoe', cooldown: 6, mult: 1.0, radius: 70, color: '#7fcf6b', icon: '🌿' },
      { name: 'グリーンヒール', type: 'heal', cooldown: 7, healRatio: 0.25, color: '#bdf5c4', icon: '💚' },
      { name: 'フォレストラプソディ', type: 'buff', cooldown: 9, duration: 4, color: '#ffb6d5', icon: '🌸' },
    ],
    ultimate: { name: 'エバーグリーンガーデン', mult: 2.6 },
    passive: { type: 'regen', rate: 3.5 },
  },
  plasma: {
    name: 'プラズマ', element: 'エネルギー', topper: 'rings', primaryColor: '#b06bff', secondaryColor: '#6fe0ff',
    baseHp: 95, baseAtk: 14, baseSpd: 165, normalAttackName: 'プラズマボルト',
    skills: [
      { name: 'オーバーチャージ', type: 'buff', cooldown: 8, duration: 4, color: '#b06bff', icon: '⚡' },
      { name: 'エナジーシフト', type: 'heal', cooldown: 7, healRatio: 0.2, color: '#6fe0ff', icon: '🔋' },
      { name: 'プラズマフィールド', type: 'aoe', cooldown: 6, mult: 1.3, radius: 75, color: '#b06bff', icon: '🌀' },
    ],
    ultimate: { name: 'プラズマインパクト', mult: 3.0 },
    passive: { type: 'cooldown_reduction', mult: 1.25 },
  },
};

function drawTopper(ctx, type, t, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  switch (type) {
    case 'flame':
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 7, -18);
        ctx.quadraticCurveTo(i * 7 + 4, -34 - Math.sin(t * 5 + i) * 4, i * 7, -44 - Math.sin(t * 4 + i) * 3);
        ctx.quadraticCurveTo(i * 7 - 4, -34, i * 7, -18);
        ctx.fill();
      }
      break;
    case 'droplet':
      ctx.beginPath();
      ctx.moveTo(0, -46 - Math.sin(t * 3) * 3);
      ctx.quadraticCurveTo(12, -30, 8, -18);
      ctx.quadraticCurveTo(0, -10, -8, -18);
      ctx.quadraticCurveTo(-12, -30, 0, -46 - Math.sin(t * 3) * 3);
      ctx.fill();
      break;
    case 'lightning':
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 8, -18);
        ctx.lineTo(i * 8 + 5, -32 - Math.abs(i) * 3);
        ctx.lineTo(i * 8 - 2, -30);
        ctx.lineTo(i * 8 + 3, -42 - Math.abs(i) * 2);
        ctx.lineTo(i * 8 - 6, -26);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 'leaf':
      ctx.beginPath(); ctx.ellipse(0, -30, 8, 16, Math.sin(t * 2) * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-14, -16, 5, 10, -0.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(14, -16, 5, 10, 0.6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'rocky':
      [[-10, -20, 7], [4, -28, 9], [16, -18, 6]].forEach(([bx, by, r]) => {
        ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
      });
      break;
    case 'crystal':
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 12, -18);
        ctx.lineTo(i * 12 + 5, -20 - Math.abs(i) * 6);
        ctx.lineTo(i * 12, -40 - Math.sin(t * 4 + i) * 3);
        ctx.lineTo(i * 12 - 5, -20 - Math.abs(i) * 6);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 'halo':
      ctx.beginPath(); ctx.ellipse(0, -34, 12, 4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-18, -6, 7, 12, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(18, -6, 7, 12, -0.5, 0, Math.PI * 2); ctx.fill();
      break;
    case 'shadow':
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 7, -16);
        ctx.lineTo(i * 7 + 4, -30 - Math.abs(i) * 4);
        ctx.lineTo(i * 7 - 4, -30 - Math.abs(i) * 4);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 'flower':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath(); ctx.ellipse(Math.cos(a) * 7, -34 + Math.sin(a) * 7, 5, 4, a, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#ffe066';
      ctx.beginPath(); ctx.arc(0, -34, 3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'rings':
      [0, 1, 2].forEach((i) => {
        ctx.beginPath();
        ctx.ellipse(Math.cos(t * 2 + i * 2) * 16, -20, 6, 14, t + i, 0, Math.PI * 2);
        ctx.stroke();
      });
      break;
  }
  ctx.lineWidth = 1;
}

function drawElementSprite(ctx, x, y, facing, t, hit, c) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  const bob = Math.sin(t * 6) * 3;
  ctx.translate(0, bob);
  drawTopper(ctx, c.topper, t, hit ? '#fff' : c.secondaryColor);
  ctx.beginPath(); ctx.fillStyle = hit ? '#fff' : c.primaryColor;
  ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a1206';
  ctx.beginPath(); ctx.arc(-7, -2, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(7, -2, 3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2a1206'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 4, 6, 0, Math.PI); ctx.stroke();
  ctx.globalAlpha = 0.75; ctx.fillStyle = hit ? '#fff' : c.primaryColor;
  ctx.beginPath(); ctx.ellipse(-9, 20, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(9, 20, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// 自分で作った3Dマップ(map-editor.js)を実際のプレイ空間として遊べるモード。
// ブロスタのクリエイティブモードのように、配置したアイテムがそのままゲーム内の
// 仕掛けになる。既存のmountElementCharacter(2Dキャンバス版)は一切変更していない --
// config.mapLayoutがある投稿だけがこちらに分岐する。
const SPEED_TO_WORLD_UNITS = 0.016;

function mountElementArena3D(charId, c, container, { onScore, onHint }, config) {
  const layout = config.mapLayout;
  const atk = config.atk ?? c.baseAtk;
  onHint(`WASD/スティックで移動、タップで${c.normalAttackName}！自分で作ったマップで戦おう`);

  const ME = window.MapEditor;
  const GROUND_HALF_X = ME.GROUND_HALF_X, GROUND_HALF_Z = ME.GROUND_HALF_Z;
  const rules = layout.rules || { timeLimit: 0, difficulty: 1 };
  const maxHp = c.baseHp, spd = c.baseSpd;
  const reportBest = makeBestTracker('element_' + charId, onHint);
  const combo = makeCombo();

  const root = document.createElement('div');
  root.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;background:#14151a;';
  container.appendChild(root);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';
  root.appendChild(renderer.domElement);
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  const bgColor = layout.color || '#223';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bgColor);
  scene.fog = new THREE.Fog(new THREE.Color(bgColor).getHex(), 9, 22);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x30302a, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(4, 7, 4);
  scene.add(key);

  // Same terrain-building code as the editor (real heightmap relief + carved water, not a
  // flat painted disc) -- window.MapEditor.buildGround so both stay visually identical.
  const ground = ME.buildGround(scene, { photoUrl: layout.photoUrl, mapColor: layout.color });

  function resize() {
    const w = root.clientWidth || 1, h = root.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);
  resize();

  // ---------------- player + scene population ----------------
  const player = ME.buildCharacterInstance(charId, scene);
  player.group.scale.setScalar(ME.CHAR_SCALE);
  let px = 0, pz = 0, facing = 1;

  const decorations = []; // static/idle-only placed characters (not the player)
  const arenaItems = []; // { type, x, z, inst, hiddenUntil }
  (layout.items || []).forEach((p) => {
    if (p.kind === 'character') {
      const inst = ME.buildCharacterInstance(p.id, scene);
      if (inst) {
        inst.group.position.set(p.x, ground.heightAt(p.x, p.z), p.z);
        inst.group.scale.setScalar(ME.CHAR_SCALE);
        decorations.push(inst);
      }
    } else if (p.kind === 'item') {
      const inst = ME.buildItemInstance(p.id);
      if (inst) {
        inst.group.position.set(p.x, ground.heightAt(p.x, p.z), p.z);
        inst.group.scale.setScalar(ME.ITEM_SCALE);
        scene.add(inst.group);
        arenaItems.push({ type: p.id, x: p.x, z: p.z, inst, hiddenUntil: 0 });
      }
    }
  });
  // Everything above is placed synchronously, before the map photo (and therefore the real
  // heightmap) has finished loading -- ground.heightAt() only had the flat-ground fallback
  // to give it at that point. Re-snap every static object's Y once the real heightmap lands;
  // the player (px/pz-driven, re-set every frame in animate()) doesn't need this.
  ground.onHeightReady(() => {
    for (const d of decorations) d.group.position.y = ground.heightAt(d.group.position.x, d.group.position.z);
    for (const it of arenaItems) it.inst.group.position.y = ground.heightAt(it.x, it.z);
  });
  const obstacles = arenaItems.filter((it) => it.type === 'rock' || it.type === 'house');
  const teleporters = arenaItems.filter((it) => it.type === 'teleporter');

  // ---------------- state ----------------
  let hp, score, dead, buffUntil, ultGauge, atkCooldown, skillCooldowns, stealthed;
  let enemies, spawnT, spawnEvery, lastTeleportAt, timeUp, elapsed;
  function reset() {
    px = 0; pz = 0; facing = 1;
    hp = maxHp; score = 0; dead = false; timeUp = false; elapsed = 0; buffUntil = 0; ultGauge = 0; atkCooldown = 0;
    skillCooldowns = c.skills.map((s, i) => s.cooldown * (0.3 + i * 0.25));
    // remove any enemies left over from the previous life BEFORE clearing the array --
    // clearing first would drop the only references to their meshes, leaking them in the scene.
    if (enemies) { for (const e of enemies) scene.remove(e.mesh); }
    enemies = []; spawnT = 0; spawnEvery = 1.6; stealthed = false; lastTeleportAt = 0;
    player.group.position.set(0, ground.heightAt(0, 0), 0);
  }
  reset();

  function isBuffed() { return performance.now() < buffUntil; }
  function atkMultiplier() {
    let m = 1;
    if (c.passive.type === 'hp_scaling_atk') { const r = hp / maxHp; if (r <= 0.2) m *= c.passive.big; else if (r <= 0.5) m *= c.passive.mid; }
    if (isBuffed()) m *= 1.3;
    return m;
  }
  function damageTakenMultiplier() {
    let m = 1;
    if (c.passive.type === 'hp_scaling_def') { const r = hp / maxHp; if (r <= 0.2) m *= c.passive.big; else if (r <= 0.5) m *= c.passive.mid; }
    if (c.passive.type === 'dodge_chance') m *= (1 - c.passive.chance);
    if (isBuffed()) m *= 0.6;
    return m;
  }
  function speedMultiplier() {
    let m = 1;
    if (c.passive.type === 'speed_boost') m *= c.passive.mult;
    if (isBuffed()) m *= 1.25;
    return m;
  }
  function cooldownRate() { return c.passive.type === 'cooldown_reduction' ? c.passive.mult : 1; }

  function spawnBurst3D(x, y, z, color, n) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), new THREE.MeshBasicMaterial({ color }));
      m.position.set(x, y, z);
      const ang = Math.random() * Math.PI * 2, spd2 = 0.6 + Math.random() * 1.2;
      m.userData = { vx: Math.cos(ang) * spd2, vy: 1.2 + Math.random() * 0.8, vz: Math.sin(ang) * spd2, life: 0.45 };
      scene.add(m);
      burstMeshes.push(m);
    }
  }
  const burstMeshes = [];

  function spawnEnemy() {
    // Pick a random point on the rectangular ground's perimeter (not a circle -- the
    // ground itself is rectangular now, matching each map photo's actual aspect ratio).
    const mx = GROUND_HALF_X - 0.3, mz = GROUND_HALF_Z - 0.3;
    const edge = Math.floor(Math.random() * 4);
    let ex, ez;
    if (edge === 0) { ex = (Math.random() * 2 - 1) * mx; ez = -mz; }
    else if (edge === 1) { ex = (Math.random() * 2 - 1) * mx; ez = mz; }
    else if (edge === 2) { ex = -mx; ez = (Math.random() * 2 - 1) * mz; }
    else { ex = mx; ez = (Math.random() * 2 - 1) * mz; }
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: 0x7a3aff, flatShading: true }));
    mesh.position.set(ex, 0.22, ez);
    scene.add(mesh);
    enemies.push({ x: ex, z: ez, mesh, hp: (20 + score * 2) * rules.difficulty, r: 0.22, spd: (1.1 + score * 0.05) * rules.difficulty });
  }

  function dealDamage(e, dmg) {
    e.hp -= dmg;
    ultGauge = Math.min(100, ultGauge + dmg * 0.6);
    spawnBurst3D(e.x, 0.3, e.z, 0xffffff, 4);
    if (e.hp <= 0) {
      score++; onScore(score); combo.hit(onHint); reportBest(score);
      scene.remove(e.mesh);
      const idx = enemies.indexOf(e);
      if (idx !== -1) enemies.splice(idx, 1);
    }
  }

  function basicAttack() {
    if (dead || timeUp) { reset(); return; }
    if (atkCooldown > 0) return;
    atkCooldown = 0.35;
    const isCrit = c.passive.type === 'crit_chance' && Math.random() < c.passive.chance;
    sfx.note(isCrit ? 700 : 500);
    const dmg = atk * atkMultiplier() * (isCrit ? 1.8 : 1);
    enemies.slice().forEach((e) => { if (Math.hypot(e.x - px, e.z - pz) < 0.75) dealDamage(e, dmg); });
  }
  renderer.domElement.addEventListener('pointerdown', basicAttack);

  function applySkillEffect(skill) {
    const dmg = atk * atkMultiplier() * (skill.mult || 1);
    switch (skill.type) {
      case 'dash': {
        if (!enemies.length) return;
        const nearest = enemies.reduce((a, b) => (Math.hypot(a.x - px, a.z - pz) < Math.hypot(b.x - px, b.z - pz) ? a : b));
        const dx = nearest.x - px, dz = nearest.z - pz, d = Math.hypot(dx, dz) || 1;
        px += (dx / d) * 0.9; pz += (dz / d) * 0.9;
        clampToGround();
        spawnBurst3D(px, 0.3, pz, skill.color === undefined ? 0xffffff : colorToHex(skill.color), 6);
        enemies.slice().forEach((e) => { if (Math.hypot(e.x - px, e.z - pz) < 0.7) dealDamage(e, dmg); });
        break;
      }
      case 'aoe': {
        spawnBurst3D(px, 0.3, pz, colorToHex(skill.color), 10);
        const radius = (skill.radius || 60) / 80;
        enemies.slice().forEach((e) => { if (Math.hypot(e.x - px, e.z - pz) < radius) dealDamage(e, dmg); });
        break;
      }
      case 'heal': {
        hp = Math.min(maxHp, hp + maxHp * skill.healRatio);
        spawnBurst3D(px, 0.3, pz, colorToHex(skill.color), 8);
        break;
      }
      case 'buff': {
        buffUntil = performance.now() + skill.duration * 1000;
        spawnBurst3D(px, 0.3, pz, colorToHex(skill.color), 8);
        break;
      }
      case 'drain': {
        let healed = 0;
        const radius = (skill.radius || 60) / 80;
        enemies.slice().forEach((e) => {
          if (Math.hypot(e.x - px, e.z - pz) < radius) { healed += Math.min(e.hp, dmg) * 0.5; dealDamage(e, dmg); }
        });
        hp = Math.min(maxHp, hp + healed);
        spawnBurst3D(px, 0.3, pz, colorToHex(skill.color), 6);
        break;
      }
    }
    sfx.note(600);
    onHint(`${skill.icon || '✨'} ${skill.name}！`);
  }
  function colorToHex(cssColor) {
    if (typeof cssColor !== 'string') return 0xffffff;
    if (cssColor[0] === '#') return parseInt(cssColor.slice(1), 16);
    return 0xffffff;
  }

  function clampToGround() {
    const mx = GROUND_HALF_X - 0.3, mz = GROUND_HALF_Z - 0.3;
    px = Math.max(-mx, Math.min(mx, px));
    pz = Math.max(-mz, Math.min(mz, pz));
  }

  // ---------------- movement: WASD/arrows on PC, drag-joystick on mobile ----------------
  const keyDirBits = { w: 0, a: 0, s: 0, d: 0 };
  const keyToBit = { w: 'w', ArrowUp: 'w', a: 'a', ArrowLeft: 'a', s: 's', ArrowDown: 's', d: 'd', ArrowRight: 'd' };
  let joyVec = { x: 0, y: 0 }, keyVec = { x: 0, y: 0 }, moveVec = { x: 0, y: 0 };
  function recomputeKeyVec() {
    const x = (keyDirBits.d ? 1 : 0) - (keyDirBits.a ? 1 : 0);
    const y = (keyDirBits.s ? 1 : 0) - (keyDirBits.w ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    keyVec = { x: x / len, y: y / len };
  }
  function applyMoveVec() { moveVec = (Math.hypot(joyVec.x, joyVec.y) > 0.08) ? joyVec : keyVec; }
  function keydownMove(e) { const bit = keyToBit[e.key]; if (!bit) return; keyDirBits[bit] = 1; recomputeKeyVec(); applyMoveVec(); }
  function keyupMove(e) { const bit = keyToBit[e.key]; if (!bit) return; keyDirBits[bit] = 0; recomputeKeyVec(); applyMoveVec(); }
  window.addEventListener('keydown', keydownMove);
  window.addEventListener('keyup', keyupMove);
  const joystick = makeJoystick(root, (v) => { joyVec = v; applyMoveVec(); });

  // ---------------- render loop ----------------
  const clock = new THREE.Clock();
  let rafId = null;
  function animate() {
    rafId = requestAnimationFrame(animate);
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;

    if (!dead && !timeUp) {
      elapsed += dt;
      if (rules.timeLimit > 0 && elapsed >= rules.timeLimit) {
        timeUp = true;
        sfx.win();
        onHint('⏱️ タイムアップ！');
        reportBest(score);
      }
      if (moveVec.x) facing = moveVec.x > 0 ? 1 : -1;
      // c.baseSpd is tuned for the 2D canvas version's pixel-scale coordinate space (canvas
      // is a few hundred px across); this 3D ground is only ~9 world units wide, so speed
      // needs converting into that much smaller scale -- SPEED_TO_WORLD_UNITS is that
      // pixels->world-units factor, chosen so crossing the whole arena takes a few seconds.
      const nx = px + moveVec.x * spd * speedMultiplier() * dt * SPEED_TO_WORLD_UNITS;
      const nz = pz + moveVec.y * spd * speedMultiplier() * dt * SPEED_TO_WORLD_UNITS;
      let blocked = false;
      for (const ob of obstacles) { if (Math.hypot(nx - ob.x, nz - ob.z) < 0.55) { blocked = true; break; } }
      if (!blocked) { px = nx; pz = nz; clampToGround(); }
      player.group.position.set(px, ground.heightAt(px, pz), pz);
      player.group.rotation.y = facing > 0 ? Math.PI / 2 : -Math.PI / 2;
      atkCooldown = Math.max(0, atkCooldown - dt);

      stealthed = false;
      for (const it of arenaItems) {
        const dist = Math.hypot(px - it.x, pz - it.z);
        if (it.type === 'heal' && dist < 0.7 && hp < maxHp) hp = Math.min(maxHp, hp + maxHp * 0.12 * dt);
        else if (it.type === 'grass' && dist < 0.75) stealthed = true;
        else if (it.type === 'energy' && dist < 0.6 && performance.now() > it.hiddenUntil) {
          buffUntil = performance.now() + 8000;
          it.hiddenUntil = performance.now() + 8000;
          it.inst.group.visible = false;
          onHint('🔮 エネルギーボール取得！攻撃力アップ');
          sfx.score(4);
        } else if (it.type === 'teleporter' && dist < 0.6 && performance.now() > lastTeleportAt) {
          const others = teleporters.filter((tp) => tp !== it);
          if (others.length) {
            const dest = others[Math.floor(Math.random() * others.length)];
            px = dest.x; pz = dest.z;
            lastTeleportAt = performance.now() + 1200;
            spawnBurst3D(px, 0.4, pz, 0x66f2ff, 10);
            sfx.note(800);
          }
        }
        if (it.type === 'energy' && it.inst.group.visible === false && performance.now() > it.hiddenUntil) {
          it.inst.group.visible = true;
        }
      }

      c.skills.forEach((skill, i) => {
        skillCooldowns[i] -= dt * cooldownRate();
        if (skillCooldowns[i] <= 0 && enemies.length) { skillCooldowns[i] = skill.cooldown; applySkillEffect(skill); }
      });

      if (ultGauge >= 100) {
        ultGauge = 0;
        sfx.win();
        onHint(`💥 ${c.ultimate.name}！！`);
        spawnBurst3D(px, 0.4, pz, colorToHex(c.primaryColor), 20);
        const dmg = atk * atkMultiplier() * c.ultimate.mult;
        enemies.slice().forEach((e) => dealDamage(e, dmg));
      }

      spawnT += dt;
      spawnEvery = Math.max(0.6, (1.6 - score * 0.03) / rules.difficulty);
      if (spawnT > spawnEvery) { spawnT = 0; spawnEnemy(); }

      const detectRadius = stealthed ? 1.1 : 999;
      enemies.forEach((e) => {
        const dx = px - e.x, dz = pz - e.z, d = Math.hypot(dx, dz) || 1;
        if (d < detectRadius) { e.x += (dx / d) * e.spd * dt; e.z += (dz / d) * e.spd * dt; }
        e.mesh.position.set(e.x, 0.22 + Math.sin(t * 4 + e.x) * 0.03, e.z);
        e.mesh.rotation.y = t * 1.5;
        if (d < 0.32) hp -= 10 * dt * damageTakenMultiplier();
      });
      if (c.passive.type === 'regen') hp = Math.min(maxHp, hp + c.passive.rate * dt);
      if (hp <= 0) { hp = 0; dead = true; sfx.gameover(); flashEl(renderer.domElement); reportBest(score); }
    }

    for (let i = burstMeshes.length - 1; i >= 0; i--) {
      const m = burstMeshes[i];
      m.userData.vy -= dt * 2.2;
      m.position.x += m.userData.vx * dt; m.position.y += m.userData.vy * dt; m.position.z += m.userData.vz * dt;
      m.userData.life -= dt;
      if (m.userData.life <= 0) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); burstMeshes.splice(i, 1); }
      else { m.material.opacity = m.userData.life / 0.45; m.material.transparent = true; }
    }

    ground.update(t);
    player.update(t, dt);
    for (const d of decorations) d.update(t, dt);
    for (const it of arenaItems) it.inst.update(t, dt);

    camera.position.set(px, 6.6, pz + 6.2);
    camera.lookAt(px, 0.5, pz);

    hud.hp.style.width = Math.max(0, (hp / maxHp) * 100) + '%';
    hud.ult.style.width = Math.max(0, (ultGauge / 100) * 100) + '%';
    hud.restart.style.display = (dead || timeUp) ? 'block' : 'none';
    hud.restart.textContent = timeUp ? `⏱️ タイムアップ！スコア${score} / タップでもう一度` : 'タップでリスタート';
    if (rules.timeLimit > 0) {
      hud.timer.style.display = 'block';
      hud.timer.textContent = `⏱️ ${Math.max(0, Math.ceil(rules.timeLimit - elapsed))}`;
    }

    renderer.render(scene, camera);
  }

  // ---------------- HUD overlay ----------------
  const hudRoot = document.createElement('div');
  hudRoot.style.cssText = 'position:absolute;top:10px;left:10px;right:10px;z-index:4;pointer-events:none;';
  hudRoot.innerHTML = `
    <div style="background:rgba(255,255,255,0.15);border-radius:6px;height:9px;overflow:hidden;">
      <div class="__hp" style="background:${c.primaryColor};height:100%;width:100%;"></div>
    </div>
    <div style="background:rgba(255,255,255,0.15);border-radius:4px;height:5px;overflow:hidden;margin-top:5px;">
      <div class="__ult" style="background:#ffd23f;height:100%;width:0%;"></div>
    </div>
    <div class="__timer" style="display:none;margin-top:6px;text-align:center;color:#fff;font-weight:700;font-size:14px;text-shadow:0 1px 4px rgba(0,0,0,0.6);"></div>
    <div class="__restart" style="display:none;margin-top:10px;text-align:center;color:#fff;font-weight:700;font-size:16px;text-shadow:0 1px 4px rgba(0,0,0,0.6);">タップでリスタート</div>
  `;
  root.appendChild(hudRoot);
  const hud = {
    hp: hudRoot.querySelector('.__hp'),
    ult: hudRoot.querySelector('.__ult'),
    restart: hudRoot.querySelector('.__restart'),
    timer: hudRoot.querySelector('.__timer'),
  };

  animate();

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    window.removeEventListener('keydown', keydownMove);
    window.removeEventListener('keyup', keyupMove);
    renderer.domElement.removeEventListener('pointerdown', basicAttack);
    joystick.remove();
    player.dispose();
    for (const d of decorations) d.dispose();
    for (const it of arenaItems) it.inst.dispose();
    for (const e of enemies) scene.remove(e.mesh);
    for (const m of burstMeshes) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    ME.disposeGround(ground);
    renderer.dispose();
    container.innerHTML = '';
  };
}

function mountElementCharacter(charId) {
  return function (container, { onScore, onHint }, config = {}) {
    const c = ELEMENT_CHARACTERS[charId];
    // Posts made through the 3D map editor carry the map/items the creator placed --
    // play those back as the actual arena (Brawl Stars Creative Mode style) instead of the
    // generic flat top-down canvas. Everything below this branch is untouched/unaffected.
    if (config.mapLayout && window.MapEditor) {
      return mountElementArena3D(charId, c, container, { onScore, onHint }, config);
    }
    const atk = config.atk ?? c.baseAtk;
    onHint(`WASD/スティックで移動、タップで${c.normalAttackName}！スキルと必殺技は自動発動`);
    const canvas = makeCanvas(container);
    const ctx = canvas.getContext('2d');
    const reportBest = makeBestTracker('element_' + charId, onHint);
    const combo = makeCombo();

    const maxHp = c.baseHp, spd = c.baseSpd;
    let px, py, hp, score, dead, facing, animT, buffUntil;
    let enemies, particles;
    let atkCooldown, skillCooldowns, ultGauge, moveDir;
    let spawnT, spawnEvery;

    function reset() {
      px = canvas.width / 2; py = canvas.height / 2;
      hp = maxHp; score = 0; dead = false; facing = 1; animT = 0; buffUntil = 0;
      enemies = []; particles = [];
      atkCooldown = 0; ultGauge = 0; moveDir = { x: 0, y: 0 };
      skillCooldowns = c.skills.map((s, i) => s.cooldown * (0.3 + i * 0.25));
      spawnT = 0; spawnEvery = 1.6;
    }
    reset();

    function isBuffed() { return performance.now() < buffUntil; }
    function atkMultiplier() {
      let m = 1;
      if (c.passive.type === 'hp_scaling_atk') { const r = hp / maxHp; if (r <= 0.2) m *= c.passive.big; else if (r <= 0.5) m *= c.passive.mid; }
      if (isBuffed()) m *= 1.3;
      return m;
    }
    function damageTakenMultiplier() {
      let m = 1;
      if (c.passive.type === 'hp_scaling_def') { const r = hp / maxHp; if (r <= 0.2) m *= c.passive.big; else if (r <= 0.5) m *= c.passive.mid; }
      if (c.passive.type === 'dodge_chance') m *= (1 - c.passive.chance);
      if (isBuffed()) m *= 0.6;
      return m;
    }
    function speedMultiplier() {
      let m = 1;
      if (c.passive.type === 'speed_boost') m *= c.passive.mult;
      if (isBuffed()) m *= 1.25;
      return m;
    }
    function cooldownRate() { return c.passive.type === 'cooldown_reduction' ? c.passive.mult : 1; }

    function spawnEnemy() {
      const edge = Math.floor(Math.random() * 4);
      let ex, ey;
      if (edge === 0) { ex = Math.random() * canvas.width; ey = -20; }
      else if (edge === 1) { ex = canvas.width + 20; ey = Math.random() * canvas.height; }
      else if (edge === 2) { ex = Math.random() * canvas.width; ey = canvas.height + 20; }
      else { ex = -20; ey = Math.random() * canvas.height; }
      enemies.push({ x: ex, y: ey, hp: 20 + score * 2, r: 16, spd: 50 + score * 2 });
    }
    function spawnParticle(x, y, color) {
      for (let i = 0; i < 6; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 140, vy: (Math.random() - 0.5) * 140, life: 0.4, color });
    }
    function dealDamage(e, dmg) {
      e.hp -= dmg;
      ultGauge = Math.min(100, ultGauge + dmg * 0.6);
      spawnParticle(e.x, e.y, '#fff');
      if (e.hp <= 0) {
        score++; onScore(score); combo.hit(onHint); reportBest(score);
        const idx = enemies.indexOf(e);
        if (idx !== -1) enemies.splice(idx, 1);
      }
    }

    function basicAttack() {
      if (dead) { reset(); return; }
      if (atkCooldown > 0) return;
      atkCooldown = 0.35;
      const isCrit = c.passive.type === 'crit_chance' && Math.random() < c.passive.chance;
      sfx.note(isCrit ? 700 : 500);
      const dmg = atk * atkMultiplier() * (isCrit ? 1.8 : 1);
      enemies.slice().forEach((e) => { if (Math.hypot(e.x - px, e.y - py) < 60) dealDamage(e, dmg); });
    }
    canvas.addEventListener('pointerdown', basicAttack);

    // Continuous held-movement: WASD/arrow keys on PC, drag-joystick on mobile. Both feed
    // into moveDir every frame rather than makeDpad's old discrete tap-then-auto-release,
    // since this game (unlike snake/2048) needs real analog-feeling movement.
    const keyDirBits = { w: 0, a: 0, s: 0, d: 0 };
    const keyToBit = {
      w: 'w', ArrowUp: 'w', a: 'a', ArrowLeft: 'a', s: 's', ArrowDown: 's', d: 'd', ArrowRight: 'd',
    };
    let joyVec = { x: 0, y: 0 };
    function recomputeKeyVec() {
      const x = (keyDirBits.d ? 1 : 0) - (keyDirBits.a ? 1 : 0);
      const y = (keyDirBits.s ? 1 : 0) - (keyDirBits.w ? 1 : 0);
      const len = Math.hypot(x, y) || 1;
      keyVec = { x: x / len, y: y / len };
    }
    let keyVec = { x: 0, y: 0 };
    function applyMoveVec() {
      const v = (Math.hypot(joyVec.x, joyVec.y) > 0.08) ? joyVec : keyVec;
      moveDir = v;
      if (v.x) facing = v.x > 0 ? 1 : -1;
    }
    function keydownMove(e) {
      const bit = keyToBit[e.key];
      if (!bit) return;
      keyDirBits[bit] = 1;
      recomputeKeyVec();
      applyMoveVec();
    }
    function keyupMove(e) {
      const bit = keyToBit[e.key];
      if (!bit) return;
      keyDirBits[bit] = 0;
      recomputeKeyVec();
      applyMoveVec();
    }
    window.addEventListener('keydown', keydownMove);
    window.addEventListener('keyup', keyupMove);
    const joystick = makeJoystick(container, (v) => { joyVec = v; applyMoveVec(); });

    function applySkillEffect(skill) {
      const dmg = atk * atkMultiplier() * (skill.mult || 1);
      switch (skill.type) {
        case 'dash': {
          if (!enemies.length) return;
          const nearest = enemies.reduce((a, b) => (Math.hypot(a.x - px, a.y - py) < Math.hypot(b.x - px, b.y - py) ? a : b));
          const dx = nearest.x - px, dy = nearest.y - py, d = Math.hypot(dx, dy) || 1;
          px += (dx / d) * 90; py += (dy / d) * 90;
          px = Math.max(30, Math.min(canvas.width - 30, px));
          py = Math.max(30, Math.min(canvas.height - 30, py));
          spawnParticle(px, py, skill.color);
          enemies.slice().forEach((e) => { if (Math.hypot(e.x - px, e.y - py) < 50) dealDamage(e, dmg); });
          break;
        }
        case 'aoe': {
          for (let i = 0; i < 10; i++) spawnParticle(px, py, skill.color);
          enemies.slice().forEach((e) => { if (Math.hypot(e.x - px, e.y - py) < skill.radius) dealDamage(e, dmg); });
          break;
        }
        case 'heal': {
          hp = Math.min(maxHp, hp + maxHp * skill.healRatio);
          for (let i = 0; i < 8; i++) spawnParticle(px, py, skill.color);
          break;
        }
        case 'buff': {
          buffUntil = performance.now() + skill.duration * 1000;
          for (let i = 0; i < 8; i++) spawnParticle(px, py, skill.color);
          break;
        }
        case 'drain': {
          let healed = 0;
          enemies.slice().forEach((e) => {
            if (Math.hypot(e.x - px, e.y - py) < skill.radius) { healed += Math.min(e.hp, dmg) * 0.5; dealDamage(e, dmg); }
          });
          hp = Math.min(maxHp, hp + healed);
          spawnParticle(px, py, skill.color);
          break;
        }
      }
      sfx.note(600);
      onHint(`${skill.icon || '✨'} ${skill.name}！`);
    }

    const stop = loopRAF((dt) => {
      animT += dt;
      if (!dead) {
        px += moveDir.x * spd * speedMultiplier() * dt; py += moveDir.y * spd * speedMultiplier() * dt;
        px = Math.max(30, Math.min(canvas.width - 30, px));
        py = Math.max(30, Math.min(canvas.height - 30, py));
        atkCooldown = Math.max(0, atkCooldown - dt);

        c.skills.forEach((skill, i) => {
          skillCooldowns[i] -= dt * cooldownRate();
          if (skillCooldowns[i] <= 0 && enemies.length) {
            skillCooldowns[i] = skill.cooldown;
            applySkillEffect(skill);
          }
        });

        if (ultGauge >= 100) {
          ultGauge = 0;
          sfx.win();
          onHint(`💥 ${c.ultimate.name}！！`);
          for (let i = 0; i < 20; i++) spawnParticle(px, py, c.primaryColor);
          const dmg = atk * atkMultiplier() * c.ultimate.mult;
          enemies.slice().forEach((e) => dealDamage(e, dmg));
        }

        spawnT += dt;
        spawnEvery = Math.max(0.6, 1.6 - score * 0.03);
        if (spawnT > spawnEvery) { spawnT = 0; spawnEnemy(); }
        enemies.forEach((e) => {
          const dx = px - e.x, dy = py - e.y, d = Math.hypot(dx, dy) || 1;
          e.x += (dx / d) * e.spd * dt; e.y += (dy / d) * e.spd * dt;
          if (d < 26) hp -= 12 * dt * damageTakenMultiplier();
        });
        if (c.passive.type === 'regen') hp = Math.min(maxHp, hp + c.passive.rate * dt);
        if (hp <= 0) { hp = 0; dead = true; sfx.gameover(); flashEl(canvas); reportBest(score); }
      }
      particles.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
      particles = particles.filter((p) => p.life > 0);

      ctx.fillStyle = '#1a0e0a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(16, 16, canvas.width - 32, 10);
      ctx.fillStyle = c.primaryColor; ctx.fillRect(16, 16, (canvas.width - 32) * (hp / maxHp), 10);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(16, 30, canvas.width - 32, 6);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(16, 30, (canvas.width - 32) * (ultGauge / 100), 6);

      enemies.forEach((e) => { ctx.beginPath(); ctx.fillStyle = '#7a3aff'; ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill(); });
      particles.forEach((p) => {
        ctx.globalAlpha = Math.max(0, p.life / 0.4);
        ctx.beginPath(); ctx.fillStyle = p.color; ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      });
      drawElementSprite(ctx, px, py, facing, animT, atkCooldown > 0.2, c);

      if (dead) {
        ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('タップでリスタート', canvas.width / 2, canvas.height / 2);
      }
    });

    return () => {
      stop();
      canvas.removeEventListener('pointerdown', basicAttack);
      window.removeEventListener('keydown', keydownMove);
      window.removeEventListener('keyup', keyupMove);
      joystick.remove();
      canvas.remove();
    };
  };
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

const GAME_DEFS = [
  { id: 'reaction', title: '反射神経テスト', genre: '反射神経', mount: mountReaction,
    params: [{ key: 'maxWait', label: '待ち時間の長さ', min: 500, max: 3000, step: 100, default: 1500 }] },
  { id: 'dodge', title: 'ブロック避け', genre: 'アクション', mount: mountDodge,
    params: [{ key: 'blockSpeed', label: 'ブロックの速さ', min: 120, max: 400, step: 20, default: 180 }] },
  { id: 'memory', title: '神経衰弱', genre: '記憶', mount: mountMemory,
    choiceParams: [{ key: 'symbols', label: 'キャラクターを8個選ぶ', count: 8,
      options: ['🐱','🐶','🐼','🦊','🐸','🐵','🦁','🐯','🐰','🐹','🐨','🦄','🐷','🐮','🐔','🦋','🐢','🐙'] }] },
  { id: 'whack', title: 'モグラたたき', genre: 'アクション', mount: mountWhack,
    params: [{ key: 'popDuration', label: 'モグラが出ている時間(ms)', min: 400, max: 1200, step: 50, default: 700 }] },
  { id: 'simon', title: '順番おぼえゲー', genre: '記憶', mount: mountSimon,
    choiceParams: [{ key: 'colors', label: '色を4個選ぶ', count: 4,
      options: ['#ff4b4b','#4ea8ff','#ffd23f','#31d158','#ff8ad8','#b06bff','#ff9f4b','#4bffe6'] }] },
  { id: 'flap', title: 'はばたき飛行', genre: 'アクション', mount: mountFlap,
    params: [{ key: 'gravity', label: '重力の強さ', min: 600, max: 1200, step: 50, default: 900 }] },
  { id: 'mathrush', title: '計算スピード勝負', genre: 'クイズ', mount: mountMathRush,
    params: [{ key: 'timeLimit', label: '制限時間(ms)', min: 2000, max: 8000, step: 500, default: 5000 }] },
  { id: 'colormatch', title: '色いくつわかる？', genre: '反射神経', mount: mountColorMatch },
  { id: 'snake', title: 'へび', genre: 'クラシック', mount: mountSnake,
    params: [{ key: 'startInterval', label: '初速(ms、小さいほど速い)', min: 80, max: 220, step: 10, default: 140 }] },
  { id: 'slide', title: 'スライド合体パズル', genre: 'パズル', mount: mountSlide },
  { id: 'stack', title: '積み上げタワー', genre: 'タイミング', mount: mountStack,
    params: [{ key: 'speedStart', label: 'ブロックの速さ', min: 80, max: 240, step: 10, default: 140 }] },
  { id: 'aim', title: 'ねらえ！ピタッとタイミング', genre: 'タイミング', mount: mountAim,
    params: [{ key: 'startSpeed', label: 'マーカーの速さ', min: 120, max: 360, step: 20, default: 220 }] },
  { id: 'flow', title: '色をおいかけろ', genre: '反射神経', mount: mountFlow,
    params: [{ key: 'startSpeed', label: '落下速度', min: 80, max: 280, step: 20, default: 160 }],
    choiceParams: [{ key: 'colors', label: '色を4個選ぶ', count: 4,
      options: ['#ff4b4b', '#4ea8ff', '#31d158', '#ffd23f', '#ff8ad8', '#b06bff', '#ff9f4b', '#4bffe6'] }] },
  { id: 'merge', title: 'フルーツマージ', genre: 'パズル', mount: mountMerge,
    params: [{ key: 'autoDropAfter', label: '自動落下までの時間(秒)', min: 1.5, max: 6, step: 0.5, default: 3.2 }] },
  // No params/choiceParams: the whole "config" IS the user-drawn config.layout grid (see
  // maze-editor.js), there's nothing left to slider-tune once a course is posted.
  { id: 'mymaze', title: '自分のコース', genre: 'アクション', mount: mountMyMaze },
  ...Object.keys(ELEMENT_CHARACTERS).map((charId) => {
    const c = ELEMENT_CHARACTERS[charId];
    return {
      id: 'element_' + charId,
      title: `エレメント・アリーナ：${c.name}`,
      genre: 'アクション',
      mount: mountElementCharacter(charId),
      params: [{ key: 'atk', label: '攻撃力', min: Math.round(c.baseAtk * 0.6), max: Math.round(c.baseAtk * 1.8), step: 1, default: c.baseAtk }],
    };
  }),
];

window.GAME_DEFS = GAME_DEFS;
