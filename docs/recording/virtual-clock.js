// Preload for record.js: the page runs on a virtual clock that only moves when the recorder steps it,
// so every theme renders at an exact frame rate however slow the GPU is. Needs contextIsolation: false.
let vt = 0, queue = [], grabCtx = null;
performance.now = () => vt * 1000;
window.requestAnimationFrame = cb => { queue.push(cb); return queue.length; };
window.cancelAnimationFrame = () => { queue = []; };
// the window is offscreen and never shown: keep the themes from pausing themselves as if hidden
Object.defineProperty(document, 'hidden', { get: () => false });
Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
window.__rec = {
  step(dt) {
    vt += dt;
    // the themes' 30 fps gates add FRAME_MS up in floats, so a timestamp moving exactly one frame per step lands a
    // hair short every so often and that frame is skipped. The rAF timestamp only feeds the gate (motion uses
    // performance.now()), so hand it a clock running at double speed: every step clears the gate.
    const cbs = queue; queue = [];
    for (const cb of cbs) cb(vt * 2000);
  },
  // the frame just drawn, read straight off the theme's one WebGL canvas (every theme has exactly one) and scaled to
  // w×h as CSS shows it. Reading in the same task as the draw is reliable; offscreen compositor paints hand back a
  // stale frame now and then, however long you wait for them.
  grab(w, h) {
    const src = document.querySelector('canvas');
    if (!grabCtx || grabCtx.canvas.width !== w || grabCtx.canvas.height !== h) grabCtx = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d', { willReadFrequently: true });
    grabCtx.imageSmoothingQuality = 'high';
    grabCtx.drawImage(src, 0, 0, w, h);
    return grabCtx.getImageData(0, 0, w, h).data;
  },
  get time() { return vt; },
};
