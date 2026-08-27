// トラップ道場 追加ステージ(task79 第9弾、task84品質巡回・第8回)
//
// lenovo-schema-stages.js(第3弾)〜-6.js(第8弾)に続く新規6ステージ。
// 既存6ファイルは検証済みのため触らず、新規分をこの別ファイルに分離した(従来と同じ方針)。
//
// 統合方法は従来と同じ: output/index.html で output/trapdojo.js の直後に
// lenovo-schema-stages.js → -2.js → ... → -6.js → -7.js の順で<script>読み込みすれば
// window.TrapDojo.registerStages(NEW_STAGES) が自動的に呼ばれる。
//
// 【今回の狙い】mover(axis:'x'、横移動プラットフォーム)をHP追加ステージで初採用
// (easy_16/hard_16)。過去の巡回で「横moverは受動的に乗れない(能動的な追従移動が必要、
// 縦のように重力の毎フレーム再計算では乗れない)」という物理知見を得ていたため、
// 「乗って運ばれる」設計ではなく「渡り幅がmoverの振動で一時的に橋渡しされる/されない、
// というvanishに似たタイミング窓」として設計した(mover自体の上に留まり続ける必要はなく、
// 橋になっている瞬間に走り抜けるだけで渡り切れる構成)。
(function () {
  function stage(id, difficulty, coop, spawn, goal, platforms, hazards) {
    return { id, difficulty, coop, spawn, goal, platforms, hazards };
  }

  const NEW_STAGES = [
    // --- 初級 (easy) ---
    stage('easy_16', 'easy', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 190, h: 20 },
        { x: 340, y: 230, w: 140, h: 20 },
      ],
      [
        // easy帯初のmover(axis:'x')。左振れ時(x=190)に足場端と密着しほぼ橋渡し、
        // 右振れ時(x=300)は左側に110px空いて渡れない=「橋になる瞬間を待つ」だけの
        // シンプルなタイミング課題(乗って運ばれる必要はない)。
        { type: 'mover', x: 245, y: 230, w: 110, h: 14, axis: 'x', amp: 55, speed: 0.7, baseX: 190, baseY: 230 },
      ]),
    stage('easy_17', 'easy', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 200, h: 20 },
        { x: 280, y: 230, w: 200, h: 20 },
      ],
      [
        // coop向け: onFrac0.7と広めのvanishで4人同時でも将棋倒ししにくいバランス。
        // 真上にfakeの偽床を浮かべ「vanishを待たず上を通れそうに見える」おとりを配置(easy_13と同系統)。
        { type: 'vanish', x: 200, y: 230, w: 80, h: 20, cycle: 1500, onFrac: 0.7, phase: 0 },
        { type: 'fake', x: 200, y: 175, w: 80, h: 14 },
      ]),
    // --- 中級 (normal) ---
    stage('normal_16', 'normal', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 110, h: 20 },
        { x: 260, y: 230, w: 90, h: 20 },
        { x: 420, y: 230, w: 60, h: 20 },
      ],
      [
        // 初採用の組み合わせ: mover(x)で最初の隙間を渡り、中間の島でfallerの警戒(テレグラフ550ms)、
        // 最後の小さい隙間はspikeを避けるジャンプ。各ハザードを島で区切り複合の同時要求は避けた。
        { type: 'mover', x: 185, y: 230, w: 130, h: 14, axis: 'x', amp: 75, speed: 0.75, baseX: 110, baseY: 230 },
        { type: 'faller', x: 290, y: 25, w: 22, h: 22, cycle: 2000, telegraph: 550, fallDur: 500, restY: 25 },
        { type: 'spike', x: 360, y: 218, w: 20, h: 12 },
      ]),
    stage('normal_17', 'normal', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 120, h: 20 },
        { x: 200, y: 230, w: 100, h: 20 },
        { x: 400, y: 230, w: 80, h: 20 },
      ],
      [
        // coop向け二重vanish(位相半周期ずらし、onFrac0.72広め)+中間の島にfaller(長めテレグラフ)。
        { type: 'vanish', x: 120, y: 230, w: 80, h: 20, cycle: 1500, onFrac: 0.72, phase: 0 },
        { type: 'vanish', x: 300, y: 230, w: 100, h: 20, cycle: 1500, onFrac: 0.72, phase: 750 },
        { type: 'faller', x: 250, y: 28, w: 22, h: 22, cycle: 2400, telegraph: 600, fallDur: 500, restY: 28 },
      ]),
    // --- 上級 (hard) ---
    stage('hard_16', 'hard', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 90, h: 20 },
        { x: 170, y: 230, w: 40, h: 20 },
        { x: 330, y: 230, w: 40, h: 20 },
        { x: 420, y: 230, w: 60, h: 20 },
      ],
      [
        // fake+mover(x)+faller+spike の4種同時使用(hard_12の5種からmover/faller比重を変えた別パターン)。
        // 各hazardは島で区切って1つずつ処理できるようにし、複合の同時要求は避けた。
        // 1つ目の隙間: 上空にfakeの偽の近道(踏むと落下)、実際の渡り方はその下のmover(x)。
        { type: 'fake', x: 90, y: 175, w: 80, h: 14 },
        { type: 'mover', x: 130, y: 230, w: 95, h: 14, axis: 'x', amp: 45, speed: 0.8, baseX: 85, baseY: 230 },
        { type: 'faller', x: 185, y: 25, w: 22, h: 22, cycle: 2000, telegraph: 550, fallDur: 500, restY: 25 },
        { type: 'spike', x: 390, y: 218, w: 20, h: 12 },
      ]),
    stage('hard_17', 'hard', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 120, h: 20 },
        { x: 340, y: 230, w: 140, h: 20 },
      ],
      [
        // coop向け: 大きな一枚のvanish(幅220, onFrac0.8・cycle2600で十分な余裕、hard_13と同系統の
        // 実績あるパラメータ帯)+渡っている最中にspikeを1つ避けつつ、着地点近くにfallerの脅威も別タイミングで配置。
        { type: 'vanish', x: 120, y: 230, w: 220, h: 20, cycle: 2600, onFrac: 0.8, phase: 0 },
        { type: 'spike', x: 220, y: 218, w: 20, h: 12 },
        { type: 'faller', x: 300, y: 25, w: 24, h: 24, cycle: 2400, telegraph: 650, fallDur: 500, restY: 25 },
      ]),
  ];

  if (typeof window !== 'undefined' && window.TrapDojo && typeof window.TrapDojo.registerStages === 'function') {
    window.TrapDojo.registerStages(NEW_STAGES);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NEW_STAGES;
  }
})();
