// Phaser-side HUD: the location banner shown when you step into an entrance zone.
// (The clickable "E" prompt, toasts and top bar are DOM — see src/ui/hud.js.)
const FONT = { fontFamily: 'KenneyMini', fontSize: '16px', color: '#ffffff' };

export class HudScene extends Phaser.Scene {
  constructor() { super('Hud'); }

  create() {
    const { width } = this.scale;
    this.banner = this.add.container(width / 2, 82).setAlpha(0);
    this.bannerBg = this.add.rectangle(0, 0, 10, 46, 0x10141f, 0.88).setStrokeStyle(2, 0xb8913a);
    this.bannerDistrict = this.add.text(0, -10, '', { ...FONT, color: '#f5cf6b' }).setOrigin(0.5);
    this.bannerName = this.add.text(0, 10, '', FONT).setOrigin(0.5);
    this.banner.add([this.bannerBg, this.bannerDistrict, this.bannerName]);
    this.scene.get('City').events.on('zone', z => this.showZone(z));
  }

  showZone(z) {
    this.tweens.killTweensOf(this.banner);
    if (!z) return this.tweens.add({ targets: this.banner, alpha: 0, duration: 200 });
    this.bannerDistrict.setText(z.district.toUpperCase());
    this.bannerName.setText(z.name);
    this.bannerBg.setSize(Math.max(this.bannerName.width, this.bannerDistrict.width) + 32, 46).setOrigin(0.5);
    this.tweens.add({ targets: this.banner, alpha: 1, duration: 150 });
  }
}
