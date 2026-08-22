// Anyway - Realtime 1v1 duel engine.
// Two ways to get matched: open lobby (anyone currently browsing that game gets paired) or a
// friend invite sent as a DM (gated to mutual-follows only -- see app.js's getFriendProfiles()).
// Both paths converge on the same runDuelChannel(): from the moment two players are both
// present in a duel-specific channel, there is no difference between "matched with a
// stranger" and "a friend accepted my invite." gameId 'reaction' keeps its bespoke tap-race
// minigame; every other gameId runs the generic score-race (mount the real GAME_DEFS game for
// durationMs inside the overlay, track each side's peak onScore() value, higher wins) added in
// task52. Callers just pass a different gameId to startOpenDuel/acceptDuelInvite/inviteFriendToDuel.
(function () {
  const WAITING_TTL_MS = 8000;
  const HEARTBEAT_MS = 3000;
  const INVITE_PREFIX = '⚔️DUEL_INVITE⚔️';
  const SCORE_RACE_DURATION_MS = 20000;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Mirrors games.js's gt(): translate via i18n.js if available, else fall back to the
  // Japanese string that was always here (this file had no i18n coverage until task108/MSI).
  function gt(key, fallback) {
    if (!window.I18N) return fallback;
    const v = window.I18N.t(key);
    return v === key ? fallback : v;
  }

  function makeOverlay() {
    const el = document.createElement('div');
    el.id = 'duel-overlay';
    el.innerHTML = `<div class="duel-box"><button class="panel-back" id="duel-close">←</button><div id="duel-body"></div></div>`;
    document.body.appendChild(el);
    return el;
  }
  function setBody(overlay, html) { overlay.querySelector('#duel-body').innerHTML = html; }

  function duelChannelName(gameId, idA, idB) {
    const pair = [idA, idB].sort();
    return 'duel:' + gameId + ':' + pair[0] + '-' + pair[1];
  }

  // Shared by both matchmaking paths: join the pair's dedicated channel, wait (via Realtime
  // Presence) until both sides have actually joined, then the lower-id side hosts one round.
  function runDuelChannel(sb, gameId, me, opponentId, overlay) {
    let closed = false;
    const isHost = me.id < opponentId;
    // Reaction keeps its original tap-race minigame; every other gameId uses the generic
    // "mount the real game for durationMs, compare peak scores" race (task50/52).
    const isScoreRace = gameId !== 'reaction';
    const channelName = duelChannelName(gameId, me.id, opponentId);
    const duelChannel = sb.channel(channelName, {
      config: { broadcast: { self: true }, presence: { key: me.id } },
    });
    overlay.querySelector('#duel-close').addEventListener('click', () => {
      closed = true;
      try { duelChannel.unsubscribe(); } catch (e) { /* best-effort */ }
      overlay.remove();
    });

    let started = false, myResult = null, oppResult = null, deadline = null, durationMs = SCORE_RACE_DURATION_MS, tapped = false, roundOver = false;

    duelChannel
      .on('presence', { event: 'sync' }, () => {
        if (started || closed || !isHost) return;
        const state = duelChannel.presenceState();
        if (Object.keys(state).length >= 2) {
          started = true;
          const payload = { deadline: Date.now() + 1000 + Math.random() * 2000 };
          if (isScoreRace) payload.durationMs = SCORE_RACE_DURATION_MS;
          duelChannel.send({ type: 'broadcast', event: 'start', payload });
        }
      })
      .on('broadcast', { event: 'start' }, ({ payload }) => {
        deadline = payload.deadline;
        if (payload.durationMs) durationMs = payload.durationMs;
        if (isScoreRace) runScoreRaceRound(); else runRound();
      })
      .on('broadcast', { event: 'result' }, ({ payload }) => {
        if (!payload || payload.id === me.id) return;
        if (isScoreRace) { oppResult = payload.score; maybeShowScoreResult(); }
        else { oppResult = payload.ms; maybeShowResult(); }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && !closed) duelChannel.track({ id: me.id });
      });

    function runRound() {
      if (closed) return;
      tapped = false; myResult = null; oppResult = null; roundOver = false;
      setBody(overlay, `<h2 id="duel-msg">${escapeHtml(gt('duel_wait_msg', '赤いうちは待って…'))}</h2><div id="duel-target" class="duel-target duel-target-red"></div>`);
      const targetEl = overlay.querySelector('#duel-target');
      const msgEl = overlay.querySelector('#duel-msg');

      function frame() {
        if (closed || tapped) return;
        if (Date.now() >= deadline && !targetEl.classList.contains('duel-target-green')) {
          targetEl.classList.remove('duel-target-red');
          targetEl.classList.add('duel-target-green');
          msgEl.textContent = gt('duel_go_msg', '今だ！タップ！');
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);

      targetEl.addEventListener('pointerdown', () => {
        if (tapped || closed) return;
        tapped = true;
        const now = Date.now();
        const ms = now < deadline ? -1 : (now - deadline); // -1 = tapped too early (false start)
        myResult = ms;
        duelChannel.send({ type: 'broadcast', event: 'result', payload: { id: me.id, ms } });
        maybeShowResult();
      });
    }

    function maybeShowResult() {
      if (roundOver || myResult === null || oppResult === null || closed) return;
      roundOver = true;
      let outcome;
      if (myResult === -1 && oppResult === -1) outcome = 'draw-early';
      else if (myResult === -1) outcome = 'lose';
      else if (oppResult === -1) outcome = 'win';
      else outcome = myResult < oppResult ? 'win' : myResult > oppResult ? 'lose' : 'draw';
      const label = {
        win: gt('duel_result_win', '🎉 勝利！'), lose: gt('duel_result_lose', '😢 敗北…'),
        draw: gt('duel_result_draw', '🤝 引き分け'), 'draw-early': gt('duel_result_draw_early', '両者フライング'),
      }[outcome];
      const falseStart = gt('duel_false_start', 'フライング');
      const myLabel = myResult === -1 ? falseStart : `${myResult}ms`;
      const oppLabel = oppResult === -1 ? falseStart : `${oppResult}ms`;
      setBody(overlay, `
        <h2>${escapeHtml(label)}</h2>
        <p>${escapeHtml(gt('duel_score_line', 'あなた: {my} / 相手: {opp}').replace('{my}', myLabel).replace('{opp}', oppLabel))}</p>
        <button class="primary" id="duel-again" style="width:100%;padding:13px;border-radius:14px;margin-top:12px;">${escapeHtml(gt('duel_play_again_btn', 'もう一度対戦'))}</button>
      `);
      overlay.querySelector('#duel-again').addEventListener('click', () => {
        closed = true;
        try { duelChannel.unsubscribe(); } catch (e) { /* best-effort */ }
        overlay.remove();
        startOpenDuel(sb, gameId, me);
      });
    }

    // Generic race for every non-reaction game: mount the real minigame (via GAME_DEFS) inside
    // the duel overlay for durationMs, tracking the highest onScore() value seen (some games
    // like dodge/flap reset their score to 0 on death mid-round, so we track the peak, not the
    // latest value), then broadcast that peak and compare against the opponent's.
    function runScoreRaceRound() {
      if (closed) return;
      myResult = null; oppResult = null; roundOver = false;
      const def = (window.GAME_DEFS || []).find((g) => g.id === gameId);
      const title = def ? def.title : gameId;
      const waitMs = Math.max(0, deadline - Date.now());
      const box = overlay.querySelector('.duel-box');
      if (box) box.classList.add('duel-box-game');
      setBody(overlay, `<h2>⚔️ ${escapeHtml(title)}</h2><p id="duel-msg">${escapeHtml(gt('duel_starting_soon', 'まもなく開始…'))}</p><div id="duel-game-area"></div>`);
      const msgEl = overlay.querySelector('#duel-msg');

      setTimeout(() => {
        if (closed) return;
        if (!def || typeof def.mount !== 'function') {
          msgEl.textContent = gt('duel_unsupported_game', 'このゲームは対戦に対応していません');
          return;
        }
        let peak = 0;
        const area = overlay.querySelector('#duel-game-area');
        let unmount = null;
        try {
          unmount = def.mount(area, { onScore: (s) => { if (s > peak) peak = s; }, onHint: () => {} }, {});
        } catch (e) { /* best-effort: a game failing to mount shouldn't crash the duel */ }
        // setInterval, not requestAnimationFrame: rAF can be throttled or fully paused for a
        // backgrounded/hidden tab, which would silently hang the round forever (confirmed while
        // self-testing -- the countdown never advanced). A wall-clock interval always fires.
        const endAt = Date.now() + durationMs;
        const finish = () => {
          clearInterval(tickTimer);
          if (unmount) { try { unmount(); } catch (e) { /* best-effort */ } }
          if (closed) return;
          myResult = peak;
          duelChannel.send({ type: 'broadcast', event: 'result', payload: { id: me.id, score: peak } });
          setBody(overlay, `<h2>${escapeHtml(gt('duel_waiting_result', '結果を待っています…'))}</h2><p>${escapeHtml(gt('duel_your_score_line', 'あなたのスコア: {score}').replace('{score}', peak))}</p><div class="duel-spinner"></div>`);
          maybeShowScoreResult();
        };
        const tickTimer = setInterval(() => {
          if (closed) { clearInterval(tickTimer); return; }
          const remain = Math.max(0, endAt - Date.now());
          msgEl.textContent = gt('duel_time_remaining', '残り時間: {sec}秒').replace('{sec}', Math.ceil(remain / 1000));
          if (remain <= 0) finish();
        }, 250);
      }, waitMs);
    }

    function maybeShowScoreResult() {
      if (roundOver || myResult === null || oppResult === null || closed) return;
      roundOver = true;
      const outcome = myResult > oppResult ? 'win' : myResult < oppResult ? 'lose' : 'draw';
      const label = {
        win: gt('duel_result_win', '🎉 勝利！'), lose: gt('duel_result_lose', '😢 敗北…'), draw: gt('duel_result_draw', '🤝 引き分け'),
      }[outcome];
      setBody(overlay, `
        <h2>${escapeHtml(label)}</h2>
        <p>${escapeHtml(gt('duel_score_line', 'あなた: {my} / 相手: {opp}').replace('{my}', myResult).replace('{opp}', oppResult))}</p>
        <button class="primary" id="duel-again" style="width:100%;padding:13px;border-radius:14px;margin-top:12px;">${escapeHtml(gt('duel_play_again_btn', 'もう一度対戦'))}</button>
      `);
      overlay.querySelector('#duel-again').addEventListener('click', () => {
        closed = true;
        try { duelChannel.unsubscribe(); } catch (e) { /* best-effort */ }
        overlay.remove();
        startOpenDuel(sb, gameId, me);
      });
    }
  }

  // ---------- Path A: open lobby (anyone currently looking for a match on this game) ----------
  async function startOpenDuel(sb, gameId, me) {
    if (!me || me.isGuest) return;
    const overlay = makeOverlay();
    setBody(overlay, `
      <h2>${escapeHtml(gt('duel_searching_title', '⚔️ 対戦相手を探しています…'))}</h2>
      <div class="duel-spinner"></div>
      <p style="font-size:11px;opacity:0.6;">${escapeHtml(gt('duel_searching_hint', '同じ瞬間にこの画面を開いている人とマッチングします'))}</p>
    `);

    let closed = false, invited = null, heartbeatTimer = null, staleTimer = null;
    const waitingOthers = new Map(); // id -> lastSeenAt
    const lobby = sb.channel('duel-lobby:' + gameId, { config: { broadcast: { self: false } } });

    function cleanupLobby() { clearInterval(heartbeatTimer); clearInterval(staleTimer); try { lobby.unsubscribe(); } catch (e) { /* best-effort */ } }
    overlay.querySelector('#duel-close').addEventListener('click', () => { closed = true; cleanupLobby(); overlay.remove(); });

    function tryPair() {
      if (invited || closed) return;
      const now = Date.now();
      for (const [id, seenAt] of waitingOthers) {
        if (now - seenAt > WAITING_TTL_MS) { waitingOthers.delete(id); continue; }
        if (me.id < id) { invited = id; lobby.send({ type: 'broadcast', event: 'invite', payload: { from: me.id, to: id } }); return; }
      }
    }

    lobby
      .on('broadcast', { event: 'waiting' }, ({ payload }) => {
        if (!payload || payload.id === me.id) return;
        waitingOthers.set(payload.id, Date.now());
        tryPair();
      })
      .on('broadcast', { event: 'invite' }, ({ payload }) => {
        if (!payload || payload.to !== me.id || invited) return;
        lobby.send({ type: 'broadcast', event: 'accept', payload: { from: me.id, to: payload.from } });
        cleanupLobby();
        if (!closed) runDuelChannel(sb, gameId, me, payload.from, overlay);
      })
      .on('broadcast', { event: 'accept' }, ({ payload }) => {
        if (!payload || payload.to !== me.id || invited !== payload.from) return;
        cleanupLobby();
        if (!closed) runDuelChannel(sb, gameId, me, payload.from, overlay);
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED' || closed) return;
        const announce = () => { if (!invited && !closed) lobby.send({ type: 'broadcast', event: 'waiting', payload: { id: me.id } }); };
        announce();
        heartbeatTimer = setInterval(announce, HEARTBEAT_MS);
        staleTimer = setInterval(() => {
          const now = Date.now();
          for (const [id, seenAt] of waitingOthers) if (now - seenAt > WAITING_TTL_MS) waitingOthers.delete(id);
        }, 2000);
      });
  }

  // ---------- Path B: invite a specific friend via DM (mutual-follows only, enforced by caller) ----------
  async function inviteFriendToDuel(sb, gameId, gameTitle, me, friend) {
    if (!me || me.isGuest || !friend) return;
    const overlay = makeOverlay();
    setBody(overlay, `<h2>${escapeHtml(gt('duel_sending_invite', '⚔️ 招待を送信中…'))}</h2><div class="duel-spinner"></div>`);
    const { error } = await sb.from('messages').insert({ sender_id: me.id, recipient_id: friend.id, body: `${INVITE_PREFIX}|${gameId}|${gameTitle}` });
    if (error) {
      setBody(overlay, `<h2>${escapeHtml(gt('duel_invite_failed_title', '⚠️ 招待を送れませんでした'))}</h2><p style="font-size:12px;">${escapeHtml(error.message || gt('duel_comm_error', '通信エラー'))}</p>`);
      return;
    }
    const friendName = friend.username || friend.handle || gt('duel_friend_fallback', 'フレンド');
    setBody(overlay, `<h2>${escapeHtml(gt('duel_invited_friend_title', '⚔️ {name}さんを招待しました').replace('{name}', friendName))}</h2><p>${escapeHtml(gt('duel_waiting_opponent_join', '相手が参加するのを待っています…'))}</p><div class="duel-spinner"></div>`);
    runDuelChannel(sb, gameId, me, friend.id, overlay);
  }

  async function acceptDuelInvite(sb, gameId, me, opponentId, opponentName) {
    if (!me || me.isGuest) return;
    const overlay = makeOverlay();
    const name = opponentName || gt('duel_friend_fallback', 'フレンド');
    setBody(overlay, `<h2>${escapeHtml(gt('duel_joined_friend_title', '⚔️ {name}さんとの対戦に参加しました').replace('{name}', name))}</h2><p>${escapeHtml(gt('duel_starting_shortly', 'まもなく開始します…'))}</p><div class="duel-spinner"></div>`);
    runDuelChannel(sb, gameId, me, opponentId, overlay);
  }

  // ---------- Friend picker (mutual-follows only) ----------
  function openFriendPicker(sb, gameId, gameTitle, me, friends) {
    const el = document.createElement('div');
    el.id = 'duel-overlay';
    const inviteTitle = escapeHtml(gt('duel_invite_friend_title', '⚔️ フレンドを誘う'));
    if (!friends.length) {
      el.innerHTML = `<div class="duel-box"><button class="panel-back" id="duel-close">←</button>
        <h2>${inviteTitle}</h2><p>${escapeHtml(gt('duel_no_friends_hint', 'お互いフォローし合っている「フレンド」がまだいません。まずは誰かをフォローして、フォローされてみてください。'))}</p></div>`;
    } else {
      el.innerHTML = `<div class="duel-box"><button class="panel-back" id="duel-close">←</button>
        <h2>${inviteTitle}</h2>
        <div style="max-height:280px;overflow-y:auto;text-align:left;">
          ${friends.map((f) => `<button class="friend-pick-btn" data-id="${f.id}">@${escapeHtml(f.handle || f.username)}</button>`).join('')}
        </div>
      </div>`;
    }
    document.body.appendChild(el);
    el.querySelector('#duel-close').addEventListener('click', () => el.remove());
    el.querySelectorAll('.friend-pick-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const friend = friends.find((f) => f.id === btn.dataset.id);
        el.remove();
        if (friend) inviteFriendToDuel(sb, gameId, gameTitle, me, friend);
      });
    });
  }

  window.DuelSystem = {
    INVITE_PREFIX,
    startOpenDuel, // generic (sb, gameId, me) -- any gameId other than 'reaction' runs the score-race
    openFriendPicker, // generic (sb, gameId, gameTitle, me, friends) -- task50: memory/slide use this
    acceptDuelInvite,
  };
})();
