// Görüntü motoru: WebGL renderer, kamera, son işlem (bloom + renk derecelendirme + vinyet).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
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
    this.gradePass = new ShaderPass(GradeShader);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.gradePass);
    this.composer.addPass(this.outputPass);
    this.grade = this.gradePass.uniforms;

    this.applySettings();
    Settings.onChange((path) => { if (path === '*' || path.startsWith('graphics')) this.applySettings(); });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.frameTimes = [];
  }

  applySettings() {
    const g = Settings.get('graphics');
    this.renderer.shadowMap.enabled = !!g.shadows;
    this.bloomPass.enabled = !!g.bloom && g.quality !== 'low';
    this.camera.fov = g.fov;
    this.camera.far = g.viewDistance;
    this.camera.updateProjectionMatrix();
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, g.quality === 'high' ? 1.5 : 1) * (g.renderScale || 1);
    this.resize();
    this.scene.traverse((o) => { if (o.material && o.material.needsUpdate !== undefined && o.castShadow) o.material.needsUpdate = true; });
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
    this.composer.render(dt);
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
  }

  get fps() {
    if (!this.frameTimes.length) return 0;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    return Math.round(1 / Math.max(avg, 1e-4));
  }
}
