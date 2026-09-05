// トラップ道場 - PC-F(MSI)追加分「エキスパート」ステージ (status.json task84関連)。
//
// 背景: CEOより「本来予測不可能なはずのトラップが予測可能な簡単なステージになっている」との
// 指摘(2026-09-04)。既存60ステージを実機+ヘッドレス監査した結果、罠の33%が視認可能な
// spike、28%が半透明で存在が分かるvanishで、完全に「見た目で判別不能」なfake(デコイの床)は
// 全体の10%程度しかなく、"見えれば避けられる"設計に寄りがちだった。
//
// このファイルはoutput/trapdojo.jsに新規追加した2種類の当たり判定違いハザードを使い、
// 「予測を裏切る」ステージをdifficulty:'expert'として追加する(既存のdiff_expert/masterの
// i18nキーが既にFillItAll用に8言語分揃っているため新規翻訳追加は不要 -- gt('diff_'+difficulty)
// が自動でそのまま解決する)。byDifficulty()はDIFF_RANKに無い値を?? 99でhardの後ろに
// ソートするため、既存コードを一切変更せずに新ティアを追加できる。
//
// 新ハザード type (output/trapdojo.js側に実装済み):
//   'fakespike' -- 見た目は本物のスパイクと完全一致(kind:'spike'を流用)だが死なない。
//                  「危険に見えて安全」という、fakeの逆方向のひっかけ。
//   'phase'     -- 見た目は本物の床/壁と完全一致(kind:'static'を流用)だがすり抜けられる。
//                  「塞がれているように見えて実は通れる」隠し通路トラップ。
//
// 全ステージ、追加した検証スクリプト(pcf-expert-selftest.js)でヘッドレス解探索により
// 詰みでないこと・トゲが実際に機能していることを確認済み(node実行、詳細はそちらを参照)。
(function () {
  function S(id, difficulty, coop, spawn, goal, platforms, hazards) {
    return { id, difficulty, coop, spawn, goal, platforms, hazards };
  }

  const STAGES = [
    // expert_1: 床が視覚的に繋がって見えるが中央区間はfake(踏むと落ちる)。
    // 見た目だけなら「歩くだけの区間」に見えるが、実際は跳び越えないと落下する。
    S('expert_1', 'expert', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 150, h: 20 },
        { x: 240, y: 230, w: 240, h: 20 },
      ],
      [
        { type: 'fake', x: 150, y: 230, w: 90, h: 20 },
        { type: 'spike', x: 300, y: 218, w: 30, h: 12 },
      ]),

    // expert_2: 通路を塞ぐ「壁」に見えるが実はphase(すり抜け可能)。
    // ジャンプでは絶対に越えられない高さにしてあるので、素直に壁へ歩いていく発想を要求する。
    S('expert_2', 'expert', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 480, h: 20 },
      ],
      [
        { type: 'spike', x: 130, y: 218, w: 30, h: 12 },
        { type: 'phase', x: 230, y: 120, w: 20, h: 110 },
      ]),

    // expert_3: 3連トゲに見えるが本物は真ん中だけ(両端はfakespike)。
    // 「見えている罠は全部本物」という思い込みを壊す。安全策としては全部飛び越えれば
    // 無傷だが、両端は踏んでも死なないと"わかれば"ノーモーションで駆け抜けられる。
    S('expert_3', 'expert', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 480, h: 20 },
      ],
      [
        { type: 'fakespike', x: 150, y: 218, w: 30, h: 12 },
        { type: 'spike', x: 195, y: 218, w: 30, h: 12 },
        { type: 'fakespike', x: 240, y: 218, w: 30, h: 12 },
      ]),

    // expert_4: 大きな穴に見える区間の大部分がfakeの床で塞がれて見えるが実際は落下する。
    // 唯一の本物の足場はmoverで、常時タイミングを見て飛び乗る必要がある。
    S('expert_4', 'expert', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 130, h: 20 },
        { x: 350, y: 230, w: 130, h: 20 },
      ],
      [
        { type: 'fake', x: 130, y: 230, w: 220, h: 20 },
        { type: 'mover', x: 240, y: 190, w: 50, h: 14, axis: 'x', amp: 90, speed: 1.0, baseY: 190, baseX: 240 },
      ]),

    // expert_5: vanish床で穴を渡った先、ゴールは頭上の棚(y100)にあり単発ジャンプでは
    // 届かない高低差(130px)なので中継足場を3段刻みで用意(各段35〜45pxに抑え、
    // normal_1/hard_1で判明した「単発ジャンプ最大上昇量(約65px)超は理論上詰み」を
    // 踏まえた設計)。ゴール手前の壁のように見える横棒はphase(すり抜け可能)で、
    // 「行き止まりに見えて実は塞がれていない」という視覚的なひっかけを追加している。
    S('expert_5', 'expert', false,
      { x: 20, y: 190 }, { x: 430, y: 60, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 200, h: 20 },
        { x: 340, y: 190, w: 60, h: 14 },
        { x: 340, y: 145, w: 60, h: 14 },
        { x: 380, y: 100, w: 100, h: 14 },
      ],
      [
        { type: 'spike', x: 90, y: 218, w: 40, h: 12 },
        { type: 'vanish', x: 200, y: 230, w: 180, h: 20, cycle: 1800, onFrac: 0.55, phase: 0 },
        { type: 'phase', x: 380, y: 85, w: 100, h: 15 },
      ]),

    // expert_6: fakeとfakespikeを同一区間に混在させ、「床っぽいものは全部疑え」を徹底させる。
    S('expert_6', 'expert', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 120, h: 20 },
        { x: 120, y: 230, w: 120, h: 20 }, // 本物(見た目はfakeと同じ色調だが実在)
        { x: 360, y: 230, w: 120, h: 20 },
      ],
      [
        { type: 'fake', x: 240, y: 230, w: 120, h: 20 },
        { type: 'fakespike', x: 20, y: 218, w: 30, h: 12 },
        { type: 'spike', x: 300, y: 218, w: 30, h: 12 },
      ]),

    // expert_7: faller(落下ブロック)の予告(telegraph)時間を短くし、フェイクの足場と
    // 組み合わせて反射神経+見た目への不信の両方を要求する。
    S('expert_7', 'expert', false,
      { x: 20, y: 60 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 100, w: 100, h: 14 },
        { x: 0, y: 230, w: 480, h: 20 },
      ],
      [
        { type: 'fake', x: 100, y: 100, w: 90, h: 14 },
        { type: 'faller', x: 150, y: 20, w: 22, h: 22, cycle: 1700, telegraph: 320, fallDur: 550, restY: 20 },
        { type: 'spike', x: 260, y: 218, w: 50, h: 12 },
        { type: 'mover', x: 350, y: 190, w: 50, h: 14, axis: 'y', amp: 30, speed: 1.6, baseY: 190, baseX: 350 },
      ]),

    // expert_8: ゴール直前、最後の一歩に見える床がfake。「ゴールが見えたら気が緩む」を突く。
    S('expert_8', 'expert', false,
      { x: 20, y: 190 }, { x: 430, y: 190, w: 30, h: 40 },
      [
        { x: 0, y: 230, w: 380, h: 20 },
      ],
      [
        { type: 'spike', x: 150, y: 218, w: 30, h: 12 },
        { type: 'mover', x: 260, y: 200, w: 46, h: 14, axis: 'y', amp: 24, speed: 1.3, baseY: 200, baseX: 260 },
        { type: 'fake', x: 380, y: 230, w: 100, h: 20 },
      ]),
  ];

  if (typeof window !== 'undefined' && window.TrapDojo && typeof window.TrapDojo.registerStages === 'function') {
    window.TrapDojo.registerStages(STAGES);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = STAGES;
  }
})();
