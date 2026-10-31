// Yüzey dokuları: Quaternius "Downtown City MegaKit" (CC0) PBR dokuları ve "Stylized Nature MegaKit" kaya dokusu
// küçültülüp WebP'ye çevrilir → assets/textures/*.webp (arazi, yol, bina malzemeleri).
// Renk dokuları "nötr ayrıntı"ya çevrilir (gri ton, ortalama ~0.8, karşıtlık korunur): oyunda renk köşe
// renginden (bina/arazi paleti) gelir, doku yalnız desen ve ton farkı ekler. Normal haritalar olduğu gibi kalır.
// Kullanım: node tools/pack-textures.mjs <city_Textures_klasörü> <nature_glTF_klasörü> [çıkış_klasörü]
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [city, nature, out = 'assets/textures'] = process.argv.slice(2);
if (!city || !nature) { console.error('kullanım: node tools/pack-textures.mjs <city_Textures> <nature_glTF> [çıkış]'); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
// [kaynak klasör, dosya, çıkış adı, boyut, kalite, nötr ayrıntı karşıtlığı (yoksa renkli/normal)]
const JOBS = [
  [city, 'T_Dirt_BaseColor.png', 'dirt_c', 1024, 82, 2.2], [city, 'T_Dirt_Normal.png', 'dirt_n', 512, 85],
  [city, 'T_Concrete_BaseColor.png', 'concrete_c', 1024, 82, 1.6], [city, 'T_Concrete_Normal.png', 'concrete_n', 512, 85],
  [city, 'T_Concrete_Asphalt_BaseColor.png', 'asphalt_c', 1024, 82, 2.0],
  [city, 'T_RedBrick_BaseColor.png', 'brick_c', 1024, 82, 1.5], [city, 'T_RedBrick_Normal.png', 'brick_n', 512, 85],
  [city, 'T_RoofSlate_BaseColor.png', 'roofslate_c', 1024, 82, 1.4], [city, 'T_RoofSlate_Normal.png', 'roofslate_n', 512, 85],
  [nature, 'Rocks_Diffuse.png', 'rock_c', 1024, 82, 1.3],
];
/** gri ton, ortalama 204/255 (~0.8), sapma karşıtlık çarpanıyla */
async function neutral(file, size, contrast) {
  const { data, info } = await sharp(file).resize(size, size, { fit: 'inside', withoutEnlargement: true }).greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < data.length; i += info.channels) sum += data[i];
  const mean = sum / (data.length / info.channels);
  const out = Buffer.alloc((data.length / info.channels) * 3);
  for (let i = 0, j = 0; i < data.length; i += info.channels, j += 3) {
    const v = Math.max(0, Math.min(255, Math.round(204 + (data[i] - mean) * contrast)));
    out[j] = out[j + 1] = out[j + 2] = v;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } });
}
let total = 0;
for (const [dir, file, name, size, q, contrast] of JOBS) {
  const dst = path.join(out, name + '.webp');
  const img = contrast ? await neutral(path.join(dir, file), size, contrast) : sharp(path.join(dir, file)).resize(size, size, { fit: 'inside', withoutEnlargement: true });
  await img.webp({ quality: q }).toFile(dst);
  const kb = fs.statSync(dst).size / 1024;
  total += kb;
  console.log(name.padEnd(12), size, Math.round(kb) + ' KB');
}
console.log('toplam', Math.round(total) + ' KB →', out);
