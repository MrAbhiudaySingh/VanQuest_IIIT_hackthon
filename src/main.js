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
