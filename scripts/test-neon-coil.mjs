import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../js/", import.meta.url);

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : force;
    if (enabled) this.values.add(name); else this.values.delete(name);
    return enabled;
  }
}

class FakeElement {
  constructor() {
    this.classList = new FakeClassList();
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.innerHTML = "";
    this.textContent = "";
  }
  addEventListener(name, callback) { (this.listeners ||= {})[name] = callback; }
  set innerHTML(value) { this.html = value; this.children = []; }
  get innerHTML() { return this.html; }
  focus() {}
  scrollIntoView(options) { this.lastScroll = options; }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this[name] = String(value); }
  querySelectorAll(selector) {
    if (this.id === 'mobileControls' && selector === 'button') {
      this.buttons ||= ['up','left','pause','right','down'].map(dir => {
        const button = new FakeElement(); button.tagName = 'BUTTON'; button.dataset.dir = dir; return button;
      });
      return this.buttons;
    }
    return [];
  }
  closest() { return null; }
}

function makeContext({ blockedStorage = false, hapticsSupported = true, language = 'en', initialSavedRun } = {}) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) { const created = new FakeElement(); created.id = id; elements.set(id, created); }
    return elements.get(id);
  };
  const canvas = element("game");
  canvas.width = 600;
  canvas.height = 600;
  const gradient = { addColorStop() {} };
  const context2d = new Proxy({}, {
    get(target, key) {
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
      if (!(key in target)) target[key] = () => {};
      return target[key];
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  canvas.getContext = () => context2d;

  let now = 0;
  let nextFrame = null;
  let nextTimerId = 1;
  const timers = new Map();
  let seed = 0x1a2b3c4d;
  const testMath = Object.create(Math);
  testMath.random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  const storage = new Map([["neonCoilBest:classic", "not-a-number"], ["neonCircuitBest:rush", "125"], ["neonCircuitSound", "0"]]);
  const readFailures = new Set();
  storage.set('neonCoilLanguage', language);
  if (initialSavedRun !== undefined) storage.set('neonCoilInterruptedRun', initialSavedRun);
  const listeners = {};
  const errors = [];
  const context = {
    console: { ...console, error: (...args) => errors.push(args) },
    Math: testMath,
    Date,
    Number,
    JSON,
    performance: { now: () => now },
    navigator: hapticsSupported ? { vibrate() {} } : {},
    localStorage: {
      getItem: (key) => { if (blockedStorage || readFailures.has(key)) throw new Error('Storage denied'); return storage.has(key) ? storage.get(key) : null; },
      setItem: (key, value) => { if (blockedStorage) throw new Error('Storage denied'); storage.set(key, String(value)); },
    },
    document: {
      hidden: false,
      addEventListener(name, callback) { (this.listeners ||= {})[name] = callback; },
      createElement: () => new FakeElement(),
      getElementById: element,
      querySelectorAll: () => [],
    },
    requestAnimationFrame(callback) { nextFrame = callback; return 1; },
    setTimeout(callback) { const id = nextTimerId++; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  context.window = context;
  context.window.addEventListener = (name, callback) => { (listeners[name] ||= []).push(callback); };
  context.window.removeEventListener = () => {};
  context.window.matchMedia = () => ({ matches: false });
  vm.createContext(context);

  function load(name) {
    vm.runInContext(readFileSync(new URL(name, root), "utf8"), context, { filename: name });
  }
  load("i18n.js");
  load("core.js");
  load("plugin-modes.js");
  load("plugin-fx.js");
  load("plugin-content.js");
  load("plugin-ui.js");
  load("plugin-guide.js");
  context.SnakeAPI.boot();

  function frame(milliseconds = 16) {
    now += milliseconds;
    const callback = nextFrame;
    nextFrame = null;
    assert.equal(typeof callback, "function", "animation frame was scheduled");
    callback(now);
  }
  function advance(milliseconds) {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 16) frame(Math.min(16, milliseconds - elapsed));
  }
  function runTimers() {
    const callbacks = [...timers.values()];
    timers.clear();
    callbacks.forEach((callback) => callback());
  }
  frame(0);
  return { API: context.SnakeAPI, i18n: context.NeonI18n, elements, advance, runTimers, timers, storage, readFailures, listeners, errors, document: context.document };
}

const { API, elements, advance, runTimers, timers, storage, listeners, errors } = makeContext();

function setSnake(cells, direction) {
  API.state.snake = cells.map(([x, y]) => ({ x, y, rx: x, ry: y }));
  API.state.dir = { ...direction };
  API.state.nextDir = { ...direction };
  API.state.food = { x: 15, y: 15, type: null };
}

assert.equal(API.state.best, 0, "corrupt saved scores fall back to zero");

API.setMode("classic");
API.startGame();
setSnake([[19, 5], [18, 5], [17, 5]], { x: 1, y: 0 });
advance(180);
assert.equal(API.state.dead, false, "Classic survives a wrapped edge");
assert.equal(API.state.snake[0].x, 0, "Classic re-enters on the opposite edge");

API.startGame();
setSnake([[6, 0], [6, 1], [6, 2]], { x: 0, y: -1 });
advance(180);
assert.equal(API.state.dead, false, "vertical wrapping is safe");
assert.equal(API.state.snake[0].y, 19, "vertical wrapping re-enters on the opposite edge");

API.startGame();
setSnake([[2, 2], [2, 3], [1, 3], [1, 2]], { x: -1, y: 0 });
advance(180);
assert.equal(API.state.dead, false, "moving into a departing tail cell is legal");

API.startGame();
setSnake([[2, 2], [2, 3], [1, 3], [1, 2], [0, 2]], { x: -1, y: 0 });
API.state.shield = true;
API.state.effects.shield = Infinity;
advance(180);
assert.equal(API.state.dead, false, "shield protects a self collision");
assert.equal(API.state.shield, false, "shield is consumed once");
assert.equal(new Set(API.state.snake.map(({ x, y }) => `${x}:${y}`)).size, API.state.snake.length, "protected self collision leaves no overlapping body cells");

API.showMenu();
API.setMode("rush");
API.startGame();
setSnake([[19, 7], [18, 7], [17, 7]], { x: 1, y: 0 });
API.state.shield = true;
API.state.effects.shield = Infinity;
advance(130);
assert.equal(API.state.dead, false, "shield protects a hard-wall collision");
assert.equal(API.state.snake[0].x, 0, "shielded wall collisions re-enter safely");
assert.equal(API.state.shield, false, "a wall consumes the shield");

API.startGame();
setSnake([[19, 7], [18, 7], [17, 7]], { x: 1, y: 0 });
advance(130);
assert.equal(API.state.dead, true, "Rush keeps its hard wall rule");
assert.equal(API.state.lastReason, "wall", "wall deaths retain an explicit cause");
assert.equal(timers.size, 1, "game over schedules one result overlay");
API.startGame();
assert.equal(timers.size, 0, "starting again cancels the stale result overlay");
runTimers();
assert.equal(API.state.dead, false, "a stale timer cannot interrupt the new run");
assert.equal(elements.get("overlay").classList.contains("hidden"), true, "the new run stays visible");

API.showMenu();
API.setMode("rush");
API.startGame();
setSnake([[19, 7], [18, 7], [17, 7]], { x: 1, y: 0 });
advance(130);
runTimers();
assert.match(elements.get("overlay").innerHTML, /edge of the circuit/, "the result explains a wall death");

API.showMenu();
API.setMode("classic");
API.startGame();
API.addScore(100);
API.emit("afterStep");
const obstacle = API.getObstacles()[0];
assert.ok(obstacle, "level two introduces an arena block");
assert.equal(obstacle.armed, false, "new arena blocks begin as warnings");
const head = API.state.snake[0];
const dx = Math.min(Math.abs(head.x - obstacle.x), API.GRID - Math.abs(head.x - obstacle.x));
const dy = Math.min(Math.abs(head.y - obstacle.y), API.GRID - Math.abs(head.y - obstacle.y));
assert.ok(dx + dy >= 7, "new blocks keep a safe toroidal distance from the player");
for (let i = 0; i < 7; i++) API.emit("afterStep");
assert.equal(obstacle.armed, false, "a block cannot kill while it is still fading in");
API.emit("afterStep");
assert.equal(obstacle.armed, true, "a fully visible block becomes active");

API.startGame();
API.addScore(100);
API.emit("afterStep");
const shieldedObstacle = API.getObstacles()[0];
assert.ok(shieldedObstacle, "the shield scenario has an arena block");
const nextX = (API.state.snake[0].x + API.state.dir.x + API.GRID) % API.GRID;
const nextY = (API.state.snake[0].y + API.state.dir.y + API.GRID) % API.GRID;
shieldedObstacle.x = nextX;
shieldedObstacle.y = nextY;
shieldedObstacle.t = 1;
shieldedObstacle.armed = true;
API.state.shield = true;
API.state.effects.shield = Infinity;
advance(180);
assert.equal(API.state.dead, false, "shield protects an armed-obstacle collision");
assert.equal(API.state.shield, false, "an obstacle consumes the shield");
assert.equal(API.getObstacles().includes(shieldedObstacle), false, "the shield clears the block it absorbed");

API.state.targetSpeed = 100;
API.state.effects.speed = 5;
API.state.effects.mini = 5;
advance(1000);
assert.ok(API.state.effectiveSpeed <= API.cfg.MAX_EFFECTIVE_SPEED, "stacked boosts stay below the mode safety cap");

API.showMenu();
API.setMode("rush");
assert.equal(API.state.best, 125, "old per-mode records migrate without being removed");
assert.equal(storage.get("neonCircuitBest:rush"), "125", "migration preserves legacy data");
assert.equal(storage.get("neonCoilSound"), "0", "old sound preference is preserved");
API.setMode("zen");
API.startGame();
assert.equal(API.setMode("rush"), false, "a running game cannot change mode");
API.state.effects.freeze = .6;
const frozenX = API.state.snake[0].x;
advance(500);
assert.equal(API.state.snake[0].x, frozenX, "time freeze prevents movement");
advance(150);
assert.equal(API.state.snake[0].x, frozenX, "expired freeze does not release queued movement");
advance(250);
assert.ok(API.state.steps <= 1, "normal cadence resumes after freeze");

function key(key, extra = {}) {
  const event = { key, target: new FakeElement(), preventDefault() {}, ...extra };
  listeners.keydown.forEach(callback => callback(event));
}
API.startGame();
key(" ", { target: { closest: () => ({}) } });
assert.equal(API.state.paused, false, "space on a control is handled only by that control");
key("p", { metaKey: true });
assert.equal(API.state.paused, false, "browser modifier shortcuts do not pause the game");
key("p");
assert.equal(API.state.paused, true, "pause shortcut works on the game board");
key("p", { repeat: true });
assert.equal(API.state.paused, true, "holding pause does not oscillate state");
key("p");
assert.equal(API.state.paused, false, "pause shortcut resumes the game");
assert.equal(elements.get("overlay").inert, true, "hidden menu cannot steal keyboard focus");

API.startGame();
key('p');
const resumeControl = new FakeElement();
resumeControl.tagName = 'BUTTON';
resumeControl.closest = (selector) => selector === '#overlay' ? elements.get('overlay') : selector.includes('button') ? resumeControl : null;
key('p', { target: resumeControl, repeat: true });
assert.equal(API.state.paused, true, 'held P on the automatically focused Resume button does not oscillate');
key('p', { target: resumeControl });
assert.equal(API.state.paused, false, 'P resumes from the automatically focused Resume button');
key('Escape');
key('Escape', { target: resumeControl });
assert.equal(API.state.paused, false, 'Escape resumes from the focused overlay control');
API.addScore(100);
key('p');
key('r', { target: resumeControl });
assert.equal(API.state.score, 0, 'R restarts from the focused pause control');
key('p', { target: { tagName: 'BUTTON', closest: selector => selector === '#overlay' ? null : {} } });
assert.equal(API.state.paused, false, 'P on an external button does not affect the game');

API.startGame();
API.state.food = { x: 10, y: 10, type: "berry" };
API.emit("foodspawn", API.state.food);
API.togglePause();
advance(7000);
API.togglePause();
advance(220);
assert.ok(API.state.score >= 44, "berry bonus measures active play and survives a long pause");

API.startGame();
const cells = [];
for (let y = 0; y < API.GRID; y++) for (let x = 0; x < API.GRID; x++) {
  if (!(x === 10 && y === 10)) cells.push([x, y]);
}
// Put the head immediately before the only remaining cell; growing fills it.
const headIndex = cells.findIndex(([x,y]) => x === 9 && y === 10);
cells.unshift(...cells.splice(headIndex, 1));
setSnake(cells, { x: 1, y: 0 });
API.state.food = { x: 10, y: 10, type: null };
advance(220);
assert.equal(API.state.lastReason, "complete", "filling the board finishes with a win");
runTimers();
assert.match(elements.get("overlay").innerHTML, /Circuit complete/, "win result is explicit");

// Exercise pickups through the real engine, rather than calling registry methods.
function preparePickup(type, length = 3) {
  API.showMenu(); API.setMode('zen'); API.startGame();
  setSnake(Array.from({ length }, (_, i) => [9 - i, 10]), { x: 1, y: 0 });
  API.state.powerup = { x: 10, y: 10, type, ttl: 7 };
  advance(220);
  assert.equal(API.state.dead, false, `${type} pickup survives`);
  assert.equal(API.state.powerup, null, `${type} is consumed exactly once`);
}
for (const type of ['speed', 'slow', 'double', 'ghost', 'magnet', 'triple', 'freeze', 'rainbow']) {
  preparePickup(type);
  assert.ok(API.state.effects[type] > 0, `${type} activates its timed effect`);
  assert.ok(API.getEffects().some(effect => effect.type === type), `${type} appears in telemetry`);
}
preparePickup('grow'); assert.equal(API.state.snake.length, 6, 'grow pickup adds three segments');
preparePickup('shrink', 7); assert.equal(API.state.snake.length, 4, 'shrink pickup removes three segments');
preparePickup('mini', 8); assert.equal(API.state.snake.length, 4, 'mini removes four segments');
assert.ok(API.state.effects.mini > 0, 'mini activates its speed effect');
preparePickup('shield'); assert.equal(API.state.shield, true, 'shield pickup arms protection');
assert.equal(API.state.effects.shield, Infinity, 'shield lasts until consumed');
preparePickup('teleport');
assert.notDeepEqual([API.state.snake[0].x, API.state.snake[0].y], [10, 10], 'teleport changes head position');
assert.equal(new Set(API.state.snake.map(cell => `${cell.x}:${cell.y}`)).size, API.state.snake.length, 'teleport lands outside occupied body');

for (const [type, multiplier] of [['double', 2], ['triple', 3]]) {
  preparePickup(type); advance(16);
  API.state.food = { x: API.state.snake[0].x + 1, y: 10, type: 'golden' };
  advance(220);
  assert.equal(API.state.score, 5 + 50 * multiplier, `${type} applies to special-food points`);
}
preparePickup('ghost');
API.state.food = { x: 15, y: 15, type: null };
setSnake([[2,2],[2,3],[1,3],[1,2],[0,2]], { x:-1, y:0 });
advance(220); assert.equal(API.state.dead, false, 'ghost passes through a non-departing body cell');

preparePickup('rainbow'); const beforeRush = API.state.score;
advance(1000); assert.ok(API.state.score > beforeRush, 'rainbow adds points during active play');
API.togglePause(); const pausedRush = API.state.score;
advance(3000); assert.equal(API.state.score, pausedRush, 'rainbow does not award points while paused');
API.togglePause(); advance(6500);
assert.equal(API.state.effects.rainbow, undefined, 'rainbow expires');
const afterRush = API.state.score; advance(1000);
assert.equal(API.state.score, afterRush, 'expired rainbow stops awarding points');

preparePickup('magnet');
API.state.food = { x: 17, y: 12, type: null };
const distance = () => Math.abs(API.state.food.x - API.state.snake[0].x) + Math.abs(API.state.food.y - API.state.snake[0].y);
const beforeMagnet = distance(); advance(400);
assert.ok(distance() < beforeMagnet, 'magnet draws food closer without overlapping the snake');
assert.equal(API.occupied(API.state.food.x, API.state.food.y), false, 'magnet keeps food outside body');
API.startGame();
setSnake([[0,5],[0,6],[0,7]], {x:0,y:-1});
API.state.food = {x:18,y:5,type:null}; API.state.effects.magnet = 7;
API.emit('tick',0.18);
assert.equal(API.state.food.x,19,'magnet takes the shortest wrapped route toward an edge head');
setSnake([[5,0],[6,0],[7,0]], {x:-1,y:0});
API.state.food = {x:5,y:18,type:null}; API.emit('tick',0.18);
assert.equal(API.state.food.y,19,'magnet uses the shortest wrapped vertical route');
API.showMenu(); API.setMode('rush'); API.startGame();
setSnake([[0,5],[0,6],[0,7]], {x:0,y:-1});
API.state.food = {x:18,y:5,type:null}; API.state.effects.magnet = 7;
API.emit('tick',0.18); assert.equal(API.state.food.x,17,'Rush magnet uses the non-wrapping route');
API.state.effects.ghost = 7; API.emit('tick',0.18);
assert.equal(API.state.food.x,18,'ghost makes magnet honor wrapping even in Rush');
setSnake([[0,5],[19,5],[19,6]], {x:0,y:-1});
API.state.food = {x:18,y:5,type:null}; API.emit('tick',0.18);
assert.equal(API.state.food.x,18,'magnet refuses a wrapped candidate occupied by the snake');

for (const [type, points, length] of [[null, 10, 4], ['golden', 50, 4], ['mega', 15, 9], ['cursed', -20, 6], ['cherry', 20, 4]]) {
  API.showMenu(); API.setMode('zen'); API.startGame();
  setSnake([[9,10],[8,10],[7,10]], { x:1, y:0 });
  API.state.score = 100; API.state.food = { x:10, y:10, type };
  advance(220);
  assert.equal(API.state.score, 100 + points, `${type ?? 'normal'} food awards expected points`);
  assert.equal(API.state.snake.length, length, `${type ?? 'normal'} food applies expected growth`);
}

API.startGame();
setSnake([[9,10],[8,10],[7,10]], {x:1,y:0});
API.setDir(0,-1); API.setDir(-1,0); API.setDir(0,1);
advance(430);
assert.deepEqual([API.state.snake[0].x,API.state.snake[0].y],[8,9], 'two rapid legal turns execute across successive steps');
advance(220); assert.equal(API.state.snake[0].y,9,'third buffered turn is ignored at queue capacity');
API.startGame(); API.setDir(0,-1); API.setDir(0,1); advance(430);
assert.equal(API.state.dir.y,-1,'reverse of queued direction is rejected');

const isolated = makeContext({ blockedStorage: true });
isolated.API.startGame(); isolated.API.addScore(10); isolated.API.gameOver('self'); isolated.runTimers();
assert.deepEqual(isolated.errors, [], 'denied localStorage does not break core or plugins');
isolated.API.startGame(); isolated.document.hidden = true; isolated.document.listeners.visibilitychange();
assert.equal(isolated.API.state.paused,true,'hidden document automatically pauses play');
const touch = makeContext();
const pad = touch.elements.get('mobileControls').querySelectorAll('button');
pad.find(button => button.dataset.dir === 'up').listeners.click();
assert.equal(touch.API.state.running,true,'direction-pad click starts a menu game');
touch.advance(220); assert.equal(touch.API.state.dir.y,-1,'direction-pad native click changes direction');
const pauseButton = pad.find(button => button.dataset.dir === 'pause');
pauseButton.listeners.click(); assert.equal(touch.API.state.paused,true,'pause pad click pauses');
pauseButton.listeners.click(); assert.equal(touch.API.state.paused,false,'pause pad click resumes');
touch.API.showMenu(); touch.API.startGame();
const touchCanvas = touch.elements.get('game');
touchCanvas.listeners.touchstart({touches:[{clientX:100,clientY:100}]});
touchCanvas.listeners.touchend({changedTouches:[{clientX:100,clientY:60}]});
touch.advance(220); assert.equal(touch.API.state.dir.y,-1,'canvas upward swipe changes direction');
touchCanvas.listeners.touchstart({touches:[{clientX:100,clientY:100}]});
touchCanvas.listeners.touchend({changedTouches:[{clientX:108,clientY:108}]});
touch.advance(220); assert.equal(touch.API.state.dir.y,-1,'short taps do not create a turn');
assert.deepEqual(errors, [], "all five plugins run without hook exceptions");
console.log("Neon Coil regression checks passed (engine, 13 powerups, 6 foods, all plugins, input, storage, pause and completion).");

// Physical letter controls remain usable under non-Latin keyboard layouts;
// composition/editing and browser shortcuts must still pass through.
const layoutGame = makeContext();
const layoutKey = (key, code, extras = {}) => {
  let prevented = false;
  const event = { key, code, target: { closest: () => null }, preventDefault(){ prevented = true; }, ...extras };
  layoutGame.listeners.keydown.forEach(fn => fn(event));
  return prevented;
};
layoutGame.API.startGame();
assert.equal(layoutKey('ح', 'KeyP'), true);
assert.equal(layoutGame.API.state.paused, true, 'Arabic layout physical P pauses');
assert.equal(layoutKey('せ', 'KeyP'), true);
assert.equal(layoutGame.API.state.paused, false, 'Japanese layout physical P resumes');
layoutKey('ص', 'KeyW');
layoutGame.advance(170);
assert.equal(layoutGame.API.state.dir.y, -1, 'Arabic layout physical W turns up');
assert.equal(layoutKey('ر', 'KeyR', {isComposing:true}), false);
assert.equal(layoutKey('Process', 'KeyR', {keyCode:229}), false);
assert.equal(layoutKey('ر', 'KeyR', {ctrlKey:true}), false);
assert.equal(layoutGame.API.state.running, true, 'Composing/browser chords do not reset gameplay');
assert.equal(layoutKey('ق', 'KeyR'), true);
assert.equal(layoutGame.API.state.score, 0);
assert.equal(layoutGame.elements.get('boardWrap').classList.contains('menu-open'), false);
layoutGame.API.showMenu();
assert.equal(layoutGame.elements.get('boardWrap').classList.contains('menu-open'), true, 'Readable mobile menu restored');
assert.deepEqual(layoutGame.errors, []);
console.log('Neon Coil non-Latin physical controls, IME isolation and menu transition checks passed.');

const noHaptics = makeContext({ hapticsSupported: false });
const unavailableHaptics = noHaptics.elements.get('dock').children[3];
assert.equal(unavailableHaptics.disabled, true, 'Unsupported vibration is visibly unavailable');
assert.equal(unavailableHaptics['aria-pressed'], 'false');
assert.match(unavailableHaptics.innerHTML, /Haptics unavailable/);
assert.equal(noHaptics.API.cfg.HAPTICS, false);
unavailableHaptics.listeners.click();
assert.equal(noHaptics.storage.has('neonCoilHaptics'), false, 'Unavailable hardware never changes saved preference');
const supportedHaptics = makeContext();
const availableHaptics = supportedHaptics.elements.get('dock').children[3];
availableHaptics.listeners.click();
assert.equal(supportedHaptics.API.cfg.HAPTICS, false);
assert.equal(supportedHaptics.storage.get('neonCoilHaptics'), '0');
availableHaptics.listeners.click();
assert.equal(supportedHaptics.API.cfg.HAPTICS, true);
assert.equal(supportedHaptics.storage.get('neonCoilHaptics'), '1');
console.log('Neon Coil unsupported/supported vibration controls passed.');

for (const editableKind of ['empty attribute', 'plaintext-only', 'inherited descendant']) {
  const editGame = makeContext();
  editGame.API.startGame();
  editGame.API.state.score = 77;
  let prevented = false;
  const editTarget = { isContentEditable: true, closest: () => null };
  for (const callback of editGame.listeners.keydown) callback({ key: 'ر', code: 'KeyR', target: editTarget, preventDefault() { prevented = true; } });
  assert.equal(editGame.API.state.score, 77, `Editing ${editableKind} cannot restart game`);
  assert.equal(prevented, false, `Editing ${editableKind} retains input`);
  assert.equal(editGame.errors.length, 0);
}
console.log('Neon Coil inherited and plaintext editable input guards passed.');

const guideGame = makeContext();
assert.equal(guideGame.elements.get('powerCatalogue').children.length, 13, 'Guide includes every registered power-up');
assert.equal(guideGame.elements.get('foodCatalogue').children.length, 6, 'Guide includes ordinary and special food');
const catalogueCopy = guideGame.API.getCatalogue();
catalogueCopy.powerups[0].label = 'mutated';
assert.notEqual(guideGame.API.getCatalogue().powerups[0].label, 'mutated', 'Catalogue does not expose mutable definitions');
guideGame.API.startGame();
const guide = guideGame.elements.get('playGuide');
guide.open = true; guide.listeners.toggle();
assert.equal(guideGame.API.state.paused, true, 'Reading the guide safely pauses play');
guide.open = false; guide.listeners.toggle();
assert.equal(guideGame.API.state.paused, true, 'Closing guide does not unexpectedly resume');
guide.open = true; guideGame.API.startGame();
assert.equal(guide.open, false, 'New run closes guide and returns focus to gameplay');
guideGame.API.gameOver('self');
assert.equal(guideGame.API.readScores()[0].score, 0, 'Zero-point attempts are visible in history');
assert.equal(guideGame.elements.get('runHistory').children.length, 1);
guideGame.storage.set('neonCoilBest:classic', '123');
guideGame.elements.get('clearHistory').listeners.click();
assert.equal(guideGame.API.readScores().length, 0);
assert.equal(guideGame.storage.get('neonCoilBest:classic'), '123', 'Clearing recent runs retains personal best');
assert.equal(guideGame.elements.get('undoHistory').hidden, false);
guideGame.elements.get('undoHistory').listeners.click();
assert.equal(guideGame.API.readScores().length, 1, 'Clear can be undone');
guideGame.elements.get('clearHistory').listeners.click();
guideGame.API.startGame(); guideGame.API.addScore(42); guideGame.API.gameOver('self');
guideGame.elements.get('undoHistory').listeners.click();
assert.equal(guideGame.API.readScores()[0].score, 42, 'Undo never overwrites a newer run');
assert.equal(guideGame.elements.get('storageNotice').hidden, false, 'Undo conflict is explained');
assert.equal(guideGame.elements.get('undoHistory').hidden, true, 'Failed Undo cannot leave a dead action visible');
guideGame.storage.set('neonCoilScores', '{broken');
guideGame.API.startGame(); guideGame.API.gameOver('self');
assert.equal(guideGame.storage.get('neonCoilScoresRecovery'), '{broken', 'Corrupt history bytes preserved before replacement');
assert.equal(guideGame.API.readScores().length, 1);
guideGame.storage.set('neonCoilScores', '[' + ' '.repeat(32768) + ']');
assert.equal(guideGame.API.readScores().length, 0, 'Oversized history is not parsed');
const tooLarge = guideGame.storage.get('neonCoilScores');
guideGame.API.startGame(); guideGame.API.gameOver('self');
assert.equal(guideGame.storage.get('neonCoilScores'), tooLarge, 'Oversized history is never silently overwritten');
guideGame.storage.set('neonCoilScores', JSON.stringify([
  {score: 1, mode:'__proto__', at:1}, {score: 2, mode:'constructor', at:1},
  {score: 3, mode:'classic', at:8640000000000001}, {score: -1, mode:'classic', at:1},
  ...Array.from({length:12}, (_,i)=>({score:i,mode:'zen',at:i}))
]));
assert.equal(guideGame.API.readScores().length, 10, 'Only valid, bounded recent records are exposed');
guideGame.API.emit('historychange');
assert.equal(guideGame.elements.get('runHistory').children.length, 10);
assert.equal(isolated.elements.get('storageNotice').hidden, false, 'Denied storage has visible warning including initial failures');
assert.equal(isolated.API.clearScores(), null, 'Failed clear never offers a false undo');
assert.deepEqual(guideGame.errors, []);
console.log('Neon Coil guide catalogue, safe pause, recent history, corrupt recovery, denied storage and conflict-safe undo passed.');

const partialStorage = makeContext();
const priorHistory = JSON.stringify([{score:99,mode:'classic',at:1}]);
partialStorage.storage.set('neonCoilScores', priorHistory);
partialStorage.readFailures.add('neonCoilScores');
assert.equal(partialStorage.API.clearScores(), null, 'Unreadable history cannot be cleared even when writes work');
assert.equal(partialStorage.storage.get('neonCoilScores'), priorHistory);
partialStorage.API.startGame(); partialStorage.API.gameOver('self');
assert.equal(partialStorage.storage.get('neonCoilScores'), priorHistory, 'Saving a run cannot overwrite unreadable history');
partialStorage.readFailures.clear();
const undoPartial = partialStorage.API.clearScores();
partialStorage.storage.set('neonCoilScores', priorHistory);
partialStorage.readFailures.add('neonCoilScores');
assert.equal(undoPartial(), false, 'Undo fails closed on read error instead of assuming empty history');
assert.equal(partialStorage.storage.get('neonCoilScores'), priorHistory);
assert.deepEqual(partialStorage.errors, []);
console.log('Neon Coil asymmetric read/write storage failures preserve existing history.');
partialStorage.storage.set('neonCoilBest:classic', '999');
partialStorage.readFailures.add('neonCoilBest:classic');
partialStorage.API.startGame(); partialStorage.API.addScore(10);
assert.equal(partialStorage.storage.get('neonCoilBest:classic'), '999', 'Unreadable personal best cannot be overwritten by a lower run');
partialStorage.readFailures.delete('neonCoilBest:classic');
partialStorage.API.addScore(10);
assert.equal(partialStorage.API.state.best, 999, 'Recovered reads retain the higher existing personal best');

for (const language of ['en', 'ar', 'ja']) {
  const local = makeContext({language});
  assert.equal(local.i18n.language, language);
  for (const [source, values] of Object.entries(local.i18n.catalogue)) {
    assert.equal(values.length, 2, `${source} has Arabic and Japanese translations`);
    assert.ok(values.every(value => typeof value === 'string' && value.trim()), `${source} translations are nonempty`);
    assert.equal(local.API.t(source), language === 'en' ? source : values[language === 'ar' ? 0 : 1]);
  }
  local.API.setMode('rush'); local.API.startGame();
  assert.equal(local.elements.get('gameStatus').textContent, local.API.t('Playing'));
  local.API.togglePause();
  assert.equal(local.elements.get('gameStatus').textContent, local.API.t('Paused'));
  assert.equal(local.elements.get('powerCatalogue').children.length, 13);
  for (const item of local.API.getCatalogue().powerups) {
    assert.ok(local.elements.get('powerCatalogue').children.some(row => row.children[0].textContent.endsWith(local.API.t(item.label))));
  }
  local.API.gameOver('wall');
  assert.equal(local.elements.get('gameStatus').textContent, local.API.t('Game over'));
  assert.equal(local.elements.get('runHistory').children[0].children[1].textContent, local.API.t('Rush Protocol'));
  assert.equal(local.API.readScores()[0].mode, 'rush', 'Locale never changes stable storage IDs');
  for (const text of ['Play Classic','Play Rush','Play Zen','Level 5 · Infinite — keep the coil alive','Level 3 · Flux — 54 points to Overdrive','points in rush mode','Best 99 · Level 2 · 7 cores','rush mode started','Game over. Score 123','LEVEL 4 · OVERDRIVE','5× FLOW','3× POINTS','✦ Infinite ✦','🛡 SHIELD!','+50 GOLDEN','MEGA +5','CURSED!','BERRY +10','CHERRY PAIR']) {
    if (language !== 'en') assert.notEqual(local.API.t(text), text, `Dynamic ${language} text translated: ${text}`);
  }
  assert.equal(local.API.t('__proto__'), '__proto__', 'Unknown dictionary keys safely pass through');
  assert.deepEqual(local.errors, []);
}
assert.equal(makeContext({language:'unsupported'}).i18n.language, 'en', 'Invalid saved locale safely uses English');
console.log('Neon Coil EN/AR/JA catalogue, dynamic status/results/progress, complete guide and stable storage ID regressions passed.');

for (const language of ['en','ar','ja']) {
  const journey = makeContext({language});
  const sounds = [];
  const deathFlashes = [];
  journey.API.ctx.fillRect = () => { if (String(journey.API.ctx.fillStyle).startsWith('rgba(8,4,10,')) deathFlashes.push(journey.API.ctx.fillStyle); };
  journey.API.on('audio', type => sounds.push(type));
  journey.API.startGame(); journey.API.addScore(42); journey.API.togglePause();
  const leave = journey.elements.get('overlay').children.find(child => child.textContent === journey.API.t('End run & change mode'));
  assert.equal(journey.elements.get('overlay').lastScroll.block, 'center', 'Pause brings the full panel into view from controls below the board');
  assert.ok(leave, 'Pause exposes a clearly labelled route back to mode/language selection');
  leave.listeners.click();
  assert.equal(journey.API.state.running,false);
  assert.equal(journey.elements.get('boardWrap').classList.contains('menu-open'),true);
  assert.equal(journey.API.readScores().length,1);
  assert.equal(journey.API.readScores()[0].score,42,'Voluntarily ended attempt is recorded');
  assert.equal(journey.storage.get('neonCoilBest:classic'),'42');
  assert.equal(sounds.includes('die'),false,'Voluntary ending does not play collision feedback');
  journey.API.emit('render', journey.API.ctx, 0);
  assert.equal(deathFlashes.length, 0, 'Voluntary ending does not render the FX death flash');
  leave.listeners.click();
  assert.equal(journey.API.readScores().length,1,'Stale/double end button cannot duplicate the attempt');
  journey.runTimers();
  assert.equal(journey.elements.get('boardWrap').classList.contains('menu-open'),true,'No late result replaces the menu');
  assert.equal(journey.API.setMode('zen'),true,'A new mode can be selected without deliberately colliding');
  assert.deepEqual(journey.errors,[]);
}
console.log('Neon Coil user journey: pause→end/save→mode/language menu passed in EN/AR/JA.');

const collisionFx = makeContext();
const collisionFlashes = [];
collisionFx.API.ctx.fillRect = () => { if (String(collisionFx.API.ctx.fillStyle).startsWith('rgba(8,4,10,')) collisionFlashes.push(collisionFx.API.ctx.fillStyle); };
collisionFx.API.startGame(); collisionFx.API.gameOver('wall'); collisionFx.API.emit('render', collisionFx.API.ctx, 0);
assert.equal(collisionFlashes.length, 1, 'Actual collisions retain their death feedback');

// Cross-context interrupted runs use the exact persisted JSON, never live API state.
const checkpointKey = 'neonCoilInterruptedRun';
const running = makeContext();
running.API.setMode('rush'); running.API.startGame(); running.advance(400);
running.API.addScore(200); running.API.emit('afterStep');
running.API.emit('afterEat'); running.API.emit('afterEat');
running.API.addEffect('ghost', 3.7); running.API.addEffect('rainbow', 2.4); running.API.addEffect('magnet', 1.2);
running.API.state.shield = true; running.API.state.effects.shield = Infinity;
running.API.setDir(0,-1);
assert.equal(running.API.saveRun(true),true,'Rich run checkpoint accepted');
const checkpoint = running.storage.get(checkpointKey);
const saved = JSON.parse(checkpoint);
assert.equal(saved.state.effects.shield,'persistent','Infinite shield has an explicit JSON representation');
assert.ok(saved.components.modes.obstacles.length > 0,'Arena hazards are included');
assert.equal(saved.components.modes.combo,2,'Combo and time are included');
for (const language of ['en','ar','ja']) {
  const restored = makeContext({initialSavedRun:checkpoint,language});
  assert.equal(restored.API.state.running,false,'Loading never autoplays saved data');
  assert.match(restored.elements.get('overlay').innerHTML, /Saved run found/,'A saved run decision replaces Play');
  restored.API.startGame();
  assert.equal(restored.storage.get(checkpointKey),checkpoint,'Space/Play cannot silently replace a saved run');
  restored.elements.get('ovBtn').listeners.click();
  assert.equal(restored.API.state.running,true);
  assert.equal(restored.API.state.paused,true,'Restore always pauses before movement');
  assert.equal(restored.API.state.mode,'rush');
  assert.equal(restored.API.state.score,saved.state.score);
  assert.equal(JSON.stringify(restored.API.state.snake.map(({x,y}) => ({x,y}))),JSON.stringify(saved.state.snake),'Snake positions survive exactly');
  assert.equal(JSON.stringify(restored.API.getObstacles()),JSON.stringify(saved.components.modes.obstacles),'Hazard positions, arming progress and state survive');
  assert.equal(restored.API.getCombo().remaining,saved.components.modes.comboTimer,'Combo clock does not expire while away');
  assert.equal(restored.API.state.effects.ghost,saved.state.effects.ghost);
  assert.equal(restored.API.state.shield,true);
  const beforeWait = restored.API.state.effects.rainbow;
  restored.advance(7000);
  assert.equal(restored.API.state.effects.rainbow,beforeWait,'Paused restored effect clocks stay frozen');
  assert.equal(restored.API.readScores().length,0,'Restoring does not create a result/history entry');
  restored.API.togglePause(); restored.advance(40);
  assert.ok(restored.API.state.effects.rainbow < beforeWait,'Effect clocks continue only after explicit resume');
  restored.API.gameOver('quit');
  assert.equal(restored.storage.get(checkpointKey),'','Completed/ended runs clear only their owned checkpoint');
  assert.equal(restored.API.readScores().length,1,'Ending the restored run records one result');
  assert.deepEqual(restored.errors,[]);
}
const discarded = makeContext({initialSavedRun:checkpoint});
const discardButton = discarded.elements.get('overlay').children.find(child => child.textContent === 'Discard saved run');
discardButton.listeners.click();
assert.equal(discarded.storage.get(checkpointKey),'');
discarded.API.startGame();
assert.equal(discarded.API.state.running,true,'Explicit discard permits a fresh run');
assert.equal(discarded.API.readScores().length,0,'Discarding a saved run does not pretend it was a played result');
for (const mutate of [
  value => { value.version = 99; }, value => { value.grid = 200; },
  value => { value.state.snake[0].x = -1; }, value => { value.state.effects.unknown = 9; },
  value => { value.state.effects.ghost = -1; }, value => { value.state.queue.push({x:10,y:3}); },
  value => { value.components.modes.obstacles[0].t = 2; }, value => { delete value.components.content; },
  value => { value.state.shield = false; }, value => { value.mode = '__proto__'; },
]) {
  const changed = JSON.parse(checkpoint); mutate(changed); const bytes = JSON.stringify(changed);
  const rejected = makeContext({initialSavedRun:bytes});
  assert.equal(rejected.API.inspectSavedRun(),null,'Invalid or future checkpoint is rejected');
  assert.equal(rejected.API.restoreRun(),false);
  rejected.API.startGame();
  assert.equal(rejected.storage.get(checkpointKey),bytes,'Invalid bytes are preserved until explicit discard');
  rejected.elements.get('ovBtn').listeners.click();
  assert.equal(rejected.storage.get(checkpointKey),'');
}
for (const bytes of ['{broken', ' '.repeat(100001)]) {
  const rejected = makeContext({initialSavedRun:bytes});
  assert.equal(rejected.API.inspectSavedRun(),null);
  assert.equal(rejected.storage.get(checkpointKey),bytes,'Corrupt/oversize records are not rewritten');
}
const foreign = makeContext(); foreign.API.startGame();
foreign.storage.set(checkpointKey,checkpoint);
assert.equal(foreign.API.saveRun(true),false,'One tab cannot overwrite a different run token');
foreign.API.gameOver('self');
assert.equal(foreign.storage.get(checkpointKey),checkpoint,'Ending another tab cannot erase this run');
const hidden = makeContext(); hidden.API.startGame(); hidden.API.addScore(77);
hidden.listeners.pagehide[0]();
assert.equal(JSON.parse(hidden.storage.get(checkpointKey)).state.score,77,'Page exit forces a current checkpoint');
const denied = makeContext({blockedStorage:true}); denied.API.startGame();
assert.equal(denied.API.saveRun(true),false,'Denied storage never blocks playable state');
assert.equal(denied.API.state.running,true);
assert.deepEqual(denied.errors,[]);
console.log('Neon Coil interrupted-run versioning, exact board/hazards/effect/combo restore, explicit discard, corruption, denied storage and tab ownership passed.');
