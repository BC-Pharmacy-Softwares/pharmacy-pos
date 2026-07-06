/* ============================================================
   utils/signature-pad.js — tiny canvas signature capture.
   Works with mouse, touch, and stylus. Returns a PNG data-URL.

   Usage:
     const pad = SignaturePad.attach(canvasEl);
     pad.isEmpty();          // → bool
     pad.toDataURL();        // → "data:image/png;base64,..." (or '' if empty)
     pad.clear();
     pad.load(dataUrl);      // render an existing signature
   ============================================================ */

const SignaturePad = (() => {

  function attach(canvas) {
    const ctx = canvas.getContext('2d');
    let drawing = false, dirty = false, last = null;

    // Match the backing store to the displayed size for crisp lines.
    function fit() {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const prev = dirty ? canvas.toDataURL('image/png') : null;
      canvas.width  = Math.max(1, Math.round(rect.width  * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111';
      if (prev) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height); img.src = prev; }
    }

    function pos(e) {
      const rect = canvas.getBoundingClientRect();
      const p = (e.touches && e.touches[0]) ? e.touches[0] : e;
      return { x: p.clientX - rect.left, y: p.clientY - rect.top };
    }
    function start(e) { e.preventDefault(); drawing = true; last = pos(e); }
    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p; dirty = true;
    }
    function end() { drawing = false; }

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);

    // Defer fit until the element is laid out.
    setTimeout(fit, 0);

    return {
      isEmpty: () => !dirty,
      clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; },
      toDataURL() { return dirty ? canvas.toDataURL('image/png') : ''; },
      load(dataUrl) {
        if (!dataUrl) return;
        const rect = canvas.getBoundingClientRect();
        const img = new Image();
        img.onload = () => { ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(img, 0, 0, rect.width, rect.height); dirty = true; };
        img.src = dataUrl;
      },
    };
  }

  return { attach };
})();
