// トラップ道場 追加ステージ(task79 第8弾、task84品質巡回・第7回)
//
// lenovo-schema-stages.js(第3弾)・-2.js(第4弾)・-3.js(第5弾)・-4.js(第6弾)・-5.js(第7弾)に続く
// 新規6ステージ。既存5ファイル(39ステージ)は検証済みのため触らず、新規分をこの別ファイルに分離した。
//
// 統合方法は従来と同じ: output/index.html で output/trapdojo.js の直後に
// lenovo-schema-stages.js → -2.js → -3.js → -4.js → -5.js → -6.js の順で<script>読み込みすれば
// window.TrapDojo.registerStages(NEW_STAGES) が自動的に呼ばれる。
//
// 【今回の狙い】easy_14で「三重vanish(位相を1/3周期ずつずらす)」を初採用しリズムゲー的な
// 要素を加えた。normal_15では二重faller(異なるcycleで非同期に降る2体)を初採用。
// hard_14/hard_15は過去(hard_10/12)で「複合ハザードは島で区切り一度に1つずつ処理させる」
// という知見を踏襲しつつ、fake+vanish+faller+spikeの4種構成で作り込んだ。
(function () {
  function stage(id, difficulty, coop, spawn, goal, platforms, hazards) {
    return { id, difficulty, coop, spawn, goal, platforms, hazards };
  }

  const NEW_STAGES = [
    // --- 初級 (easy) ---
    stage('easy_14', 'easy', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 90, h: 20 },
        { x: 390, y: 230, w: 90, h: 20 },
      ],
      [
        // 初採用: 三重vanish(位相を1/3周期ずつずらして順番に渡る必要がある)。
        // onFrac0.6・cycle1500とやや長めにして初見でもリズムを掴みやすくした。
        { type: 'vanish', x: 90, y: 230, w: 100, h: 20, cycle: 1500, onFrac: 0.6, phase: 0 },
        { type: 'vanish', x: 190, y: 230, w: 100, h: 20, cycle: 1500, onFrac: 0.6, phase: 500 },
        { type: 'vanish', x: 290, y: 230, w: 100, h: 20, cycle: 1500, onFrac: 0.6, phase: 1000 },
      ]),
    stage('easy_15', 'easy', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [{ x: 0, y: 230, w: 480, h: 20 }],
      [
        // coop向け: 単純なfaller1体+spike1個。coopの導入用に易しめに調整(テレグラフ700ms)。
        { type: 'faller', x: 220, y: 25, w: 24, h: 24, cycle: 2600, telegraph: 700, fallDur: 500, restY: 25 },
        { type: 'spike', x: 350, y: 218, w: 22, h: 12 },
      ]),
    // --- 中級 (normal) ---
    stage('normal_14', 'normal', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 150, h: 20 },
        { x: 330, y: 230, w: 150, h: 20 },
      ],
      [
        // vanish(待って渡る型、cycle1600・onFrac0.55)+spike。
        // 修正(3回目): 縦movingプラットフォーム(axis:'y')を着地先に使う設計を
        // 2回試したが、いずれもヘッドレス検証で詰みを検出した。原因を追跡した結果、
        // 「プレイヤーがmoverの正弦波ピーク付近で着地して静止すると、次フレームで
        // 浮動小数点誤差による極小(1px未満)の垂直めり込みが横方向衝突として誤判定され、
        // 大きく後方に弾き飛ばされる」というoutput/trapdojo.js本体と共通の物理エンジンの
        // 境界条件バグを発見した(mover上で静止する設計全般に影響する可能性がある、
        // 詳細はREADME.mdに記録)。本ステージはengine側を触らず設計側で回避するため、
        // 実績のあるvanish(静止せず通過するだけの床)に差し替えて安全側に倒した。
        { type: 'vanish', x: 150, y: 230, w: 180, h: 20, cycle: 1600, onFrac: 0.55, phase: 0 },
        { type: 'spike', x: 220, y: 218, w: 20, h: 12 },
      ]),
    stage('normal_15', 'normal', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 130, h: 20 },
        { x: 215, y: 230, w: 90, h: 20 },
        { x: 390, y: 230, w: 90, h: 20 },
      ],
      [
        // 初採用: 非同期の二重faller(cycleを1900msと2300msにずらし、常に同じ場所に
        // 同時に降ってこないようにした)。coop向けにtelegraphは600msと余裕を持たせた。
        // 修正: 初版は足場を2枚・間隔180pxにしたため物理的にジャンプ不可能だった
        // (ヘッドレス検証で発見)。中間に足場を追加し85px間隔×2の橋渡しに変更。
        { type: 'faller', x: 175, y: 25, w: 22, h: 22, cycle: 1900, telegraph: 600, fallDur: 480, restY: 25 },
        { type: 'faller', x: 255, y: 25, w: 22, h: 22, cycle: 2300, telegraph: 600, fallDur: 480, restY: 25 },
      ]),
    // --- 上級 (hard) ---
    stage('hard_14', 'hard', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 90, h: 20 },
        { x: 175, y: 230, w: 40, h: 20 },
        { x: 300, y: 230, w: 180, h: 20 },
      ],
      [
        // fake+vanish+faller+spikeの4種構成。過去の教訓通り、島ごとに1つずつ処理できる配置。
        // 修正: 初版は2つ目の隙間(230→340=110px)がジャンプ限界を超え詰みだった
        // (ヘッドレス検証で発見)。3枚目の足場を300pxに近づけ85px間隔に是正。
        { type: 'fake', x: 90, y: 175, w: 85, h: 14 },
        { type: 'vanish', x: 90, y: 230, w: 85, h: 20, cycle: 1500, onFrac: 0.55, phase: 0 },
        { type: 'spike', x: 225, y: 218, w: 18, h: 12 },
        { type: 'faller', x: 400, y: 25, w: 24, h: 24, cycle: 2100, telegraph: 550, fallDur: 500, restY: 25 },
      ]),
    stage('hard_15', 'hard', true,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 90, h: 20 },
        { x: 300, y: 230, w: 60, h: 20 },
        { x: 420, y: 230, w: 60, h: 20 },
      ],
      [
        // coop向け上級: 縦mover(baseYを足場と揃えて水平距離を確保)+vanish(両側と
        // 隣接させ「待って渡る」型にしジャンプ距離の問題を避ける)+spike。
        // 修正: 初版は複数箇所でbaseYを25px高くしていたため各所で詰みだった
        // (ヘッドレス検証で発見)。全て足場と同じ高さ230に統一して是正。
        { type: 'mover', x: 175, y: 230, w: 60, h: 14, axis: 'y', amp: 18, speed: 1.0, baseY: 230, baseX: 175 },
        { type: 'vanish', x: 360, y: 230, w: 60, h: 20, cycle: 1800, onFrac: 0.7, phase: 0 },
        { type: 'spike', x: 250, y: 218, w: 20, h: 12 },
      ]),
  ];

  if (typeof window !== 'undefined' && window.TrapDojo && typeof window.TrapDojo.registerStages === 'function') {
    window.TrapDojo.registerStages(NEW_STAGES);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NEW_STAGES;
  }
})();
