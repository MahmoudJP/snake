/* User guide, complete registered item catalogue and recent-run history. */
(function (API) {
  "use strict";
  if (!API) return;
  var t = API.t;
  var descriptions = {
    speed: "Move faster for 6 seconds.", slow: "Slow down for 6 seconds.",
    grow: "Grow by 3 cells.", shrink: "Remove up to 3 tail cells.",
    double: "Double your points for 8 seconds.", ghost: "Pass through your trail and arena hazards for 6 seconds; edges wrap.",
    magnet: "Pull food towards your head for 7 seconds.", triple: "Triple your points for 7 seconds.",
    shield: "Absorb one collision. It stays until used.", freeze: "Stop movement for 2.5 seconds so you can plan a turn.",
    mini: "Remove up to 4 tail cells and move faster for 8 seconds.", rainbow: "Earn extra points regularly for 6 seconds.",
    teleport: "Move your head to a random free cell. Your body stays behind."
  };
  var foods = {
    normal: ["Core", "10 base points and normal growth."],
    golden: ["Golden Apple", "50 base points."],
    mega: ["Mega Fruit", "15 base points and 5 extra growth cells."],
    cursed: ["Cursed Fruit", "Lose 20 base points and gain 2 extra growth cells."],
    berry: ["Bonus Berry", "5 base points plus up to 40 extra points. Collect it quickly."],
    cherry: ["Cherry Pair", "12 base points plus 8 extra points."]
  };
  function byId(id) { return document.getElementById(id); }
  function addEntry(host, glyph, title, description) {
    if (!host) return;
    var item = document.createElement("div"), heading = document.createElement("strong"), copy = document.createElement("p");
    item.className = "catalogue-item"; heading.textContent = (glyph || "●") + " " + t(title); copy.textContent = t(description);
    item.appendChild(heading); item.appendChild(copy); host.appendChild(item);
  }
  var catalogue = API.getCatalogue();
  catalogue.powerups.forEach(function (item) { addEntry(byId("powerCatalogue"), item.glyph, item.label, descriptions[item.type] || "Collect to activate."); });
  catalogue.foods.forEach(function (item) { var info = foods[item.type] || [item.type, "Collect to earn points."]; addEntry(byId("foodCatalogue"), item.glyph, info[0], info[1]); });
  var guide = byId("playGuide"), clear = byId("clearHistory"), undo = byId("undoHistory"), undoAction = null;
  if (guide) guide.addEventListener("toggle", function () {
    if (guide.open && API.state.running && !API.state.dead && !API.state.paused) API.togglePause();
  });
  function renderHistory() {
    var host = byId("runHistory"); if (!host) return;
    host.innerHTML = "";
    var entries = API.readScores();
    if (clear) clear.disabled = entries.length === 0;
    if (!entries.length) { var empty = document.createElement("p"); empty.textContent = t("Finish a run to see it here."); host.appendChild(empty); return; }
    entries.forEach(function (entry) {
      var row = document.createElement("div"), result = document.createElement("strong"), detail = document.createElement("span"), time = document.createElement("time");
      row.className = "history-row"; result.textContent = entry.score + " " + t("pts");
      detail.textContent = t(API.modes[entry.mode].name);
      var date = new Date(entry.at); time.dateTime = date.toISOString(); time.textContent = date.toLocaleString(window.NeonI18n ? window.NeonI18n.language : "en");
      row.appendChild(result); row.appendChild(detail); row.appendChild(time); host.appendChild(row);
    });
  }
  if (clear) clear.addEventListener("click", function () {
    undoAction = API.clearScores();
    if (undo) undo.hidden = !undoAction;
  });
  if (undo) undo.addEventListener("click", function () {
    if (!undoAction) return;
    if (!undoAction()) {
      var notice = byId("storageNotice");
      if (notice) { notice.textContent = t("New runs or a save error prevented undo. Your current history was kept."); notice.hidden = false; }
    }
    undo.hidden = true;
    undoAction = null;
  });
  API.on("historychange", renderHistory);
  API.on("start", function () { if (guide) guide.open = false; });
  API.on("storageerror", function () { var notice = byId("storageNotice"); if (notice) notice.hidden = false; });
  renderHistory();
  if (API.cfg.STORAGE_UNAVAILABLE) { var notice = byId("storageNotice"); if (notice) notice.hidden = false; }
})(window.SnakeAPI);
