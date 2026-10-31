// Su fiziği: suya düşen dinamik nesneler (variller, kutular, enkaz, cesetler) yalnız dibe çökmez; batan
// hacmine göre kaldırma kuvveti, su direnci (hız sönümü) ve hafif dalga salınımı alır. Yoğunluğa göre:
// ahşap/plastik/kapalı varil yüzer, cam ve beton batar. Araçlar ve oyuncu kendi su mantığını kullanır.
export function installBuoyancy(phys, terrain) {
  const g = 9.81 * 1.35;
  let time = 0;
  return phys.addHook((h) => {
    time += h;
    for (const d of phys.dynamic) {
      const b = d.body;
      if (d.noBuoyancy || d.carried || b.isSleeping() && !d.inWater) continue;
      if (!b.isDynamic()) continue;
      const t = b.translation();
      const wl = terrain.waterLevelAt(t.x, t.z);
      if (wl <= -1e8) { if (d.inWater) { b.resetForces(true); d.inWater = false; } continue; }
      const ground = terrain.heightAt(t.x, t.z);
      if (wl < ground + 0.25) { if (d.inWater) { b.resetForces(true); d.inWater = false; } continue; }
      // yarı yükseklik: kutu → y yarı kenarı; top/kapsül/silindir → yarıçap (+ yarı boy)
      if (d.hy === undefined) {
        const he = d.col.halfExtents ? d.col.halfExtents() : null;
        d.hy = he ? he.y : ((d.col.radius && d.col.radius()) || 0.2) + ((d.col.halfHeight && d.col.halfHeight()) || 0);
        const dens = d.col.density ? d.col.density() : 300;
        d.buoy = Math.max(0.35, Math.min(1.8, 1000 / Math.max(10, dens))); // yüzme katsayısı (su yoğunluğu / nesne)
      }
      const bob = Math.sin(time * 1.3 + t.x * 0.7 + t.z * 0.9) * 0.04;
      const depth = wl + bob - (t.y - d.hy); // batan derinlik
      // Rapier'de addForce kalıcıdır (her adımda yeniden uygulanır): her adım sıfırlanıp yeniden yazılır
      b.resetForces(true);
      if (depth <= 0) { d.inWater = false; continue; }
      d.inWater = true;
      b.wakeUp();
      const frac = Math.min(1, depth / Math.max(0.02, 2 * d.hy));
      const mass = b.mass();
      // kaldırma: ağırlığın (buoy × batan oran) katı; hızla sönümlenen su direnci
      const F = mass * g * d.buoy * frac;
      b.addForce({ x: 0, y: F, z: 0 }, true);
      const v = b.linvel(), av = b.angvel();
      const k = 1 - Math.min(0.6, (0.9 + frac * 1.6) * h * 4);
      b.setLinvel({ x: v.x * k, y: v.y * (1 - Math.min(0.7, frac * h * 9)), z: v.z * k }, true);
      b.setAngvel({ x: av.x * k, y: av.y * k, z: av.z * k }, true);
      // yüzen nesne yatay düzleme meyleder: hafif doğrultucu tork
      const r = b.rotation();
      b.applyTorqueImpulse({ x: -r.x * mass * 0.6 * h * frac, y: 0, z: -r.z * mass * 0.6 * h * frac }, true);
    }
  });
}
