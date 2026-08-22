// Anyway - 2D grid course editor: draw a maze/obstacle course by tapping cells, then post it
// as a 'mymaze' game (mountMyMaze, defined in games.js, is the play side that reads the same
// layout back). This is the 2D counterpart to map-editor.js's 3D Element Arena map builder --
// reached as the very first card in the "+" create flow, ahead of the 3D map carousel.
//
// Classic (non-module) script on purpose, same reason as the rest of this app: opened directly
// via file:// as well as http(s), and file:// blocks type="module"/import entirely.
//
// Depends on window.MAZE_CELL (the shared cell-type encoding), which games.js defines and
// exposes -- so this file's <script> tag must load after games.js's, per index.html.
(function () {
  const CELL = window.MAZE_CELL;

  function gt(key, fallback) {
    if (!window.I18N) return fallback;
    const v = window.I18N.t(key);
    return v === key ? fallback : v;
  }

  function idx(cols, x, y) { return y * cols + x; }

  function blankLayout(cols, rows) {
    const cells = new Array(cols * rows).fill(CELL.EMPTY);
    cells[idx(cols, 1, 1)] = CELL.START;
    cells[idx(cols, cols - 2, rows - 2)] = CELL.GOAL;
    return { cols, rows, cells };
  }

  let stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
.mz-root { position: absolute; inset: 0; display: flex; flex-direction: column; background: #14151a; overflow: hidden; }
.mz-back { position: absolute; top: 10px; left: 10px; z-index: 4; appearance: none; border: none; border-radius: 999px;
  padding: 7px 14px; font-size: 13px; font-weight: 600; background: rgba(20,20,26,0.6); color: #fff; cursor: pointer; }
.mz-hint { position: absolute; top: 10px; right: 10px; z-index: 4; font-size: 11px; color: #fff; opacity: 0.75;
  background: rgba(20,20,26,0.5); border-radius: 8px; padding: 6px 9px; max-width: 50%; text-align: right; line-height: 1.5; }
.mz-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 52px 10px 10px; }
.mz-grid { touch-action: none; border-radius: 10px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,0.4); }
.mz-tray { flex-shrink: 0; background: rgba(15,15,20,0.92); border-top: 1px solid rgba(255,255,255,0.08); padding: 10px; }
.mz-brushes { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px; }
.mz-brush { flex-shrink: 0; appearance: none; border: 1px solid rgba(255,255,255,0.2); border-radius: 12px;
  padding: 8px 12px; font-size: 12px; font-weight: 600; background: rgba(255,255,255,0.06); color: #fff; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 3px; width: 62px; }
.mz-brush.selected { background: #fff; color: #14151a; }
.mz-brush-icon { font-size: 20px; }
.mz-title-input { width: 100%; padding: 11px; border-radius: 10px; margin-bottom: 8px; font-size: 14px;
  background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #fff; box-sizing: border-box; }
.mz-confirm { width: 100%; appearance: none; border: none; border-radius: 10px; padding: 12px; font-size: 14px;
  font-weight: 700; background: #fff; color: #14151a; cursor: pointer; }
.mz-confirm:disabled { opacity: 0.4; cursor: default; }
.mz-note { font-size: 11px; color: #fff; opacity: 0.6; text-align: center; margin: 0 0 8px; }
`;
    document.head.appendChild(style);
  }

  const BRUSHES = [
    { type: CELL.WALL, icon: '🧱', label: '壁' },
    { type: CELL.HAZARD, icon: '🔥', label: '危険' },
    { type: CELL.START, icon: '🚩', label: 'スタート' },
    { type: CELL.GOAL, icon: '🏁', label: 'ゴール' },
    { type: CELL.EMPTY, icon: '🧹', label: '消す' },
  ];
  const CELL_COLORS = {
    [CELL.EMPTY]: '#20222a', [CELL.WALL]: '#5a5f6e', [CELL.HAZARD]: '#a83232',
    [CELL.START]: '#31d158', [CELL.GOAL]: '#ffd23f',
  };

  /**
   * @param {HTMLElement} container
   * @param {(layout: {cols:number,rows:number,cells:number[]}, title: string) => void} opts.onConfirm
   * @param {() => void} opts.onBack
   */
  function mount(container, opts) {
    injectStyles();
    const { onConfirm, onBack } = opts;
    const cols = 9, rows = 13;
    const cells = blankLayout(cols, rows).cells;

    container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'mz-root';
    container.appendChild(root);

    const backBtn = document.createElement('button');
    backBtn.className = 'mz-back';
    backBtn.textContent = gt('maze_back_to_selector', '← マップ選択に戻る');
    backBtn.addEventListener('click', () => { if (onBack) onBack(); });
    root.appendChild(backBtn);

    const hint = document.createElement('div');
    hint.className = 'mz-hint';
    hint.style.whiteSpace = 'pre-line';
    hint.textContent = gt('maze_hint_draw', 'マス目をタップ/ドラッグしてコースを作ろう\nスタート🚩とゴール🏁は必ず1つずつ');
    root.appendChild(hint);

    const stage = document.createElement('div');
    stage.className = 'mz-stage';
    root.appendChild(stage);

    const canvas = document.createElement('canvas');
    canvas.className = 'mz-grid';
    stage.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    let cell = 28;
    function resize() {
      const availW = stage.clientWidth - 4, availH = stage.clientHeight - 4;
      cell = Math.max(14, Math.floor(Math.min(availW / cols, availH / rows)));
      canvas.width = cell * cols;
      canvas.height = cell * rows;
      draw();
    }
    function draw() {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          ctx.fillStyle = CELL_COLORS[cells[idx(cols, x, y)]] ?? CELL_COLORS[CELL.EMPTY];
          ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);
        }
      }
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);

    let selectedBrush = CELL.WALL;
    let painting = false;

    function posFromEvent(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: Math.floor((e.clientX - rect.left) / cell), y: Math.floor((e.clientY - rect.top) / cell) };
    }
    function paint(x, y) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      if (selectedBrush === CELL.START || selectedBrush === CELL.GOAL) {
        const prev = cells.indexOf(selectedBrush);
        if (prev !== -1) cells[prev] = CELL.EMPTY;
      }
      cells[idx(cols, x, y)] = selectedBrush;
      draw();
      updateConfirm();
    }
    canvas.addEventListener('pointerdown', (e) => {
      painting = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* best-effort */ }
      const { x, y } = posFromEvent(e);
      paint(x, y);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!painting) return;
      // Start/goal are single-point placements -- dragging those would fling them around
      // unpredictably, so only wall/hazard/erase paint continuously while dragging.
      if (selectedBrush === CELL.START || selectedBrush === CELL.GOAL) return;
      const { x, y } = posFromEvent(e);
      paint(x, y);
    });
    function endPaint() { painting = false; }
    canvas.addEventListener('pointerup', endPaint);
    canvas.addEventListener('pointercancel', endPaint);

    const tray = document.createElement('div');
    tray.className = 'mz-tray';
    root.appendChild(tray);

    const brushRow = document.createElement('div');
    brushRow.className = 'mz-brushes';
    tray.appendChild(brushRow);
    const brushBtns = BRUSHES.map((b) => {
      const btn = document.createElement('button');
      btn.className = 'mz-brush' + (b.type === selectedBrush ? ' selected' : '');
      btn.innerHTML = `<span class="mz-brush-icon">${b.icon}</span><span>${b.label}</span>`;
      btn.addEventListener('click', () => {
        selectedBrush = b.type;
        brushBtns.forEach((bb, i) => bb.classList.toggle('selected', BRUSHES[i].type === b.type));
      });
      brushRow.appendChild(btn);
      return btn;
    });

    const note = document.createElement('p');
    note.className = 'mz-note';
    tray.appendChild(note);

    const titleInput = document.createElement('input');
    titleInput.className = 'mz-title-input';
    titleInput.type = 'text';
    titleInput.maxLength = 24;
    titleInput.placeholder = 'コースのタイトル';
    tray.appendChild(titleInput);

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'mz-confirm';
    confirmBtn.textContent = gt('maze_confirm_post', 'このコースで投稿する →');
    tray.appendChild(confirmBtn);

    function updateConfirm() {
      const hasStart = cells.includes(CELL.START);
      const hasGoal = cells.includes(CELL.GOAL);
      confirmBtn.disabled = !(hasStart && hasGoal);
      note.textContent = (hasStart && hasGoal) ? '' : gt('maze_note_need_start_goal', 'スタート🚩とゴール🏁を1つずつ置いてください');
    }
    confirmBtn.addEventListener('click', () => {
      if (confirmBtn.disabled) return;
      const layout = { cols, rows, cells: cells.slice() };
      if (onConfirm) onConfirm(layout, titleInput.value.trim());
    });

    resize();
    updateConfirm();

    return {
      destroy() {
        resizeObserver.disconnect();
        container.innerHTML = '';
      },
    };
  }

  window.MazeEditor = { mount, blankLayout };
})();
