/* Neon Circuit: mode selection, live telemetry, touch controls, settings, and audio. */
(function (API) {
  "use strict";
  if (!API) return;

  var KEYS = {
    sound: "neonCircuitSound", music: "neonCircuitMusic",
    effects: "neonCircuitEffects", haptics: "neonCircuitHaptics",
    mode: "neonCircuitMode", scores: "neonCircuitScores"
  };

  function get(key, fallback) { try { var v = localStorage.getItem(key); return v === null ? fallback : v; } catch (e) { return fallback; } }
  function set(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }

  var settings = {
    sound: get(KEYS.sound, "1") === "1",
    music: get(KEYS.music, "0") === "1",
    effects: get(KEYS.effects, API.cfg.REDUCED_MOTION ? "0" : "1") === "1",
    haptics: get(KEYS.haptics, "1") === "1"
  };
  API.cfg.REDUCED_MOTION = !settings.effects;
  API.cfg.HAPTICS = settings.haptics;

  var actx = null, master = null, musicTimer = null, musicStep = 0;
  function ensureAudio() {
    if (actx) return actx;
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain(); master.gain.value = .78; master.connect(actx.destination);
    } catch (e) { actx = null; }
    return actx;
  }
  function resumeAudio() { if (actx && actx.state === "suspended") actx.resume().catch(function () {}); }
  function tone(freq, when, duration, type, volume, endFreq, target) {
    if (!actx) return;
    var osc = actx.createOscillator(), gain = actx.createGain();
    osc.type = type || "triangle"; osc.frequency.setValueAtTime(freq, when);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, when + duration);
    gain.gain.setValueAtTime(.0001, when); gain.gain.exponentialRampToValueAtTime(volume, when + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    osc.connect(gain); gain.connect(target || master); osc.start(when); osc.stop(when + duration + .03);
  }
  function sfx(type) {
    if (!settings.sound || !ensureAudio()) return;
    resumeAudio(); var now = actx.currentTime;
    if (type === "eat") { tone(520, now, .12, "triangle", .13, 960); tone(780, now + .025, .09, "sine", .055); }
    else if (type === "power") [523, 659, 784, 1047].forEach(function (n, i) { tone(n, now + i * .052, .15, "square", .075); });
    else if (type === "die") { tone(330, now, .52, "sawtooth", .16, 52); tone(170, now + .04, .5, "triangle", .08, 38); }
  }
  API.on("audio", sfx);

  function musicBeat() {
    if (!settings.music || !settings.sound || !actx) return;
    var roots = [131, 131, 175, 156], chords = [[523, 622, 784], [523, 622, 784], [349, 440, 523], [311, 392, 466]];
    var index = musicStep % 4, now = actx.currentTime + .035;
    tone(roots[index], now, .38, "triangle", .025, null);
    chords[index].forEach(function (n, i) { tone(n, now + i * .13, .115, "sine", .011); });
    musicStep++;
  }
  function startMusic() {
    if (musicTimer || !settings.music || !settings.sound || !ensureAudio()) return;
    resumeAudio(); musicStep = 0; musicBeat(); musicTimer = setInterval(musicBeat, 500);
  }
  function stopMusic() { if (musicTimer) clearInterval(musicTimer); musicTimer = null; }

  function byId(id) { return document.getElementById(id); }
  function setText(id, value) { var el = byId(id); if (el) el.textContent = value; }

  function renderMode(id, m) {
    setText("modeName", m.name); setText("modeDescription", m.description);
    setText("difficultyPill", m.difficulty); setText("modeBadge", "●  " + m.name);
    setText("footerTip", m.tip);
    var status = byId("difficultyPill"); if (status) status.dataset.level = m.difficulty.toLowerCase();
    document.querySelectorAll(".mode-card").forEach(function (card) {
      var selected = card.dataset.mode === id;
      card.classList.toggle("active", selected); card.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    var button = byId("startBtn");
    if (button) button.innerHTML = "<span>Play " + m.name.replace(" Circuit", "").replace(" Protocol", "").replace(" Flow", "") + "</span><b aria-hidden='true'>→</b>";
  }

  function chooseMode(id) {
    if (!API.modes[id]) return;
    API.setMode(id); set(KEYS.mode, id); renderMode(id, API.modes[id]);
  }

  function bindModeCards() {
    document.querySelectorAll(".mode-card").forEach(function (card) {
      card.addEventListener("click", function () { chooseMode(card.dataset.mode); });
    });
    var preferred = get(KEYS.mode, "classic");
    chooseMode(API.modes[preferred] ? preferred : "classic");
  }

  function renderProgress(data) {
    setText("level", data.level);
    var bar = byId("levelProgress"); if (bar) bar.style.width = Math.min(100, data.current / data.target * 100) + "%";
    setText("levelGoal", data.remaining + " points to level " + (data.level + 1));
  }

  function renderCombo(data) { setText("combo", data.combo > 1 ? data.combo + "×" : "—"); }

  function renderTelemetry() {
    var S = API.state;
    setText("foodCount", S.foodEaten); setText("lengthCount", S.snake.length);
    setText("speedCount", (S.effectiveSpeed / (API.getMode().baseSpeed || 1)).toFixed(1) + "×");
    var effects = API.getEffects(), list = byId("effectList"); setText("effectCount", effects.length);
    if (!list) return;
    if (!effects.length) { list.innerHTML = "<p>No active power-ups yet.</p>"; return; }
    list.innerHTML = effects.map(function (effect) {
      return "<div class='effect-chip' style='--effect-color:" + (effect.color || "83,243,207") + "'><i></i><span>" +
        (effect.glyph || "●") + " " + (effect.label || effect.type) + "</span><b>" + Math.max(0, effect.remaining).toFixed(1) + "s</b></div>";
    }).join("");
  }

  function button(label, icon, pressed, handler) {
    var btn = document.createElement("button"); btn.type = "button"; btn.className = "dock-button";
    btn.innerHTML = "<i aria-hidden='true'>" + icon + "</i><span>" + label + "</span>";
    if (typeof pressed === "boolean") btn.setAttribute("aria-pressed", pressed ? "true" : "false");
    btn.addEventListener("click", handler); return btn;
  }
  function setPressed(btn, state) { btn.setAttribute("aria-pressed", state ? "true" : "false"); }

  function buildDock() {
    var dock = byId("dock"); if (!dock) return;
    var pause = button("Pause / resume", "Ⅱ", null, function () {
      if (API.state.running && !API.state.dead) API.togglePause(); else API.startGame();
    });
    var sound = button("Sound", "◖)", settings.sound, function () {
      settings.sound = !settings.sound; set(KEYS.sound, settings.sound ? "1" : "0"); setPressed(sound, settings.sound);
      if (!settings.sound) stopMusic(); else if (settings.music) startMusic();
    });
    var music = button("Music", "♫", settings.music, function () {
      settings.music = !settings.music; set(KEYS.music, settings.music ? "1" : "0"); setPressed(music, settings.music);
      if (settings.music && settings.sound) startMusic(); else stopMusic();
    });
    var effects = button("Visual effects", "✦", settings.effects, function () {
      settings.effects = !settings.effects; API.cfg.REDUCED_MOTION = !settings.effects;
      set(KEYS.effects, settings.effects ? "1" : "0"); setPressed(effects, settings.effects);
    });
    var haptics = button("Haptics", "≈", settings.haptics, function () {
      settings.haptics = !settings.haptics; API.cfg.HAPTICS = settings.haptics;
      set(KEYS.haptics, settings.haptics ? "1" : "0"); setPressed(haptics, settings.haptics);
    });
    [pause, sound, music, effects, haptics].forEach(function (btn) { dock.appendChild(btn); });
  }

  function buildTouchControls() {
    var host = byId("mobileControls"); if (!host) return;
    host.innerHTML = "<div class='touch-pad' aria-label='Direction pad'>" +
      "<button type='button' data-dir='up' aria-label='Move up'>↑</button>" +
      "<button type='button' data-dir='left' aria-label='Move left'>←</button>" +
      "<button type='button' data-dir='pause' aria-label='Pause or resume'>Ⅱ</button>" +
      "<button type='button' data-dir='right' aria-label='Move right'>→</button>" +
      "<button type='button' data-dir='down' aria-label='Move down'>↓</button></div>";
    var directions = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    host.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("pointerdown", function (event) {
        event.preventDefault(); var dir = btn.dataset.dir;
        if (dir === "pause") {
          if (API.state.running && !API.state.dead) API.togglePause(); else API.startGame();
          return;
        }
        if (!API.state.running && !API.state.dead) API.startGame();
        API.setDir(directions[dir][0], directions[dir][1]);
      });
    });
  }

  function readScores() { try { return JSON.parse(get(KEYS.scores, "[]")) || []; } catch (e) { return []; } }
  function saveScore(score) {
    if (!score) return;
    var scores = readScores(); scores.unshift({ score: score, mode: API.state.mode, at: Date.now() });
    set(KEYS.scores, JSON.stringify(scores.slice(0, 10)));
  }

  var telemetryTimer = 0;
  API.on("tick", function (dt) { telemetryTimer += dt; if (telemetryTimer > .1) { telemetryTimer = 0; renderTelemetry(); } });
  API.on("afterStep", renderTelemetry);
  API.on("start", function () { renderTelemetry(); if (settings.music && settings.sound) startMusic(); });
  API.on("gameover", function (score) { stopMusic(); saveScore(score); renderTelemetry(); });
  API.on("init", renderTelemetry);
  API.on("modechange", renderMode);
  API.on("progress", renderProgress);
  API.on("combochange", renderCombo);
  API.on("menu", bindModeCards);

  function unlockAudio() {
    ensureAudio(); resumeAudio();
    window.removeEventListener("pointerdown", unlockAudio, true); window.removeEventListener("keydown", unlockAudio, true);
  }
  window.addEventListener("pointerdown", unlockAudio, true); window.addEventListener("keydown", unlockAudio, true);

  bindModeCards(); buildDock(); buildTouchControls(); renderTelemetry();
})(window.SnakeAPI);
