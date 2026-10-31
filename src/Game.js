// GameManager: önyükleme, ana döngü, menü/oturum durumları.
import * as THREE from 'three';
import { Graphics } from './core/Graphics.js';
import { Input } from './core/Input.js';
import { EventBus } from './core/EventBus.js';
import { Assets } from './core/Assets.js';
import { Settings } from './core/Settings.js';
import { World } from './world/WorldBuilder.js';
import { CharacterFactory, CHARACTERS, CHARACTER_IDS } from './entities/CharacterFactory.js';
import { ItemModels, IconRenderer } from './entities/ItemModels.js';
import { Avatar } from './entities/Avatar.js';
import { Environment } from './systems/Environment.js';
import { AudioManager } from './systems/AudioManager.js';
import { UIManager } from './ui/UIManager.js';
import { Net } from './net/Net.js';
import { Session } from './Session.js';
import { mapBase } from './systems/MapSystem.js';
import { PhysicsWorld } from './physics/PhysicsWorld.js';

const TIPS = [
  'İpucu: Silah sesleri zombileri çeker. Her sorunu silahla çözme.',
  'İpucu: Pencereleri tahtayla güçlendir; zombiler önce zayıf noktalara saldırır.',
  'İpucu: Gece zombileri karanlıkta çok daha tehlikelidir. Akşam üssüne dön.',
  'İpucu: Arkadaşın yere düştüyse yanına gidip E\'ye basılı tut.',
  'İpucu: Kirli suyu kaynatmadan içme. Ateş ya da filtre kullan.',
  'İpucu: Eğilerek (C) yürümek seni daha sessiz yapar.',
  'İpucu: 30. gün 22:00\'de Son Işık başlıyor. Bir kaçış planın olsun!',
  'İpucu: Mert araçları, Bora barikatları, Ceren yaraları daha hızlı halleder.',
];

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.gfx = new Graphics(canvas);
    this.scene = this.gfx.scene;
    this.input = new Input(canvas);
    this.bus = new EventBus();
    this.assets = new Assets();
    this.audio = new AudioManager(this);
    this.net = new Net(this);
    this.ui = new UIManager(this, uiRoot);
    this.state = 'boot';
    this.session = null;
    this.time = 0;
    this.last = performance.now();
    this.characters = CHARACTERS;
    this.settings = Settings;
  }

  async boot() {
    const fill = document.getElementById('ls-fill'), status = document.getElementById('ls-status'), tip = document.getElementById('ls-tip');
    let tipI = 0;
    const tipTimer = setInterval(() => { tip.textContent = TIPS[(tipI++) % TIPS.length]; }, 4500);
    const setP = (p, s) => { fill.style.width = Math.round(p * 100) + '%'; if (s) status.textContent = s; };
    try {
      if (document.fonts) {
        // tuval yazıları (tabelalar, isim etiketleri) için Türkçe karakterli yazı tiplerini önceden yükle
        const loads = ['40px "Luckiest Guy"', '500 16px Rubik', '700 16px Rubik'].map((f) => document.fonts.load(f, 'AaŞşİıĞğÇçÖöÜü'));
        await Promise.race([Promise.all(loads).then(() => document.fonts.ready), new Promise((r) => setTimeout(r, 2500))]);
      }
      await this.assets.loadAll((p, l) => setP(p * 0.45, 'Yükleniyor: ' + l));
      this.charFactory = new CharacterFactory(this.assets);
      this.itemModels = new ItemModels(this.assets);
      this.icons = new IconRenderer(this.gfx.renderer, this.itemModels);
      this.world = new World(this.assets, this.scene);
      let step = 0;
      await this.world.build((l) => { step++; setP(0.45 + step * 0.06, l); });
      setP(0.88, 'Fizik motoru hazırlanıyor…');
      await PhysicsWorld.load();
      this.phys = new PhysicsWorld(this.world);
      this.env = new Environment(this);
      this.env.setLamps(this.world);
      setP(0.92, 'Harita çiziliyor…');
      await new Promise((r) => setTimeout(r, 0));
      mapBase(this.world);
      setP(0.95, 'Menü hazırlanıyor…');
      this.menu = new MenuScene(this);
      // gölgeleri ilk karede derle
      this.gfx.renderer.compile(this.scene, this.gfx.camera);
      setP(1, 'Hazır');
    } catch (e) {
      console.error(e);
      status.textContent = 'Yükleme hatası: ' + e.message;
      clearInterval(tipTimer);
      throw e;
    }
    clearInterval(tipTimer);
    const ls = document.getElementById('loading-screen');
    ls.classList.add('done');
    setTimeout(() => ls.remove(), 900);
    this.state = 'menu';
    this.ui.showMainMenu();
    // ilk etkileşimde sesi başlat
    const startAudio = () => { this.audio.init(); window.removeEventListener('pointerdown', startAudio); window.removeEventListener('keydown', startAudio); };
    window.addEventListener('pointerdown', startAudio);
    window.addEventListener('keydown', startAudio);
    // davet bağlantısı (#oda=KOD)
    const m = location.hash.match(/oda=([A-Z0-9]{4,8})/i);
    if (m) this.ui.openJoin(m[1].toUpperCase());
    this.loop();
  }

  loop() {
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    this.time += dt;
    try {
      if (this.state === 'menu' && this.menu) this.menu.update(dt);
      else if (this.session) this.session.update(dt);
      this.ui.update(dt);
      this.net.update(dt);
    } catch (e) {
      console.error('Döngü hatası:', e);
      this.ui.toast('Bir hata oluştu: ' + e.message, 'danger');
    }
    this.gfx.render(dt, this.time);
    this.input.endFrame();
    this.raf = requestAnimationFrame(() => this.loop());
  }

  /** Yeni oturum başlat (tek oyunculu ya da çok oyunculu) */
  async startSession(cfg) {
    this.ui.showLoadingOverlay(cfg.mode === 'client' ? 'Odaya katılınıyor…' : 'Dünya hazırlanıyor…');
    await new Promise((r) => setTimeout(r, 30));
    if (this.menu) this.menu.hide();
    this.ui.menus.hide();
    try {
      this.session = new Session(this, cfg);
      await this.session.start();
    } catch (e) {
      console.error('Oturum başlatılamadı', e);
      this.ui.hideLoadingOverlay();
      if (this.session) { try { this.session.dispose(); } catch { /* yoksay */ } this.session = null; }
      this.net.leave();
      this.state = 'menu';
      if (this.menu) this.menu.show();
      this.ui.showMainMenu();
      this.ui.alert('Oyun başlatılamadı: ' + (e && e.message ? e.message : e));
      return;
    }
    this.state = 'playing';
    this.ui.hideLoadingOverlay();
    this.ui.showHUD();
    this.audio.setMusicMode('game');
    this.input.requestLock();
  }

  endSession(toMenu = true) {
    this.state = 'menu';
    if (this.session) { try { this.session.dispose(); } catch (e) { console.error(e); } this.session = null; }
    this.net.leave();
    this.audio.stopAllLoops();
    this.input.wantLock = false;
    this.input.releaseLock();
    this.ui.closePanel(true);
    this.ui.cancelProgress();
    this.ui.setPrompt(null);
    if (toMenu) {
      this.menu.show();
      this.ui.showMainMenu();
      this.audio.setMusicMode('menu');
      this.audio.setIntensity(0);
    }
  }
}

