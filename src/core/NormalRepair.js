// Model normali onarımı (Aşama 8): yüklenen glTF ağlarındaki sıfır uzunluklu / NaN köşe normallerini düzeltir.
import * as THREE from 'three';

/**
 * Sıfır uzunluklu / NaN köşe normallerini onarır (yerinde). Gölgelendiricide normalize(0) NaN verir; o köşeye değen
 * kenar boyunca birkaç piksel NaN olur ve parlama (bloom) bulanıklığı bu pikselleri bütün kareye yayıp ekranı
 * karartıyordu. Bulunan kaynak: hasarlı doğan araçların göçük geometrisi (`VehicleVisuals.dent`) — normaller yeniden
 * hesaplanınca alanı sıfır üçgenlerin köşeleri sıfır normal alıyordu (kamyonet, minibüs, sedan, SUV, ambulans, kamyon).
 * Yüklenen modeller de güvenlik için bir kez taranır. Onarım: köşenin ait olduğu alanı sıfır olmayan ilk üçgenin yüz
 * normali; hiç yoksa (0, 1, 0). Onarılan köşe sayısını döndürür.
 */
export function repairNormals(geo) {
  const n = geo && geo.attributes.normal, p = geo && geo.attributes.position;
  if (!n || !p) return 0;
  const bad = new Set();
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), y = n.getY(i), z = n.getZ(i);
    if (!(x * x + y * y + z * z > 1e-12)) bad.add(i); // NaN da bu koşula takılır
  }
  if (!bad.size) return 0;
  const fixed = new Map();
  const idx = geo.index, tris = Math.floor((idx ? idx.count : p.count) / 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3();
  for (let t = 0; t < tris && fixed.size < bad.size; t++) {
    const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    if (!bad.has(i0) && !bad.has(i1) && !bad.has(i2)) continue;
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
    THREE.Triangle.getNormal(a, b, c, fn);
    if (!(fn.lengthSq() > 0.5)) continue; // alanı sıfır üçgen
    for (const i of [i0, i1, i2]) if (bad.has(i) && !fixed.has(i)) fixed.set(i, fn.clone());
  }
  for (const i of bad) { const v = fixed.get(i); if (v) n.setXYZ(i, v.x, v.y, v.z); else n.setXYZ(i, 0, 1, 0); }
  n.needsUpdate = true;
  return bad.size;
}

/** Bir model ağacındaki bütün ağların normallerini bir kez onarır (paylaşılan geometri tekrar işlenmez) */
export function repairTree(root, seen, stats) {
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || seen.has(o.geometry)) return;
    seen.add(o.geometry);
    const k = repairNormals(o.geometry);
    if (k) { stats.vertices += k; stats.meshes++; }
  });
}
