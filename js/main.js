"use strict";
/* =====================================================================
   8. BOOT
   ===================================================================== */
(async function boot() {
  let s = GameState.load();
  let offline = null;
  if (!s) {
    s = GameState.newGame();
    addLog(s, "Welcome, my liege. Put idle citizens to work, build Houses to grow, and raise a Barracks. Raiders will come, so be ready!", "info");
  } else {
    offline = Engine.offlineProgress(s);
  }
  GameState.current = s;
  AssetPipeline.indexCatalog();
  UI.build();
  Engine.start();
  GameState.save();
  if (offline && offline.elapsed >= 60) UI.showOffline(offline);
  const problems = Economy.verifyStorage();
  if (problems.length) console.error("Storage balance problems:", problems);
  await AssetPipeline.init();
  window.Ironhold = { GameState, Engine, Economy, Military, Battle, BattleUI, AssetPipeline, UI }; // handy for debugging in the console
})();
