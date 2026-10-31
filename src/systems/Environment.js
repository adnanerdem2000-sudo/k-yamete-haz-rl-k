// Ortam görselleri: güneş/ay ışığı ve gölgeler, gökyüzü renkleri (gün doğumu/batımı),
// sis, hava efektleri (yağmur, kar, fırtına, şimşek), sokak lambaları ve bölge atmosferi.
import * as THREE from 'three';
import { lerp, clamp, smoothstep } from '../core/util.js';
import { softDot } from '../world/TextureFactory.js';
import { windUniforms } from '../world/Vegetation.js';
import { Settings } from '../core/Settings.js';

// gün içi renk anahtarları [dakika, gökyüzü üst, ufuk, güneş rengi, güneş şiddeti, hemi gök, hemi yer, hemi şiddet, pozlama]
const KEYS = [
  [0, '#081230', '#16244a', '#8fa8ff', 0.0, '#26365e', '#0d1018', 0.42, 0.95],
  [300, '#0e1a44', '#2c3058', '#8fa8ff', 0.0, '#2c3a62', '#10131a', 0.45, 0.95],
  [360, '#3d6fb6', '#ffae78', '#ffa868', 1.2, '#7d93c7', '#4a3a2a', 0.7, 1.0],
  [450, '#3f8fe0', '#c4e4ff', '#ffe8c4', 2.4, '#bcd8ff', '#6a5a3a', 1.0, 1.05],
  [720, '#2f7fd8', '#d2ecff', '#fffaf0', 3.0, '#cfe6ff', '#7a6a48', 1.1, 1.05],
  [1020, '#3f78c8', '#ffd9a8', '#ffd59e', 2.5, '#c6d6f2', '#7a5f3a', 1.0, 1.05],
  [1140, '#4a5aa8', '#ff8a4a', '#ff8a44', 1.5, '#a78fb8', '#5a3a2a', 0.85, 1.05],
  [1230, '#1e2a5a', '#a0507a', '#ff6a5a', 0.25, '#4a4a7a', '#22161a', 0.55, 1.0],
  [1290, '#0b1536', '#1e2850', '#8fa8ff', 0.0, '#2a3a66', '#0e1018', 0.45, 0.95],
  [1440, '#081230', '#16244a', '#8fa8ff', 0.0, '#26365e', '#0d1018', 0.42, 0.95],
];
const _c1 = new THREE.Color(), _c2 = new THREE.Color();

function sample(min) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= min) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = clamp((min - a[0]) / (b[0] - a[0]), 0, 1);
  const col = (k) => _c1.set(a[k]).lerp(_c2.set(b[k]), t).clone();
  return { top: col(1), horizon: col(2), sunColor: col(3), sun: lerp(a[4], b[4], t), hemiSky: col(5), hemiGround: col(6), hemi: lerp(a[7], b[7], t), exposure: lerp(a[8], b[8], t) };
}

export class Environment {
  constructor(game) {
    this.game = game;
    const scene = game.gfx.scene;
    this.scene = scene;
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const q = Settings.get('graphics.quality');
    this.sun.shadow.mapSize.set(q === 'high' ? 4096 : q === 'medium' ? 2048 : 1024, q === 'high' ? 4096 : q === 'medium' ? 2048 : 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6a5a3a, 1.0);
    scene.add(this.hemi);
    this.fog = new THREE.FogExp2(0xbfd8e8, 0.0018);
    scene.fog = this.fog;
    this.weather = { type: 'clear', rain: 0, cloud: 0.35, fog: 0, wind: 1, snow: 0, storm: 0 };
    this.flash = 0;
    this.doom = 0;
    this.redMist = 0;
    this.regionTint = new THREE.Color(1, 1, 1);
    this.targetTint = new THREE.Color(1, 1, 1);
    this.dangerFog = new THREE.Color('#5a3a7a');
    this.sunDir = new THREE.Vector3(0, 1, 0);
    // yağmur
    this.makeRain();
    // lambalar: ampul sprite'ları + yakındaki lambalara atanan nokta ışıkları
    this.lampSprites = null;
    this.lightPool = [];
    for (let i = 0; i < 8; i++) {
      const pl = new THREE.PointLight(0xffd9a0, 0, 22, 1.6);
      pl.castShadow = false;
      scene.add(pl);
      this.lightPool.push(pl);
    }
    this.extraLights = []; // ateş, projektör vb. {x,y,z,color,intensity,range,flicker}
    this.streetPower = true;
  }

