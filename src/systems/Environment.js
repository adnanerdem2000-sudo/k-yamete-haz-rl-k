// Ortam görselleri: güneş/ay ışığı ve gölgeler, gökyüzü renkleri (gün doğumu/batımı),
// sis, hava efektleri (yağmur, kar, fırtına, şimşek), sokak lambaları ve bölge atmosferi.
import * as THREE from 'three';
import { lerp, clamp, smoothstep } from '../core/util.js';
import { softDot } from '../world/TextureFactory.js';
import { windUniforms } from '../world/Vegetation.js';
import { materials } from '../world/Geo.js';

// yağmurda parlayan dış yüzeyler (pürüzlülük düşer → yansıma artar)
const WET_KEYS = ['siding', 'brick', 'plaster', 'concrete', 'metal', 'asphalt', 'shingles', 'wood', 'trim', 'plain'];
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
    const sm = q === 'ultra' || q === 'high' ? 4096 : q === 'medium' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(sm, sm);
    const sc = this.sun.shadow.camera;
    sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x6a5a3a, 1.0);
    scene.add(this.hemi);
    // görüntü tabanlı ortam ışığı: oyunun gökyüzü kubbesi + zemin rengi birkaç saniyede bir PMREM ortam
    // haritasına çizilir (sabah, gün batımı, gece, bulut, kıyamet göğü yansımalara ve ortam ışığına yansır)
    this.envScene = new THREE.Scene();
    this.envGround = new THREE.Mesh(new THREE.CircleGeometry(900, 24), new THREE.MeshBasicMaterial({ color: 0x4a5a32 }));
    this.envGround.rotation.x = -Math.PI / 2; this.envGround.position.y = -30;
    this.envScene.add(this.envGround);
    this.pmrem = new THREE.PMREMGenerator(game.gfx.renderer);
    this.envRT = null; this.envT = 0; this.envKey = '';
    this.fog = new THREE.FogExp2(0xbfd8e8, 0.0018);
    scene.fog = this.fog;
    this.weather = { type: 'clear', rain: 0, cloud: 0.35, fog: 0, wind: 1, snow: 0, storm: 0 };
    this.flash = 0;
    this.doom = 0;
    this.bloodMoon = false; // Kanlı Ay gecesi (olay)
    this._blood = 0;
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
    const pos = new Float32Array(lamps.length * 3), col = new Float32Array(lamps.length * 3).fill(1);
    // bakımsız şebeke: sokak lambalarının bir kısmı hiç yanmaz, bir kısmı titrer (konuma göre deterministik)
    this.flickerLamps = [];
    lamps.forEach((l, i) => {
      pos[i * 3] = l.x; pos[i * 3 + 1] = l.y; pos[i * 3 + 2] = l.z;
      const h = Math.abs(Math.sin(l.x * 12.9898 + l.z * 78.233) * 43758.5453) % 1;
      l.state = l.kind !== 'street' ? 'ok' : h < 0.1 ? 'dead' : h < 0.24 ? 'flicker' : 'ok';
      l.seed = h * 100;
      l.level = l.state === 'dead' ? 0 : 1;
      if (l.state === 'dead') col.fill(0, i * 3, i * 3 + 3);
      if (l.state === 'flicker') this.flickerLamps.push(i);
    });
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.lampSprites = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd08a, vertexColors: true, size: 1.6, map: softDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    this.lampSprites.frustumCulled = false;
    this.scene.add(this.lampSprites);
  }

  /** Gökyüzü kubbesini (paylaşılan malzeme) ve zemin diskini ortam haritasına çiz */
  updateEnvMap(key, k, isNight, overcast) {
    this.envT = 20; this.envKey = key;
    const sky = this.world && this.world.sky;
    if (!sky) return;
    if (!this.envSky) { this.envSky = new THREE.Mesh(sky.mesh.geometry, sky.mesh.material); this.envSky.scale.setScalar(500); this.envScene.add(this.envSky); }
    // zemin: çimen-toprak karışımı, gün ışığıyla aydınlanmış (seken ışık)
    const lum = isNight ? 0.05 : clamp(k.sun * 0.32 * (1 - overcast * 0.5) + k.hemi * 0.18, 0.06, 0.6);
    this.envGround.material.color.setRGB(0.36 * lum, 0.42 * lum, 0.24 * lum);
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0.04, 1, 1600, { size: 128 });
    this.scene.environment = this.envRT.texture;
    this.envBase = 0.85; // gök ortam haritası hazır: taban ortam ışığı (öncesinde Graphics'in 0,35'i)
    this.applyEnvIntensity();
    if (old) old.dispose();
  }

  /** Ortam haritası (IBL) şiddeti: taban değer × yer altı kısması (yenileme karesinde de aynı değer, parlama olmasın) */
  applyEnvIntensity() {
    const want = (this.envBase ?? 0.35) * (1 - 0.8 * (this._under || 0));
    if (this.scene.environmentIntensity !== want) this.scene.environmentIntensity = want;
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
    if (isNight && this._blood > 0.01) { this.sun.color.lerp(_c2.set('#ff5a40'), this._blood * 0.75); this.sun.intensity *= 1 + this._blood * 0.4; }
    const fx = focus ? focus.x : 0, fy = focus ? focus.y : 0, fz = focus ? focus.z : 0;
    // gölge kamerası odakta (texel'e yapıştır, titreme önlenir)
    const snap = 110 / this.sun.shadow.mapSize.x;
    const sx = Math.round(fx / snap) * snap, sz = Math.round(fz / snap) * snap;
    this.sun.target.position.set(sx, fy, sz);
    this.sun.position.set(sx + lightDir.x * 150, fy + lightDir.y * 150, sz + lightDir.z * 150);
    this.hemi.color.copy(k.hemiSky);
    this.hemi.groundColor.copy(k.hemiGround);
    // ortam haritası varken yarım yarımküre ışığı (ortam ışığının kalanı ortam haritasından)
    this.hemi.intensity = k.hemi * (this.envRT ? 0.45 : 1) * (1 - overcast * 0.3) + this.flash * 3;
    // yer altı: gökyüzü/güneş ışığı toprağın içine sızmasın (odanın kendi lambaları ve el feneri aydınlatır)
    this._under = (this._under || 0) + ((this.underground ? 1 : 0) - (this._under || 0)) * Math.min(1, dt * 4);
    if (this._under > 0.001) { const u = this._under; this.hemi.intensity *= 1 - 0.88 * u; this.sun.intensity *= 1 - 0.97 * u; }
    this.applyEnvIntensity();
    // yer altında deniz/göl düzlemleri çizilmez: deniz seviyesinin (y = 0) altına inen odaları yatay bir su yüzü kesmesin
    const wat = this.world.water, under = !!this.underground;
    if (wat && wat._under !== under) { wat._under = under; for (const m of wat.meshes) m.material.visible = !under; }
    // gökyüzü
    const sky = this.world.sky.uniforms;
    const grey = _c2.set(isNight ? '#1a1f2c' : '#9aa3ad');
    sky.uTop.value.copy(k.top).lerp(grey, overcast * 0.7);
    sky.uHorizon.value.copy(k.horizon).lerp(grey, overcast * 0.6);
    sky.uBottom.value.copy(k.horizon).multiplyScalar(0.8);
    sky.uSunDir.value.copy(this.sunDir);
    // güneş yönü ufkun 0.05 üstünde sabitlenir; gerçek yükseklik ufkun altına inince disk ve hale söner
    sky.uSunColor.value.copy(k.sunColor).multiplyScalar((1 - overcast * 0.8) * clamp((elev + 0.03) / 0.09, 0, 1));
    sky.uMoonDir.value.copy(moonDir);
    sky.uStars.value = smoothstep(1250, 1320, minuteOfDay) + (1 - smoothstep(280, 340, minuteOfDay)) * (minuteOfDay < 400 ? 1 : 0);
    sky.uStars.value = clamp(sky.uStars.value, 0, 1) * (1 - overcast);
    sky.uCloud.value = clamp(W.cloud + W.rain * 0.4, 0, 0.95);
    sky.uCloudColor.value.set(isNight ? '#3a4458' : '#ffffff').lerp(_c1.set('#7d8590'), overcast);
    sky.uTime.value = t;
    sky.uDoom.value = this.doom;
    // Kanlı Ay: büyük, kızıl ay ve kızıla çalan gece
    this._blood += ((this.bloodMoon && isNight ? 1 : 0) - this._blood) * Math.min(1, dt * 0.5);
    sky.uMoonColor.value.setRGB(0.85, 0.9, 1.0).lerp(_c1.set('#ff3b24'), this._blood);
    sky.uMoonSize.value = 1 + this._blood * 1.6;
    sky.uGlow.value = 1 - overcast;
    if (this.flash > 0) { sky.uTop.value.lerp(_c1.set('#e8ecff'), this.flash); sky.uHorizon.value.lerp(_c1.set('#ffffff'), this.flash); }
    this.world.sky.follow(cam);
    // ortam haritası: gök belirgin değişince (15 oyun dakikası, bulut, kıyamet/Kanlı Ay) ya da en geç 20 sn'de
    // bir; art arda değişimlerde en sık 2 sn'de bir (her yenileme bir küp çizimi + bulanıklaştırma)
    this.envT -= dt;
    const ek = `${Math.round(minuteOfDay / 15)}|${Math.round(overcast * 10)}|${Math.round(this.doom * 10)}|${Math.round(this._blood * 10)}`;
    // gerçek zamana göre de sınırlı (en sık 2.5 sn): zaman hızlandırma/toplu adımlamada küp çizimleri birikmesin
    const nowMs = performance.now();
    if ((this.envT <= 0 || (ek !== this.envKey && this.envT < 18)) && nowMs - (this._envMs || 0) > 2500) { this._envMs = nowMs; this.updateEnvMap(ek, k, isNight, overcast); }
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
    if (this._blood > 0.01) gr.uTint.value.lerp(_c1.set('#ff8a7a'), this._blood * 0.4);
    gr.uSaturation.value = 1.15 - overcast * 0.25;
    this.game.gfx.renderer.toneMappingExposure = k.exposure * (1 - overcast * 0.12) + this.flash * (1 - (this._under || 0)); // şimşek yer altına çakmaz
    // su
    this.world.water.update(t, this.sunDir, sky.uSunColor.value, this.fog.color, this.fog.density, isNight ? 0.45 : 1 - overcast * 0.3, W.rain);
    // ıslaklık
    this.world.terrain.setWetness(Math.min(1, (this._wet = lerp(this._wet || 0, W.rain > 0.1 ? 1 : 0, dt * 0.05))));
    this.applyWetness(this._wet);
    // rüzgâr
    windUniforms.uTime.value = t;
    windUniforms.uWind.value = 1 + W.storm * 2.5 + W.rain * 0.8;
    // şimşek
    if (W.storm > 0.5 && Math.random() < dt * 0.08) { this.flash = 1; if (!this.underground) this.game.audio.thunder(); }
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
    // yer altında ve tavanlı (kit kabuklu kule) binanın içinde yağmur/kar çizilmez
    const kb = this.world.buildingAt(cam.position.x, cam.position.z, cam.position.y), covered = !!this.underground || !!(kb && kb.kit);
    const on = W.rain > 0.05 && !covered;
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
    const sOn = W.snow > 0.05 && !covered;
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

  /** Bina/yol malzemelerinin ıslaklığı: pürüzlülük azalır, yüzeyler gökyüzünü yansıtır (uniform; derleme yok) */
  applyWetness(w) {
    if (Math.abs(w - (this._wetApplied ?? -1)) < 0.01) return;
    this._wetApplied = w;
    const M = materials();
    for (const k of WET_KEYS) {
      const m = M[k];
      if (!m) continue;
      if (m.userData.rough0 === undefined) m.userData.rough0 = m.roughness;
      m.roughness = m.userData.rough0 * (1 - 0.5 * w);
    }
  }

  updateLamps(dt, minuteOfDay, cam) {
    if (!this.world) return;
    const night = minuteOfDay > 1170 || minuteOfDay < 370;
    const on = night && this.streetPower;
    // iç mekân lambaları, ekranlar, trafik ışıkları (Geo 'emissive' kovası): gece ve elektrik varsa ışır
    const em = materials().emissive;
    em.emissiveIntensity = lerp(em.emissiveIntensity, on ? 1.0 : 0, Math.min(1, dt * 2));
    if (this.lampSprites) this.lampSprites.material.opacity = lerp(this.lampSprites.material.opacity, on ? 0.95 : 0, Math.min(1, dt * 2));
    // arızalı lambalar: çoğunlukla yanık, ara ara sönüp yanan kesik titreme (sprite rengi + ışık havuzu)
    if (on && this.lampSprites && this.flickerLamps.length) {
      const t = (this._flT = (this._flT || 0) + dt), col = this.lampSprites.geometry.attributes.color;
      for (const i of this.flickerLamps) {
        const l = this.world.lamps[i];
        const n = Math.sin(t * 2.3 + l.seed) + Math.sin(t * 7.9 + l.seed * 1.7) * 0.6 + Math.sin(t * 31 + l.seed * 3.1) * 0.25;
        l.level = n > 1.15 ? 0.05 : n > 0.95 ? 0.45 : 1;
        col.setXYZ(i, l.level, l.level, l.level);
      }
      col.needsUpdate = true;
    }
    // tabelalar (gece ışıklı)
    for (const b of this.world.buildings) if (b.signMat) b.signMat.emissiveIntensity = on ? 0.6 : 0;
    // ışık havuzu: en yakın lambalar + ekstra ışıklar
    const cx = cam.position.x, cz = cam.position.z;
    const cands = [];
    // yer altındaysa yüzey lambaları toprağın içinden sızmasın; yüzeydeyse sığınak ışıkları seçilmesin
    const uz = this.underground || null;
    if (on && !uz) {
      for (const l of this.world.lamps) {
        if (l.state === 'dead') continue;
        const d2 = (l.x - cx) ** 2 + (l.z - cz) ** 2;
        if (d2 < 90 * 90) cands.push({ x: l.x, y: l.y, z: l.z, d2, color: l.color, intensity: (l.kind === 'flood' ? 60 : 38) * (l.level ?? 1), range: l.kind === 'flood' ? 30 : 20 });
      }
    }
    // iç mekân: kameranın içinde olduğu binanın tavan lambaları (gece + elektrik) → sıcak, kısa menzilli ışık
    if (on && !uz) {
      const b = this.world.buildingAt(cx, cz, cam.position.y);
      if (b && b.lamps) for (const l of b.lamps) cands.push({ x: l.x, y: l.y, z: l.z, d2: ((l.x - cx) ** 2 + (l.z - cz) ** 2) * 0.3, color: 0xffd9a0, intensity: 14, range: 9 });
    }
    for (const e of this.extraLights) {
      if (!e.on) continue;
      if ((e.zone || null) !== uz) continue;
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
