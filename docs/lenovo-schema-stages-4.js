// トラップ道場 追加ステージ(task79 第6弾、task84品質巡回・第5回)
//
// lenovo-schema-stages.js(第3弾)・-2.js(第4弾)・-3.js(第5弾)に続く新規6ステージ。
// 既存3ファイルは検証済みのため触らず、新規分をこの別ファイルに分離した。
//
// 統合方法は第3〜5弾と同じ: output/index.html で output/trapdojo.js の直後に
// lenovo-schema-stages.js → -2.js → -3.js → -4.js の順で<script>読み込みすれば
// window.TrapDojo.registerStages(NEW_STAGES) が自動的に呼ばれる。
//
// 【今回の狙い】easy帯にまだ'fake'(偽の床)を使ったステージが無かった(easy_5のfakeは
// 通り道から外れた「使わなくてもクリアできる」おまけ配置のみ)ため、easy_10で
// 「ゴールへの近道に見えるがフェイクで踏み抜く」という素直なひっかけを初導入。
// また hard帯はここまで基本的にhazard3個構成が中心だったため、hard_10で
// fake+vanish+mover(y)+spikeの4種同時使用に挑戦し、上級らしい情報量の多さを狙った。
(function () {
  function stage(id, difficulty, coop, spawn, goal, platforms, hazards) {
    return { id, difficulty, coop, spawn, goal, platforms, hazards };
  }

  const NEW_STAGES = [
    // --- 初級 (easy) ---
    stage('easy_10', 'easy', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [{ x: 0, y: 230, w: 480, h: 20 }],
      [
        // 地上の隙間は無く常に安全な地続き床。真上に「近道っぽい」fakeを浮かべ、
        // 踏むと踏み抜くだけの寄り道トラップ(通らなくてもゴールできる=詰み無し)。
        { type: 'fake', x: 190, y: 175, w: 90, h: 14 },
        { type: 'spike', x: 120, y: 218, w: 26, h: 12 },
        { type: 'spike', x: 330, y: 218, w: 26, h: 12 },
      ]),
    stage('easy_11', 'easy', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [{ x: 0, y: 230, w: 480, h: 20 }],
      [
        // coop向け: onFrac広め(0.7)の単一vanishのみ+spike1個。将棋倒し防止で安全窓を広く。
        { type: 'vanish', x: 210, y: 230, w: 90, h: 20, cycle: 1400, onFrac: 0.7, phase: 0 },
        { type: 'spike', x: 350, y: 218, w: 24, h: 12 },
      ]),
    // --- 中級 (normal) ---
    stage('normal_10', 'normal', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 120, h: 20 },
        { x: 370, y: 230, w: 110, h: 20 },
      ],
      [
        // vanish床を渡った先にmover(縦)、着地前にspikeという3段構成だが、
        // 各hazardの間に素のジャンプで渡れる余白を挟み「同時に2つのタイミングを
        // 合わせないと詰む」状態を避けた(初版はspikeがmover着地直後に食い込み
        // 5598/8000試行でしかクリアルートが見つからず詰みに近かったため調整)。
        { type: 'vanish', x: 120, y: 230, w: 100, h: 20, cycle: 1800, onFrac: 0.55, phase: 0 },
        { type: 'mover', x: 260, y: 205, w: 50, h: 14, axis: 'y', amp: 24, speed: 0.9, baseY: 205, baseX: 260 },
        { type: 'spike', x: 330, y: 218, w: 20, h: 12 },
      ]),
    stage('normal_11', 'normal', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [{ x: 0, y: 230, w: 480, h: 20 }],
      [
        // fallerを2体、位相をずらして連続配置(coop向けにtelegraph長め550ms)。
        { type: 'faller', x: 180, y: 30, w: 24, h: 24, cycle: 2200, telegraph: 550, fallDur: 550, restY: 30 },
        { type: 'faller', x: 320, y: 30, w: 24, h: 24, cycle: 2200, telegraph: 550, fallDur: 550, restY: 30, phase: 1100 },
      ]),
    // --- 上級 (hard) ---
    stage('hard_10', 'hard', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 110, h: 20 },
        // 中間の小島で一息つかせ、vanishとmoverを「同時に」処理させない
        // (最初のバージョンは4種のhazardを連続タイミング要求で詰め込みすぎて
        // ヘッドレス探索8000試行でクリアルートが見つからず、詰みの疑いが強かったため
        // 島を挟んで一つずつ処理できるよう再設計した)。
        { x: 250, y: 230, w: 40, h: 20 },
        { x: 410, y: 230, w: 70, h: 20 },
      ],
      [
        // fakeは通らなくてもクリアできる寄り道おとり(hard_4/easy_10と同じ考え方)。
        { type: 'fake', x: 110, y: 195, w: 60, h: 14 },
        { type: 'vanish', x: 110, y: 230, w: 140, h: 20, cycle: 1600, onFrac: 0.6, phase: 0 },
        { type: 'mover', x: 330, y: 205, w: 50, h: 14, axis: 'y', amp: 26, speed: 1.0, baseY: 205, baseX: 330 },
        { type: 'spike', x: 410, y: 218, w: 20, h: 12 },
      ]),
    stage('hard_11', 'hard', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [{ x: 0, y: 230, w: 480, h: 20 }],
      [
        // coop向け: 横movingは今回も不採用(過去2回の検証で能動追従が必須と判明済み)。
        // vanish(広め窓)+faller+faller+spikeの縦方向のみの組み合わせで複雑度を確保。
        { type: 'vanish', x: 140, y: 230, w: 90, h: 20, cycle: 1500, onFrac: 0.7, phase: 0 },
        { type: 'faller', x: 260, y: 25, w: 22, h: 22, cycle: 2000, telegraph: 500, fallDur: 500, restY: 25 },
        { type: 'spike', x: 350, y: 218, w: 24, h: 12 },
      ]),
  ];

  if (typeof window !== 'undefined' && window.TrapDojo && typeof window.TrapDojo.registerStages === 'function') {
    window.TrapDojo.registerStages(NEW_STAGES);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NEW_STAGES;
  }
})();
