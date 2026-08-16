// task55 Phase4 (2026-08-15, Toshiba): 利用規約・プライバシーポリシーの多言語版。
// 原文(日本語)は app.js の TERMS_OF_SERVICE_MD / PRIVACY_POLICY_MD (DELLの原案、task29/30)
// と完全に同じ内容をここにも複製している(ja エントリ)。app.js 側は変更せず、
// showLegalModal() が現在の言語に応じてこちらを優先参照し、無ければ app.js 側の
// 日本語定数にフォールバックする設計(2つのファイルへの分割編集を避けるため、
// app.js のTERMS_OF_SERVICE_MD/PRIVACY_POLICY_MDそのものは残したまま、
// このファイルの'ja'エントリと重複させている)。
// 翻訳はネイティブチェックなしのAI翻訳(task55のnotes記載の通りMVPとして許容)。
// 法律文書のため、運営者名・メールアドレス・日付の数値は各言語版でも変更していない。
window.LEGAL_I18N = {
  ja: {
    terms: `# Anyway 利用規約

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
連絡先: nexora26624@gmail.com`,
    privacy: `# Anyway プライバシーポリシー

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
連絡先: nexora26624@gmail.com`,
  },
  en: {
    terms: `# Anyway Terms of Service

Last updated: August 10, 2026

These Terms of Service ("these Terms") set out the conditions for using "Anyway" (the "Service"). By using the Service, you are deemed to have agreed to these Terms.

## Article 1 (Service Description)

The Service is an app where you can enjoy multiple short mini-games in a vertically scrolling feed format. Users can post (including remixes of games), like, repost, comment, send direct messages (DMs), and use club (group) features. You can also use some features without creating an account, as a "Guest."

## Article 2 (Accounts and Age Restrictions)

1. The Service is available to a wide range of ages, from children 4 and up to adults (for viewing/playing games, etc.).
2. However, **social features such as posting, liking, direct messages (DMs), and joining clubs (groups) are available only to users aged 13 and older.** Users under 13 should use the Service as a Guest, for viewing and playing games only.
3. Using some features of the Service (posting, liking, DMs, joining clubs, etc.) requires account registration with an email address and password.
4. Users are responsible for keeping their registration information accurate.
5. Creating an account to impersonate another person, and improperly using multiple accounts as a single individual, are prohibited.

## Article 3 (Prohibited Conduct)

When using the Service, users must not engage in any of the following conduct:

1. Conduct that violates laws or public order and morals
2. Harassment, defamation, or threats directed at other users
3. Inappropriate contact with minors (including soliciting personal information, requesting to meet in person, requesting photos, or requesting money/gifts)
4. Posting or sending content that encourages self-harm or suicide
5. Impersonation or fraudulent conduct
6. Conduct that interferes with the operation of the Service (unauthorized access, excessive automated access, etc.)
7. Posts that infringe copyright, portrait rights, or other third-party rights

## Article 4 (Content Safety Checks)

To protect users (especially minors), the Service has a mechanism that automatically detects dangerous patterns in direct messages (such as requests for personal information, requests to meet in person, requests for photos, requests for money/gifts, and language related to self-harm). This is a simple keyword-based mechanism and cannot prevent all risks. If you receive a suspicious message, please stop the conversation and consult a trusted adult or someone you trust.

## Article 5 (Posting and Remix Features)

1. Copyright in content posted by users (game settings, titles, etc.), including the underlying mini-game itself, belongs to the Service operator or the rights holder of each mini-game. Users may add their own creative expression to the extent of adjusting parameters, etc., when posting.
2. The "Remix" feature allows you to create a new post based on another user's post, but using it to unfairly disparage the original poster is prohibited.

## Article 6 (Suspension and Deletion of Accounts)

The operator may suspend or delete a user's access to the Service without prior notice if it determines that the user has violated these Terms.

## Article 7 (Disclaimer)

1. The Service is provided "as is," and the operator does not warrant its completeness, accuracy, or fitness for any particular purpose.
2. The operator is not responsible for disputes between users. However, if the operator becomes aware of a serious issue (such as matters relating to Articles 3 or 4), it will respond to the extent possible.

## Article 8 (Changes to These Terms)

The operator may change these Terms as necessary. Significant changes will be announced within the Service.

## Article 9 (Contact)

For inquiries about these Terms, please use the contact feature within the Service (planned) or contact the operator at the address below.

Operator: Hoang Gia Bao
Contact: nexora26624@gmail.com`,
    privacy: `# Anyway Privacy Policy

Last updated: August 10, 2026

"Anyway" (the "Service") respects the privacy of its users and handles personal information based on the following policy.

## 1. Information We Collect

### At Account Registration
- Username (display name)
- User ID (@handle)
- Email address
- Password (stored encrypted; the operator never views it in plain text)

### Information Generated While Using the Service
- Post content (game remix settings, titles, etc.)
- History of likes, reposts, and comments
- Direct message (DM) content
- Club (group) membership status
- Game scores and play history

### Information Collected Automatically
- Personalization information stored in the device's local storage, used for recommendations (this information is stored only on the device and is never sent to the server)

### About Guest Mode
If you use the Service as a "Guest" without creating an account, none of the account-related information above is collected. You can only view the feed and play games (posting, liking, and other write actions require account registration).

## 2. Purpose of Use

1. Providing the Service (feed display, posting, DMs, and other features)
2. Preventing unauthorized use and abuse
3. Safety checks to protect minors (automatic detection of dangerous patterns in direct messages; see Article 4 of the Terms of Service for details)
4. Statistical analysis to improve the Service (conducted in a form that does not identify individuals)

## 3. Third-Party Disclosure and Outsourcing

1. The Service uses Supabase (a third-party cloud service) as its backend infrastructure, and the information described in 1. above is stored on Supabase's servers.
2. Except where required by law, we will not provide collected personal information to third parties without the individual's consent.

## 4. Data Retention Period

We retain related data for as long as the account exists. If you wish to delete your account, please contact us via the in-Service feature (planned) or our contact address.

## 5. Handling of Direct Messages

To protect the safety of users, including minors, we have introduced a mechanism that automatically scans direct message content for dangerous keyword patterns (such as requests for personal information, requests to meet in person, requests for photos, requests for money/gifts, and language suggesting self-harm). This is automated processing by the system; the operator does not manually read DM content under normal circumstances.

## 6. Use by Children

The Service is available to children aged 4 and up, but **social features such as posting, liking, direct messages (DMs), and joining clubs are limited to users aged 13 and older.** Users under 13 may only view and play games. This age restriction reflects the principles of various countries' laws on protecting children's online privacy (such as the U.S. COPPA). We recommend that parents check and monitor their children's use of the Service.

## 7. User Rights

Users may request to review, correct, or delete their registration information. Please contact us via our contact address.

## 8. Changes to This Policy

This Policy may be changed as necessary. Significant changes will be announced within the Service.

## 9. Contact

For inquiries about this Policy, please use the contact feature within the Service (planned) or contact the operator at the address below.

Operator: Hoang Gia Bao
Contact: nexora26624@gmail.com`,
  },
  zh: {
    terms: `# Anyway 使用条款

最后更新: 2026年8月10日

本使用条款(以下简称"本条款")规定了"Anyway"(以下简称"本服务")的使用条件。使用本服务即视为您同意本条款。

## 第1条(服务内容)

本服务是一款可以纵向滑动浏览多款短时小游戏的应用。用户可以发布内容(包括游戏的改编版)、点赞、转发、评论、发送私信(DM)、使用俱乐部(群组)功能。也可以不创建账号，以"访客"身份使用部分功能。

## 第2条(账号与年龄限制)

1. 本服务面向4岁以上儿童至成人的广泛年龄段用户开放(浏览、游玩游戏等)。
2. 但是，**发布、点赞、私信(DM)、加入俱乐部(群组)等社交功能仅限13岁以上用户使用。** 未满13岁的用户请仅以访客身份浏览、游玩游戏。
3. 使用本服务的部分功能(发布、点赞、DM、加入俱乐部等)需要使用电子邮箱和密码注册账号。
4. 用户有责任保持注册信息的准确性。
5. 禁止以冒充他人为目的创建账号，以及一人不当使用多个账号。

## 第3条(禁止事项)

用户在使用本服务时，不得进行以下行为。

1. 违反法令或公序良俗的行为
2. 对其他用户的骚扰、诽谤中伤、威胁
3. 对未成年人的不当接触(包括套取个人信息、要求见面、索要照片、索要钱财等)
4. 发布或发送助长自残、自杀的内容
5. 冒充、欺诈行为
6. 妨碍本服务运营的行为(未经授权访问、过度自动化访问等)
7. 侵犯著作权、肖像权及其他第三方权利的发布内容

## 第4条(内容安全检测)

为保护用户(尤其是未成年人)，本服务对私信内容引入了自动检测危险模式(如索取个人信息、约见面、索要照片、索要钱财、涉及自残的言语等)的机制。这是基于关键词的简易机制，无法防止所有风险。如收到可疑消息，请中止交流并向身边信赖的成年人或可信赖的对象咨询。

## 第5条(发布与改编功能)

1. 用户发布内容(游戏设置、标题等)的著作权，包括作为内容基础的小游戏本身，归本服务运营者或各小游戏权利人所有。用户在发布时，可在调整参数等范围内加入自己的创作性表达。
2. 通过"改编"功能，可以基于其他用户的帖子创建新帖子，但禁止以不当贬低原发布者为目的使用该功能。

## 第6条(账号的暂停与删除)

运营者在判断用户违反本条款时，可不经事先通知暂停或删除该用户对本服务的使用。

## 第7条(免责声明)

1. 本服务按现状提供，运营者不对本服务的完整性、准确性及特定用途的适用性作出保证。
2. 对于用户之间的纠纷，运营者不承担责任。但若得知重大问题(如涉及第3条、第4条的事项)，将在可能范围内予以应对。

## 第8条(条款的变更)

运营者可根据需要变更本条款。如有重大变更，将在本服务内通知。

## 第9条(联系方式)

有关本条款的咨询，请通过本服务内的联系功能(计划中)或以下运营者联系方式与我们联系。

运营者: Hoang Gia Bao
联系方式: nexora26624@gmail.com`,
    privacy: `# Anyway 隐私政策

最后更新: 2026年8月10日

"Anyway"(以下简称"本服务")尊重用户的隐私，并基于以下方针处理个人信息。

## 1. 收集的信息

### 注册账号时
- 用户名(显示名称)
- 用户ID(@handle)
- 电子邮箱地址
- 密码(加密保存，运营者不会以明文查看)

### 使用过程中产生的信息
- 发布内容(游戏改编设置、标题等)
- 点赞・转发・评论记录
- 私信(DM)内容
- 俱乐部(群组)加入情况
- 游戏分数・游玩记录

### 自动收集的信息
- 保存于设备本地存储、用于个性化推荐的信息(该信息仅保存在设备内，不会发送至服务器)

### 关于访客模式
不创建账号、以"访客"身份使用时，不会收集上述账号相关信息。仅可浏览动态、游玩游戏(发布、点赞等写入操作需要注册账号)。

## 2. 信息使用目的

1. 提供本服务(动态展示、发布、私信等功能)
2. 防止不当使用与滋扰行为
3. 保护未成年人的安全检测(自动检测私信中的危险模式，详情参见使用条款第4条)
4. 用于改进服务的统计分析(以不识别个人身份的形式进行)

## 3. 信息的第三方提供・委托

1. 本服务使用 Supabase(第三方云服务)作为后端基础设施，上述1.中的信息保存于 Supabase 的服务器中。
2. 除法律要求的情形外，未经本人同意不会将收集的个人信息提供给第三方。

## 4. 数据保存期限

只要账号存在，相关数据将持续保存。如需删除账号，请通过本服务内功能(计划中)或联系窗口与我们联系。

## 5. 关于私信的处理

为保护包括未成年人在内的用户安全，我们引入了自动扫描私信内容中危险关键词模式(如索取个人信息、约见面、索要照片、索要钱财、暗示自残的言语等)的机制。这是系统的自动化处理，通常情况下运营者不会人工查看私信内容。

## 6. 关于儿童使用

本服务面向4岁以上儿童开放，但**发布、点赞、私信(DM)、加入俱乐部等社交功能仅限13岁以上用户使用。** 未满13岁的用户仅可浏览、游玩游戏。此年龄限制参考了各国有关儿童在线隐私保护的法律(如美国COPPA)的理念。建议家长在孩子使用本服务时进行确认与监督。

## 7. 用户权利

用户可要求查阅、更正、删除自己的注册信息。请通过联系窗口与我们联系。

## 8. 本政策的变更

本政策可能会根据需要进行变更。如有重大变更，将在本服务内通知。

## 9. 联系方式

有关本政策的咨询，请通过本服务内的联系功能(计划中)或以下运营者联系方式与我们联系。

运营者: Hoang Gia Bao
联系方式: nexora26624@gmail.com`,
  },
  ko: {
    terms: `# Anyway 이용약관

최종 업데이트: 2026년 8월 10일

본 이용약관(이하 "본 약관")은 "Anyway"(이하 "본 서비스")의 이용 조건을 정합니다. 본 서비스를 이용함으로써 본 약관에 동의한 것으로 간주됩니다.

## 제1조 (서비스 내용)

본 서비스는 여러 개의 짧은 미니게임을 세로 스크롤 피드 형식으로 즐길 수 있는 앱입니다. 사용자는 게시(게임 리믹스 포함), 좋아요, 리포스트, 댓글, 다이렉트 메시지(DM), 클럽(그룹) 기능을 이용할 수 있습니다. 계정을 만들지 않고 "게스트"로서 일부 기능을 이용할 수도 있습니다.

## 제2조 (계정・연령 제한)

1. 본 서비스는 4세 이상 어린이부터 성인까지 폭넓은 연령층이 이용할 수 있습니다(게임 열람・플레이 등).
2. 다만, **게시・좋아요・다이렉트 메시지(DM)・클럽(그룹) 참가와 같은 소셜 기능은 13세 이상만 이용할 수 있습니다.** 13세 미만은 게스트로서 게임 열람・플레이만 이용해 주세요.
3. 본 서비스의 일부 기능(게시・좋아요・DM・클럽 참가 등) 이용에는 이메일 주소와 비밀번호를 통한 계정 등록이 필요합니다.
4. 사용자는 등록 정보를 정확하게 유지할 책임이 있습니다.
5. 타인을 사칭할 목적의 계정 생성, 그리고 1인이 여러 계정을 부정하게 사용하는 행위를 금지합니다.

## 제3조 (금지 행위)

사용자는 본 서비스 이용 시 다음 행위를 해서는 안 됩니다.

1. 법령 또는 공서양속에 반하는 행위
2. 다른 사용자에 대한 괴롭힘, 비방, 협박
3. 미성년자에 대한 부적절한 접촉(개인정보 캐묻기, 직접 만남 요구, 사진 요구, 금품 요구 등 포함)
4. 자해・자살을 조장하는 내용의 게시・전송
5. 사칭, 사기 행위
6. 본 서비스 운영을 방해하는 행위(부정 접근, 과도한 자동화 접근 등)
7. 저작권・초상권 및 기타 제3자의 권리를 침해하는 게시물

## 제4조 (콘텐츠 안전 확인에 관하여)

본 서비스에서는 이용자(특히 미성년자)를 보호할 목적으로, 다이렉트 메시지 내용에 대해 위험한 패턴(개인정보 요구, 직접 만남 요구, 사진 요구, 금품 요구, 자해 관련 언어 등)을 자동으로 감지하는 시스템을 도입하고 있습니다. 이는 키워드 기반의 간단한 시스템으로, 모든 위험을 방지할 수 있는 것은 아닙니다. 수상한 메시지를 받은 경우, 대화를 중단하고 주변의 신뢰할 수 있는 어른이나 상대에게 상담해 주세요.

## 제5조 (게시・리믹스 기능)

1. 사용자가 게시한 콘텐츠(게임 설정・제목 등)의 저작권은 해당 콘텐츠의 원본이 되는 미니게임 자체를 포함하여 본 서비스 운영자 또는 각 미니게임의 권리자에게 귀속됩니다. 사용자는 게시 시 파라미터 조정 등의 범위에서 자신의 창작적 표현을 더할 수 있습니다.
2. "리믹스" 기능을 통해 다른 사용자의 게시물을 바탕으로 새로운 게시물을 만들 수 있지만, 원 게시자를 부당하게 폄하할 목적으로 사용하는 것은 금지합니다.

## 제6조 (계정의 정지・삭제)

운영자는 사용자가 본 약관을 위반했다고 판단한 경우, 사전 통지 없이 계정 이용을 정지하거나 삭제할 수 있습니다.

## 제7조 (면책 사항)

1. 본 서비스는 있는 그대로 제공되며, 운영자는 본 서비스의 완전성・정확성・특정 목적에의 적합성을 보증하지 않습니다.
2. 사용자 간의 분쟁에 대해 운영자는 책임을 지지 않습니다. 다만, 중대한 문제(제3조・제4조 관련 사안 등)를 파악한 경우에는 가능한 범위에서 대응합니다.

## 제8조 (약관의 변경)

운영자는 필요에 따라 본 약관을 변경할 수 있습니다. 중요한 변경이 있을 경우 본 서비스 내에서 공지합니다.

## 제9조 (문의)

본 약관에 관한 문의는 본 서비스 내 문의 기능(구현 예정) 또는 아래 운영자 연락처로 연락해 주세요.

운영자: Hoang Gia Bao
연락처: nexora26624@gmail.com`,
    privacy: `# Anyway 개인정보처리방침

최종 업데이트: 2026년 8월 10일

"Anyway"(이하 "본 서비스")는 사용자 여러분의 개인정보를 존중하며, 다음 방침에 따라 개인정보를 처리합니다.

## 1. 수집하는 정보

### 계정 등록 시
- 사용자 이름(표시 이름)
- 사용자 ID(@핸들)
- 이메일 주소
- 비밀번호(암호화되어 저장되며, 운영자가 평문으로 열람하는 일은 없습니다)

### 이용 중 생성되는 정보
- 게시 내용(게임 리믹스 설정, 제목 등)
- 좋아요・리포스트・댓글 기록
- 다이렉트 메시지(DM) 내용
- 클럽(그룹) 참가 현황
- 게임 점수・플레이 기록

### 자동으로 수집되는 정보
- 단말기 로컬 스토리지에 저장되는, 추천 표시를 위한 개인화 정보(이 정보는 단말기 내에만 저장되며 서버로 전송되지 않습니다)

### 게스트 모드에 관하여
계정을 만들지 않고 "게스트"로 이용하는 경우, 위 정보 중 계정 관련 정보는 수집하지 않습니다. 피드 열람・게임 플레이만 가능합니다(게시・좋아요 등 쓰기 작업에는 계정 등록이 필요합니다).

## 2. 정보 이용 목적

1. 본 서비스 제공(피드 표시, 게시, DM 등 기능 제공)
2. 부정 이용・민폐 행위 방지
3. 미성년자 보호를 위한 안전 확인(다이렉트 메시지 내 위험 패턴 자동 감지. 자세한 내용은 이용약관 제4조 참조)
4. 서비스 개선을 위한 통계 분석(개인을 특정하지 않는 형태로 실시)

## 3. 정보의 제3자 제공・위탁

1. 본 서비스는 백엔드 인프라로 Supabase(제3자 클라우드 서비스)를 이용하고 있으며, 위 1.의 정보는 Supabase 서버에 저장됩니다.
2. 법령에 근거한 경우를 제외하고, 수집한 개인정보를 본인 동의 없이 제3자에게 제공하지 않습니다.

## 4. 데이터 보관 기간

계정이 존재하는 한 관련 데이터를 보관합니다. 계정 삭제를 원하시는 경우 본 서비스 내 기능(구현 예정) 또는 문의 창구로 연락해 주세요.

## 5. 다이렉트 메시지의 취급에 관하여

미성년자를 포함한 이용자의 안전을 지키기 위해, DM 내용에 대해 위험한 키워드 패턴(개인정보 요구, 직접 만남 약속, 사진 요구, 금품 요구, 자해를 암시하는 언어 등)을 자동으로 스캔하는 시스템을 도입하고 있습니다. 이는 시스템에 의한 자동 처리이며, 평소 운영자가 DM 내용을 사람이 직접 열람하는 일은 없습니다.

## 6. 어린이의 이용에 관하여

본 서비스는 4세 이상 어린이부터 이용할 수 있지만, **게시・좋아요・다이렉트 메시지(DM)・클럽 참가 등 소셜 기능은 13세 이상으로 제한됩니다.** 13세 미만은 게임 열람・플레이만 이용할 수 있습니다. 이 연령 제한은 아동의 온라인 개인정보 보호에 관한 각국 법령(미국 COPPA 등)의 취지를 반영한 것입니다. 보호자께서는 자녀가 본 서비스를 이용할 때 내용을 확인・지켜봐 주시기를 권장합니다.

## 7. 사용자의 권리

사용자는 자신의 등록 정보의 확인・수정・삭제를 요구할 수 있습니다. 문의 창구로 연락해 주세요.

## 8. 본 방침의 변경

본 방침은 필요에 따라 변경될 수 있습니다. 중요한 변경이 있을 경우 본 서비스 내에서 공지합니다.

## 9. 문의

본 방침에 관한 문의는 본 서비스 내 문의 기능(구현 예정) 또는 아래 운영자 연락처로 연락해 주세요.

운영자: Hoang Gia Bao
연락처: nexora26624@gmail.com`,
  },
  vi: {
    terms: `# Điều khoản Dịch vụ Anyway

Cập nhật lần cuối: ngày 10 tháng 8 năm 2026

Điều khoản Dịch vụ này (sau đây gọi là "Điều khoản") quy định các điều kiện sử dụng "Anyway" (sau đây gọi là "Dịch vụ"). Khi sử dụng Dịch vụ, bạn được coi là đã đồng ý với Điều khoản này.

## Điều 1 (Nội dung Dịch vụ)

Dịch vụ là một ứng dụng cho phép bạn thưởng thức nhiều trò chơi nhỏ, thời lượng ngắn theo định dạng feed cuộn dọc. Người dùng có thể đăng bài (bao gồm cả bản phối lại trò chơi), thích, chia sẻ lại, bình luận, gửi tin nhắn trực tiếp (DM) và sử dụng tính năng câu lạc bộ (nhóm). Bạn cũng có thể sử dụng một số tính năng mà không cần tạo tài khoản, với tư cách "Khách."

## Điều 2 (Tài khoản và Giới hạn Độ tuổi)

1. Dịch vụ dành cho nhiều độ tuổi, từ trẻ em từ 4 tuổi trở lên đến người lớn (để xem/chơi trò chơi, v.v.).
2. Tuy nhiên, **các tính năng xã hội như đăng bài, thích, tin nhắn trực tiếp (DM) và tham gia câu lạc bộ (nhóm) chỉ dành cho người dùng từ 13 tuổi trở lên.** Người dùng dưới 13 tuổi chỉ nên sử dụng Dịch vụ với tư cách Khách, để xem và chơi trò chơi.
3. Việc sử dụng một số tính năng của Dịch vụ (đăng bài, thích, DM, tham gia câu lạc bộ, v.v.) yêu cầu đăng ký tài khoản bằng địa chỉ email và mật khẩu.
4. Người dùng có trách nhiệm giữ cho thông tin đăng ký của mình chính xác.
5. Nghiêm cấm tạo tài khoản để mạo danh người khác, và việc một cá nhân sử dụng trái phép nhiều tài khoản.

## Điều 3 (Hành vi Bị cấm)

Khi sử dụng Dịch vụ, người dùng không được thực hiện bất kỳ hành vi nào sau đây:

1. Hành vi vi phạm pháp luật hoặc trật tự công cộng và đạo đức
2. Quấy rối, phỉ báng hoặc đe dọa người dùng khác
3. Tiếp xúc không phù hợp với trẻ vị thành niên (bao gồm việc dò hỏi thông tin cá nhân, yêu cầu gặp mặt trực tiếp, yêu cầu ảnh, hoặc yêu cầu tiền/quà)
4. Đăng hoặc gửi nội dung khuyến khích tự làm hại bản thân hoặc tự tử
5. Mạo danh hoặc hành vi lừa đảo
6. Hành vi cản trở hoạt động của Dịch vụ (truy cập trái phép, truy cập tự động hóa quá mức, v.v.)
7. Bài đăng vi phạm bản quyền, quyền hình ảnh cá nhân hoặc quyền của bên thứ ba khác

## Điều 4 (Kiểm tra An toàn Nội dung)

Để bảo vệ người dùng (đặc biệt là trẻ vị thành niên), Dịch vụ có cơ chế tự động phát hiện các mẫu nguy hiểm trong tin nhắn trực tiếp (như yêu cầu thông tin cá nhân, yêu cầu gặp mặt trực tiếp, yêu cầu ảnh, yêu cầu tiền/quà, và ngôn ngữ liên quan đến tự làm hại bản thân). Đây là cơ chế đơn giản dựa trên từ khóa và không thể ngăn chặn mọi rủi ro. Nếu bạn nhận được tin nhắn đáng ngờ, vui lòng dừng cuộc trò chuyện và tham khảo ý kiến người lớn đáng tin cậy hoặc người mà bạn tin tưởng.

## Điều 5 (Tính năng Đăng bài và Phối lại)

1. Bản quyền đối với nội dung do người dùng đăng (cài đặt trò chơi, tiêu đề, v.v.), bao gồm cả trò chơi nhỏ gốc, thuộc về nhà điều hành Dịch vụ hoặc chủ sở hữu quyền của từng trò chơi nhỏ. Người dùng có thể thêm biểu đạt sáng tạo của riêng mình trong phạm vi điều chỉnh tham số, v.v. khi đăng bài.
2. Tính năng "Phối lại" cho phép bạn tạo bài đăng mới dựa trên bài đăng của người dùng khác, nhưng nghiêm cấm sử dụng tính năng này với mục đích hạ thấp người đăng gốc một cách không công bằng.

## Điều 6 (Đình chỉ và Xóa Tài khoản)

Nhà điều hành có thể đình chỉ hoặc xóa quyền truy cập của người dùng vào Dịch vụ mà không cần thông báo trước nếu xác định rằng người dùng đã vi phạm Điều khoản này.

## Điều 7 (Miễn trừ Trách nhiệm)

1. Dịch vụ được cung cấp "nguyên trạng," và nhà điều hành không đảm bảo tính đầy đủ, chính xác hoặc phù hợp với bất kỳ mục đích cụ thể nào của Dịch vụ.
2. Nhà điều hành không chịu trách nhiệm về các tranh chấp giữa người dùng. Tuy nhiên, nếu nhà điều hành biết đến vấn đề nghiêm trọng (như các vấn đề liên quan đến Điều 3 hoặc Điều 4), sẽ xử lý trong phạm vi có thể.

## Điều 8 (Thay đổi Điều khoản)

Nhà điều hành có thể thay đổi Điều khoản này khi cần thiết. Các thay đổi quan trọng sẽ được thông báo trong Dịch vụ.

## Điều 9 (Liên hệ)

Để biết thắc mắc về Điều khoản này, vui lòng sử dụng tính năng liên hệ trong Dịch vụ (dự kiến triển khai) hoặc liên hệ với nhà điều hành theo địa chỉ dưới đây.

Nhà điều hành: Hoang Gia Bao
Liên hệ: nexora26624@gmail.com`,
    privacy: `# Chính sách Quyền riêng tư Anyway

Cập nhật lần cuối: ngày 10 tháng 8 năm 2026

"Anyway" (sau đây gọi là "Dịch vụ") tôn trọng quyền riêng tư của người dùng và xử lý thông tin cá nhân dựa trên chính sách sau đây.

## 1. Thông tin Chúng tôi Thu thập

### Khi Đăng ký Tài khoản
- Tên người dùng (tên hiển thị)
- ID người dùng (@handle)
- Địa chỉ email
- Mật khẩu (được lưu trữ mã hóa; nhà điều hành không bao giờ xem dưới dạng văn bản thuần)

### Thông tin Được tạo ra Trong quá trình Sử dụng
- Nội dung bài đăng (cài đặt phối lại trò chơi, tiêu đề, v.v.)
- Lịch sử thích, chia sẻ lại, bình luận
- Nội dung tin nhắn trực tiếp (DM)
- Tình trạng tham gia câu lạc bộ (nhóm)
- Điểm số và lịch sử chơi trò chơi

### Thông tin Được thu thập Tự động
- Thông tin cá nhân hóa được lưu trong bộ nhớ cục bộ của thiết bị, dùng để đề xuất (thông tin này chỉ được lưu trên thiết bị và không bao giờ được gửi đến máy chủ)

### Về Chế độ Khách
Nếu bạn sử dụng Dịch vụ với tư cách "Khách" mà không tạo tài khoản, không có thông tin liên quan đến tài khoản nào ở trên được thu thập. Bạn chỉ có thể xem feed và chơi trò chơi (đăng bài, thích và các hành động ghi khác yêu cầu đăng ký tài khoản).

## 2. Mục đích Sử dụng

1. Cung cấp Dịch vụ (hiển thị feed, đăng bài, DM và các tính năng khác)
2. Ngăn chặn việc sử dụng trái phép và lạm dụng
3. Kiểm tra an toàn để bảo vệ trẻ vị thành niên (tự động phát hiện các mẫu nguy hiểm trong tin nhắn trực tiếp; xem Điều 4 của Điều khoản Dịch vụ để biết chi tiết)
4. Phân tích thống kê để cải thiện Dịch vụ (được thực hiện dưới hình thức không xác định cá nhân)

## 3. Tiết lộ cho Bên thứ ba và Ủy thác

1. Dịch vụ sử dụng Supabase (dịch vụ đám mây của bên thứ ba) làm cơ sở hạ tầng backend, và thông tin được mô tả trong mục 1 ở trên được lưu trữ trên máy chủ của Supabase.
2. Trừ khi pháp luật yêu cầu, chúng tôi sẽ không cung cấp thông tin cá nhân đã thu thập cho bên thứ ba mà không có sự đồng ý của cá nhân đó.

## 4. Thời gian Lưu giữ Dữ liệu

Chúng tôi lưu giữ dữ liệu liên quan miễn là tài khoản còn tồn tại. Nếu bạn muốn xóa tài khoản, vui lòng liên hệ qua tính năng trong Dịch vụ (dự kiến triển khai) hoặc địa chỉ liên hệ của chúng tôi.

## 5. Xử lý Tin nhắn Trực tiếp

Để bảo vệ an toàn cho người dùng, bao gồm cả trẻ vị thành niên, chúng tôi đã giới thiệu một cơ chế tự động quét nội dung tin nhắn trực tiếp để tìm các mẫu từ khóa nguy hiểm (như yêu cầu thông tin cá nhân, yêu cầu gặp mặt trực tiếp, yêu cầu ảnh, yêu cầu tiền/quà, và ngôn ngữ gợi ý tự làm hại bản thân). Đây là xử lý tự động bởi hệ thống; nhà điều hành không đọc thủ công nội dung DM trong điều kiện bình thường.

## 6. Sử dụng bởi Trẻ em

Dịch vụ dành cho trẻ em từ 4 tuổi trở lên, nhưng **các tính năng xã hội như đăng bài, thích, tin nhắn trực tiếp (DM) và tham gia câu lạc bộ chỉ giới hạn cho người dùng từ 13 tuổi trở lên.** Người dùng dưới 13 tuổi chỉ có thể xem và chơi trò chơi. Giới hạn độ tuổi này phản ánh các nguyên tắc của luật pháp các quốc gia về bảo vệ quyền riêng tư trực tuyến của trẻ em (như COPPA của Hoa Kỳ). Chúng tôi khuyến nghị phụ huynh kiểm tra và giám sát việc sử dụng Dịch vụ của con em mình.

## 7. Quyền của Người dùng

Người dùng có thể yêu cầu xem lại, sửa đổi hoặc xóa thông tin đăng ký của mình. Vui lòng liên hệ qua địa chỉ liên hệ của chúng tôi.

## 8. Thay đổi Chính sách này

Chính sách này có thể được thay đổi khi cần thiết. Các thay đổi quan trọng sẽ được thông báo trong Dịch vụ.

## 9. Liên hệ

Để biết thắc mắc về Chính sách này, vui lòng sử dụng tính năng liên hệ trong Dịch vụ (dự kiến triển khai) hoặc liên hệ với nhà điều hành theo địa chỉ dưới đây.

Nhà điều hành: Hoang Gia Bao
Liên hệ: nexora26624@gmail.com`,
  },
  es: {
    terms: `# Términos de Servicio de Anyway

Última actualización: 10 de agosto de 2026

Estos Términos de Servicio ("estos Términos") establecen las condiciones de uso de "Anyway" (el "Servicio"). Al usar el Servicio, se considera que ha aceptado estos Términos.

## Artículo 1 (Descripción del Servicio)

El Servicio es una aplicación en la que puede disfrutar de varios minijuegos cortos en un formato de feed de desplazamiento vertical. Los usuarios pueden publicar (incluidos remixes de juegos), dar "me gusta", republicar, comentar, enviar mensajes directos (DM) y usar funciones de club (grupo). También puede usar algunas funciones sin crear una cuenta, como "Invitado."

## Artículo 2 (Cuentas y Restricciones de Edad)

1. El Servicio está disponible para un amplio rango de edades, desde niños de 4 años en adelante hasta adultos (para ver/jugar juegos, etc.).
2. Sin embargo, **las funciones sociales como publicar, dar "me gusta", mensajes directos (DM) y unirse a clubes (grupos) están disponibles solo para usuarios de 13 años en adelante.** Los usuarios menores de 13 años deben usar el Servicio como Invitado, solo para ver y jugar.
3. El uso de algunas funciones del Servicio (publicar, dar "me gusta", DM, unirse a clubes, etc.) requiere el registro de una cuenta con dirección de correo electrónico y contraseña.
4. Los usuarios son responsables de mantener actualizada su información de registro.
5. Está prohibido crear una cuenta para hacerse pasar por otra persona, así como el uso indebido de múltiples cuentas por una sola persona.

## Artículo 3 (Conducta Prohibida)

Al usar el Servicio, los usuarios no deben incurrir en ninguna de las siguientes conductas:

1. Conductas que violen leyes o el orden público y las buenas costumbres
2. Acoso, difamación o amenazas dirigidas a otros usuarios
3. Contacto inapropiado con menores (incluyendo solicitar información personal, solicitar reunirse en persona, solicitar fotos o solicitar dinero/regalos)
4. Publicar o enviar contenido que fomente la autolesión o el suicidio
5. Suplantación de identidad o conducta fraudulenta
6. Conductas que interfieran con la operación del Servicio (acceso no autorizado, acceso automatizado excesivo, etc.)
7. Publicaciones que infrinjan derechos de autor, derechos de imagen u otros derechos de terceros

## Artículo 4 (Verificaciones de Seguridad del Contenido)

Para proteger a los usuarios (especialmente a los menores), el Servicio cuenta con un mecanismo que detecta automáticamente patrones peligrosos en los mensajes directos (como solicitudes de información personal, solicitudes de reunirse en persona, solicitudes de fotos, solicitudes de dinero/regalos y lenguaje relacionado con la autolesión). Este es un mecanismo simple basado en palabras clave y no puede prevenir todos los riesgos. Si recibe un mensaje sospechoso, deje de conversar y consulte a un adulto de confianza o a alguien en quien confíe.

## Artículo 5 (Funciones de Publicación y Remix)

1. Los derechos de autor del contenido publicado por los usuarios (configuraciones de juego, títulos, etc.), incluido el minijuego subyacente, pertenecen al operador del Servicio o al titular de los derechos de cada minijuego. Los usuarios pueden añadir su propia expresión creativa dentro del alcance de ajustar parámetros, etc., al publicar.
2. La función "Remix" le permite crear una nueva publicación basada en la publicación de otro usuario, pero su uso con el fin de menospreciar injustamente al autor original está prohibido.

## Artículo 6 (Suspensión y Eliminación de Cuentas)

El operador puede suspender o eliminar el acceso de un usuario al Servicio sin previo aviso si determina que el usuario ha violado estos Términos.

## Artículo 7 (Exención de Responsabilidad)

1. El Servicio se proporciona "tal cual," y el operador no garantiza su integridad, exactitud ni idoneidad para un propósito particular.
2. El operador no es responsable de las disputas entre usuarios. Sin embargo, si el operador toma conocimiento de un problema grave (como asuntos relacionados con los Artículos 3 o 4), responderá en la medida de lo posible.

## Artículo 8 (Cambios a estos Términos)

El operador puede cambiar estos Términos según sea necesario. Los cambios significativos se anunciarán dentro del Servicio.

## Artículo 9 (Contacto)

Para consultas sobre estos Términos, utilice la función de contacto dentro del Servicio (previsto) o comuníquese con el operador en la dirección a continuación.

Operador: Hoang Gia Bao
Contacto: nexora26624@gmail.com`,
    privacy: `# Política de Privacidad de Anyway

Última actualización: 10 de agosto de 2026

"Anyway" (el "Servicio") respeta la privacidad de sus usuarios y trata la información personal según la siguiente política.

## 1. Información que Recopilamos

### Al Registrar una Cuenta
- Nombre de usuario (nombre visible)
- ID de usuario (identificador @)
- Dirección de correo electrónico
- Contraseña (almacenada cifrada; el operador nunca la ve en texto plano)

### Información Generada Durante el Uso
- Contenido de publicaciones (configuraciones de remix de juegos, títulos, etc.)
- Historial de "me gusta", republicaciones y comentarios
- Contenido de mensajes directos (DM)
- Estado de membresía en clubes (grupos)
- Puntuaciones de juego e historial de partidas

### Información Recopilada Automáticamente
- Información de personalización almacenada en el almacenamiento local del dispositivo, utilizada para recomendaciones (esta información se almacena solo en el dispositivo y nunca se envía al servidor)

### Sobre el Modo Invitado
Si usa el Servicio como "Invitado" sin crear una cuenta, no se recopila ninguna de la información relacionada con la cuenta mencionada anteriormente. Solo puede ver el feed y jugar (publicar, dar "me gusta" y otras acciones de escritura requieren registro de cuenta).

## 2. Finalidad del Uso

1. Proporcionar el Servicio (visualización del feed, publicaciones, DM y otras funciones)
2. Prevenir el uso no autorizado y el abuso
3. Verificaciones de seguridad para proteger a los menores (detección automática de patrones peligrosos en mensajes directos; consulte el Artículo 4 de los Términos de Servicio para más detalles)
4. Análisis estadístico para mejorar el Servicio (realizado de forma que no identifique a individuos)

## 3. Divulgación a Terceros y Subcontratación

1. El Servicio utiliza Supabase (un servicio en la nube de terceros) como infraestructura de backend, y la información descrita en el punto 1 anterior se almacena en los servidores de Supabase.
2. Salvo cuando lo exija la ley, no proporcionaremos la información personal recopilada a terceros sin el consentimiento del individuo.

## 4. Período de Retención de Datos

Conservamos los datos relacionados mientras la cuenta exista. Si desea eliminar su cuenta, comuníquese a través de la función dentro del Servicio (prevista) o de nuestra dirección de contacto.

## 5. Manejo de Mensajes Directos

Para proteger la seguridad de los usuarios, incluidos los menores, hemos introducido un mecanismo que escanea automáticamente el contenido de los mensajes directos en busca de patrones de palabras clave peligrosas (como solicitudes de información personal, solicitudes de reunirse en persona, solicitudes de fotos, solicitudes de dinero/regalos y lenguaje que sugiera autolesión). Este es un procesamiento automatizado por el sistema; el operador no lee manualmente el contenido de los DM en circunstancias normales.

## 6. Uso por parte de Menores

El Servicio está disponible para niños de 4 años en adelante, pero **las funciones sociales como publicar, dar "me gusta", mensajes directos (DM) y unirse a clubes están limitadas a usuarios de 13 años en adelante.** Los usuarios menores de 13 años solo pueden ver y jugar. Esta restricción de edad refleja los principios de las leyes de varios países sobre la protección de la privacidad en línea de los niños (como la COPPA de EE. UU.). Recomendamos que los padres verifiquen y supervisen el uso del Servicio por parte de sus hijos.

## 7. Derechos del Usuario

Los usuarios pueden solicitar revisar, corregir o eliminar su información de registro. Comuníquese a través de nuestra dirección de contacto.

## 8. Cambios a esta Política

Esta Política puede cambiarse según sea necesario. Los cambios significativos se anunciarán dentro del Servicio.

## 9. Contacto

Para consultas sobre esta Política, utilice la función de contacto dentro del Servicio (prevista) o comuníquese con el operador en la dirección a continuación.

Operador: Hoang Gia Bao
Contacto: nexora26624@gmail.com`,
  },
  fr: {
    terms: `# Conditions d'utilisation d'Anyway

Dernière mise à jour : 10 août 2026

Les présentes Conditions d'utilisation (les « Conditions ») définissent les modalités d'utilisation d'« Anyway » (le « Service »). En utilisant le Service, vous êtes réputé avoir accepté les présentes Conditions.

## Article 1 (Description du Service)

Le Service est une application permettant de profiter de plusieurs mini-jeux courts sous forme de flux à défilement vertical. Les utilisateurs peuvent publier (y compris des remix de jeux), aimer, republier, commenter, envoyer des messages directs (DM) et utiliser les fonctionnalités de club (groupe). Il est également possible d'utiliser certaines fonctionnalités sans créer de compte, en tant qu'« Invité ».

## Article 2 (Comptes et restrictions d'âge)

1. Le Service est accessible à un large éventail d'âges, des enfants de 4 ans et plus aux adultes (pour consulter/jouer aux jeux, etc.).
2. Toutefois, **les fonctionnalités sociales telles que la publication, les mentions « j'aime », les messages directs (DM) et l'adhésion à des clubs (groupes) sont réservées aux utilisateurs âgés de 13 ans et plus.** Les utilisateurs de moins de 13 ans doivent utiliser le Service en tant qu'Invité, uniquement pour consulter et jouer aux jeux.
3. L'utilisation de certaines fonctionnalités du Service (publication, mentions « j'aime », DM, adhésion à des clubs, etc.) nécessite la création d'un compte avec une adresse e-mail et un mot de passe.
4. Les utilisateurs sont responsables de maintenir l'exactitude de leurs informations d'inscription.
5. Il est interdit de créer un compte dans le but d'usurper l'identité d'autrui, ainsi que d'utiliser abusivement plusieurs comptes en tant qu'individu unique.

## Article 3 (Comportements interdits)

Lors de l'utilisation du Service, les utilisateurs ne doivent pas adopter les comportements suivants :

1. Comportement contraire aux lois ou à l'ordre public et aux bonnes mœurs
2. Harcèlement, diffamation ou menaces envers d'autres utilisateurs
3. Contact inapproprié avec des mineurs (y compris la sollicitation d'informations personnelles, la demande de rencontre en personne, la demande de photos ou la demande d'argent/de cadeaux)
4. Publication ou envoi de contenu encourageant l'automutilation ou le suicide
5. Usurpation d'identité ou comportement frauduleux
6. Comportement entravant le fonctionnement du Service (accès non autorisé, accès automatisé excessif, etc.)
7. Publications portant atteinte aux droits d'auteur, aux droits à l'image ou à d'autres droits de tiers

## Article 4 (Vérifications de sécurité du contenu)

Afin de protéger les utilisateurs (en particulier les mineurs), le Service dispose d'un mécanisme qui détecte automatiquement les schémas dangereux dans les messages directs (tels que les demandes d'informations personnelles, les demandes de rencontre en personne, les demandes de photos, les demandes d'argent/de cadeaux et le langage lié à l'automutilation). Il s'agit d'un mécanisme simple basé sur des mots-clés qui ne peut pas prévenir tous les risques. Si vous recevez un message suspect, veuillez arrêter la conversation et consulter un adulte de confiance ou une personne en qui vous avez confiance.

## Article 5 (Fonctionnalités de publication et de remix)

1. Les droits d'auteur du contenu publié par les utilisateurs (paramètres de jeu, titres, etc.), y compris le mini-jeu sous-jacent lui-même, appartiennent à l'exploitant du Service ou au titulaire des droits de chaque mini-jeu. Les utilisateurs peuvent ajouter leur propre expression créative dans la limite de l'ajustement des paramètres, etc., lors de la publication.
2. La fonctionnalité « Remix » permet de créer une nouvelle publication basée sur la publication d'un autre utilisateur, mais son utilisation dans le but de dénigrer injustement l'auteur original est interdite.

## Article 6 (Suspension et suppression de comptes)

L'exploitant peut suspendre ou supprimer l'accès d'un utilisateur au Service sans préavis s'il détermine que l'utilisateur a enfreint les présentes Conditions.

## Article 7 (Clause de non-responsabilité)

1. Le Service est fourni « tel quel », et l'exploitant ne garantit ni son exhaustivité, ni son exactitude, ni son adéquation à un usage particulier.
2. L'exploitant n'est pas responsable des litiges entre utilisateurs. Toutefois, s'il a connaissance d'un problème grave (comme des questions relatives aux Articles 3 ou 4), il y répondra dans la mesure du possible.

## Article 8 (Modifications des présentes Conditions)

L'exploitant peut modifier les présentes Conditions si nécessaire. Les modifications importantes seront annoncées au sein du Service.

## Article 9 (Contact)

Pour toute question concernant les présentes Conditions, veuillez utiliser la fonction de contact au sein du Service (prévue) ou contacter l'exploitant à l'adresse ci-dessous.

Exploitant : Hoang Gia Bao
Contact : nexora26624@gmail.com`,
    privacy: `# Politique de confidentialité d'Anyway

Dernière mise à jour : 10 août 2026

« Anyway » (le « Service ») respecte la vie privée de ses utilisateurs et traite les informations personnelles conformément à la politique suivante.

## 1. Informations que nous collectons

### Lors de l'inscription au compte
- Nom d'utilisateur (nom affiché)
- Identifiant utilisateur (identifiant @)
- Adresse e-mail
- Mot de passe (stocké de manière chiffrée ; l'exploitant ne le consulte jamais en texte clair)

### Informations générées pendant l'utilisation
- Contenu des publications (paramètres de remix de jeu, titres, etc.)
- Historique des mentions « j'aime », republications et commentaires
- Contenu des messages directs (DM)
- Statut d'adhésion aux clubs (groupes)
- Scores de jeu et historique de parties

### Informations collectées automatiquement
- Informations de personnalisation stockées dans le stockage local de l'appareil, utilisées pour les recommandations (ces informations sont stockées uniquement sur l'appareil et ne sont jamais envoyées au serveur)

### À propos du mode Invité
Si vous utilisez le Service en tant qu'« Invité » sans créer de compte, aucune des informations liées au compte mentionnées ci-dessus n'est collectée. Vous pouvez uniquement consulter le flux et jouer (la publication, les mentions « j'aime » et autres actions d'écriture nécessitent une inscription).

## 2. Finalité de l'utilisation

1. Fourniture du Service (affichage du flux, publication, DM et autres fonctionnalités)
2. Prévention de l'utilisation non autorisée et des abus
3. Vérifications de sécurité pour protéger les mineurs (détection automatique de schémas dangereux dans les messages directs ; voir l'Article 4 des Conditions d'utilisation pour plus de détails)
4. Analyse statistique pour améliorer le Service (réalisée sous une forme n'identifiant pas les individus)

## 3. Divulgation à des tiers et sous-traitance

1. Le Service utilise Supabase (un service cloud tiers) comme infrastructure back-end, et les informations décrites au point 1 ci-dessus sont stockées sur les serveurs de Supabase.
2. Sauf lorsque la loi l'exige, nous ne fournirons pas les informations personnelles collectées à des tiers sans le consentement de la personne concernée.

## 4. Durée de conservation des données

Nous conservons les données associées tant que le compte existe. Si vous souhaitez supprimer votre compte, veuillez nous contacter via la fonction du Service (prévue) ou notre adresse de contact.

## 5. Traitement des messages directs

Afin de protéger la sécurité des utilisateurs, y compris des mineurs, nous avons mis en place un mécanisme qui analyse automatiquement le contenu des messages directs à la recherche de schémas de mots-clés dangereux (tels que les demandes d'informations personnelles, les demandes de rencontre en personne, les demandes de photos, les demandes d'argent/de cadeaux et un langage suggérant l'automutilation). Il s'agit d'un traitement automatisé par le système ; l'exploitant ne lit pas manuellement le contenu des DM dans des circonstances normales.

## 6. Utilisation par des enfants

Le Service est accessible aux enfants de 4 ans et plus, mais **les fonctionnalités sociales telles que la publication, les mentions « j'aime », les messages directs (DM) et l'adhésion à des clubs sont réservées aux utilisateurs âgés de 13 ans et plus.** Les utilisateurs de moins de 13 ans ne peuvent que consulter et jouer aux jeux. Cette restriction d'âge reflète les principes des lois de divers pays sur la protection de la vie privée en ligne des enfants (comme le COPPA américain). Nous recommandons aux parents de vérifier et de superviser l'utilisation du Service par leurs enfants.

## 7. Droits de l'utilisateur

Les utilisateurs peuvent demander à consulter, corriger ou supprimer leurs informations d'inscription. Veuillez nous contacter via notre adresse de contact.

## 8. Modifications de la présente Politique

La présente Politique peut être modifiée si nécessaire. Les modifications importantes seront annoncées au sein du Service.

## 9. Contact

Pour toute question concernant la présente Politique, veuillez utiliser la fonction de contact au sein du Service (prévue) ou contacter l'exploitant à l'adresse ci-dessous.

Exploitant : Hoang Gia Bao
Contact : nexora26624@gmail.com`,
  },
  de: {
    terms: `# Anyway Nutzungsbedingungen

Zuletzt aktualisiert: 10. August 2026

Diese Nutzungsbedingungen ("diese Bedingungen") legen die Nutzungsbedingungen für "Anyway" (den "Dienst") fest. Durch die Nutzung des Dienstes gilt, dass Sie diesen Bedingungen zugestimmt haben.

## Artikel 1 (Leistungsbeschreibung)

Der Dienst ist eine App, in der Sie mehrere kurze Minispiele in einem vertikal scrollenden Feed-Format genießen können. Nutzer können posten (einschließlich Remixe von Spielen), liken, repost, kommentieren, Direktnachrichten (DMs) senden und Club-Funktionen (Gruppen) nutzen. Sie können einige Funktionen auch ohne Erstellung eines Kontos als "Gast" nutzen.

## Artikel 2 (Konten und Altersbeschränkungen)

1. Der Dienst steht einem breiten Altersspektrum zur Verfügung, von Kindern ab 4 Jahren bis zu Erwachsenen (zum Ansehen/Spielen von Spielen usw.).
2. Allerdings sind **soziale Funktionen wie Posten, Liken, Direktnachrichten (DMs) und der Beitritt zu Clubs (Gruppen) nur Nutzern ab 13 Jahren vorbehalten.** Nutzer unter 13 Jahren sollten den Dienst nur als Gast nutzen, um Spiele anzusehen und zu spielen.
3. Die Nutzung einiger Funktionen des Dienstes (Posten, Liken, DMs, Beitritt zu Clubs usw.) erfordert eine Kontoregistrierung mit E-Mail-Adresse und Passwort.
4. Nutzer sind dafür verantwortlich, ihre Registrierungsdaten korrekt zu halten.
5. Die Erstellung eines Kontos zur Vortäuschung einer anderen Person sowie die missbräuchliche Nutzung mehrerer Konten durch eine einzelne Person sind untersagt.

## Artikel 3 (Verbotenes Verhalten)

Bei der Nutzung des Dienstes dürfen Nutzer nicht folgendes Verhalten zeigen:

1. Verhalten, das gegen Gesetze oder die öffentliche Ordnung und gute Sitten verstößt
2. Belästigung, Verleumdung oder Bedrohung anderer Nutzer
3. Unangemessener Kontakt mit Minderjährigen (einschließlich der Abfrage persönlicher Informationen, der Aufforderung zu einem persönlichen Treffen, der Aufforderung zu Fotos oder der Aufforderung zu Geld/Geschenken)
4. Veröffentlichen oder Versenden von Inhalten, die Selbstverletzung oder Suizid fördern
5. Identitätsdiebstahl oder betrügerisches Verhalten
6. Verhalten, das den Betrieb des Dienstes beeinträchtigt (unbefugter Zugriff, übermäßiger automatisierter Zugriff usw.)
7. Beiträge, die Urheberrechte, Persönlichkeitsrechte oder andere Rechte Dritter verletzen

## Artikel 4 (Inhaltssicherheitsprüfungen)

Zum Schutz der Nutzer (insbesondere Minderjähriger) verfügt der Dienst über einen Mechanismus, der automatisch gefährliche Muster in Direktnachrichten erkennt (wie Anfragen nach persönlichen Informationen, Aufforderungen zu einem persönlichen Treffen, Anfragen nach Fotos, Anfragen nach Geld/Geschenken und Sprache im Zusammenhang mit Selbstverletzung). Dies ist ein einfacher, stichwortbasierter Mechanismus, der nicht alle Risiken verhindern kann. Wenn Sie eine verdächtige Nachricht erhalten, beenden Sie bitte das Gespräch und wenden Sie sich an einen vertrauenswürdigen Erwachsenen oder eine Person Ihres Vertrauens.

## Artikel 5 (Posting- und Remix-Funktionen)

1. Das Urheberrecht an von Nutzern gepostetem Inhalt (Spieleinstellungen, Titel usw.), einschließlich des zugrunde liegenden Minispiels selbst, liegt beim Betreiber des Dienstes oder beim Rechteinhaber des jeweiligen Minispiels. Nutzer können beim Posten im Rahmen der Anpassung von Parametern usw. ihre eigene kreative Ausdrucksform hinzufügen.
2. Die "Remix"-Funktion ermöglicht es, einen neuen Beitrag basierend auf dem Beitrag eines anderen Nutzers zu erstellen, jedoch ist die Nutzung mit dem Ziel, den ursprünglichen Verfasser ungerechtfertigt herabzuwürdigen, untersagt.

## Artikel 6 (Sperrung und Löschung von Konten)

Der Betreiber kann den Zugriff eines Nutzers auf den Dienst ohne vorherige Ankündigung sperren oder löschen, wenn festgestellt wird, dass der Nutzer gegen diese Bedingungen verstoßen hat.

## Artikel 7 (Haftungsausschluss)

1. Der Dienst wird "wie besehen" bereitgestellt, und der Betreiber gewährleistet weder dessen Vollständigkeit, Richtigkeit noch Eignung für einen bestimmten Zweck.
2. Der Betreiber übernimmt keine Verantwortung für Streitigkeiten zwischen Nutzern. Wird jedoch ein schwerwiegendes Problem bekannt (z. B. Angelegenheiten im Zusammenhang mit Artikel 3 oder 4), wird im Rahmen des Möglichen reagiert.

## Artikel 8 (Änderungen dieser Bedingungen)

Der Betreiber kann diese Bedingungen bei Bedarf ändern. Wesentliche Änderungen werden innerhalb des Dienstes bekannt gegeben.

## Artikel 9 (Kontakt)

Für Fragen zu diesen Bedingungen nutzen Sie bitte die Kontaktfunktion innerhalb des Dienstes (geplant) oder wenden Sie sich an den Betreiber unter der unten stehenden Adresse.

Betreiber: Hoang Gia Bao
Kontakt: nexora26624@gmail.com`,
    privacy: `# Anyway Datenschutzrichtlinie

Zuletzt aktualisiert: 10. August 2026

"Anyway" (der "Dienst") respektiert die Privatsphäre seiner Nutzer und verarbeitet personenbezogene Daten gemäß der folgenden Richtlinie.

## 1. Von uns erhobene Informationen

### Bei der Kontoregistrierung
- Benutzername (Anzeigename)
- Benutzer-ID (@-Handle)
- E-Mail-Adresse
- Passwort (verschlüsselt gespeichert; der Betreiber sieht es niemals im Klartext)

### Während der Nutzung generierte Informationen
- Beitragsinhalte (Spiel-Remix-Einstellungen, Titel usw.)
- Verlauf von Likes, Reposts und Kommentaren
- Inhalt von Direktnachrichten (DMs)
- Club-Mitgliedschaftsstatus (Gruppen)
- Spielpunktzahlen und Spielverlauf

### Automatisch erhobene Informationen
- Im lokalen Speicher des Geräts gespeicherte Personalisierungsinformationen für Empfehlungen (diese Informationen werden nur auf dem Gerät gespeichert und niemals an den Server gesendet)

### Über den Gastmodus
Wenn Sie den Dienst als "Gast" ohne Kontoerstellung nutzen, werden keine der oben genannten kontobezogenen Informationen erhoben. Sie können nur den Feed ansehen und Spiele spielen (Posten, Liken und andere Schreibaktionen erfordern eine Kontoregistrierung).

## 2. Verwendungszweck

1. Bereitstellung des Dienstes (Feed-Anzeige, Posten, DMs und andere Funktionen)
2. Verhinderung von unbefugter Nutzung und Missbrauch
3. Sicherheitsprüfungen zum Schutz Minderjähriger (automatische Erkennung gefährlicher Muster in Direktnachrichten; Einzelheiten siehe Artikel 4 der Nutzungsbedingungen)
4. Statistische Analyse zur Verbesserung des Dienstes (in einer Form durchgeführt, die keine Einzelpersonen identifiziert)

## 3. Weitergabe an Dritte und Auslagerung

1. Der Dienst nutzt Supabase (einen Cloud-Dienst eines Drittanbieters) als Backend-Infrastruktur, und die unter 1. beschriebenen Informationen werden auf den Servern von Supabase gespeichert.
2. Außer wenn gesetzlich vorgeschrieben, geben wir erhobene personenbezogene Daten nicht ohne Zustimmung der betroffenen Person an Dritte weiter.

## 4. Aufbewahrungsdauer der Daten

Wir bewahren zugehörige Daten auf, solange das Konto besteht. Wenn Sie Ihr Konto löschen möchten, wenden Sie sich bitte über die Funktion im Dienst (geplant) oder unsere Kontaktadresse an uns.

## 5. Umgang mit Direktnachrichten

Zum Schutz der Sicherheit der Nutzer, einschließlich Minderjähriger, haben wir einen Mechanismus eingeführt, der den Inhalt von Direktnachrichten automatisch auf gefährliche Schlüsselwortmuster überprüft (wie Anfragen nach persönlichen Informationen, Aufforderungen zu einem persönlichen Treffen, Anfragen nach Fotos, Anfragen nach Geld/Geschenken und Sprache, die auf Selbstverletzung hindeutet). Dies ist eine automatisierte Verarbeitung durch das System; der Betreiber liest den Inhalt von DMs unter normalen Umständen nicht manuell.

## 6. Nutzung durch Kinder

Der Dienst steht Kindern ab 4 Jahren zur Verfügung, aber **soziale Funktionen wie Posten, Liken, Direktnachrichten (DMs) und der Beitritt zu Clubs sind auf Nutzer ab 13 Jahren beschränkt.** Nutzer unter 13 Jahren dürfen nur Spiele ansehen und spielen. Diese Altersbeschränkung spiegelt die Grundsätze der Gesetze verschiedener Länder zum Schutz der Online-Privatsphäre von Kindern wider (wie z. B. das US-amerikanische COPPA). Wir empfehlen Eltern, die Nutzung des Dienstes durch ihre Kinder zu überprüfen und zu beaufsichtigen.

## 7. Rechte der Nutzer

Nutzer können die Einsicht, Berichtigung oder Löschung ihrer Registrierungsdaten verlangen. Bitte wenden Sie sich über unsere Kontaktadresse an uns.

## 8. Änderungen dieser Richtlinie

Diese Richtlinie kann bei Bedarf geändert werden. Wesentliche Änderungen werden innerhalb des Dienstes bekannt gegeben.

## 9. Kontakt

Für Fragen zu dieser Richtlinie nutzen Sie bitte die Kontaktfunktion innerhalb des Dienstes (geplant) oder wenden Sie sich an den Betreiber unter der unten stehenden Adresse.

Betreiber: Hoang Gia Bao
Kontakt: nexora26624@gmail.com`,
  },
};
