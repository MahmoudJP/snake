/* PLUGIN: VISUAL FX & THEMES  (owner: Agent 2)
 * Animated backgrounds, snake trail glow, screen effects, color themes.
 * Extend via SnakeAPI hooks only. Do not edit core.js or other plugins. */
(function (API) {
  "use strict";
  if (!API) return;

  var S = API.state;
  var W = API.canvas.width, H = API.canvas.height;
  var CELL = API.CELL, GRID = API.GRID;

  // ------------------------------------------------------------------ //
  //  THEME SYSTEM — palette milestones cycle as the score climbs.
  //  Each theme drives the background hue + the additive snake glow.
  // ------------------------------------------------------------------ //
  var THEMES = [
    { name: "Teal",    at: 0,   c: "45,212,191",  bg: "12,40,46"  },
    { name: "Azure",   at: 80,  c: "56,189,248",  bg: "14,33,58"  },
    { name: "Violet",  at: 180, c: "167,139,250", bg: "32,22,58"  },
    { name: "Magenta", at: 300, c: "236,72,153",  bg: "48,16,42"  },
    { name: "Ember",   at: 450, c: "251,146,60",  bg: "48,28,14"  },
    { name: "Gold",    at: 640, c: "250,204,21",  bg: "44,38,10"  },
  ];
  var themeIdx = 0;
  // live, smoothly-interpolated colour the whole plugin paints with
  var cur = parseRGB(THEMES[0].c);
  var curBg = parseRGB(THEMES[0].bg);
  var tgt = parseRGB(THEMES[0].c);
  var tgtBg = parseRGB(THEMES[0].bg);

  function parseRGB(s) { var p = s.split(","); return [+p[0], +p[1], +p[2]]; }
  function rgbStr(a) { return (a[0] | 0) + "," + (a[1] | 0) + "," + (a[2] | 0); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpArr(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

  function pickTheme(score) {
    var idx = 0;
    for (var i = 0; i < THEMES.length; i++) if (score >= THEMES[i].at) idx = i;
    return idx;
  }
  function applyTheme(idx, announce) {
    themeIdx = idx;
    var th = THEMES[idx];
    tgt = parseRGB(th.c);
    tgtBg = parseRGB(th.bg);
    if (announce) API.flash("✦ " + th.name + " ✦", th.c);
  }

  // ------------------------------------------------------------------ //
  //  PARALLAX STARFIELD  — pooled, fixed count, depth layers.
  // ------------------------------------------------------------------ //
  var STAR_N = 70;
  var stars = new Array(STAR_N);
  function seedStars() {
    for (var i = 0; i < STAR_N; i++) {
      stars[i] = {
        x: Math.random() * W,
        y: Math.random() * H,
        z: 0.3 + Math.random() * 0.9,         // depth → parallax speed + size
        tw: Math.random() * Math.PI * 2,      // twinkle phase
      };
    }
  }
  seedStars();

  // ------------------------------------------------------------------ //
  //  RIPPLE RING POOL  — expanding rings on eat. Capped & reused.
  // ------------------------------------------------------------------ //
  var RING_MAX = 8;
  var rings = [];
  for (var r = 0; r < RING_MAX; r++) rings.push({ active: false, x: 0, y: 0, life: 0, col: "45,212,191" });
  function spawnRing(x, y, col) {
    var slot = null;
    for (var i = 0; i < rings.length; i++) { if (!rings[i].active) { slot = rings[i]; break; } }
    if (!slot) { // recycle the oldest (lowest life)
      slot = rings[0];
      for (var j = 1; j < rings.length; j++) if (rings[j].life < slot.life) slot = rings[j];
    }
    slot.active = true; slot.x = x; slot.y = y; slot.life = 1; slot.col = col;
  }

  // ------------------------------------------------------------------ //
  //  GLOBAL TIMERS / SCREEN STATE
  // ------------------------------------------------------------------ //
  var clock = 0;
  var gameoverPulse = 0;   // 1 → 0 desaturate/vignette pulse on death

  // ---- tick: advance animation clocks & ease the theme colours ----
  API.on("tick", function (dt) {
    clock += dt;

    // theme milestone check
    var want = pickTheme(S.score);
    if (want !== themeIdx) applyTheme(want, true);

    // ease live colour toward target (frame-rate independent-ish)
    var k = Math.min(1, dt * 3);
    cur = lerpArr(cur, tgt, k);
    curBg = lerpArr(curBg, tgtBg, k);

    // advance rings
    for (var i = 0; i < rings.length; i++) {
      if (rings[i].active) { rings[i].life -= dt * 1.6; if (rings[i].life <= 0) rings[i].active = false; }
    }

    if (gameoverPulse > 0) gameoverPulse = Math.max(0, gameoverPulse - dt * 0.8);
  });

  API.on("start", function () { clock = 0; gameoverPulse = 0; });
  API.on("init", function () {
    // reset theme to base on a fresh game
    themeIdx = 0;
    cur = parseRGB(THEMES[0].c); curBg = parseRGB(THEMES[0].bg);
    tgt = cur.slice(); tgtBg = curBg.slice();
    for (var i = 0; i < rings.length; i++) rings[i].active = false;
    gameoverPulse = 0;
  });

  API.on("afterEat", function (food) {
    if (API.cfg.REDUCED_MOTION) return;
    var col = rgbStr(cur);
    spawnRing(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, col);
  });

  API.on("gameover", function () { gameoverPulse = 1; });

  // ================================================================== //
  //  BACKGROUND  (drawn BEFORE grid + snake)
  // ================================================================== //
  API.on("renderBg", function (ctx) {
    var bg = curBg, glow = cur;
    // score nudges intensity so the board "warms up" as you climb
    var energy = Math.min(1, S.score / 700);

    // base vertical wash — keep it dark for snake readability
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(" + rgbStr([bg[0] * 0.5, bg[1] * 0.5, bg[2] * 0.5]) + ",1)");
    g.addColorStop(1, "rgba(6,10,16,1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // drifting radial glow that breathes with the clock + score
    var motionClock = API.cfg.REDUCED_MOTION ? 0 : clock;
    var bx = W * 0.5 + Math.sin(motionClock * 0.25) * W * 0.18;
    var by = H * 0.5 + Math.cos(motionClock * 0.19) * H * 0.18;
    var rad = W * (0.45 + 0.1 * Math.sin(motionClock * 0.4));
    var rg = ctx.createRadialGradient(bx, by, 0, bx, by, rad);
    var ga = 0.10 + energy * 0.10;
    rg.addColorStop(0, "rgba(" + rgbStr(glow) + "," + ga.toFixed(3) + ")");
    rg.addColorStop(1, "rgba(" + rgbStr(glow) + ",0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);

    // parallax starfield — twinkle + slow vertical drift, scaled by depth
    for (var i = 0; i < STAR_N; i++) {
      var s = stars[i];
      if (!API.cfg.REDUCED_MOTION) s.y += s.z * (4 + energy * 8) * 0.016;
      if (s.y > H) { s.y -= H; s.x = Math.random() * W; }
      var tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(clock * (1 + s.z) + s.tw));
      var sz = s.z * (0.9 + energy * 0.6);
      ctx.globalAlpha = tw * (0.25 + s.z * 0.4);
      ctx.fillStyle = "rgba(" + rgbStr(glow) + ",1)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, sz, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // faint glowing grid-line accent along the themed edges
    ctx.strokeStyle = "rgba(" + rgbStr(glow) + "," + (0.05 + energy * 0.05).toFixed(3) + ")";
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, W - 2, H - 2);
  });

  // ================================================================== //
  //  FOREGROUND FX  (drawn AFTER snake + particles)
  // ================================================================== //
  API.on("render", function (ctx, interp) {
    var glow = cur;
    var snake = S.snake;
    var t = (S.running && !S.paused && !S.dead) ? interp : 1;

    // ---- 1. SILKY MOTION TRAIL behind the head ----
    // Use interpolated rx/ry; additive 'lighter' so it layers light, never
    // fights the core snake colours. Tapers along the first several segments.
    if (snake.length && !API.cfg.REDUCED_MOTION) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      var trailLen = Math.min(7, snake.length);
      for (var i = 0; i < trailLen; i++) {
        var seg = snake[i];
        var rx = seg.rx !== undefined ? seg.rx + (seg.x - seg.rx) * t : seg.x;
        var ry = seg.ry !== undefined ? seg.ry + (seg.y - seg.ry) * t : seg.y;
        var cx = rx * CELL + CELL / 2, cy = ry * CELL + CELL / 2;
        var fade = (1 - i / trailLen);
        var rr = CELL * (0.34 + fade * 0.32);
        var a = fade * fade * 0.5;
        var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr * 2.4);
        rg.addColorStop(0, "rgba(" + rgbStr(glow) + "," + a.toFixed(3) + ")");
        rg.addColorStop(1, "rgba(" + rgbStr(glow) + ",0)");
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(cx, cy, rr * 2.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- 2. THEME GLOW HALO on the head — additive light only ----
      var head = snake[0];
      var hx = (head.rx !== undefined ? head.rx + (head.x - head.rx) * t : head.x) * CELL + CELL / 2;
      var hy = (head.ry !== undefined ? head.ry + (head.y - head.ry) * t : head.y) * CELL + CELL / 2;
      var pulse = 0.6 + 0.4 * Math.sin(clock * 6);
      var hr = CELL * (1.1 + 0.25 * pulse);
      var hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
      hg.addColorStop(0, "rgba(" + rgbStr(glow) + "," + (0.35 * pulse).toFixed(3) + ")");
      hg.addColorStop(1, "rgba(" + rgbStr(glow) + ",0)");
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ---- 3. EXPANDING RIPPLE RINGS (on eat) ----
    if (rings.length && !API.cfg.REDUCED_MOTION) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (var k = 0; k < rings.length; k++) {
        var R = rings[k];
        if (!R.active) continue;
        var prog = 1 - R.life;                 // 0 → 1
        var rad = CELL * (0.3 + prog * 3.2);
        var a = R.life * R.life * 0.55;
        ctx.strokeStyle = "rgba(" + R.col + "," + a.toFixed(3) + ")";
        ctx.lineWidth = Math.max(1, 3 * R.life);
        ctx.beginPath();
        ctx.arc(R.x, R.y, rad, 0, Math.PI * 2);
        ctx.stroke();
        // inner faint second ring
        ctx.lineWidth = Math.max(1, 1.5 * R.life);
        ctx.beginPath();
        ctx.arc(R.x, R.y, rad * 0.6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ---- 4. SUBTLE THEMED VIGNETTE (always) + GAMEOVER PULSE ----
    var vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.72);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    if (gameoverPulse > 0) {
      var gp = gameoverPulse;
      // desaturating dark flash that recedes
      ctx.fillStyle = "rgba(8,4,10," + (0.45 * gp).toFixed(3) + ")";
      ctx.fillRect(0, 0, W, H);
      // hot themed vignette ring snapping inward
      var gv = ctx.createRadialGradient(W / 2, H / 2, H * (0.2 + 0.3 * (1 - gp)), W / 2, H / 2, H * 0.75);
      gv.addColorStop(0, "rgba(0,0,0,0)");
      gv.addColorStop(1, "rgba(" + rgbStr(cur) + "," + (0.4 * gp).toFixed(3) + ")");
      ctx.fillStyle = gv;
      ctx.fillRect(0, 0, W, H);
    }
  });

})(window.SnakeAPI);
