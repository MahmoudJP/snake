/* ============================================================================
 * Neon Circuit — CORE ENGINE
 *
 * Plugins extend the game through window.SnakeAPI. Each plugin lives in its own
 * file and registers behaviour via hooks, so multiple authors never touch the
 * same code. Public surface:
 *
 *   SnakeAPI.on(event, fn)        register a hook (see EVENTS below)
 *   SnakeAPI.state                live game state object (read/write)
 *   SnakeAPI.cfg                  tunable config (speeds, grid…)
 *   SnakeAPI.ctx / canvas         2d context + canvas
 *   SnakeAPI.GRID / CELL          grid size (cells) / cell size (px)
 *
 *   Helpers:
 *   SnakeAPI.freeCell()           -> {x,y} empty cell (avoids snake/food/items)
 *   SnakeAPI.addScore(n)          add to score (respects multiplier)
 *   SnakeAPI.grow(n) / shrink(n)  change snake length
 *   SnakeAPI.spawnParticles(px,py,"r,g,b",count)
 *   SnakeAPI.playTone(type)       "eat" | "power" | "die" | custom via on('audio')
 *   SnakeAPI.flash(text,color)    big centered message for ~1.6s
 *   SnakeAPI.toast(glyph,label,color) timed-effect badge row (top-left)
 *   SnakeAPI.roundRect(x,y,w,h,r) path helper
 *   SnakeAPI.occupied(x,y)        is a cell part of the snake?
 *   SnakeAPI.registerPowerup(def) add to the power-up pool
 *   SnakeAPI.registerFood(def)    add a special food variant
 *   SnakeAPI.addEffect(type,secs) start a timed effect
 *   SnakeAPI.setOverlay(title,html,btnLabel,onClick)
 *
 *   EVENTS (emit order noted):
 *   'init'        after reset(), new game state ready
 *   'start'       game began
 *   'keydown'     (key, event) raw key, before direction mapping
 *   'beforeStep'  ({head}) you may mutate head.x/head.y; return false to cancel move (death)
 *   'collide'     ({head, kind}) kind: 'wall'|'self' — return true to PREVENT death
 *   'afterEat'    (food) snake ate normal food
 *   'afterStep'   () one grid step completed
 *   'tick'        (dt) every frame while playing (seconds)
 *   'renderBg'    (ctx) before grid/snake — backgrounds
 *   'render'      (ctx, interp) after snake/particles — overlays/fx
 *   'speed'       (mult) -> return number to multiply current speed (stackable)
 *   'gameover'    (score)
 * ========================================================================== */