/** Ana menü arka planı: gün batımında üs, kamp ateşi başında karakterler, uzak sirenler */
class MenuScene {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    const w = game.world;
    const home = w.home;
    this.focus = home.frame.pt(12.5, 18);
    this.avatars = [];
    // kamp ateşi evin arka bahçesinde: oturanlar, ayaktakiler (konsept: gün batımında üs)
    const F = this.F = { ...(w.firePit || { x: -290, z: 133 }) };
    const spots = [
      { id: 'mert', dx: -2.6, dz: 0.1, rot: Math.PI / 2, mode: 'seat' },
      { id: 'zulal', dx: 2.6, dz: 0.3, rot: -Math.PI / 2, mode: 'seat' },
      { id: 'deniz', dx: 0.1, dz: 2.8, rot: Math.PI, mode: 'seat' },
      { id: 'elif', dx: 3.6, dz: 3.4, rot: -2.4, mode: 'idle' },
      { id: 'bora', dx: 7.5, dz: 8.2, rot: 0.25, mode: 'hammer' },
      { id: 'ceren', dx: -3.4, dz: 3.2, rot: 2.6, mode: 'idle' },
    ];
    const T = w.terrain;
    for (const s of spots) {
      const def = CHARACTERS[s.id];
      const av = new Avatar(game, def.look);
      const x = F.x + s.dx, z = F.z + s.dz;
      av.root.position.set(x, T.heightAt(x, z) + (s.mode === 'seat' ? 0.45 : 0), z);
      av.visYaw = s.rot;
      av.root.rotation.y = s.rot;
      if (s.mode === 'hammer') av.hold('hammer');
      if (s.id === 'elif') av.hold('bow');
      this.group.add(av.root);
      this.avatars.push({ av, s });
    }
    // ateş ışığı
    this.fire = { x: F.x, y: T.heightAt(F.x, F.z) + 0.6, z: F.z, color: 0xff8a3a, intensity: 18, range: 14, flicker: true, on: true, always: true };
    game.env.extraLights.push(this.fire);
    this.fireMesh = makeFire();
    this.fireMesh.position.set(F.x, T.heightAt(F.x, F.z) + 0.1, F.z);
    this.group.add(this.fireMesh);
    // garajda aile arabası
    const car = game.assets.model('vehicles', 'sedan');
    const gp = home.frame.pt(21.5, 6.5);
    car.scale.setScalar(1.7);
    car.position.set(gp.x, T.heightAt(gp.x, gp.z) + 0.3, gp.z + 9);
    car.rotation.y = Math.PI * 0.95;
    car.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    this.group.add(car);
    this.car = car;
    this.sirenT = 3;
  }
  hide() { this.group.visible = false; this.endShowcase(); const i = this.game.env.extraLights.indexOf(this.fire); if (i >= 0) this.game.env.extraLights.splice(i, 1); }
  show() { this.group.visible = true; if (!this.game.env.extraLights.includes(this.fire)) this.game.env.extraLights.push(this.fire); }

  /** Özelleştirme ekranı: seçilen görünümü kamp ateşinin yanında 3B göster */
  showcase(look) {
    const g = this.game;
    if (this.sc) { this.sc.av.dispose(); } else {
      this.sc = { yaw: Math.PI - 0.35, drag: null };
      const c = g.canvas;
      this.sc.down = (e) => { this.sc.drag = e.clientX; };
      this.sc.move = (e) => { if (this.sc && this.sc.drag !== null) { this.sc.yaw += (e.clientX - this.sc.drag) * 0.012; this.sc.drag = e.clientX; } };
      this.sc.up = () => { if (this.sc) this.sc.drag = null; };
      c.addEventListener('pointerdown', this.sc.down);
      window.addEventListener('pointermove', this.sc.move);
      window.addEventListener('pointerup', this.sc.up);
    }
    const av = new Avatar(g, look);
    const T = g.world.terrain;
    const x = this.F.x + 4.6, z = this.F.z - 2.6;
    av.root.position.set(x, T.heightAt(x, z), z);
    this.group.add(av.root);
    this.sc.av = av;
    this.sc.pos = { x, z, y: T.heightAt(x, z) };
    for (const { av: o } of this.avatars) o.root.visible = false;
  }

  endShowcase() {
    if (!this.sc) return;
    this.sc.av.dispose();
    const c = this.game.canvas;
    c.removeEventListener('pointerdown', this.sc.down);
    window.removeEventListener('pointermove', this.sc.move);
    window.removeEventListener('pointerup', this.sc.up);
    this.sc = null;
    for (const { av: o } of this.avatars) o.root.visible = true;
  }

  update(dt) {
    this.t += dt;
    const g = this.game;
    const cam = g.gfx.camera;
    if (this.sc) {
      // vitrin kamerası: karakterin önünden, hafif sağdan (panel solda)
      const p = this.sc.pos;
      cam.position.set(p.x + 0.5, p.y + 1.3, p.z - 3.2);
      cam.lookAt(p.x + 0.95, p.y + 0.95, p.z);
      this.sc.av.visYaw = this.sc.yaw;
      this.sc.av.update(dt, { mode: 'ground', speed: 0, yaw: this.sc.yaw, instantYaw: true, pitch: 0 });
    } else {
      // yavaş kamera hareketi: ateşin kuzeyinden eve (güneye) bakış, gün batımı sağda
      const F = this.F;
      const a = Math.PI + 0.42 + Math.sin(this.t * 0.05) * 0.14;
      const R = 12.5 + Math.sin(this.t * 0.07) * 0.8;
      const cx = F.x + Math.sin(a) * R, cz = F.z + Math.cos(a) * R;
      const gy = g.world.terrain.heightAt(F.x, F.z);
      cam.position.set(cx, gy + 2.3 + Math.sin(this.t * 0.11) * 0.25, cz);
      cam.lookAt(F.x + 1.2, gy + 1.7, F.z + 6);
    }
    for (const { av, s } of this.avatars) {
      if (!av.root.visible) continue;
      av.update(dt, { mode: s.mode === 'seat' ? 'seat' : 'ground', speed: 0, yaw: s.rot, pitch: 0 });
      if (s.mode === 'hammer' && !av.action) av.play('hammer', 2.5);
      if (s.id === 'ceren' && !av.action && Math.random() < dt * 0.15) av.play('laugh', 1.6);
      if (s.id === 'zulal' && !av.action && Math.random() < dt * 0.08) av.play('wave', 1.5);
    }
    this.fireMesh.children.forEach((f, i) => { f.scale.y = 0.8 + Math.sin(this.t * 9 + i) * 0.25; f.rotation.y += dt * (1 + i); });
    g.env.weather.cloud = 0.3;
    g.env.update(dt, g.time, 19 * 60 + 2 + Math.sin(this.t * 0.02) * 6, cam.position, null);
    g.world.vegetation.update(cam.position, 420, true);
    for (const im of g.world.instancer.meshes) im.visible = true;
    g.audio.setListener(cam.position.x, cam.position.y, cam.position.z, Math.atan2(cam.position.x - this.F.x, cam.position.z - this.F.z));
    g.audio.loop('menu_fire', 'fire', { at: this.fireMesh.position, vol: 0.25, bus: 'ambient' });
    g.audio.loop('menu_wind', 'wind', { vol: 0.12, bus: 'ambient' });
    this.sirenT -= dt;
    if (this.sirenT <= 0) { this.sirenT = 14 + Math.random() * 14; g.audio.play('siren', { vol: 0.6, bus: 'ambient' }); }
  }
}

export function makeFire() {
  const g = new THREE.Group();
  const cols = [0xff5a1a, 0xff9a2a, 0xffd25a];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.32 - i * 0.08, 0.9 - i * 0.2, 6), new THREE.MeshBasicMaterial({ color: cols[i], transparent: true, opacity: 0.85 }));
    m.position.y = 0.35 + i * 0.05;
    g.add(m);
  }
  return g;
}

export { CHARACTER_IDS };
