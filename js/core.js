/* ============================================================================
 * Neon Coil — CORE ENGINE
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
  const t = window.NeonI18n ? window.NeonI18n.t : text => text;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const overlay = document.getElementById("overlay");
  const boardWrap = document.getElementById("boardWrap");
  const gameStatus = document.getElementById("gameStatus");
  const announcer = document.getElementById("announcer");
  const initialOverlayHTML = overlay.innerHTML;

  const cfg = {
    GRID: 20,
    BASE_SPEED: 6.5,
    MAX_SPEED: 19,
    MAX_EFFECTIVE_SPEED: 23,
    BEST_KEY: "neonCoilBest",
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
    score: 0, best: 0, runBestBefore: 0, speed: cfg.BASE_SPEED, targetSpeed: cfg.BASE_SPEED,
    running: false, paused: false, dead: false,
    particles: [], effects: {}, scoreMult: 1, shield: false,
    foodEaten: 0, shake: 0, mode: "classic",
    level: 1, steps: 0, effectiveSpeed: cfg.BASE_SPEED, lastReason: "",
  };
  const inputQueue = [];

  function storageError() { cfg.STORAGE_UNAVAILABLE = true; emit("storageerror"); }
  // undefined means unreadable; null means genuinely absent. Migration and
  // score writes must never confuse these two states.
  function storageGet(key) { try { return localStorage.getItem(key); } catch (e) { storageError(); return undefined; } }
  function storageSet(key, value) { try { localStorage.setItem(key, value); return true; } catch (e) { storageError(); return false; } }
  // Preserve records and preferences from the previous Neon Circuit name.
  for (const suffix of ["Best", "Best:classic", "Best:rush", "Best:zen", "Sound", "Effects", "Haptics", "Mode", "Scores"]) {
    const current = "neonCoil" + suffix;
    const previous = storageGet("neonCircuit" + suffix);
    if (storageGet(current) === null && previous !== null && previous !== undefined) storageSet(current, previous);
  }
  const oldBest = storageGet("neonCoilBest");
  if (storageGet("neonCoilBest:classic") === null && oldBest !== null && oldBest !== undefined) {
    storageSet("neonCoilBest:classic", oldBest);
  }
  function bestKey() { return `${cfg.BEST_KEY}:${S.mode}`; }
  function parseBest(raw) { const score = Number(raw); return Number.isSafeInteger(score) && score >= 0 ? score : 0; }
  function loadBest() {
    const raw = storageGet(bestKey());
    S.best = raw === undefined ? 0 : parseBest(raw);
    bestEl.textContent = S.best;
    return S.best;
  }
  loadBest();

  let acc = 0, lastTime = 0, foodPulse = 0;
  const RUN_KEY = "neonCoilInterruptedRun";
  const runComponents = {};
  let checkpointToken = null, checkpointAt = -Infinity, restoringRun = false;
  function registerRunState(name, component) { runComponents[name] = component; }
  const cardinal = value => value && Number.isInteger(value.x) && Number.isInteger(value.y) && Math.abs(value.x) + Math.abs(value.y) === 1;
  const cell = value => value && Number.isInteger(value.x) && Number.isInteger(value.y) && value.x >= 0 && value.y >= 0 && value.x < GRID && value.y < GRID;
  const nonnegative = value => Number.isSafeInteger(value) && value >= 0;
  function validateRun(record) {
    if (!record || record.version !== 1 || record.grid !== GRID || typeof record.token !== "string" || !record.token || record.token.length > 100 ||
        !["classic", "rush", "zen"].includes(record.mode) || !record.state || !record.components) return false;
    const state = record.state;
    if (!Array.isArray(state.snake) || state.snake.length < 3 || state.snake.length > GRID * GRID + 50 || !state.snake.every(cell) ||
        !cardinal(state.dir) || !cardinal(state.nextDir) || !Array.isArray(state.queue) || state.queue.length > 2 || !state.queue.every(cardinal) ||
        ![state.score, state.best, state.runBestBefore, state.foodEaten, state.steps].every(nonnegative) ||
        !Number.isInteger(state.level) || state.level < 1 || state.level > 5 || typeof state.shield !== "boolean" ||
        ![state.speed, state.targetSpeed].every(value => Number.isFinite(value) && value > 0 && value <= 100) ||
        !Number.isFinite(state.acc) || state.acc < 0 || state.acc > 2 || !cell(state.food) ||
        !(state.food.type === null || Object.hasOwn(foodDefs, state.food.type)) ||
        !state.effects || typeof state.effects !== "object" || Array.isArray(state.effects)) return false;
    if (state.powerup !== null && (!cell(state.powerup) || !Object.hasOwn(powerupDefs, state.powerup.type) ||
        !Number.isFinite(state.powerup.ttl) || state.powerup.ttl <= 0 || state.powerup.ttl > cfg.PU_LIFETIME)) return false;
    for (const [type, duration] of Object.entries(state.effects)) {
      if (!Object.hasOwn(powerupDefs, type) || !(type === "shield" && duration === "persistent" || Number.isFinite(duration) && duration > 0 && duration <= 60)) return false;
    }
    if (state.shield !== (state.effects.shield === "persistent")) return false;
    if (Object.keys(record.components).length !== Object.keys(runComponents).length) return false;
    return Object.entries(runComponents).every(([name, component]) => Object.hasOwn(record.components, name) && component.validate(record.components[name]));
  }
  function savedRun() {
    const raw = storageGet(RUN_KEY);
    if (raw === undefined || raw === null || raw === "") return { raw, record: null };
    try {
      if (raw.length > 100000) return { raw, record: null };
      const record = JSON.parse(raw);
      return { raw, record: validateRun(record) ? record : null };
    } catch (_) { return { raw, record: null }; }
  }
  function clearSavedRun(token) {
    const previous = savedRun();
    if (previous.raw === undefined) return false;
    if (token && previous.record?.token !== token) return false;
    // A tombstone works even on storage adapters that deny removeItem.
    return storageSet(RUN_KEY, "");
  }
  function saveRun(force = false) {
    if (!S.running || S.dead || restoringRun || !checkpointToken) return false;
    const now = performance.now();
    if (!force && now - checkpointAt < 1000) return false;
    checkpointAt = now;
    const previous = savedRun();
    // An unreadable/foreign/corrupt/newer record is never silently overwritten.
    if (previous.raw === undefined || previous.raw && previous.record?.token !== checkpointToken) return false;
    const components = {};
    for (const [name, component] of Object.entries(runComponents)) components[name] = component.capture();
    const record = { version: 1, grid: GRID, token: checkpointToken, mode: S.mode,
      state: { snake: S.snake.map(({x,y}) => ({x,y})), dir: {...S.dir}, nextDir: {...S.nextDir}, queue: inputQueue.map(value => ({...value})),
        food: S.food && {...S.food}, powerup: S.powerup && {...S.powerup}, score: S.score, best: S.best, runBestBefore: S.runBestBefore,
        speed: S.speed, targetSpeed: S.targetSpeed, level: S.level, foodEaten: S.foodEaten, steps: S.steps, shield: S.shield,
        effects: Object.fromEntries(Object.entries(S.effects).map(([type, seconds]) => [type, seconds === Infinity ? "persistent" : seconds])), acc }, components };
    if (!validateRun(record)) return false;
    if (!storageSet(RUN_KEY, JSON.stringify(record))) return false;
    checkpointAt = now;
    return true;
  }
  function restoreRun() {
    const record = savedRun().record;
    if (!record || S.running) return false;
    restoringRun = true;
    S.mode = record.mode;
    reset();
    const state = record.state;
    for (const key of ["score", "best", "runBestBefore", "speed", "targetSpeed", "level", "foodEaten", "steps", "shield"]) S[key] = state[key];
    S.dir = {...state.dir}; S.nextDir = {...state.nextDir};
    S.food = {...state.food}; S.powerup = state.powerup && {...state.powerup};
    S.mode = record.mode; S.running = true; S.paused = false; S.dead = false; S.particles = []; S.shake = 0;
    S.snake = state.snake.map(({x,y}) => ({x,y,rx:x,ry:y}));
    S.effects = Object.fromEntries(Object.entries(state.effects).map(([type, seconds]) => [type, seconds === "persistent" ? Infinity : seconds]));
    inputQueue.length = 0; inputQueue.push(...state.queue.map(value => ({...value})));
    acc = state.acc;
    for (const [name, component] of Object.entries(runComponents)) component.restore(record.components[name]);
    checkpointToken = record.token; checkpointAt = -Infinity;
    S.best = Math.max(state.best, loadBest(), state.score); bestEl.textContent = S.best;
    for (const [type, seconds] of Object.entries(S.effects)) {
      const def = powerupDefs[type]; if (def) toast(def.glyph, def.label, def.color, seconds, type);
    }
    scoreEl.textContent = S.score;
    boardWrap?.classList.remove("menu-open");
    emit("restored");
    restoringRun = false;
    // Always restore paused. Time spent outside the tab does not consume effects.
    togglePause();
    return true;
  }
  function addResumeOffer() {
    const saved = savedRun();
    if (!saved.raw) return;
    const discard = () => {
      if (storageGet(RUN_KEY) !== saved.raw) { showMenu(); return; }
      if (clearSavedRun()) { checkpointToken = null; showMenu(); }
    };
    setOverlay("Saved run found",
      saved.record ? "A saved run is available in this browser. Resume paused, or discard it to start a new run." : "This saved run cannot be resumed. Discard it to save a new run. Your best scores and history are kept.",
      saved.record ? "Resume saved run" : "Discard saved run", saved.record ? restoreRun : discard);
    if (saved.record) {
      const secondary = document.createElement("button"); secondary.type = "button"; secondary.className = "overlay-link";
      secondary.textContent = t("Discard saved run"); secondary.addEventListener("click", discard); overlay.appendChild(secondary);
    }
    const language = document.createElement("div");
    language.innerHTML = '<label class="language-choice">Language <select id="languagePicker" aria-label="Language"><option value="en">English</option><option value="ar">العربية</option><option value="ja">日本語</option></select></label>';
    overlay.appendChild(language);
    if (window.NeonI18n) window.NeonI18n.translate(language);
  }
  window.addEventListener("pagehide", () => saveRun(true));
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
  function cellAvailable(x, y, options) {
    const opts = options || {};
    if (x < 0 || y < 0 || x >= GRID || y >= GRID || occupied(x, y)) return false;
    if (!opts.ignoreFood && S.food && S.food.x === x && S.food.y === y) return false;
    if (!opts.ignorePowerup && S.powerup && S.powerup.x === x && S.powerup.y === y) return false;
    return !emitVeto("blockCell", { x, y });
  }
  function freeCell(options) {
    for (let guard = 0; guard < 500; guard++) {
      const p = { x: (Math.random() * GRID) | 0, y: (Math.random() * GRID) | 0 };
      if (cellAvailable(p.x, p.y, options)) return p;
    }
    // A deterministic fallback prevents an unlucky random streak from placing
    // food or a power-up inside the snake or an arena block.
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) if (cellAvailable(x, y, options)) return { x, y };
    }
    return null;
  }
  function addScore(n) { S.score += n * S.scoreMult; updateScore(); }
  function announce(text) { if (announcer) announcer.textContent = t(text); }
  function setStatus(text) { if (gameStatus) gameStatus.textContent = t(text); }
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
    toasts[key || label] = { glyph, label: t(label), color, dur };
  }
  function flash(text, color) { flashMsg = { text: t(text), color: color || "45,212,191" }; flashTtl = 1.6; }

  function updateScore() {
    S.score = Math.max(0, Math.round(S.score));
    scoreEl.textContent = S.score;
    if (S.score > S.best) {
      S.best = S.score; bestEl.textContent = S.best;
      const previous = storageGet(bestKey());
      if (previous !== undefined) {
        S.best = Math.max(S.best, parseBest(previous)); bestEl.textContent = S.best;
        storageSet(bestKey(), String(S.best));
      }
    }
    emit("score", S.score);
  }

  function placeFood() {
    const p = freeCell();
    if (!p) {
      // A temporary item must never occupy the last space needed for food.
      if (S.powerup) { S.powerup = null; return placeFood(); }
      S.food = null;
      if (S.running) gameOver("complete");
      return false;
    }
    // let content plugins decide a special food type occasionally
    let type = null;
    const keys = Object.keys(foodDefs);
    if (keys.length && Math.random() < 0.18) type = keys[(Math.random() * keys.length) | 0];
    S.food = { x: p.x, y: p.y, type };
    emit("foodspawn", S.food);
    return true;
  }

  function spawnPowerup() {
    const keys = Object.keys(powerupDefs);
    const type = keys[(Math.random() * keys.length) | 0];
    const p = freeCell();
    if (!p) return false;
    S.powerup = { x: p.x, y: p.y, type, ttl: cfg.PU_LIFETIME };
    return true;
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
  let pendingGameOverTimer = null;
  let runId = 0;

  function reset() {
    runId++;
    if (pendingGameOverTimer !== null) {
      clearTimeout(pendingGameOverTimer);
      pendingGameOverTimer = null;
    }
    const mid = Math.floor(GRID / 2);
    S.snake = [{ x: mid - 1, y: mid }, { x: mid - 2, y: mid }, { x: mid - 3, y: mid }];
    S.snake.forEach(s => { s.rx = s.x; s.ry = s.y; });
    S.dir = { x: 1, y: 0 }; S.nextDir = { x: 1, y: 0 };
    inputQueue.length = 0;
    S.score = 0; S.speed = cfg.BASE_SPEED; S.targetSpeed = cfg.BASE_SPEED;
    S.running = false; S.paused = false; S.dead = false;
    S.particles = []; S.effects = {}; S.scoreMult = 1; S.shield = false;
    S.foodEaten = 0; S.shake = 0; S.powerup = null;
    S.level = 1; S.steps = 0; S.lastReason = ""; S.effectiveSpeed = cfg.BASE_SPEED;
    for (const k in toasts) delete toasts[k];
    flashMsg = null; flashTtl = 0;
    loadBest();
    S.runBestBefore = S.best;
    S.food = null;
    emit("init");
    placeFood();
    updateScore();
    setStatus("Ready");
  }

  function startGame() {
    const pending = savedRun();
    if (!S.running && pending.raw && pending.record?.token !== checkpointToken) { showMenu(); overlay.scrollIntoView({block: "center", behavior: "auto"}); return; }
    if (checkpointToken) clearSavedRun(checkpointToken);
    reset();
    checkpointToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`; checkpointAt = -Infinity;
    boardWrap?.classList.remove("menu-open");
    S.running = true;
    overlay.classList.add("hidden");
    overlay.inert = true;
    lastTime = performance.now(); acc = 0;
    canvas.focus();
    setStatus("Playing");
    announce(`${S.mode} mode started`);
    emit("start");
    saveRun(true);
  }

  function togglePause() {
    if (!S.running || S.dead) return;
    S.paused = !S.paused;
    if (S.paused) {
      setStatus("Paused");
      setOverlay("Circuit paused", "Your run is paused. Resume when you are ready.", "Resume run", () => togglePause());
      const leave = document.createElement("button");
      leave.className = "overlay-link"; leave.type = "button";
      leave.textContent = t("End run & change mode");
      leave.addEventListener("click", () => {
        if (!S.running || !S.paused || S.dead) return;
        gameOver("quit");
        showMenu();
      });
      const explanation = document.createElement("p");
      explanation.className = "leave-run-note";
      explanation.textContent = t("End this run to choose a different mode or language.");
      overlay.appendChild(leave); overlay.appendChild(explanation);
      // Touch pause lives below the arena; reveal the complete decision panel.
      overlay.scrollIntoView({ block: "center", behavior: "auto" });
      announce("Game paused");
    } else {
      overlay.classList.add("hidden"); overlay.inert = true; canvas.focus(); lastTime = performance.now();
      setStatus("Playing"); announce("Game resumed");
    }
    saveRun(true);
  }

  function gameOver(reason) {
    if (S.dead) return;
    S.dead = true; S.running = false; S.lastReason = reason || "collision";
    if (checkpointToken) clearSavedRun(checkpointToken);
    checkpointToken = null;
    const endedByPlayer = S.lastReason === "quit";
    S.shake = cfg.REDUCED_MOTION || endedByPlayer ? 0 : 14;
    setStatus(S.lastReason === "complete" ? "Circuit complete" : "Game over");
    if (!endedByPlayer) { vibrate([45, 35, 90]); playTone("die"); }
    emit("gameover", S.score, S.lastReason);
    const isBest = S.score > S.runBestBefore;
    const finishedRun = runId;
    const result = {
      score: S.score,
      mode: S.mode,
      level: S.level,
      foodEaten: S.foodEaten,
      best: S.best,
      isBest,
      reason: S.lastReason,
    };
    const reasonLabels = {
      complete: "You filled every available cell. Circuit complete!",
      wall: "You hit the edge of the circuit.",
      self: "You crossed your own trail.",
      obstacle: "You hit an armed arena block.",
      quit: "You ended this run.",
    };
    pendingGameOverTimer = setTimeout(() => {
      if (finishedRun !== runId || !S.dead) return;
      pendingGameOverTimer = null;
      setOverlay(
        result.reason === "complete" ? "Circuit complete" : "Circuit ended",
        `<span class="big-score">${result.score}</span><span class="result-label">points in ${result.mode} mode</span>` +
        `<span class="result-reason">${reasonLabels[result.reason] || "The run ended after a collision."}</span>` +
        (result.isBest ? `<span class="new-best">★ New personal best</span>` : `<span class="result-meta">Best ${result.best} · Level ${result.level} · ${result.foodEaten} cores</span>`),
        "Run it again", () => startGame()
      );
      const menuButton = document.createElement("button");
      menuButton.className = "overlay-link"; menuButton.type = "button";
      menuButton.textContent = t("Change game mode"); menuButton.addEventListener("click", showMenu);
      overlay.appendChild(menuButton);
      announce(`Game over. Score ${S.score}`);
    }, 450);
  }

  function setOverlay(title, html, btnLabel, onClick) {
    overlay.innerHTML =
      `<h2>${title}</h2><div class="overlay-copy">${html}</div><button class="btn" id="ovBtn"><span>${btnLabel}</span><b aria-hidden="true">→</b></button>`;
    if (window.NeonI18n) window.NeonI18n.translate(overlay);
    overlay.classList.remove("hidden");
    overlay.inert = false;
    const button = document.getElementById("ovBtn");
    button.addEventListener("click", onClick);
    button.focus();
  }

  function showMenu() {
    if (pendingGameOverTimer !== null) {
      clearTimeout(pendingGameOverTimer);
      pendingGameOverTimer = null;
    }
    S.running = false; S.paused = false; S.dead = false;
    boardWrap?.classList.add("menu-open");
    overlay.innerHTML = initialOverlayHTML;
    if (window.NeonI18n) window.NeonI18n.translate(overlay);
    overlay.classList.remove("hidden");
    overlay.inert = false;
    setStatus("Ready");
    announce("Game mode menu opened");
    emit("menu");
    addResumeOffer();
    const button = document.getElementById("startBtn");
    if (button) button.focus();
  }

  // ---- input ----
  function setDir(x, y) {
    if (!S.running || S.paused || S.dead || Math.abs(x) + Math.abs(y) !== 1) return;
    const basis = inputQueue.length ? inputQueue[inputQueue.length - 1] : S.nextDir;
    if ((x === -basis.x && y === -basis.y) || (x === basis.x && y === basis.y)) return;
    if (inputQueue.length < 2) inputQueue.push({ x, y });
  }
  const keyMap = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
  };
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.isComposing || e.keyCode === 229) return;
    if (e.target?.isContentEditable) return;
    // Letter controls describe physical keys, so Arabic/Japanese input layouts
    // still support WASD, P and R while the board has focus.
    const physicalKeys = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", KeyP: "p", KeyR: "r" };
    const key = physicalKeys[e.code] || e.key;
    const control = e.target?.closest("button, input, textarea, select, a, [contenteditable='true']");
    // Pause/result overlays focus their action button. Keep the documented
    // game shortcuts usable there; Space/Enter still activate that button.
    const overlayShortcut = control?.tagName === "BUTTON" &&
      e.target?.closest("#overlay") === overlay &&
      ["p", "P", "r", "R", "Escape"].includes(key);
    if (control && !overlayShortcut) return;
    if (e.repeat && [" ", "p", "P", "r", "R", "Escape"].includes(key)) return;
    emit("keydown", key, e);
    if (keyMap[key]) {
      e.preventDefault();
      if (!S.running && !S.dead) startGame();
      setDir(keyMap[key][0], keyMap[key][1]);
    } else if (key === " " || key === "p" || key === "P") {
      e.preventDefault();
      if (S.running && !S.dead) togglePause();
      else if (!S.running && !S.dead) startGame();
    } else if (key === "r" || key === "R") {
      e.preventDefault(); startGame();
    } else if (key === "Escape" && S.running && !S.dead) {
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
      head.wrapX = head.x < 0 || head.x >= GRID;
      head.wrapY = head.y < 0 || head.y >= GRID;
      if (cfg.WALL_WRAP || ghost) {
        head.x = (head.x + GRID) % GRID; head.y = (head.y + GRID) % GRID;
      } else {
        const protectedFromWall = resolveCollision("wall", head);
        if (!protectedFromWall) { gameOver("wall"); return; }
        // A shielded wall hit re-enters from the opposite edge instead of
        // leaving the head outside the board for a frame.
        head.x = (head.x + GRID) % GRID; head.y = (head.y + GRID) % GRID;
      }
    }
    const willEat = S.food && head.x === S.food.x && head.y === S.food.y;
    const bodyToCheck = willEat ? S.snake : S.snake.slice(0, -1);
    const selfHitIndex = ghost ? -1 : bodyToCheck.findIndex(seg => seg.x === head.x && seg.y === head.y);
    if (selfHitIndex >= 0) {
      if (!resolveCollision("self", head)) { gameOver("self"); return; }
      // A protected self-hit cuts the loop at the collision point. Leaving the
      // overlapping body in place would trigger another unexplained death on
      // the very next step.
      S.snake.splice(Math.max(2, selfHitIndex));
    }

    head.rx = S.snake[0].x; head.ry = S.snake[0].y;
    S.snake.unshift(head);
    S.steps++;

    // power-up pickup
    if (S.powerup && head.x === S.powerup.x && head.y === S.powerup.y) {
      const def = powerupDefs[S.powerup.type];
      spawnParticles(S.powerup.x * CELL + CELL / 2, S.powerup.y * CELL + CELL / 2, def.color, 22);
      playTone("power");
      flash(def.glyph + "  " + t(def.label), def.color);
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
      emit("afterEat", S.food);
      S.targetSpeed = Math.min(cfg.MAX_SPEED, cfg.BASE_SPEED + S.score / 70);
      placeFood();
      if (!S.powerup && S.foodEaten % cfg.PU_SPAWN_EVERY === 0) spawnPowerup();
    } else {
      S.snake.pop();
    }
    emit("afterStep");
  }

  function tickEffects(dt) {
    for (const k of Object.keys(S.effects)) {
      if (!Number.isFinite(S.effects[k])) continue;
      S.effects[k] -= dt;
      if (S.effects[k] <= 0) delete S.effects[k];
    }
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
    const wraps = cfg.WALL_WRAP || ghosting;
    function interpolatedCell(previous, current, canWrap) {
      if (previous === undefined) return current;
      let delta = current - previous;
      if (canWrap && delta > GRID / 2) delta -= GRID;
      else if (canWrap && delta < -GRID / 2) delta += GRID;
      return previous + delta * t;
    }
    function drawSnakeSegment(px, py, pad, isHead, color) {
      if (px <= -CELL || py <= -CELL || px >= canvas.width || py >= canvas.height) return;
      ctx.fillStyle = color;
      if (isHead) { ctx.shadowColor = "rgba(45,212,191,0.9)"; ctx.shadowBlur = 18; }
      else ctx.shadowBlur = 0;
      roundRect(px + pad, py + pad, CELL - pad * 2, CELL - pad * 2, isHead ? 7 : 5); ctx.fill(); ctx.shadowBlur = 0;
      if (!isHead) return;
      ctx.fillStyle = "#04121a";
      const cx = px + CELL / 2, cy = py + CELL / 2, ox = S.dir.x * CELL * 0.13, oy = S.dir.y * CELL * 0.13;
      const perpx = S.dir.y, perpy = S.dir.x, e = CELL * 0.28;
      ctx.beginPath();
      ctx.arc(cx + ox + perpx * e * 0.6, cy + oy + perpy * e * 0.6, 1.9, 0, Math.PI * 2);
      ctx.arc(cx + ox - perpx * e * 0.6, cy + oy - perpy * e * 0.6, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = S.snake.length - 1; i >= 0; i--) {
      const seg = S.snake[i];
      const wrapsX = wraps || seg.wrapX;
      const wrapsY = wraps || seg.wrapY;
      const rx = interpolatedCell(seg.rx, seg.x, wrapsX);
      const ry = interpolatedCell(seg.ry, seg.y, wrapsY);
      const frac = 1 - i / S.snake.length, pad = 2 - frac, isHead = i === 0;
      let r1, g1, b1;
      if (S.effects.speed > 0) { r1 = 250; g1 = 204; b1 = 21; }
      else if (S.effects.slow > 0) { r1 = 96; g1 = 165; b1 = 250; }
      else if (S.effects.double > 0) { r1 = 251; g1 = 191; b1 = 36; }
      else { r1 = 45; g1 = Math.round(212 - frac); b1 = Math.round(191 - frac * 38); }
      ctx.globalAlpha = ghosting ? 0.45 : 1;
      const color = `rgb(${r1},${g1},${b1})`;
      const xOffsets = wrapsX ? [-GRID, 0, GRID] : [0];
      const yOffsets = wrapsY ? [-GRID, 0, GRID] : [0];
      for (const gx of xOffsets) {
        for (const gy of yOffsets) {
          drawSnakeSegment((rx + gx) * CELL, (ry + gy) * CELL, pad, isHead, color);
        }
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
      const fr2 = Number.isFinite(S.effects[k]) ? Math.max(0, S.effects[k] / (tt.dur || 6)) : 1;
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
    const wasFrozen = playing && S.effects.freeze > 0;
    const speedMult = playing ? tickEffects(dt) : 1;
    if (playing) S.speed += (S.targetSpeed - S.speed) * Math.min(1, dt * 2.5);
    const rawSpeed = S.speed * speedMult;
    const effSpeed = Math.max(0.001, Math.min(cfg.MAX_EFFECTIVE_SPEED, Number.isFinite(rawSpeed) ? rawSpeed : cfg.BASE_SPEED));
    S.effectiveSpeed = effSpeed;
    if (playing) {
      emit("tick", dt);
      if (wasFrozen) acc = 0;
      else acc += dt;
      const interval = 1 / effSpeed;
      let steps = 0;
      while (acc >= interval && steps++ < 5) {
        acc -= interval;
        for (const s of S.snake) {
          s.rx = s.x; s.ry = s.y;
          delete s.wrapX; delete s.wrapY;
        }
        step();
        if (S.dead) break;
      }
    }
    updateParticles(dt);
    const interp = playing ? Math.min(1, acc * effSpeed) : 1;
    render(interp);
    if (playing) saveRun();
    requestAnimationFrame(loop);
  }

  let booted = false;
  function boot() {
    if (booted) return; booted = true;
    reset();
    if (savedRun().raw) showMenu();
    requestAnimationFrame(loop);
  }

  function resolveCollision(kind, head) {
    return emitVeto("collide", { head, kind });
  }

  return {
    on, emit, boot, cfg, state: S, ctx, canvas, GRID, CELL, t,
    freeCell, cellAvailable, occupied, addScore, grow, shrink, addEffect, toast, flash,
    spawnParticles, playTone, roundRect, registerPowerup, registerFood,
    setOverlay, showMenu, startGame, togglePause, setDir, gameOver, loadBest, resolveCollision,
    registerRunState, saveRun, restoreRun, inspectSavedRun: () => savedRun().record,
    getEffects: () => Object.keys(S.effects).map(type => ({ type, remaining: S.effects[type], ...(powerupDefs[type] || {}) })),
    getCatalogue: () => ({
      powerups: Object.entries(powerupDefs).map(([type, def]) => ({ type, label: def.label, glyph: def.glyph, duration: def.dur })),
      foods: [{ type: "normal", glyph: "●", points: 10 }].concat(Object.entries(foodDefs).map(([type, def]) => ({ type, glyph: def.glyph, points: def.points }))),
    }),
  };
})();
