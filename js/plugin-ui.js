/* PLUGIN: UI / UX & AUDIO  (owner: Agent 4)
 * On-screen mobile controls, settings/sound toggle, richer audio & music.
 * Extend via SnakeAPI hooks only. Do not edit core.js or other plugins. */
(function (API) {
  "use strict";
  if (!API) return;

  /* ----------------------------------------------------------------------- *
   * Settings (persisted in localStorage)
   * ----------------------------------------------------------------------- */
  var LS_SOUND = "neonSnakeSound";
  var LS_MUSIC = "neonSnakeMusic";
  var LS_WRAP = "neonSnakeWrap";
  var LS_SCORES = "neonSnakeScores";

  function lsGet(k, def) {
    try {
      var v = localStorage.getItem(k);
      return v === null ? def : v;
    } catch (e) { return def; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var settings = {
    sound: lsGet(LS_SOUND, "1") === "1",
    music: lsGet(LS_MUSIC, "0") === "1",
    wrap: lsGet(LS_WRAP, API.cfg.WALL_WRAP ? "1" : "0") === "1",
  };
  // Apply persisted wrap to live config immediately.
  API.cfg.WALL_WRAP = settings.wrap;

  /* ----------------------------------------------------------------------- *
   * Styles (injected — we own UI, must not touch styles.css on disk)
   * ----------------------------------------------------------------------- */
  var style = document.createElement("style");
  style.textContent = [
    "#dock{display:flex;flex-direction:column;gap:12px;align-items:center;width:100%;}",
    ".ui-row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;align-items:center;}",
    ".ui-btn{font:inherit;font-size:13px;font-weight:600;letter-spacing:.02em;cursor:pointer;",
    "  color:#cdfdf5;background:rgba(45,212,191,.07);border:1px solid rgba(45,212,191,.4);",
    "  border-radius:10px;padding:8px 14px;transition:all .15s ease;",
    "  text-shadow:0 0 6px rgba(45,212,191,.4);-webkit-tap-highlight-color:transparent;user-select:none;}",
    ".ui-btn:hover{background:rgba(45,212,191,.16);box-shadow:0 0 14px rgba(45,212,191,.35);}",
    ".ui-btn:active{transform:scale(.94);}",
    ".ui-btn.on{background:rgba(45,212,191,.22);border-color:rgba(45,212,191,.9);",
    "  box-shadow:0 0 12px rgba(45,212,191,.5);color:#eafffb;}",
    ".ui-btn.off{opacity:.55;}",
    /* D-pad */
    "#dpad{display:none;gap:6px;grid-template-columns:repeat(3,56px);grid-template-rows:repeat(3,56px);",
    "  justify-content:center;touch-action:none;}",
    "#dpad.show{display:grid;}",
    "#dpad .pad{display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1;",
    "  color:#9af7e9;background:rgba(45,212,191,.08);border:1px solid rgba(45,212,191,.35);",
    "  border-radius:14px;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;",
    "  text-shadow:0 0 8px rgba(45,212,191,.6);transition:transform .08s,background .12s;}",
    "#dpad .pad:active{transform:scale(.9);background:rgba(45,212,191,.3);}",
    "#dpad .pad.empty{visibility:hidden;}",
    "#dpad .up{grid-column:2;grid-row:1;} #dpad .left{grid-column:1;grid-row:2;}",
    "#dpad .down{grid-column:2;grid-row:3;} #dpad .right{grid-column:3;grid-row:2;}",
    "#dpad .mid{grid-column:2;grid-row:2;}",
    /* scoreboard */
    ".ui-scores{font-size:11px;color:#8fd9cf;text-align:center;letter-spacing:.04em;opacity:.85;}",
    ".ui-scores b{color:#cdfdf5;}",
    /* show d-pad on touch / small screens */
    "@media (max-width:640px){#dpad{display:grid;}}",
  ].join("");
  document.head.appendChild(style);

  /* ----------------------------------------------------------------------- *
   * Audio — WebAudio, procedural. Registering an 'audio' hook means core
   * hands us ALL sound; we own it entirely.
   * ----------------------------------------------------------------------- */
  var actx = null, master = null;
  function ensureCtx() {
    if (actx) return actx;
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain();
      master.gain.value = 0.9;
      master.connect(actx.destination);
    } catch (e) { actx = null; }
    return actx;
  }
  function resumeCtx() {
    if (actx && actx.state === "suspended") { try { actx.resume(); } catch (e) {} }
  }

  // one short voice
  function blip(freq, t0, dur, type, vol, glideTo) {
    if (!actx) return;
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = type || "triangle";
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function sfx(type) {
    if (!settings.sound) return;
    if (!ensureCtx()) return;
    resumeCtx();
    var now = actx.currentTime;
    if (type === "eat") {
      blip(540, now, 0.13, "triangle", 0.16, 1080);
      blip(810, now + 0.02, 0.10, "sine", 0.08);
    } else if (type === "power") {
      // pleasant rising arpeggio
      var notes = [523.25, 659.25, 783.99, 1046.5];
      for (var i = 0; i < notes.length; i++) {
        blip(notes[i], now + i * 0.06, 0.16, "square", 0.11);
      }
    } else if (type === "die") {
      blip(330, now, 0.55, "sawtooth", 0.2, 55);
      blip(180, now + 0.05, 0.5, "triangle", 0.12, 40);
    } else {
      blip(660, now, 0.1, "triangle", 0.1);
    }
  }

  // Take over all of core's audio.
  API.on("audio", sfx);

  /* ----- background music: simple looping bass + arpeggio ----------------- */
  var music = { timer: null, step: 0, next: 0 };
  // C minor-ish vibe, low & tasteful
  var BASS = [130.81, 130.81, 174.61, 155.56]; // C3 C3 F3 Eb3
  var ARP = [
    [523.25, 622.25, 783.99], // C Eb G
    [523.25, 622.25, 783.99],
    [349.23, 440.0, 523.25],  // F A C
    [311.13, 392.0, 466.16],  // Eb G Bb
  ];
  var MUSIC_GAIN = null;

  function musicTick() {
    if (!settings.music || !settings.sound || !actx) return;
    var bar = music.step % BASS.length;
    var t = actx.currentTime + 0.04;
    // bass note (one per beat)
    var bo = actx.createOscillator(), bg = actx.createGain();
    bo.type = "triangle"; bo.frequency.value = BASS[bar];
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    bo.connect(bg); bg.connect(MUSIC_GAIN);
    bo.start(t); bo.stop(t + 0.45);
    // arp — three quick notes inside the beat
    var chord = ARP[bar];
    for (var i = 0; i < 3; i++) {
      var ao = actx.createOscillator(), ag = actx.createGain();
      ao.type = "sine"; ao.frequency.value = chord[i];
      var at = t + i * 0.14;
      ag.gain.setValueAtTime(0.0001, at);
      ag.gain.exponentialRampToValueAtTime(0.022, at + 0.01);
      ag.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
      ao.connect(ag); ag.connect(MUSIC_GAIN);
      ao.start(at); ao.stop(at + 0.15);
    }
    music.step++;
  }

  function startMusic() {
    if (music.timer) return;
    if (!settings.music || !settings.sound) return;
    if (!ensureCtx()) return;
    resumeCtx();
    if (!MUSIC_GAIN) {
      MUSIC_GAIN = actx.createGain();
      MUSIC_GAIN.gain.value = 0.5;
      MUSIC_GAIN.connect(master);
    }
    music.step = 0;
    musicTick();
    music.timer = setInterval(musicTick, 480); // ~125 bpm beat
  }
  function stopMusic() {
    if (music.timer) { clearInterval(music.timer); music.timer = null; }
  }

  /* ----------------------------------------------------------------------- *
   * Scoreboard — last 5 scores
   * ----------------------------------------------------------------------- */
  function readScores() {
    try { return JSON.parse(lsGet(LS_SCORES, "[]")) || []; } catch (e) { return []; }
  }
  function pushScore(s) {
    if (!s || s <= 0) return;
    var arr = readScores();
    arr.unshift(s);
    arr = arr.slice(0, 5);
    lsSet(LS_SCORES, JSON.stringify(arr));
    renderScores();
  }
  var scoresEl = null;
  function renderScores() {
    if (!scoresEl) return;
    var arr = readScores();
    if (!arr.length) { scoresEl.innerHTML = "<span style='opacity:.5'>No games yet</span>"; return; }
    scoresEl.innerHTML = "Last: " + arr.map(function (s, i) {
      return i === 0 ? "<b>" + s + "</b>" : s;
    }).join(" · ");
  }

  /* ----------------------------------------------------------------------- *
   * DOM controls in #dock
   * ----------------------------------------------------------------------- */
  function firstGesture() {
    ensureCtx(); resumeCtx();
    if (settings.music && settings.sound) startMusic();
    window.removeEventListener("pointerdown", firstGesture, true);
    window.removeEventListener("keydown", firstGesture, true);
  }
  window.addEventListener("pointerdown", firstGesture, true);
  window.addEventListener("keydown", firstGesture, true);

  function mkBtn(label, cls) {
    var b = document.createElement("button");
    b.className = "ui-btn" + (cls ? " " + cls : "");
    b.type = "button";
    b.innerHTML = label;
    return b;
  }
  function setToggleState(btn, on, labelOn, labelOff) {
    btn.classList.toggle("on", !!on);
    btn.classList.toggle("off", !on);
    btn.innerHTML = on ? labelOn : labelOff;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function buildDock() {
    var dock = document.getElementById("dock");
    if (!dock) return;

    /* --- settings row --- */
    var settingsRow = document.createElement("div");
    settingsRow.className = "ui-row";

    var pauseBtn = mkBtn("⏸ Pause");
    pauseBtn.addEventListener("click", function () {
      var st = API.state;
      if (st.running && !st.dead) API.togglePause();
      else if (!st.running && !st.dead) API.startGame();
    });

    var soundBtn = mkBtn("");
    setToggleState(soundBtn, settings.sound, "🔊 Sound", "🔇 Sound");
    soundBtn.addEventListener("click", function () {
      settings.sound = !settings.sound;
      lsSet(LS_SOUND, settings.sound ? "1" : "0");
      setToggleState(soundBtn, settings.sound, "🔊 Sound", "🔇 Sound");
      if (!settings.sound) stopMusic();
      else if (settings.music) startMusic();
    });

    var musicBtn = mkBtn("");
    setToggleState(musicBtn, settings.music, "🎵 Music", "🎵 Music");
    musicBtn.addEventListener("click", function () {
      settings.music = !settings.music;
      lsSet(LS_MUSIC, settings.music ? "1" : "0");
      setToggleState(musicBtn, settings.music, "🎵 Music", "🎵 Music");
      if (settings.music && settings.sound) startMusic();
      else stopMusic();
    });

    var wrapBtn = mkBtn("");
    setToggleState(wrapBtn, settings.wrap, "🧱 Wrap: On", "🧱 Wrap: Off");
    wrapBtn.addEventListener("click", function () {
      settings.wrap = !settings.wrap;
      API.cfg.WALL_WRAP = settings.wrap; // flips live
      lsSet(LS_WRAP, settings.wrap ? "1" : "0");
      setToggleState(wrapBtn, settings.wrap, "🧱 Wrap: On", "🧱 Wrap: Off");
    });

    settingsRow.appendChild(pauseBtn);
    settingsRow.appendChild(soundBtn);
    settingsRow.appendChild(musicBtn);
    settingsRow.appendChild(wrapBtn);
    dock.appendChild(settingsRow);

    /* --- scoreboard --- */
    scoresEl = document.createElement("div");
    scoresEl.className = "ui-scores";
    dock.appendChild(scoresEl);
    renderScores();

    /* --- D-pad --- */
    var dpad = document.createElement("div");
    dpad.id = "dpad";
    var cells = [
      { cls: "up", glyph: "▲", dx: 0, dy: -1 },
      { cls: "left", glyph: "◀", dx: -1, dy: 0 },
      { cls: "mid", glyph: "⏯", mid: true },
      { cls: "right", glyph: "▶", dx: 1, dy: 0 },
      { cls: "down", glyph: "▼", dx: 0, dy: 1 },
    ];
    cells.forEach(function (c) {
      var el = document.createElement("div");
      el.className = "pad " + c.cls;
      el.textContent = c.glyph;
      var handler = function (e) {
        e.preventDefault();
        var st = API.state;
        if (c.mid) {
          if (st.running && !st.dead) API.togglePause();
          else if (!st.dead) API.startGame();
          return;
        }
        if (!st.running && !st.dead) API.startGame();
        API.setDir(c.dx, c.dy);
      };
      el.addEventListener("pointerdown", handler);
      dpad.appendChild(el);
    });
    dock.appendChild(dpad);

    // show d-pad if touch-capable
    if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
      dpad.classList.add("show");
    }
  }

  /* ----------------------------------------------------------------------- *
   * Game lifecycle hooks
   * ----------------------------------------------------------------------- */
  API.on("start", function () {
    if (settings.music && settings.sound) startMusic();
  });
  API.on("gameover", function (score) {
    stopMusic();
    pushScore(score);
  });

  /* ----------------------------------------------------------------------- *
   * Init
   * ----------------------------------------------------------------------- */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildDock);
  } else {
    buildDock();
  }
})(window.SnakeAPI);
