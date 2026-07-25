/* PLUGIN: MODES & MECHANICS  (owner: Agent 1)
 * Game modes, obstacles, difficulty curve, combo/streak scoring.
 * Extend via SnakeAPI hooks only. Do not edit core.js or other plugins. */
(function (API) {
  "use strict";
  if (!API) return;

  var S = API.state;
  var CELL = API.CELL;
  var GRID = API.GRID;
  var canvas = API.canvas;

  // ============================================================
  // 1. COMBO / STREAK SYSTEM
  // ============================================================
  // Eating food within COMBO_WINDOW seconds keeps and grows the streak.
  // Higher combos award escalating bonus points and a small HUD in the
  // top-right corner (clear of the top-left effect bars and score DOM).
  var COMBO_WINDOW = 3.0;          // seconds allowed between bites
  var combo = 0;                   // current streak length
  var comboTimer = 0;              // seconds remaining on the window
  var comboPulse = 0;              // 0..1 pop animation on each bite
  var bestCombo = 0;               // session best (for fun HUD detail)

  function comboMultiplier() {
    // combo 1 => x1, ramps up but stays tasteful
    if (combo < 2) return 1;
    if (combo < 4) return 2;
    if (combo < 6) return 3;
    if (combo < 9) return 4;
    return 5;
  }

  function comboColor() {
    if (combo < 2) return "148,163,184";   // slate
    if (combo < 4) return "94,234,212";     // teal
    if (combo < 6) return "250,204,21";     // amber
    if (combo < 9) return "251,146,60";     // orange
    return "244,63,94";                     // hot pink/red
  }

  // ============================================================
  // 2. OBSTACLES / WALLS MODE
  // ============================================================
  // Static blocks that kill the snake on contact. Registered as blocked
  // cells so food / power-ups never spawn on them. Count scales with score.
  var obstacles = [];              // [{x,y,t}] t = spawn-in animation 0..1
  var lastObstacleScore = -1;      // last score tier we spawned at

  function obstacleAt(x, y) {
    for (var i = 0; i < obstacles.length; i++) {
      if (obstacles[i].x === x && obstacles[i].y === y) return obstacles[i];
    }
    return null;
  }

  // Keep a safe radius around the snake head & food so we never spawn
  // an obstacle that's instantly unfair.
  function cellSafeForObstacle(x, y) {
    if (API.occupied(x, y)) return false;
    if (S.food && S.food.x === x && S.food.y === y) return false;
    if (S.powerup && S.powerup.x === x && S.powerup.y === y) return false;
    if (obstacleAt(x, y)) return false;
    var head = S.snake[0];
    if (head) {
      var d = Math.abs(head.x - x) + Math.abs(head.y - y);
      if (d < 4) return false;               // breathing room ahead of snake
    }
    // avoid the very border so wrap-around play stays readable
    if (x <= 0 || y <= 0 || x >= GRID - 1 || y >= GRID - 1) return false;
    return true;
  }

  function spawnObstacle() {
    for (var tries = 0; tries < 80; tries++) {
      var x = (Math.random() * GRID) | 0;
      var y = (Math.random() * GRID) | 0;
      if (cellSafeForObstacle(x, y)) {
        obstacles.push({ x: x, y: y, t: 0 });
        return true;
      }
    }
    return false;
  }

  // Target obstacle count grows with score: 0 until 30, then +1 per 40 pts,
  // capped so the board never gets choked.
  function targetObstacleCount() {
    if (S.score < 30) return 0;
    var n = 1 + Math.floor((S.score - 30) / 40);
    return Math.min(n, 14);
  }

  function maybeScaleObstacles() {
    var target = targetObstacleCount();
    while (obstacles.length < target) {
      if (!spawnObstacle()) break;
    }
  }

  // ============================================================
  // 3. NEAR-MISS JUICE (cheap)
  // ============================================================
  // After a step, if the head sits orthogonally adjacent to its own body
  // or an obstacle, emit a couple of tiny sparks. Throttled to stay cheap.
  var nearMissCooldown = 0;

  function checkNearMiss() {
    if (nearMissCooldown > 0) return;
    var head = S.snake[0];
    if (!head) return;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < dirs.length; i++) {
      var nx = head.x + dirs[i][0];
      var ny = head.y + dirs[i][1];
      // skip the cell directly behind the head (that's our own neck)
      if (S.snake[1] && nx === S.snake[1].x && ny === S.snake[1].y) continue;
      var hitBody = false;
      // start at 2 to skip the neck segment
      for (var j = 2; j < S.snake.length; j++) {
        if (S.snake[j].x === nx && S.snake[j].y === ny) { hitBody = true; break; }
      }
      var hitObs = obstacleAt(nx, ny);
      if (hitBody || hitObs) {
        var px = head.x * CELL + CELL / 2;
        var py = head.y * CELL + CELL / 2;
        var col = hitObs ? "148,163,184" : "45,212,191";
        API.spawnParticles(px, py, col, 3);
        nearMissCooldown = 0.18;
        return;
      }
    }
  }

  // ============================================================
  // HOOKS
  // ============================================================

  API.on("init", function () {
    combo = 0; comboTimer = 0; comboPulse = 0; bestCombo = 0;
    obstacles = []; lastObstacleScore = -1; nearMissCooldown = 0;
  });

  // Mark obstacle cells as blocked so food / power-ups avoid them.
  API.on("blockCell", function (cell) {
    return !!obstacleAt(cell.x, cell.y);
  });

  // Detect hitting an obstacle -> game over. The 'collide' hook only fires
  // for wall/self, so we check obstacles here in beforeStep against the
  // resolved head position. WALL_WRAP is on, so wrap the head first to
  // match where the snake will actually land.
  API.on("beforeStep", function (data) {
    var h = data.head;
    var hx = (h.x + GRID) % GRID;
    var hy = (h.y + GRID) % GRID;
    if (S.effects.ghost > 0) return;   // ghost passes through everything
    if (obstacleAt(hx, hy)) {
      var px = hx * CELL + CELL / 2;
      var py = hy * CELL + CELL / 2;
      API.spawnParticles(px, py, "248,113,113", 20);
      API.flash("CRASH", "248,113,113");
      // Returning false from beforeStep cancels the move (death) in core.
      return false;
    }
  });

  // Combo: every food bite extends/grows the streak and awards bonuses.
  API.on("afterEat", function () {
    if (comboTimer > 0) combo++;
    else combo = 1;
    comboTimer = COMBO_WINDOW;
    comboPulse = 1;
    if (combo > bestCombo) bestCombo = combo;

    var mult = comboMultiplier();
    if (mult > 1) {
      // Award the bonus on top of the base food score core already gave.
      // base food = 10; bonus = base * (mult - 1).
      var bonus = 10 * (mult - 1);
      API.addScore(bonus);
    }
    if (combo === 5 || combo === 8 || (combo >= 10 && combo % 5 === 0)) {
      API.flash(combo + "x COMBO!", comboColor());
    }
  });

  // After each step: scale obstacles, run near-miss juice.
  API.on("afterStep", function () {
    maybeScaleObstacles();
    // animate obstacle spawn-in
    for (var i = 0; i < obstacles.length; i++) {
      if (obstacles[i].t < 1) obstacles[i].t = Math.min(1, obstacles[i].t + 0.15);
    }
    checkNearMiss();
  });

  // Per-frame timers (combo window, pulses, cooldowns).
  API.on("tick", function (dt) {
    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) { combo = 0; comboTimer = 0; }
    }
    if (comboPulse > 0) comboPulse = Math.max(0, comboPulse - dt * 3);
    if (nearMissCooldown > 0) nearMissCooldown = Math.max(0, nearMissCooldown - dt);
  });

  // 3. DIFFICULTY CURVE: a subtle multiplicative ramp on top of core's
  // base speed ramp. Grows gently with food eaten, capped at +35%.
  API.on("speed", function () {
    var ramp = 1 + Math.min(0.35, S.foodEaten * 0.012);
    return ramp;
  });

  // ---- rendering: obstacles behind everything ----
  API.on("renderBg", function (ctx) {
    if (!obstacles.length) return;
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      var ease = o.t * o.t * (3 - 2 * o.t);   // smoothstep
      var size = CELL * (0.62 + 0.28 * ease);
      var ox = o.x * CELL + (CELL - size) / 2;
      var oy = o.y * CELL + (CELL - size) / 2;
      // glow
      ctx.fillStyle = "rgba(148,163,184," + (0.12 * ease) + ")";
      API.roundRect(ox - 3, oy - 3, size + 6, size + 6, 6);
      ctx.fill();
      // body
      ctx.save();
      ctx.globalAlpha = 0.92 * ease;
      var g = ctx.createLinearGradient(ox, oy, ox, oy + size);
      g.addColorStop(0, "rgba(100,116,139,1)");
      g.addColorStop(1, "rgba(51,65,85,1)");
      ctx.fillStyle = g;
      API.roundRect(ox, oy, size, size, 5);
      ctx.fill();
      // hazard cross-hatch highlight
      ctx.strokeStyle = "rgba(226,232,240,0.25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ox + size * 0.25, oy + size * 0.25);
      ctx.lineTo(ox + size * 0.75, oy + size * 0.75);
      ctx.moveTo(ox + size * 0.75, oy + size * 0.25);
      ctx.lineTo(ox + size * 0.25, oy + size * 0.75);
      ctx.stroke();
      ctx.restore();
    }
  });

  // ---- rendering: combo HUD top-right ----
  API.on("render", function (ctx) {
    if (combo < 2) return;   // only show once a streak is actually building

    var pad = 12;
    var w = 92;
    var h = 40;
    var x = canvas.width - w - pad;
    var y = pad;
    var col = comboColor();
    var pop = 1 + comboPulse * 0.12;

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(pop, pop);
    ctx.translate(-(x + w / 2), -(y + h / 2));

    // panel
    ctx.fillStyle = "rgba(2,12,18,0.55)";
    API.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(" + col + ",0.7)";
    ctx.lineWidth = 1.5;
    API.roundRect(x, y, w, h, 8);
    ctx.stroke();

    // combo count
    ctx.fillStyle = "rgb(" + col + ")";
    ctx.shadowColor = "rgb(" + col + ")";
    ctx.shadowBlur = 10 + comboPulse * 14;
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(combo + "x", x + 10, y + h / 2 + 1);
    ctx.shadowBlur = 0;

    // multiplier label
    var mult = comboMultiplier();
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "600 9px sans-serif";
    ctx.fillText("COMBO", x + 48, y + 13);
    ctx.fillStyle = "rgb(" + col + ")";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText((mult > 1 ? mult + "x pts" : "build!"), x + 48, y + 28);

    // shrinking timer bar
    var frac = Math.max(0, comboTimer / COMBO_WINDOW);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    API.roundRect(x + 8, y + h - 6, w - 16, 3, 1.5);
    ctx.fill();
    ctx.fillStyle = "rgb(" + col + ")";
    API.roundRect(x + 8, y + h - 6, (w - 16) * frac, 3, 1.5);
    ctx.fill();

    ctx.restore();
  });

  // Reset transient combo state on game over so it doesn't bleed visually.
  API.on("gameover", function () {
    combo = 0; comboTimer = 0; comboPulse = 0;
  });

})(window.SnakeAPI);
