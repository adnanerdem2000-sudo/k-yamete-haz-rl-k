// Performans ölçümü (Aşama 8): kare süresi (ort., %1 en kötü → "1% low" FPS), CPU kare süresi (oyun döngüsünün
// JS süresi: güncelleme + çizim komutlarının gönderimi), GPU kare süresi (EXT_disjoint_timer_query_webgl2 varsa;
// yazılım GPU'sunda ve bazı tarayıcılarda yoktur → null), çizim çağrısı, üçgen, bellek (JS yığını, GPU kaynakları),
// aktif zombi ve fizik nesnesi sayısı. Pencere: son 600 kare. Gösterge (FPS sayacı) ve kıyaslama (Benchmark) kullanır.
const N = 600;

export class PerfMonitor {
  constructor(renderer) {
    this.renderer = renderer;
    this.gl = renderer.getContext();
    try { this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2'); } catch { this.ext = null; }
    this.frame = new Float32Array(N); // gerçek kare aralığı (ms, sınırlanmamış)
    this.cpu = new Float32Array(N);
    this.gpu = new Float32Array(N);
    this.n = 0; this.gn = 0;
    this.pending = [];
    this.query = null;
    this.calls = 0; this.triangles = 0;
    this._phys = { t: 0, bodies: 0, awake: 0 };
  }

  /** Oyun döngüsünün başında */
  begin() { this.t0 = performance.now(); }

  /** Çizimden hemen önce/sonra: GPU zaman sorgusu (tek seferde bir sorgu) */
  gpuBegin() {
    if (!this.ext || this.query) return;
    const gl = this.gl;
    try { this.query = gl.createQuery(); gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.query); } catch { this.query = null; this.ext = null; }
  }
  gpuEnd() {
    if (!this.query) return;
    try { this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.pending.push(this.query); } catch { /* yoksay */ }
    this.query = null;
  }

  /** Oyun döngüsünün sonunda: rawMs = önceki kareden bu yana gerçek süre */
  end(rawMs) {
    const i = this.n % N;
    this.frame[i] = rawMs;
    this.cpu[i] = performance.now() - this.t0;
    this.n++;
    const info = this.renderer.info.render;
    this.calls = info.calls; this.triangles = info.triangles;
    // biten GPU sorguları (birkaç kare gecikmeli gelir)
    if (this.pending.length) {
      const gl = this.gl;
      const disjoint = this.ext && gl.getParameter(this.ext.GPU_DISJOINT_EXT);
      while (this.pending.length) {
        const q = this.pending[0];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        if (!disjoint) { this.gpu[this.gn % N] = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; this.gn++; }
        gl.deleteQuery(q);
        this.pending.shift();
      }
      if (this.pending.length > 8) { for (const q of this.pending.splice(0, this.pending.length - 8)) gl.deleteQuery(q); }
    }
  }

  /** Son `frames` karelik pencere (varsayılan tamamı) */
  window(arr, count, frames) {
    const k = Math.min(count, N, frames || N);
    const out = new Float32Array(k);
    for (let j = 0; j < k; j++) out[j] = arr[(count - 1 - j + N * 2) % N];
    return out;
  }

  /** Fizik gövdeleri: toplam ve uyanık dinamik (yarım saniyede bir sayılır) */
  physics(phys) {
    if (!phys || !phys.w) return this._phys;
    const now = performance.now();
    if (now - this._phys.t < 500) return this._phys;
    let bodies = 0, awake = 0;
    try { phys.w.bodies.forEach((b) => { bodies++; if (b.isDynamic() && !b.isSleeping()) awake++; }); } catch { /* yoksay */ }
    this._phys = { t: now, bodies, awake, dynamic: phys.dynamic ? phys.dynamic.size : 0 };
    return this._phys;
  }

  /**
   * Özet. frames: son kaç kare (yoksa pencerenin tamamı). game verilirse zombi/fizik/bellek de eklenir.
   * FPS = 1000 / ortalama kare süresi; %1 low = en kötü %1 karelerin ortalamasından FPS.
   */
  stats(game = null, frames = 0) {
    const f = this.window(this.frame, this.n, frames).filter((v) => v > 0);
    const c = this.window(this.cpu, this.n, frames);
    const g = this.gn ? this.window(this.gpu, this.gn, frames ? Math.max(1, Math.round(frames / 2)) : 0) : null;
    const avg = (a) => (a && a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    const sorted = Array.from(f).sort((a, b) => b - a);
    const worst = sorted.slice(0, Math.max(1, Math.ceil(sorted.length * 0.01)));
    const ft = avg(f);
    const out = {
      frames: f.length, fps: ft ? +(1000 / ft).toFixed(1) : 0, frameMs: +ft.toFixed(2),
      low1: worst.length ? +(1000 / avg(worst)).toFixed(1) : 0, worstMs: sorted.length ? +sorted[0].toFixed(1) : 0,
      cpuMs: +avg(c).toFixed(2), gpuMs: g && g.length ? +avg(g).toFixed(2) : null, gpuTimer: !!this.ext,
      calls: this.calls, triangles: this.triangles,
    };
    if (game) {
      const S = game.session;
      out.zombies = S && S.zombies ? (S.isHost ? S.zombies.list.size : S.zombies.views.size) : 0;
      const p = this.physics(game.phys);
      out.physBodies = p.bodies; out.physAwake = p.awake; out.physDynamic = p.dynamic || 0;
      out.heapMB = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
      const mi = game.gfx.renderer.info.memory;
      out.geometries = mi.geometries; out.textures = mi.textures;
    }
    return out;
  }

  reset() { this.n = 0; this.gn = 0; }
}
