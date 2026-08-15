// 多言語対応(task55, 2026-08-14 Toshiba実装)。
// 対応: 日本語(既定/フォールバック)・英語・中国語(簡体)・韓国語・ベトナム語・
//       スペイン語・フランス語・ドイツ語 の8言語。
// 使い方:
//   - 静的HTML: <span data-i18n="key">日本語の文言</span> / <input data-i18n-placeholder="key">
//   - 動的JS: I18N.t('key') で現在の言語の文字列を取得(無ければja→key自体にフォールバック)
//   - 言語切替: I18N.setLang('en') を呼ぶと localStorage保存 + 画面へ即時反映
// 翻訳はネイティブチェックなしのAI翻訳(MVP、task55のnotes記載の通り許容範囲)。
(function () {
  const STORAGE_KEY = 'anyway_lang';

  const LANGS = [
    { code: 'ja', label: '日本語', flag: '🇯🇵' },
    { code: 'en', label: 'English', flag: '🇺🇸' },
    { code: 'zh', label: '简体中文', flag: '🇨🇳' },
    { code: 'ko', label: '한국어', flag: '🇰🇷' },
    { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
    { code: 'es', label: 'Español', flag: '🇪🇸' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  ];

  // Phase1: account-modal(登録/ログイン)・ヘッダー・ボトムナビ・共通パネルタイトル・
  // 言語セレクターUI自身、を対象とする(games.js内の各ミニゲーム文言等はPhase2で別対応)。
  const STRINGS = {
    ja: {
      app_tagline: '動画の代わりに、ゲームが流れてくる。',
      guest_btn: 'アカウントを作らずに続ける',
      username_placeholder: 'ユーザー名(表示名、他人と重複OK)',
      userid_placeholder: 'ユーザーID(@なし、他人と重複不可)',
      email_placeholder: 'メールアドレス',
      password_placeholder: 'パスワード(6文字以上・大小英字+数字)',
      birthdate_label: '生年月日',
      minor_hint: '13歳未満の方は投稿・いいね・DM・クラブ参加ができません(閲覧・プレイのみ)',
      signup_btn: 'アカウント作成',
      already_have_account: 'すでにアカウントをお持ちの方は',
      login_link: 'ログイン',
      login_password_placeholder: 'パスワード',
      login_btn: 'ログイン',
      forgot_password_link: 'パスワードをお忘れですか？',
      no_account: 'アカウントをお持ちでない方は',
      signup_link: '新規登録',
      reset_email_btn: '再設定メールを送る',
      back_to_login: 'ログインに戻る',
      reset_password_intro: '新しいパスワードを設定してください',
      new_password_placeholder: '新しいパスワード(6文字以上・大小英字+数字)',
      reset_password_btn: 'パスワードを更新',
      legal_link: '利用規約・プライバシーポリシー',
      legal_close: '← 閉じる',
      edit_panel_title: '今の投稿を編集',
      create_panel_title: '新規投稿を作る',
      dm_panel_title: 'メッセージ',
      profile_panel_title: 'プロフィール',
      search_panel_title: '検索',
      search_placeholder: 'ゲーム名 または @ユーザーIDで検索',
      club_panel_title: 'クラブ',
      elements_panel_title: '精霊図鑑',
      login_cta: 'ログイン',
      switch_account_btn: '切替',
      language_label: '言語 / Language',
    },
    en: {
      app_tagline: 'Games instead of videos, streaming your way.',
      guest_btn: 'Continue without an account',
      username_placeholder: 'Display name (can be shared with others)',
      userid_placeholder: 'User ID (no @, must be unique)',
      email_placeholder: 'Email address',
      password_placeholder: 'Password (6+ chars, upper/lowercase + number)',
      birthdate_label: 'Date of birth',
      minor_hint: 'Under 13s cannot post, like, DM, or join clubs (view/play only)',
      signup_btn: 'Create account',
      already_have_account: 'Already have an account?',
      login_link: 'Log in',
      login_password_placeholder: 'Password',
      login_btn: 'Log in',
      forgot_password_link: 'Forgot your password?',
      no_account: "Don't have an account?",
      signup_link: 'Sign up',
      reset_email_btn: 'Send reset email',
      back_to_login: 'Back to login',
      reset_password_intro: 'Please set a new password',
      new_password_placeholder: 'New password (6+ chars, upper/lowercase + number)',
      reset_password_btn: 'Update password',
      legal_link: 'Terms of Service / Privacy Policy',
      legal_close: '← Close',
      edit_panel_title: 'Edit your post',
      create_panel_title: 'Create a new post',
      dm_panel_title: 'Messages',
      profile_panel_title: 'Profile',
      search_panel_title: 'Search',
      search_placeholder: 'Search by game name or @userID',
      club_panel_title: 'Club',
      elements_panel_title: 'Spirit Dex',
      login_cta: 'Log in',
      switch_account_btn: 'Switch',
      language_label: 'Language',
    },
    zh: {
      app_tagline: '不刷视频，刷游戏。',
      guest_btn: '以访客身份继续',
      username_placeholder: '用户名(显示名，可与他人重复)',
      userid_placeholder: '用户ID(不含@，不能重复)',
      email_placeholder: '电子邮箱',
      password_placeholder: '密码(6位以上，含大小写字母和数字)',
      birthdate_label: '出生日期',
      minor_hint: '未满13岁的用户无法发帖、点赞、私信或加入俱乐部(仅可浏览/游玩)',
      signup_btn: '创建账号',
      already_have_account: '已有账号？',
      login_link: '登录',
      login_password_placeholder: '密码',
      login_btn: '登录',
      forgot_password_link: '忘记密码？',
      no_account: '还没有账号？',
      signup_link: '注册',
      reset_email_btn: '发送重置邮件',
      back_to_login: '返回登录',
      reset_password_intro: '请设置新密码',
      new_password_placeholder: '新密码(6位以上，含大小写字母和数字)',
      reset_password_btn: '更新密码',
      legal_link: '服务条款・隐私政策',
      legal_close: '← 关闭',
      edit_panel_title: '编辑当前帖子',
      create_panel_title: '创建新帖子',
      dm_panel_title: '消息',
      profile_panel_title: '个人资料',
      search_panel_title: '搜索',
      search_placeholder: '按游戏名称或 @用户ID 搜索',
      club_panel_title: '俱乐部',
      elements_panel_title: '精灵图鉴',
      login_cta: '登录',
      switch_account_btn: '切换',
      language_label: '语言',
    },
    ko: {
      app_tagline: '동영상 대신 게임이 흘러나와요.',
      guest_btn: '계정 없이 계속하기',
      username_placeholder: '사용자 이름(표시 이름, 중복 가능)',
      userid_placeholder: '사용자 ID(@ 제외, 중복 불가)',
      email_placeholder: '이메일 주소',
      password_placeholder: '비밀번호(6자 이상, 대소문자+숫자 포함)',
      birthdate_label: '생년월일',
      minor_hint: '13세 미만은 게시・좋아요・DM・클럽 가입이 불가합니다(보기・플레이만 가능)',
      signup_btn: '계정 만들기',
      already_have_account: '이미 계정이 있으신가요?',
      login_link: '로그인',
      login_password_placeholder: '비밀번호',
      login_btn: '로그인',
      forgot_password_link: '비밀번호를 잊으셨나요?',
      no_account: '계정이 없으신가요?',
      signup_link: '회원가입',
      reset_email_btn: '재설정 이메일 보내기',
      back_to_login: '로그인으로 돌아가기',
      reset_password_intro: '새 비밀번호를 설정해주세요',
      new_password_placeholder: '새 비밀번호(6자 이상, 대소문자+숫자 포함)',
      reset_password_btn: '비밀번호 변경',
      legal_link: '이용약관・개인정보처리방침',
      legal_close: '← 닫기',
      edit_panel_title: '게시물 수정',
      create_panel_title: '새 게시물 만들기',
      dm_panel_title: '메시지',
      profile_panel_title: '프로필',
      search_panel_title: '검색',
      search_placeholder: '게임 이름 또는 @사용자ID로 검색',
      club_panel_title: '클럽',
      elements_panel_title: '정령 도감',
      login_cta: '로그인',
      switch_account_btn: '전환',
      language_label: '언어',
    },
    vi: {
      app_tagline: 'Thay vì video, hãy để game cuốn bạn đi.',
      guest_btn: 'Tiếp tục không cần tài khoản',
      username_placeholder: 'Tên hiển thị (có thể trùng với người khác)',
      userid_placeholder: 'ID người dùng (không có @, không được trùng)',
      email_placeholder: 'Địa chỉ email',
      password_placeholder: 'Mật khẩu (từ 6 ký tự, gồm chữ hoa/thường + số)',
      birthdate_label: 'Ngày sinh',
      minor_hint: 'Người dưới 13 tuổi không thể đăng bài, thích, nhắn tin hoặc tham gia câu lạc bộ (chỉ xem/chơi)',
      signup_btn: 'Tạo tài khoản',
      already_have_account: 'Đã có tài khoản?',
      login_link: 'Đăng nhập',
      login_password_placeholder: 'Mật khẩu',
      login_btn: 'Đăng nhập',
      forgot_password_link: 'Quên mật khẩu?',
      no_account: 'Chưa có tài khoản?',
      signup_link: 'Đăng ký',
      reset_email_btn: 'Gửi email đặt lại mật khẩu',
      back_to_login: 'Quay lại đăng nhập',
      reset_password_intro: 'Vui lòng đặt mật khẩu mới',
      new_password_placeholder: 'Mật khẩu mới (từ 6 ký tự, gồm chữ hoa/thường + số)',
      reset_password_btn: 'Cập nhật mật khẩu',
      legal_link: 'Điều khoản dịch vụ / Chính sách bảo mật',
      legal_close: '← Đóng',
      edit_panel_title: 'Chỉnh sửa bài đăng',
      create_panel_title: 'Tạo bài đăng mới',
      dm_panel_title: 'Tin nhắn',
      profile_panel_title: 'Hồ sơ',
      search_panel_title: 'Tìm kiếm',
      search_placeholder: 'Tìm theo tên game hoặc @userID',
      club_panel_title: 'Câu lạc bộ',
      elements_panel_title: 'Bách khoa Tinh linh',
      login_cta: 'Đăng nhập',
      switch_account_btn: 'Chuyển',
      language_label: 'Ngôn ngữ',
    },
    es: {
      app_tagline: 'En vez de vídeos, juegos que no paran de llegar.',
      guest_btn: 'Continuar sin cuenta',
      username_placeholder: 'Nombre visible (puede repetirse con otros)',
      userid_placeholder: 'ID de usuario (sin @, debe ser único)',
      email_placeholder: 'Correo electrónico',
      password_placeholder: 'Contraseña (6+ caracteres, mayúsc./minúsc. + número)',
      birthdate_label: 'Fecha de nacimiento',
      minor_hint: 'Los menores de 13 años no pueden publicar, dar me gusta, enviar DM ni unirse a clubes (solo ver/jugar)',
      signup_btn: 'Crear cuenta',
      already_have_account: '¿Ya tienes una cuenta?',
      login_link: 'Iniciar sesión',
      login_password_placeholder: 'Contraseña',
      login_btn: 'Iniciar sesión',
      forgot_password_link: '¿Olvidaste tu contraseña?',
      no_account: '¿No tienes cuenta?',
      signup_link: 'Registrarse',
      reset_email_btn: 'Enviar correo de restablecimiento',
      back_to_login: 'Volver a iniciar sesión',
      reset_password_intro: 'Establece una nueva contraseña',
      new_password_placeholder: 'Nueva contraseña (6+ caracteres, mayúsc./minúsc. + número)',
      reset_password_btn: 'Actualizar contraseña',
      legal_link: 'Términos del servicio / Política de privacidad',
      legal_close: '← Cerrar',
      edit_panel_title: 'Editar tu publicación',
      create_panel_title: 'Crear una publicación',
      dm_panel_title: 'Mensajes',
      profile_panel_title: 'Perfil',
      search_panel_title: 'Buscar',
      search_placeholder: 'Buscar por nombre de juego o @userID',
      club_panel_title: 'Club',
      elements_panel_title: 'Elementopedia',
      login_cta: 'Iniciar sesión',
      switch_account_btn: 'Cambiar',
      language_label: 'Idioma',
    },
    fr: {
      app_tagline: 'Au lieu de vidéos, place aux jeux qui défilent.',
      guest_btn: 'Continuer sans compte',
      username_placeholder: "Nom affiché (peut être identique à un autre)",
      userid_placeholder: "ID utilisateur (sans @, doit être unique)",
      email_placeholder: 'Adresse e-mail',
      password_placeholder: 'Mot de passe (6+ caractères, majuscule/minuscule + chiffre)',
      birthdate_label: 'Date de naissance',
      minor_hint: "Les moins de 13 ans ne peuvent pas publier, aimer, envoyer de DM ni rejoindre de club (visionnage/jeu uniquement)",
      signup_btn: 'Créer un compte',
      already_have_account: 'Vous avez déjà un compte ?',
      login_link: 'Connexion',
      login_password_placeholder: 'Mot de passe',
      login_btn: 'Connexion',
      forgot_password_link: 'Mot de passe oublié ?',
      no_account: "Vous n'avez pas de compte ?",
      signup_link: "S'inscrire",
      reset_email_btn: 'Envoyer un e-mail de réinitialisation',
      back_to_login: 'Retour à la connexion',
      reset_password_intro: 'Veuillez définir un nouveau mot de passe',
      new_password_placeholder: 'Nouveau mot de passe (6+ caractères, majuscule/minuscule + chiffre)',
      reset_password_btn: 'Mettre à jour le mot de passe',
      legal_link: "Conditions d'utilisation / Confidentialité",
      legal_close: '← Fermer',
      edit_panel_title: 'Modifier votre publication',
      create_panel_title: 'Créer une publication',
      dm_panel_title: 'Messages',
      profile_panel_title: 'Profil',
      search_panel_title: 'Rechercher',
      search_placeholder: 'Rechercher par nom de jeu ou @userID',
      club_panel_title: 'Club',
      elements_panel_title: 'Élémentopédie',
      login_cta: 'Connexion',
      switch_account_btn: 'Changer',
      language_label: 'Langue',
    },
    de: {
      app_tagline: 'Statt Videos gibt es hier Spiele im Feed.',
      guest_btn: 'Ohne Konto fortfahren',
      username_placeholder: 'Anzeigename (darf mit anderen übereinstimmen)',
      userid_placeholder: 'Benutzer-ID (ohne @, muss eindeutig sein)',
      email_placeholder: 'E-Mail-Adresse',
      password_placeholder: 'Passwort (mind. 6 Zeichen, Groß-/Kleinbuchstaben + Zahl)',
      birthdate_label: 'Geburtsdatum',
      minor_hint: 'Unter 13-Jährige können nicht posten, liken, DMs senden oder Clubs beitreten (nur ansehen/spielen)',
      signup_btn: 'Konto erstellen',
      already_have_account: 'Bereits ein Konto?',
      login_link: 'Anmelden',
      login_password_placeholder: 'Passwort',
      login_btn: 'Anmelden',
      forgot_password_link: 'Passwort vergessen?',
      no_account: 'Noch kein Konto?',
      signup_link: 'Registrieren',
      reset_email_btn: 'Reset-E-Mail senden',
      back_to_login: 'Zurück zur Anmeldung',
      reset_password_intro: 'Bitte neues Passwort festlegen',
      new_password_placeholder: 'Neues Passwort (mind. 6 Zeichen, Groß-/Kleinbuchstaben + Zahl)',
      reset_password_btn: 'Passwort aktualisieren',
      legal_link: 'Nutzungsbedingungen / Datenschutz',
      legal_close: '← Schließen',
      edit_panel_title: 'Beitrag bearbeiten',
      create_panel_title: 'Neuen Beitrag erstellen',
      dm_panel_title: 'Nachrichten',
      profile_panel_title: 'Profil',
      search_panel_title: 'Suche',
      search_placeholder: 'Nach Spielname oder @userID suchen',
      club_panel_title: 'Club',
      elements_panel_title: 'Geisterlexikon',
      login_cta: 'Anmelden',
      switch_account_btn: 'Wechseln',
      language_label: 'Sprache',
    },
  };

  function detectDefaultLang() {
    try {
      const nav = (navigator.language || 'ja').toLowerCase();
      const code = nav.split('-')[0];
      if (STRINGS[code]) return code;
    } catch (e) { /* ignore */ }
    return 'ja';
  }

  function getCurrentLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && STRINGS[saved]) return saved;
    } catch (e) { /* localStorage unavailable (rare) -- fall through */ }
    return detectDefaultLang();
  }

  function t(key) {
    const lang = getCurrentLang();
    const dict = STRINGS[lang] || STRINGS.ja;
    return dict[key] || STRINGS.ja[key] || key;
  }

  function applyI18n(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    if (scope === document || scope.contains === document.documentElement) {
      document.documentElement.lang = getCurrentLang();
    }
  }

  const listeners = [];
  function onLangChange(cb) { listeners.push(cb); }

  // syncFn(lang): optional caller-supplied hook (e.g. app.js passes one that writes to
  // Supabase profiles.preferred_language for logged-in users). Wrapped in try/catch by the
  // caller's own responsibility -- I18N itself never assumes a server column exists.
  let syncFn = null;
  function setServerSync(fn) { syncFn = fn; }

  function setLang(code) {
    if (!STRINGS[code]) return;
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* ignore */ }
    applyI18n(document);
    listeners.forEach((cb) => { try { cb(code); } catch (e) { /* listener's own bug, don't break others */ } });
    if (syncFn) { try { syncFn(code); } catch (e) { /* server sync is best-effort only */ } }
  }

  // 言語セレクター(<select>)を1つ生成して返す。呼び出し側がDOMの好きな場所に挿入する。
  function buildSelector(opts) {
    const sel = document.createElement('select');
    sel.className = 'i18n-lang-select' + (opts && opts.className ? ' ' + opts.className : '');
    LANGS.forEach((l) => {
      const opt = document.createElement('option');
      opt.value = l.code;
      opt.textContent = l.flag + ' ' + l.label;
      sel.appendChild(opt);
    });
    sel.value = getCurrentLang();
    sel.addEventListener('change', () => setLang(sel.value));
    return sel;
  }

  window.I18N = { LANGS, t, getCurrentLang, setLang, applyI18n, buildSelector, onLangChange, setServerSync };
})();
