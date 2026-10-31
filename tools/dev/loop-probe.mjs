// Sıkı döngü RSS sondası: fener/gece kurulumundan sonra her alt sistem tek başına 90 kez çağrılır, renderer RSS
// öncesi/sonrası ölçülür → hangi alt sistem adım başına büyük yerel bellek tahsis ediyor?
import { execSync } from 'node:child_process';
export default async ({ page, url, wait, evalJS, log }) => {
  const S = (fn, arg) => evalJS(page, fn, arg);
  const rss = () => { try { const out = execSync("ps -eo rss,args | grep -- '--type=renderer' | grep -v grep | sort -rn | head -1").toString().trim(); return Math.round(parseInt(out, 10) / 1024); } catch { return -1; } };
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state === 'menu', null, { timeout: 150000 });
  await S(() => { window.__game.ui.menus.opts.ai = 0; return window.__game.ui.menus.startSingle(); });
  await page.waitForFunction(() => window.__game.state === 'playing', null, { timeout: 120000 });
  await wait(1500);
  if (process.env.PREFIX) {
    log('RSS önce', rss());
    await S(() => { const S = window.__game.session; for (const id of ['aydin', 'ismail', 'zeynep', 'omer', 'necla', 'murat', 'defne']) S.npcs.byId(id); });
    log('RSS npc', rss());
    await S(() => { const S = window.__game.session; const before = { ...S.flags }; for (const c of S.world.containers) { if (!['terminal', 'tower', 'radio', 'powerplant', 'prison_admin', 'hotel', 'keeper', 'vil_cafe', 'vil3', 'barn'].includes(c.building)) continue; S.loot.generate(c); } if (process.env.KEEPFLAGS !== '1') S.flags = before; });
    log('RSS belgeler', rss());
    await S(() => { const S = window.__game.session; S.act('quest_start', { id: 's_power' }); S.giveLocal('engine_part', 1); S.giveLocal('wire', 3); S.giveLocal('electronics', 2); S.quests.onInteract('dam_control'); });
    log('RSS santral', rss());
  }
  await S(() => { const S = window.__game.session; S.act('power_restore', {}); S.act('lighthouse_lit', {}); S.time.set(S.time.total + ((22 * 60) - S.time.minuteOfDay)); S.local.spawnAt(-560, S.world.terrain.heightAt(-560, 520) + 0.2, 520, -2.4); });
  await wait(1500);
  await S(() => { const g = window.__game; cancelAnimationFrame(g.raf); g.raf = 0; });
  await wait(500);
  const loops = (process.env.LOOPS ? process.env.LOOPS.split(',') : ['time', 'avatar', 'player', 'audio', 'env', 'phys', 'combat', 'ground', 'cull', 'zombies', 'npcs', 'living', 'doorPhys', 'interact', 'props', 'quests', 'events', 'endings', 'map', 'weather', 'story', 'fx', 'build', 'full']);
  // görev döngüsü profili: aday işlevler sarmalanır (süre + çağrı sayısı)
  await S(() => {
    const g = window.__game, S = g.session, Q = S.quests, inv = S.inventory;
    const P = window.__qprof = {}; const wrap = (obj, name, label) => { if (!obj || typeof obj[name] !== 'function') return; const o = obj[name].bind(obj); obj[name] = (...a) => { const t = performance.now(); const r = o(...a); const k = label || name; P[k] = P[k] || { ms: 0, n: 0 }; P[k].ms += performance.now() - t; P[k].n++; return r; }; };
    wrap(S, 'act'); wrap(S, 'applyAction'); wrap(S, 'emit'); wrap(S, 'applyEvent'); wrap(S.ui, 'refreshQuests'); wrap(S.ui, 'questBanner'); wrap(S.build, 'storages'); wrap(inv, 'count', 'inv.count'); wrap(Q, 'complete'); wrap(Q, 'onFlag'); wrap(Q, 'hook'); wrap(S.timeline, 'post', 'timeline.post'); wrap(S.audio, 'play', 'audio.play'); wrap(S.saves, 'autosave'); wrap(S.ui, 'toast'); wrap(S.env, 'update', 'env.update'); wrap(S.storyWorld, 'update', 'story.update'); wrap(S.events, 'update', 'events.update');
    for (const k of Object.keys(S.appliers || {})) if (Array.isArray(S.appliers[k])) S.appliers[k] = S.appliers[k].map((fn, i) => { const o = fn; return (...a) => { const t = performance.now(); const r = o(...a); const kk = 'evt:' + k + '#' + i; P[kk] = P[kk] || { ms: 0, n: 0 }; P[kk].ms += performance.now() - t; P[kk].n++; return r; }; });
    for (const k of Object.keys(S.handlers || {})) if (typeof S.handlers[k] === 'function') { const o = S.handlers[k]; S.handlers[k] = (...a) => { const t = performance.now(); const r = o(...a); const kk = 'act:' + k; P[kk] = P[kk] || { ms: 0, n: 0 }; P[kk].ms += performance.now() - t; P[kk].n++; return r; }; }
  });
  for (const name of loops) {
    const before = rss();
    const ms = await S((name) => {
      const g = window.__game, S = g.session, pl = S.local, dt = 1 / 60, cam = g.gfx.camera;
      const t0 = performance.now();
      for (let i = 0; i < 90; i++) {
        g.input.down.clear();
        switch (name) {
          case 'time': S.time.update(dt); break;
          case 'avatar': pl.avatar.update(dt, pl.animState()); break;
          case 'player': pl.update(dt, g.input, false); break;
          case 'audio': S.audio.setListener(cam.position.x, cam.position.y, cam.position.z, 0); S.audio.setEnvironment(!!pl.inside); S.updateAmbience(dt); break;
          case 'env': S.env.update(dt, g.time, S.time.minuteOfDay, pl.pos, S.region); break;
          case 'phys': g.phys.update(dt); break;
          case 'combat': S.combat.update(dt, g.input, false); break;
          case 'ground': S.ground.update(dt); break;
          case 'cull': S.world.instancer.cull(cam.position, 420); S.world.cullInteriors(cam.position, dt); S.updateRoofs(); break;
          case 'zombies': S.zombies.update(dt); break;
          case 'npcs': S.npcs.update(dt); S.bots.update(dt); S.vehicles.update(dt); break;
          case 'living': for (const l of Object.values(S.living)) { if (l === S.living.birds) l.update(dt, (x, z) => S.world.terrain.heightAt(x, z), pl.pos); else if (l === S.living.papers) l.update(dt, pl.pos, 1); else l.update(dt, 1); } break;
          case 'doorPhys': if (S.doorPhys) S.doorPhys.update(dt); if (S.drawers) S.drawers.update(dt); break;
          case 'interact': S.interact.update(dt, g.input, false); break;
          case 'props': S.props.update(dt); break;
          case 'quests': S.quests.update(dt); break;
          case 'events': S.events.update(dt); break;
          case 'endings': S.endings.update(dt); break;
          case 'map': S.map.update(dt); break;
          case 'weather': S.weather.update(dt, 0); break;
          case 'story': S.storyWorld.update(dt); break;
          case 'fx': S.fx.update(dt); break;
          case 'build': S.build.update(dt); break;
          case 'full': S.update(dt); break;
        }
        g.input.endFrame();
      }
      return Math.round(performance.now() - t0);
    }, name);
    await wait(300);
    const after = rss();
    log(name, { ms, rssBefore: before, rssAfter: after, delta: after - before });
    if (name === 'quests') { log('görev profili', await S(() => Object.fromEntries(Object.entries(window.__qprof).filter(([, v]) => v.ms > 20).sort((a, b) => b[1].ms - a[1].ms).slice(0, 14).map(([k, v]) => [k, { ms: Math.round(v.ms), n: v.n }])))); log('görevler', await S(() => { const Q = window.__game.session.quests; return Object.entries(Q.st).map(([k, v]) => k + ':' + v.state + ':' + v.prog.join('/')); })); }
  }
};
