// Oyun içi performans testi (Aşama 8): dört sahne — şehir merkezi, orman, üs (ev), zombi sürüsü. Her sahnede oyuncu
// açık bir noktaya taşınır, ısınmadan sonra `seconds` sn boyunca PerfMonitor istatistiği toplanır (FPS, ort. kare
// süresi, %1 low, CPU/GPU kare süresi, çizim, üçgen, bellek, zombi, fizik gövdesi). Test sırasında oyuncu ve botlar hasar
// almaz, otomatik kayıt sona ertelenir, dinamik çözünürlük dondurulur; sürü sahnesinin zombileri sonunda kaldırılır, oyuncu
// eski yerine döner. Yalnız tek oyunculu oyunda, araç dışında çalışır; oyun kapanırsa test iptal edilir.
// Sonuç ekranda tablo olarak gösterilir ve JSON olarak kopyalanabilir: gerçek donanım raporu için kullanıcı çalıştırır.
const SCENES = [
  { id: 'sehir', name: 'Şehir merkezi', x: 100, z: -5, yaw: 0.6 },
  { id: 'orman', name: 'Orman', x: -235, z: -160, yaw: 2.2 },
  { id: 'us', name: 'Üs (ev)', base: true, yaw: 3.6 },
  { id: 'suru', name: 'Zombi sürüsü (40)', x: 70, z: -28, yaw: 1.2, horde: 40 },
];

export class Benchmark {
  constructor(game) {
    this.game = game;
    this.running = false;
    this.last = null;
  }

  /** Bölge merkezine yakın, bina/su dışı (tercihen asfalt) açık nokta */
  openSpot(S, x0, z0) {
    const W = S.world, T = W.terrain;
    let best = null;
    for (let r = 0; r <= 60 && !best; r += 4) {
      for (let k = 0; k < Math.max(1, r * 1.5); k++) {
        const a = (k / Math.max(1, r * 1.5)) * Math.PI * 2;
        const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
        if (T.isWater(x, z) || (W.buildingAt && W.buildingAt(x, z))) continue;
        const road = T.surfaceAt ? T.surfaceAt(x, z) === 'asphalt' : false;
        if (road) { best = { x, z }; break; }
        if (!best && r >= 24) best = { x, z };
      }
    }
    best = best || { x: x0, z: z0 };
    best.y = W.physics.groundHeight(best.x, best.z, 1e9);
    return best;
  }

  async wait(ms) { await new Promise((r) => setTimeout(r, ms)); }

  /** En az n kare çizilene dek (en fazla maxS sn) bekle: yavaş GPU'da sabit süre içinde hiç kare bitmeyebilir */
  async waitFrames(n, maxS, check = null) {
    const perf = this.game.perf, n0 = perf.n, t0 = performance.now();
    while (perf.n - n0 < n && performance.now() - t0 < maxS * 1000) { await this.wait(100); if (check) check(); }
  }

  /**
   * Ölçüm penceresi: en az `seconds` sn ve en az `minFrames` kare (en fazla seconds + maxSeconds sn). Oyun duraklatılırsa
   * (duraklatmada yalnız çizim yapılır, simülasyon durur: kare süresi olduğundan iyi görünürdü) devam edince ölçüm
   * baştan alınır.
   */
  async measure(S, seconds, minFrames, maxSeconds, check) {
    const perf = this.game.perf;
    let t0 = 0;
    const start = () => { perf.reset(); t0 = performance.now(); };
    start();
    for (;;) {
      await this.wait(100);
      check();
      if (S.paused) { while (S.paused) { await this.wait(200); check(); } start(); continue; }
      const el = performance.now() - t0;
      if (el >= seconds * 1000 && perf.n >= minFrames) break;
      if (el >= (seconds + maxSeconds) * 1000) break;
    }
  }

