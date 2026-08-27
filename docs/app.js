// Anyway - feed controller. Backend: Supabase (real auth, posts, likes, reposts, shares, DMs — shared across devices).
// Recommendation weights and guest mode stay local-only: they're per-device personalization, not shared data.

const SUPABASE_URL = 'https://qmqmpfjgxgwmsdeqpbiu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_wGQyRnhd3bxGmcppLkOx8w_-xJI3qn1';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const WEIGHTS_KEY = 'anyway_weights_';

function hashCode(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0; return h; }

function getPasswordHint() { return window.I18N ? window.I18N.t('auth_password_hint') : 'パスワードは6文字以上で、大文字・小文字・数字をそれぞれ1文字以上含めてください'; }
function isPasswordValid(pw) { return pw.length >= 6 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw); }
function isValidHandle(h) { return /^[a-zA-Z0-9_]{3,20}$/.test(h); }

// Child-safety filter for DMs: catches classic grooming red flags (arranging an in-person
// meeting, asking a minor's identifying info, asking for secrecy/photos/money) and basic
// harassment/self-harm language. This is a keyword filter, not real moderation — it raises
// the floor, it doesn't guarantee safety.
const DANGEROUS_PATTERNS = [
  /会(お|い)う/g, /待ち合わせ/g, /二人きり/g, /家(に|まで)(来|行)/g, /直接会/g, /今から会/g,
  /住所/g, /電話番号/g, /本名/g, /何(歳|才)/g, /学校(名|どこ|は)/g, /line\s*(の)?id/gi, /ライン(の)?id/gi,
  /秘密にして/g, /誰にも言わないで/g, /内緒(に|で)/g, /パパ活/g, /ママ活/g,
  /写真(送って|見せて)/g, /裸/g, /お小遣い(あげる|あげます|くれる)/g,
  /死ね/g, /殺す/g, /自殺/g, /リストカット/g,
];
function filterDangerousWords(text) {
  let out = text;
  let flagged = false;
  DANGEROUS_PATTERNS.forEach((re) => {
    if (re.test(out)) { flagged = true; out = out.replace(re, (m) => '●'.repeat(m.length)); }
  });
  return { text: out, flagged };
}

// User-controlled strings (usernames, custom titles) must never go into innerHTML raw.
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Shown in the profile screen so the account owner can confirm which account they're in --
// but a full plaintext email is easy to leak by accident (screenshots, screen-shares, demo
// recordings shown to third parties for review). Masking the local part keeps it recognizable
// to the owner while reducing what a passerby/viewer of a screenshot can read off directly.
function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0] || ''}●@${domain}`;
  return `${local.slice(0, 2)}${'●'.repeat(Math.min(local.length - 2, 6))}@${domain}`;
}

function getWeights(user) { try { return JSON.parse(localStorage.getItem(WEIGHTS_KEY + user.id)) || {}; } catch { return {}; } }
function setWeights(user, w) { localStorage.setItem(WEIGHTS_KEY + user.id, JSON.stringify(w)); }

// ---------- Ads (AdMob via Capacitor, task 30) ----------
// output/ is used two ways: as a plain website (this code runs in a normal browser,
// no Capacitor present) and wrapped in the Capacitor native app (Capacitor.Plugins is
// injected by the native runtime). Every function here checks isNativePlatform() and
// no-ops in the browser case, so the ad code is inert — not even loaded — for the
// regular web deployment. Ad unit IDs below are Google's own published TEST ids (same
// ones set in ios/Info.plist and android/AndroidManifest.xml's App ID) — they show
// real ad creative but don't earn revenue and require no AdMob account. Before actual
// App Store submission, replace all four with real ad unit IDs from an AdMob account
// the user creates (https://admob.google.com/) — not something this session can do.
function isNativeApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}
function admobPlugin() {
  return isNativeApp() && window.Capacitor.Plugins ? window.Capacitor.Plugins.AdMob : null;
}
const AD_UNIT_IDS = {
  interstitial: { ios: 'ca-app-pub-3940256099942544/4411468910', android: 'ca-app-pub-3940256099942544/1033173712' },
  rewarded: { ios: 'ca-app-pub-3940256099942544/1712485313', android: 'ca-app-pub-3940256099942544/5224354917' },
};
function currentAdUnitId(kind) {
  const platform = window.Capacitor.getPlatform ? window.Capacitor.getPlatform() : 'ios';
  return AD_UNIT_IDS[kind][platform === 'android' ? 'android' : 'ios'];
}
let adsInitialized = false;
async function initAds() {
  const admob = admobPlugin();
  if (!admob || adsInitialized) return;
  try {
    await admob.initialize({ initializeForTesting: true });
    adsInitialized = true;
  } catch (e) { console.error('AdMob init failed', e); }
}
let cardsShownSinceAd = 0;
const INTERSTITIAL_EVERY_N_CARDS = 5; // required-ad placement (task 30 item 3a)
// Toshiba (task52): open-matching (⚔️ only, no フレンド招待) duel expansion for these games.
// ('mathrush', 'whack' were removed along with their games — see the 2026-08-14 game-list cut.)
const OPEN_DUEL_GAME_IDS = ['dodge', 'flap'];
// Lenovo (task50): フレンド招待のみ (no open ⚔️ matching) duel expansion for these games.
// ('simon' was in the original task50 assignment but was removed in the 2026-08-14 game-list cut.)
const FRIEND_DUEL_GAME_IDS = ['memory', 'slide'];
async function maybeShowInterstitial() {
  const admob = admobPlugin();
  if (!admob) return;
  cardsShownSinceAd++;
  if (cardsShownSinceAd < INTERSTITIAL_EVERY_N_CARDS) return;
  cardsShownSinceAd = 0;
  try {
    await admob.prepareInterstitial({ adId: currentAdUnitId('interstitial') });
    await admob.showInterstitial();
  } catch (e) { console.error('interstitial ad failed', e); } // e.g. no fill — never block the feed on an ad failure
}
// Rewarded ad hook (task 30 item 3a, optional path): used by the "広告を見てコインを
// もらう" button in the profile panel. Resolves true only if the user actually
// watched to completion (AdMob's own reward callback), false on skip/failure/browser.
async function watchRewardedAd() {
  const admob = admobPlugin();
  if (!admob) return false;
  try {
    await admob.prepareRewardVideoAd({ adId: currentAdUnitId('rewarded') });
    const result = await admob.showRewardVideoAd();
    return !!result; // plugin resolves with reward info on completion, rejects/undefined otherwise
  } catch (e) {
    console.error('rewarded ad failed', e);
    return false;
  }
}

// ---------- In-app purchases: coin packs (task 30/34 monetization, "課金機能") ----------
// Uses cordova-plugin-purchase (Capacitor supports Cordova plugins directly) —
// exposes a global window.CdvPurchase, injected by the native runtime same as
// AdMob's Capacitor.Plugins. Same isNativeApp() guard, inert on the plain website.
//
// IMPORTANT DIFFERENCE FROM ADS: AdMob has Google's own published universal test ad
// unit IDs that work with zero setup. IAP has no equivalent — cordova-plugin-purchase
// cannot list a single product, get a price, or complete a purchase until matching
// products with these exact ids actually exist in App Store Connect / Google Play
// Console, which needs the user's own developer accounts (not something this session
// can create). This code is written correctly against the plugin's documented API and
// is ready to work the moment those products exist, but it has not been — cannot be —
// exercised end-to-end from this environment. Verified only: loads without error and
// stays fully inert when isNativeApp() is false (the actual website deployment).
const COIN_PRODUCTS = [
  { id: 'coins_100', coins: 100 },
  { id: 'coins_550', coins: 550 },
  { id: 'coins_1200', coins: 1200 },
];
let iapInitialized = false;
let iapProductsReady = false;
function iapStore() {
  return (isNativeApp() && window.CdvPurchase) ? window.CdvPurchase.store : null;
}
// onCoinsCredited(product) is called only after apply_coin_delta actually succeeds —
// transaction.finish() (which tells the store the purchase is fully handled) only
// runs after that, so a failed credit leaves the transaction pending for retry
// instead of silently eating the user's payment.
function initIAP(onCoinsCredited) {
  const store = iapStore();
  if (!store || iapInitialized) return;
  iapInitialized = true;
  const { ProductType, Platform } = window.CdvPurchase;
  const platform = window.Capacitor.getPlatform() === 'android' ? Platform.GOOGLE_PLAY : Platform.APPLE_APPSTORE;
  COIN_PRODUCTS.forEach((p) => store.register({ id: p.id, type: ProductType.CONSUMABLE, platform }));
  store.when().approved(async (transaction) => {
    const product = COIN_PRODUCTS.find((p) => transaction.products.some((tp) => tp.id === p.id));
    if (!product) return;
    const credited = await onCoinsCredited(product);
    if (credited) transaction.finish();
  });
  store.when().productUpdated(() => { iapProductsReady = true; });
  store.error((err) => console.error('IAP error', err));
  store.initialize([platform]);
}
function iapOfferFor(productId) {
  const store = iapStore();
  const product = store ? store.get(productId) : null;
  return product ? product.getOffer() : null;
}
async function purchaseCoinPack(productId) {
  const offer = iapOfferFor(productId);
  if (!offer) throw new Error('この商品は現在購入できません');
  const store = iapStore();
  await store.order(offer);
}

// ---------- Legal (terms of service / privacy policy) ----------
// Source of truth: legal/terms_of_service_ja.md and legal/privacy_policy_ja.md at the
// project root (DELL's drafts, task 29/30). Embedded here as strings — same reasoning
// as the Godot side (scripts/legal_text.gd): this is static hosting, not a build with a
// markdown-loader step, and embedding avoids a whole class of "did the file actually
// deploy to this path" failures for the sake of one static legal page. The "⚠️ 開発チーム
// より" confirmation-needed section at the end of each source .md is deliberately NOT
// included here — that section is instructions to the human operator, not something end
// users should see. If the .md source files change, update these two constants to match.
const TERMS_OF_SERVICE_MD = `# Anyway 利用規約

最終更新日: 2026年8月10日

この利用規約(以下「本規約」)は、「Anyway」(以下「本サービス」)の利用条件を定めるものです。本サービスを利用することで、本規約に同意したものとみなします。

## 第1条(サービス内容)

本サービスは、複数の短時間ミニゲームを縦スクロールのフィード形式で楽しめるアプリです。ユーザーは投稿(ゲームのリミックスを含む)、いいね、リポスト、コメント、ダイレクトメッセージ(DM)、クラブ(グループ)機能を利用できます。アカウントを作成せず「ゲスト」として一部機能を利用することもできます。

## 第2条(アカウント・年齢制限)

1. 本サービスは4歳以上のお子様から大人まで、幅広い年齢層にご利用いただけます(ゲーム閲覧・プレイ等)。
2. ただし、**投稿・いいね・ダイレクトメッセージ(DM)・クラブ(グループ)参加といったソーシャル機能は、13歳以上の方のみご利用いただけます。** 13歳未満の方はゲストとしてゲームの閲覧・プレイのみご利用ください。
3. 本サービスの一部機能(投稿・いいね・DM・クラブ参加等)の利用には、メールアドレスとパスワードによるアカウント登録が必要です。
4. ユーザーは、登録情報を正確に保つ責任を負います。
5. 他人になりすます目的でのアカウント作成、および1人で複数アカウントを不正に使い分ける行為を禁止します。

## 第3条(禁止事項)

ユーザーは、本サービスの利用にあたり、以下の行為を行ってはなりません。

1. 法令または公序良俗に違反する行為
2. 他のユーザーへの嫌がらせ、誹謗中傷、脅迫
3. 未成年者に対する不適切な接触(個人情報の聞き出し、直接会う約束の要求、写真の要求、金品の要求等を含む)
4. 自傷・自殺を助長する内容の投稿・送信
5. なりすまし、詐欺的行為
6. 本サービスの運営を妨害する行為(不正アクセス、過度な自動化アクセス等)
7. 著作権・肖像権その他第三者の権利を侵害する投稿

## 第4条(コンテンツの安全確認について)

本サービスでは、利用者(特に未成年者)を保護する目的で、ダイレクトメッセージの内容について、危険なパターン(個人情報の要求、直接会う約束、写真の要求、金品の要求、自傷に関する言葉等)を自動的に検知する仕組みを導入しています。これはキーワードに基づく簡易的な仕組みであり、すべての危険を防げるものではありません。不審なメッセージを受け取った場合は、やり取りを中止し、身近な大人や信頼できる相手に相談してください。

## 第5条(投稿・リミックス機能)

1. ユーザーが投稿したコンテンツ(ゲームの設定・タイトル等)の著作権は、当該コンテンツの元になったミニゲーム自体を含め、本サービス運営者または各ミニゲームの権利者に帰属します。ユーザーは投稿にあたり、パラメータの調整等の範囲で自身の創作的表現を加えることができます。
2. 「リミックス」機能により、他のユーザーの投稿を基に新しい投稿を作成できますが、元の投稿者を不当に貶める目的での利用は禁止します。

## 第6条(アカウントの停止・削除)

運営者は、ユーザーが本規約に違反したと判断した場合、事前の通知なくアカウントの利用を停止または削除できるものとします。

## 第7条(免責事項)

1. 本サービスは現状有姿で提供され、運営者は本サービスの完全性・正確性・特定目的への適合性について保証しません。
2. ユーザー間のトラブルについて、運営者は責任を負わないものとします。ただし、重大な問題(第3条・第4条に関する事案等)を把握した場合は、可能な範囲で対応します。

## 第8条(規約の変更)

運営者は、必要に応じて本規約を変更できるものとします。重要な変更がある場合は、本サービス内で通知します。

## 第9条(お問い合わせ)

本規約に関するお問い合わせは、本サービス内のお問い合わせ機能(実装予定)、または下記の運営者連絡先までご連絡ください。

運営者: ホアンジャバオ
連絡先: nexora26624@gmail.com`;

const PRIVACY_POLICY_MD = `# Anyway プライバシーポリシー

最終更新日: 2026年8月10日

「Anyway」(以下「本サービス」)は、ユーザーの皆様のプライバシーを尊重し、以下の方針に基づき個人情報を取り扱います。

## 1. 取得する情報

### アカウント登録時
- ユーザー名(表示名)
- ユーザーID(@ハンドル)
- メールアドレス
- パスワード(暗号化して保存され、運営者が平文で閲覧することはありません)

### 利用中に生成される情報
- 投稿内容(ゲームのリミックス設定、タイトル等)
- いいね・リポスト・コメントの履歴
- ダイレクトメッセージ(DM)の内容
- クラブ(グループ)への参加状況
- ゲームのスコア・プレイ履歴

### 自動的に取得される情報
- 端末のローカルストレージに保存される、おすすめ表示のための個人化情報(この情報は端末内のみに保存され、サーバーには送信されません)

### ゲストモードについて
アカウントを作成せず「ゲスト」として利用する場合、上記のうちアカウント関連情報は取得しません。フィードの閲覧・ゲームのプレイのみが可能です(投稿・いいね等の書き込みにはアカウント登録が必要です)。

## 2. 情報の利用目的

1. 本サービスの提供(フィード表示、投稿、DM等の機能提供)
2. 不正利用・迷惑行為の防止
3. 未成年者保護のための安全確認(ダイレクトメッセージ内の危険なパターンの自動検知。詳細は利用規約第4条を参照)
4. サービス改善のための統計的分析(個人を特定しない形で実施します)

## 3. 情報の第三者提供・委託

1. 本サービスは、バックエンドインフラとして Supabase(第三者のクラウドサービス)を利用しており、上記1.の情報は Supabase のサーバーに保存されます。
2. 法令に基づく場合を除き、取得した個人情報を本人の同意なく第三者に提供することはありません。

## 4. データの保管期間

アカウントが存在する限り、関連データを保管します。アカウント削除をご希望の場合は、本サービス内の機能(実装予定)またはお問い合わせ窓口よりご連絡ください。

## 5. ダイレクトメッセージの取り扱いについて

未成年者を含む利用者の安全を守るため、DMの内容について、危険なキーワードパターン(個人情報の要求、直接会う約束、写真の要求、金品の要求、自傷を示唆する言葉等)を自動的にスキャンする仕組みを導入しています。これはシステムによる自動処理であり、通常時に運営者がDMの内容を人力で閲覧することはありません。

## 6. お子様の利用について

