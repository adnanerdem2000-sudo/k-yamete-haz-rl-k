// Hikâye senaryosu bellek bisect: fener adımının alt adımları arasında renderer RSS (ps) ve sayfa yığını örneklenir
import { execSync } from 'node:child_process';
export default async ({ page, url, shot, wait, evalJS, log }) => {
  const S = (fn, arg) => evalJS(page, fn, arg);
  const rss = () => { try { const out = execSync("ps -eo rss,args | grep -- '--type=renderer' | grep -v grep | sort -rn | head -1").toString().trim(); return Math.round(parseInt(out, 10) / 1024) + ' MB'; } catch { return '?'; } };
  const heap = () => S(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : null));
  const mark = async (label) => log(label, { rss: rss(), heap: await heap() });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await mark('menü');
  await S(() => { window.__game.ui.menus.opts.ai = 0; return window.__game.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await mark('oyun başladı');
  await wait(1500);
  await S(() => {
    const g = window.__game;
    window.__pause = () => { cancelAnimationFrame(g.raf); g.raf = 0; };
    window.__step = (frames, keys = []) => { const S = g.session, inp = g.input; for (let i = 0; i < frames; i++) { inp.down.clear(); for (const k of keys) inp.down.add(k); S.update(1 / 60); inp.endFrame(); } inp.down.clear(); };
    window.__still = (pos, look, ui = false) => {
      const c = g.gfx.camera, S = g.session;
      document.getElementById('ui-root').style.display = ui ? '' : 'none';
      c.position.set(pos[0], pos[1], pos[2]); c.lookAt(look[0], look[1], look[2]);
      S.world.vegetation.update(c.position, g.settings.get('graphics.viewDistance'), true, 1, g.settings.get('graphics.quality'));
      g.env.update(0.016, g.time, S.time.minuteOfDay, c.position, S.region);
      g.gfx.render(0.016, g.time);
    };
  });
  await mark('yardımcılar');
  await S(() => { const S = window.__game.session; for (const id of ['aydin', 'ismail', 'zeynep', 'omer', 'necla', 'murat', 'defne']) S.npcs.byId(id); });
  await mark('npc');
  await S(() => { const S = window.__game.session; const before = { ...S.flags }; for (const c of S.world.containers) { if (!['terminal', 'tower', 'radio', 'powerplant', 'prison_admin', 'hotel', 'keeper', 'vil_cafe', 'vil3', 'barn'].includes(c.building)) continue; S.loot.generate(c); } S.flags = before; });
  await mark('belgeler');
  await S(() => { const S = window.__game.session; S.act('quest_start', { id: 's_power' }); S.giveLocal('engine_part', 1); S.giveLocal('wire', 3); S.giveLocal('electronics', 2); S.act('power_restore', {}); S.quests.onInteract('dam_control'); });
  await mark('santral');
  await wait(3000); await mark('santral +3 sn');
  await S(() => { const S = window.__game.session; S.act('lighthouse_lit', {}); S.act('flag', { flag: 'ship_contact', value: 1 }); });
  await wait(2000); await mark('fener yandı +2 sn');
  await S(() => { const S = window.__game.session; S.time.set(S.time.total + ((22 * 60) - S.time.minuteOfDay)); });
  await wait(2000); await mark('saat 22 +2 sn');
  await S(() => { const S = window.__game.session; S.local.spawnAt(-560, S.world.terrain.heightAt(-560, 520) + 0.2, 520, -2.4); });
  await wait(1500); await mark('fenere ışınlandı +1,5 sn');
  await wait(4000); await mark('+4 sn daha');
  await S(() => { window.__pause(); window.__step(90); });
  await mark('pause + 90 adım');
  await S(() => { const L = window.__game.session.world.lighthouse; window.__still([L.x + 70, L.y + 6, L.z - 60], [L.x, L.y - 4, L.z]); });
  await mark('sabit kare');
  await shot(page, '/tmp/bisect-lighthouse.png');
  await mark('ekran görüntüsü');
  for (let i = 1; i <= 4; i++) { await S(() => { window.__step(60); }); await mark(`+60 adım ×${i}`); }
};
