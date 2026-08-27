// トラップ道場 追加ステージ(task79 第5弾、task84品質巡回・第4回)
//
// lenovo-schema-stages.js(第3弾)・lenovo-schema-stages-2.js(第4弾)に続く新規6ステージ。
// 既存2ファイルは検証済みのため触らず、新規分をこの別ファイルに分離した。
//
// 統合方法は第3・4弾と同じ: output/index.html で output/trapdojo.js の直後に
// lenovo-schema-stages.js → lenovo-schema-stages-2.js → lenovo-schema-stages-3.js
// の順で<script>読み込みすれば window.TrapDojo.registerStages(NEW_STAGES) が自動的に呼ばれる。
//
// 【今回の狙い(task84第4回巡回・不満点への対応)】
// 第3・4弾までは「可動床(mover)は実機確認できないと危険」として意図的に避けていたが、
// output/trapdojo.js自身のLenovo設計オリジナル9ステージ側で既にmoverが使われており
// (normal_2/hard_1/hard_2/hard_3等)、そちらは一貫してALL PASSしている実績がある。
// ヘッドレス探索ハーネスはmoverの位置を時刻から正確に再現できる(movingRect関数が
// output/trapdojo.js内の実装と同一)ため、moverを避け続ける理由は無いと判断し、
// 今回初めてHP追加ステージにもmover型トラップを採用した(バリエーション不足という
// 第2回巡回時点からの継続的な不満点への対応)。
(function () {
  function stage(id, difficulty, coop, spawn, goal, platforms, hazards) {
    return { id, difficulty, coop, spawn, goal, platforms, hazards };
  }

  const NEW_STAGES = [
    // --- 初級 (easy) ---
    stage('easy_8', 'easy', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 150, h: 20 },
        { x: 330, y: 230, w: 150, h: 20 },
      ],
      [
        // moverの初導入。振幅・速度は本体オリジナルhard_1相当(amp28/speed1.4)より
        // 緩め(amp20/speed0.8)にし、初級らしく待てば必ず乗れる余裕を確保。
        { type: 'mover', x: 220, y: 210, w: 60, h: 14, axis: 'y', amp: 20, speed: 0.8, baseY: 210, baseX: 220 },
      ]),
    stage('easy_9', 'easy', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [{ x: 0, y: 230, w: 480, h: 20 }],
      [
        // coop向け: onFrac広め+spike1個のみ。将棋倒し防止のため安全窓を広く。
        { type: 'vanish', x: 200, y: 230, w: 100, h: 20, cycle: 1300, onFrac: 0.75, phase: 0 },
        { type: 'spike', x: 330, y: 218, w: 24, h: 12 },
      ]),
    // --- 中級 (normal) ---
    stage('normal_8', 'normal', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 130, h: 20 },
        { x: 340, y: 230, w: 140, h: 20 },
      ],
      [
        // 当初は横移動moverの上を渡らせる設計だったが、ヘッドレス探索が8000試行でも
        // クリアルートを発見できず(横movingプラットフォームは「乗ったら自動で運ばれる」
        // 縦moverと違い、能動的に速度を合わせ続けないと足場から取り残される=検証なしでは
        // 危険と判断し、vanish+fakeの組み合わせに変更した。
        { type: 'vanish', x: 130, y: 230, w: 100, h: 20, cycle: 1700, onFrac: 0.5, phase: 0 },
        { type: 'fake', x: 250, y: 200, w: 50, h: 14 },
        { type: 'spike', x: 300, y: 218, w: 22, h: 12 },
      ]),
    stage('normal_9', 'normal', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [{ x: 0, y: 230, w: 480, h: 20 }],
      [
        // coop向け: fallerのtelegraphを長め(550ms)にし予兆を見て回避しやすくした。
        { type: 'faller', x: 200, y: 30, w: 24, h: 24, cycle: 2400, telegraph: 550, fallDur: 550, restY: 30 },
        { type: 'spike', x: 300, y: 218, w: 24, h: 12 },
        { type: 'spike', x: 380, y: 218, w: 24, h: 12 },
      ]),
    // --- 上級 (hard) ---
    stage('hard_8', 'hard', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 110, h: 20 },
        { x: 380, y: 230, w: 100, h: 20 },
      ],
      [
        // mover(縦)+vanish+spikeの複合ギミック。上級らしく渡り幅は広め(270px)。
        { type: 'mover', x: 200, y: 205, w: 50, h: 14, axis: 'y', amp: 32, speed: 1.2, baseY: 205, baseX: 200 },
        { type: 'vanish', x: 300, y: 230, w: 80, h: 20, cycle: 1600, onFrac: 0.55, phase: 0 },
        { type: 'spike', x: 260, y: 193, w: 22, h: 12 },
      ]),
    stage('hard_9', 'hard', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [{ x: 0, y: 230, w: 480, h: 20 }],
      [
        // 当初は横移動moverを含む設計だったがnormal_8と同じ理由(能動的な速度同期が
        // 必要で無検証では危険)でヘッドレス探索がクリアルートを発見できず、
        // hard_6/hard_4で確立した「coop向けは安全窓を広く」の知見に沿って
        // vanish+faller+spikeの組み合わせ(onFrac・telegraphともに広め)に変更した。
        { type: 'vanish', x: 150, y: 230, w: 100, h: 20, cycle: 1500, onFrac: 0.75, phase: 0 },
        { type: 'faller', x: 330, y: 30, w: 22, h: 22, cycle: 2200, telegraph: 550, fallDur: 500, restY: 30 },
        { type: 'spike', x: 260, y: 218, w: 22, h: 12 },
      ]),
  ];

  if (typeof window !== 'undefined' && window.TrapDojo && typeof window.TrapDojo.registerStages === 'function') {
    window.TrapDojo.registerStages(NEW_STAGES);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NEW_STAGES;
  }
})();
