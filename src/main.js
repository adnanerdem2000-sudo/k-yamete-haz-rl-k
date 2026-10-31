// Giriş noktası: WebGL denetimi, oyunu başlat.
import { Game } from './Game.js';

function webglSupported() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch { return false; }
}

const canvas = document.getElementById('game-canvas');
const root = document.getElementById('ui-root');

if (!webglSupported()) {
  const st = document.getElementById('ls-status');
  if (st) st.textContent = 'Tarayıcın WebGL 2 desteklemiyor. Güncel bir Chrome, Edge ya da Firefox kullan.';
} else {
  const game = new Game(canvas, root);
  window.__game = game; // geliştirme ve otomatik testler için
  game.boot().catch((e) => {
    console.error(e);
    const st = document.getElementById('ls-status');
    if (st) st.textContent = 'Başlatma hatası: ' + (e && e.message ? e.message : e);
  });
}
