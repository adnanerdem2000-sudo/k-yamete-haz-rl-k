// Bir klibin ayak temas yüksekliklerini ve hızlarını döker (yürüyüş hızı ölçümü hata ayıklama)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pw = require('playwright');
const [tgt = 'men', src = 'UAL2', name = 'Walk_Fwd_Loop'] = process.argv.slice(2);
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto('http://localhost:8080/tests/dev/retarget.html');
await page.waitForFunction(() => window.__ready);
const [r] = await page.evaluate(([t, s, n]) => window.retarget(t, s, [n]), [tgt, src, name]);
const P = r.probe;
for (let i = 0; i < r.frames; i++) {
  const f = (a) => `${a[i * 3].toFixed(3)},${a[i * 3 + 1].toFixed(3)},${a[i * 3 + 2].toFixed(3)}`;
  console.log(String(i).padStart(3), 'HL', f(P.FootL), 'TL', f(P.ToeL), '| HR', f(P.FootR), 'TR', f(P.ToeR), '| B', f(P.Body));
}
await browser.close();
