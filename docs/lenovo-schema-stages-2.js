// トラップ道場 追加ステージ(task79 第4弾、task84品質巡回・第3回)
//
// lenovo-schema-stages.js(第3弾、easy_4/5・normal_4/5・hard_4/5)に続く追加6ステージ。
// 既存ファイルは既にヘッドレス検証済みのため触らず、新規分をこの別ファイルに分離した
// (第3弾の資産に誤って回帰を混ぜないため)。
//
// 統合方法は第3弾と同じ: output/index.html で output/trapdojo.js の直後に
// lenovo-schema-stages.js → lenovo-schema-stages-2.js の順で<script>読み込みすれば
// window.TrapDojo.registerStages(NEW_STAGES) が自動的に呼ばれる。
//
// 【今回の品質改善方針(task84 第3回巡回で見つけた不満点への対応)】
// 第2回巡回時点のcoop向けステージ(easy_4/normal_4/hard_4)を見直したところ、
// vanish/faller/spikeの安全窓とプレイヤーの反応時間の余裕が「ソロ想定」の値のままだった。
// 4人が同時に同じ画面で独立にタイミングを取る協力プレイでは、1人がミスして焦る→
// 他の3人もつられて焦る、という将棋倒しが起きやすいと判断し、今回新規追加する
// coop:trueのステージ(easy_6/normal_6/hard_6)は意図的に安全窓を広め(onFracを高め、
// telegraphを長めに)に調整し、体感の理不尽さを減らす方向に振った。
// coop:falseのソロ向け(easy_7/normal_7/hard_7)は引き続きシビアな精度を要求してよい
// (Level Devil着想の核である「意地悪な引っかけ」を薄めすぎない)。
(function () {
  function stage(id, difficulty, coop, spawn, goal, platforms, hazards) {
    return { id, difficulty, coop, spawn, goal, platforms, hazards };
  }

  const NEW_STAGES = [
    // --- 初級 (easy) ---
    stage('easy_6', 'easy', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 180, h: 20 },
        { x: 300, y: 230, w: 180, h: 20 },
      ],
      [
        // coop向け: onFrac高め(0.7)+cycle短めで待ち時間を短くし、複数人が
        // 詰まって将棋倒しになりにくいよう安全窓を広く取った。
        { type: 'vanish', x: 180, y: 230, w: 120, h: 20, cycle: 1400, onFrac: 0.7, phase: 0 },
        { type: 'spike', x: 240, y: 218, w: 26, h: 12 },
      ]),
    stage('easy_7', 'easy', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [{ x: 0, y: 230, w: 480, h: 20 }],
      [
        { type: 'fake', x: 90, y: 160, w: 60, h: 14 },
        { type: 'spike', x: 200, y: 218, w: 26, h: 12 },
        { type: 'spike', x: 320, y: 218, w: 26, h: 12 },
      ]),
    // --- 中級 (normal) ---
    stage('normal_6', 'normal', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [{ x: 0, y: 230, w: 480, h: 20 }],
      [
        // coop向け: telegraphを長め(600ms)にし、落下前の予兆を見て回避しやすくした。
        { type: 'faller', x: 180, y: 30, w: 24, h: 24, cycle: 2600, telegraph: 600, fallDur: 600, restY: 30 },
        { type: 'faller', x: 320, y: 30, w: 24, h: 24, cycle: 2600, telegraph: 600, fallDur: 600, restY: 30, phase: 1300 },
        { type: 'spike', x: 250, y: 218, w: 26, h: 12 },
      ]),
    stage('normal_7', 'normal', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 140, h: 20 },
        { x: 320, y: 230, w: 160, h: 20 },
      ],
      [
        { type: 'vanish', x: 140, y: 230, w: 180, h: 20, cycle: 1900, onFrac: 0.5, phase: 0 },
        { type: 'faller', x: 380, y: 30, w: 22, h: 22, cycle: 2000, telegraph: 450, fallDur: 550, restY: 30 },
      ]),
    // --- 上級 (hard) ---
    stage('hard_6', 'hard', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 150, h: 20 },
        { x: 260, y: 230, w: 220, h: 20 },
      ],
      [
        // coopでも上級らしい歯応えは残しつつ、onFracをsolo版のhard_5(0.65)よりさらに
        // 広く(0.8)取り「4人が多少バラバラのタイミングで来ても渡り切れる」余裕を確保。
        // (当初onFrac0.72・spike2個で組んだが、ヘッドレス探索が4000試行中3083試行目まで
        // 見つからず=margin不足の疑いがあったため、onFrac0.8・spike1個に緩めて再検証した)
        { type: 'vanish', x: 150, y: 230, w: 110, h: 20, cycle: 1400, onFrac: 0.8, phase: 0 },
        { type: 'spike', x: 340, y: 218, w: 26, h: 12 },
      ]),
    stage('hard_7', 'hard', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [{ x: 0, y: 230, w: 480, h: 20 }],
      [
        { type: 'fake', x: 70, y: 160, w: 60, h: 14 },
        { type: 'spike', x: 170, y: 218, w: 24, h: 12 },
        { type: 'faller', x: 250, y: 25, w: 22, h: 22, cycle: 1900, telegraph: 380, fallDur: 520, restY: 25 },
        { type: 'spike', x: 340, y: 218, w: 24, h: 12 },
        { type: 'spike', x: 410, y: 218, w: 24, h: 12 },
      ]),
  ];

  if (typeof window !== 'undefined' && window.TrapDojo && typeof window.TrapDojo.registerStages === 'function') {
    window.TrapDojo.registerStages(NEW_STAGES);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NEW_STAGES;
  }
})();
