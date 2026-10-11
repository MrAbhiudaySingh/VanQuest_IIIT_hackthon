// Signs and HUD use the pixel font; wait for it so text isn't drawn in a fallback face.
await document.fonts.load('8px KenneyMini');

const { router } = await import('./app.js');
const { CityScene } = await import('./scenes/CityScene.js');
const { HudScene } = await import('./scenes/HudScene.js');
const { HomeScene } = await import('./scenes/HomeScene.js');

window.game = router.phaser = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 960,
  height: 540,
  backgroundColor: '#14161c',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [CityScene, HudScene, HomeScene],
});

// The supplied title screen opens over the loading game. ?play skips it (and onboarding — used by the
// automated tests); ?enter goes straight into the current character (after switching or starting one).
const { installAchievementToasts } = await import('./ui/reportPanels.js');
installAchievementToasts(router.game);
const params = new URLSearchParams(location.search);
if (params.has('enter')) { history.replaceState(null, '', location.pathname); router.enter(); }
else if (!params.has('play')) router.title();
