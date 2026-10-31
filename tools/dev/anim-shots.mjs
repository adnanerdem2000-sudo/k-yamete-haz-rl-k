// Animasyon galerisi ekran görüntüleri: node tools/dev/anim-shots.mjs <çıkış_öneki> <klip,klip,...> [zamanlar] [c=karakter] [view]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pw = require('playwright');
const [out = '/tmp/anim', clipsArg = 'Idle_Loop,Walk_Fwd_Loop,Jog_Fwd_Loop', timesArg = '0,0.25,0.5,0.75', c = 'mert', view = 'front', w = '1600', h = '900'] = process.argv.slice(2);
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('pageerror', (e) => console.error('[sayfa]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[konsol]', m.text()); });
await page.goto(`http://localhost:8080/tests/dev/anims.html?c=${c}&clips=Idle_Loop&t=0`);
await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
const groups = clipsArg.split(';');
let k = 0;
for (const g of groups) {
  const clips = g.split(',');
  const n = await page.evaluate(([cl, t, c, v]) => window.__set(cl, t, v === 'profile' ? { c, yaw: Math.PI / 2, sx: 1.7, sz: 1.6 } : v === 'q' ? { c, yaw: 0.75, sx: 1.6, sz: 2.4, layout: 'row' } : { c, view: v }), [clips, timesArg.split(',').map(Number), c, view]);
  const file = `${out}-${k++}.png`;
  await page.screenshot({ path: file });
  console.log(file, n, 'karakter:', clips.join(','));
}
await browser.close();
