// Anyway - server-side rankings (2026-10-26).
// Personal bests are still kept in localStorage by games.js (makeBestTracker); this file mirrors
// them to Supabase through the submit_score() RPC and renders the ranking modal behind the
// score badge. If the RPCs have not been installed yet (see 03_Anyway/ios_release/
// anyway_ios_release_migration_2026-10-26.sql) every call degrades silently to "rankings
// unavailable" -- gameplay and local bests are never affected.
// Classic (non-module) script like the rest of the app.
(function () {
  const FLUSH_DELAY_MS = 3000; // server allows 1 submission / 2s / game; also batches a run's climbing score
  const pending = {};
  let sb = null, user = null, timer = null, unavailable = false;

  function t(key, fallback) {
    const v = window.I18N ? window.I18N.t(key) : null;
    return v && v !== key ? v : fallback;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function isMissingFn(error) {
    const code = error && (error.code || '');
    const msg = (error && error.message) || '';
    return code === 'PGRST202' || code === '42883' || /could not find the function|does not exist/i.test(msg);
  }

  function init(client, currentUser) { sb = client; user = currentUser; }

  function submit(gameId, score) {
    if (!sb || !user || user.isGuest || unavailable) return;
    if (!Number.isFinite(score) || score < 0) return;
    pending[gameId] = Math.max(pending[gameId] || 0, Math.floor(score));
    clearTimeout(timer);
    timer = setTimeout(flush, FLUSH_DELAY_MS);
  }

  async function flush() {
    if (!sb || unavailable) return;
    const entries = Object.entries(pending);
    entries.forEach(([id]) => { delete pending[id]; });
    for (const [gameId, score] of entries) {
      try {
        const { error } = await sb.rpc('submit_score', { p_game_id: gameId, p_score: score });
        if (error) {
          if (isMissingFn(error)) { unavailable = true; return; }
          console.warn('submit_score rejected', gameId, error.message);
        }
      } catch (e) { console.warn('submit_score failed', e); }
    }
  }
  window.addEventListener('pagehide', () => { if (Object.keys(pending).length) flush(); });

  function closeModal() {
    const el = document.getElementById('lb-overlay');
    if (el) el.remove();
  }

  async function open(gameId, title) {
    closeModal();
    const ov = document.createElement('div');
    ov.id = 'lb-overlay';
    ov.innerHTML = `
      <div class="lb-box" role="dialog" aria-modal="true">
        <button type="button" class="lb-close" aria-label="${esc(t('lb_close', '閉じる'))}">×</button>
        <h2 class="lb-title">🏆 ${esc(title || gameId)}</h2>
        <div class="lb-tabs">
          <button type="button" class="lb-tab active" data-scope="all">${esc(t('lb_tab_all', '全体'))}</button>
          <button type="button" class="lb-tab" data-scope="friends">${esc(t('lb_tab_friends', 'フレンド'))}</button>
        </div>
        <div class="lb-body"></div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) closeModal(); });
    ov.querySelector('.lb-close').addEventListener('click', closeModal);
    const body = ov.querySelector('.lb-body');
    const tabs = [...ov.querySelectorAll('.lb-tab')];

    async function load(scope) {
      tabs.forEach((b) => b.classList.toggle('active', b.dataset.scope === scope));
      if (!user || user.isGuest) { body.innerHTML = `<p class="lb-note">${esc(t('lb_login_required', 'ランキングを見るにはアカウント登録が必要です。'))}</p>`; return; }
      if (unavailable) { body.innerHTML = `<p class="lb-note">${esc(t('lb_unavailable', 'ランキングは準備中です。'))}</p>`; return; }
      body.innerHTML = `<p class="lb-note">${esc(t('loading_text', '読み込み中…'))}</p>`;
      if (Object.keys(pending).length) await flush(); // make sure your own latest best is on the board
      const { data, error } = await sb.rpc('get_leaderboard', { p_game_id: gameId, p_scope: scope, p_limit: 50 });
      if (!document.getElementById('lb-overlay')) return; // closed while loading
      if (error) {
        if (isMissingFn(error)) unavailable = true;
        body.innerHTML = `<p class="lb-note">${esc(t(unavailable ? 'lb_unavailable' : 'lb_error', unavailable ? 'ランキングは準備中です。' : '読み込みに失敗しました。通信状況を確認してください。'))}</p>`;
        return;
      }
      if (!data || !data.length) { body.innerHTML = `<p class="lb-note">${esc(t('lb_empty', 'まだ記録がありません。最初の記録を作ろう！'))}</p>`; return; }
      body.innerHTML = `<ol class="lb-list">${data.map((r) => `
        <li class="${r.is_me ? 'lb-me' : ''}">
          <span class="lb-rank">${esc(r.rank)}</span>
          <span class="lb-name">${esc(r.handle ? '@' + r.handle : (r.username || '?'))}${r.is_me ? ` <em>${esc(t('lb_you', 'あなた'))}</em>` : ''}</span>
          <span class="lb-score">${esc(r.best_score)}</span>
        </li>`).join('')}</ol>`;
    }
    tabs.forEach((b) => b.addEventListener('click', () => load(b.dataset.scope)));
    load('all');
  }

  window.AnywayScores = { init, submit, flush, open };
})();
