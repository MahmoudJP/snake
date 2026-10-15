/* Dependency-free EN / Arabic / Japanese interface catalogue. */
(function () {
  "use strict";
  var language = "en";
  try { var saved = localStorage.getItem("neonCoilLanguage"); if (["en", "ar", "ja"].includes(saved)) language = saved; } catch (_) {}
  var catalogue = {
    "Saved run found": ["توجد جولة محفوظة", "保存したプレイがあります"],
    "Resume saved run": ["استئناف الجولة المحفوظة", "保存したプレイを再開"],
    "Discard saved run": ["تجاهل الجولة المحفوظة", "保存したプレイを破棄"],
    "A saved run is available in this browser. Resume paused, or discard it to start a new run.": ["توجد جولة محفوظة في هذا المتصفح. استعدها متوقفة مؤقتًا، أو تجاهلها لبدء جولة جديدة.", "このブラウザにプレイが保存されています。一時停止状態で復元するか、破棄して新しく始められます。"],
    "This saved run cannot be resumed. Discard it to save a new run. Your best scores and history are kept.": ["تعذر استعادة هذه الجولة. تجاهلها لحفظ جولة جديدة. تبقى أفضل النتائج والسجل محفوظين.", "この保存データは再開できません。破棄すると新しいプレイを保存できます。ベストスコアと履歴は保たれます。"],
    "Neon Coil — Climb the Grid": ["Neon Coil — اصعد عبر الشبكة", "Neon Coil — グリッドの頂点へ"],
    "End run & change mode": ["إنهاء الجولة وتغيير الوضع", "終了してモード変更"],
    "End this run to choose a different mode or language.": ["أنهِ هذه الجولة لاختيار وضع أو لغة مختلفة.", "別のモードや言語を選ぶには、現在のプレイを終了してください。"],
    "You ended this run.": ["أنهيت هذه الجولة.", "プレイを終了しました。"],
    "Climb the grid.": ["اصعد عبر الشبكة.", "グリッドの頂点へ。"],
    "Score": ["النقاط", "スコア"], "Best": ["أفضل نتيجة", "ベスト"], "Level": ["المستوى", "レベル"], "Combo": ["التتابع", "コンボ"],
    "Game statistics": ["إحصائيات اللعب", "ゲーム統計"], "Neon Coil game": ["لعبة Neon Coil", "Neon Coil ゲーム"],
    "Ready": ["جاهز", "準備完了"], "Playing": ["الجولة جارية", "プレイ中"], "Paused": ["متوقف مؤقتًا", "一時停止中"],
    "THREE MODES · FIVE STAGES · ENDLESS RUNS": ["٣ أوضاع · ٥ مراحل · جولات بلا نهاية", "3モード・5ステージ・エンドレス"],
    "Choose a run.": ["اختر جولتك.", "モードを選ぼう。"],
    "Collect cores, build combos, and move through five escalating stages. Every level changes the pace, palette, and arena pressure.": ["اجمع الطعام وحقق التتابعات وتقدم عبر خمس مراحل متصاعدة. كل مرحلة تغير السرعة والألوان وتحديات الساحة.", "フードを集めてコンボをつなぎ、5段階のステージを進もう。レベルごとに速さ、配色、障害物が変化します。"],
    "Choose game mode": ["اختر وضع اللعب", "ゲームモードを選択"],
    "Classic": ["كلاسيكي", "クラシック"], "Rush": ["اندفاع", "ラッシュ"], "Zen": ["هدوء", "禅"],
    "Wrap edges · evolving hazards": ["عبور الحواف · عوائق متزايدة", "端を通過・変化する障害物"],
    "Hard edges · faster hazards": ["حواف صلبة · عوائق أسرع", "端は壁・速い障害物"],
    "Wrap edges · clear arena": ["عبور الحواف · ساحة خالية", "端を通過・障害物なし"],
    "Level progression": ["مراحل التقدم", "レベルの進行"],
    "Ignition": ["الانطلاق", "点火"], "Pulse": ["النبض", "鼓動"], "Flux": ["التدفق", "変動"], "Overdrive": ["التسارع", "加速"], "Infinite": ["بلا نهاية", "無限"],
    "or swipe anywhere on the arena": ["أو اسحب في أي مكان بالساحة", "または盤面をスワイプ"],
    "Language": ["اللغة", "言語"], "Choose language before starting a run.": ["اختر اللغة قبل بدء الجولة.", "開始前に言語を選択してください。"],
    "Progress to next level": ["التقدم للمستوى التالي", "次のレベルまでの進行"], "Touch controls": ["أزرار اللمس", "タッチ操作"],
    "CURRENT CIRCUIT": ["الوضع الحالي", "現在のモード"],
    "Classic Circuit": ["الساحة الكلاسيكية", "クラシックサーキット"], "Rush Protocol": ["وضع الاندفاع", "ラッシュモード"], "Zen Flow": ["وضع الهدوء", "禅フロー"],
    "BALANCED": ["متوازن", "バランス"], "INTENSE": ["مكثف", "高難度"], "RELAXED": ["مريح", "リラックス"],
    "Wrap through walls, build combos, and adapt as the arena evolves.": ["اعبر الحواف وحقق التتابعات وتكيف مع تغير الساحة.", "端を通り抜け、コンボをつなぎ、変化する盤面に対応しよう。"],
    "Hard walls, an immediate speed boost, and hazards that arrive early.": ["جدران صلبة وسرعة أعلى من البداية وعوائق تظهر مبكرًا.", "端は壁になり、最初から高速で障害物も早く出現します。"],
    "A calmer, obstacle-free circuit for long runs and clean movement.": ["ساحة أهدأ بلا عوائق لجولات أطول وحركة سلسة.", "障害物のない穏やかな盤面で、長く滑らかに進もう。"],
    "Food": ["الطعام", "フード"], "Length": ["الطول", "長さ"], "Speed": ["السرعة", "速さ"],
    "ACTIVE POWERS": ["القدرات النشطة", "有効なパワー"], "No active power-ups yet.": ["لا توجد قدرات نشطة حاليًا.", "有効なパワーはありません。"],
    "CONTROLS": ["التحكم", "操作"], "DESKTOP + TOUCH": ["لوحة مفاتيح ولمس", "キーボード＋タッチ"],
    "Move": ["تحرك", "移動"], "ARROWS": ["الأسهم", "矢印"], "Pause": ["إيقاف مؤقت", "一時停止"], "Restart": ["ابدأ من جديد", "リスタート"],
    "GAME SETTINGS": ["إعدادات اللعب", "ゲーム設定"], "LOCAL": ["محلي", "ローカル"],
    "Pause / resume": ["إيقاف / متابعة", "一時停止／再開"], "Sound": ["الصوت", "効果音"], "Visual effects": ["المؤثرات البصرية", "視覚効果"],
    "Haptics": ["الاهتزاز", "振動"], "Haptics unavailable": ["الاهتزاز غير متاح", "振動非対応"], "This browser does not support vibration.": ["هذا المتصفح لا يدعم الاهتزاز.", "このブラウザーは振動に対応していません。"],
    "Direction pad": ["لوحة الاتجاهات", "方向パッド"], "Move up": ["تحرك لأعلى", "上へ移動"], "Move left": ["تحرك لليسار", "左へ移動"], "Move right": ["تحرك لليمين", "右へ移動"], "Move down": ["تحرك لأسفل", "下へ移動"], "Pause or resume": ["إيقاف أو متابعة", "一時停止または再開"],
    "How to play & power-ups": ["طريقة اللعب والقدرات", "遊び方とパワー"],
    "Use arrows, WASD, swipe, or the direction pad. You cannot reverse straight into your trail. Reading this guide pauses an active run.": ["استخدم الأسهم أو WASD أو السحب أو أزرار الاتجاهات. لا يمكنك عكس اتجاهك مباشرة نحو جسمك. فتح الدليل يوقف الجولة مؤقتًا.", "矢印、WASD、スワイプ、方向パッドで操作します。進行方向と真逆には曲がれません。このガイドを開くとプレイが一時停止します。"],
    "Collect food to grow and earn points.": ["اجمع الطعام لتطول وتكسب نقاطًا.", "フードを集めて成長し、得点しよう。"],
    "Collect food quickly for combos. Your score unlocks five stages.": ["اجمع الطعام بسرعة لتحقيق التتابعات. نقاطك تفتح خمس مراحل.", "素早く集めるとコンボが発生します。得点で5段階のステージが開放されます。"],
    "Classic wraps around edges; Rush has hard walls; Zen has no arena blocks. Your own trail is dangerous in every mode.": ["الكلاسيكي يسمح بعبور الحواف؛ الاندفاع له جدران؛ الهدوء بلا عوائق. الاصطدام بجسمك خطر في جميع الأوضاع.", "クラシックは端を通過でき、ラッシュは壁があり、禅は障害物がありません。どのモードでも自分の体への衝突に注意しましょう。"],
    "Power-ups": ["القدرات", "パワー"], "Core": ["طعام عادي", "通常フード"],
    "Speed Up": ["تسريع", "スピードアップ"], "Slow Mo": ["إبطاء", "スローモーション"], "Big Snake": ["زيادة الطول", "成長"], "Shrink": ["تقليص", "縮小"], "2× Points": ["ضعف النقاط", "得点2倍"], "Ghost": ["شبح", "ゴースト"], "Magnet": ["مغناطيس", "マグネット"], "3× Points": ["ثلاثة أضعاف النقاط", "得点3倍"], "Shield": ["درع", "シールド"], "Time Freeze": ["تجميد الوقت", "時間停止"], "Mini Snake": ["ثعبان صغير", "ミニスネーク"], "Score Rush": ["دفعة نقاط", "スコアラッシュ"], "Teleport": ["انتقال فوري", "テレポート"],
    "Move faster for 6 seconds.": ["تحرك أسرع لمدة ٦ ثوانٍ.", "6秒間、移動速度が上がります。"], "Slow down for 6 seconds.": ["تحرك أبطأ لمدة ٦ ثوانٍ.", "6秒間、移動速度が下がります。"],
    "Grow by 3 cells.": ["زد طولك ٣ خلايا.", "3マス分成長します。"], "Remove up to 3 tail cells.": ["احذف حتى ٣ خلايا من الذيل.", "しっぽが最大3マス短くなります。"],
    "Double your points for 8 seconds.": ["ضاعف نقاطك لمدة ٨ ثوانٍ.", "8秒間、得点が2倍になります。"],
    "Pass through your trail and arena hazards for 6 seconds; edges wrap.": ["اعبر جسمك والعوائق لمدة ٦ ثوانٍ مع عبور الحواف.", "6秒間、自分の体と障害物を通過でき、端も通り抜けられます。"],
    "Pull food towards your head for 7 seconds.": ["اجذب الطعام نحو رأسك لمدة ٧ ثوانٍ.", "7秒間、フードを頭の方向に引き寄せます。"],
    "Triple your points for 7 seconds.": ["احصل على ثلاثة أضعاف النقاط لمدة ٧ ثوانٍ.", "7秒間、得点が3倍になります。"],
    "Absorb one collision. It stays until used.": ["احمِ نفسك من اصطدام واحد. يبقى الدرع حتى استخدامه.", "衝突を1回防ぎます。使用するまで有効です。"],
    "Stop movement for 2.5 seconds so you can plan a turn.": ["أوقف الحركة لمدة ٢٫٥ ثانية لتخطط للمنعطف التالي.", "2.5秒間動きが止まり、次の曲がり方を考えられます。"],
    "Remove up to 4 tail cells and move faster for 8 seconds.": ["احذف حتى ٤ خلايا من الذيل وتحرك أسرع لمدة ٨ ثوانٍ.", "しっぽが最大4マス短くなり、8秒間速くなります。"],
    "Earn extra points regularly for 6 seconds.": ["اكسب نقاطًا إضافية بانتظام لمدة ٦ ثوانٍ.", "6秒間、定期的に追加得点が入ります。"],
    "Move your head to a random free cell. Your body stays behind.": ["انقل رأسك إلى خلية عشوائية خالية مع بقاء جسمك في مكانه.", "頭が空いているランダムなマスへ移動します。体はその場に残ります。"],
    "Golden Apple": ["تفاحة ذهبية", "金のリンゴ"], "Mega Fruit": ["فاكهة ضخمة", "メガフルーツ"], "Cursed Fruit": ["فاكهة ملعونة", "呪いのフルーツ"], "Bonus Berry": ["توت المكافأة", "ボーナスベリー"], "Cherry Pair": ["زوج كرز", "チェリーペア"],
    "10 base points and normal growth.": ["١٠ نقاط أساسية ونمو عادي.", "基本10点と通常の成長。"], "50 base points.": ["٥٠ نقطة أساسية.", "基本50点。"],
    "15 base points and 5 extra growth cells.": ["١٥ نقطة أساسية و٥ خلايا نمو إضافية.", "基本15点と追加で5マス成長。"],
    "Lose 20 base points and gain 2 extra growth cells.": ["اخسر ٢٠ نقطة أساسية وزد طولك خليتين إضافيتين.", "基本20点を失い、追加で2マス成長。"],
    "5 base points plus up to 40 extra points. Collect it quickly.": ["٥ نقاط أساسية وحتى ٤٠ نقطة إضافية. اجمعها بسرعة.", "基本5点と最大40点のボーナス。素早く集めよう。"],
    "12 base points plus 8 extra points.": ["١٢ نقطة أساسية و٨ نقاط إضافية.", "基本12点と追加8点。"],
    "RECENT RUNS": ["الجولات الأخيرة", "最近のプレイ"], "LAST 10": ["آخر ١٠ جولات", "直近10回"], "Finish a run to see it here.": ["أنهِ جولة لتظهر هنا.", "プレイを終えるとここに表示されます。"],
    "Clear recent runs": ["مسح الجولات الأخيرة", "履歴を消去"], "Undo clear": ["تراجع عن المسح", "消去を取り消す"], "Personal bests are kept when you clear recent runs.": ["أفضل نتائجك محفوظة عند مسح الجولات الأخيرة.", "履歴を消しても自己ベストは残ります。"],
    "This browser could not save your data. Changes may be lost when you close or reload the page.": ["تعذر على المتصفح حفظ بياناتك. قد تفقد التغييرات عند إغلاق الصفحة أو إعادة تحميلها.", "データを保存できませんでした。ページを閉じたり再読み込みしたりすると変更が失われる場合があります。"],
    "New runs or a save error prevented undo. Your current history was kept.": ["تعذر التراجع بسبب جولة أحدث أو خطأ بالحفظ. احتفظنا بالسجل الحالي.", "新しいプレイまたは保存エラーのため取り消せません。現在の履歴は保持されました。"],
    "Everything is stored only in this browser.": ["كل البيانات محفوظة في هذا المتصفح فقط.", "データはこのブラウザー内だけに保存されます。"],
    "Tip: collect food quickly to keep your combo alive.": ["نصيحة: اجمع الطعام بسرعة للحفاظ على التتابع.", "ヒント：素早く集めてコンボを維持しよう。"],
    "Rush has hard walls. Plan the exit before you chase a combo.": ["الاندفاع له جدران صلبة. خطط لمخرجك قبل مطاردة التتابع.", "ラッシュの端は壁です。コンボを狙う前に進路を確認しましょう。"],
    "Zen removes arena hazards, but your own tail still matters.": ["الهدوء بلا عوائق، لكن عليك تجنب ذيلك.", "禅は障害物がありませんが、自分のしっぽには注意しましょう。"],
    "Circuit paused": ["الجولة متوقفة مؤقتًا", "一時停止"], "Your run is paused. Resume when you are ready.": ["الجولة متوقفة مؤقتًا. تابع عندما تكون مستعدًا.", "一時停止中です。準備ができたら再開してください。"], "Resume run": ["متابعة الجولة", "プレイを再開"],
    "Game paused": ["اللعب متوقف مؤقتًا", "ゲームを一時停止しました"], "Game resumed": ["تمت متابعة اللعب", "ゲームを再開しました"], "Circuit complete": ["اكتملت الساحة", "サーキットクリア"], "Game over": ["انتهت اللعبة", "ゲームオーバー"], "Circuit ended": ["انتهت الجولة", "プレイ終了"],
    "You filled every available cell. Circuit complete!": ["ملأت كل الخلايا المتاحة. اكتملت الساحة!", "空いているマスをすべて埋めました。クリア！"], "You hit the edge of the circuit.": ["اصطدمت بحافة الساحة.", "盤面の端に衝突しました。"], "You crossed your own trail.": ["اصطدمت بجسمك.", "自分の体に衝突しました。"], "You hit an armed arena block.": ["اصطدمت بعائق نشط.", "有効な障害物に衝突しました。"], "The run ended after a collision.": ["انتهت الجولة بسبب اصطدام.", "衝突によりプレイが終了しました。"],
    "★ New personal best": ["★ أفضل نتيجة جديدة", "★ 自己ベスト更新"], "Run it again": ["العب مرة أخرى", "もう一度プレイ"], "Change game mode": ["تغيير وضع اللعب", "ゲームモードを変更"], "Game mode menu opened": ["فُتحت قائمة أوضاع اللعب", "モード選択メニューを開きました"],
    "READY": ["جاهز", "準備完了"], "s": ["ث", "秒"], "pts": ["نقطة", "点"],
    "CIRCUIT BREAK": ["انتهت الجولة", "サーキット終了"], "SHIELD!": ["درع!", "シールド！"], "GOLDEN": ["ذهبي", "ゴールド"], "MEGA": ["ضخم", "メガ"], "CURSED!": ["ملعونة!", "呪い！"], "BERRY": ["توت", "ベリー"], "CHERRY PAIR": ["زوج كرز", "チェリーペア"], "FLOW": ["تتابع", "フロー"], "POINTS": ["نقاط", "得点"],
    "Snake game board. Use the arrow keys, WASD, swipe, or the on-screen direction pad to move.": ["لوحة اللعبة. استخدم الأسهم أو WASD أو السحب أو أزرار الاتجاهات للتحرك.", "ゲーム盤面。矢印、WASD、スワイプ、画面の方向パッドで移動します。"],
    "Snake game board. Keyboard and touch controls are available below.": ["لوحة اللعبة. التحكم بلوحة المفاتيح واللمس متاح بالأسفل.", "ゲーム盤面。下にキーボードとタッチの操作案内があります。"]
  };
  var templates = [
    [/^Play (Classic|Rush|Zen)$/, function (m) { return language === "ar" ? "العب " + t(m[1]) : t(m[1]) + "をプレイ"; }],
    [/^Level 5 · Infinite — keep the coil alive$/, function () { return language === "ar" ? "المستوى ٥ · بلا نهاية — واصل اللعب" : "レベル5・無限 ― 生き残ろう"; }],
    [/^Level (\d+) · (\w+) — (\d+) points to (\w+)$/, function (m) { return language === "ar" ? "المستوى " + m[1] + " · " + t(m[2]) + " — " + m[3] + " نقطة حتى " + t(m[4]) : "レベル" + m[1] + "・" + t(m[2]) + " ― " + t(m[4]) + "まで" + m[3] + "点"; }],
    [/^points in (classic|rush|zen) mode$/, function (m) { return language === "ar" ? "نقطة في وضع " + t({classic:"Classic",rush:"Rush",zen:"Zen"}[m[1]]) : t({classic:"Classic",rush:"Rush",zen:"Zen"}[m[1]]) + "での得点"; }],
    [/^Best (\d+) · Level (\d+) · (\d+) cores$/, function (m) { return language === "ar" ? "أفضل نتيجة " + m[1] + " · المستوى " + m[2] + " · " + m[3] + " طعام" : "ベスト" + m[1] + "・レベル" + m[2] + "・フード" + m[3]; }],
    [/^(classic|rush|zen) mode started$/, function (m) { return t({classic:"Classic",rush:"Rush",zen:"Zen"}[m[1]]) + (language === "ar" ? " — بدأت الجولة" : "を開始しました"); }],
    [/^Game over\. Score (\d+)$/, function (m) { return language === "ar" ? "انتهت اللعبة. النقاط " + m[1] : "ゲーム終了。スコア" + m[1]; }],
    [/^LEVEL (\d+) · (IGNITION|PULSE|FLUX|OVERDRIVE|INFINITE)$/, function (m) { return t("Level") + " " + m[1] + " · " + t(m[2][0] + m[2].slice(1).toLowerCase()); }],
    [/^(\d+)× (FLOW|POINTS)$/, function (m) { return m[1] + "× " + t(m[2]); }],
    [/^✦ (Ignition|Pulse|Flux|Overdrive|Infinite) ✦$/, function (m) { return "✦ " + t(m[1]) + " ✦"; }]
  ];
  function t(text) {
    if (typeof text !== "string" || language === "en") return text;
    var pair = Object.prototype.hasOwnProperty.call(catalogue, text) ? catalogue[text] : null; if (pair) return pair[language === "ar" ? 0 : 1];
    for (var i = 0; i < templates.length; i++) { var match = text.match(templates[i][0]); if (match) return templates[i][1](match); }
    // Glyphs and numeric badges keep their physical orientation.
    for (var key of ["SHIELD!", "GOLDEN", "MEGA", "CURSED!", "BERRY", "CHERRY PAIR"]) if (text.includes(key)) return text.replace(key, t(key));
    return text;
  }
  function translate(root) {
    if (!root || typeof document.createTreeWalker !== "function") return;
    var walk = document.createTreeWalker(root, 4), node;
    while ((node = walk.nextNode())) {
      if (node.parentElement && /^(SCRIPT|STYLE|OPTION)$/.test(node.parentElement.tagName)) continue;
      var original = node.nodeValue, trimmed = original.trim();
      if (trimmed) node.nodeValue = original.replace(trimmed, t(trimmed));
    }
    root.querySelectorAll("[aria-label],[title]").forEach(function (el) {
      ["aria-label", "title"].forEach(function (attr) { if (el.hasAttribute(attr)) el.setAttribute(attr, t(el.getAttribute(attr))); });
    });
    var picker = document.getElementById("languagePicker"); if (picker) picker.value = language;
  }
  window.NeonI18n = { t: t, translate: translate, language: language, catalogue: catalogue };
  if (document.documentElement) { document.documentElement.lang = language; document.documentElement.dir = language === "ar" ? "rtl" : "ltr"; }
  if (document.title) document.title = t(document.title);
  translate(document.body);
  document.addEventListener("change", function (event) {
    if (event.target.id !== "languagePicker" || !["en", "ar", "ja"].includes(event.target.value)) return;
    try { localStorage.setItem("neonCoilLanguage", event.target.value); window.location.reload(); }
    catch (_) { event.target.value = language; var notice = document.getElementById("storageNotice"); if (notice) { notice.textContent = t("This browser could not save your data. Changes may be lost when you close or reload the page."); notice.hidden = false; } }
  });
})();
