// トラップ道場 追加ステージ(task79 第10弾、task84品質巡回・第9回)
//
// lenovo-schema-stages.js(第3弾)〜-7.js(第9弾)に続く新規9ステージ。
// 51/60 → 60/60 で目標達成のため、今回は通常の6ステージではなく9ステージ
// (easy/normal/hard 各3)を一度に追加する。
//
// 統合方法は従来と同じ: output/index.html で output/trapdojo.js の直後に
// lenovo-schema-stages.js → -2.js → ... → -7.js → -8.js の順で<script>読み込みすれば
// window.TrapDojo.registerStages(NEW_STAGES) が自動的に呼ばれる。
//
// 【今回の狙い】coop:trueを4個・coop:falseを5個にし、累計coop30/solo30の
// ちょうど半々バランスに揃えた(第9弾時点でcoop26/solo25)。9個一気に追加という
// 分量上、設計は冒険を避け、縦mover(受動的に乗れる=安全)と、実績のあるvanish/
// faller/spikeのパラメータ帯(onFrac/telegraph)を極力再利用して詰みリスクを抑えた。
// 初版では横mover(x)を1ステージ(hard_18)で試したが、着地島が狭すぎ+次の隙間が
// ジャンプ不可能な広さになる構造的な詰みをヘッドレス検証で検出したため、
// 実績あるvanish+spikeの組み合わせに設計変更した(このファイルには横mover未採用)。
(function () {
  function stage(id, difficulty, coop, spawn, goal, platforms, hazards) {
    return { id, difficulty, coop, spawn, goal, platforms, hazards };
  }

  const NEW_STAGES = [
    // --- 初級 (easy) ---
    stage('easy_18', 'easy', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 200, h: 20 },
        { x: 340, y: 230, w: 140, h: 20 },
      ],
      [
        // easy_4/5と同系統の実績あるvanishパラメータ(onFrac0.65寄り)を踏襲。単純な待って渡る型。
        { type: 'vanish', x: 200, y: 230, w: 140, h: 20, cycle: 1600, onFrac: 0.68, phase: 0 },
      ]),
    stage('easy_19', 'easy', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 160, h: 20 },
        { x: 230, y: 230, w: 100, h: 20 },
        { x: 400, y: 230, w: 80, h: 20 },
      ],
      [
        // coop向け: 2つの単純ジャンプ(各70px、最大ジャンプ距離約104pxに十分な余裕)+
        // 中間の島にspikeのみのシンプル構成。faller等の複合要求は避け、4人同時でも事故りにくくした。
        { type: 'spike', x: 265, y: 218, w: 20, h: 12 },
      ]),
    stage('easy_20', 'easy', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 200, h: 20 },
        { x: 340, y: 230, w: 140, h: 20 },
      ],
      [
        // easy_02_fake_floor_lookalike系の発想: 見た目の近道(fake)は踏むと落ちる、
        // 本命はその下のvanish(easy_18/easy_4/5と同じ実績あるonFrac0.68帯)を待って渡る。
        { type: 'fake', x: 220, y: 175, w: 100, h: 14 },
        { type: 'vanish', x: 200, y: 230, w: 140, h: 20, cycle: 1600, onFrac: 0.68, phase: 0 },
      ]),
    // --- 中級 (normal) ---
    stage('normal_18', 'normal', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 120, h: 20 },
        { x: 380, y: 230, w: 100, h: 20 },
      ],
      [
        // 縦mover(axis:'y')は毎フレームの重力再計算で自然に乗れる=coop向けでも安全な部類。
        // hard_10/12で実績のあるamp/speed帯をそのまま踏襲。
        { type: 'mover', x: 220, y: 230, w: 100, h: 14, axis: 'y', amp: 35, speed: 0.6, baseX: 220, baseY: 230 },
        { type: 'spike', x: 150, y: 218, w: 20, h: 12 },
      ]),
    stage('normal_19', 'normal', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 100, h: 20 },
        { x: 250, y: 230, w: 90, h: 20 },
        { x: 410, y: 230, w: 70, h: 20 },
      ],
      [
        // 3島構成、各ハザードを島で区切って1つずつ処理(hard_16と同じ思想)。
        { type: 'vanish', x: 100, y: 230, w: 150, h: 20, cycle: 1500, onFrac: 0.68, phase: 0 },
        { type: 'faller', x: 290, y: 26, w: 22, h: 22, cycle: 2000, telegraph: 560, fallDur: 500, restY: 26 },
        { type: 'spike', x: 350, y: 218, w: 20, h: 12 },
      ]),
    stage('normal_20', 'normal', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 130, h: 20 },
        { x: 210, y: 230, w: 90, h: 20 },
        { x: 400, y: 230, w: 80, h: 20 },
      ],
      [
        // coop向け二重vanish(位相ずらし、onFrac0.72広め)。normal_17と同系統の実績あるパターン。
        { type: 'vanish', x: 130, y: 230, w: 80, h: 20, cycle: 1500, onFrac: 0.72, phase: 0 },
        { type: 'vanish', x: 300, y: 230, w: 100, h: 20, cycle: 1500, onFrac: 0.72, phase: 750 },
      ]),
    // --- 上級 (hard) ---
    stage('hard_18', 'hard', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 100, h: 20 },
        { x: 250, y: 230, w: 90, h: 20 },
        { x: 420, y: 230, w: 60, h: 20 },
      ],
      [
        // vanish(100〜250の隙間、normal_19と同系統だがonFrac0.62とやや厳しめ)で渡り、
        // 90幅の島でspikeを跳び越え、最後は単純ジャンプ(80px、余裕あり)で着地。
        // fallerは最終着地帯の上空に配置し、着地後の油断を突くタイミング要素にした。
        { type: 'vanish', x: 100, y: 230, w: 150, h: 20, cycle: 1600, onFrac: 0.62, phase: 0 },
        { type: 'spike', x: 280, y: 218, w: 20, h: 12 },
        { type: 'faller', x: 440, y: 24, w: 22, h: 22, cycle: 1900, telegraph: 500, fallDur: 480, restY: 24 },
      ]),
    stage('hard_19', 'hard', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 110, h: 20 },
        { x: 350, y: 230, w: 130, h: 20 },
      ],
      [
        // coop向け: hard_13/17と同系統の広い一枚vanish(onFrac0.8・cycle2600、実績十分)+spike1個のみ。
        // 4人同時プレイでも将棋倒ししにくいよう意図的にシンプルに保った。
        { type: 'vanish', x: 110, y: 230, w: 240, h: 20, cycle: 2600, onFrac: 0.8, phase: 0 },
        { type: 'spike', x: 210, y: 218, w: 20, h: 12 },
      ]),
    stage('hard_20', 'hard', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 80, h: 20 },
        { x: 160, y: 230, w: 40, h: 20 },
        { x: 320, y: 230, w: 40, h: 20 },
        { x: 420, y: 230, w: 60, h: 20 },
      ],
      [
        // これまでで最多構成の一つ: fake(偽の近道)+縦mover(passive)+faller+spikeの4種、
        // ただしhard_12の教訓どおり各hazardは島で区切り同時要求を避けた「一つずつ確実に処理」型。
        { type: 'fake', x: 80, y: 175, w: 80, h: 14 },
        { type: 'mover', x: 100, y: 230, w: 70, h: 14, axis: 'y', amp: 30, speed: 0.65, baseX: 100, baseY: 230 },
        { type: 'faller', x: 230, y: 26, w: 22, h: 22, cycle: 2000, telegraph: 580, fallDur: 500, restY: 26 },
        { type: 'spike', x: 390, y: 218, w: 20, h: 12 },
      ]),
  ];

  if (typeof window !== 'undefined' && window.TrapDojo && typeof window.TrapDojo.registerStages === 'function') {
    window.TrapDojo.registerStages(NEW_STAGES);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NEW_STAGES;
  }
})();
