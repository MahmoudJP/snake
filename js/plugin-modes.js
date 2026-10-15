/* Neon Coil: game modes, difficulty, combos, five stages, and arena hazards. */
(function (API) {
  "use strict";
  if (!API) return;

  var S = API.state;
  var CELL = API.CELL;
  var GRID = API.GRID;
  var canvas = API.canvas;
  var LEVELS = [
    { name: "Ignition", note: "Find the rhythm" },
    { name: "Pulse", note: "The arena wakes up" },
    { name: "Flux", note: "Pressure starts moving" },
    { name: "Overdrive", note: "Every turn matters" },
    { name: "Infinite", note: "Hold the coil" }
  ];

  var MODES = {
    classic: {
      name: "Classic Circuit", difficulty: "BALANCED",
      description: "Wrap through walls, build combos, and adapt as the arena evolves.",
      tip: "Tip: collect food quickly to keep your combo alive.",
      wrap: true, obstacles: true, baseSpeed: 6.5, maxSpeed: 18, effectiveCap: 23,
      obstacleStartLevel: 2, obstaclesPerLevel: 1, comboWindow: 3.4, levelStep: 100
    },
    rush: {
      name: "Rush Protocol", difficulty: "INTENSE",
      description: "Hard walls, an immediate speed boost, and hazards that arrive early.",
      tip: "Rush has hard walls. Plan the exit before you chase a combo.",
      wrap: false, obstacles: true, baseSpeed: 8.5, maxSpeed: 21, effectiveCap: 26,
      obstacleStartLevel: 1, obstaclesPerLevel: 2, comboWindow: 4, levelStep: 125
    },
    zen: {
      name: "Zen Flow", difficulty: "RELAXED",
      description: "A calmer, obstacle-free circuit for long runs and clean movement.",
      tip: "Zen removes arena hazards, but your own tail still matters.",
      wrap: true, obstacles: false, baseSpeed: 5, maxSpeed: 11, effectiveCap: 14,
      obstacleStartLevel: 99, obstaclesPerLevel: 0, comboWindow: 5, levelStep: 80
    }
  };

  var combo = 0;
  var comboTimer = 0;
  var comboPulse = 0;
  var bestCombo = 0;
  var obstacles = [];
  var nearMissCooldown = 0;

  function mode() { return MODES[S.mode] || MODES.classic; }

  function applyMode() {
    var m = mode();
    API.cfg.WALL_WRAP = m.wrap;
    API.cfg.BASE_SPEED = m.baseSpeed;
    API.cfg.MAX_SPEED = m.maxSpeed;
    API.cfg.MAX_EFFECTIVE_SPEED = m.effectiveCap;
    S.speed = m.baseSpeed;
    S.targetSpeed = m.baseSpeed;
    API.loadBest();
    API.emit("modechange", S.mode, m);
  }

  function setMode(id) {
    if (!MODES[id] || S.running) return false;
    S.mode = id;
    applyMode();
    return true;
  }

  function comboMultiplier() {
    if (combo < 2) return 1;
    if (combo < 4) return 2;
    if (combo < 6) return 3;
    if (combo < 9) return 4;
    return 5;
  }

  function comboColor() {
    if (combo < 2) return "148,163,184";
    if (combo < 4) return "94,234,212";
    if (combo < 6) return "250,204,21";
    if (combo < 9) return "251,146,60";
    return "244,63,94";
  }

  function updateLevel() {
    var m = mode();
    var nextLevel = Math.min(LEVELS.length, 1 + Math.floor(Math.max(0, S.score) / m.levelStep));
    nextLevel = Math.max(S.level, nextLevel);
    if (nextLevel > S.level) {
      S.level = nextLevel;
      API.flash("LEVEL " + S.level + " · " + LEVELS[S.level - 1].name.toUpperCase(), "94,234,212");
      API.emit("levelup", S.level);
    } else S.level = nextLevel;
    var complete = S.level === LEVELS.length;
    var levelFloor = (S.level - 1) * m.levelStep;
    var current = complete ? m.levelStep : Math.max(0, S.score - levelFloor);
    API.emit("progress", {
      level: S.level,
      name: LEVELS[S.level - 1].name,
      note: LEVELS[S.level - 1].note,
      nextName: complete ? null : LEVELS[S.level].name,
      complete: complete,
      current: current,
      target: m.levelStep,
      remaining: complete ? 0 : Math.max(0, m.levelStep - current)
    });
  }

  function obstacleAt(x, y) {
    for (var i = 0; i < obstacles.length; i++) {
      if (obstacles[i].x === x && obstacles[i].y === y) return obstacles[i];
    }
    return null;
  }

  function cellSafeForObstacle(x, y) {
    if (API.occupied(x, y) || obstacleAt(x, y)) return false;
    if (S.food && S.food.x === x && S.food.y === y) return false;
    if (S.powerup && S.powerup.x === x && S.powerup.y === y) return false;
    var head = S.snake[0];
    if (head) {
      var dx = Math.abs(head.x - x), dy = Math.abs(head.y - y);
      if (mode().wrap) { dx = Math.min(dx, GRID - dx); dy = Math.min(dy, GRID - dy); }
      // Give every new block enough travel time to fully fade in before it can
      // enter the player's path, including across a wrapping edge.
      if (dx + dy < 7) return false;
    }
    if (x <= 0 || y <= 0 || x >= GRID - 1 || y >= GRID - 1) return false;
    return true;
  }

  function spawnObstacle() {
    for (var tries = 0; tries < 100; tries++) {
      var x = (Math.random() * GRID) | 0;
      var y = (Math.random() * GRID) | 0;
      if (cellSafeForObstacle(x, y)) {
        obstacles.push({ x: x, y: y, t: 0, armed: false });
        return true;
      }
    }
    return false;
  }

  function targetObstacleCount() {
    var m = mode();
    if (!m.obstacles || S.level < m.obstacleStartLevel) return 0;
    return Math.min(12, 1 + (S.level - m.obstacleStartLevel) * m.obstaclesPerLevel);
  }

  function maybeScaleObstacles() {
    var target = targetObstacleCount();
    while (obstacles.length < target && spawnObstacle()) {}
  }

  function checkNearMiss() {
    if (nearMissCooldown > 0 || API.cfg.REDUCED_MOTION) return;
    var head = S.snake[0];
    if (!head) return;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < dirs.length; i++) {
      var nx = head.x + dirs[i][0], ny = head.y + dirs[i][1];
      if (S.snake[1] && nx === S.snake[1].x && ny === S.snake[1].y) continue;
      var danger = obstacleAt(nx, ny);
      for (var j = 2; !danger && j < S.snake.length; j++) {
        if (S.snake[j].x === nx && S.snake[j].y === ny) danger = true;
      }
      if (danger) {
        API.spawnParticles(head.x * CELL + CELL / 2, head.y * CELL + CELL / 2, "94,234,212", 3);
        nearMissCooldown = 0.22; return;
      }
    }
  }

  API.on("init", function () {
    applyMode();
    combo = 0; comboTimer = 0; comboPulse = 0; bestCombo = 0;
    obstacles = []; nearMissCooldown = 0; S.level = 1;
    updateLevel();
    API.emit("combochange", { combo: 0, multiplier: 1, best: 0, remaining: 0 });
  });

  API.on("blockCell", function (cell) { return !!obstacleAt(cell.x, cell.y); });

  API.on("beforeStep", function (data) {
    if (S.effects.ghost > 0 || !mode().obstacles) return;
    var h = data.head;
    var hx = API.cfg.WALL_WRAP ? (h.x + GRID) % GRID : h.x;
    var hy = API.cfg.WALL_WRAP ? (h.y + GRID) % GRID : h.y;
    var obstacle = obstacleAt(hx, hy);
    if (obstacle && obstacle.armed) {
      if (API.resolveCollision("obstacle", { x: hx, y: hy })) {
        obstacles.splice(obstacles.indexOf(obstacle), 1);
        API.spawnParticles(hx * CELL + CELL / 2, hy * CELL + CELL / 2, "56,189,248", 28);
        return;
      }
      API.spawnParticles(hx * CELL + CELL / 2, hy * CELL + CELL / 2, "248,113,113", 20);
      API.flash("CIRCUIT BREAK", "248,113,113");
      return false;
    }
  });

  API.on("afterEat", function () {
    combo = comboTimer > 0 ? combo + 1 : 1;
    comboTimer = mode().comboWindow; comboPulse = 1; bestCombo = Math.max(bestCombo, combo);
    var mult = comboMultiplier();
    if (mult > 1) API.addScore(10 * (mult - 1));
    if (combo === 5 || combo === 8 || (combo >= 10 && combo % 5 === 0)) API.flash(combo + "× FLOW", comboColor());
    updateLevel();
    API.emit("combochange", { combo: combo, multiplier: mult, best: bestCombo, remaining: comboTimer });
  });

  API.on("score", updateLevel);

  API.on("afterStep", function () {
    maybeScaleObstacles();
    for (var i = 0; i < obstacles.length; i++) {
      obstacles[i].t = Math.min(1, obstacles[i].t + 0.12);
      obstacles[i].armed = obstacles[i].t >= 1;
    }
    checkNearMiss();
  });

  API.on("tick", function (dt) {
    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) {
        combo = 0; comboTimer = 0;
        API.emit("combochange", { combo: 0, multiplier: 1, best: bestCombo, remaining: 0 });
      }
    }
    comboPulse = Math.max(0, comboPulse - dt * 3);
    nearMissCooldown = Math.max(0, nearMissCooldown - dt);
  });

  API.on("speed", function () { return 1 + Math.min(S.mode === "zen" ? 0.12 : 0.32, S.foodEaten * 0.011); });

  API.on("renderBg", function (ctx) {
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i], ease = o.t * o.t * (3 - 2 * o.t);
      var size = CELL * (0.62 + 0.28 * ease), ox = o.x * CELL + (CELL - size) / 2, oy = o.y * CELL + (CELL - size) / 2;
      ctx.save(); ctx.globalAlpha = ease; ctx.shadowColor = "rgba(248,113,113,.45)"; ctx.shadowBlur = 10;
      var g = ctx.createLinearGradient(ox, oy, ox, oy + size);
      g.addColorStop(0, "#64748b"); g.addColorStop(1, "#283548");
      ctx.fillStyle = g; API.roundRect(ox, oy, size, size, 6); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(248,113,113,.7)"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(ox + size * .26, oy + size * .26); ctx.lineTo(ox + size * .74, oy + size * .74);
      ctx.moveTo(ox + size * .74, oy + size * .26); ctx.lineTo(ox + size * .26, oy + size * .74); ctx.stroke();
      if (!o.armed) {
        ctx.strokeStyle = "rgba(94,234,212," + (0.35 + 0.35 * ease) + ")";
        ctx.setLineDash([3, 3]); ctx.strokeRect(ox - 3, oy - 3, size + 6, size + 6);
      }
      ctx.restore();
    }
  });

  API.on("render", function (ctx) {
    if (combo < 2) return;
    var w = 112, h = 46, x = canvas.width - w - 14, y = 14, col = comboColor();
    var pop = API.cfg.REDUCED_MOTION ? 1 : 1 + comboPulse * .1;
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(pop, pop); ctx.translate(-(x + w / 2), -(y + h / 2));
    ctx.fillStyle = "rgba(4,8,18,.76)"; API.roundRect(x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = "rgba(" + col + ",.72)"; API.roundRect(x, y, w, h, 10); ctx.stroke();
    ctx.fillStyle = "rgb(" + col + ")"; ctx.font = "800 21px sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(combo + "×", x + 10, y + 19);
    ctx.fillStyle = "#cbd5e1"; ctx.font = "700 9px sans-serif"; ctx.fillText(API.t(comboMultiplier() + "× POINTS"), x + 54, y + 18);
    ctx.fillStyle = "rgba(255,255,255,.1)"; API.roundRect(x + 10, y + 34, w - 20, 4, 2); ctx.fill();
    ctx.fillStyle = "rgb(" + col + ")"; API.roundRect(x + 10, y + 34, (w - 20) * Math.max(0, comboTimer / mode().comboWindow), 4, 2); ctx.fill(); ctx.restore();
  });

  API.on("gameover", function () {
    combo = 0; comboTimer = 0; comboPulse = 0;
    API.emit("combochange", { combo: 0, multiplier: 1, best: bestCombo, remaining: 0 });
  });

  API.modes = MODES;
  API.setMode = setMode;
  API.getMode = mode;
  API.getCombo = function () { return { combo: combo, multiplier: comboMultiplier(), best: bestCombo, remaining: comboTimer }; };
  API.getObstacles = function () { return obstacles.slice(); };
  API.getLevel = function () { return { level: S.level, ...LEVELS[S.level - 1] }; };
  API.registerRunState("modes", {
    capture: function () { return { combo: combo, comboTimer: comboTimer, bestCombo: bestCombo, nearMissCooldown: nearMissCooldown, obstacles: obstacles.map(o => ({...o})) }; },
    validate: function (data) {
      return !!data && Number.isSafeInteger(data.combo) && data.combo >= 0 && Number.isSafeInteger(data.bestCombo) && data.bestCombo >= data.combo &&
        Number.isFinite(data.comboTimer) && data.comboTimer >= 0 && data.comboTimer <= 5 &&
        Number.isFinite(data.nearMissCooldown) && data.nearMissCooldown >= 0 && data.nearMissCooldown <= 0.22 &&
        Array.isArray(data.obstacles) && data.obstacles.length <= 12 && data.obstacles.every(o => o && Number.isInteger(o.x) && Number.isInteger(o.y) &&
          o.x > 0 && o.y > 0 && o.x < GRID - 1 && o.y < GRID - 1 && Number.isFinite(o.t) && o.t >= 0 && o.t <= 1 && typeof o.armed === "boolean" && o.armed === (o.t >= 1));
    },
    restore: function (data) {
      combo = data.combo; comboTimer = data.comboTimer; bestCombo = data.bestCombo; comboPulse = 0;
      nearMissCooldown = data.nearMissCooldown; obstacles = data.obstacles.map(o => ({...o}));
      updateLevel();
      API.emit("combochange", { combo: combo, multiplier: comboMultiplier(), best: bestCombo, remaining: comboTimer });
    }
  });
})(window.SnakeAPI);