window.SnakeAPI = (function () {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const overlay = document.getElementById("overlay");
  const gameStatus = document.getElementById("gameStatus");
  const announcer = document.getElementById("announcer");
  const initialOverlayHTML = overlay.innerHTML;

  const cfg = {
    GRID: 20,
    BASE_SPEED: 6.5,
    MAX_SPEED: 19,
    BEST_KEY: "neonCircuitBest",
    WALL_WRAP: true,          // pass through walls by default
    PU_LIFETIME: 7,
    PU_SPAWN_EVERY: 4,
    REDUCED_MOTION: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    HAPTICS: true,
  };
  const GRID = cfg.GRID;
  const CELL = canvas.width / GRID;

  // ---- hook registry ----
  const hooks = {};
  function on(name, fn) { (hooks[name] || (hooks[name] = [])).push(fn); }
  function emit(name, a, b) {
    const list = hooks[name];
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try { list[i](a, b); } catch (e) { console.error("[hook " + name + "]", e); }
    }
  }
  // emit and collect boolean "veto" (true from any handler wins)
  function emitVeto(name, a) {
    const list = hooks[name]; let veto = false;
    if (list) for (let i = 0; i < list.length; i++) {
      try { if (list[i](a) === true) veto = true; } catch (e) { console.error(name, e); }
    }
    return veto;
  }
  function emitCancel(name, a) {
    const list = hooks[name]; let cancelled = false;
    if (list) for (let i = 0; i < list.length; i++) {
      try { if (list[i](a) === false) cancelled = true; } catch (e) { console.error(name, e); }
    }
    return cancelled;
  }

  // ---- registries (plugins add content) ----
  const powerupDefs = {
    speed:  { color: "250,204,21", glyph: "⚡", label: "Speed Up", dur: 6, apply: t => addEffect("speed", 6) },
    slow:   { color: "96,165,250", glyph: "🐌", label: "Slow Mo", dur: 6, apply: t => addEffect("slow", 6) },
    grow:   { color: "167,139,250", glyph: "✚", label: "Big Snake", dur: 0, apply: t => grow(3) },
    shrink: { color: "248,113,113", glyph: "✂", label: "Shrink", dur: 0, apply: t => shrink(3) },
    double: { color: "251,191,36", glyph: "★", label: "2× Points", dur: 8, apply: t => addEffect("double", 8) },
    ghost:  { color: "45,212,191", glyph: "◌", label: "Ghost", dur: 6, apply: t => addEffect("ghost", 6) },
  };
  const speedEffects = { speed: 1.7, slow: 0.55 };  // effect -> speed multiplier
  function registerPowerup(def) { powerupDefs[def.type] = def; }
  const foodDefs = {};
  function registerFood(def) { foodDefs[def.type] = def; }

  // ---- state ----
  const S = {
    snake: [], dir: { x: 1, y: 0 }, nextDir: { x: 1, y: 0 },
    food: null, powerup: null,
    score: 0, best: 0, speed: cfg.BASE_SPEED,
    running: false, paused: false, dead: false,
    particles: [], effects: {}, scoreMult: 1,
    foodEaten: 0, shake: 0, mode: "classic",
    level: 1, steps: 0, effectiveSpeed: cfg.BASE_SPEED, lastReason: "",
  };
  const inputQueue = [];

  function storageGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function storageSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
  function bestKey() { return `${cfg.BEST_KEY}:${S.mode}`; }
  function loadBest() {
    S.best = parseInt(storageGet(bestKey()) || "0", 10);
    bestEl.textContent = S.best;
    return S.best;
  }
  loadBest();

  let acc = 0, lastTime = 0, foodPulse = 0;
  let flashMsg = null, flashTtl = 0;
  const toasts = {}; // type -> {glyph,label,color}

  // ---- helpers ----
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function occupied(x, y) { return S.snake.some(s => s.x === x && s.y === y); }
  function freeCell() {
    let p, guard = 0;
    do {
      p = { x: (Math.random() * GRID) | 0, y: (Math.random() * GRID) | 0 };
    } while (guard++ < 500 && (occupied(p.x, p.y) ||
      (S.food && S.food.x === p.x && S.food.y === p.y) ||
      (S.powerup && S.powerup.x === p.x && S.powerup.y === p.y) ||
      emitVeto("blockCell", p)));   // plugins (obstacles) can block cells
    return p;
  }
  function addScore(n) { S.score += n * S.scoreMult; updateScore(); }
  function announce(text) { if (announcer) announcer.textContent = text; }
  function setStatus(text) { if (gameStatus) gameStatus.textContent = text; }
  function vibrate(pattern) { try { if (cfg.HAPTICS && navigator.vibrate) navigator.vibrate(pattern); } catch (e) {} }
  function grow(n) {
    const tail = S.snake[S.snake.length - 1];
    for (let i = 0; i < n; i++) S.snake.push({ x: tail.x, y: tail.y, rx: tail.x, ry: tail.y });
  }
  function shrink(n) {
    const r = Math.min(n, S.snake.length - 3);
    for (let i = 0; i < r; i++) S.snake.pop();
  }
  function addEffect(type, secs) {
    const def = powerupDefs[type];
    S.effects[type] = secs;
    if (def) toast(def.glyph, def.label, def.color, secs, type);
  }
  function toast(glyph, label, color, dur, key) {
    toasts[key || label] = { glyph, label, color, dur };
  }
  function flash(text, color) { flashMsg = { text, color: color || "45,212,191" }; flashTtl = 1.6; }

  function updateScore() {
    S.score = Math.max(0, Math.round(S.score));
    scoreEl.textContent = S.score;
    if (S.score > S.best) {
      S.best = S.score; bestEl.textContent = S.best;
      storageSet(bestKey(), String(S.best));
    }
    emit("score", S.score);
  }

  function placeFood() {
    const p = freeCell();
    // let content plugins decide a special food type occasionally
    let type = null;
    const keys = Object.keys(foodDefs);
    if (keys.length && Math.random() < 0.18) type = keys[(Math.random() * keys.length) | 0];
    S.food = { x: p.x, y: p.y, type };
  }

  function spawnPowerup() {
    const keys = Object.keys(powerupDefs);
    const type = keys[(Math.random() * keys.length) | 0];
    const p = freeCell();
    S.powerup = { x: p.x, y: p.y, type, ttl: cfg.PU_LIFETIME };
  }

  // ---- particles ----
  function spawnParticles(cx, cy, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
      S.particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, color, size: 2 + Math.random() * 3 });
    }
  }
  function updateParticles(dt) {
    for (const p of S.particles) { p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy *= 0.92; p.life -= dt * 2.2; }
    S.particles = S.particles.filter(p => p.life > 0);
  }

  // ---- audio ----
  let audioCtx = null;
  function playTone(type) {
    // plugins can fully take over audio by handling 'audio'
    if (hooks.audio && hooks.audio.length) { emit("audio", type); return; }
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      if (type === "eat") {
        o.type = "triangle"; o.frequency.setValueAtTime(440, now);
        o.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        g.gain.setValueAtTime(0.15, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        o.start(now); o.stop(now + 0.12);
      } else if (type === "power") {
        o.type = "square";
        o.frequency.setValueAtTime(523, now); o.frequency.setValueAtTime(659, now + 0.06); o.frequency.setValueAtTime(784, now + 0.12);
        g.gain.setValueAtTime(0.12, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        o.start(now); o.stop(now + 0.2);
      } else if (type === "die") {
        o.type = "sawtooth"; o.frequency.setValueAtTime(280, now);
        o.frequency.exponentialRampToValueAtTime(60, now + 0.5);
        g.gain.setValueAtTime(0.2, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        o.start(now); o.stop(now + 0.5);
      }
    } catch (e) {}
  }

  // ---- lifecycle ----
  function reset() {
    const mid = Math.floor(GRID / 2);
    S.snake = [{ x: mid - 1, y: mid }, { x: mid - 2, y: mid }, { x: mid - 3, y: mid }];
    S.snake.forEach(s => { s.rx = s.x; s.ry = s.y; });
    S.dir = { x: 1, y: 0 }; S.nextDir = { x: 1, y: 0 };
    inputQueue.length = 0;
    S.score = 0; S.speed = cfg.BASE_SPEED;
    S.running = false; S.paused = false; S.dead = false;
    S.particles = []; S.effects = {}; S.scoreMult = 1;
    S.foodEaten = 0; S.shake = 0; S.powerup = null;
    S.level = 1; S.steps = 0; S.lastReason = ""; S.effectiveSpeed = cfg.BASE_SPEED;
    for (const k in toasts) delete toasts[k];
    flashMsg = null; flashTtl = 0;
    loadBest();
    placeFood();
    updateScore();
    setStatus("Ready");
    emit("init");
  }

  function startGame() {
    reset();
    S.running = true;
    overlay.classList.add("hidden");
    lastTime = performance.now(); acc = 0;
    setStatus("Playing");
    announce(`${S.mode} mode started`);
    emit("start");
  }

  function togglePause() {
    if (!S.running || S.dead) return;
    S.paused = !S.paused;
    if (S.paused) {
      setStatus("Paused");
      setOverlay("Circuit paused", "Your run is safe. Resume when you are ready.", "Resume run", () => togglePause());
      announce("Game paused");
    } else {
      overlay.classList.add("hidden"); lastTime = performance.now();
      setStatus("Playing"); announce("Game resumed");
    }
  }

  function gameOver(reason) {
    if (S.dead) return;
    S.dead = true; S.running = false; S.lastReason = reason || "collision";
    S.shake = cfg.REDUCED_MOTION ? 0 : 14;
    setStatus("Game over"); vibrate([45, 35, 90]);
    playTone("die");
    emit("gameover", S.score, S.lastReason);
    const isBest = S.score >= S.best && S.score > 0;
    setTimeout(() => {
      setOverlay(
        "Circuit ended",
        `<span class="big-score">${S.score}</span><span class="result-label">points in ${S.mode} mode</span>` +
        (isBest ? `<span class="new-best">★ New personal best</span>` : `<span class="result-meta">Best ${S.best} · Level ${S.level} · ${S.foodEaten} cores</span>`),
        "Run it again", () => startGame()
      );
      const menuButton = document.createElement("button");
      menuButton.className = "overlay-link"; menuButton.type = "button";
      menuButton.textContent = "Change game mode"; menuButton.addEventListener("click", showMenu);
      overlay.appendChild(menuButton);
      announce(`Game over. Score ${S.score}`);
    }, 450);
  }

  function setOverlay(title, html, btnLabel, onClick) {
    overlay.innerHTML =
      `<h2>${title}</h2><div class="overlay-copy">${html}</div><button class="btn" id="ovBtn"><span>${btnLabel}</span><b aria-hidden="true">→</b></button>`;
    overlay.classList.remove("hidden");
    document.getElementById("ovBtn").addEventListener("click", onClick);
  }

  function showMenu() {
    S.running = false; S.paused = false; S.dead = false;
    overlay.innerHTML = initialOverlayHTML;
    overlay.classList.remove("hidden");
    setStatus("Ready");
    announce("Game mode menu opened");
    emit("menu");
  }

  // ---- input ----
  function setDir(x, y) {
    const basis = inputQueue.length ? inputQueue[inputQueue.length - 1] : S.nextDir;
    if ((x === -basis.x && y === -basis.y) || (x === basis.x && y === basis.y)) return;
    if (inputQueue.length < 2) inputQueue.push({ x, y });
  }
  const keyMap = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
  };
  window.addEventListener("keydown", (e) => {
    emit("keydown", e.key, e);
    if (keyMap[e.key]) {
      e.preventDefault();
      if (!S.running && !S.dead) startGame();
      setDir(keyMap[e.key][0], keyMap[e.key][1]);
    } else if (e.key === " " || e.key === "p" || e.key === "P") {
      e.preventDefault();
      if (S.running && !S.dead) togglePause();
      else if (!S.running && !S.dead) startGame();
    } else if (e.key === "r" || e.key === "R") {
      e.preventDefault(); startGame();
    } else if (e.key === "Escape" && S.running && !S.dead) {
      e.preventDefault(); togglePause();
    }
  });
  let touchStart = null;
  canvas.addEventListener("touchstart", e => { touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  canvas.addEventListener("touchmove", e => e.preventDefault(), { passive: false });
  canvas.addEventListener("touchend", e => {
    if (!touchStart) return;
    const t = e.changedTouches[0], dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) { touchStart = null; return; }
    if (!S.running && !S.dead) startGame();
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 1 : -1, 0); else setDir(0, dy > 0 ? 1 : -1);
    touchStart = null;
  });
  overlay.addEventListener("click", e => {
    if (e.target.closest("#startBtn")) startGame();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && S.running && !S.paused && !S.dead) togglePause();
  });

  // ---- step ----
  function step() {
    if (inputQueue.length) S.nextDir = inputQueue.shift();
    S.dir = S.nextDir;
    const head = { x: S.snake[0].x + S.dir.x, y: S.snake[0].y + S.dir.y };
    if (emitCancel("beforeStep", { head })) { gameOver("obstacle"); return; }

    const ghost = S.effects.ghost > 0;
    let hitWall = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID;

    if (hitWall) {
      if (cfg.WALL_WRAP || ghost) {
        head.x = (head.x + GRID) % GRID; head.y = (head.y + GRID) % GRID;
      } else if (!emitVeto("collide", { head, kind: "wall" })) {
        gameOver("wall"); return;
      }
    }
    if (!ghost && occupied(head.x, head.y)) {
      if (!emitVeto("collide", { head, kind: "self" })) { gameOver("self"); return; }
    }

    head.rx = S.snake[0].x; head.ry = S.snake[0].y;
    S.snake.unshift(head);
    S.steps++;

    // power-up pickup
    if (S.powerup && head.x === S.powerup.x && head.y === S.powerup.y) {
      const def = powerupDefs[S.powerup.type];
      spawnParticles(S.powerup.x * CELL + CELL / 2, S.powerup.y * CELL + CELL / 2, def.color, 22);
      playTone("power");
      flash(def.glyph + "  " + def.label, def.color);
      if (def.apply) def.apply(S.powerup.type);
      addScore(5); vibrate(22);
      S.powerup = null;
    }

    // food
    if (S.food && head.x === S.food.x && head.y === S.food.y) {
      const fdef = S.food.type ? foodDefs[S.food.type] : null;
      const pts = fdef && fdef.points != null ? fdef.points : 10;
      addScore(pts); S.foodEaten++; vibrate(12);
      playTone("eat");
      spawnParticles(S.food.x * CELL + CELL / 2, S.food.y * CELL + CELL / 2, fdef ? fdef.color : "244,63,94", 18);
      if (fdef && fdef.onEat) fdef.onEat();
      S.speed = Math.min(cfg.MAX_SPEED, cfg.BASE_SPEED + S.score / 70);
      emit("afterEat", S.food);
      placeFood();
      if (!S.powerup && S.foodEaten % cfg.PU_SPAWN_EVERY === 0) spawnPowerup();
    } else {
      S.snake.pop();
    }
    emit("afterStep");
  }

  function tickEffects(dt) {
    for (const k of Object.keys(S.effects)) { S.effects[k] -= dt; if (S.effects[k] <= 0) delete S.effects[k]; }
    if (S.powerup) { S.powerup.ttl -= dt; if (S.powerup.ttl <= 0) S.powerup = null; }
    if (flashTtl > 0) flashTtl -= dt;
    S.scoreMult = S.effects.double > 0 ? 2 : 1;
    let mult = 1;
    for (const k in speedEffects) if (S.effects[k] > 0) mult *= speedEffects[k];
    // plugins can further scale speed
    const list = hooks.speed;
    if (list) for (let i = 0; i < list.length; i++) { try { const r = list[i](mult); if (typeof r === "number") mult *= r; } catch (e) {} }
    return mult;
  }

  // ---- render ----
  function drawGrid() {
    ctx.strokeStyle = "rgba(255,255,255,0.03)"; ctx.lineWidth = 1;
    for (let i = 1; i < GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(canvas.width, i * CELL); ctx.stroke();
    }
  }

  function render(interp) {
    ctx.save();
    if (S.shake > 0 && !cfg.REDUCED_MOTION) {
      const s = S.shake;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      S.shake *= 0.85; if (S.shake < 0.4) S.shake = 0;
    }
    ctx.clearRect(-30, -30, canvas.width + 60, canvas.height + 60);

    emit("renderBg", ctx);
    drawGrid();

    foodPulse += 0.08;
    const pulse = 0.5 + Math.sin(foodPulse) * 0.5;

    // food
    if (S.food) {
      const fdef = S.food.type ? foodDefs[S.food.type] : null;
      const col = fdef ? fdef.color : "244,63,94";
      const fx = S.food.x * CELL + CELL / 2, fy = S.food.y * CELL + CELL / 2, fr = CELL * 0.32 + pulse * 2.5;
      const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr * 2.4);
      grad.addColorStop(0, `rgba(${col},0.9)`); grad.addColorStop(0.4, `rgba(${col},0.35)`); grad.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(fx, fy, fr * 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgb(${col})`; ctx.shadowColor = `rgb(${col})`; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      if (fdef && fdef.glyph) {
        ctx.fillStyle = "#04121a"; ctx.font = `bold ${CELL * 0.5}px sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(fdef.glyph, fx, fy + 1);
      }
    }

    // power-up
    if (S.powerup) {
      const def = powerupDefs[S.powerup.type];
      const blink = S.powerup.ttl < 2 ? (Math.sin(S.powerup.ttl * 14) > 0 ? 0.35 : 1) : 1;
      const px = S.powerup.x * CELL + CELL / 2, py = S.powerup.y * CELL + CELL / 2, r = CELL * 0.4 + pulse * 2;
      ctx.globalAlpha = blink;
      const pg = ctx.createRadialGradient(px, py, 0, px, py, r * 2.2);
      pg.addColorStop(0, `rgba(${def.color},0.85)`); pg.addColorStop(0.5, `rgba(${def.color},0.3)`); pg.addColorStop(1, `rgba(${def.color},0)`);
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, r * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = `rgb(${def.color})`; ctx.shadowColor = `rgb(${def.color})`; ctx.shadowBlur = 14;
      roundRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4, 4); ctx.fill(); ctx.restore(); ctx.shadowBlur = 0;
      ctx.fillStyle = "#04121a"; ctx.font = `bold ${CELL * 0.55}px sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(def.glyph, px, py + 1);
      ctx.globalAlpha = 1;
    }

    // snake
    const ghosting = S.effects.ghost > 0;
    const t = S.running && !S.paused && !S.dead ? interp : 1;
    for (let i = S.snake.length - 1; i >= 0; i--) {
      const seg = S.snake[i];
      const rx = (seg.rx !== undefined ? seg.rx + (seg.x - seg.rx) * t : seg.x);
      const ry = (seg.ry !== undefined ? seg.ry + (seg.y - seg.ry) * t : seg.y);
      const px = rx * CELL, py = ry * CELL, frac = 1 - i / S.snake.length, pad = 2 - frac, isHead = i === 0;
      let r1, g1, b1;
      if (S.effects.speed > 0) { r1 = 250; g1 = 204; b1 = 21; }
      else if (S.effects.slow > 0) { r1 = 96; g1 = 165; b1 = 250; }
      else if (S.effects.double > 0) { r1 = 251; g1 = 191; b1 = 36; }
      else { r1 = 45; g1 = Math.round(212 - frac); b1 = Math.round(191 - frac * 38); }
      ctx.globalAlpha = ghosting ? 0.45 : 1;
      ctx.fillStyle = `rgb(${r1},${g1},${b1})`;
      if (isHead) { ctx.shadowColor = "rgba(45,212,191,0.9)"; ctx.shadowBlur = 18; } else ctx.shadowBlur = 0;
      roundRect(px + pad, py + pad, CELL - pad * 2, CELL - pad * 2, isHead ? 7 : 5); ctx.fill(); ctx.shadowBlur = 0;
      if (isHead) {
        ctx.fillStyle = "#04121a";
        const cx = px + CELL / 2, cy = py + CELL / 2, ox = S.dir.x * CELL * 0.13, oy = S.dir.y * CELL * 0.13;
        const perpx = S.dir.y, perpy = S.dir.x, e = CELL * 0.28;
        ctx.beginPath();
        ctx.arc(cx + ox + perpx * e * 0.6, cy + oy + perpy * e * 0.6, 1.9, 0, Math.PI * 2);
        ctx.arc(cx + ox - perpx * e * 0.6, cy + oy - perpy * e * 0.6, 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // particles
    for (const p of S.particles) {
      ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = `rgba(${p.color},1)`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // effect toast bars (top-left)
    let by = 10;
    for (const k of Object.keys(S.effects)) {
      const tt = toasts[k]; if (!tt) continue;
      const fr2 = Math.max(0, S.effects[k] / (tt.dur || 6));
      ctx.fillStyle = "rgba(255,255,255,0.08)"; roundRect(10, by, 92, 8, 4); ctx.fill();
      ctx.fillStyle = `rgb(${tt.color})`; roundRect(10, by, 92 * fr2, 8, 4); ctx.fill();
      ctx.fillStyle = "#cbd5e1"; ctx.font = "600 9px sans-serif";
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText(tt.glyph + " " + tt.label, 10, by - 3);
      by += 26;
    }

    // plugin overlays
    emit("render", ctx, interp);

    // flash message
    if (flashMsg && flashTtl > 0) {
      const a = Math.min(1, flashTtl / 1.6);
      ctx.globalAlpha = a; ctx.fillStyle = `rgb(${flashMsg.color})`;
      ctx.font = `bold ${28 + (1 - a) * 10}px sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = `rgb(${flashMsg.color})`; ctx.shadowBlur = 20;
      ctx.fillText(flashMsg.text, canvas.width / 2, canvas.height / 2);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  // ---- main loop ----
  function loop(now) {
    const dt = Math.min(0.1, (now - lastTime) / 1000); lastTime = now;
    const playing = S.running && !S.paused && !S.dead;
    const speedMult = playing ? tickEffects(dt) : 1;
    const effSpeed = S.speed * speedMult;
    S.effectiveSpeed = effSpeed;
    if (playing) {
      emit("tick", dt);
      acc += dt;
      const interval = 1 / effSpeed;
      let steps = 0;
      while (acc >= interval && steps++ < 5) {
        acc -= interval;
        for (const s of S.snake) { s.rx = s.x; s.ry = s.y; }
        step();
        if (S.dead) break;
      }
    }
    updateParticles(dt);
    const interp = playing ? Math.min(1, acc * effSpeed) : 1;
    render(interp);
    requestAnimationFrame(loop);
  }

  let booted = false;
  function boot() {
    if (booted) return; booted = true;
    reset();
    requestAnimationFrame(loop);
  }

  return {
    on, emit, boot, cfg, state: S, ctx, canvas, GRID, CELL,
    freeCell, occupied, addScore, grow, shrink, addEffect, toast, flash,
    spawnParticles, playTone, roundRect, registerPowerup, registerFood,
    setOverlay, showMenu, startGame, togglePause, setDir, gameOver, loadBest,
    getEffects: () => Object.keys(S.effects).map(type => ({ type, remaining: S.effects[type], ...(powerupDefs[type] || {}) })),
  };
})();