  /**
   * seconds: ölçüm süresi (sahne başına), warm: ısınma (sn); warmFrames: ısınmada en az bu kadar kare (gölgelendirici
   * derlemesi ölçüme girmesin); minFrames: ölçümde en az bu kadar kare; maxSeconds: kare beklemelerinin tavanı.
   * onProgress(sahneAdı, i, n)
   */
  async run({ seconds = 8, warm = 2, warmFrames = 2, minFrames = 0, maxSeconds = 60, onProgress = null, scenes = null } = {}) {
    const g = this.game, S = g.session;
    if (!S || !S.isHost || (g.net && g.net.active)) throw new Error('Performans testi yalnız tek oyunculu oyunda çalışır.');
    if (this.running) throw new Error('Performans testi zaten çalışıyor.');
    if (!g.perf) throw new Error('Performans ölçer yok.');
    const L = S.local, st = S.localStats;
    if (L.vehicle) throw new Error('Araçtayken çalışmaz: önce araçtan in.');
    if (st.downed || st.dead) throw new Error('Oyuncu yerdeyken çalışmaz.');
    this.running = true;
    // oturum kapanır (menüye dönüş) ya da oda açılırsa test durur; geri yükleme yalnız aynı oturumda yapılır
    const alive = () => g.session === S && !S.disposed;
    const check = () => {
      if (!alive()) throw new Error('Oyun kapandı: performans testi iptal edildi.');
      if (g.net && g.net.active) throw new Error('Çok oyunculu oda açıldı: performans testi iptal edildi.');
    };
    const saved = { x: L.pos.x, y: L.pos.y, z: L.pos.z, yaw: L.yaw, pitch: L.camPitch };
    // test boyunca oyuncu ve yapay zekâ takım arkadaşları hasar almaz (sürü sahnesi kimseyi yere düşürmesin)
    const noDmg = () => ({ dealt: 0, downed: false });
    const guards = [[st, st.damage]];
    st.damage = noDmg;
    for (const b of (S.bots && S.bots.list) || []) if (b.stats) { guards.push([b.stats, b.stats.damage]); b.stats.damage = noDmg; }
    // test sırasında gün dönerse otomatik kayıt oyuncuyu test noktasında (sürünün ortasında) kaydederdi: sona ertelenir
    const saves = S.saves, autosave0 = saves && saves.autosave;
    let autosaveDue = false;
    if (saves) saves.autosave = () => { autosaveDue = true; };
    // dinamik çözünürlük dondurulur ve ayarlanan çözünürlüğe dönülür: sahneler aynı çözünürlükte ölçülsün
    const gfx = g.gfx;
    if (gfx.holdScale) gfx.holdScale(true);
    const cv = gfx.renderer.domElement;
    const resolution = [cv.width, cv.height];
    // ayarlar başta kaydedilir: test sırasında (duraklatma menüsünden) değişirse sonuç karışık ölçüm olarak işaretlenir
    const Sg = g.settings || null;
    const gs = Sg ? { ...Sg.get('graphics') } : {};
    const list = (scenes ? SCENES.filter((s) => scenes.includes(s.id)) : SCENES);
    const results = [];
    const spawned = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const sc = list[i];
        if (onProgress) onProgress(sc.name, i, list.length);
        const h = S.world.home && S.world.home.spec;
        const p = sc.base && h ? this.openSpot(S, h.x + 9, h.z + 9) : this.openSpot(S, sc.x, sc.z);
        L.spawnAt(p.x, p.y + 0.05, p.z, sc.yaw);
        if (L.camPitch !== undefined) L.camPitch = 0.12;
        if (sc.horde) {
          for (let k = 0; k < sc.horde; k++) {
            const a = (k / sc.horde) * Math.PI * 2, r = 9 + (k % 4) * 5;
            const z = S.zombies.spawn('normal', p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, {});
            if (z) spawned.push(z.id);
          }
        }
        await this.wait(warm * 1000);
        check();
        await this.waitFrames(warmFrames, maxSeconds, check);
        await this.measure(S, seconds, minFrames, maxSeconds, check);
        results.push({ scene: sc.id, name: sc.name, ...g.perf.stats(g) });
        for (const id of spawned.splice(0)) S.zombies.removeZombie(id);
      }
    } finally {
      for (const [o, fn] of guards) o.damage = fn;
      if (saves) saves.autosave = autosave0;
      if (gfx.holdScale) gfx.holdScale(false);
      if (alive()) {
        for (const id of spawned.splice(0)) { try { S.zombies.removeZombie(id); } catch (e) { console.error(e); } }
        L.spawnAt(saved.x, saved.y, saved.z, saved.yaw);
        if (saved.pitch !== undefined) L.camPitch = saved.pitch;
        if (autosaveDue && autosave0) autosave0.call(saves);
      }
      this.running = false;
    }
    const gl = gfx.renderer.getContext();
    let gpu = null;
    try { const dbg = gl.getExtension('WEBGL_debug_renderer_info'); gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch { /* yoksay */ }
    const gEnd = Sg ? Sg.get('graphics') : {};
    const settingsChanged = Object.keys(gs).some((k) => k !== 'fpsCounter' && gs[k] !== gEnd[k]);
    const out = {
      when: new Date().toISOString(), gpu, userAgent: navigator.userAgent, resolution, settingsChanged,
      quality: gs.quality, settings: { shadows: gs.shadows, ao: gs.ao, waterRefl: gs.waterRefl, renderScale: gs.renderScale, autoScale: gs.autoScale, viewDistance: gs.viewDistance, bloom: gs.bloom, grass: gs.grass },
      gameTime: S.time.label ? S.time.label() : Math.round(S.time.total), seconds, results,
    };
    this.last = out;
    return out;
  }
}

export { SCENES as BENCH_SCENES };
