// Gökyüzü kubbesi: gün/gece gradyanı, güneş ve ay diski, yıldızlar, hareketli bulutlar.
import * as THREE from 'three';

export class Sky {
  constructor(scene) {
    this.uniforms = {
      uTop: { value: new THREE.Color('#3f8fe0') }, uHorizon: { value: new THREE.Color('#bfe3ff') }, uBottom: { value: new THREE.Color('#d9e8f2') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color('#fff2d6') }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uStars: { value: 0 }, uCloud: { value: 0.45 }, uCloudColor: { value: new THREE.Color('#ffffff') }, uTime: { value: 0 }, uGlow: { value: 1 }, uDoom: { value: 0 }, uMoonColor: { value: new THREE.Color(0.85, 0.9, 1.0) }, uMoonSize: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor, uMoonDir, uCloudColor; uniform float uStars, uCloud, uTime, uGlow, uDoom, uMoonSize; uniform vec3 uMoonColor;
        varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*n2(p); p*=2.03; a*=0.5; } return s; }
        void main(){
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 col = y > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.75, y), 0.7)) : mix(uHorizon, uBottom, smoothstep(0.0, -0.25, y));
          // güneş
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunColor * (pow(sd, 900.0) * 18.0 + pow(sd, 18.0) * 0.35 * uGlow + pow(sd, 3.0) * 0.12 * uGlow);
          // ay
          float md = max(dot(d, normalize(uMoonDir)), 0.0);
          float mr = 1.0 - (1.0 - 0.9993) * uMoonSize * uMoonSize;
          col += uMoonColor * (smoothstep(mr, mr + 0.0003 * uMoonSize, md) * 1.6 + pow(md, 60.0 / uMoonSize) * 0.12 * uMoonSize) * uStars;
          // yıldızlar
          if (uStars > 0.01 && y > 0.0) {
            vec3 sp = floor(d * 260.0);
            float st = hash(sp);
            float tw = 0.6 + 0.4 * sin(uTime * 3.0 + st * 40.0);
            col += vec3(step(0.9965, st) * tw * uStars * smoothstep(0.0, 0.3, y));
          }
          // bulutlar
          if (y > 0.0) {
            vec2 cp = d.xz / (y + 0.12) * 1.3 + vec2(uTime * 0.008, uTime * 0.004);
            float c = fbm(cp * 1.7);
            float cov = smoothstep(1.0 - uCloud, 1.15 - uCloud * 0.6, c);
            float shade = 0.75 + 0.25 * fbm(cp * 3.1 + 4.0);
            vec3 cc = uCloudColor * shade + uSunColor * pow(sd, 6.0) * 0.4;
            col = mix(col, cc, cov * smoothstep(0.0, 0.18, y) * 0.92);
          }
          // kıyamet gökyüzü (son günler): mor-kızıl damarlar
          if (uDoom > 0.0) {
            float v = fbm(d.xz / (abs(y) + 0.2) * 2.0 + uTime * 0.02);
            col = mix(col, vec3(0.55, 0.08, 0.25) * (0.6 + v), uDoom * 0.45 * smoothstep(-0.05, 0.4, y));
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
    this.mesh.scale.setScalar(1000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.mesh.name = 'sky';
    scene.add(this.mesh);
  }
  follow(cam) { this.mesh.position.copy(cam.position); }
}
