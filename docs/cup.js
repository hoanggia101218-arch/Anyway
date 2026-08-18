// Anyway - エレメント・カップ: リアルタイム4vs4サッカー (status.json task63/82)
//
// Same "3D風2D" approach as royale.js (task74): real gameplay is a 2D canvas (host-authoritative
// broadcast+presence, 10Hz sync, client-side interpolation, movement clamp), while the *creative*
// step in the create flow (map-editor.js's 3D spirit placement) is what supplies the "3D" feel.
// This is deliberately the same architecture as royale.js, not a rewrite -- see that file for the
// fuller rationale comment on why this app is self-contained (own Supabase client, own per-tab id)
// rather than threading `sb`/`user` in from app.js.
//
// New on top of royale.js's pattern: two teams instead of free-for-all, and a host-authoritative
// ball (shared physics object -- every OTHER shared thing in this app, HP included, is resolved
// by the receiver per royale.js's design; a ball can't be, since it's nobody's "self", so kicks
// are sent as requests and only the host actually moves the ball and broadcasts the result).
//
// Classic (non-module) script, same file:// reasoning as the rest of this app.
(function () {
  const SUPABASE_URL = 'https://qmqmpfjgxgwmsdeqpbiu.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_wGQyRnhd3bxGmcppLkOx8w_-xJI3qn1';

  const WORLD = { w: 900, h: 560 };
  const GOAL_HALF = 70; // goal mouth half-height, centered vertically
  const PLAYER_SPEED = 200;
  const SEND_HZ = 10;
  const INTERP_DELAY_MS = 120;
  const MAX_STEP_PX = (PLAYER_SPEED / SEND_HZ) * 1.6;
  const MATCH_WINDOW_MS = 15000;
  const LOBBY_WAIT_MS = 6000;
  const TEAM_SIZE = 4; // 4v4
  const MATCH_DURATION_MS = 90000;
  const BALL_RADIUS = 10;
  const PLAYER_RADIUS = 15;
  const KICK_RANGE = 34;
  const KICK_COOLDOWN_MS = 400;
  const KICK_POWER = 420;
  const BALL_FRICTION = 0.985; // per-tick velocity decay
  const BOT_THINK_HZ = 6;

  const ELEMENTS = [
    { id: 'fire', icon: '🔥', color: '#ff6b3d' },
    { id: 'ice', icon: '❄️', color: '#5fd0ff' },
    { id: 'normal', icon: '⚪', color: '#e6e6e6' },
  ];
  const TEAM_COLOR = { A: '#ff5a7a', B: '#4ea8ff' };
  const BOT_NAMES = ['エコー', 'グレイル', 'ヴェスパ', 'ノヴァ', 'シグマ', 'ルーン', 'カイト', 'ゼファー'];

  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function clampWorld(x, y) {
    return { x: Math.max(20, Math.min(WORLD.w - 20, x)), y: Math.max(20, Math.min(WORLD.h - 20, y)) };
  }
  function randomElement() { return ELEMENTS[Math.floor(Math.random() * (ELEMENTS.length - 1))]; } // rarely "normal" on purpose, favors flavor

  function mount(container, { onScore, onHint }, config = {}) {
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const myId = 'p_' + Math.random().toString(36).slice(2, 8);
    const myElement = randomElement();
    const roomKey = 'cup:' + Math.floor(Date.now() / MATCH_WINDOW_MS);

    const canvas = makeCanvas(container);
    const ctx = canvas.getContext('2d');

    let myTeam = null; // 'A' | 'B', assigned once the lobby resolves
    const me = { x: 0, y: 0, angle: 0 };
    let phase = 'lobby'; // 'lobby' -> 'playing' -> 'done'
    let isHost = false;
    let bots = []; // authoritative only when isHost: { id, team, x, y, angle, element, kickCd, name }
    const remote = {}; // other real players: { team, element, buffer:[{x,y,angle,t}] }
    const remoteBots = {};
    let score = { A: 0, B: 0 };
    let ball = { x: WORLD.w / 2, y: WORLD.h / 2, vx: 0, vy: 0 };
    let matchEndAt = 0;
    let lobbyDeadline = performance.now() + LOBBY_WAIT_MS;
    let kickCd = 0;
    let closed = false;
    const burst = [];
    const trail = []; // fire-kick visual trail: {x,y,life}

    onHint('マッチング中… 他プレイヤーを待っています');

    function teamSpawn(team, index, total) {
      const laneY = 60 + (index + 0.5) * ((WORLD.h - 120) / Math.max(1, total));
      const x = team === 'A' ? WORLD.w * 0.28 : WORLD.w * 0.72;
      return { x, y: laneY };
    }
    function goalXFor(team) { return team === 'A' ? WORLD.w - 4 : 4; } // team A attacks the right goal
    function defendXFor(team) { return team === 'A' ? 4 : WORLD.w - 4; }

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

    channel
      .on('presence', { event: 'sync' }, () => {
        recomputeHost();
        if (phase === 'lobby') {
          const n = Object.keys(channel.presenceState()).length;
          onHint(`マッチング中… (${n}/${TEAM_SIZE * 2}人、まもなくボットで補充)`);
        }
        Object.keys(remote).forEach((id) => { if (!channel.presenceState()[id]) delete remote[id]; });
      })
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        if (!payload || payload.id === myId || phase === 'lobby') return;
        const id = payload.id;
        if (!remote[id]) remote[id] = { team: payload.team, element: payload.element, buffer: [] };
        remote[id].team = payload.team;
        const buf = remote[id].buffer;
        const prev = buf[buf.length - 1];
        let x = payload.x, y = payload.y;
        if (prev) {
          const dx = x - prev.x, dy = y - prev.y;
          const d = Math.hypot(dx, dy);
          if (d > MAX_STEP_PX) { const k = MAX_STEP_PX / d; x = prev.x + dx * k; y = prev.y + dy * k; }
        }
        buf.push({ x, y, angle: payload.angle, t: payload.t });
        while (buf.length > 8) buf.shift();
      })
      .on('broadcast', { event: 'bots' }, ({ payload }) => {
        if (!payload || isHost) return;
        (payload.bots || []).forEach((b) => { remoteBots[b.id] = b; });
      })
      .on('broadcast', { event: 'ball' }, ({ payload }) => {
        if (!payload || isHost) return; // host is authoritative for the ball
        ball = { x: payload.x, y: payload.y, vx: payload.vx, vy: payload.vy };
        if (payload.score) score = payload.score;
      })
      .on('broadcast', { event: 'kick' }, ({ payload }) => {
        if (!payload || !isHost) return;
        // Host-authoritative physics object (design.md 2.2's "receiver decides" pattern doesn't
        // fit a shared ball -- it belongs to nobody, so the host adjudicates every kick request).
        if (dist(ball.x, ball.y, payload.x, payload.y) <= KICK_RANGE + BALL_RADIUS) {
          applyKick(payload.aimX, payload.aimY, payload.power, payload.elementId);
        }
      })
      .on('broadcast', { event: 'goal' }, ({ payload }) => {
        if (payload && payload.score) { score = payload.score; onHint((payload.team === myTeam ? '🎉 ゴール！' : '😢 失点…') + ` ${score.A} - ${score.B}`); }
      })
      .on('broadcast', { event: 'matchend' }, ({ payload }) => {
        if (!payload) return;
        score = payload.score;
        finishMatch();
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && !closed) await channel.track({ joined_at: new Date().toISOString(), element: myElement.id });
      });

    function applyKick(aimX, aimY, power, elementId) {
      const dx = aimX - ball.x, dy = aimY - ball.y;
      const len = Math.hypot(dx, dy) || 1;
      let nx = dx / len, ny = dy / len;
      if (elementId === 'fire') {
        // curved shot: rotate the aim direction slightly for a banana-kick feel
        const curve = 0.35;
        const rx = nx * Math.cos(curve) - ny * Math.sin(curve);
        const ry = nx * Math.sin(curve) + ny * Math.cos(curve);
        nx = rx; ny = ry;
      }
      ball.vx = nx * power;
      ball.vy = ny * power;
    }

    function startMatch() {
      phase = 'playing';
      matchEndAt = performance.now() + MATCH_DURATION_MS;
      ball = { x: WORLD.w / 2, y: WORLD.h / 2, vx: 0, vy: 0 };
      score = { A: 0, B: 0 };
      if (isHost) {
        const state = channel.presenceState();
        const realIds = Object.keys(state);
        // Alternate real players across teams by join order for rough balance, then bot-fill each
        // team up to TEAM_SIZE.
        const realTeams = {};
        realIds.forEach((id, i) => { realTeams[id] = i % 2 === 0 ? 'A' : 'B'; });
        myTeam = realTeams[myId] || 'A';
        const countA = Object.values(realTeams).filter((t) => t === 'A').length;
        const countB = Object.values(realTeams).filter((t) => t === 'B').length;
        bots = [];
        let botIdx = 0;
        for (let i = countA; i < TEAM_SIZE; i++) { bots.push(makeBot('A', botIdx)); botIdx++; }
        for (let i = countB; i < TEAM_SIZE; i++) { bots.push(makeBot('B', botIdx)); botIdx++; }
        // Broadcast each real (non-host) player's team assignment via the state channel isn't
        // enough on its own since teams must agree before first send -- simplest fix: everyone
        // deterministically recomputes the same team from presence join order, so no broadcast
        // round-trip is needed for team assignment itself.
        onHint(`試合開始！ (${bots.length}体のボットを含む${TEAM_SIZE}vs${TEAM_SIZE})`);
      } else {
        const state = channel.presenceState();
        const realIds = Object.keys(state).sort((a, b) => {
          const ta = (state[a][0] && state[a][0].joined_at) || '';
          const tb = (state[b][0] && state[b][0].joined_at) || '';
          return ta < tb ? -1 : ta > tb ? 1 : 0;
        });
        const idx = realIds.indexOf(myId);
        myTeam = idx % 2 === 0 ? 'A' : 'B';
        onHint('試合開始！');
      }
      const spawn = teamSpawn(myTeam, 0, 1);
      me.x = spawn.x; me.y = spawn.y;
    }

    function makeBot(team, idx) {
      const spawn = teamSpawn(team, idx, TEAM_SIZE);
      return {
        id: 'bot_' + team + '_' + idx, team, name: BOT_NAMES[idx % BOT_NAMES.length],
        x: spawn.x, y: spawn.y, angle: 0, element: randomElement().id, kickCd: 0,
      };
    }

    function checkGoal() {
      if (phase !== 'playing') return;
      // "Team A attacks the right goal" -- a goal for A happens when the ball crosses the RIGHT
      // edge inside the goal mouth, and vice versa.
      if (ball.x >= WORLD.w - BALL_RADIUS && Math.abs(ball.y - WORLD.h / 2) <= GOAL_HALF) {
        score.A += 1;
        onScoreEvent('A');
      } else if (ball.x <= BALL_RADIUS && Math.abs(ball.y - WORLD.h / 2) <= GOAL_HALF) {
        score.B += 1;
        onScoreEvent('B');
      }
    }
    function onScoreEvent(team) {
      channel.send({ type: 'broadcast', event: 'goal', payload: { team, score } });
      onHint((team === myTeam ? '🎉 ゴール！' : '😢 失点…') + ` ${score.A} - ${score.B}`);
      sfx[team === myTeam ? 'win' : 'bad']();
      ball = { x: WORLD.w / 2, y: WORLD.h / 2, vx: 0, vy: 0 };
    }

    function finishMatch() {
      phase = 'done';
      const iWon = myTeam && score[myTeam] > score[myTeam === 'A' ? 'B' : 'A'];
      const draw = score.A === score.B;
      if (draw) onHint(`🤝 引き分け ${score.A} - ${score.B}`);
      else if (iWon) { onScore(score[myTeam]); onHint(`🏆 勝利！ ${score.A} - ${score.B}`); sfx.win(); }
      else { onHint(`タップでもう一度マッチングする ${score.A} - ${score.B}`); sfx.gameover(); }
    }

    // ---------------- input ----------------
    const keys = {};
    function onKey(e) { keys[e.key.toLowerCase()] = e.type === 'keydown'; }
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    const joy = { x: 0, y: 0 };
    const joystick = makeJoystick(container, (v) => { joy.x = v.x; joy.y = v.y; });

    function tryKick() {
      if (phase !== 'playing' || kickCd > 0) return;
      if (dist(me.x, me.y, ball.x, ball.y) > KICK_RANGE + BALL_RADIUS) return;
      kickCd = KICK_COOLDOWN_MS;
      const aim = { x: goalXFor(myTeam), y: WORLD.h / 2 + (Math.random() - 0.5) * 80 };
      if (isHost) {
        applyKick(aim.x, aim.y, KICK_POWER, myElement.id);
      } else {
        channel.send({ type: 'broadcast', event: 'kick', payload: { x: ball.x, y: ball.y, aimX: aim.x, aimY: aim.y, power: KICK_POWER, elementId: myElement.id } });
      }
      if (myElement.id === 'fire') for (let i = 0; i < 6; i++) trail.push({ x: ball.x, y: ball.y, life: 0.4 });
      spawnBurst(burst, toScreen(ball.x, ball.y)[0], toScreen(ball.x, ball.y)[1], myElement.color, 8);
    }
    function onTap() {
      if (phase === 'done') return;
      tryKick();
    }
    canvas.addEventListener('pointerdown', onTap);

    // ---------------- render helpers ----------------
    function toScreen(x, y) {
      const sx = canvas.width / WORLD.w, sy = canvas.height / WORLD.h;
      const scale = Math.min(sx, sy);
      const ox = (canvas.width - WORLD.w * scale) / 2, oy = (canvas.height - WORLD.h * scale) / 2;
      return [ox + x * scale, oy + y * scale, scale];
    }
    function interpolatedPos(buf, renderTime) {
      if (!buf.length) return null;
      if (buf.length === 1) return buf[0];
      let a = buf[0], b = buf[buf.length - 1];
      for (let i = 0; i < buf.length - 1; i++) {
        if (buf[i].t <= renderTime && buf[i + 1].t >= renderTime) { a = buf[i]; b = buf[i + 1]; break; }
        a = buf[i]; b = buf[i + 1];
      }
      const span = b.t - a.t || 1;
      let k = (renderTime - a.t) / span;
      k = Math.max(-1, Math.min(2, k));
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, angle: b.angle };
    }
    function drawPlayer(x, y, team, label) {
      const [px, py, scale] = toScreen(x, y);
      ctx.fillStyle = TEAM_COLOR[team] || '#aaa';
      ctx.beginPath(); ctx.arc(px, py, PLAYER_RADIUS * scale, 0, Math.PI * 2); ctx.fill();
      if (label) { ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, px, py - 20); }
    }

    let botThinkAcc = 0;
    let sendAcc = 0;
    const stop = loopRAF((dt) => {
      if (closed) return;
      if (kickCd > 0) kickCd -= dt * 1000;

      if (phase === 'lobby' && performance.now() > lobbyDeadline) startMatch();
      if (phase === 'playing' && performance.now() > matchEndAt) {
        if (isHost) channel.send({ type: 'broadcast', event: 'matchend', payload: { score } });
        finishMatch();
      }

      if (phase === 'playing' && myTeam) {
        let dx = joy.x, dy = joy.y;
        if (keys['arrowleft'] || keys['a']) dx -= 1;
        if (keys['arrowright'] || keys['d']) dx += 1;
        if (keys['arrowup'] || keys['w']) dy -= 1;
        if (keys['arrowdown'] || keys['s']) dy += 1;
        const len = Math.hypot(dx, dy);
        if (len > 0.05) {
          const nx = dx / len, ny = dy / len;
          const p = clampWorld(me.x + nx * PLAYER_SPEED * dt, me.y + ny * PLAYER_SPEED * dt);
          me.x = p.x; me.y = p.y; me.angle = Math.atan2(ny, nx);
        }
      }

      // host: ball physics + bot AI
      if (isHost && phase === 'playing') {
        ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        ball.vx *= BALL_FRICTION; ball.vy *= BALL_FRICTION;
        if (ball.y < BALL_RADIUS || ball.y > WORLD.h - BALL_RADIUS) ball.vy *= -0.7;
        ball.y = Math.max(BALL_RADIUS, Math.min(WORLD.h - BALL_RADIUS, ball.y));
        // side walls only block outside the goal mouth -- inside it, the ball is allowed through
        // to cross the goal line, which checkGoal() reads before this clamp would ever run again.
        if (ball.x < BALL_RADIUS && Math.abs(ball.y - WORLD.h / 2) > GOAL_HALF) { ball.x = BALL_RADIUS; ball.vx *= -0.7; }
        if (ball.x > WORLD.w - BALL_RADIUS && Math.abs(ball.y - WORLD.h / 2) > GOAL_HALF) { ball.x = WORLD.w - BALL_RADIUS; ball.vx *= -0.7; }
        checkGoal();

        botThinkAcc += dt;
        const think = botThinkAcc >= 1 / BOT_THINK_HZ;
        if (think) botThinkAcc = 0;
        bots.forEach((b) => {
          if (b.kickCd > 0) b.kickCd -= dt * 1000;
          const dBall = dist(b.x, b.y, ball.x, ball.y);
          let targetX, targetY;
          if (dBall < 220) { targetX = ball.x; targetY = ball.y; } // chase the ball when it's near
          else { const s = teamSpawn(b.team, 0, 1); targetX = s.x; targetY = ball.y; } // else hold a lane toward the ball's height
          const d = dist(b.x, b.y, targetX, targetY);
          if (d > 4) {
            const nx = (targetX - b.x) / (d || 1), ny = (targetY - b.y) / (d || 1);
            const p = clampWorld(b.x + nx * PLAYER_SPEED * 0.85 * dt, b.y + ny * PLAYER_SPEED * 0.85 * dt);
            b.x = p.x; b.y = p.y; b.angle = Math.atan2(ny, nx);
          }
          if (dBall <= KICK_RANGE + BALL_RADIUS && b.kickCd <= 0) {
            b.kickCd = KICK_COOLDOWN_MS * 1.5;
            const aimX = goalXFor(b.team), aimY = WORLD.h / 2 + (Math.random() - 0.5) * 80;
            applyKick(aimX, aimY, KICK_POWER * 0.85, b.element);
          }
        });
      }

      // ice element: touching an opposing player briefly slows them (resolved locally by the
      // one being touched, same "receiver decides" shape as royale.js's combat).
      if (phase === 'playing' && myTeam) {
        Object.keys(remote).forEach((id) => {
          const r = remote[id];
          if (!r.team || r.team === myTeam || r.element !== 'ice') return;
          const pos = r.buffer.length ? r.buffer[r.buffer.length - 1] : null;
          if (pos && dist(me.x, me.y, pos.x, pos.y) < PLAYER_RADIUS * 2) { /* purely cosmetic contact for now -- slow effect kept out of MVP scope */ }
        });
      }

      // fixed-rate network send
      sendAcc += dt;
      if (sendAcc >= 1 / SEND_HZ) {
        sendAcc = 0;
        if (phase !== 'lobby' && myTeam) {
          channel.send({ type: 'broadcast', event: 'state', payload: { id: myId, team: myTeam, element: myElement.id, x: me.x, y: me.y, angle: me.angle, t: Date.now() } });
        }
        if (isHost) {
          if (bots.length) channel.send({ type: 'broadcast', event: 'bots', payload: { bots: bots.map((b) => ({ id: b.id, team: b.team, x: b.x, y: b.y, angle: b.angle, name: b.name })) } });
          if (phase === 'playing') channel.send({ type: 'broadcast', event: 'ball', payload: { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, score } });
        }
      }

      // ---------------- render ----------------
      ctx.fillStyle = '#0e3d1a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const [bx, by, scale] = toScreen(0, 0);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, WORLD.w * scale, WORLD.h * scale);
      // goal mouths
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3;
      const [, goalTopL] = toScreen(0, WORLD.h / 2 - GOAL_HALF), [, goalBotL] = toScreen(0, WORLD.h / 2 + GOAL_HALF);
      ctx.beginPath(); ctx.moveTo(bx, goalTopL); ctx.lineTo(bx, goalBotL); ctx.stroke();
      const [goalXR] = toScreen(WORLD.w, 0);
      ctx.beginPath(); ctx.moveTo(goalXR, goalTopL); ctx.lineTo(goalXR, goalBotL); ctx.stroke();

      for (let i = trail.length - 1; i >= 0; i--) { trail[i].life -= dt; if (trail[i].life <= 0) trail.splice(i, 1); }
      trail.forEach((t) => {
        const [tx, ty] = toScreen(t.x, t.y);
        ctx.globalAlpha = Math.max(0, t.life / 0.4) * 0.5;
        ctx.fillStyle = '#ff6b3d';
        ctx.beginPath(); ctx.arc(tx, ty, 6 * scale, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      });

      const renderTime = Date.now() - INTERP_DELAY_MS;
      Object.keys(remote).forEach((id) => {
        const r = remote[id];
        const pos = interpolatedPos(r.buffer, renderTime);
        if (!pos || !r.team) return;
        drawPlayer(pos.x, pos.y, r.team, null);
      });
      (isHost ? bots : Object.values(remoteBots)).forEach((b) => {
        if (!b.team) return;
        drawPlayer(b.x, b.y, b.team, b.name || null);
      });
      if (myTeam) drawPlayer(me.x, me.y, myTeam, 'あなた');

      const [ballX, ballY] = toScreen(ball.x, ball.y);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ballX, ballY, BALL_RADIUS * scale, 0, Math.PI * 2); ctx.fill();
      drawBurst(ctx, burst, dt);

      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${score.A} - ${score.B}`, canvas.width / 2, 44);
      ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
      const remainSec = phase === 'playing' ? Math.max(0, Math.ceil((matchEndAt - performance.now()) / 1000)) : null;
      ctx.fillText(phase === 'lobby' ? 'マッチング中…' : phase === 'playing' ? `残り${remainSec}秒 / あなた:${myTeam}チーム` : '試合終了', 10, 40);
    });

    return () => {
      closed = true;
      stop();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      canvas.removeEventListener('pointerdown', onTap);
      try { channel.unsubscribe(); } catch (e) { /* best-effort */ }
      joystick.remove();
      canvas.remove();
    };
  }

  window.CupGame = { mount };
})();
