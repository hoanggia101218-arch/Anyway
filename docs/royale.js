// Anyway - エレメント・ロワイヤル: リアルタイムNプレイヤー・バトルロイヤル (status.json task63)
//
// Builds directly on Lenovo's task63 design (output_contrib/Lenovo/realtime_pvp_design.md) and
// proven sync prototype (output_contrib/Lenovo/royale_sync_proto/index.html): host-authoritative
// broadcast+presence, 10Hz position sync with client-side interpolation/dead-reckoning, and a
// movement-clamp anti-cheat. This file adds the next steps from that doc's roadmap (step 3+4):
// bot-fill and a minimal combat rule set (HP, melee "pulse" attack, last-one-standing, and a
// temporary buff on a kill -- the simplified stand-in for the original "吸収して属性バフ" idea,
// since the Element Arena character/skill system it would have hooked into was removed in task68).
//
// Self-contained on purpose (own Supabase client, own player id) rather than threading `sb`/`user`
// in from app.js: GAME_DEFS' mount(container, {onScore,onHint}, config) signature doesn't carry
// either, and duel.js's pattern of receiving them as explicit call-site arguments doesn't fit a
// GAME_DEFS entry mounted by the normal feed-scroll path. Guests get a distinct per-tab identity
// (same approach as royale_sync_proto) — fine for matching/sync, which only needs a stable id for
// the duration of one match, not a real account.
//
// Classic (non-module) script, same file:// reasoning as the rest of this app.
(function () {
  const SUPABASE_URL = 'https://qmqmpfjgxgwmsdeqpbiu.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_wGQyRnhd3bxGmcppLkOx8w_-xJI3qn1';

  const WORLD = { w: 900, h: 600 };
  const PLAYER_SPEED = 220; // px/sec
  const SEND_HZ = 10;
  const INTERP_DELAY_MS = 120;
  const MAX_STEP_PX = (PLAYER_SPEED / SEND_HZ) * 1.6; // anti-cheat clamp, mirrors the prototype
  const MATCH_WINDOW_MS = 15000; // players joining within the same 15s bucket land in one match
  const LOBBY_WAIT_MS = 6000; // how long the host waits for real players before bot-filling
  const TARGET_PLAYERS = 6;
  const HP_MAX = 100;
  // task108 (MSI, 2026-08-24, user request: "当たり判定が曖昧"): was 72 against a 15px-radius
  // drawn player circle (ctx.arc(..., 15 * scale, ...) below) -- 4.8x the visible sprite radius,
  // so hits registered (both landing on the opponent and receiving a hit) while the two circles
  // were still ~42px apart on screen, well outside anything that reads as contact. 42 = 15+15
  // (both player radii, i.e. sprite edges just touching) + 12 (a melee swing/weapon reach beyond
  // bare-body contact, matching cup.js's KICK_RANGE+BALL_RADIUS=44 reach-beyond-body-radius
  // precedent) so a hit now visually corresponds to the attacker being right up against the
  // defender, not several character-widths away.
  const ATTACK_RANGE = 42;
  const ATTACK_COOLDOWN_MS = 650;
  const ATTACK_DAMAGE = 18;
  const BUFF_DURATION_MS = 4000;
  const BUFF_SPEED_MULT = 1.35;
  const BUFF_DAMAGE_MULT = 1.4;
  const BOT_THINK_HZ = 6;

  const COLORS = ['#ff6b6b', '#6bffb8', '#ffd76b', '#6bb8ff', '#d76bff', '#ff9f4b', '#4bffe6', '#ff8ad8'];
  const BOT_NAMES = ['エコー', 'グレイル', 'ヴェスパ', 'ノヴァ', 'シグマ', 'ルーン', 'カイト', 'ゼファー'];

  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function randRange(a, b) { return a + Math.random() * (b - a); }
  function clampWorld(x, y) {
    return { x: Math.max(20, Math.min(WORLD.w - 20, x)), y: Math.max(20, Math.min(WORLD.h - 20, y)) };
  }

  function mount(container, { onScore, onHint }, config = {}) {
    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const myId = 'p_' + Math.random().toString(36).slice(2, 8);
    const myColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    const roomKey = 'royale:' + Math.floor(Date.now() / MATCH_WINDOW_MS);

    const canvas = makeCanvas(container);
    const ctx = canvas.getContext('2d');

    // task108 (MSI, 2026-08-23, user-reported): the post-creation flow (render3DSceneEditor in
    // app.js) lets the poster pick one of the real rendered Season 1 maps and shows its photo the
    // whole time they're placing characters/rules -- but this file never read that choice back,
    // so every actual match rendered the same flat #14151a regardless of which map was selected.
    // config.mapLayout.{photoUrl,color} is exactly what render3DSceneEditor already attaches to
    // the post; drawing it here (dimmed, so HUD/entities stay legible) is what makes "the map you
    // picked" and "the map you're actually fighting on" the same thing again.
    const mapBgColor = (config.mapLayout && config.mapLayout.color) || '#14151a';
    let mapBgImg = null, mapBgReady = false;
    if (config.mapLayout && config.mapLayout.photoUrl) {
      mapBgImg = new Image();
      mapBgImg.onload = () => { mapBgReady = true; };
      mapBgImg.src = config.mapLayout.photoUrl;
    }

    const me = { x: randRange(60, WORLD.w - 60), y: randRange(60, WORLD.h - 60), angle: 0, hp: HP_MAX, alive: true };
    let lastAttacker = null; // who hit me most recently, for kill-credit on my own death
    let buffUntil = 0;
    let phase = 'lobby'; // 'lobby' -> 'fighting' -> 'done'
    let isHost = false;
    let bots = []; // authoritative only when isHost
    const remote = {}; // other real players: { color, buffer:[{x,y,angle,t}], hp, alive }
    const remoteBots = {}; // non-host view of host-computed bots: { x,y,angle,color,hp,alive,t }
    let placeMessage = '';
    let closed = false;
    let lobbyDeadline = performance.now() + LOBBY_WAIT_MS;
    const burst = [];

    onHint(gt('royale_hint_waiting', 'マッチング中… 他プレイヤーを待っています'));

    function aliveRealIds() { return Object.keys(remote).filter((id) => remote[id].alive !== false).concat(me.alive ? [myId] : []); }
    function aliveBotList() { return isHost ? bots.filter((b) => b.alive) : Object.keys(remoteBots).map((id) => remoteBots[id]).filter((b) => b.alive); }

    function recomputeHost() {
      const state = channel.presenceState();
      const ids = Object.keys(state).sort((a, b) => {
        const ta = (state[a][0] && state[a][0].joined_at) || '';
        const tb = (state[b][0] && state[b][0].joined_at) || '';
        return ta < tb ? -1 : ta > tb ? 1 : 0;
      });
      const wasHost = isHost;
      isHost = ids.length > 0 && ids[0] === myId;
      if (isHost && !wasHost && phase === 'fighting') {
        // Host migration mid-match (design.md 2.2/5): inherit any bots the previous host had
        // broadcast, keyed from the last known remoteBots snapshot, so the roster doesn't reset.
        bots = Object.keys(remoteBots).map((id) => ({ ...remoteBots[id], id }));
      }
    }

    const channel = sb.channel(roomKey, { config: { broadcast: { self: false }, presence: { key: myId } } });

    channel
      .on('presence', { event: 'sync' }, () => {
        recomputeHost();
        if (phase === 'lobby') {
          const n = Object.keys(channel.presenceState()).length;
          onHint(gt('royale_hint_waiting_count', 'マッチング中… ({n}/{max}人、まもなくボットで補充)').replace('{n}', n).replace('{max}', TARGET_PLAYERS));
        }
        Object.keys(remote).forEach((id) => { if (!channel.presenceState()[id]) delete remote[id]; });
      })
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        if (!payload || payload.id === myId || phase === 'lobby') return;
        const id = payload.id;
        if (!remote[id]) remote[id] = { color: payload.color || '#aaa', buffer: [], hp: HP_MAX, alive: true };
        const r = remote[id];
        const buf = r.buffer;
        const prev = buf[buf.length - 1];
        let x = payload.x, y = payload.y;
        if (prev) {
          const dx = x - prev.x, dy = y - prev.y;
          const d = Math.hypot(dx, dy);
          if (d > MAX_STEP_PX) { const k = MAX_STEP_PX / d; x = prev.x + dx * k; y = prev.y + dy * k; }
        }
        buf.push({ x, y, angle: payload.angle, t: payload.t });
        while (buf.length > 8) buf.shift();
        r.hp = payload.hp; r.alive = payload.alive;
      })
      .on('broadcast', { event: 'bots' }, ({ payload }) => {
        if (!payload || isHost) return; // host is authoritative for its own bots, ignores echoes
        (payload.bots || []).forEach((b) => { remoteBots[b.id] = b; });
      })
      .on('broadcast', { event: 'attack' }, ({ payload }) => {
        if (!payload || payload.id === myId || phase !== 'fighting') return;
        // Receiver decides whether they got hit (design.md 2.2 anti-cheat: "殴られた側が確定").
        if (me.alive && dist(me.x, me.y, payload.x, payload.y) <= payload.range) {
          applyDamageToMe(payload.dmg || ATTACK_DAMAGE, payload.id);
        }
        if (isHost) {
          bots.forEach((b) => {
            if (b.alive && dist(b.x, b.y, payload.x, payload.y) <= payload.range) applyDamageToBot(b, payload.dmg || ATTACK_DAMAGE, payload.id);
          });
        }
      })
      .on('broadcast', { event: 'buff' }, ({ payload }) => {
        if (payload && payload.id === myId) { buffUntil = performance.now() + BUFF_DURATION_MS; onHint(gt('royale_hint_buff', '⚡ 撃破ボーナス！ 少しの間パワーアップ！')); }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && !closed) await channel.track({ joined_at: new Date().toISOString(), color: myColor });
      });

    function applyDamageToMe(dmg, attackerId) {
      lastAttacker = attackerId;
      me.hp = Math.max(0, me.hp - dmg);
      spawnBurst(burst, toScreen(me.x, me.y)[0], toScreen(me.x, me.y)[1], '#ff4b4b', 10);
      sfx.bad();
      if (me.hp <= 0 && me.alive) {
        me.alive = false;
        channel.send({ type: 'broadcast', event: 'death', payload: { id: myId } });
        if (lastAttacker) channel.send({ type: 'broadcast', event: 'buff', payload: { id: lastAttacker } });
        onHint(gt('royale_hint_defeated', 'やられた… 観戦モード'));
        checkWin();
      }
    }
    function applyDamageToBot(bot, dmg, attackerId) {
      bot.hp = Math.max(0, bot.hp - dmg);
      if (bot.hp <= 0 && bot.alive) {
        bot.alive = false;
        if (attackerId === myId) { buffUntil = performance.now() + BUFF_DURATION_MS; onHint(gt('royale_hint_kill', '⚡ {name}を倒した！パワーアップ！').replace('{name}', bot.name)); }
        else channel.send({ type: 'broadcast', event: 'buff', payload: { id: attackerId } });
        checkWin();
      }
    }

    function checkWin() {
      if (phase !== 'fighting') return;
      const survivors = aliveRealIds().length + aliveBotList().length;
      if (survivors <= 1) {
        phase = 'done';
        const iWon = me.alive;
        if (iWon) { onScore(1); onHint(gt('royale_hint_win', '🏆 勝利！最後の1人になった！')); sfx.win(); }
        else { onHint(gt('royale_hint_retry', 'タップでもう一度マッチングする')); sfx.gameover(); }
      }
    }

    function startFight() {
      phase = 'fighting';
      if (isHost) {
        const state = channel.presenceState();
        const realCount = Object.keys(state).length;
        const botCount = Math.max(0, TARGET_PLAYERS - realCount);
        bots = new Array(botCount).fill(0).map((_, i) => {
          const p = clampWorld(randRange(60, WORLD.w - 60), randRange(60, WORLD.h - 60));
          return {
            id: 'bot_' + i, name: BOT_NAMES[i % BOT_NAMES.length], x: p.x, y: p.y, angle: 0,
            hp: HP_MAX, alive: true, color: COLORS[(i + 3) % COLORS.length],
            state: 'seek', attackCd: 0, target: null,
          };
        });
        onHint(botCount > 0 ? gt('royale_hint_start_bots', '対戦開始！ボット{bots}体を含む{total}人の生き残りをかけたバトル！').replace('{bots}', botCount).replace('{total}', TARGET_PLAYERS) : gt('royale_hint_start', '対戦開始！'));
      } else {
        onHint(gt('royale_hint_start', '対戦開始！'));
      }
    }

    // ---------------- input ----------------
    const keys = {};
    function onKey(e) { keys[e.key.toLowerCase()] = e.type === 'keydown'; }
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    const joystick = makeJoystick(container, (v) => { joy.x = v.x; joy.y = v.y; });
    const joy = { x: 0, y: 0 };

    let attackCd = 0;
    function tryAttack() {
      if (phase !== 'fighting' || !me.alive || attackCd > 0) return;
      attackCd = ATTACK_COOLDOWN_MS;
      const dmg = performance.now() < buffUntil ? Math.round(ATTACK_DAMAGE * BUFF_DAMAGE_MULT) : ATTACK_DAMAGE;
      channel.send({ type: 'broadcast', event: 'attack', payload: { id: myId, x: me.x, y: me.y, range: ATTACK_RANGE, dmg, t: Date.now() } });
      // Local hit check against bots I can see (host resolves authoritatively too, but a non-host
      // client still gets instant visual feedback here — the host's broadcast reconciles shortly after).
      if (isHost) bots.forEach((b) => { if (b.alive && dist(b.x, b.y, me.x, me.y) <= ATTACK_RANGE) applyDamageToBot(b, dmg, myId); });
      spawnBurst(burst, toScreen(me.x, me.y)[0], toScreen(me.x, me.y)[1], myColor, 8);
    }
    function onTap() {
      if (phase === 'done' && !me.alive) { if (onHint) onHint(gt('royale_hint_reload', 'もう一度マッチングするには、この投稿を再読み込みしてください')); return; }
      tryAttack();
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

    function drawEntity(x, y, color, hpFrac, label, alive) {
      const [px, py, scale] = toScreen(x, y);
      ctx.globalAlpha = alive === false ? 0.25 : 1;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(px, py, 15 * scale, 0, Math.PI * 2); ctx.fill();
      if (alive !== false) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(px - 16, py - 26, 32, 4);
        ctx.fillStyle = hpFrac > 0.4 ? '#31d158' : '#ff4b4b'; ctx.fillRect(px - 16, py - 26, 32 * Math.max(0, hpFrac), 4);
      }
      ctx.globalAlpha = 1;
      if (label) { ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(label, px, py - 30); }
    }

    let botThinkAcc = 0;
    let sendAcc = 0;
    const stop = loopRAF((dt) => {
      if (closed) return;
      if (attackCd > 0) attackCd -= dt * 1000;

      if (phase === 'lobby' && performance.now() > lobbyDeadline) startFight();

      if (phase === 'fighting' && me.alive) {
        let dx = joy.x, dy = joy.y;
        if (keys['arrowleft'] || keys['a']) dx -= 1;
        if (keys['arrowright'] || keys['d']) dx += 1;
        if (keys['arrowup'] || keys['w']) dy -= 1;
        if (keys['arrowdown'] || keys['s']) dy += 1;
        const len = Math.hypot(dx, dy);
        if (len > 0.05) {
          const speed = performance.now() < buffUntil ? PLAYER_SPEED * BUFF_SPEED_MULT : PLAYER_SPEED;
          const nx = dx / len, ny = dy / len;
          const p = clampWorld(me.x + nx * speed * dt, me.y + ny * speed * dt);
          me.x = p.x; me.y = p.y; me.angle = Math.atan2(ny, nx);
        }
      }

      // bot AI (host only): finite state machine, seek nearest living target -> attack in range
      if (isHost && phase === 'fighting') {
        botThinkAcc += dt;
        if (botThinkAcc >= 1 / BOT_THINK_HZ) {
          botThinkAcc = 0;
          const livingTargets = [{ id: myId, x: me.x, y: me.y, alive: me.alive }]
            .concat(Object.keys(remote).map((id) => ({ id, x: remote[id].buffer.length ? remote[id].buffer[remote[id].buffer.length - 1].x : 0, y: remote[id].buffer.length ? remote[id].buffer[remote[id].buffer.length - 1].y : 0, alive: remote[id].alive })))
            .filter((t) => t.alive);
          bots.forEach((b) => {
            if (!b.alive) return;
            let nearest = null, nearestD = Infinity;
            livingTargets.forEach((t) => { const d = dist(b.x, b.y, t.x, t.y); if (d < nearestD) { nearestD = d; nearest = t; } });
            bots.forEach((ob) => { if (ob !== b && ob.alive) { const d = dist(b.x, b.y, ob.x, ob.y); if (d < nearestD) { nearestD = d; nearest = ob; } } });
            b.target = nearest;
          });
        }
        bots.forEach((b) => {
          if (!b.alive) return;
          if (b.attackCd > 0) b.attackCd -= dt * 1000;
          const t = b.target;
          if (t) {
            const d = dist(b.x, b.y, t.x, t.y);
            if (d > ATTACK_RANGE * 0.8) {
              const nx = (t.x - b.x) / (d || 1), ny = (t.y - b.y) / (d || 1);
              const p = clampWorld(b.x + nx * PLAYER_SPEED * 0.75 * dt, b.y + ny * PLAYER_SPEED * 0.75 * dt);
              b.x = p.x; b.y = p.y; b.angle = Math.atan2(ny, nx);
            } else if (b.attackCd <= 0) {
              b.attackCd = ATTACK_COOLDOWN_MS * 1.3;
              channel.send({ type: 'broadcast', event: 'attack', payload: { id: b.id, x: b.x, y: b.y, range: ATTACK_RANGE, dmg: ATTACK_DAMAGE, t: Date.now() } });
              // broadcast is {self:false}, so the host never gets this echoed back to its own
              // 'attack' handler -- remote real players resolve their own hit from the network
              // broadcast fine, but a bot hitting ANOTHER bot (also host-local, no client of its
              // own to receive anything) has to be resolved right here or it never happens at all.
              if (me.alive && dist(me.x, me.y, b.x, b.y) <= ATTACK_RANGE) applyDamageToMe(ATTACK_DAMAGE, b.id);
              bots.forEach((ob) => { if (ob !== b && ob.alive && dist(ob.x, ob.y, b.x, b.y) <= ATTACK_RANGE) applyDamageToBot(ob, ATTACK_DAMAGE, b.id); });
            }
          }
        });
      }

      // fixed-rate network send
      sendAcc += dt;
      if (sendAcc >= 1 / SEND_HZ) {
        sendAcc = 0;
        if (phase !== 'lobby') {
          channel.send({ type: 'broadcast', event: 'state', payload: { id: myId, x: me.x, y: me.y, angle: me.angle, color: myColor, hp: me.hp, alive: me.alive, t: Date.now() } });
          if (isHost && bots.length) {
            channel.send({ type: 'broadcast', event: 'bots', payload: { bots: bots.map((b) => ({ id: b.id, x: b.x, y: b.y, angle: b.angle, color: b.color, hp: b.hp, alive: b.alive, name: b.name })), t: Date.now() } });
          }
        }
      }

      // ---------------- render ----------------
      ctx.fillStyle = '#14151a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const [bx, by, scale] = toScreen(0, 0);
      ctx.fillStyle = mapBgColor; ctx.fillRect(bx, by, WORLD.w * scale, WORLD.h * scale);
      if (mapBgReady) {
        ctx.save();
        ctx.globalAlpha = 0.55; // dimmed so player/bot entities and the HUD stay readable on top
        ctx.drawImage(mapBgImg, bx, by, WORLD.w * scale, WORLD.h * scale);
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, WORLD.w * scale, WORLD.h * scale);

      const renderTime = Date.now() - INTERP_DELAY_MS;
      Object.keys(remote).forEach((id) => {
        const r = remote[id];
        const pos = interpolatedPos(r.buffer, renderTime);
        if (!pos) return;
        drawEntity(pos.x, pos.y, r.color, (r.hp ?? HP_MAX) / HP_MAX, null, r.alive);
      });
      (isHost ? bots : Object.values(remoteBots)).forEach((b) => {
        drawEntity(b.x, b.y, b.color, (b.hp ?? HP_MAX) / HP_MAX, b.name || gt('label_bot_fallback', 'ボット'), b.alive);
      });
      drawEntity(me.x, me.y, myColor, me.hp / HP_MAX, gt('label_you', 'あなた') + (performance.now() < buffUntil ? '⚡' : ''), me.alive);
      drawBurst(ctx, burst, dt);

      // y=100 (not the top-left corner) so this HUD line clears the app's own fixed
      // #user-bar/.score-badge overlays (see style.css) -- same fix as games.js's HUD_H.
      ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif'; ctx.textAlign = 'left';
      const survivors = aliveRealIds().length + aliveBotList().length;
      ctx.fillText(phase === 'lobby' ? gt('royale_matching', 'マッチング中…') : gt('royale_survivors', '生存: {n}人').replace('{n}', survivors), 10, 100);
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

  window.RoyaleGame = { mount };
})();
