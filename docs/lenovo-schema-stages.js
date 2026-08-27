// トラップ道場 追加ステージ(task79 第3弾、task84品質巡回)
//
// output/trapdojo.js (Lenovo/PC-D実装、task80)が実際に使っているstageスキーマに
// 合わせて用意した追加ステージ。前回セッション(README.md参照)で判明した通り、
// このフォルダの旧stages.js(19ステージ)はLenovo実装と非互換なスキーマだったため、
// 今後の追加分はすべてこのファイルのように Lenovo と全く同じ stage() ファクトリ・
// hazards[].type語彙(spike/vanish/mover/fake/faller)で作成する。
//
// 統合方法: output/index.html で output/trapdojo.js の直後にこのファイルを
// <script src="...lenovo-schema-stages.js?v=1"></script> として読み込めば、
// window.TrapDojo.registerStages(NEW_STAGES) が自動的に呼ばれ STAGE_LIST に追加される
// (Node/自己テストからは module.exports 経由で配列そのものを取得できる)。
//
// 【設計方針・意図的な保守性】どのステージも「ジャンプで渡り切れない隙間」を作らず、
// 床は基本的に連続または短いvanishギャップのみ(可動床(mover)に乗り移らないと渡れない
// 隙間は今回は採用していない)。理由: このセッションはBrowser paneでの実機プレイテストが
// できない無人実行環境のため、ジャンプ着地のタイミング精度に依存する設計は「詰み」を
// 見逃すリスクが高いと判断した。vanish/fallerは「待てば必ず安全な窓がある」周期構造なので、
// ヘッドレスの自動探索(lenovo-schema-stages-selftest.js、ランダムな待機+ジャンプの
// 組み合わせを数千通り試す)で実際にクリア可能であることを機械的に証明できる。
(function () {
  function stage(id, difficulty, coop, spawn, goal, platforms, hazards) {
    return { id, difficulty, coop, spawn, goal, platforms, hazards };
  }

  const NEW_STAGES = [
    // --- 初級 (easy) ---
    stage('easy_4', 'easy', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [{ x: 0, y: 230, w: 480, h: 20 }],
      [
        { type: 'spike', x: 140, y: 218, w: 28, h: 12 },
        { type: 'spike', x: 260, y: 218, w: 28, h: 12 },
        { type: 'spike', x: 360, y: 218, w: 28, h: 12 },
      ]),
    stage('easy_5', 'easy', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 170, h: 20 },
        { x: 330, y: 230, w: 150, h: 20 },
      ],
      [
        { type: 'vanish', x: 170, y: 230, w: 160, h: 20, cycle: 2000, onFrac: 0.6, phase: 0 },
        { type: 'fake', x: 40, y: 160, w: 70, h: 14 },
      ]),
    // --- 中級 (normal) ---
    stage('normal_4', 'normal', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 160, h: 20 },
        { x: 340, y: 230, w: 140, h: 20 },
      ],
      [
        { type: 'vanish', x: 160, y: 230, w: 180, h: 20, cycle: 2200, onFrac: 0.6, phase: 0 },
        { type: 'spike', x: 370, y: 218, w: 26, h: 12 },
      ]),
    stage('normal_5', 'normal', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [{ x: 0, y: 230, w: 480, h: 20 }],
      [
        { type: 'faller', x: 180, y: 30, w: 24, h: 24, cycle: 2400, telegraph: 500, fallDur: 650, restY: 30 },
        { type: 'spike', x: 340, y: 218, w: 28, h: 12 },
      ]),
    // --- 上級 (hard) ---
    stage('hard_4', 'hard', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [{ x: 0, y: 230, w: 480, h: 20 }],
      [
        { type: 'fake', x: 60, y: 160, w: 60, h: 14 },
        { type: 'faller', x: 220, y: 25, w: 22, h: 22, cycle: 2100, telegraph: 450, fallDur: 600, restY: 25 },
        { type: 'spike', x: 330, y: 218, w: 26, h: 12 },
        { type: 'spike', x: 400, y: 218, w: 26, h: 12 },
      ]),
    stage('hard_5', 'hard', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 150, h: 20 },
        { x: 270, y: 230, w: 210, h: 20 },
      ],
      [
        // 渡り幅120px・onFrac0.65(cycle1700→on約1105ms)なら全力疾走(120px≒827ms)で
        // 十分渡り切れる安全マージンを確保できる(自己テストで計算検証済み)。
        { type: 'vanish', x: 150, y: 230, w: 120, h: 20, cycle: 1700, onFrac: 0.65, phase: 0 },
        // fallerはcycleをvanishとずらす(1300ms)ことで、両者の危険/安全窓の位相が
        // 固定でぶつかり続けないようにしてある(待てば必ず両方安全な瞬間が来る)。
        { type: 'faller', x: 200, y: 20, w: 22, h: 22, cycle: 1300, telegraph: 350, fallDur: 500, restY: 20 },
        { type: 'spike', x: 370, y: 218, w: 26, h: 12 },
      ]),
  ];

  if (typeof window !== 'undefined' && window.TrapDojo && typeof window.TrapDojo.registerStages === 'function') {
    window.TrapDojo.registerStages(NEW_STAGES);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NEW_STAGES;
  }
})();
