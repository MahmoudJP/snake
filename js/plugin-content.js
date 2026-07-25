/* PLUGIN: CONTENT — POWER-UPS & FOODS  (owner: Agent 3)
 * New power-up types and special foods via registerPowerup / registerFood.
 * Extend via SnakeAPI hooks only. Do not edit core.js or other plugins. */
(function (API) {
  "use strict";
  if (!API) return;

  var S = API.state;
  var GRID = API.GRID, CELL = API.CELL;

  // small helpers ---------------------------------------------------------
  function head() { return S.snake[0]; }

  /* ======================================================================
   * POWER-UPS
   * ==================================================================== */

  // --- Magnet: food slowly drifts toward the snake's head -----------------
  API.registerPowerup({
    type: "magnet", color: "236,72,153", glyph: "🧲", label: "Magnet", dur: 7,
    apply: function () { API.addEffect("magnet", 7); }
  });
  var magnetAcc = 0;
  API.on("tick", function (dt) {
    if (!(S.effects.magnet > 0) || !S.food) return;
    magnetAcc += dt;
    // nudge food one cell toward the head a few times per second
    if (magnetAcc < 0.18) return;
    magnetAcc = 0;
    var h = head();
    var nx = S.food.x, ny = S.food.y;
    if (Math.abs(h.x - nx) >= Math.abs(h.y - ny)) {
      nx += h.x > nx ? 1 : (h.x < nx ? -1 : 0);
    } else {
      ny += h.y > ny ? 1 : (h.y < ny ? -1 : 0);
    }
    // don't let it land on the snake; only move into a free cell
    if (!API.occupied(nx, ny) && nx >= 0 && ny >= 0 && nx < GRID && ny < GRID) {
      S.food.x = nx; S.food.y = ny;
    }
  });

  // --- Multiplier x3: triple score for a short window ---------------------
  // Core only sets scoreMult to 2 for 'double'; we layer x3 ourselves.
  API.registerPowerup({
    type: "triple", color: "250,250,110", glyph: "✦", label: "3× Points", dur: 7,
    apply: function () { API.addEffect("triple", 7); }
  });
  API.on("tick", function () {
    // After core's tickEffects runs (it sets scoreMult from 'double'), bump to 3.
    if (S.effects.triple > 0) S.scoreMult = Math.max(S.scoreMult, 3);
  });

  // --- Shield: one free hit. Sets API.state.shield so others can read it. --
  API.registerPowerup({
    type: "shield", color: "56,189,248", glyph: "🛡", label: "Shield", dur: 0,
    apply: function () {
      S.shield = true;
      // persistent badge (no countdown) until consumed
      API.toast("🛡", "Shield", "56,189,248", 1, "shield");
      S.effects.shield = 999; // keep the toast bar visible
    }
  });
  // Consume the shield instead of dying. 'collide' veto: true prevents death.
  API.on("collide", function (info) {
    if (S.shield) {
      S.shield = false;
      delete S.effects.shield;
      API.flash("🛡 SHIELD!", "56,189,248");
      var h = head();
      API.spawnParticles(h.x * CELL + CELL / 2, h.y * CELL + CELL / 2, "56,189,248", 26);
      // if we got hit on a self-collision, the head is inside the body;
      // nudge by trimming a couple of segments so we don't instantly re-collide.
      if (info && info.kind === "self") API.shrink(2);
      return true; // prevent death
    }
  });

  // --- Time Freeze: snake stops moving briefly (breather + repositioning) --
  API.registerPowerup({
    type: "freeze", color: "165,243,252", glyph: "❄", label: "Time Freeze", dur: 2.5,
    apply: function () { API.addEffect("freeze", 2.5); }
  });
  // While frozen, scale speed to ~0 so movement effectively pauses.
  API.on("speed", function () {
    if (S.effects.freeze > 0) return 0.001;
  });

  // --- Mini: snake shrinks small and moves faster ------------------------
  API.registerPowerup({
    type: "mini", color: "134,239,172", glyph: "🐭", label: "Mini Snake", dur: 8,
    apply: function () {
      API.shrink(4);
      API.addEffect("mini", 8);
    }
  });
  API.on("speed", function () {
    if (S.effects.mini > 0) return 1.35;
  });

  // --- Rainbow Rush: steady score trickle while active --------------------
  API.registerPowerup({
    type: "rainbow", color: "244,114,182", glyph: "🌈", label: "Score Rush", dur: 6,
    apply: function () { API.addEffect("rainbow", 6); }
  });
  var rushAcc = 0;
  API.on("tick", function (dt) {
    if (!(S.effects.rainbow > 0)) return;
    rushAcc += dt;
    if (rushAcc >= 0.4) {
      rushAcc = 0;
      API.addScore(3); // modest trickle (respects multiplier)
    }
  });

  // --- Teleport: jump the head to a random free cell ---------------------
  API.registerPowerup({
    type: "teleport", color: "192,132,252", glyph: "🌀", label: "Teleport", dur: 0,
    apply: function () {
      var h = head();
      API.spawnParticles(h.x * CELL + CELL / 2, h.y * CELL + CELL / 2, "192,132,252", 24);
      var p = API.freeCell();
      // move only the head; body trails (gives a fun "snap" the next steps)
      h.x = p.x; h.y = p.y; h.rx = p.x; h.ry = p.y;
      API.spawnParticles(p.x * CELL + CELL / 2, p.y * CELL + CELL / 2, "192,132,252", 24);
    }
  });

  /* ======================================================================
   * FOODS  (special variants, ~18% spawn from this pool)
   * ==================================================================== */

  // --- Golden Apple: big points ------------------------------------------
  API.registerFood({
    type: "golden", color: "250,204,21", glyph: "🍎", points: 50,
    onEat: function () { API.flash("+50 GOLDEN", "250,204,21"); }
  });

  // --- Mega Fruit: +5 length, modest points ------------------------------
  API.registerFood({
    type: "mega", color: "52,211,153", glyph: "🍈", points: 15,
    onEat: function () { API.grow(5); API.flash("MEGA +5", "52,211,153"); }
  });

  // --- Cursed Fruit: risk — deducts points and adds length ---------------
  API.registerFood({
    type: "cursed", color: "139,92,246", glyph: "💀", points: -20,
    onEat: function () {
      API.grow(2);
      API.flash("CURSED!", "139,92,246");
      var h = head();
      API.spawnParticles(h.x * CELL + CELL / 2, h.y * CELL + CELL / 2, "139,92,246", 20);
    }
  });

  // --- Bonus Berry: worth more the faster you grab it --------------------
  // Track spawn time; award scaled bonus on eat. base points kept low.
  var berrySpawnAt = 0;
  API.registerFood({
    type: "berry", color: "59,130,246", glyph: "🫐", points: 5,
    onEat: function () {
      var elapsed = (performance.now() - berrySpawnAt) / 1000;
      // 40 bonus at instant grab, decaying to 0 over ~6s
      var bonus = Math.max(0, Math.round(40 * (1 - elapsed / 6)));
      if (bonus > 0) API.addScore(bonus);
      API.flash("BERRY +" + (5 + bonus), "59,130,246");
    }
  });
  // stamp the spawn time whenever a berry becomes the active food
  API.on("afterStep", function () {
    // Each placeFood() makes a fresh food object, so a new berry has no
    // _stamped flag; stamp it once to record its spawn time.
    if (S.food && S.food.type === "berry" && S.food._stamped !== true) {
      S.food._stamped = true;
      berrySpawnAt = performance.now();
    }
  });

  // --- Cherry Pair: two cherries, so an extra points bump ----------------
  API.registerFood({
    type: "cherry", color: "244,63,94", glyph: "🍒", points: 12,
    onEat: function () {
      API.addScore(8); // the second cherry of the pair
      API.flash("CHERRY PAIR", "244,63,94");
    }
  });

})(window.SnakeAPI);