本サービスは4歳以上のお子様からご利用いただけますが、**投稿・いいね・ダイレクトメッセージ(DM)・クラブ参加等のソーシャル機能は13歳以上の方に限定しています。** 13歳未満の方はゲームの閲覧・プレイのみご利用いただけます。この年齢制限は、児童のオンラインプライバシー保護に関する各国の法令(米国COPPA等)の考え方を踏まえたものです。保護者の方は、お子様が本サービスを利用される際、内容を確認・見守っていただくことを推奨します。

## 7. ユーザーの権利

ユーザーは、自身の登録情報の確認・修正・削除を求めることができます。お問い合わせ窓口までご連絡ください。

## 8. 本ポリシーの変更

本ポリシーは、必要に応じて変更されることがあります。重要な変更がある場合は、本サービス内で通知します。

## 9. お問い合わせ

本ポリシーに関するお問い合わせは、本サービス内のお問い合わせ機能(実装予定)、または下記の運営者連絡先までご連絡ください。

運営者: ホアンジャバオ
連絡先: nexora26624@gmail.com`;

// Minimal markdown -> HTML: only the subset actually used above (h1/h2, **bold**,
// numbered/bulleted lists, paragraphs). Not a general-purpose parser.
function legalMarkdownToHtml(md) {
  const lines = md.split('\n');
  let html = '';
  let inList = null; // 'ol' | 'ul' | null
  function closeList() { if (inList) { html += `</${inList}>`; inList = null; } }
  function inline(s) {
    return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') { closeList(); continue; }
    if (line.startsWith('### ')) { closeList(); html += `<h4>${inline(line.slice(4))}</h4>`; continue; }
    if (line.startsWith('## ')) { closeList(); html += `<h3>${inline(line.slice(3))}</h3>`; continue; }
    if (line.startsWith('# ')) { closeList(); html += `<h2>${inline(line.slice(2))}</h2>`; continue; }
    const numMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      if (inList !== 'ol') { closeList(); html += '<ol>'; inList = 'ol'; }
      html += `<li>${inline(numMatch[2])}</li>`;
      continue;
    }
    if (line.startsWith('- ')) {
      if (inList !== 'ul') { closeList(); html += '<ul>'; inList = 'ul'; }
      html += `<li>${inline(line.slice(2))}</li>`;
      continue;
    }
    closeList();
    html += `<p>${inline(line)}</p>`;
  }
  closeList();
  return html;
}

function showLegalModal() {
  const modal = document.getElementById('legal-modal');
  const content = document.getElementById('legal-content');
  // task55 Phase4 (2026-08-15): prefer the translated text in legal_i18n.js for the current
  // language; fall back to the Japanese originals below if that file is missing or has no
  // entry for this language yet (keeps this working even if legal_i18n.js fails to load).
  const lang = window.I18N ? window.I18N.getCurrentLang() : 'ja';
  const pack = (window.LEGAL_I18N && (window.LEGAL_I18N[lang] || window.LEGAL_I18N.ja)) || null;
  const terms = pack ? pack.terms : TERMS_OF_SERVICE_MD;
  const privacy = pack ? pack.privacy : PRIVACY_POLICY_MD;
  content.innerHTML = legalMarkdownToHtml(terms) + '<hr class="legal-divider">' + legalMarkdownToHtml(privacy);
  modal.classList.remove('hidden');
}
function hideLegalModal() { document.getElementById('legal-modal').classList.add('hidden'); }

document.getElementById('legal-close').addEventListener('click', hideLegalModal);
document.getElementById('show-legal-link').addEventListener('click', (e) => { e.preventDefault(); showLegalModal(); });

// ---------- Account (Supabase Auth) ----------
// "username" is a display name (duplicates allowed). "handle" is the unique @id used for
// search, follow, and DM addressing — like Instagram's display-name vs @handle split.
async function fetchProfile(id) {
  const { data, error } = await sb.from('profiles').select('username, color, handle, coins').eq('id', id).single();
  if (error) return null;
  return data;
}

async function getSessionUser() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const profile = await fetchProfile(session.user.id);
  if (!profile) return null;
  return {
    id: session.user.id, email: session.user.email, name: profile.username, handle: profile.handle, color: profile.color, coins: profile.coins || 0,
    isMinor: !!(session.user.user_metadata && session.user.user_metadata.is_minor),
  };
}

function logout() {
  sb.auth.signOut().then(() => location.reload());
}

function initAccount(onReady) {
  // task55 (2026-08-14): apply the saved/detected language to every static data-i18n
  // string in the document before anything else renders, regardless of which path below
  // this takes (existing session vs. fresh auth modal).
  if (window.I18N) window.I18N.applyI18n(document);
  // task55 Phase2 (2026-08-15): GAME_DEFS' title/genre (feed cards, search, profile lists,
  // create-post flow, share text -- every app.js call site that reads def.title/def.genre)
  // get translated in place here, then kept in sync on every later language change.
  if (window.I18N && window.applyGameDefsI18n) {
    window.applyGameDefsI18n();
    window.I18N.onLangChange(window.applyGameDefsI18n);
  }
  // Supabase redirects back here with #...&type=recovery after the user clicks a password-reset email link.
  if (location.hash.includes('type=recovery')) {
    showResetPasswordForm();
    return;
  }
  getSessionUser().then((existing) => {
    if (existing) { onReady(existing); return; }
    showAuthModal(onReady);
  });
}

function showResetPasswordForm() {
  const modal = document.getElementById('account-modal');
  modal.classList.remove('hidden');
  ['signup-form', 'login-form', 'reset-request-form', 'guest-btn'].forEach((id) => document.getElementById(id).classList.add('hidden'));
  document.getElementById('reset-password-form').classList.remove('hidden');

  const errorEl = document.getElementById('auth-error');
  async function submit() {
    errorEl.classList.add('hidden');
    const pw = document.getElementById('new-password-input').value;
    if (!isPasswordValid(pw)) { errorEl.textContent = getPasswordHint(); errorEl.classList.remove('hidden'); return; }
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) { errorEl.textContent = error.message; errorEl.classList.remove('hidden'); return; }
    history.replaceState(null, '', location.pathname);
    location.reload();
  }
  document.getElementById('reset-password-btn').addEventListener('click', submit);
  document.getElementById('new-password-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

// Age in whole years as of today, given a 'YYYY-MM-DD' birthdate string.
function computeAge(birthDateStr) {
  const bd = new Date(birthDateStr + 'T00:00:00');
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  const monthDiff = now.getMonth() - bd.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < bd.getDate())) age--;
  return age;
}

function showAuthModal(onReady) {
  const modal = document.getElementById('account-modal');
  const signupForm = document.getElementById('signup-form');
  const birthdateInput = document.getElementById('birthdate-input');
  birthdateInput.max = new Date().toISOString().slice(0, 10);
  const loginForm = document.getElementById('login-form');
  const resetRequestForm = document.getElementById('reset-request-form');
  const guestRow = document.getElementById('guest-btn');
  const errorEl = document.getElementById('auth-error');
  modal.classList.remove('hidden');

  // task55: language selector on the very first screen a new/returning visitor sees.
  const langSlot = document.getElementById('account-modal-lang-slot');
  if (langSlot && window.I18N && !langSlot.querySelector('select')) {
    langSlot.appendChild(window.I18N.buildSelector());
  }

  function showError(msg) { errorEl.textContent = msg; errorEl.classList.remove('hidden'); }
  function clearError() { errorEl.classList.add('hidden'); }
  function showOnly(form) {
    [signupForm, loginForm, resetRequestForm].forEach((f) => f.classList.toggle('hidden', f !== form));
    guestRow.classList.toggle('hidden', form !== signupForm);
  }

  document.getElementById('to-login').addEventListener('click', (e) => { e.preventDefault(); clearError(); showOnly(loginForm); });
  document.getElementById('to-signup').addEventListener('click', (e) => { e.preventDefault(); clearError(); showOnly(signupForm); });
  document.getElementById('forgot-password-link').addEventListener('click', (e) => { e.preventDefault(); clearError(); showOnly(resetRequestForm); });
  document.getElementById('back-to-login-from-reset').addEventListener('click', (e) => { e.preventDefault(); clearError(); showOnly(loginForm); });

  const t55auth = window.I18N ? window.I18N.t : (k) => k;
  async function signup() {
    clearError();
    const name = document.getElementById('username-input').value.trim();
    const handle = document.getElementById('userid-input').value.trim().replace(/^@/, '');
    const email = document.getElementById('email-input').value.trim().toLowerCase();
    const password = document.getElementById('password-input').value;
    if (!name) return showError(t55auth('auth_username_required'));
    if (!isValidHandle(handle)) return showError(t55auth('profile_set_handle_error_format'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError(t55auth('auth_email_invalid'));
    if (!isPasswordValid(password)) return showError(getPasswordHint());
    const birthDate = birthdateInput.value;
    if (!birthDate) return showError(t55auth('auth_birthdate_required'));
    const age = computeAge(birthDate);
    if (age < 0 || age > 120) return showError(t55auth('auth_birthdate_invalid'));
    const isMinor = age < 13;
    const { data: existingHandle } = await sb.from('profiles').select('id').ilike('handle', handle).maybeSingle();
    if (existingHandle) return showError(t55auth('profile_set_handle_error_taken'));
    const color = `hsl(${Math.abs(hashCode(name)) % 360}, 65%, 55%)`;
    // birth_date/is_minor go into Supabase Auth's user_metadata (no profiles table
    // schema change needed — this deploys immediately without a DB migration step).
    // NOTE: this makes is_minor a *client-trusted* flag, enforced in the UI only, not
    // by RLS — a technically sophisticated under-13 user could bypass it by calling
    // the REST API directly. A real RLS policy keyed on this same metadata would close
    // that gap; deferred for now (needs Supabase SQL access this session doesn't have,
    // see status.json task 30 notes) and should be picked up as a follow-up.
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { username: name, color, handle, birth_date: birthDate, is_minor: isMinor } } });
    if (error) return showError(error.message);
    if (!data.session) {
      showError(t55auth('auth_email_confirmation_sent'));
      return;
    }
    modal.classList.add('hidden');
    onReady({ id: data.user.id, email: data.user.email, name, handle, color, coins: 0, isMinor });
  }

  async function login() {
    clearError();
    const email = document.getElementById('login-email-input').value.trim().toLowerCase();
    const password = document.getElementById('login-password-input').value;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return showError(t55auth('auth_login_failed'));
    const profile = await fetchProfile(data.user.id);
    modal.classList.add('hidden');
    // Accounts created before this age-gate feature existed have no is_minor in their
    // metadata — undefined is treated as "not restricted" (not retroactively enforced;
    // we have no birthdate on file for them to check in the first place).
    onReady({
      id: data.user.id, email: data.user.email,
      name: profile ? profile.username : email, handle: profile ? profile.handle : null, color: profile ? profile.color : '#888888',
      coins: profile ? (profile.coins || 0) : 0,
      isMinor: !!(data.user.user_metadata && data.user.user_metadata.is_minor),
    });
  }

  async function requestReset() {
    clearError();
    const email = document.getElementById('reset-email-input').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError(t55auth('auth_email_invalid'));
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) return showError(error.message);
    showError(t55auth('auth_reset_email_sent'));
  }

  document.getElementById('start-btn').addEventListener('click', signup);
  document.getElementById('login-btn').addEventListener('click', login);
  document.getElementById('reset-request-btn').addEventListener('click', requestReset);
  document.getElementById('password-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') signup(); });
  document.getElementById('login-password-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
  document.getElementById('guest-btn').addEventListener('click', (e) => {
    e.preventDefault();
    modal.classList.add('hidden');
    onReady({ id: null, email: null, name: t55auth('guest_display_name'), handle: null, color: '#888888', isGuest: true, coins: 0 });
  });
}

// ---------- Recommendation (local personalization only) ----------
function pickNextGame(weights, lastId) {
  const candidates = GAME_DEFS.filter(g => g.id !== lastId);
  const total = candidates.reduce((sum, g) => sum + (weights[g.genre] || 1), 0);
  let r = Math.random() * total;
  for (const g of candidates) {
    r -= (weights[g.genre] || 1);
    if (r <= 0) return g;
  }
  return candidates[0];
}

// ---------- Feed ----------
async function initFeed(user) {
  // task55: best-effort sync of the chosen language to Supabase for logged-in users, so it
  // follows them to other devices. Guests only ever get localStorage (i18n.js's default).
  // Wrapped so that if `profiles.preferred_language` doesn't exist yet as a column (schema
  // migration not applied), this silently no-ops instead of breaking language switching.
  if (window.I18N && !user.isGuest) {
    window.I18N.setServerSync((lang) => { sb.from('profiles').update({ preferred_language: lang }).eq('id', user.id).then(() => {}, () => {}); });
  }
  initAds();
  initIAP(async (product) => {
    if (user.isGuest) return false; // shouldn't be reachable (store UI is hidden for guests) but don't credit a null account if it somehow is
    const { data, error } = await sb.rpc('apply_coin_delta', { delta: product.coins, txn_reason: 'iap_' + product.id });
    if (error) { console.error('coin credit after purchase failed', error); return false; }
    user.coins = data;
    refreshCoinDisplay();
    return true;
  });
  const feed = document.getElementById('feed');
  const userBar = document.getElementById('user-bar');
  function renderUserBar() {
    const t55 = window.I18N ? window.I18N.t : (k) => ({ login_cta: 'ログイン', switch_account_btn: '切替', guest_display_name: 'ゲスト' }[k] || k);
    if (user.isGuest) {
      userBar.innerHTML = `<span class="avatar" style="background:${user.color}"></span>${escapeHtml(t55('guest_display_name'))} <button id="login-cta-btn" class="login-cta">${escapeHtml(t55('login_cta'))}</button>`;
      document.getElementById('login-cta-btn').addEventListener('click', () => location.reload());
    } else {
      userBar.innerHTML = `<span class="avatar" style="background:${user.color}"></span><span class="user-handle">@${escapeHtml(user.handle || user.name)}</span> <span class="coin-badge" id="coin-badge">🪙${user.coins || 0}</span> <button id="switch-account-btn">${escapeHtml(t55('switch_account_btn'))}</button>`;
      document.getElementById('switch-account-btn').addEventListener('click', logout);
    }
  }
  renderUserBar();
  // task55: keep the header in sync when the user changes language from the profile panel
  // mid-session, instead of only picking it up on next reload.
  if (window.I18N) window.I18N.onLangChange(renderUserBar);
  function refreshCoinDisplay() {
    const el = document.getElementById('coin-badge');
    if (el) el.textContent = `🪙${user.coins || 0}`;
  }

  // Daily login bonus: +10 coins, at most once per calendar day. Routed through the
  // apply_coin_delta RPC (not a direct profiles.coins update) — direct client writes
  // to the coins column were a confirmed exploit (unlimited self-granted coins) fixed
  // earlier via a table-level REVOKE + this SECURITY DEFINER function, which also
  // does its own server-side daily_login dedup check and coin_transactions insert
  // atomically. The old client-side existence-check + direct update here predated
  // that fix and would now just silently fail (permission denied on coins) — this was
  // a real, previously-unnoticed regression, not a hypothetical.
  async function grantDailyLoginBonus() {
    if (user.isGuest) return;
    const { data, error } = await sb.rpc('apply_coin_delta', { delta: 10, txn_reason: 'daily_login' });
    if (error) return; // already granted today, or offline — same silent no-op as before
    user.coins = data;
    refreshCoinDisplay();
  }
  grantDailyLoginBonus();

  let weights = user.isGuest ? {} : getWeights(user);

  // Pull shared data from Supabase. If the network/backend is unreachable, degrade to
  // official-templates-only rather than breaking the whole app.
  let likesRows = [], repostsRows = [], sharesRows = [], allPosts = [], profilesById = new Map();
  let followRows = [], messageRows = [], dmReadRows = [], blocksRows = [];
  try {
    const [likesRes, repostsRes, sharesRes, postsRes, profilesRes, followsRes, messagesRes, dmReadsRes, blocksRes] = await Promise.all([
      sb.from('likes').select('user_id, game_id'),
      sb.from('reposts').select('user_id, game_id'),
      sb.from('shares').select('game_id'),
      sb.from('posts').select('*').order('created_at', { ascending: false }),
      sb.from('profiles').select('id, username, color, handle'),
      user.isGuest ? Promise.resolve({ data: [] }) : sb.from('follows').select('follower_id, followee_id').or(`follower_id.eq.${user.id},followee_id.eq.${user.id}`),
      user.isGuest ? Promise.resolve({ data: [] }) : sb.from('messages').select('*').or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`).order('created_at', { ascending: false }),
      user.isGuest ? Promise.resolve({ data: [] }) : sb.from('dm_reads').select('other_user_id, last_read_at').eq('user_id', user.id),
      user.isGuest ? Promise.resolve({ data: [] }) : sb.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`),
    ]);
    likesRows = likesRes.data || [];
    repostsRows = repostsRes.data || [];
    sharesRows = sharesRes.data || [];
    allPosts = postsRes.data || [];
    profilesRes.data && profilesRes.data.forEach((p) => profilesById.set(p.id, p));
    followRows = followsRes.data || [];
    messageRows = messagesRes.data || [];
    dmReadRows = dmReadsRes.data || [];
    blocksRows = blocksRes.data || [];
  } catch (e) {
    console.error('Supabase fetch failed, continuing with official templates only', e);
  }

  let likeCounts = {};
  likesRows.forEach((r) => { likeCounts[r.game_id] = (likeCounts[r.game_id] || 0) + 1; });
  let repostCounts = {};
  repostsRows.forEach((r) => { repostCounts[r.game_id] = (repostCounts[r.game_id] || 0) + 1; });
  let shareCounts = {};
  sharesRows.forEach((r) => { shareCounts[r.game_id] = (shareCounts[r.game_id] || 0) + 1; });
  let liked = new Set(user.isGuest ? [] : likesRows.filter((r) => r.user_id === user.id).map((r) => r.game_id));
  let reposted = new Set(user.isGuest ? [] : repostsRows.filter((r) => r.user_id === user.id).map((r) => r.game_id));
  let myPosts = user.isGuest ? [] : allPosts.filter((p) => p.creator_id === user.id);

  // Follows
  let followingSet = new Set(followRows.filter((r) => r.follower_id === user.id).map((r) => r.followee_id));
  let followerSet = new Set(followRows.filter((r) => r.followee_id === user.id).map((r) => r.follower_id));
  let followerCount = followerSet.size;
  let followingCount = followingSet.size;
  // Friends = mutual follow (used to gate who a duel "参加リクエスト" can be sent to).
  function getFriendProfiles() {
    const ids = [...followingSet].filter((id) => followerSet.has(id));
    return ids.map((id) => profilesById.get(id)).filter(Boolean);
  }

  // DMs: latest message per conversation partner, plus per-partner last-read timestamps (for the unread badge).
  let dmReadMap = new Map(dmReadRows.map((r) => [r.other_user_id, r.last_read_at]));
  let latestMessageByPartner = new Map();
  messageRows.forEach((m) => {
    const otherId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
    if (!latestMessageByPartner.has(otherId)) latestMessageByPartner.set(otherId, m);
  });
  function computeUnreadCount() {
    let n = 0;
    latestMessageByPartner.forEach((m, otherId) => {
      if (m.sender_id === user.id) return;
      const lastRead = dmReadMap.get(otherId);
      if (!lastRead || new Date(m.created_at) > new Date(lastRead)) n++;
    });
    return n;
  }
  function refreshDmBadge() {
    const badge = document.getElementById('dm-badge');
    const count = computeUnreadCount();
    if (count > 0) { badge.textContent = count > 9 ? '9+' : String(count); badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  }
  async function markRead(otherId) {
    const now = new Date().toISOString();
    dmReadMap.set(otherId, now);
    refreshDmBadge();
    await sb.from('dm_reads').upsert({ user_id: user.id, other_user_id: otherId, last_read_at: now });
  }
  async function toggleFollow(otherId, btn) {
    if (user.isGuest) return;
    const isFollowing = followingSet.has(otherId);
    if (isFollowing) {
      followingSet.delete(otherId);
      await sb.from('follows').delete().eq('follower_id', user.id).eq('followee_id', otherId);
    } else {
      followingSet.add(otherId);
      await sb.from('follows').insert({ follower_id: user.id, followee_id: otherId });
    }
    followingCount = followingSet.size;
    if (btn) {
      const nowFollowing = followingSet.has(otherId);
      const t55f = window.I18N ? window.I18N.t : (k) => ({ follow_btn_follow: 'フォローする', follow_btn_following: 'フォロー中' }[k] || k);
      btn.textContent = nowFollowing ? t55f('follow_btn_following') : t55f('follow_btn_follow');
      btn.classList.toggle('following', nowFollowing);
    }
  }
  refreshDmBadge();

  // Blocks: hide blocked/blocking users from search & DM lists. Actual message sending is
  // also enforced server-side (RLS on the messages table rejects inserts between blocked pairs)
  // so this holds even if the client is bypassed.
  let blockedByMe = new Set(blocksRows.filter((r) => r.blocker_id === user.id).map((r) => r.blocked_id));
  let blockingMe = new Set(blocksRows.filter((r) => r.blocked_id === user.id).map((r) => r.blocker_id));
  function isHidden(id) { return blockedByMe.has(id) || blockingMe.has(id); }
  async function toggleBlock(otherId) {
    if (blockedByMe.has(otherId)) {
      blockedByMe.delete(otherId);
      await sb.from('blocks').delete().eq('blocker_id', user.id).eq('blocked_id', otherId);
    } else {
      blockedByMe.add(otherId);
      await sb.from('blocks').insert({ blocker_id: user.id, blocked_id: otherId });
    }
  }
  const REPORT_REASONS = [
    { key: 'danger', labelKey: 'report_reason_danger' },
    { key: 'harassment', labelKey: 'report_reason_harassment' },
    { key: 'spam', labelKey: 'report_reason_spam' },
    { key: 'other', labelKey: 'report_reason_other' },
  ];
  async function submitReport(otherId, reason, detail) {
    await sb.from('reports').insert({ reporter_id: user.id, reported_user_id: otherId, reason, detail: detail || null });
  }

  // Realtime: keep follower count and the DM badge/list live without needing a page reload.
  if (!user.isGuest) {
    sb.channel('my-followers')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'follows', filter: `followee_id=eq.${user.id}` }, () => {
        followerCount++;
        if (!document.getElementById('profile-panel').classList.contains('hidden')) renderProfilePanel();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'follows', filter: `followee_id=eq.${user.id}` }, () => {
        followerCount = Math.max(0, followerCount - 1);
        if (!document.getElementById('profile-panel').classList.contains('hidden')) renderProfilePanel();
      })
      .subscribe();

    sb.channel('my-incoming-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${user.id}` }, async (payload) => {
        const m = payload.new;
        latestMessageByPartner.set(m.sender_id, m);
        if (!profilesById.has(m.sender_id)) {
          const { data: prof } = await sb.from('profiles').select('id, username, color, handle').eq('id', m.sender_id).maybeSingle();
          if (prof) profilesById.set(prof.id, prof);
        }
        refreshDmBadge();
        const dmPanelOpen = !document.getElementById('dm-panel').classList.contains('hidden');
        if (dmPanelOpen && dmPanelView === 'list') renderDmPanel();
      })
      .subscribe();
  }

  let lastGameId = null;
  let activeCleanup = null;
  let activeCard = null;
  const cardMeta = new WeakMap(); // card -> { def, config, creatorName }

  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
        activateCard(entry.target);
      }
    }
  }, { threshold: [0, 0.6, 1] });

  const loaderObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) appendCards(3);
  }, { threshold: 0.1 });

  function activateCard(card) {
    if (activeCard === card) return;
    if (activeCleanup) { activeCleanup(); activeCleanup = null; }
    const isFirstCard = activeCard === null;
    activeCard = card;
    const meta = cardMeta.get(card);
    const def = meta.def;
    lastGameId = def.id;
    if (!isFirstCard) maybeShowInterstitial(); // don't ad-interrupt the very first card on app open
    const mount = card.querySelector('.game-mount');
    mount.innerHTML = '';
    const scoreBadge = card.querySelector('.score-badge');
    const hintEl = card.querySelector('.hint-text');
    const scoreLabel = window.I18N ? window.I18N.t('score_label') : 'スコア';
    scoreBadge.textContent = `${scoreLabel}: 0`;
    hintEl.textContent = '';
    activeCleanup = def.mount(mount, {
      onScore: (s) => { scoreBadge.textContent = `${scoreLabel}: ${s}`; },
      onHint: (h) => { hintEl.textContent = h; setTimeout(() => { hintEl.textContent = ''; }, 3000); },
    }, meta.config);
  }

  // Likes/reposts are keyed by game id (not by post) so the same game showing up again
  // in the feed still reflects whether *you* liked/reposted it, and counts persist for everyone.
  function syncLikeUI(card, def) {
    const likeBtn = card.querySelector('.like-btn');
    const likeCount = card.querySelector('.like-count');
    const isLiked = liked.has(def.id);
    likeBtn.classList.toggle('liked', isLiked);
    likeBtn.textContent = isLiked ? '♥' : '♡';
    likeCount.textContent = likeCounts[def.id] || 0;
  }
  function syncRepostUI(card, def) {
    const repostBtn = card.querySelector('.repost-btn');
    const repostCount = card.querySelector('.repost-count');
    repostBtn.classList.toggle('reposted', reposted.has(def.id));
    repostCount.textContent = repostCounts[def.id] || 0;
  }
  function showCardHint(card, message) {
    const hintEl = card.querySelector('.hint-text');
    hintEl.textContent = message;
    setTimeout(() => { hintEl.textContent = ''; }, 2500);
  }

  // "..." card menu — was a bare "coming soon" hint before (準備中 placeholder, called
  // out directly by the user 2026-08-10). "興味なし" is the one action that's fully
  // self-contained (just nudges the local recommendation weights, no new backend
  // table/RLS needed) so it's what ships here; report-this-post would need a creator
  // user id that isn't currently carried on card metadata, follow-up if wanted.
  // "..." card menu. Was a single "興味なし" action; user feedback (2026-08-10) asked
  // for real safety-related options too, not just a recommendation tweak — report and
  // block, matching what other social apps put behind this exact button. Block/report
  // need the post's actual creator id, not just their display name, so createCard()
  // now threads creatorId through from every call site (own posts, search results,
  // freshly-posted remixes) — see cardMeta.
  function showMoreMenu(card, def) {
    const t55m = window.I18N ? window.I18N.t : (k) => k;
    const meta = cardMeta.get(card) || {};
    const creatorId = meta.creatorId;
    const isOwnPost = creatorId && user.id && creatorId === user.id;
    const overlay = document.createElement('div');
    overlay.className = 'more-menu-overlay';

    function renderMainMenu() {
      const blockLabel = creatorId && blockedByMe.has(creatorId) ? t55m('card_menu_unblock') : t55m('card_menu_block');
      overlay.innerHTML = `
        <div class="more-menu-box">
          <button class="more-menu-item" id="more-menu-not-interested">${escapeHtml(t55m('card_menu_not_interested'))}</button>
          <button class="more-menu-item" id="more-menu-bug">${escapeHtml(t55m('card_menu_report_bug'))}</button>
          ${(creatorId && !isOwnPost) ? `<button class="more-menu-item" id="more-menu-block">${escapeHtml(blockLabel)}</button>` : ''}
          <button class="more-menu-item" id="more-menu-cancel">${escapeHtml(t55m('card_menu_close'))}</button>
        </div>
      `;
      overlay.querySelector('#more-menu-cancel').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#more-menu-not-interested').addEventListener('click', () => {
        weights[def.genre] = Math.max(0.2, (weights[def.genre] || 1) - 4);
        setWeights(user, weights);
        overlay.remove();
        showCardHint(card, t55m('card_hint_genre_reduced').replace('{genre}', def.genre));
      });
      overlay.querySelector('#more-menu-bug').addEventListener('click', renderBugForm);
      const blockBtn = overlay.querySelector('#more-menu-block');
      if (blockBtn) {
        blockBtn.addEventListener('click', async () => {
          if (user.isGuest) { overlay.remove(); showCardHint(card, t55m('card_hint_login_required')); return; }
          await toggleBlock(creatorId);
          overlay.remove();
          showCardHint(card, blockedByMe.has(creatorId) ? t55m('card_hint_blocked') : t55m('card_hint_unblocked'));
        });
      }
    }

    function renderBugForm() {
      overlay.innerHTML = `
        <div class="more-menu-box" style="padding:16px;">
          <p class="panel-note small" style="margin-bottom:8px;">${escapeHtml(t55m('bug_report_prompt').replace('{title}', def.title))}</p>
          <textarea id="bug-report-text" class="create-title-input" rows="3" maxlength="500" style="width:100%;resize:vertical;box-sizing:border-box;" placeholder="${escapeHtml(t55m('bug_report_placeholder'))}"></textarea>
          <p class="error hidden" id="bug-report-error" style="margin-top:6px;"></p>
          <div style="display:flex;gap:8px;margin-top:10px;">
            <button class="post-btn" id="bug-report-submit" style="flex:1;">${escapeHtml(t55m('bug_report_submit_btn'))}</button>
            <button class="more-menu-item" id="bug-report-cancel" style="flex:0 0 auto;width:auto;padding:0 16px;border:none;border-radius:12px;background:rgba(255,255,255,0.1);">${escapeHtml(t55m('bug_report_back_btn'))}</button>
          </div>
        </div>
      `;
      overlay.querySelector('#bug-report-cancel').addEventListener('click', renderMainMenu);
      overlay.querySelector('#bug-report-submit').addEventListener('click', async () => {
        if (user.isGuest) { overlay.remove(); showCardHint(card, t55m('card_hint_login_required')); return; }
        const text = overlay.querySelector('#bug-report-text').value.trim();
        const errorEl = overlay.querySelector('#bug-report-error');
        if (!text) { errorEl.textContent = t55m('bug_report_error_empty'); errorEl.classList.remove('hidden'); return; }
        const submitBtn = overlay.querySelector('#bug-report-submit');
        submitBtn.disabled = true;
        // reports.reported_user_id models "report this person" — a bug report about a
        // game (often an official template with no creator at all) isn't reporting a
        // person, so this self-references the reporter as reported_user_id. That's a
        // deliberate reuse of the existing reports table/RLS rather than a new table
        // (schema changes aren't possible from this session — no Supabase dashboard
        // access), not a claim that the user did anything wrong.
        const { error } = await sb.from('reports').insert({
          reporter_id: user.id, reported_user_id: user.id, reason: 'bug_report',
          detail: `[ゲーム: ${def.title} / ${def.id}] ${text}`,
        });
        submitBtn.disabled = false;
        if (error) { errorEl.textContent = t55m('bug_report_error_failed'); errorEl.classList.remove('hidden'); return; }
        overlay.remove();
        showCardHint(card, t55m('bug_report_thanks'));
      });
    }

    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    renderMainMenu();
  }

  function createCard(def, config = {}, creatorName = null, customTitle = null, creatorId = null, postId = null) {
    const t55cc2 = window.I18N ? window.I18N.t : (k) => k;
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.gameId = def.id;
    if (postId) card.dataset.postId = postId;
    card.innerHTML = `
      <div class="game-mount"></div>
      <div class="overlay-top"><button class="search-btn">🔍</button><span class="tag">#${def.genre}</span></div>
      <div class="score-badge">${window.I18N ? window.I18N.t('score_label') : 'スコア'}: 0</div>
      <div class="hint-text"></div>
      <div class="overlay-bottom">
        <div class="title">${escapeHtml(customTitle || def.title)}</div>
        <div class="creator">${creatorName ? `@${escapeHtml(creatorName)} ・ ${escapeHtml(window.I18N ? window.I18N.t('card_remix_label') : 'リミックス')}` : (window.I18N ? window.I18N.t('official_creator') : 'Anyway公式')}</div>
      </div>
      <div class="side-actions">
        ${['aim', ...OPEN_DUEL_GAME_IDS].includes(def.id) ? `<div style="text-align:center;"><button class="duel-btn">⚔️</button></div>` : ''}
        ${FRIEND_DUEL_GAME_IDS.includes(def.id) ? `<div style="text-align:center;"><button class="friend-duel-btn">👥</button></div>` : ''}
        <div style="text-align:center;">
          <button class="like-btn">♡</button>
          <div class="action-count like-count">0</div>
        </div>
        <div style="text-align:center;">
          <button class="share-btn">↪</button>
          <div class="action-count share-count">0</div>
        </div>
        <div style="text-align:center;">
          <button class="repost-btn">⟲</button>
          <div class="action-count repost-count">0</div>
        </div>
        <div style="text-align:center;">
          <button class="more-btn">⋯</button>
        </div>
      </div>
    `;
    cardMeta.set(card, { def, config, creatorName, customTitle, creatorId, postId });
    syncLikeUI(card, def);
    syncRepostUI(card, def);
    card.querySelector('.share-count').textContent = shareCounts[def.id] || 0;

    const duelBtn = card.querySelector('.duel-btn');
    if (duelBtn) {
      duelBtn.addEventListener('click', () => {
        if (user.isGuest) return showCardHint(card, t55cc2('card_duel_login_required'));
        window.DuelSystem.startOpenDuel(sb, def.id, user);
      });
    }

    const friendDuelBtn = card.querySelector('.friend-duel-btn');
    if (friendDuelBtn) {
      friendDuelBtn.addEventListener('click', () => {
        if (user.isGuest) return showCardHint(card, t55cc2('card_duel_login_required'));
        window.DuelSystem.openFriendPicker(sb, def.id, def.title, user, getFriendProfiles());
      });
    }

    card.querySelector('.like-btn').addEventListener('click', async () => {
      if (user.isGuest) return showCardHint(card, t55cc2('card_like_login_required'));
      if (user.isMinor) return showCardHint(card, t55cc2('club_minor_restricted'));
      const turningOn = !liked.has(def.id);
      if (turningOn) {
        liked.add(def.id);
        weights[def.genre] = (weights[def.genre] || 1) + 3;
        likeCounts[def.id] = (likeCounts[def.id] || 0) + 1;
      } else {
        liked.delete(def.id);
        weights[def.genre] = Math.max(1, (weights[def.genre] || 1) - 3);
        likeCounts[def.id] = Math.max(0, (likeCounts[def.id] || 0) - 1);
      }
      setWeights(user, weights);
      document.querySelectorAll(`.card[data-game-id="${def.id}"]`).forEach((c) => syncLikeUI(c, def));
      if (turningOn) await sb.from('likes').insert({ user_id: user.id, game_id: def.id });
      else await sb.from('likes').delete().eq('user_id', user.id).eq('game_id', def.id);
    });

    card.querySelector('.repost-btn').addEventListener('click', async () => {
      if (user.isGuest) return showCardHint(card, t55cc2('card_repost_login_required'));
      if (user.isMinor) return showCardHint(card, t55cc2('club_minor_restricted'));
      const turningOn = !reposted.has(def.id);
      if (turningOn) { reposted.add(def.id); repostCounts[def.id] = (repostCounts[def.id] || 0) + 1; }
      else { reposted.delete(def.id); repostCounts[def.id] = Math.max(0, (repostCounts[def.id] || 0) - 1); }
      document.querySelectorAll(`.card[data-game-id="${def.id}"]`).forEach((c) => syncRepostUI(c, def));
      if (turningOn) await sb.from('reposts').insert({ user_id: user.id, game_id: def.id });
      else await sb.from('reposts').delete().eq('user_id', user.id).eq('game_id', def.id);
    });

    card.querySelector('.share-btn').addEventListener('click', async () => {
      if (user.isGuest) return showCardHint(card, t55cc2('card_share_login_required'));
      shareCounts[def.id] = (shareCounts[def.id] || 0) + 1;
      document.querySelectorAll(`.card[data-game-id="${def.id}"] .share-count`).forEach((el) => { el.textContent = shareCounts[def.id]; });
      if (navigator.share) {
        navigator.share({ title: `Anyway - ${def.title}`, text: t55cc2('share_text').replace('{title}', def.title) }).catch(() => {});
      }
      await sb.from('shares').insert({ user_id: user.id, game_id: def.id });
    });

    card.querySelector('.more-btn').addEventListener('click', () => {
      showMoreMenu(card, def);
    });

    card.querySelector('.search-btn').addEventListener('click', () => openTab('search'));

    io.observe(card);
    return card;
  }

  function appendCards(n) {
    loaderObserver.disconnect();
    const loader = document.getElementById('loader');
    for (let i = 0; i < n; i++) {
      const def = pickNextGame(weights, lastGameId);
      lastGameId = def.id;
      const card = createCard(def);
      feed.insertBefore(card, loader);
    }
    loaderObserver.observe(loader);
  }

  // your own saved posts show up first
  myPosts.forEach((post) => {
    const def = GAME_DEFS.find((g) => g.id === post.game_id);
    if (!def) return;
    const card = createCard(def, post.config || {}, user.handle || user.name, post.custom_title, user.id, post.id);
    feed.insertBefore(card, document.getElementById('loader'));
    lastGameId = def.id;
  });

  // initial batch
  const initialDefs = [...GAME_DEFS].sort(() => Math.random() - 0.5);
  for (const def of initialDefs) {
    const card = createCard(def);
    feed.insertBefore(card, document.getElementById('loader'));
  }
  lastGameId = initialDefs[initialDefs.length - 1].id;
  loaderObserver.observe(document.getElementById('loader'));

  // activate first card immediately (IntersectionObserver also covers this on scroll, but don't rely on rAF timing)
  const first = feed.querySelector('.card');
  if (first) activateCard(first);

  // ---------- Bottom tab bar: edit(current) / home(feed) / create(new, center) / dm / profile ----------
  // "home" just closes every overlay panel, since the feed is always there underneath them.
  const panels = {
    edit: document.getElementById('edit-panel'),
    create: document.getElementById('create-panel'),
    dm: document.getElementById('dm-panel'),
    profile: document.getElementById('profile-panel'),
    search: document.getElementById('search-panel'),
    club: document.getElementById('club-panel'),
    elements: document.getElementById('elements-panel'),
  };
  const navBtns = [...document.querySelectorAll('.nav-btn')];
  // 'elements' (精霊図鑑, task per user feedback 2026-08-10: "3D character assets were
  // made but never put in the app") is pure viewing, no write actions — open to guests
  // same as search, not gated like create/dm/profile.
  const guestExemptTabs = ['home', 'search', 'elements'];

  function openTab(tab) {
    if (!guestExemptTabs.includes(tab) && user.isGuest) { location.reload(); return; }
    // Age-gate (task 30 / legal/terms_of_service_ja.md 第2条): posting and DMs are
    // social/contact-risk features restricted to 13+. Club join/create is gated
    // separately inside the club panel itself, since that flow has its own UI states.
    if (user.isMinor && (tab === 'create' || tab === 'dm')) { alert(window.I18N ? window.I18N.t('club_minor_restricted') : '13歳未満の方はこの機能をご利用いただけません'); return; }
    if (tab !== 'dm') closeChatChannel();
    navBtns.forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    Object.entries(panels).forEach(([name, el]) => el.classList.toggle('hidden', name !== tab));
    if (tab === 'edit') renderEditPanel();
    if (tab === 'create') renderCreatePanel();
    if (tab === 'profile') renderProfilePanel();
    if (tab === 'search') renderSearchPanel();
    if (tab === 'dm') renderDmPanel();
    if (tab === 'club') renderClubPanel();
    if (tab === 'elements') {
      // Lazy-load: the gallery is a full separate Three.js scene (10 characters'
      // worth of procedural geometry + one glTF) — no reason to pay that cost until
      // the user actually opens this panel.
      const frame = document.getElementById('elements-frame');
      if (!frame.src) frame.src = 'elements-gallery.html';
    }
  }
  navBtns.forEach((btn) => btn.addEventListener('click', () => openTab(btn.dataset.tab)));
  document.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => openTab('home')));
  document.getElementById('club-panel-back').addEventListener('click', () => {
    if (clubPanelView === 'list') openTab('profile');
    else if (clubPanelView === 'applications' && clubPanelClubId) renderClubDetail(clubPanelClubId);
    else renderClubPanel();
  });

  async function postRemix(def, config, customTitle) {
    const card = createCard(def, config, user.handle || user.name, customTitle, user.id);
    feed.insertBefore(card, document.getElementById('loader'));
    openTab('home');
    card.scrollIntoView({ block: 'start' });
    if (!user.isGuest) {
      const { data, error } = await sb.from('posts')
        .insert({ game_id: def.id, config, custom_title: customTitle || null, creator_id: user.id })
        .select().single();
      if (error) { console.error('failed to save post', error); return; }
      myPosts.unshift(data);
      card.dataset.postId = data.id;
      cardMeta.get(card).postId = data.id;
    }
  }

  const GENRE_EMOJI = { 'アクション': '🎮', 'パズル': '🧩', 'クイズ': '❓', '反射神経': '⚡', '記憶': '🧠', 'クラシック': '🕹️', 'タイミング': '🎯' };

  // Renders a "pick N of these" chooser (emoji characters, colors, ...) and returns a getter for the current selection.
  function renderChoiceRow(body, param, initialValues) {
    const row = document.createElement('div');
    row.className = 'param-row';
    const label = document.createElement('label');
    label.textContent = param.label;
    row.appendChild(label);
    const countEl = document.createElement('div');
    countEl.className = 'param-value';
    row.appendChild(countEl);
    const grid = document.createElement('div');
    grid.className = 'choice-grid';
    row.appendChild(grid);

    let selected = [...initialValues];
    function updateCount() {
      const template = window.I18N ? window.I18N.t('param_selected_count') : '{n} / {count} 選択中';
      countEl.textContent = template.replace('{n}', selected.length).replace('{count}', param.count);
    }

    param.options.forEach((opt) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice-item';
      if (param.key === 'colors') b.style.background = opt;
      else b.textContent = opt;
      b.classList.toggle('selected', selected.includes(opt));
      b.addEventListener('click', () => {
        const idx = selected.indexOf(opt);
        if (idx !== -1) selected.splice(idx, 1);
        else if (selected.length < param.count) selected.push(opt);
        b.classList.toggle('selected', selected.includes(opt));
        updateCount();
      });
      grid.appendChild(b);
    });
    updateCount();
    body.appendChild(row);
    return () => selected;
  }

  // Map browser: swipe up/down through the season's maps (Brawl Stars Creative-style),
  // tap left/right on the photo to cycle angle shots. Selecting a map doesn't do anything
  // yet — the "turn a chosen map into an editable post" step comes in a follow-up.
  function renderCreatePanel() {
    const body = document.getElementById('create-panel-body');
    body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'map-browser';
    const total = MAP_DEFS.length + 2;
    wrap.appendChild(buildMazeDrawCard(0, total));
    MAP_DEFS.forEach((map, i) => {
      wrap.appendChild(buildMapCard(map, i + 1, total));
    });
    wrap.appendChild(buildOtherGamesCard(MAP_DEFS.length + 1, total));
    body.appendChild(wrap);
  }

  // task108 (MSI, 2026-08-22): found that renderCreatePanel only ever offered 'mymaze' or the
  // royale/cup 3D map flow -- every other GAME_DEFS entry (dodge/memory/flap/slide/stack/aim/
  // merge/fillitall/skyduel/spiritshop/runner/spiral/hex/flow/marble/fort/trail, 17 games) had
  // NO create-flow path at all, so a first post of any of them could never be made by a real
  // user (only reachable by remixing an already-existing post -- and none existed yet for the
  // newly added hex/flow/marble/fort/trail). `.template-grid`/`.template-item` in style.css was
  // already fully built for exactly this but never wired to any JS (grepped 0 matches project-
  // wide) -- wiring it up here rather than inventing new markup/CSS.
  const GENRE_ICON = { 'アクション': '🎮', 'パズル': '🧩', 'タイミング': '⏱️', '記憶': '🧠' };
  // 2026-08-23 (MSI, user request): per-game icons so the list reads at a glance instead of
  // every puzzle/action game sharing one generic genre emoji. Only overrides where a distinct
  // icon meaningfully helps recognition; anything not listed here still falls back to
  // GENRE_ICON[def.genre] below (unchanged behavior for games not worth a bespoke icon).
  const GAME_ICON = {
    dodge: '🚧', memory: '🎴', flap: '🐦', slide: '💠', stack: '🗼', aim: '🎯', merge: '🔮',
    fillitall: '🖌️', skyduel: '✈️', spiritshop: '🏪', runner: '🏃',
    hex: '🔷', flow: '🧪', marble: '⚪', fort: '🏰', trail: '🐾',
  };
  const NO_MAP_FLOW_IDS = new Set(['mymaze', 'royale', 'cup', 'trapdojo']);
  function buildOtherGamesCard(index, total) {
    const t55og = window.I18N ? window.I18N.t : (k) => k;
    const card = document.createElement('div');
    card.className = 'map-card';
    card.innerHTML = `
      <div class="map-card-pos">${index + 1} / ${total}</div>
      <h2 class="map-card-name">${escapeHtml(t55og('map_other_games_title'))}</h2>
      <p class="map-card-tagline">${escapeHtml(t55og('map_other_games_tagline'))}</p>
    `;
    const grid = document.createElement('div');
    grid.className = 'template-grid';
    grid.style.marginTop = '14px';
    GAME_DEFS.filter((def) => !NO_MAP_FLOW_IDS.has(def.id)).forEach((def) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'template-item';
      item.innerHTML = `
        <div class="template-icon">${GAME_ICON[def.id] || GENRE_ICON[def._jaGenre || def.genre] || '🎮'}</div>
        <div class="template-title">${escapeHtml(def.title)}</div>
        <div class="template-genre">${escapeHtml(def.genre)}</div>
      `;
      item.addEventListener('click', () => renderCreateForm(def));
      grid.appendChild(item);
    });
    card.appendChild(grid);
    return card;
  }

  // First card in the create flow: a 2D grid course you draw yourself (window.MazeEditor),
  // separate from the 3D Element Arena map carousel below it. Posts as the 'mymaze' GAME_DEFS
  // entry (games.js's mountMyMaze), one config.layout per post -- no character selection step,
  // since this is a solo obstacle course, not a battle.
  function buildMazeDrawCard(index, total) {
    const t55md = window.I18N ? window.I18N.t : (k) => k;
    const card = document.createElement('div');
    card.className = 'map-card';
    card.innerHTML = `
      <div class="map-card-pos">${index + 1} / ${total}</div>
      <h2 class="map-card-name">${escapeHtml(t55md('map_draw_title'))}</h2>
      <p class="map-card-tagline">${escapeHtml(t55md('map_draw_tagline'))}</p>
      <div class="map-photo-carousel">
        <div class="map-photo-tile" style="background:linear-gradient(135deg,#20222a,#31d158 40%,#ffd23f 100%);"><span>${escapeHtml(t55md('map_draw_grid_label'))}</span></div>
      </div>
      <p class="panel-note small" style="margin:14px 0 6px;">${escapeHtml(t55md('map_draw_meaning_label'))}</p>
      <ul class="map-feature-list">
        <li>${escapeHtml(t55md('map_draw_wall'))}</li>
        <li>${escapeHtml(t55md('map_draw_hazard'))}</li>
        <li>${escapeHtml(t55md('map_draw_start_goal'))}</li>
      </ul>
      <button class="post-btn maze-draw-btn">${escapeHtml(t55md('map_draw_start_btn'))}</button>
    `;
    card.querySelector('.maze-draw-btn').addEventListener('click', () => renderMazeEditorScreen());
    return card;
  }

  function renderMazeEditorScreen() {
    const body = document.getElementById('create-panel-body');
    body.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'map-editor-container';
    body.appendChild(container);
    window.MazeEditor.mount(container, {
      onBack: () => renderCreatePanel(),
      onConfirm: (layout, title) => {
        const def = GAME_DEFS.find((g) => g.id === 'mymaze');
        if (!def) return;
        postRemix(def, { layout }, title || def.title);
      },
    });
  }

  function mapPhotoBgStyle(photo) {
    return photo.image
      ? `background-color:${photo.color};background-image:url('${photo.image}');background-size:cover;background-position:center;`
      : `background:${photo.color};`;
  }

  // task108 (MSI, 2026-08-25): map.name/tagline/features/history/photos[].label were rendered
  // straight from maps.js -- pure Japanese literals with no i18n path at all -- even though
  // this map browser is shown to every user creating a royale/cup post. Added map_<id>_* keys
  // to i18n.js (8 languages) and route every field through gt(key, fallback) here, same lazy-
  // evaluation pattern as maze-editor.js/map-editor.js: falls back to the maps.js literal if a
  // key is ever missing, so this can never regress to showing a raw key name.
  function buildMapCard(map, index, total) {
    const t55mc = window.I18N ? window.I18N.t : (k) => k;
    const mName = gt(`map_${map.id}_name`, map.name);
    const mTagline = gt(`map_${map.id}_tagline`, map.tagline);
    const mHistory = gt(`map_${map.id}_history`, map.history);
    const photoLabel = (i2) => gt(`map_${map.id}_photo_${i2 + 1}`, map.photos[i2].label);
    const featureText = (f, i2) => gt(`map_${map.id}_feature_${i2 + 1}`, f);
    const card = document.createElement('div');
    card.className = 'map-card';
    card.innerHTML = `
      <div class="map-card-pos">${index + 1} / ${total}</div>
      <h2 class="map-card-name">${escapeHtml(mName)}</h2>
      ${mTagline ? `<p class="map-card-tagline">${escapeHtml(mTagline)}</p>` : ''}
      <div class="map-photo-carousel">
        <div class="map-photo-tile" style="${mapPhotoBgStyle(map.photos[0])}"><span>${escapeHtml(photoLabel(0))}</span></div>
        <button type="button" class="map-photo-nav prev" aria-label="${escapeHtml(t55mc('map_photo_prev'))}"></button>
        <button type="button" class="map-photo-nav next" aria-label="${escapeHtml(t55mc('map_photo_next'))}"></button>
      </div>
      <div class="map-photo-dots">
        ${map.photos.map((_, i2) => `<span class="map-photo-dot${i2 === 0 ? ' active' : ''}"></span>`).join('')}
      </div>
      <p class="panel-note small" style="margin-bottom:6px;">${escapeHtml(t55mc('map_features_label'))}</p>
      <ul class="map-feature-list">${map.features.map((f, i2) => `<li>${escapeHtml(featureText(f, i2))}</li>`).join('')}</ul>
      <p class="map-card-history">${escapeHtml(mHistory)}</p>
      <button class="post-btn map-select-btn">${escapeHtml(t55mc('map_select_btn'))}</button>
    `;
    const tile = card.querySelector('.map-photo-tile');
    let photoIdx = 0;
    function showPhoto(i2) {
      photoIdx = (i2 + map.photos.length) % map.photos.length;
      const p = map.photos[photoIdx];
      tile.style.cssText = mapPhotoBgStyle(p);
      tile.querySelector('span').textContent = photoLabel(photoIdx);
      card.querySelectorAll('.map-photo-dot').forEach((d, di) => d.classList.toggle('active', di === photoIdx));
    }
    card.querySelector('.map-photo-nav.prev').addEventListener('click', () => showPhoto(photoIdx - 1));
    card.querySelector('.map-photo-nav.next').addEventListener('click', () => showPhoto(photoIdx + 1));
    card.querySelectorAll('.map-photo-dot').forEach((dot, di) => dot.addEventListener('click', () => showPhoto(di)));
    card.querySelector('.map-select-btn').addEventListener('click', () => {
      renderRuleSelector(map);
    });
    return card;
  }

  // Rule selector (2026-08-16): DELL's original task63 note promised "まず今すぐできる分(ツール
  // にルール選択画面を追加、選ばないと次へ進めない)を実装します" for the two proposed new
  // multiplayer rules (エレメント・ロワイヤル=battle royale, エレメント・カップ=4vs4 soccer).
  // That screen (RULE_DEFS/renderRuleSelector) did get built, but was deleted in task68 as
  // collateral damage of removing Element Arena (it was wired to Element Arena's survival mode
  // at the time). Re-added here, scoped to the two rules DELL actually proposed: ロワイヤル is
  // ready (task74's royale.js), カップ isn't built yet so it's shown disabled/"準備中" — matching
  // the "選ばないと次へ進めない" requirement via a disabled "次へ" button until a ready rule is
  // picked, same interaction model DELL described.
  function getRuleDefs() {
    const t55r = window.I18N ? window.I18N.t : (k) => k;
    return [
      { id: 'royale', title: t55r('rule_title_royale'), icon: '⚔️', gameId: 'royale', ready: true,
        desc: t55r('rule_desc_royale') },
      { id: 'cup', title: t55r('rule_title_cup'), icon: '⚽', gameId: 'cup', ready: true,
        desc: t55r('rule_desc_cup') },
    ];
  }
  function renderRuleSelector(map) {
    const t55r = window.I18N ? window.I18N.t : (k) => k;
    const RULE_DEFS = getRuleDefs();
    const body = document.getElementById('create-panel-body');
    body.innerHTML = '';

    const back = document.createElement('button');
    back.className = 'back-link';
    back.textContent = t55r('rule_back_to_maps');
    back.addEventListener('click', () => renderCreatePanel());
    body.appendChild(back);

    const intro = document.createElement('p');
    intro.className = 'panel-note';
    intro.textContent = t55r('rule_select_intro').replace('{map}', gt(`map_${map.id}_name`, map.name));
    body.appendChild(intro);

    const list = document.createElement('div');
    list.className = 'rule-list';
    body.appendChild(list);

    let selected = null;
    const cardEls = RULE_DEFS.map((rule) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rule-card' + (rule.ready ? '' : ' disabled');
      if (!rule.ready) btn.disabled = true;
      btn.innerHTML = `
        <span class="rule-card-icon">${rule.icon}</span>
        <span class="rule-card-body">
          <span class="rule-card-title-row">
            <span class="rule-card-title">${escapeHtml(rule.title)}</span>
            ${rule.ready ? '' : `<span class="rule-card-badge">${escapeHtml(t55r('rule_badge_coming_soon'))}</span>`}
          </span>
          <span class="rule-card-desc">${escapeHtml(rule.desc)}</span>
        </span>
      `;
      if (rule.ready) {
        btn.addEventListener('click', () => {
          selected = rule;
          cardEls.forEach((c) => c.classList.toggle('selected', c === btn));
          nextBtn.disabled = false;
        });
      }
      list.appendChild(btn);
      return btn;
    });

    const nextBtn = document.createElement('button');
    nextBtn.className = 'post-btn';
    nextBtn.textContent = t55r('rule_next_btn');
    nextBtn.disabled = true;
    nextBtn.style.margin = '4px 16px 16px';
    nextBtn.style.width = 'calc(100% - 32px)';
    nextBtn.addEventListener('click', () => {
      if (selected) render3DSceneEditor(map, selected);
    });
    body.appendChild(nextBtn);
  }

  // 3D scene editor (2026-08-15 restore, corrected same day): the user clarified that the
  // original "消して" request was scoped to the official 2D-pretending-to-be-3D Element Arena
  // MINIGAME code, not to the 3D spirit models (spirit-models.js's buildBlaze etc., still fully
  // intact and used by 精霊図鑑/elements-gallery.html) or the "stand on the map, pick your
  // spirit" placement experience itself. Before Element Arena was deleted (task68), the flow was
  // a single "選択" button straight into this 3D editor, where the *real 3D spirit model* you
  // placed directly WAS the game you posted (element_<charId>) — no separate flat "which game?"
  // list in between.
  // First attempt at restoring this (same day) got the roster wrong: it built the character
  // list from GAME_DEFS ids (dodge/skyduel/...) instead of the real spirit ids. Those ids don't
  // exist in map-editor.js's CHAR_BUILDERS map (blaze/aqua/volt/gust/terra/frost/light/nox/
  // leaf/plasma only), so buildCharacterInstance() would have silently returned null and placed
  // nothing — the user caught this immediately from the roster showing generic game-genre emoji
  // instead of the actual 3D characters. Fixed: the roster below IS the 10 real spirits (data
  // lifted from elements-gallery.html's CHARACTERS array, the one other place their name/
  // element/color still lives after task68 deleted games.js's copy), so CHAR_BUILDERS resolves
  // correctly and a real 3D model renders when placed. Since there's no more element_<charId>
  // game to route to 1:1, every placement posts as 'royale' (エレメント・ロワイヤル, the actual
  // multiplayer spirit-battle game) — the closest real equivalent — with the chosen spirit's
  // name folded into the post title so the choice isn't just discarded.
  let activeMapEditor = null;
  function waitForMapEditor(cb) {
    if (window.MapEditor) { cb(); return; }
    let tries = 0;
    const iv = setInterval(() => {
      tries += 1;
      if (window.MapEditor || tries > 50) { clearInterval(iv); cb(); }
    }, 100);
  }
  function getSpiritAvatars() {
    const t55s = window.I18N ? window.I18N.t : (k) => k;
    return [
      { id: 'blaze', name: 'ブレイズ', element: t55s('elem_fire'), color: '#e6551a', icon: '🔥', skillLine: t55s('spirit_skillline_blaze'), ultimateName: t55s('spirit_ultimate_name') },
      { id: 'aqua', name: 'アクア', element: t55s('elem_water'), color: '#0288d1', icon: '💧', skillLine: t55s('spirit_skillline_aqua'), ultimateName: t55s('spirit_ultimate_name') },
      { id: 'volt', name: 'ボルト', element: t55s('elem_thunder'), color: '#e6a800', icon: '⚡', skillLine: t55s('spirit_skillline_volt'), ultimateName: t55s('spirit_ultimate_name') },
      { id: 'gust', name: 'ガスト', element: t55s('elem_wind'), color: '#4c9a2a', icon: '🌪️', skillLine: t55s('spirit_skillline_gust'), ultimateName: t55s('spirit_ultimate_name') },
      { id: 'terra', name: 'テラ', element: t55s('elem_rock'), color: '#6b7a3c', icon: '🪨', skillLine: t55s('spirit_skillline_terra'), ultimateName: t55s('spirit_ultimate_name') },
      { id: 'frost', name: 'フロスト', element: t55s('elem_ice'), color: '#3d94c2', icon: '❄️', skillLine: t55s('spirit_skillline_frost'), ultimateName: t55s('spirit_ultimate_name') },
      { id: 'light', name: 'ライト', element: t55s('elem_light'), color: '#d9a53a', icon: '✨', skillLine: t55s('spirit_skillline_light'), ultimateName: t55s('spirit_ultimate_name') },
      { id: 'nox', name: 'ノクス', element: t55s('elem_dark'), color: '#4a2a80', icon: '🌑', skillLine: t55s('spirit_skillline_nox'), ultimateName: t55s('spirit_ultimate_name') },
      { id: 'leaf', name: 'リーフ', element: t55s('elem_plant'), color: '#4f8a2c', icon: '🌿', skillLine: t55s('spirit_skillline_leaf'), ultimateName: t55s('spirit_ultimate_name') },
      { id: 'plasma', name: 'プラズマ', element: t55s('elem_energy'), color: '#6a3fc0', icon: '🔮', skillLine: t55s('spirit_skillline_plasma'), ultimateName: t55s('spirit_ultimate_name') },
    ];
  }
  function render3DSceneEditor(map, rule) {
    const t55m3 = window.I18N ? window.I18N.t : (k) => k;
    const mName = gt(`map_${map.id}_name`, map.name);
    const spiritAvatars = getSpiritAvatars();
    const body = document.getElementById('create-panel-body');
    body.innerHTML = '';
    if (activeMapEditor) { activeMapEditor.destroy(); activeMapEditor = null; }
    const container = document.createElement('div');
    container.className = 'map-editor-container';
    body.appendChild(container);
    const bgPhoto = map.photos && map.photos[0];
    waitForMapEditor(() => {
      if (!window.MapEditor) {
        container.textContent = t55m3('editor3d_load_failed');
        return;
      }
      activeMapEditor = window.MapEditor.mount(container, {
        mapName: mName,
        mapPhotoUrl: bgPhoto && bgPhoto.image,
        mapColor: (bgPhoto && bgPhoto.color) || '#222',
        characters: spiritAvatars,
        onBack: () => { if (activeMapEditor) { activeMapEditor.destroy(); activeMapEditor = null; } renderRuleSelector(map); },
        onConfirm: (charId, placements, rules) => {
          const spirit = spiritAvatars.find((s) => s.id === charId);
          const def = GAME_DEFS.find((g) => g.id === (rule && rule.gameId));
          if (activeMapEditor) { activeMapEditor.destroy(); activeMapEditor = null; }
          if (!def) { renderRuleSelector(map); return; }
          const mapLayout = {
            photoUrl: bgPhoto && bgPhoto.image,
            color: (bgPhoto && bgPhoto.color) || '#222',
            items: (placements || []).filter((p) => !(p.kind === 'character' && p.id === charId)),
            rules: rules || { timeLimit: 0, difficulty: 1 },
          };
          const titleContext = spirit ? `${mName}・${spirit.name}` : mName;
          renderCreateForm(def, titleContext, mapLayout);
        },
      });
    });
  }

  function renderCreateForm(def, mapName = null, mapLayout = null) {
    const t55cf = window.I18N ? window.I18N.t : (k) => k;
    const body = document.getElementById('create-panel-body');
    body.innerHTML = '';

    const back = document.createElement('button');
    back.className = 'back-link';
    back.textContent = t55cf('create_back_to_template');
    back.addEventListener('click', () => renderCreatePanel());
    body.appendChild(back);

    const titleRow = document.createElement('div');
    titleRow.className = 'param-row';
    titleRow.innerHTML = `<label>${escapeHtml(t55cf('create_title_label'))}</label><input type="text" class="create-title-input" maxlength="24">`;
    body.appendChild(titleRow);
    const titleInput = titleRow.querySelector('input');
    titleInput.value = mapName ? `【${mapName}】${def.title}` : def.title;

    const sliders = {};
    (def.params || []).forEach((p) => {
      const row = document.createElement('div');
      row.className = 'param-row';
      row.innerHTML = `<label>${p.label}</label><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.default}"><div class="param-value">${p.default}</div>`;
      body.appendChild(row);
      const input = row.querySelector('input');
      const valueEl = row.querySelector('.param-value');
      input.addEventListener('input', () => { valueEl.textContent = input.value; });
      sliders[p.key] = input;
    });

    const choiceGetters = {};
    (def.choiceParams || []).forEach((cp) => {
      choiceGetters[cp.key] = renderChoiceRow(body, cp, cp.options.slice(0, cp.count));
    });

    if (!(def.params && def.params.length) && !(def.choiceParams && def.choiceParams.length)) {
      const note = document.createElement('p');
      note.className = 'panel-note small';
      note.textContent = t55cf('create_no_params_note');
      body.appendChild(note);
    }

    const postBtn = document.createElement('button');
    postBtn.className = 'post-btn';
    postBtn.textContent = t55cf('post_submit_btn');
    postBtn.addEventListener('click', () => {
      const newConfig = {};
      (def.params || []).forEach((p) => { newConfig[p.key] = Number(sliders[p.key].value); });
      (def.choiceParams || []).forEach((cp) => { newConfig[cp.key] = choiceGetters[cp.key](); });
      if (mapLayout) newConfig.mapLayout = mapLayout;
      const customTitle = titleInput.value.trim() || def.title;
      postRemix(def, newConfig, customTitle);
    });
    body.appendChild(postBtn);
  }

  function renderEditPanel() {
    const t55ep = window.I18N ? window.I18N.t : (k) => k;
    const body = document.getElementById('edit-panel-body');
    body.innerHTML = '';
    if (!activeCard) { body.innerHTML = `<p class="panel-note">${escapeHtml(t55ep('edit_select_game_note'))}</p>`; return; }
    const meta = cardMeta.get(activeCard);
    const def = meta.def;
    const baseConfig = meta.config || {};

    const intro = document.createElement('p');
    intro.className = 'panel-note';
    intro.textContent = t55ep('edit_remix_intro').replace('{title}', def.title);
    body.appendChild(intro);

    const sliders = {};
    (def.params || []).forEach((p) => {
      const current = baseConfig[p.key] ?? p.default;
      const row = document.createElement('div');
      row.className = 'param-row';
      row.innerHTML = `<label>${p.label}</label><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${current}"><div class="param-value">${current}</div>`;
      body.appendChild(row);
      const input = row.querySelector('input');
      const valueEl = row.querySelector('.param-value');
      input.addEventListener('input', () => { valueEl.textContent = input.value; });
      sliders[p.key] = input;
    });

    const choiceGetters = {};
    (def.choiceParams || []).forEach((cp) => {
      const current = (baseConfig[cp.key] && baseConfig[cp.key].length === cp.count) ? baseConfig[cp.key] : cp.options.slice(0, cp.count);
      choiceGetters[cp.key] = renderChoiceRow(body, cp, current);
    });

    if (!(def.params && def.params.length) && !(def.choiceParams && def.choiceParams.length)) {
      const note = document.createElement('p');
      note.className = 'panel-note small';
      note.textContent = t55ep('edit_no_params_note');
      body.appendChild(note);
    }

    const postBtn = document.createElement('button');
    postBtn.className = 'post-btn';
    postBtn.textContent = t55ep('post_submit_btn');
    postBtn.addEventListener('click', () => {
      const newConfig = {};
      (def.params || []).forEach((p) => { newConfig[p.key] = Number(sliders[p.key].value); });
      (def.choiceParams || []).forEach((cp) => { newConfig[cp.key] = choiceGetters[cp.key](); });
      postRemix(def, newConfig);
    });
    body.appendChild(postBtn);
  }

  // ---------- Club ----------
  // Founding requires either 50+ followers or spending 1000 coins; joining depends on the
  // club's own join_policy ('open' / 'followers_required' / 'review'), enforced by RLS on
  // club_members so the checks hold even if the client is bypassed.
  const CLUB_FOUND_MIN_FOLLOWERS = 50;
  const CLUB_FOUND_COST_COINS = 1000;
  let clubPanelView = 'list';
  let clubPanelClubId = null;
  let myClub = null;

  async function fetchMyClub() {
    if (user.isGuest) { myClub = null; return; }
    const { data } = await sb.from('club_members').select('club_id, role, clubs(id, name)').eq('user_id', user.id).maybeSingle();
    myClub = data ? { id: data.club_id, name: data.clubs.name, role: data.role } : null;
  }

  async function renderClubPanel() {
    clubPanelView = 'list';
    clubPanelClubId = null;
    const t55c = window.I18N ? window.I18N.t : (k) => k;
    document.getElementById('club-panel-title').textContent = t55c('club_panel_title');
    const body = document.getElementById('club-panel-body');
    body.innerHTML = `<p class="panel-note small">${escapeHtml(t55c('loading_text'))}</p>`;
    await fetchMyClub();

    let html = '';
    if (myClub) {
      html += `
        <p class="panel-note">${escapeHtml(t55c('club_my_club_label'))}</p>
        <button class="search-result" id="my-club-link">
          <span class="search-result-title">🛡️ ${escapeHtml(myClub.name)}</span>
          <span class="search-result-meta">${myClub.role === 'owner' ? escapeHtml(t55c('club_role_owner')) : escapeHtml(t55c('club_role_member'))}</span>
        </button>
      `;
    } else {
      html += `
        <p class="panel-note small">${escapeHtml(t55c('club_no_club_yet'))}</p>
        <button class="post-btn" id="create-club-btn">${escapeHtml(t55c('club_create_btn'))}</button>
      `;
    }
    html += `
      <div class="param-row" style="margin-top:20px;">
        <label>${escapeHtml(t55c('club_search_label'))}</label>
        <input type="text" id="club-search-input" class="create-title-input" placeholder="${escapeHtml(t55c('club_search_placeholder'))}">
      </div>
      <div id="club-search-results"></div>
    `;
    body.innerHTML = html;

    if (myClub) {
      document.getElementById('my-club-link').addEventListener('click', () => renderClubDetail(myClub.id));
    } else {
      document.getElementById('create-club-btn').addEventListener('click', renderCreateClubForm);
    }
    const searchInput = document.getElementById('club-search-input');
    searchInput.addEventListener('input', async () => {
      const q = searchInput.value.trim();
      const resultsEl = document.getElementById('club-search-results');
      if (!q) { resultsEl.innerHTML = ''; return; }
      const { data } = await sb.from('clubs').select('id, name, description').ilike('name', `%${q}%`).limit(20);
      resultsEl.innerHTML = (data || []).map((c) => `
        <button class="search-result club-search-item" data-club-id="${c.id}">
          <span class="search-result-title">🛡️ ${escapeHtml(c.name)}</span>
          <span class="search-result-meta">${escapeHtml(c.description || '')}</span>
        </button>
      `).join('') || `<p class="panel-note small">${escapeHtml(t55c('search_no_results'))}</p>`;
      resultsEl.querySelectorAll('.club-search-item').forEach((btn) => {
        btn.addEventListener('click', () => renderClubDetail(Number(btn.dataset.clubId)));
      });
    });
  }

  function renderCreateClubForm() {
    clubPanelView = 'create';
    const t55cc = window.I18N ? window.I18N.t : (k) => k;
    document.getElementById('club-panel-title').textContent = t55cc('club_create_panel_title');
    const body = document.getElementById('club-panel-body');
    const eligibleByFollowers = followerCount >= CLUB_FOUND_MIN_FOLLOWERS;
    const eligibleByCoins = (user.coins || 0) >= CLUB_FOUND_COST_COINS;
    const clearedSuffix = t55cc('club_cleared_suffix');
    body.innerHTML = `
      <button class="back-link" id="back-to-club-list">${escapeHtml(t55cc('club_back_to_list'))}</button>
      <p class="panel-note small">${escapeHtml(t55cc('club_found_condition').replace('{followers}', CLUB_FOUND_MIN_FOLLOWERS).replace('{coins}', CLUB_FOUND_COST_COINS))}</p>
      <p class="panel-note small">${escapeHtml(t55cc('club_your_status')
        .replace('{followers}', followerCount).replace('{followersCleared}', eligibleByFollowers ? clearedSuffix : '')
        .replace('{coins}', user.coins || 0).replace('{coinsCleared}', eligibleByCoins ? clearedSuffix : ''))}</p>
      <div class="param-row">
        <label>${escapeHtml(t55cc('club_name_label'))}</label>
        <input type="text" id="club-name-input" class="create-title-input" maxlength="24">
      </div>
      <div class="param-row">
        <label>${escapeHtml(t55cc('club_desc_label'))}</label>
        <input type="text" id="club-desc-input" class="create-title-input" maxlength="80">
      </div>
      <div class="param-row">
        <label>${escapeHtml(t55cc('club_join_method_label'))}</label>
        <div class="choice-grid" id="club-policy-grid">
          <button type="button" class="reason-item selected" data-policy="open">${escapeHtml(t55cc('club_policy_open'))}</button>
          <button type="button" class="reason-item" data-policy="followers_required">${escapeHtml(t55cc('club_policy_followers_required'))}</button>
          <button type="button" class="reason-item" data-policy="review">${escapeHtml(t55cc('club_policy_review'))}</button>
        </div>
      </div>
      <div class="param-row hidden" id="club-min-followers-row">
        <label>${escapeHtml(t55cc('club_min_followers_label'))}</label>
        <input type="number" id="club-min-followers-input" class="create-title-input" value="10" min="0">
      </div>
      <p class="error hidden" id="create-club-error"></p>
      <button class="post-btn" id="submit-create-club-btn" ${(!eligibleByFollowers && !eligibleByCoins) ? 'disabled' : ''}>${escapeHtml(t55cc('club_create_submit_btn'))}</button>
    `;
    document.getElementById('back-to-club-list').addEventListener('click', renderClubPanel);
    let selectedPolicy = 'open';
    document.querySelectorAll('#club-policy-grid .reason-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedPolicy = btn.dataset.policy;
        document.querySelectorAll('#club-policy-grid .reason-item').forEach((b) => b.classList.toggle('selected', b === btn));
        document.getElementById('club-min-followers-row').classList.toggle('hidden', selectedPolicy !== 'followers_required');
      });
    });
    document.getElementById('submit-create-club-btn').addEventListener('click', async () => {
      const errorEl = document.getElementById('create-club-error');
      errorEl.classList.add('hidden');
      if (user.isMinor) { errorEl.textContent = t55cc('club_minor_restricted'); errorEl.classList.remove('hidden'); return; }
      const name = document.getElementById('club-name-input').value.trim();
      const description = document.getElementById('club-desc-input').value.trim();
      const minFollowers = selectedPolicy === 'followers_required' ? (Number(document.getElementById('club-min-followers-input').value) || 0) : 0;
      if (!name) { errorEl.textContent = t55cc('club_name_required'); errorEl.classList.remove('hidden'); return; }
      if (myClub) { errorEl.textContent = t55cc('club_already_member'); errorEl.classList.remove('hidden'); return; }
      if (!eligibleByFollowers && !eligibleByCoins) { errorEl.textContent = t55cc('club_condition_not_met'); errorEl.classList.remove('hidden'); return; }
      const costCoins = eligibleByFollowers ? 0 : CLUB_FOUND_COST_COINS;
      const { data, error } = await sb.from('clubs')
        .insert({ name, description: description || null, founder_id: user.id, join_policy: selectedPolicy, min_followers: minFollowers })
        .select().single();
      if (error) {
        errorEl.textContent = error.code === '23505' ? t55cc('club_name_taken') : error.message;
        errorEl.classList.remove('hidden');
        return;
      }
      const { error: memberError } = await sb.from('club_members').insert({ club_id: data.id, user_id: user.id, role: 'owner' });
      if (memberError) { errorEl.textContent = memberError.message; errorEl.classList.remove('hidden'); return; }
      if (costCoins > 0) {
        // Same fix as grantDailyLoginBonus: direct profiles.coins writes are revoked
        // server-side now, must go through apply_coin_delta.
        const { data: newBalance, error: coinError } = await sb.rpc('apply_coin_delta', { delta: -costCoins, txn_reason: 'club_founding' });
        if (!coinError) { user.coins = newBalance; refreshCoinDisplay(); }
      }
      renderClubDetail(data.id);
    });
  }

  async function renderClubDetail(clubId) {
    clubPanelView = 'detail';
    clubPanelClubId = clubId;
    const t55cd = window.I18N ? window.I18N.t : (k) => k;
    const body = document.getElementById('club-panel-body');
    body.innerHTML = `<p class="panel-note small">${escapeHtml(t55cd('loading_text'))}</p>`;
    const [{ data: club }, { data: members }] = await Promise.all([
      sb.from('clubs').select('*').eq('id', clubId).single(),
      sb.from('club_members').select('user_id, role').eq('club_id', clubId),
    ]);
    if (!club) { body.innerHTML = `<p class="panel-note small">${escapeHtml(t55cd('club_not_found'))}</p>`; return; }
    document.getElementById('club-panel-title').textContent = club.name;
    const isOwner = club.founder_id === user.id;
    const isMember = (members || []).some((m) => m.user_id === user.id);

    const memberIds = (members || []).map((m) => m.user_id);
    const memberProfiles = new Map();
    if (memberIds.length) {
      const { data: profs } = await sb.from('profiles').select('id, handle, username').in('id', memberIds);
      (profs || []).forEach((p) => memberProfiles.set(p.id, p));
    }

    const policyLabel = {
      open: t55cd('club_policy_open'), followers_required: t55cd('club_policy_followers_required_detail').replace('{n}', club.min_followers), review: t55cd('club_policy_review'),
    }[club.join_policy] || club.join_policy;

    let actionHtml = '';
    if (isMember) {
      actionHtml = isOwner
        ? `<p class="panel-note small">${escapeHtml(t55cd('club_you_are_owner'))}</p>`
        : `<button class="post-btn leave-btn" id="leave-club-btn">${escapeHtml(t55cd('club_leave_btn'))}</button>`;
    } else if (myClub) {
      actionHtml = `<p class="panel-note small">${escapeHtml(t55cd('club_other_club_notice'))}</p>`;
    } else if (club.join_policy === 'review') {
      actionHtml = `<button class="post-btn" id="apply-club-btn">${escapeHtml(t55cd('club_apply_btn'))}</button><p class="panel-note small hidden" id="apply-done-msg">${escapeHtml(t55cd('club_apply_done_msg'))}</p>`;
    } else {
      actionHtml = `<button class="post-btn" id="join-club-btn">${escapeHtml(t55cd('join_btn_label'))}</button><p class="error hidden" id="join-club-error"></p>`;
    }

    body.innerHTML = `
      <button class="back-link" id="back-to-club-list">${escapeHtml(t55cd('club_back_to_list'))}</button>
      <p class="panel-note">${escapeHtml(club.description || '')}</p>
      <p class="panel-note small">${escapeHtml(t55cd('club_join_condition_label').replace('{label}', policyLabel))}</p>
      <p class="panel-note small">${escapeHtml(t55cd('club_member_count_label').replace('{n}', members ? members.length : 0))}</p>
      ${actionHtml}
      ${isOwner ? `<button class="post-btn" id="manage-applications-btn" style="margin-top:10px;">${escapeHtml(t55cd('club_manage_applications_btn'))}</button>` : ''}
      <p class="panel-note" style="margin-top:20px;">${escapeHtml(t55cd('club_members_label'))}</p>
      <ul class="liked-list">
        ${(members || []).map((m) => {
          const p = memberProfiles.get(m.user_id);
          const handle = p ? (p.handle || p.username) : t55cd('club_unknown_member');
          return `<li><span>${m.role === 'owner' ? '👑 ' : ''}@${escapeHtml(handle)}</span><span>${m.role === 'owner' ? escapeHtml(t55cd('club_role_owner')) : escapeHtml(t55cd('club_role_member'))}</span></li>`;
        }).join('') || `<li style="opacity:0.5;">${escapeHtml(t55cd('club_no_members'))}</li>`}
      </ul>
    `;
    document.getElementById('back-to-club-list').addEventListener('click', renderClubPanel);

    if (isMember && !isOwner) {
      document.getElementById('leave-club-btn').addEventListener('click', async () => {
        if (!confirm(t55cd('club_confirm_leave').replace('{name}', club.name))) return;
        await sb.from('club_members').delete().eq('club_id', clubId).eq('user_id', user.id);
        renderClubDetail(clubId);
      });
    }
    if (!isMember && !myClub && club.join_policy === 'review') {
      document.getElementById('apply-club-btn').addEventListener('click', async () => {
        if (user.isMinor) { alert(t55cd('club_minor_restricted')); return; }
        const { error } = await sb.from('club_applications').insert({ club_id: clubId, user_id: user.id });
        if (!error) document.getElementById('apply-done-msg').classList.remove('hidden');
      });
    }
    if (!isMember && !myClub && club.join_policy !== 'review') {
      document.getElementById('join-club-btn').addEventListener('click', async () => {
        if (user.isMinor) {
          const errorEl = document.getElementById('join-club-error');
          errorEl.textContent = t55cd('club_minor_restricted');
          errorEl.classList.remove('hidden');
          return;
        }
        const { error } = await sb.from('club_members').insert({ club_id: clubId, user_id: user.id, role: 'member' });
        if (error) {
          const errorEl = document.getElementById('join-club-error');
          errorEl.textContent = t55cd('club_join_condition_failed');
          errorEl.classList.remove('hidden');
          return;
        }
        renderClubDetail(clubId);
      });
    }
    if (isOwner) {
      document.getElementById('manage-applications-btn').addEventListener('click', () => renderClubApplications(clubId));
    }
  }

  async function renderClubApplications(clubId) {
    clubPanelView = 'applications';
    const t55ca = window.I18N ? window.I18N.t : (k) => k;
    document.getElementById('club-panel-title').textContent = t55ca('club_applications_title');
    const body = document.getElementById('club-panel-body');
    body.innerHTML = `<p class="panel-note small">${escapeHtml(t55ca('loading_text'))}</p>`;
    const { data: apps } = await sb.from('club_applications').select('id, user_id, status').eq('club_id', clubId).eq('status', 'pending');
    const userIds = (apps || []).map((a) => a.user_id);
    const profs = new Map();
    if (userIds.length) {
      const { data } = await sb.from('profiles').select('id, handle, username').in('id', userIds);
      (data || []).forEach((p) => profs.set(p.id, p));
    }
    body.innerHTML = `
      <button class="back-link" id="back-to-club-detail">${escapeHtml(t55ca('club_back_to_detail'))}</button>
      ${(apps || []).map((a) => {
        const p = profs.get(a.user_id);
        return `
          <div class="search-result" style="cursor:default;">
            <span class="search-result-title">@${escapeHtml(p ? (p.handle || p.username) : t55ca('club_unknown_member'))}</span>
            <div style="display:flex;gap:8px;margin-top:8px;">
              <button class="post-btn approve-btn" data-app-id="${a.id}" data-user-id="${a.user_id}" style="margin:0;flex:1;">${escapeHtml(t55ca('club_approve_btn'))}</button>
              <button class="post-btn reject-btn" data-app-id="${a.id}" style="margin:0;flex:1;">${escapeHtml(t55ca('club_reject_btn'))}</button>
            </div>
          </div>
        `;
      }).join('') || `<p class="panel-note small">${escapeHtml(t55ca('club_no_pending_applications'))}</p>`}
    `;
    document.getElementById('back-to-club-detail').addEventListener('click', () => renderClubDetail(clubId));
    body.querySelectorAll('.approve-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const appId = Number(btn.dataset.appId);
        const applicantId = btn.dataset.userId;
        await sb.from('club_applications').update({ status: 'approved' }).eq('id', appId);
        await sb.from('club_members').insert({ club_id: clubId, user_id: applicantId, role: 'member' });
        renderClubApplications(clubId);
      });
    });
    body.querySelectorAll('.reject-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await sb.from('club_applications').update({ status: 'rejected' }).eq('id', Number(btn.dataset.appId));
        renderClubApplications(clubId);
      });
    });
  }

  async function renderProfilePanel() {
    const body = document.getElementById('profile-panel-body');
    const t55p = window.I18N ? window.I18N.t : (k) => k;
    body.innerHTML = `<p class="panel-note small">${escapeHtml(t55p('loading_text'))}</p>`;
    if (!user.isGuest) await fetchMyClub();
    const likedGames = [...liked].map((id) => GAME_DEFS.find((g) => g.id === id)).filter(Boolean);
    body.innerHTML = `
      <div class="profile-id-line">${user.handle ? `@${escapeHtml(user.handle)}` : escapeHtml(t55p('profile_handle_unset'))}</div>
      <div class="profile-top-row">
        <span class="avatar-lg" style="background:${user.color};border-radius:50%;"></span>
        <button class="profile-club" id="profile-club-badge">
          <span class="club-badge">🛡️</span>
          <span>${myClub ? escapeHtml(myClub.name) : t55p('profile_no_club')}</span>
        </button>
      </div>
      <div class="profile-stat-row">
        <div class="stat-block"><div class="stat-num">${followerCount}</div><div class="stat-label" data-i18n="profile_followers">フォロワーの数</div></div>
        <div class="stat-block"><div class="stat-num">${followingCount}</div><div class="stat-label" data-i18n="profile_following">フォロー中の数</div></div>
        <div class="stat-block"><div class="stat-icon">🪙</div><div class="stat-num">${user.coins || 0}</div><div class="stat-label" data-i18n="profile_coins">コイン</div></div>
      </div>
      <button class="profile-club" id="open-elements-btn" style="width:100%;justify-content:center;margin-bottom:12px;">
        <span class="club-badge">🔮</span><span data-i18n="profile_view_elements">精霊図鑑を見る(全10体・3D)</span>
      </button>
      ${(!user.isGuest && !user.isMinor && isNativeApp()) ? `<button class="post-btn" id="watch-ad-btn" style="margin-bottom:16px;">${escapeHtml(t55p('profile_watch_ad_btn'))}</button>` : ''}
      ${(!user.isGuest && !user.isMinor && isNativeApp()) ? `
        <div class="coin-shop">
          <p class="panel-note small" style="margin-bottom:8px;">${escapeHtml(t55p('profile_buy_coins_label'))}</p>
          <div class="coin-shop-grid" id="coin-shop-grid">
            ${COIN_PRODUCTS.map((p) => `
              <button class="coin-shop-item" data-product-id="${p.id}" disabled>
                <span class="coin-shop-item-coins">🪙${p.coins}</span>
                <span class="coin-shop-item-price">${escapeHtml(t55p('loading_text'))}</span>
              </button>
            `).join('')}
          </div>
        </div>
      ` : ''}
      <div class="profile-username-row">
        <span class="profile-username-text">${escapeHtml(user.name)}</span>
        <button class="icon-btn" id="edit-username-btn" title="${escapeHtml(t55p('profile_edit_username_tooltip'))}">✏️</button>
      </div>
      <div class="profile-stat-row">
        <div class="stat-block"><div class="stat-icon">🎮</div><div class="stat-num">${myPosts.length}</div><div class="stat-label" data-i18n="profile_posts">投稿の数</div></div>
        <div class="stat-block"><div class="stat-icon">🔁</div><div class="stat-num">${reposted.size}</div><div class="stat-label" data-i18n="profile_reposts">再投稿の数</div></div>
      </div>
      <div style="font-size:12px;opacity:0.5;text-align:center;margin-bottom:20px;">${escapeHtml(maskEmail(user.email))}</div>
      ${user.handle ? '' : `
        <div class="param-row">
          <label>${escapeHtml(t55p('profile_set_handle_label'))}</label>
          <input type="text" id="set-handle-input" class="create-title-input" placeholder="${escapeHtml(t55p('profile_set_handle_placeholder'))}" maxlength="20">
          <p class="error hidden" id="set-handle-error"></p>
          <button class="post-btn" id="set-handle-btn">${escapeHtml(t55p('profile_set_handle_btn'))}</button>
        </div>
      `}
      <p class="panel-note">${escapeHtml(t55p('profile_my_posts_label'))}(${myPosts.length})</p>
      <div class="post-grid">
        ${myPosts.map((p) => {
          const d = GAME_DEFS.find((g) => g.id === p.game_id);
          const emoji = GENRE_EMOJI[d ? d.genre : ''] || '🎮';
          return `<div class="post-tile" data-post-id="${p.id}"><span class="post-tile-emoji">${emoji}</span><span class="post-tile-title">${escapeHtml(p.custom_title || (d ? d.title : p.game_id))}</span></div>`;
        }).join('') || `<p class="panel-note small">${escapeHtml(t55p('none_yet'))}</p>`}
      </div>
      <p class="panel-note">${escapeHtml(t55p('profile_liked_games_label'))}(${likedGames.length})</p>
      <ul class="liked-list">
        ${likedGames.map((g) => `<li><span>${escapeHtml(g.title)}</span><span>#${escapeHtml(g.genre)}</span></li>`).join('') || `<li style="opacity:0.5;">${escapeHtml(t55p('none_yet'))}</li>`}
      </ul>
      <div class="profile-lang-row" id="profile-lang-slot"><label data-i18n="language_label">言語 / Language</label></div>
      <a class="logout-link" id="profile-legal-link" style="color:#4ea8ff;" data-i18n="legal_link">利用規約・プライバシーポリシー</a>
      <a class="logout-link" id="profile-logout" data-i18n="profile_logout">ログアウト</a>
    `;
    if (window.I18N) {
      window.I18N.applyI18n(body);
      document.getElementById('profile-lang-slot').appendChild(window.I18N.buildSelector());
    }
    document.getElementById('profile-legal-link').addEventListener('click', showLegalModal);
    document.getElementById('profile-logout').addEventListener('click', logout);
    const watchAdBtn = document.getElementById('watch-ad-btn');
    if (watchAdBtn) {
      watchAdBtn.addEventListener('click', async () => {
        watchAdBtn.disabled = true;
        watchAdBtn.textContent = t55p('loading_text');
        const rewarded = await watchRewardedAd();
        watchAdBtn.disabled = false;
        watchAdBtn.textContent = t55p('profile_watch_ad_btn');
        if (!rewarded) return;
        const { data, error } = await sb.rpc('apply_coin_delta', { delta: 20, txn_reason: 'rewarded_ad' });
        if (error) return;
        user.coins = data;
        renderProfilePanel();
      });
    }
    const coinShopGrid = document.getElementById('coin-shop-grid');
    if (coinShopGrid) {
      coinShopGrid.querySelectorAll('.coin-shop-item').forEach((btn) => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await purchaseCoinPack(btn.dataset.productId);
            // Coin credit + UI refresh happens in the store.when().approved() handler
            // (initIAP's callback) once the store confirms the purchase, not here —
            // that's the only point that actually knows the purchase went through.
          } catch (e) {
            console.error('purchase failed', e);
            btn.disabled = false;
          }
        });
      });
      // Product pricing loads asynchronously from the store (and, in this dev
      // environment, never — see the IAP section's header comment). Poll briefly so
      // the buttons pick up real prices/enable themselves whenever it does resolve,
      // without needing a global pub/sub just for this one screen.
      let pollCount = 0;
      const pollPricing = setInterval(() => {
        pollCount++;
        let anyPending = false;
        coinShopGrid.querySelectorAll('.coin-shop-item').forEach((btn) => {
          const offer = iapOfferFor(btn.dataset.productId);
          const priceEl = btn.querySelector('.coin-shop-item-price');
          if (offer && offer.pricingPhases && offer.pricingPhases[0]) {
            priceEl.textContent = offer.pricingPhases[0].price;
            btn.disabled = false;
          } else {
            anyPending = true;
            if (pollCount >= 10) priceEl.textContent = t55p('profile_purchase_unavailable');
          }
        });
        if (!anyPending || pollCount >= 10) clearInterval(pollPricing);
      }, 500);
    }
    document.getElementById('profile-club-badge').addEventListener('click', () => openTab('club'));
    document.getElementById('open-elements-btn').addEventListener('click', () => openTab('elements'));
    document.getElementById('edit-username-btn').addEventListener('click', () => {
      const row = document.querySelector('.profile-username-row');
      row.innerHTML = `
        <input type="text" id="edit-username-input" class="create-title-input" maxlength="16" style="flex:1;">
        <button class="icon-btn" id="save-username-btn" title="${escapeHtml(t55p('profile_save_tooltip'))}">✔</button>
      `;
      const input = document.getElementById('edit-username-input');
      input.value = user.name;
      input.focus();
      async function save() {
        const newName = input.value.trim();
        if (!newName) return;
        await sb.from('profiles').update({ username: newName }).eq('id', user.id);
        user.name = newName;
        if (profilesById.has(user.id)) profilesById.get(user.id).username = newName;
        renderProfilePanel();
      }
      document.getElementById('save-username-btn').addEventListener('click', save);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
    });
    if (!user.handle) {
      document.getElementById('set-handle-btn').addEventListener('click', async () => {
        const errorEl = document.getElementById('set-handle-error');
        errorEl.classList.add('hidden');
        const newHandle = document.getElementById('set-handle-input').value.trim().replace(/^@/, '');
        if (!isValidHandle(newHandle)) {
          errorEl.textContent = t55p('profile_set_handle_error_format');
          errorEl.classList.remove('hidden');
          return;
        }
        const { data: existingHandle } = await sb.from('profiles').select('id').ilike('handle', newHandle).maybeSingle();
        if (existingHandle) {
          errorEl.textContent = t55p('profile_set_handle_error_taken');
          errorEl.classList.remove('hidden');
          return;
        }
        const { error } = await sb.from('profiles').update({ handle: newHandle }).eq('id', user.id);
        if (error) {
          errorEl.textContent = error.message;
          errorEl.classList.remove('hidden');
          return;
        }
        user.handle = newHandle;
        profilesById.set(user.id, { ...(profilesById.get(user.id) || {}), handle: newHandle });
        userBar.innerHTML = `<span class="avatar" style="background:${user.color}"></span>@${escapeHtml(user.handle)} <button id="switch-account-btn">${escapeHtml(t55p('switch_account_btn'))}</button>`;
        document.getElementById('switch-account-btn').addEventListener('click', logout);
        renderProfilePanel();
      });
    }
    document.querySelectorAll('#profile-panel-body .post-tile').forEach((tile) => {
      tile.addEventListener('click', () => {
        const post = myPosts.find((p) => String(p.id) === tile.dataset.postId);
        if (post) renderPostEditor(post);
      });
    });
  }

  // Own-post editor, reached by tapping a tile in the profile grid's post-grid
  // (renderProfilePanel). Reuses the same params/choiceParams form as
  // renderCreateForm/renderEditPanel, but updates the existing posts row in place
  // instead of inserting a new one, and offers deletion.
  function renderPostEditor(post) {
    const def = GAME_DEFS.find((g) => g.id === post.game_id);
    const t55pe = window.I18N ? window.I18N.t : (k) => k;
    const body = document.getElementById('profile-panel-body');
    body.innerHTML = '';

    const back = document.createElement('button');
    back.className = 'back-link';
    back.textContent = t55pe('post_editor_back');
    back.addEventListener('click', () => renderProfilePanel());
    body.appendChild(back);

    if (!def) {
      const note = document.createElement('p');
      note.className = 'panel-note';
      note.textContent = t55pe('post_editor_game_not_found');
      body.appendChild(note);
      const delBtn = document.createElement('button');
      delBtn.className = 'post-btn';
      delBtn.style.background = '#c0392b';
      delBtn.textContent = t55pe('post_editor_delete_btn');
      delBtn.addEventListener('click', () => deletePost(post));
      body.appendChild(delBtn);
      return;
    }

    const titleRow = document.createElement('div');
    titleRow.className = 'param-row';
    titleRow.innerHTML = `<label>${escapeHtml(t55pe('create_title_label'))}</label><input type="text" class="create-title-input" maxlength="24">`;
    body.appendChild(titleRow);
    const titleInput = titleRow.querySelector('input');
    titleInput.value = post.custom_title || def.title;

    const baseConfig = post.config || {};
    const sliders = {};
    (def.params || []).forEach((p) => {
      const current = baseConfig[p.key] ?? p.default;
      const row = document.createElement('div');
      row.className = 'param-row';
      row.innerHTML = `<label>${p.label}</label><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${current}"><div class="param-value">${current}</div>`;
      body.appendChild(row);
      const input = row.querySelector('input');
      const valueEl = row.querySelector('.param-value');
      input.addEventListener('input', () => { valueEl.textContent = input.value; });
      sliders[p.key] = input;
    });

    const choiceGetters = {};
    (def.choiceParams || []).forEach((cp) => {
      const current = (baseConfig[cp.key] && baseConfig[cp.key].length === cp.count) ? baseConfig[cp.key] : cp.options.slice(0, cp.count);
      choiceGetters[cp.key] = renderChoiceRow(body, cp, current);
    });

    if (!(def.params && def.params.length) && !(def.choiceParams && def.choiceParams.length)) {
      const note = document.createElement('p');
      note.className = 'panel-note small';
      note.textContent = t55pe('post_editor_no_params');
      body.appendChild(note);
    }

    const saveBtn = document.createElement('button');
    saveBtn.className = 'post-btn';
    saveBtn.textContent = t55pe('post_editor_save_btn');
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = t55pe('post_editor_saving_btn');
      const newConfig = { ...baseConfig };
      (def.params || []).forEach((p) => { newConfig[p.key] = Number(sliders[p.key].value); });
      (def.choiceParams || []).forEach((cp) => { newConfig[cp.key] = choiceGetters[cp.key](); });
      const customTitle = titleInput.value.trim() || def.title;
      const { error } = await sb.from('posts')
        .update({ custom_title: customTitle, config: newConfig })
        .eq('id', post.id).eq('creator_id', user.id);
      if (error) {
        console.error('failed to update post', error);
        saveBtn.disabled = false;
        saveBtn.textContent = t55pe('post_editor_save_btn');
        alert(t55pe('post_editor_save_failed'));
        return;
      }
      post.custom_title = customTitle;
      post.config = newConfig;
      const card = feed.querySelector(`.card[data-post-id="${post.id}"]`);
      if (card) {
        card.querySelector('.title').textContent = customTitle;
        const meta = cardMeta.get(card);
        if (meta) { meta.config = newConfig; meta.customTitle = customTitle; }
      }
      renderProfilePanel();
    });
    body.appendChild(saveBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'post-btn';
    delBtn.style.cssText = 'background:#c0392b;margin-top:8px;';
    delBtn.textContent = t55pe('post_editor_delete_btn');
    delBtn.addEventListener('click', () => deletePost(post));
    body.appendChild(delBtn);
  }

  async function deletePost(post) {
    const t55dp = window.I18N ? window.I18N.t : (k) => k;
    if (!confirm(t55dp('post_editor_delete_confirm'))) return;
    const { error } = await sb.from('posts').delete().eq('id', post.id).eq('creator_id', user.id);
    if (error) {
      console.error('failed to delete post', error);
      alert(t55dp('post_editor_delete_failed'));
      return;
    }
    myPosts = myPosts.filter((p) => p.id !== post.id);
    const card = feed.querySelector(`.card[data-post-id="${post.id}"]`);
    if (card) {
      if (activeCard === card) {
        if (activeCleanup) { activeCleanup(); activeCleanup = null; }
        activeCard = null;
      }
      io.unobserve(card);
      cardMeta.delete(card);
      card.remove();
    }
    renderProfilePanel();
  }

  // Search covers the official templates, every post from every user pulled at feed load,
  // and every registered profile (so brand-new accounts that haven't posted yet are still findable).
  // Users are matched/searched by their unique @handle, never by the (non-unique) display name.
  function buildSearchIndex() {
    const t55i = window.I18N ? window.I18N.t : (k) => k;
    const items = GAME_DEFS.map((def) => ({
      type: 'game', def, config: {}, customTitle: null, creator: t55i('official_creator'), title: def.title, genre: def.genre,
    }));
    allPosts.forEach((post) => {
      const def = GAME_DEFS.find((g) => g.id === post.game_id);
      if (!def) return;
      if (isHidden(post.creator_id)) return;
      const profile = profilesById.get(post.creator_id);
      const creatorName = profile ? (profile.handle || profile.username) : t55i('dm_unknown_user');
      items.push({
        type: 'game', def, config: post.config || {}, customTitle: post.custom_title, creator: creatorName, creatorId: post.creator_id,
        title: post.custom_title || def.title, genre: def.genre,
      });
    });
    profilesById.forEach((p) => {
      if (p.id === user.id) return; // no point searching/DMing/following yourself
      if (!p.handle) return; // pre-migration accounts without a handle aren't searchable yet
      if (isHidden(p.id)) return;
      items.push({ type: 'user', id: p.id, handle: p.handle, username: p.username, color: p.color });
    });
    return items;
  }

  // Relevance: exact match first, then prefix match, then plain substring — closest match shown first.
  function relevanceScore(q, text) {
    const t = (text || '').toLowerCase();
    if (t === q) return 0;
    if (t.startsWith(q)) return 1;
    return 2;
  }

  function jumpToGame(item) {
    const t55j = window.I18N ? window.I18N.t : (k) => k;
    const creatorName = item.creator === t55j('official_creator') ? null : item.creator;
    const card = createCard(item.def, item.config, creatorName, item.customTitle, item.creatorId || null);
    feed.insertBefore(card, document.getElementById('loader'));
    openTab('home');
    card.scrollIntoView({ block: 'start' });
  }

  function jumpToUser(item) {
    if (user.isGuest) { location.reload(); return; }
    navBtns.forEach((b) => b.classList.toggle('active', b.dataset.tab === 'dm'));
    Object.entries(panels).forEach(([name, el]) => el.classList.toggle('hidden', name !== 'dm'));
    openChat({ id: item.id, handle: item.handle, color: item.color });
  }

  function renderSearchPanel() {
    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');
    input.value = '';
    const t55s = window.I18N ? window.I18N.t : (k) => k;
    results.innerHTML = `<p class="panel-note small">${escapeHtml(t55s('search_prompt'))}</p>`;
    input.oninput = () => {
      const q = input.value.trim().toLowerCase().replace(/^@/, '');
      if (!q) { results.innerHTML = `<p class="panel-note small">${escapeHtml(t55s('search_prompt'))}</p>`; return; }
      const matches = buildSearchIndex()
        .filter((item) => item.type === 'user'
          ? item.handle.toLowerCase().includes(q)
          : (item.title.toLowerCase().includes(q) || item.genre.toLowerCase().includes(q) || item.creator.toLowerCase().includes(q))
        )
        .map((item) => ({ item, score: relevanceScore(q, item.type === 'user' ? item.handle : item.title) }))
        .sort((a, b) => a.score - b.score)
        .map((x) => x.item);
      results.innerHTML = '';
      if (!matches.length) {
        results.innerHTML = `<p class="panel-note small">${escapeHtml(t55s('search_no_results'))}</p>`;
        return;
      }
      matches.forEach((item) => {
        const row = document.createElement('button');
        row.className = 'search-result';
        if (item.type === 'user') {
          row.innerHTML = `<span class="search-result-title">👤 @${escapeHtml(item.handle)}</span><span class="search-result-meta">${escapeHtml(item.username)} ・ ${escapeHtml(t55s('search_tap_to_message'))}</span>`;
          row.addEventListener('click', () => jumpToUser(item));
          results.appendChild(row);
          return;
        }
        row.innerHTML = `<span class="search-result-title">${escapeHtml(item.title)}</span><span class="search-result-meta">#${escapeHtml(item.genre)} ・ @${escapeHtml(item.creator)}</span>`;
        row.addEventListener('click', () => jumpToGame(item));
        results.appendChild(row);
      });
    };
    input.focus();
  }

  // ---------- DM (Supabase-backed, realtime) ----------
  let chatChannel = null;
  let dmPanelView = 'list';
  function closeChatChannel() {
    if (chatChannel) { sb.removeChannel(chatChannel); chatChannel = null; }
  }

  function renderDmPanel() {
    dmPanelView = 'list';
    const t55d = window.I18N ? window.I18N.t : (k) => k;
    document.getElementById('dm-panel-title').textContent = t55d('dm_panel_title');
    const body = document.getElementById('dm-panel-body');
    body.innerHTML = '';

    const startRow = document.createElement('div');
    startRow.className = 'param-row';
    startRow.innerHTML = `<label>${escapeHtml(t55d('dm_new_chat_label'))}</label><input type="text" id="dm-new-username" class="create-title-input" placeholder="${escapeHtml(t55d('dm_userid_placeholder'))}"><p class="error hidden" id="dm-start-error"></p>`;
    body.appendChild(startRow);
    const startBtn = document.createElement('button');
    startBtn.className = 'post-btn';
    startBtn.textContent = t55d('dm_start_chat_btn');
    startBtn.addEventListener('click', async () => {
      const errorEl = document.getElementById('dm-start-error');
      errorEl.classList.add('hidden');
      const inputHandle = document.getElementById('dm-new-username').value.trim().replace(/^@/, '');
      if (!inputHandle) return;
      const { data: prof } = await sb.from('profiles').select('id, username, color, handle').ilike('handle', inputHandle).limit(1).maybeSingle();
      if (!prof || prof.id === user.id) {
        errorEl.textContent = !prof ? t55d('dm_user_not_found') : t55d('dm_cannot_message_self');
        errorEl.classList.remove('hidden');
        return;
      }
      openChat({ id: prof.id, handle: prof.handle, color: prof.color });
    });
    body.appendChild(startBtn);

    const listWrap = document.createElement('div');
    listWrap.style.marginTop = '20px';
    if (latestMessageByPartner.size === 0) {
      const p = document.createElement('p');
      p.className = 'panel-note small';
      p.textContent = t55d('dm_no_conversations');
      listWrap.appendChild(p);
    }
    latestMessageByPartner.forEach((lastMsg, otherId) => {
      if (isHidden(otherId)) return;
      const profile = profilesById.get(otherId);
      const handle = profile ? (profile.handle || profile.username) : t55d('dm_unknown_user');
      const isUnread = lastMsg.sender_id !== user.id && (!dmReadMap.get(otherId) || new Date(lastMsg.created_at) > new Date(dmReadMap.get(otherId)));
      const previewText = typeof lastMsg.body === 'string' && lastMsg.body.startsWith(window.DuelSystem.INVITE_PREFIX)
        ? t55d('dm_duel_invite_preview').replace('{title}', lastMsg.body.split('|')[2] || t55d('dm_duel_fallback_title'))
        : lastMsg.body.slice(0, 30);
      const item = document.createElement('button');
      item.className = 'search-result';
      item.innerHTML = `<span class="search-result-title">${isUnread ? '🔵 ' : ''}@${escapeHtml(handle)}</span><span class="search-result-meta">${escapeHtml(previewText)}</span>`;
      item.addEventListener('click', () => openChat({ id: otherId, handle, color: profile ? profile.color : '#888888' }));
      listWrap.appendChild(item);
    });
    body.appendChild(listWrap);
  }

  function openChat(otherUser) {
    dmPanelView = 'chat';
    const t55o = window.I18N ? window.I18N.t : (k) => k;
    document.getElementById('dm-panel-title').textContent = `@${otherUser.handle}`;
    const body = document.getElementById('dm-panel-body');
    const isFollowing = followingSet.has(otherUser.id);
    const isFriend = followingSet.has(otherUser.id) && followerSet.has(otherUser.id);
    const iBlocked = blockedByMe.has(otherUser.id);
    const cantMessage = isHidden(otherUser.id);
    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <button class="back-link" id="dm-back-to-list" style="margin:0;">${escapeHtml(t55o('dm_back_to_list'))}</button>
        <div style="display:flex;gap:8px;">
          ${(isFriend && !cantMessage) ? `<button class="follow-btn" id="chat-call-btn">${escapeHtml(t55o('dm_call_btn'))}</button>` : ''}
          <button class="follow-btn ${isFollowing ? 'following' : ''}" id="chat-follow-btn">${escapeHtml(isFollowing ? t55o('follow_btn_following') : t55o('follow_btn_follow'))}</button>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:14px;margin-bottom:12px;">
        <button class="report-link" id="chat-report-btn">${escapeHtml(t55o('dm_report_btn'))}</button>
        <button class="report-link" id="chat-block-btn">${escapeHtml(iBlocked ? t55o('dm_unblock_btn') : t55o('dm_block_btn'))}</button>
      </div>
      <div id="chat-report-form" class="hidden"></div>
      <div id="chat-messages" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;max-height:55vh;overflow-y:auto;"></div>
      <p class="panel-note small hidden" id="chat-filter-notice" style="margin:0 0 8px;">${escapeHtml(t55o('dm_filter_notice'))}</p>
      ${cantMessage
        ? `<p class="chat-blocked-notice">${escapeHtml(t55o('dm_cannot_message_notice'))}</p>`
        : `<div style="display:flex;gap:8px;">
        <input type="text" id="chat-input" class="create-title-input" placeholder="${escapeHtml(t55o('dm_message_placeholder'))}" style="flex:1;">
        <button class="post-btn" id="chat-send-btn" style="width:auto;margin-top:0;padding:0 18px;">${escapeHtml(t55o('dm_send_btn'))}</button>
      </div>`}
    `;
    document.getElementById('dm-back-to-list').addEventListener('click', () => {
      closeChatChannel();
      renderDmPanel();
    });
    document.getElementById('chat-follow-btn').addEventListener('click', () => toggleFollow(otherUser.id, document.getElementById('chat-follow-btn')));
    const callBtn = document.getElementById('chat-call-btn');
    if (callBtn) callBtn.addEventListener('click', () => window.CallSystem.startCall(sb, user, otherUser));

    document.getElementById('chat-block-btn').addEventListener('click', async () => {
      const wasBlocked = blockedByMe.has(otherUser.id);
      if (!wasBlocked && !confirm(t55o('dm_confirm_block').replace('{handle}', otherUser.handle))) return;
      await toggleBlock(otherUser.id);
      openChat(otherUser);
    });

    document.getElementById('chat-report-btn').addEventListener('click', () => {
      const formEl = document.getElementById('chat-report-form');
      if (!formEl.classList.contains('hidden')) { formEl.classList.add('hidden'); formEl.innerHTML = ''; return; }
      formEl.classList.remove('hidden');
      let selectedReason = 'other';
      formEl.innerHTML = `
        <p class="panel-note small" style="margin:10px 0;">${escapeHtml(t55o('dm_report_reason_prompt'))}</p>
        <div class="reason-grid">
          ${REPORT_REASONS.map((r) => `<button type="button" class="reason-item" data-reason="${r.key}">${escapeHtml(t55o(r.labelKey))}</button>`).join('')}
        </div>
        <textarea id="report-detail" class="create-title-input" placeholder="${escapeHtml(t55o('dm_report_detail_placeholder'))}" style="margin-top:10px;min-height:60px;resize:vertical;"></textarea>
        <button class="post-btn report-submit-btn" id="report-submit-btn">${escapeHtml(t55o('dm_report_submit_btn'))}</button>
        <p class="panel-note small hidden" id="report-done-msg" style="margin-top:8px;">${escapeHtml(t55o('dm_report_done_msg'))}</p>
      `;
      formEl.querySelectorAll('.reason-item').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedReason = btn.dataset.reason;
          formEl.querySelectorAll('.reason-item').forEach((b) => b.classList.toggle('selected', b === btn));
        });
      });
      document.getElementById('report-submit-btn').addEventListener('click', async () => {
        const detail = document.getElementById('report-detail').value.trim();
        await submitReport(otherUser.id, selectedReason, detail);
        document.getElementById('report-done-msg').classList.remove('hidden');
      });
    });

    async function loadMessages() {
      const { data } = await sb.from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${otherUser.id}),and(sender_id.eq.${otherUser.id},recipient_id.eq.${user.id})`)
        .order('created_at', { ascending: true });
      const container = document.getElementById('chat-messages');
      if (!container) return;
      container.innerHTML = (data || []).map((m) => {
        const mine = m.sender_id === user.id;
        const bubbleStyle = `align-self:${mine ? 'flex-end' : 'flex-start'};max-width:75%;padding:8px 12px;border-radius:12px;font-size:14px;background:${mine ? 'rgba(254,44,85,0.35)' : 'rgba(255,255,255,0.12)'};`;
        if (typeof m.body === 'string' && m.body.startsWith(window.DuelSystem.INVITE_PREFIX)) {
          const [, gameId, gameTitle] = m.body.split('|');
          return mine
            ? `<div style="${bubbleStyle}">${escapeHtml(t55o('dm_duel_invite_sent').replace('{title}', gameTitle))}</div>`
            : `<div style="${bubbleStyle}" class="duel-invite-card" data-game-id="${escapeHtml(gameId)}">${escapeHtml(t55o('dm_duel_invite_received').replace('{title}', gameTitle))}<br><button class="duel-invite-accept" style="margin-top:6px;padding:6px 12px;border-radius:10px;">${escapeHtml(t55o('join_btn_label'))}</button></div>`;
        }
        if (typeof m.body === 'string' && m.body.startsWith(window.CallSystem.INVITE_PREFIX)) {
          return mine
            ? `<div style="${bubbleStyle}">${escapeHtml(t55o('dm_call_invite_sent'))}</div>`
            : `<div style="${bubbleStyle}" class="call-invite-card">${escapeHtml(t55o('dm_call_invite_received_notice'))}<br><button class="call-invite-accept" style="margin-top:6px;padding:6px 12px;border-radius:10px;">${escapeHtml(t55o('join_btn_label'))}</button></div>`;
        }
        return `<div style="${bubbleStyle}">${escapeHtml(m.body)}</div>`;
      }).join('');
      container.querySelectorAll('.duel-invite-accept').forEach((btn) => {
        btn.addEventListener('click', () => {
          const gameId = btn.closest('.duel-invite-card').dataset.gameId;
          window.DuelSystem.acceptDuelInvite(sb, gameId, user, otherUser.id, otherUser.username || otherUser.handle);
        });
      });
      container.querySelectorAll('.call-invite-accept').forEach((btn) => {
        btn.addEventListener('click', () => {
          window.CallSystem.acceptCall(sb, user, otherUser.id, `@${otherUser.handle || otherUser.username}`);
        });
      });
      container.scrollTop = container.scrollHeight;
      if (data && data.length) latestMessageByPartner.set(otherUser.id, data[data.length - 1]);
      markRead(otherUser.id);
    }
    loadMessages();

    closeChatChannel();
    chatChannel = sb.channel(`chat-${[user.id, otherUser.id].sort().join('-')}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new;
        const isThisChat = (m.sender_id === user.id && m.recipient_id === otherUser.id) || (m.sender_id === otherUser.id && m.recipient_id === user.id);
        if (isThisChat) loadMessages();
      })
      .subscribe();

    async function sendMessage() {
      const input = document.getElementById('chat-input');
      const raw = input.value.trim();
      if (!raw) return;
      input.value = '';
      const { text, flagged } = filterDangerousWords(raw);
      const noticeEl = document.getElementById('chat-filter-notice');
      if (noticeEl) noticeEl.classList.toggle('hidden', !flagged);
      await sb.from('messages').insert({ sender_id: user.id, recipient_id: otherUser.id, body: text });
      loadMessages();
    }
    const sendBtn = document.getElementById('chat-send-btn');
    if (sendBtn) {
      sendBtn.addEventListener('click', sendMessage);
      document.getElementById('chat-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });
    }
  }
}

initAccount((user) => { initFeed(user); });
