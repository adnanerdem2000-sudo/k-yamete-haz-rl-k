// AnimPack — sıkıştırılmış iskelet animasyonu paketi (.kan). glTF'te her iz için ayrı erişimci (accessor) JSON'u
// gerekir; 150+ klip × 50+ iz için bu JSON ikili veriden büyüktü. Bu biçimde yalnızca küçük bir dizin + iki akış var:
//   'KAN1' | u32 metaLen | meta (JSON) | hizalama | kare farkları (u8) | değer farkları alt baytlar | üst baytlar
// Değerler 16 bit nicemlenir (dörtlü bileşen ×32767, konum ×4096 m), iz içinde bileşen bileşen (düzlemsel) ardışık
// farkla kodlanır ve baytlar ayrıştırılır (alt/üst): gzip bu düzende çok iyi sıkıştırır. Sabit izler tek anahtar.
// Anahtar kareler: ilk ve son kare örtük, aradakiler u8 kare farkı. Dosya gzip'li sunulur; tarayıcı
// DecompressionStream ile açar (sunucu zaten açtıysa sihirli bayttan anlaşılır).
// Bu modül three.js'e bağımlı değildir (araçlar Node'da kullanır); packToClips THREE'yi parametre alır.

const MAGIC = 0x314e414b; // 'KAN1' (küçük sonlu)
const QS = 32767, PS = 4096;

/**
 * pack: { bones: [ad], clips: [{ name, duration, fps, frames, loop, rm, v, ph, tracks: [{ bone, q, frames: [kare], values: [..] }] }] }
 * @returns {Uint8Array}
 */
export function encodePack(pack) {
  const fBytes = [], vals = [];
  const clips = [];
  for (const c of pack.clips) {
    const t = [];
    for (const tr of c.tracks) {
      const w = tr.q ? 4 : 3, k = tr.frames.length, s = tr.q ? QS : PS;
      t.push(tr.bone, tr.q ? 0 : 1, k);
      for (let i = 1; i < k - 1; i++) {
        const d = tr.frames[i] - tr.frames[i - 1];
        if (d < 1 || d > 255) throw new Error(`kare farkı aralık dışı: ${c.name} ${d}`);
        fBytes.push(d);
      }
      if (k > 1 && tr.frames[k - 1] !== c.frames - 1) throw new Error(`son anahtar son karede değil: ${c.name}`);
      for (let comp = 0; comp < w; comp++) {
        let prev = 0;
        for (let i = 0; i < k; i++) {
          const q = Math.max(-32767, Math.min(32767, Math.round(tr.values[i * w + comp] * s)));
          vals.push((q - prev) & 0xffff);
          prev = q;
        }
      }
    }
    clips.push({ n: c.name, d: +c.duration.toFixed(4), fps: c.fps, f: c.frames, l: c.loop ? 1 : 0, rm: c.rm, v: c.v, ph: c.ph || 0, t });
  }
  const meta = new TextEncoder().encode(JSON.stringify({ v: 1, bones: pack.bones, qs: QS, ps: PS, fLen: fBytes.length, vLen: vals.length, clips }));
  const head = 8 + meta.length;
  const pad = (4 - (head % 4)) % 4;
  const out = new Uint8Array(head + pad + fBytes.length + vals.length * 2);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, meta.length, true);
  out.set(meta, 8);
  let o = head + pad;
  out.set(fBytes, o); o += fBytes.length;
  for (let i = 0; i < vals.length; i++) { out[o + i] = vals[i] & 0xff; out[o + vals.length + i] = vals[i] >> 8; }
  return out;
}

/** @returns {{ bones, clips: [{ name, duration, fps, frames, loop, rm, v, tracks: [{ bone, q, times: Float32Array, values: Float32Array }] }] }} */
export function decodePack(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('KAN1 paketi değil');
  const metaLen = dv.getUint32(4, true);
  const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + metaLen)));
  const head = 8 + metaLen;
  let fo = head + ((4 - (head % 4)) % 4);
  const vLo = fo + meta.fLen, vHi = vLo + meta.vLen;
  let vi = 0;
  const clips = [];
  for (const c of meta.clips) {
    const tracks = [];
    const dt = 1 / c.fps;
    for (let j = 0; j < c.t.length; j += 3) {
      const bone = c.t[j], q = c.t[j + 1] === 0, k = c.t[j + 2], w = q ? 4 : 3, s = q ? meta.qs : meta.ps;
      const times = new Float32Array(k);
      if (k > 1) {
        let f = 0;
        for (let i = 1; i < k - 1; i++) { f += bytes[fo++]; times[i] = Math.min(c.d, f * dt); }
        times[k - 1] = c.d;
      }
      const values = new Float32Array(k * w);
      for (let comp = 0; comp < w; comp++) {
        let prev = 0;
        for (let i = 0; i < k; i++, vi++) {
          const d = bytes[vLo + vi] | (bytes[vHi + vi] << 8);
          prev = ((prev + d) << 16) >> 16;
          values[i * w + comp] = prev / s;
        }
      }
      if (q) for (let i = 0; i < k; i++) { // birim dörtlüye normalle (nicemleme)
        const a = i * 4, l = Math.hypot(values[a], values[a + 1], values[a + 2], values[a + 3]) || 1;
        values[a] /= l; values[a + 1] /= l; values[a + 2] /= l; values[a + 3] /= l;
      }
      tracks.push({ bone: meta.bones[bone], q, times, values });
    }
    clips.push({ name: c.n, duration: c.d, fps: c.fps, frames: c.f, loop: !!c.l, rm: c.rm, v: c.v, ph: c.ph || 0, tracks });
  }
  return { bones: meta.bones, clips };
}

/** gzip'li ya da açık paket baytlarını çöz (tarayıcı/Node) */
export async function unpackBytes(buf) {
  let bytes = new Uint8Array(buf);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const ds = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
    bytes = new Uint8Array(await ds.arrayBuffer());
  }
  return decodePack(bytes);
}

/**
 * Paketi THREE.AnimationClip'lere çevir. Klip ek bilgisi (döngü, yürüyüş hızı, kök kayması) clip.userData'da.
 * @returns {Object<string, THREE.AnimationClip>}
 */
export function packToClips(pack, THREE) {
  const out = {};
  for (const c of pack.clips) {
    const tracks = c.tracks.map((t) => (t.q
      ? new THREE.QuaternionKeyframeTrack(t.bone + '.quaternion', t.times, t.values)
      : new THREE.VectorKeyframeTrack(t.bone + '.position', t.times, t.values)));
    const clip = new THREE.AnimationClip(c.name, c.duration, tracks);
    clip.userData = { loop: c.loop, rm: c.rm, v: c.v, ph: c.ph, speed: Math.hypot(c.v[0], c.v[1]) };
    out[c.name] = clip;
  }
  return out;
}
