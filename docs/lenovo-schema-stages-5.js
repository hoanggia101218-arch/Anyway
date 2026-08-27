// トラップ道場 追加ステージ(task79 第7弾、task84品質巡回・第6回)
//
// lenovo-schema-stages.js(第3弾)・-2.js(第4弾)・-3.js(第5弾)・-4.js(第6弾)に続く
// 新規6ステージ。既存4ファイルは検証済みのため触らず、新規分をこの別ファイルに分離した。
//
// 統合方法は従来と同じ: output/index.html で output/trapdojo.js の直後に
// lenovo-schema-stages.js → -2.js → -3.js → -4.js → -5.js の順で<script>読み込みすれば
// window.TrapDojo.registerStages(NEW_STAGES) が自動的に呼ばれる。
//
// 【今回の狙い】easy帯にfaller(降ってくる即死ブロック)がまだ無かったため easy_12 で初導入
// (テレグラフ650msと長めにして易しさを確保)。normal_12では「out-of-phaseの二重vanish」
// (2箇所の消える床が異なるタイミングで開閉し、それぞれ別々に待つ必要がある)を初採用。
// hard_12では fake+vanish+mover(y)+spike+faller の5種同時使用に挑戦し(hard_10の4種から
// さらに1種追加)、上級ステージとして過去最多のハザード種類数を狙った。
(function () {
  function stage(id, difficulty, coop, spawn, goal, platforms, hazards) {
    return { id, difficulty, coop, spawn, goal, platforms, hazards };
  }

  const NEW_STAGES = [
    // --- 初級 (easy) ---
    stage('easy_12', 'easy', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [{ x: 0, y: 230, w: 480, h: 20 }],
      [
        // easy帯初のfaller。テレグラフ650msと長めにして初見でも避けやすくした。
        { type: 'faller', x: 240, y: 25, w: 24, h: 24, cycle: 2400, telegraph: 650, fallDur: 500, restY: 25 },
        { type: 'spike', x: 380, y: 218, w: 22, h: 12 },
      ]),
    stage('easy_13', 'easy', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 170, h: 20 },
        { x: 310, y: 230, w: 170, h: 20 },
      ],
      [
        // coop向け: vanishが実際に隙間を橋渡しする本物の罠(onFrac広め0.75で将棋倒し防止)。
        // 真上にfakeの偽床を浮かべ「vanishを待たず上を通れそうに見える」おとりを配置。
        { type: 'vanish', x: 170, y: 230, w: 140, h: 20, cycle: 1600, onFrac: 0.75, phase: 0 },
        { type: 'fake', x: 170, y: 175, w: 140, h: 14 },
      ]),
    // --- 中級 (normal) ---
    stage('normal_12', 'normal', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 130, h: 20 },
        { x: 210, y: 230, w: 90, h: 20 },
        { x: 370, y: 230, w: 110, h: 20 },
      ],
      [
        // 初採用: 位相をずらした二重vanish(phase半周期分ずらし)。1つ目を待って渡り、
        // 中間の島でspikeを避けつつ2つ目を別タイミングで待つ、という二段構えの罠。
        { type: 'vanish', x: 130, y: 230, w: 80, h: 20, cycle: 1700, onFrac: 0.5, phase: 0 },
        { type: 'vanish', x: 300, y: 230, w: 70, h: 20, cycle: 1700, onFrac: 0.5, phase: 850 },
        { type: 'spike', x: 245, y: 218, w: 20, h: 12 },
      ]),
    stage('normal_13', 'normal', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 140, h: 20 },
        { x: 220, y: 230, w: 100, h: 20 },
        { x: 400, y: 230, w: 80, h: 20 },
      ],
      [
        // coop向け二重vanish(onFrac0.72と広め、位相半周期ずらし)+中間の島にfaller。
        { type: 'vanish', x: 140, y: 230, w: 80, h: 20, cycle: 1500, onFrac: 0.72, phase: 0 },
        { type: 'vanish', x: 320, y: 230, w: 80, h: 20, cycle: 1500, onFrac: 0.72, phase: 750 },
        { type: 'faller', x: 260, y: 28, w: 22, h: 22, cycle: 2200, telegraph: 600, fallDur: 500, restY: 28 },
      ]),
    // --- 上級 (hard) ---
    stage('hard_12', 'hard', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 100, h: 20 },
        { x: 180, y: 230, w: 40, h: 20 },
        { x: 340, y: 230, w: 40, h: 20 },
        { x: 420, y: 230, w: 60, h: 20 },
      ],
      [
        // fake+vanish+mover(y)+spike+faller の5種同時使用(hard_10の4種からさらに1種追加)。
        // 各hazardは島で区切って1つずつ処理できるようにし、複合の同時要求は避けた。
        { type: 'fake', x: 180, y: 175, w: 40, h: 14 },
        // 【task84第8回品質巡回】onFrac0.55→0.62に緩和。ヘッドレス探索が8000試行中4581試行目
        // までクリアルートを発見できず(established heuristic的に5000試行超は要注意水準に近い)
        // margin不足の疑いがあったため、渡り時間を広げて改善。
        { type: 'vanish', x: 100, y: 230, w: 80, h: 20, cycle: 1600, onFrac: 0.62, phase: 0 },
        { type: 'mover', x: 220, y: 205, w: 120, h: 14, axis: 'y', amp: 26, speed: 1.0, baseY: 205, baseX: 220 },
        { type: 'spike', x: 350, y: 218, w: 20, h: 12 },
        { type: 'faller', x: 400, y: 25, w: 24, h: 24, cycle: 2000, telegraph: 500, fallDur: 500, restY: 25 },
      ]),
    stage('hard_13', 'hard', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 130, h: 20 },
        { x: 340, y: 230, w: 140, h: 20 },
      ],
      [
        // coop向け: 大きな一枚のvanish(幅210, onFrac0.8・cycle2400で十分な余裕)+
        // 渡っている最中にspikeを1つ避けつつ、着地点近くにfallerの脅威も別タイミングで配置。
        { type: 'vanish', x: 130, y: 230, w: 210, h: 20, cycle: 2400, onFrac: 0.8, phase: 0 },
        { type: 'spike', x: 225, y: 218, w: 20, h: 12 },
        { type: 'faller', x: 320, y: 25, w: 24, h: 24, cycle: 2200, telegraph: 600, fallDur: 500, restY: 25 },
      ]),
  ];

  if (typeof window !== 'undefined' && window.TrapDojo && typeof window.TrapDojo.registerStages === 'function') {
    window.TrapDojo.registerStages(NEW_STAGES);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NEW_STAGES;
  }
})();
