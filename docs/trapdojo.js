// Anyway - トラップ道場 (status.json task80, task79と連動)
//
// Level Devil着想の「1画面完結・意地悪な引っかけ・即リセット」プラットフォーマー。
// task79(HP)がステージを大量生成する前提で、まず土台(シングルプレイのマウント関数+
// オンライン同期の仕組み)をここに用意する。ステージデータは STAGE_LIST の配列を伸ばす
// だけで増やせる形にしてあるので、task79の成果物が届き次第 registerStages() で追加できる
// (このファイルを直接書き換えなくても、後から読み込む別ファイルで
//  window.TrapDojo.registerStages([...]) を呼べば増える)。
//
// 罠は時間ベース(elapsedMsのみに依存、プレイヤーの位置には依存しない)で統一している。
// これにより「4人協力プレイ」でも罠トリガーを1つ1つbroadcastする必要がなく、host側が
// ラウンド開始時刻(roundStartAt)を1回配信するだけで、以後は各クライアントが自分の
// Date.now()-roundStartAtから同じ罠状態を再現できる(royale.js/duel.jsのような
// 逐次イベント配信より単純)。死亡時のリセットはシングルプレイでは罠タイマーごとやり直し、
// 協力プレイでは自分のアバターの位置だけ戻す(罠タイマーは全員共有なのでリセットしない)。
(function () {
  const SUPABASE_URL = 'https://qmqmpfjgxgwmsdeqpbiu.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_wGQyRnhd3bxGmcppLkOx8w_-xJI3qn1';

  // 既存の10属性(task63/app.jsのSPIRIT_AVATARSと同じ色・属性で揃えたブロックキャラ版)。
  const ELEMENTS = [
    { id: 'blaze', name: 'ブレイズ', color: '#e6551a', icon: '🔥' },
    { id: 'aqua', name: 'アクア', color: '#0288d1', icon: '💧' },
    { id: 'volt', name: 'ボルト', color: '#e6a800', icon: '⚡' },
    { id: 'gust', name: 'ガスト', color: '#4c9a2a', icon: '🌪️' },
    { id: 'terra', name: 'テラ', color: '#6b7a3c', icon: '🪨' },
    { id: 'frost', name: 'フロスト', color: '#3d94c2', icon: '❄️' },
    { id: 'light', name: 'ライト', color: '#d9a53a', icon: '✨' },
    { id: 'nox', name: 'ノクス', color: '#4a2a80', icon: '🌑' },
    { id: 'leaf', name: 'リーフ', color: '#4f8a2c', icon: '🌿' },
    { id: 'plasma', name: 'プラズマ', color: '#6a3fc0', icon: '🔮' },
  ];

  const WORLD = { w: 480, h: 270 };
  const GRAVITY = 1000;
  const JUMP_VEL = -360;
  const MOVE_SPEED = 145;
  const PLAYER_W = 16, PLAYER_H = 26;
  const KILL_Y = WORLD.h + 40;

  function stage(id, difficulty, coop, spawn, goal, platforms, hazards) {
    return { id, difficulty, coop, spawn, goal, platforms, hazards };
  }

  // ---------- Stage data (data-only, HP=task79 can append more via registerStages) ----------
  const STAGE_LIST = [
    // --- 初級 (easy) ---
    stage('easy_1', 'easy', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [{ x: 0, y: 230, w: 480, h: 20 }],
      [{ type: 'spike', x: 210, y: 218, w: 40, h: 12 }]),
    stage('easy_2', 'easy', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 160, h: 20 },
        { x: 320, y: 230, w: 160, h: 20 },
      ],
      [{ type: 'vanish', x: 160, y: 230, w: 160, h: 20, cycle: 2200, onFrac: 0.55, phase: 0 }]),
    stage('easy_3', 'easy', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 140, h: 20 },
        { x: 340, y: 230, w: 140, h: 20 },
      ],
      [{ type: 'mover', x: 200, y: 200, w: 60, h: 14, axis: 'x', amp: 60, speed: 1.1, baseY: 200, baseX: 200 }]),
    // --- 中級 (normal) ---
    stage('normal_1', 'normal', true,
      { x: 20, y: 190 }, { x: 430, y: 60, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 480, h: 20 },
        { x: 330, y: 110, w: 100, h: 14 },
      ],
      [
        { type: 'spike', x: 60, y: 218, w: 30, h: 12 },
        { type: 'fake', x: 150, y: 170, w: 90, h: 14 },
        { type: 'spike', x: 170, y: 218, w: 40, h: 12 },
      ]),
    stage('normal_2', 'normal', true,
      { x: 20, y: 60 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 100, w: 140, h: 14 },
        { x: 0, y: 230, w: 180, h: 20 },
        { x: 330, y: 230, w: 150, h: 20 },
      ],
      [
        { type: 'faller', x: 210, y: 40, w: 26, h: 26, cycle: 2600, telegraph: 550, fallDur: 700, restY: 40 },
        { type: 'vanish', x: 180, y: 230, w: 150, h: 20, cycle: 1800, onFrac: 0.5, phase: 400 },
      ]),
    stage('normal_3', 'normal', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 120, h: 20 },
        { x: 220, y: 230, w: 40, h: 20 },
        { x: 360, y: 230, w: 120, h: 20 },
      ],
      [
        { type: 'mover', x: 120, y: 210, w: 46, h: 14, axis: 'y', amp: 28, speed: 1.4, baseY: 210, baseX: 120 },
        { type: 'spike', x: 260, y: 218, w: 30, h: 12 },
        { type: 'mover', x: 300, y: 210, w: 46, h: 14, axis: 'y', amp: 28, speed: 1.4, baseY: 210, baseX: 300 },
      ]),
    // --- 上級 (hard) ---
    stage('hard_1', 'hard', true,
      { x: 20, y: 60 }, { x: 430, y: 40, w: 30, h: 40 },
      [
        { x: 0, y: 100, w: 100, h: 14 },
        { x: 380, y: 80, w: 100, h: 14 },
      ],
      [
        { type: 'fake', x: 130, y: 100, w: 60, h: 14 },
        { type: 'mover', x: 220, y: 130, w: 50, h: 14, axis: 'y', amp: 60, speed: 0.9, baseY: 130, baseX: 220 },
        { type: 'faller', x: 320, y: 30, w: 24, h: 24, cycle: 2200, telegraph: 450, fallDur: 650, restY: 30 },
        { type: 'spike', x: 0, y: KILL_Y - 6, w: 480, h: 6 },
      ]),
    stage('hard_2', 'hard', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 90, h: 20 },
        { x: 390, y: 230, w: 90, h: 20 },
      ],
      [
        { type: 'vanish', x: 90, y: 230, w: 90, h: 20, cycle: 1600, onFrac: 0.45, phase: 0 },
        { type: 'spike', x: 180, y: 218, w: 30, h: 12 },
        { type: 'mover', x: 240, y: 190, w: 50, h: 14, axis: 'x', amp: 40, speed: 1.6, baseY: 190, baseX: 240 },
        { type: 'vanish', x: 300, y: 230, w: 90, h: 20, cycle: 1600, onFrac: 0.45, phase: 800 },
      ]),
    stage('hard_3', 'hard', false,
      { x: 20, y: 60 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 100, w: 90, h: 14 },
        { x: 0, y: 230, w: 480, h: 20 },
      ],
      [
        { type: 'fake', x: 90, y: 100, w: 80, h: 14 },
        { type: 'faller', x: 130, y: 20, w: 22, h: 22, cycle: 1900, telegraph: 400, fallDur: 600, restY: 20 },
        { type: 'spike', x: 260, y: 218, w: 50, h: 12 },
        { type: 'mover', x: 350, y: 190, w: 50, h: 14, axis: 'y', amp: 30, speed: 1.5, baseY: 190, baseX: 350 },
      ]),
  ];

  function registerStages(list) { STAGE_LIST.push(...(list || [])); }

  // ---------- Block character rendering (task79の指示通り: 影絵調の四角形の積み重ね+胸のコア) ----------
  function drawBlockChar(ctx, sx, sy, scale, color, facing, walkPhase, dead) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(scale * (facing < 0 ? -1 : 1), scale);
    ctx.globalAlpha = dead ? 0.3 : 1;
    const dark = '#23262b';
    const legOffset = Math.sin(walkPhase) * 3;
    ctx.fillStyle = dark;
    // legs
    ctx.fillRect(-6, 4 + Math.max(0, legOffset), 5, 10 - Math.max(0, legOffset));
    ctx.fillRect(1, 4 - Math.min(0, legOffset), 5, 10 + Math.min(0, legOffset));
    // arms
    ctx.fillRect(-9, -8, 4, 10);
    ctx.fillRect(5, -8, 4, 10);
    // body
    ctx.fillRect(-6, -10, 12, 16);
    // head
    ctx.fillRect(-5, -22, 10, 10);
    // chest core (element color)
    ctx.fillStyle = color;
    ctx.fillRect(-3, -6, 6, 6);
    ctx.restore();
  }

  // ---------- Hazard evaluation (pure function of elapsedMs, so every client agrees) ----------
  function movingRect(h, elapsedMs) {
    const t = elapsedMs / 1000;
    if (h.axis === 'x') return { x: h.baseX + Math.sin(t * h.speed) * h.amp, y: h.baseY, w: h.w, h: h.h };
    return { x: h.baseX, y: h.baseY + Math.sin(t * h.speed) * h.amp, w: h.w, h: h.h };
  }
  function vanishState(h, elapsedMs) {
    const cyclePos = ((elapsedMs + (h.phase || 0)) % h.cycle + h.cycle) % h.cycle;
    return cyclePos < h.cycle * h.onFrac;
  }
  function fallerState(h, elapsedMs) {
    const cyclePos = ((elapsedMs % h.cycle) + h.cycle) % h.cycle;
    if (cyclePos < h.telegraph) return { phase: 'telegraph', y: h.restY, deadly: false };
    const fallT = cyclePos - h.telegraph;
    if (fallT < h.fallDur) {
      const k = fallT / h.fallDur;
      return { phase: 'falling', y: h.restY + k * (WORLD.h - h.restY - 20), deadly: true };
    }
    return { phase: 'rest', y: h.restY, deadly: false };
  }

  // Returns { solids: [{x,y,w,h}], deadlyRects: [{x,y,w,h}], drawList: [...] } for this instant.
  function computeHazardFrame(stg, elapsedMs) {
    const solids = stg.platforms.map((p) => ({ ...p, kind: 'static' }));
    const deadly = [];
    const draw = stg.platforms.map((p) => ({ ...p, kind: 'static' }));
    (stg.hazards || []).forEach((h) => {
      if (h.type === 'spike') {
        deadly.push(h);
        draw.push({ ...h, kind: 'spike' });
      } else if (h.type === 'vanish') {
        const on = vanishState(h, elapsedMs);
        if (on) solids.push({ ...h, kind: 'vanish' });
        draw.push({ ...h, kind: 'vanish', on });
      } else if (h.type === 'mover') {
        const r = movingRect(h, elapsedMs);
        solids.push({ ...r, kind: 'mover' });
        draw.push({ ...r, kind: 'mover' });
      } else if (h.type === 'fake') {
        // looks identical to a static platform but is never solid -- the "デコイの床".
        draw.push({ ...h, kind: 'fake' });
      } else if (h.type === 'faller') {
        const f = fallerState(h, elapsedMs);
        const r = { x: h.x, y: f.y, w: h.w, h: h.h };
        if (f.deadly) deadly.push(r);
        draw.push({ ...r, kind: 'faller', phase: f.phase });
      }
    });
    return { solids, deadly, draw };
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- Shared physics step (used by both solo and coop) ----------
  function stepPlayer(p, input, dt, solids) {
    // horizontal
    p.vx = input.dx * MOVE_SPEED;
    p.x += p.vx * dt;
    for (const s of solids) {
      const box = { x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H };
      if (rectsOverlap(box, s)) {
        if (p.vx > 0) p.x = s.x - PLAYER_W;
        else if (p.vx < 0) p.x = s.x + s.w;
      }
    }
    p.x = Math.max(0, Math.min(WORLD.w - PLAYER_W, p.x));
    // vertical
    p.vy += GRAVITY * dt;
    if (input.jump && p.onGround) { p.vy = JUMP_VEL; p.onGround = false; }
    p.y += p.vy * dt;
    p.onGround = false;
    for (const s of solids) {
      const box = { x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H };
      if (rectsOverlap(box, s)) {
        if (p.vy > 0) { p.y = s.y - PLAYER_H; p.vy = 0; p.onGround = true; }
        else if (p.vy < 0) { p.y = s.y + s.h; p.vy = 0; }
      }
    }
  }

  function checkDeath(p, deadly) {
    if (p.y > KILL_Y) return true;
    const box = { x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H };
    return deadly.some((d) => rectsOverlap(box, d));
  }
  function checkGoal(p, goal) {
    return rectsOverlap({ x: p.x, y: p.y, w: PLAYER_W, h: PLAYER_H }, goal);
  }

  // ---------- Rendering ----------
  function toScreen(canvas, x, y) {
    const sx = canvas.width / WORLD.w, sy = canvas.height / WORLD.h;
    const scale = Math.min(sx, sy);
    const ox = (canvas.width - WORLD.w * scale) / 2, oy = (canvas.height - WORLD.h * scale) / 2;
    return [ox + x * scale, oy + y * scale, scale];
  }

  function drawStageFrame(ctx, canvas, stg, hazardFrame) {
    ctx.fillStyle = '#14151a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const [ox, oy, scale] = toScreen(canvas, 0, 0);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    hazardFrame.draw.forEach((r) => {
      if (r.kind === 'static') { ctx.fillStyle = '#3a3d44'; ctx.fillRect(r.x, r.y, r.w, r.h); }
      else if (r.kind === 'fake') { ctx.fillStyle = '#3c3f45'; ctx.fillRect(r.x, r.y, r.w, r.h); }
      else if (r.kind === 'mover') { ctx.fillStyle = '#5b7fd6'; ctx.fillRect(r.x, r.y, r.w, r.h); }
      else if (r.kind === 'vanish') { ctx.fillStyle = r.on ? '#d69b3a' : 'rgba(214,155,58,0.18)'; ctx.fillRect(r.x, r.y, r.w, r.h); }
      else if (r.kind === 'spike') {
        ctx.fillStyle = '#e03a3a';
        const n = Math.max(1, Math.round(r.w / 14));
        const sw = r.w / n;
        for (let i = 0; i < n; i++) {
          ctx.beginPath();
          ctx.moveTo(r.x + i * sw, r.y + r.h);
          ctx.lineTo(r.x + i * sw + sw / 2, r.y);
          ctx.lineTo(r.x + i * sw + sw, r.y + r.h);
          ctx.closePath();
          ctx.fill();
        }
      } else if (r.kind === 'faller') {
        ctx.fillStyle = r.phase === 'telegraph' ? 'rgba(224,58,58,0.55)' : '#e0913a';
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    });
    // goal
    ctx.fillStyle = 'rgba(80,220,140,0.35)';
    ctx.fillRect(stg.goal.x, stg.goal.y, stg.goal.w, stg.goal.h);
    ctx.strokeStyle = '#50dc8c'; ctx.lineWidth = 2;
    ctx.strokeRect(stg.goal.x, stg.goal.y, stg.goal.w, stg.goal.h);
    ctx.restore();
    return [ox, oy, scale];
  }

  // ---------- Touch controls (own small bar, not makeDpad -- a platformer wants left/right/jump,
  // not a 4-way plus-pad) ----------
  function makeSideControls(container, onState) {
    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;left:0;right:0;bottom:8px;display:flex;justify-content:space-between;padding:0 12px;pointer-events:none;z-index:5;';
    function btn(label) {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'pointer-events:auto;width:52px;height:52px;border-radius:14px;border:none;background:rgba(255,255,255,0.14);color:#fff;font-size:20px;';
      return b;
    }
    const left = btn('◀'), right = btn('▶'), jump = btn('⤴');
    const leftGroup = document.createElement('div');
    leftGroup.style.cssText = 'display:flex;gap:8px;pointer-events:none;';
    leftGroup.appendChild(left); leftGroup.appendChild(right);
    bar.appendChild(leftGroup);
    bar.appendChild(jump);
    container.appendChild(bar);

    const state = { dx: 0, jump: false };
    function bind(el, onDown, onUp) {
      el.addEventListener('pointerdown', (e) => { e.stopPropagation(); onDown(); onState(state); });
      el.addEventListener('pointerup', (e) => { e.stopPropagation(); onUp(); onState(state); });
      el.addEventListener('pointercancel', (e) => { e.stopPropagation(); onUp(); onState(state); });
      el.addEventListener('pointerleave', (e) => { e.stopPropagation(); onUp(); onState(state); });
    }
    bind(left, () => { state.dx = -1; }, () => { if (state.dx < 0) state.dx = 0; });
    bind(right, () => { state.dx = 1; }, () => { if (state.dx > 0) state.dx = 0; });
    bind(jump, () => { state.jump = true; }, () => { state.jump = false; });
    return bar;
  }

  // ---------- Character/mode select screen ----------
  function showSelectScreen(container, onPick) {
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;inset:0;background:rgba(10,10,14,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:14px;z-index:10;';
    el.innerHTML = `
      <div style="color:#fff;font-weight:700;font-size:15px;">⚔️ トラップ道場</div>
      <div id="td-swatches" style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;"></div>
      <div style="display:flex;gap:8px;">
        <button id="td-solo" class="primary" style="padding:10px 14px;border-radius:12px;">ひとりで</button>
        <button id="td-coop" class="primary" style="padding:10px 14px;border-radius:12px;">みんなで(最大4人)</button>
      </div>
    `;
    container.appendChild(el);
    let picked = ELEMENTS[0].id;
    const grid = el.querySelector('#td-swatches');
    ELEMENTS.forEach((e) => {
      const b = document.createElement('button');
      b.textContent = e.icon;
      b.title = e.name;
      b.style.cssText = `width:38px;height:38px;border-radius:10px;border:2px solid ${e.id === picked ? '#fff' : 'transparent'};background:${e.color};font-size:16px;`;
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        picked = e.id;
        [...grid.children].forEach((c, i) => { c.style.border = `2px solid ${ELEMENTS[i].id === picked ? '#fff' : 'transparent'}`; });
      });
      grid.appendChild(b);
    });
    el.querySelector('#td-solo').addEventListener('click', (ev) => { ev.stopPropagation(); el.remove(); onPick('solo', picked); });
    el.querySelector('#td-coop').addEventListener('click', (ev) => { ev.stopPropagation(); el.remove(); onPick('coop', picked); });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  // ---------- Solo mode ----------
  function runSolo(container, canvas, ctx, { onScore, onHint }, elementColor) {
    const stages = STAGE_LIST;
    let stageIdx = 0;
    let p = null, stageStartAt = 0, closed = false, cleared = 0, walkPhase = 0, facing = 1;
    const ctrl = { dx: 0, jump: false };
    makeSideControls(container, (s) => { ctrl.dx = s.dx; ctrl.jump = s.jump; });

    function spawn() {
      const stg = stages[stageIdx];
      p = { x: stg.spawn.x, y: stg.spawn.y, vx: 0, vy: 0, onGround: false };
      stageStartAt = performance.now();
    }
    spawn();
    onHint(gt('trapdojo_hint_solo', '床や仕掛けに気をつけて、ゴールの緑ゾーンへ！'));

    const keys = {};
    function onKey(e) { keys[e.key.toLowerCase()] = e.type === 'keydown'; }
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    const stop = loopRAF((dt) => {
      if (closed) return;
      const stg = stages[stageIdx];
      const elapsed = performance.now() - stageStartAt;
      const frame = computeHazardFrame(stg, elapsed);

      let dx = ctrl.dx;
      if (keys['arrowleft'] || keys['a']) dx = -1;
      if (keys['arrowright'] || keys['d']) dx = 1;
      const jump = ctrl.jump || keys['arrowup'] || keys['w'] || keys[' '];
      if (dx !== 0) { facing = dx; walkPhase += dt * 10; }

      stepPlayer(p, { dx, jump }, dt, frame.solids);

      if (checkDeath(p, frame.deadly)) {
        sfx.bad();
        spawn();
      } else if (checkGoal(p, stg.goal)) {
        cleared += 1;
        onScore(cleared);
        sfx.win();
        onHint(gt('trapdojo_hint_clear', 'クリア！次のステージへ'));
        stageIdx = (stageIdx + 1) % stages.length;
        spawn();
      }

      const [, , scale] = drawStageFrame(ctx, canvas, stg, frame);
      const [sx, sy] = toScreenPoint(canvas, p.x + PLAYER_W / 2, p.y + PLAYER_H, scale);
      drawBlockChar(ctx, sx, sy, scale, elementColor, facing, walkPhase, false);
      ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`${stg.difficulty} ${stageIdx + 1}/${stages.length}　クリア数: ${cleared}`, 8, 40);
    });

    return () => {
      closed = true;
      stop();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }

  function toScreenPoint(canvas, x, y, scaleAlreadyKnown) {
    const [ox, oy, scale] = toScreen(canvas, 0, 0);
    return [ox + x * scale, oy + y * scale];
  }

  // ---------- Coop mode: presence + host-authoritative shared clock (no per-hazard events needed
  // since hazards are pure functions of elapsedMs -- see header comment) ----------
  function runCoop(container, canvas, ctx, { onScore, onHint }, elementColor) {
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const myId = 'td_' + Math.random().toString(36).slice(2, 8);
    const coopStages = STAGE_LIST.filter((s) => s.coop);
    const MATCH_WINDOW_MS = 20000;
    const LOBBY_WAIT_MS = 5000;
    const ADVANCE_TIMEOUT_MS = 25000;
    const SEND_HZ = 10;
    const INTERP_DELAY_MS = 120;

    const roomKey = 'trapdojo-coop:' + Math.floor(Date.now() / MATCH_WINDOW_MS);
    let closed = false, isHost = false, phase = 'lobby'; // lobby -> playing
    let stageIdx = 0, roundStartAt = 0, cleared = 0;
    let p = null, walkPhase = 0, facing = 1, myFinished = false;
    const finishers = new Set();
    const remote = {}; // id -> { color, buffer:[{x,y,facing,t}], finished }
    const ctrl = { dx: 0, jump: false };
    makeSideControls(container, (s) => { ctrl.dx = s.dx; ctrl.jump = s.jump; });

    function spawnAt(stg) { p = { x: stg.spawn.x, y: stg.spawn.y, vx: 0, vy: 0, onGround: false }; }

    onHint(gt('trapdojo_hint_coop_wait', 'マッチング中… 他プレイヤーを待っています'));
    let lobbyDeadline = performance.now() + LOBBY_WAIT_MS;

    function recomputeHost() {
      const state = channel.presenceState();
      const ids = Object.keys(state).sort((a, b) => {
        const ta = (state[a][0] && state[a][0].joined_at) || '';
        const tb = (state[b][0] && state[b][0].joined_at) || '';
        return ta < tb ? -1 : ta > tb ? 1 : 0;
      });
      isHost = ids.length > 0 && ids[0] === myId;
    }

    const channel = sb.channel(roomKey, { config: { broadcast: { self: false }, presence: { key: myId } } });

    function startStage(idx, startAt) {
      stageIdx = idx; roundStartAt = startAt; phase = 'playing';
      finishers.clear(); myFinished = false;
      spawnAt(coopStages[stageIdx]);
      onHint(gt('trapdojo_hint_coop_start', 'スタート！みんなでゴールを目指そう'));
    }

    channel
      .on('presence', { event: 'sync' }, () => {
        recomputeHost();
        if (phase === 'lobby') {
          const n = Object.keys(channel.presenceState()).length;
          onHint(gt('trapdojo_hint_coop_count', 'マッチング中… ({n}/4人)').replace('{n}', n));
        }
      })
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        if (!payload || payload.id === myId) return;
        if (!remote[payload.id]) remote[payload.id] = { color: payload.color, buffer: [], finished: false };
        const r = remote[payload.id];
        r.buffer.push({ x: payload.x, y: payload.y, facing: payload.facing, t: payload.t });
        while (r.buffer.length > 8) r.buffer.shift();
        r.finished = payload.finished;
      })
      .on('broadcast', { event: 'goal' }, ({ payload }) => {
        if (!payload || payload.stageIdx !== stageIdx) return;
        finishers.add(payload.id);
      })
      .on('broadcast', { event: 'advance' }, ({ payload }) => {
        if (!payload) return;
        startStage(payload.stageIdx, payload.roundStartAt);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && !closed) await channel.track({ joined_at: new Date().toISOString(), color: elementColor });
      });

    const keys = {};
    function onKey(e) { keys[e.key.toLowerCase()] = e.type === 'keydown'; }
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    let sendAcc = 0;
    const stop = loopRAF((dt) => {
      if (closed) return;

      if (phase === 'lobby') {
        if (performance.now() > lobbyDeadline) {
          recomputeHost();
          if (isHost) {
            const startAt = Date.now() + 800;
            channel.send({ type: 'broadcast', event: 'advance', payload: { stageIdx: 0, roundStartAt: startAt } });
            startStage(0, startAt);
          } else if (Object.keys(channel.presenceState()).length <= 1) {
            // nobody else ever joined and we're not host-eligible yet (rare race) -- just self-start.
            const startAt = Date.now() + 200;
            startStage(0, startAt);
          }
        }
        ctx.fillStyle = '#14151a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(gt('trapdojo_matching', 'マッチング中…'), canvas.width / 2, canvas.height / 2);
        return;
      }

      const stg = coopStages[stageIdx];
      const elapsed = Date.now() - roundStartAt;
      const frame = computeHazardFrame(stg, Math.max(0, elapsed));

      if (!myFinished) {
        let dx = ctrl.dx;
        if (keys['arrowleft'] || keys['a']) dx = -1;
        if (keys['arrowright'] || keys['d']) dx = 1;
        const jump = ctrl.jump || keys['arrowup'] || keys['w'] || keys[' '];
        if (dx !== 0) { facing = dx; walkPhase += dt * 10; }
        stepPlayer(p, { dx, jump }, dt, frame.solids);

        if (checkDeath(p, frame.deadly)) {
          sfx.bad();
          spawnAt(stg); // 個人の位置だけ戻す。共有タイマーはリセットしない。
        } else if (checkGoal(p, stg.goal)) {
          myFinished = true;
          cleared += 1;
          onScore(cleared);
          sfx.win();
          finishers.add(myId);
          channel.send({ type: 'broadcast', event: 'goal', payload: { id: myId, stageIdx } });
          onHint(gt('trapdojo_hint_coop_goal', 'ゴール！他のプレイヤーを待っています…'));
        }
      }

      // host: advance once everyone present has finished, or after a timeout so nobody gets stuck forever.
      if (isHost) {
        const presentCount = Math.max(1, Object.keys(channel.presenceState()).length);
        const allDone = finishers.size >= presentCount;
        if (allDone || elapsed > ADVANCE_TIMEOUT_MS) {
          const nextIdx = (stageIdx + 1) % coopStages.length;
          const startAt = Date.now() + 800;
          channel.send({ type: 'broadcast', event: 'advance', payload: { stageIdx: nextIdx, roundStartAt: startAt } });
          startStage(nextIdx, startAt);
        }
      }

      sendAcc += dt;
      if (sendAcc >= 1 / SEND_HZ) {
        sendAcc = 0;
        channel.send({ type: 'broadcast', event: 'state', payload: { id: myId, x: p.x, y: p.y, facing, color: elementColor, finished: myFinished, t: Date.now() } });
      }

      const [ox, oy, scale] = drawStageFrame(ctx, canvas, stg, frame);
      const renderTime = Date.now() - INTERP_DELAY_MS;
      Object.keys(remote).forEach((id) => {
        const r = remote[id];
        if (!r.buffer.length) return;
        const last = r.buffer[r.buffer.length - 1];
        const [sx, sy] = [ox + (last.x + PLAYER_W / 2) * scale, oy + (last.y + PLAYER_H) * scale];
        drawBlockChar(ctx, sx, sy, scale, r.color || '#aaa', last.facing || 1, 0, r.finished);
      });
      if (!myFinished) {
        const [sx, sy] = [ox + (p.x + PLAYER_W / 2) * scale, oy + (p.y + PLAYER_H) * scale];
        drawBlockChar(ctx, sx, sy, scale, elementColor, facing, walkPhase, false);
      }
      ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`協力プレイ ${stg.difficulty} (${finishers.size}/${Math.max(1, Object.keys(channel.presenceState()).length)}人ゴール)`, 8, 40);
    });

    return () => {
      closed = true;
      stop();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      try { channel.unsubscribe(); } catch (e) { /* best-effort */ }
    };
  }

  // ---------- Public mount ----------
  function mount(container, cbs, config = {}) {
    const onScore = cbs.onScore || (() => {});
    const onHint = cbs.onHint || (() => {});
    container.style.position = container.style.position || 'relative';
    const canvas = makeCanvas(container);
    const ctx = canvas.getContext('2d');
    let stopEngine = null;

    showSelectScreen(container, (mode, elementId) => {
      const el = ELEMENTS.find((e) => e.id === elementId) || ELEMENTS[0];
      if (mode === 'solo') stopEngine = runSolo(container, canvas, ctx, { onScore, onHint }, el.color);
      else stopEngine = runCoop(container, canvas, ctx, { onScore, onHint }, el.color);
    });

    return () => {
      if (stopEngine) stopEngine();
      canvas.remove();
      container.querySelectorAll(':scope > div').forEach((d) => d.remove());
    };
  }

  window.TrapDojo = { mount, registerStages, ELEMENTS, STAGE_LIST };
})();
