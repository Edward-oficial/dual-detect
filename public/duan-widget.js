(function () {
  const scriptEl = document.currentScript;
  const API_BASE = new URL(scriptEl.src).origin;

  const STYLE = `
  .duan-box{font-family:Inter,system-ui,sans-serif;background:#1c2030;border:1px solid #2c3145;border-radius:10px;padding:16px;max-width:320px;color:#f2e9d8;box-sizing:border-box}
  .duan-box.locked{opacity:.55;pointer-events:none}
  .duan-title{display:flex;align-items:center;gap:8px;font-size:12px;color:#8a90ab;margin-bottom:10px}
  .duan-title b{color:#a8322d;font-family:serif;font-size:14px}
  .duan-track{position:relative;height:46px;background:#0f1119;border-radius:8px;overflow:hidden;border:1px dashed #3a4059}
  .duan-slot{position:absolute;top:6px;width:34px;height:34px;border:2px dashed #565d80;border-radius:6px;box-sizing:border-box}
  .duan-piece{position:absolute;top:6px;left:4px;width:34px;height:34px;border-radius:6px;background:#565d80;cursor:grab;touch-action:none;transition:background .2s,box-shadow .2s;display:flex;align-items:center;justify-content:center;font-size:14px;color:#0f1119}
  .duan-piece.solved{background:#a8322d;box-shadow:0 0 0 3px rgba(168,50,45,.25);color:#f2e9d8}
  .duan-piece:active{cursor:grabbing}
  .duan-msg{margin-top:8px;font-size:11px;color:#6b7086;min-height:14px}
  .duan-msg.err{color:#c66}
  .duan-msg.ok{color:#7bab7e}
  `;

  function injectStyle() {
    if (document.getElementById('duan-style')) return;
    const s = document.createElement('style');
    s.id = 'duan-style';
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  async function ping() {
    if (!navigator.onLine) return false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(`${API_BASE}/api/ping`, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      return r.ok;
    } catch {
      return false;
    }
  }

  function buildWidget(container) {
    const sitekey = container.getAttribute('data-sitekey');
    const callbackName = container.getAttribute('data-callback');

    injectStyle();
    container.classList.add('duan-box');
    container.innerHTML = `
      <div class="duan-title"><b>段</b> Verificación Duan</div>
      <div class="duan-track">
        <div class="duan-slot"></div>
        <div class="duan-piece" title="Arrastrá hasta encajar">&#9670;</div>
      </div>
      <div class="duan-msg">esperando conexión...</div>
    `;

    const track = container.querySelector('.duan-track');
    const slot = container.querySelector('.duan-slot');
    const piece = container.querySelector('.duan-piece');
    const msg = container.querySelector('.duan-msg');

    let challenge = null;
    let dragging = false;
    let startX = 0, originLeft = 4;
    let movements = [];
    let trusted = true;

    function setMsg(text, type) {
      msg.textContent = text;
      msg.className = 'duan-msg' + (type ? ' ' + type : '');
    }

    function hiddenInput() {
      const form = container.closest('form');
      if (!form) return null;
      let input = form.querySelector('input[name="duan-response"]');
      if (!input) {
        input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'duan-response';
        form.appendChild(input);
      }
      return input;
    }

    async function loadChallenge() {
      container.classList.add('locked');
      setMsg('comprobando conexión...');
      const online = await ping();
      if (!online) {
        setMsg('sin conexión — Duan necesita internet para verificar', 'err');
        container.classList.remove('locked');
        return;
      }
      try {
        const r = await fetch(`${API_BASE}/api/duan/challenge?sitekey=${encodeURIComponent(sitekey)}`);
        challenge = await r.json();
        if (!r.ok) throw new Error(challenge.error || 'error');
        const trackWidth = track.clientWidth;
        const maxLeft = trackWidth - 38;
        const targetLeft = Math.min(challenge.target, maxLeft);
        slot.style.left = targetLeft + 'px';
        piece.style.left = '4px';
        piece.classList.remove('solved');
        movements = [];
        setMsg('arrastrá la pieza hasta encajarla');
        container.classList.remove('locked');
      } catch {
        setMsg('no se pudo cargar la verificación, tocá para reintentar', 'err');
        container.classList.remove('locked');
        piece.addEventListener('pointerdown', retryOnce, { once: true });
      }
    }

    function retryOnce() { loadChallenge(); }

    function pointerDown(e) {
      if (piece.classList.contains('solved') || !challenge) return;
      dragging = true;
      trusted = e.isTrusted !== false;
      startX = e.touches ? e.touches[0].clientX : e.clientX;
      originLeft = parseFloat(piece.style.left) || 4;
      movements = [{ x: originLeft, t: Date.now() }];
      e.preventDefault();
    }

    function pointerMove(e) {
      if (!dragging) return;
      if (e.isTrusted === false) trusted = false;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const delta = clientX - startX;
      const trackWidth = track.clientWidth;
      const maxLeft = trackWidth - 38;
      const left = Math.min(Math.max(originLeft + delta, 0), maxLeft);
      piece.style.left = left + 'px';
      movements.push({ x: left, t: Date.now() });
    }

    async function pointerUp() {
      if (!dragging) return;
      dragging = false;
      const achieved = parseFloat(piece.style.left) || 0;

      const online = await ping();
      if (!online) {
        setMsg('se perdió la conexión, reintentando...', 'err');
        return loadChallenge();
      }

      setMsg('verificando...');
      try {
        const body = {
          id: challenge.id,
          target: challenge.target,
          issuedAt: challenge.issuedAt,
          sitekey: challenge.sitekey,
          sig: challenge.sig,
          achieved,
          movements,
          trusted,
          online,
          webdriver: navigator.webdriver === true,
          languages: (navigator.languages || []).length,
          plugins: navigator.plugins ? navigator.plugins.length : 0,
          screenW: screen.width,
          screenH: screen.height,
          touch: 'ontouchstart' in window,
        };
        const r = await fetch(`${API_BASE}/api/duan/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await r.json();

        if (data.success) {
          piece.classList.add('solved');
          setMsg('verificado ✓ por Duan', 'ok');
          const input = hiddenInput();
          if (input) input.value = data.token;
          if (callbackName && typeof window[callbackName] === 'function') {
            window[callbackName](data.token);
          }
        } else {
          setMsg('no coincide, probá de nuevo', 'err');
          loadChallenge();
        }
      } catch {
        setMsg('error de red al verificar, reintentando...', 'err');
        loadChallenge();
      }
    }

    piece.addEventListener('pointerdown', pointerDown);
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);

    window.addEventListener('offline', () => {
      if (!piece.classList.contains('solved')) {
        setMsg('sin conexión — Duan necesita internet para verificar', 'err');
      }
    });
    window.addEventListener('online', () => {
      if (!piece.classList.contains('solved') && !challenge) loadChallenge();
    });

    loadChallenge();
  }

  function init() {
    document.querySelectorAll('.duan-widget-container').forEach(buildWidget);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.duan = { render: buildWidget };
})();
