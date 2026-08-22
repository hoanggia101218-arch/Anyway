// Anyway - Realtime 1:1 voice call (WebRTC), for mutual-follow "friends" only.
// The call button only ever appears inside an open DM chat (app.js's openChat()), which is
// itself gated to 13+ users (isMinor blocks the 'dm' tab entirely) and, per this feature's
// requirement, only rendered when the two users mutually follow each other. So reaching this
// code at all already implies both conditions the user asked for ("13歳以上でお互いフォロー
// しあってる（フレンド）なら電話できる").
//
// Mirrors duel.js's proven rendezvous pattern: join a Realtime channel named from the sorted
// pair of user ids, wait via Presence until both sides have joined, then the lower-id side
// ("host") creates the WebRTC offer; the other side answers. ICE candidates and the offer/
// answer SDP are relayed as Broadcast messages on the same channel -- no separate signaling
// server needed. Only free public STUN (no TURN, since a TURN relay would mean a paid service)
// is used, so two callers both behind strict/symmetric NATs can fail to connect; that's a known,
// documented limitation rather than a bug (see the notes on this task in status.json).
(function () {
  const CALL_INVITE_PREFIX = '📞CALL_INVITE📞';
  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

  // Mirrors duel.js's gt(): translate via i18n.js if available, else fall back to the
  // Japanese literal (this file's original hardcoded strings, kept as safe defaults).
  function gt(key, fallback) {
    if (!window.I18N) return fallback;
    const v = window.I18N.t(key);
    return v === key ? fallback : v;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function callChannelName(idA, idB) {
    const pair = [idA, idB].sort();
    return 'call:' + pair[0] + '-' + pair[1];
  }

  function makeOverlay() {
    const el = document.createElement('div');
    el.id = 'call-overlay';
    el.innerHTML = '<div class="duel-box"><button class="panel-back" id="call-close">←</button><div id="call-body"></div></div>';
    document.body.appendChild(el);
    return el;
  }
  function setBody(overlay, html) { overlay.querySelector('#call-body').innerHTML = html; }
  function setStatus(overlay, text) {
    const el = overlay.querySelector('#call-status');
    if (el) el.textContent = text;
  }

  function runCallChannel(sb, me, otherId, otherLabel, overlay) {
    let closed = false;
    let started = false;
    let pc = null;
    let localStream = null;
    let remoteAudio = null;
    const isHost = me.id < otherId;
    const callChannel = sb.channel(callChannelName(me.id, otherId), { config: { presence: { key: me.id } } });

    function teardown() {
      if (closed) return;
      closed = true;
      if (pc) { try { pc.close(); } catch (e) { /* best-effort */ } pc = null; }
      if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
      if (remoteAudio) { remoteAudio.remove(); remoteAudio = null; }
      try { callChannel.unsubscribe(); } catch (e) { /* best-effort */ }
    }

    overlay.querySelector('#call-close').addEventListener('click', () => {
      if (!closed) callChannel.send({ type: 'broadcast', event: 'hangup', payload: {} });
      teardown();
      overlay.remove();
    });

    setBody(overlay, `<h2>📞 ${escapeHtml(otherLabel)}</h2><p id="call-status">${escapeHtml(gt('call_preparing_mic', 'マイクを準備しています…'))}</p><div class="duel-spinner"></div>`);

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      if (closed) { stream.getTracks().forEach((t) => t.stop()); return; }
      localStream = stream;
      setStatus(overlay, gt('call_waiting_other', '相手を待っています…'));

      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));

      pc.onicecandidate = (e) => {
        if (e.candidate) callChannel.send({ type: 'broadcast', event: 'ice', payload: { candidate: e.candidate } });
      };
      pc.ontrack = (e) => {
        if (remoteAudio) remoteAudio.remove();
        remoteAudio = document.createElement('audio');
        remoteAudio.autoplay = true;
        remoteAudio.srcObject = e.streams[0];
        document.body.appendChild(remoteAudio);
      };
      pc.onconnectionstatechange = () => {
        if (closed) return;
        if (pc.connectionState === 'connected') setStatus(overlay, gt('call_in_progress', '通話中'));
        if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
          setStatus(overlay, gt('call_ended', '通話が終了しました'));
          setTimeout(() => { teardown(); overlay.remove(); }, 1500);
        }
      };

      async function startOffer() {
        if (closed || !pc || pc.signalingState !== 'stable') return;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        callChannel.send({ type: 'broadcast', event: 'offer', payload: { sdp: offer } });
      }

      callChannel
        .on('presence', { event: 'sync' }, () => {
          if (started || closed || !isHost) return;
          const state = callChannel.presenceState();
          if (Object.keys(state).length >= 2) { started = true; startOffer(); }
        })
        .on('broadcast', { event: 'offer' }, async ({ payload }) => {
          if (closed || isHost || !pc) return;
          started = true;
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          callChannel.send({ type: 'broadcast', event: 'answer', payload: { sdp: answer } });
        })
        .on('broadcast', { event: 'answer' }, async ({ payload }) => {
          if (closed || !isHost || !pc) return;
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        })
        .on('broadcast', { event: 'ice' }, async ({ payload }) => {
          if (closed || !pc || !payload || !payload.candidate) return;
          try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch (e) { /* stale/duplicate candidate, ignore */ }
        })
        .on('broadcast', { event: 'hangup' }, () => {
          if (closed) return;
          setStatus(overlay, gt('call_other_ended', '相手が通話を終了しました'));
          setTimeout(() => { teardown(); overlay.remove(); }, 1500);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED' && !closed) callChannel.track({ id: me.id });
        });
    }).catch(() => {
      setBody(overlay, `<h2>${escapeHtml(gt('call_mic_error_title', '⚠️ マイクを使用できませんでした'))}</h2><p style="font-size:12px;">${escapeHtml(gt('call_mic_error_hint', 'ブラウザの設定でマイクの使用を許可してください。'))}</p>`);
    });
  }

  async function startCall(sb, me, friend) {
    if (!me || me.isGuest || !friend) return;
    const { error } = await sb.from('messages').insert({ sender_id: me.id, recipient_id: friend.id, body: `${CALL_INVITE_PREFIX}|${friend.id}` });
    if (error) console.error('failed to send call invite message', error);
    const overlay = makeOverlay();
    runCallChannel(sb, me, friend.id, `@${friend.handle || friend.username || gt('duel_friend_fallback', 'フレンド')}`, overlay);
  }

  function acceptCall(sb, me, callerId, callerLabel) {
    if (!me || me.isGuest) return;
    const overlay = makeOverlay();
    runCallChannel(sb, me, callerId, callerLabel || gt('duel_friend_fallback', 'フレンド'), overlay);
  }

  window.CallSystem = { INVITE_PREFIX: CALL_INVITE_PREFIX, startCall, acceptCall };
})();