  makeRain() {
    const N = 2600;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 6);
    this.rainSeeds = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { this.rainSeeds[i * 3] = Math.random() * 60 - 30; this.rainSeeds[i * 3 + 1] = Math.random() * 30; this.rainSeeds[i * 3 + 2] = Math.random() * 60 - 30; }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xbfd6ea, transparent: true, opacity: 0.45 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
    // kar
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(1500 * 3), 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, map: softDot(), transparent: true, depthWrite: false }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    this.scene.add(this.snow);
  }

  setLamps(world) {
    this.world = world;
    const lamps = world.lamps;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(lamps.length * 3);
    lamps.forEach((l, i) => { pos[i * 3] = l.x; pos[i * 3 + 1] = l.y; pos[i * 3 + 2] = l.z; });
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.lampSprites = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd08a, size: 1.6, map: softDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.lampSprites.frustumCulled = false;
    this.scene.add(this.lampSprites);
  }

  /**
   * minuteOfDay: oyun saati; focus: oyuncu konumu; region: bulunulan bölge
   */
  update(dt, t, minuteOfDay, focus, region = null) {
    const k = sample(minuteOfDay);
    const W = this.weather;
    const cam = this.game.gfx.camera;
    // güneş açısı: 06:00 doğar, 19:30 batar
    const dayFrac = clamp((minuteOfDay - 330) / (1185 - 330), 0, 1);
    const ang = dayFrac * Math.PI;
    const elev = Math.sin(ang);
    this.sunDir.set(Math.cos(ang) * 0.85, Math.max(0.05, elev), 0.38).normalize();
    const isNight = elev <= 0.02 || minuteOfDay < 330 || minuteOfDay > 1185;
    // ay
    const moonDir = new THREE.Vector3(-Math.cos(((minuteOfDay + 720) % 1440) / 1440 * Math.PI * 2) * 0.6, 0.65, -0.3).normalize();
    const overcast = clamp(W.cloud * 0.7 + W.rain * 0.4 + W.storm * 0.3, 0, 0.85);
    // ışıklar
    const sunI = k.sun * (1 - overcast * 0.75);
    const lightDir = isNight ? moonDir : this.sunDir;
    this.sun.color.copy(isNight ? _c1.set('#8fa8ff') : k.sunColor);
    this.sun.intensity = isNight ? 0.38 * (1 - overcast * 0.6) : Math.max(0.2, sunI);
    const fx = focus ? focus.x : 0, fy = focus ? focus.y : 0, fz = focus ? focus.z : 0;
    // gölge kamerası odakta (texel'e yapıştır, titreme önlenir)
    const snap = 110 / this.sun.shadow.mapSize.x;
    const sx = Math.round(fx / snap) * snap, sz = Math.round(fz / snap) * snap;
    this.sun.target.position.set(sx, fy, sz);
    this.sun.position.set(sx + lightDir.x * 150, fy + lightDir.y * 150, sz + lightDir.z * 150);
    this.hemi.color.copy(k.hemiSky);
    this.hemi.groundColor.copy(k.hemiGround);
    this.hemi.intensity = k.hemi * (1 - overcast * 0.3) + this.flash * 3;
    // gökyüzü
    const sky = this.world.sky.uniforms;
    const grey = _c2.set(isNight ? '#1a1f2c' : '#9aa3ad');
    sky.uTop.value.copy(k.top).lerp(grey, overcast * 0.7);
    sky.uHorizon.value.copy(k.horizon).lerp(grey, overcast * 0.6);
    sky.uBottom.value.copy(k.horizon).multiplyScalar(0.8);
    sky.uSunDir.value.copy(this.sunDir);
    sky.uSunColor.value.copy(k.sunColor).multiplyScalar(1 - overcast * 0.8);
    sky.uMoonDir.value.copy(moonDir);
    sky.uStars.value = smoothstep(1250, 1320, minuteOfDay) + (1 - smoothstep(280, 340, minuteOfDay)) * (minuteOfDay < 400 ? 1 : 0);
    sky.uStars.value = clamp(sky.uStars.value, 0, 1) * (1 - overcast);
    sky.uCloud.value = clamp(W.cloud + W.rain * 0.4, 0, 0.95);
    sky.uCloudColor.value.set(isNight ? '#3a4458' : '#ffffff').lerp(_c1.set('#7d8590'), overcast);
    sky.uTime.value = t;
    sky.uDoom.value = this.doom;
    sky.uGlow.value = 1 - overcast;
    if (this.flash > 0) { sky.uTop.value.lerp(_c1.set('#e8ecff'), this.flash); sky.uHorizon.value.lerp(_c1.set('#ffffff'), this.flash); }
    this.world.sky.follow(cam);
    // bölge renk tonu
    this.targetTint.setRGB(1, 1, 1);
    if (region) {
      if (region.theme === 'lab') this.targetTint.set('#d9c8ff');
      else if (region.theme === 'military') this.targetTint.set('#f2ead4');
      else if (region.theme === 'city') this.targetTint.set('#fff0dc');
      else if (region.theme === 'forest') this.targetTint.set('#e8ffe6');
    }
    this.regionTint.lerp(this.targetTint, Math.min(1, dt * 0.8));
    // sis
    const baseFog = (isNight ? 0.0032 : 0.0019) + W.fog * 0.016 + W.rain * 0.004 + W.storm * 0.004 + W.snow * 0.006 + this.redMist * 0.03;
    this.fog.density = baseFog * (420 / Settings.get('graphics.viewDistance'));
    this.fog.color.copy(sky.uHorizon.value).lerp(_c1.set('#c9c9c9'), W.fog * 0.6);
    if (this.redMist > 0) this.fog.color.lerp(_c1.set('#8a1a2a'), this.redMist);
    if (region && region.danger >= 4) this.fog.color.lerp(this.dangerFog, 0.25);
    this.scene.background = null;
    // renk derecelendirme
    const gr = this.game.gfx.grade;
    gr.uTint.value.copy(this.regionTint);
    if (isNight) gr.uTint.value.multiply(_c1.set('#c8d4ff'));
    if (this.doom > 0) gr.uTint.value.lerp(_c1.set('#ffb0b0'), this.doom * 0.35);
    gr.uSaturation.value = 1.15 - overcast * 0.25;
    this.game.gfx.renderer.toneMappingExposure = k.exposure * (1 - overcast * 0.12) + this.flash;
    // su
    this.world.water.update(t, this.sunDir, sky.uSunColor.value, this.fog.color, this.fog.density, isNight ? 0.45 : 1 - overcast * 0.3, W.rain);
    // ıslaklık
    this.world.terrain.setWetness(Math.min(1, (this._wet = lerp(this._wet || 0, W.rain > 0.1 ? 1 : 0, dt * 0.05))));
    // rüzgâr
    windUniforms.uTime.value = t;
    windUniforms.uWind.value = 1 + W.storm * 2.5 + W.rain * 0.8;
    // şimşek
    if (W.storm > 0.5 && Math.random() < dt * 0.08) { this.flash = 1; this.game.audio.thunder(); }
    this.flash = Math.max(0, this.flash - dt * 3.5);
    // yağmur parçacıkları
    this.updateParticles(dt, cam);
    // lambalar
    this.updateLamps(dt, minuteOfDay, cam);
    this.isNight = isNight;
    this.darkness = isNight ? 1 : clamp(1 - k.sun / 1.2, 0, 1);
  }

  updateParticles(dt, cam) {
    const W = this.weather;
    const on = W.rain > 0.05;
    this.rain.visible = on;
    if (on) {
      const p = this.rain.geometry.attributes.position.array;
      const N = this.rainSeeds.length / 3;
      const n = Math.floor(N * Math.min(1, W.rain));
      const wind = 3 + W.storm * 6;
      for (let i = 0; i < N; i++) {
        let y = this.rainSeeds[i * 3 + 1] - dt * 26;
        if (y < -4) y += 30;
        this.rainSeeds[i * 3 + 1] = y;
        const k = i * 6;
        if (i >= n) { p[k] = p[k + 3] = 0; p[k + 1] = p[k + 4] = -1000; p[k + 2] = p[k + 5] = 0; continue; }
        const x = cam.position.x + this.rainSeeds[i * 3], z = cam.position.z + this.rainSeeds[i * 3 + 2];
        const yy = cam.position.y + y - 8;
        p[k] = x; p[k + 1] = yy; p[k + 2] = z;
        p[k + 3] = x + wind * 0.04; p[k + 4] = yy - 0.7; p[k + 5] = z + wind * 0.02;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.opacity = 0.25 + W.rain * 0.3;
    }
    const sOn = W.snow > 0.05;
    this.snow.visible = sOn;
    if (sOn) {
      const p = this.snow.geometry.attributes.position.array;
      const N = p.length / 3;
      if (!this.snowSeeds) { this.snowSeeds = new Float32Array(N * 3); for (let i = 0; i < N; i++) { this.snowSeeds[i * 3] = Math.random() * 50 - 25; this.snowSeeds[i * 3 + 1] = Math.random() * 20; this.snowSeeds[i * 3 + 2] = Math.random() * 50 - 25; } }
      for (let i = 0; i < N; i++) {
        let y = this.snowSeeds[i * 3 + 1] - dt * 1.6;
        if (y < -3) y += 20;
        this.snowSeeds[i * 3 + 1] = y;
        p[i * 3] = cam.position.x + this.snowSeeds[i * 3] + Math.sin(this.game.time + i) * 0.4;
        p[i * 3 + 1] = cam.position.y + y - 6;
        p[i * 3 + 2] = cam.position.z + this.snowSeeds[i * 3 + 2];
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
    }
  }

  updateLamps(dt, minuteOfDay, cam) {
    if (!this.world) return;
    const night = minuteOfDay > 1170 || minuteOfDay < 370;
    const on = night && this.streetPower;
    if (this.lampSprites) this.lampSprites.material.opacity = lerp(this.lampSprites.material.opacity, on ? 0.95 : 0, Math.min(1, dt * 2));
    // tabelalar (gece ışıklı)
    for (const b of this.world.buildings) if (b.signMat) b.signMat.emissiveIntensity = on ? 0.6 : 0;
    // ışık havuzu: en yakın lambalar + ekstra ışıklar
    const cx = cam.position.x, cz = cam.position.z;
    const cands = [];
    if (on) {
      for (const l of this.world.lamps) {
        const d2 = (l.x - cx) ** 2 + (l.z - cz) ** 2;
        if (d2 < 90 * 90) cands.push({ x: l.x, y: l.y, z: l.z, d2, color: l.color, intensity: l.kind === 'flood' ? 60 : 38, range: l.kind === 'flood' ? 30 : 20 });
      }
    }
    for (const e of this.extraLights) {
      if (!e.on) continue;
      const d2 = (e.x - cx) ** 2 + (e.z - cz) ** 2;
      if (d2 < 80 * 80) cands.push({ ...e, d2: d2 * 0.5, intensity: e.intensity * (e.flicker ? 0.85 + Math.random() * 0.3 : 1) * (night || e.always ? 1 : 0.25) });
    }
    cands.sort((a, b) => a.d2 - b.d2);
    for (let i = 0; i < this.lightPool.length; i++) {
      const pl = this.lightPool[i];
      const c = cands[i];
      if (!c) { pl.intensity = 0; continue; }
      pl.position.set(c.x, c.y, c.z);
      pl.color.set(c.color || 0xffd9a0);
      pl.distance = c.range || 20;
      pl.intensity = c.intensity;
    }
  }
}
