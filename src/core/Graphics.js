// Görüntü motoru: WebGL renderer, kamera, son işlem (AO [Ultra] + bloom + renk derecelendirme + vinyet).
// Kalite seviyesi: çözünürlük tavanı, bloom, AO; GPU kare süresi PerfMonitor ile ölçülür.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Settings } from './Settings.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.32 },
    uSaturation: { value: 1.12 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uDanger: { value: 0 },        // ekran kenarında kırmızı nabız (düşük can)
    uDangerColor: { value: new THREE.Color(0.9, 0.05, 0.08) },
    uBlur: { value: 0 },          // uykusuzluk / baygınlık
    uTime: { value: 0 },
    uDesat: { value: 0 },         // yere düşünce renk kaybı
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uVignette, uSaturation, uDanger, uBlur, uTime, uDesat;
    uniform vec3 uTint, uDangerColor; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      if (uBlur > 0.0) {
        vec2 o = vec2(0.004 * uBlur * (1.0 + sin(uTime*1.7)*0.3), 0.0);
        c.rgb = (c.rgb + texture2D(tDiffuse, vUv + o).rgb + texture2D(tDiffuse, vUv - o).rgb + texture2D(tDiffuse, vUv + o.yx * 1.3).rgb) / 4.0;
      }
      c.rgb *= uTint;
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, uSaturation * (1.0 - uDesat));
      vec2 d = vUv - 0.5;
      float r = dot(d, d);
      c.rgb *= 1.0 - uVignette * smoothstep(0.08, 0.55, r);
      float pulse = 0.6 + 0.4 * sin(uTime * 4.0);
      c.rgb = mix(c.rgb, uDangerColor, uDanger * pulse * smoothstep(0.12, 0.5, r));
      gl_FragColor = c;
    }`,
};

export class Graphics {
  constructor(canvas) {
    this.canvas = canvas;
    const q = Settings.get('graphics.quality');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q !== 'low', powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(Settings.get('graphics.fov'), 1, 0.08, Settings.get('graphics.viewDistance'));
    this.camera.position.set(0, 10, 20);
    this.scene.add(this.camera);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 0.86);
    // NaN koruması: sahnedeki tek bir NaN/sonsuz piksel (bozuk normal, sıfıra bölme) parlamanın bulanıklık zincirinde
    // bütün kareye yayılıp ekranı karartıyordu; parlamaya giren pikseller süzülür
    {
      const hp = this.bloomPass.materialHighPassFilter;
      const src = 'vec4 texel = texture2D( tDiffuse, vUv );';
      if (hp && hp.fragmentShader.includes(src)) {
        hp.fragmentShader = hp.fragmentShader.replace(src, src + '\n\t\t\tif ( any( isnan( texel ) ) || any( isinf( texel ) ) ) texel = vec4( 0.0 );');
        hp.needsUpdate = true;
      } else console.warn('Parlama NaN koruması uygulanamadı (gölgelendirici değişmiş)');
    }
    this.gradePass = new ShaderPass(GradeShader);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.gradePass);
    this.composer.addPass(this.outputPass);
    this.grade = this.gradePass.uniforms;
    this.beforeRender = new Set(); // çizimden önce (ör. su yansıması): fn(renderer, scene, camera)
    this.perf = null;

    this.applySettings();
    Settings.onChange((path) => { if (path === '*' || path.startsWith('graphics')) this.applySettings(); });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.frameTimes = [];
  }

  applySettings() {
    const g = Settings.get('graphics');
    const shadowChanged = this._shadows !== undefined && this._shadows !== !!g.shadows;
    this._shadows = !!g.shadows;
    this.renderer.shadowMap.enabled = !!g.shadows;
    this.bloomPass.enabled = !!g.bloom && g.quality !== 'low';
    this.bloomPass.strength = g.quality === 'ultra' ? 0.38 : 0.32;
    this.setAO(!!g.ao);
    this.camera.fov = g.fov;
    this.camera.far = g.viewDistance;
    this.camera.updateProjectionMatrix();
    // çözünürlük tavanı kaliteye göre: düşük/orta 1×, yüksek 1,5×, ultra 2× (cihaz oranıyla sınırlı)
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, g.quality === 'ultra' ? 2 : g.quality === 'high' ? 1.5 : 1) * (g.renderScale || 1);
    if (!g.autoScale) this.dynScale = 1;
    this.pixelRatio = this.basePixelRatio * (this.dynScale || 1);
    this.resize();
    // gölge aç/kapa malzemeleri yeniden derletir: yalnız gerçekten değiştiğinde (her ayar değişiminde değil)
    // gölge alan (yalnız receiveShadow) zemin/yol malzemeleri de yeniden derlenmeli
    if (shadowChanged) this.scene.traverse((o) => { if (!o.material) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && m.needsUpdate !== undefined) m.needsUpdate = true; });
  }

  /** Ortam kapanması (GTAO): ilk açılışta kurulur, sonra yalnız etkinleştirilir/kapatılır */
  setAO(on) {
    if (on && !this.gtaoPass) {
      const p = new GTAOPass(this.scene, this.camera, Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
      p.output = GTAOPass.OUTPUT.Default;
      p.blendIntensity = 0.9;
      p.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.6, thickness: 1.2, scale: 1, samples: 12, distanceFallOff: 1 });
      p.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      // saydam yüzeyler (su, cam, parçacık), alfa kesimli yapraklar (normal tamponunda dolu dörtgen olurdu), gökyüzü ve
      // işaretli nesneler AO tamponuna girmez. Oyuncu bir binadayken çatısı köşe gölgelendiricisinde kırpılır; AO geçişinin
      // ortak malzemesinde bu kırpma olmadığından o sırada birleşik çatı ağları AO'dan çıkarılır (yoksa gizli çatı AO'da
      // görünür)
      p._overrideVisibility = function () {
        const cache = this._visibilityCache;
        this.scene.traverse((o) => {
          if (!o.visible) return;
          const m = o.material, rh = o.userData.roofHide;
          const tr = m && (Array.isArray(m) ? m.some((x) => x && (x.transparent || x.alphaTest > 0)) : m.transparent || m.alphaTest > 0);
          if (o.isPoints || o.isLine || o.isLine2 || o.isSprite || tr || o.userData.noAO || (rh && rh.value > 0)) { o.visible = false; cache.push(o); }
        });
      };
      // normal/derinlik tamponu çizilirken gölge haritaları yeniden hesaplanmasın (hem maliyet hem yapraksız gölge)
      const render0 = p.render.bind(p);
      p.render = (renderer, writeBuffer, readBuffer, dt, mask) => {
        const au = renderer.shadowMap.autoUpdate;
        renderer.shadowMap.autoUpdate = false;
        try { render0(renderer, writeBuffer, readBuffer, dt, mask); } finally { renderer.shadowMap.autoUpdate = au; }
      };
      this.composer.insertPass(p, 1);
      this.gtaoPass = p;
      this.resize();
    }
    if (this.gtaoPass) this.gtaoPass.enabled = !!on;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio || 1);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio || 1);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(dt, time) {
    this.grade.uTime.value = time;
    // çizim/üçgen sayaçları karenin bütün geçişlerini (yansıma, AO, bloom…) toplasın: renderer her render() çağrısında
    // sıfırlardı ve sayaç yalnız son tam ekran geçişini (1 çizim) gösterirdi
    const info = this.renderer.info;
    info.autoReset = false; info.reset();
    if (this.perf) this.perf.gpuBegin(); // GPU süresine yansıma çizimi de dahil
    for (const fn of this.beforeRender) fn(this.renderer, this.scene, this.camera);
    this.composer.render(dt);
    if (this.perf) this.perf.gpuEnd();
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    this.autoScale(dt);
  }

  /**
   * Performans testi için: dinamik çözünürlüğü dondur ve ayarlanan çözünürlüğe dön (on), sonra eski ölçeğe geri dön (off).
   * Böylece sahneler aynı çözünürlükte ölçülür ve sonuç kalite ön ayarının gerçek maliyetini gösterir.
   */
  holdScale(on) {
    if (on) {
      if (this.scaleHeld) return;
      this.scaleHeld = true;
      this._heldScale = this.dynScale || 1;
      if (this._heldScale !== 1) { this.dynScale = 1; this.pixelRatio = this.basePixelRatio; this.resize(); }
    } else if (this.scaleHeld) {
      this.scaleHeld = false;
      const s = Settings.get('graphics.autoScale') ? this._heldScale || 1 : 1;
      if (s !== (this.dynScale || 1)) { this.dynScale = s; this.pixelRatio = this.basePixelRatio * s; this.resize(); }
      this._asT = 0;
    }
  }

  /** Dinamik çözünürlük: kare hızı düşükse iç çözünürlüğü azalt, yüksekse geri artır */
  autoScale(dt) {
    if (this.scaleHeld || !Settings.get('graphics.autoScale')) return;
    this._asT = (this._asT || 0) + dt;
    if (this._asT < 2) return;
    this._asT = 0;
    const fps = this.fps;
    const cur = this.dynScale || 1;
    let next = cur;
    if (fps < 38) next = Math.max(0.55, cur - 0.1);
    else if (fps > 57) next = Math.min(1, cur + 0.05);
    if (Math.abs(next - cur) > 0.001) {
      this.dynScale = next;
      this.pixelRatio = this.basePixelRatio * next;
      this.resize();
    }
  }

  get fps() {
    if (!this.frameTimes.length) return 0;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    return Math.round(1 / Math.max(avg, 1e-4));
  }
}
