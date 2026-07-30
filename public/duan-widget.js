(function () {
  const scriptEl = document.currentScript;
  const API_BASE = new URL(scriptEl.src).origin;

  const STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Serif+SC:wght@700&display=swap');

  .duan-box {
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Helvetica Neue', Arial, sans-serif;
    background: #000000;
    border: 1px solid #2c2c2e;
    border-radius: 16px;
    padding: 0;
    width: 100%;
    max-width: 302px;
    color: #ffffff;
    box-sizing: border-box;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6), 0 1px 3px rgba(255, 255, 255, 0.05);
    transition: all 0.2s ease;
  }

  .duan-box.locked {
    opacity: 0.45;
    pointer-events: none;
  }

  /* Header Container */
  .duan-hc {
    display: flex;
    align-items: center;
    padding: 14px 16px;
    gap: 14px;
  }

  .duan-hc-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }

  .duan-row {
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    flex: 1;
    min-width: 0;
    transition: opacity 0.15s ease;
  }

  .duan-row:active {
    opacity: 0.6;
  }

  /* Checkbox - iOS dark style */
  .duan-checkbox {
    width: 28px;
    height: 28px;
    border: 2px solid #48484a;
    border-radius: 8px;
    position: relative;
    flex-shrink: 0;
    background: #1c1c1e;
    transition: all 0.2s cubic-bezier(0.25, 0.1, 0.25, 1);
  }

  .duan-checkbox.verified {
    border-color: #0a84ff;
    background: #0a84ff;
    box-shadow: 0 2px 10px rgba(10, 132, 255, 0.4);
  }

  .duan-checkbox.busy {
    border-color: #0a84ff;
    background: #1c1c1e;
  }

  .duan-spinner {
    position: absolute;
    inset: 3px;
    border: 2.5px solid transparent;
    border-top-color: #0a84ff;
    border-radius: 50%;
    animation: duan-spin 0.7s linear infinite;
  }

  .duan-check {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    font-size: 15px;
    font-weight: 600;
  }

  @keyframes duan-spin {
    to { transform: rotate(360deg); }
  }

  /* Label */
  .duan-label {
    font-size: 15px;
    color: #ffffff;
    font-weight: 500;
    line-height: 1.3;
    letter-spacing: -0.2px;
  }

  .duan-label small {
    display: block;
    color: #98989d;
    font-size: 11px;
    font-weight: 400;
    margin-top: 3px;
    letter-spacing: 0;
  }

  /* Divider */
  .duan-hc-divider {
    width: 1px;
    align-self: stretch;
    background: #2c2c2e;
    margin: 12px 4px;
  }

  /* Brand Area - Duan with Chinese character */
  .duan-hc-brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 2px 0;
    gap: 2px;
  }

  .duan-hc-logo {
    font-family: 'Noto Serif SC', 'Songti SC', 'STSong', serif;
    font-size: 22px;
    color: #ffffff;
    font-weight: 700;
    line-height: 1;
    text-shadow: 0 1px 2px rgba(255, 255, 255, 0.1);
  }

  .duan-hc-name {
    font-size: 10px;
    color: #98989d;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .duan-hc-links {
    font-size: 8px;
    color: #636366;
    margin-top: 4px;
    text-align: center;
    line-height: 1.3;
  }

  /* Title for puzzle */
  .duan-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #98989d;
    margin: 14px 16px 12px;
    font-weight: 500;
  }

  .duan-title b {
    font-family: 'Noto Serif SC', 'Songti SC', serif;
    color: #0a84ff;
    font-weight: 700;
    font-size: 18px;
  }

  /* Puzzle Body */
  .duan-puzzle-body {
    padding: 0 16px 16px;
  }

  .duan-track {
    position: relative;
    height: 50px;
    border-radius: 25px;
    overflow: hidden;
    border: 1.5px solid #2c2c2e;
    background: #1c1c1e;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4);
  }

  .duan-slot {
    position: absolute;
    top: 8px;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 2.5px dashed #0a84ff;
    opacity: 0.5;
    box-sizing: border-box;
    transition: left 0.3s ease;
  }

  .duan-piece {
    position: absolute;
    top: 8px;
    left: 8px;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    cursor: grab;
    touch-action: none;
    background: #48484a;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), inset 0 0 0 2px rgba(255, 255, 255, 0.1);
    transition: background 0.2s ease, box-shadow 0.2s ease, transform 0.1s ease;
  }

  .duan-piece:active {
    cursor: grabbing;
    transform: scale(1.05);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5), inset 0 0 0 2px rgba(255, 255, 255, 0.15);
  }

  .duan-piece.solved {
    background: #0a84ff;
    box-shadow: 0 0 0 4px rgba(10, 132, 255, 0.25), inset 0 0 0 2px rgba(255, 255, 255, 0.2);
    cursor: default;
  }

  /* Messages */
  .duan-msg {
    margin: 12px 16px 0;
    font-size: 12px;
    color: #98989d;
    min-height: 16px;
    font-weight: 400;
    letter-spacing: -0.1px;
  }

  .duan-msg.err {
    color: #ff453a;
  }

  .duan-msg.ok {
    color: #30d158;
    font-weight: 600;
  }

  /* Smooth transitions */
  .duan-msg, .duan-label, .duan-checkbox {
    transition: color 0.15s ease, background 0.2s ease, border-color 0.2s ease;
  }
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

    const paintedAt = Date.now();
    let passiveMoves = 0;
    document.addEventListener('mousemove', () => { passiveMoves++; }, { passive: true });

    function applyToken(token) {
      const form = container.closest('form');
      if (form) {
        let input = form.querySelector('input[name="duan-response"]');
        if (!input) {
          input = document.createElement('input');
          input.type = 'hidden';
          input.name = 'duan-response';
          form.appendChild(input);
        }
        input.value = token;
      }
      if (callbackName && typeof window[callbackName] === 'function') {
        window[callbackName](token);
      }
    }

    function renderCheckbox() {
      container.classList.remove('locked');
      container.innerHTML = `
        <div class="duan-hc">
          <div class="duan-row" id="duanRow">
            <div class="duan-checkbox" id="duanCheckbox">
              <div class="duan-spinner" style="display:none"></div>
              <div class="duan-check" style="display:none">✓</div>
            </div>
            <div class="duan-label">No soy un robot</div>
          </div>
          <div class="duan-hc-divider"></div>
          <div class="duan-hc-brand">
            <div class="duan-hc-logo">段</div>
            <div class="duan-hc-name">Duan</div>
            <div class="duan-hc-links">Privacidad<br>Términos</div>
          </div>
        </div>
        <div class="duan-msg" style="margin-top:0;padding:0 16px 16px"></div>
      `;
      const row = container.querySelector('#duanRow');
      const checkbox = container.querySelector('#duanCheckbox');
      const msg = container.querySelector('.duan-msg');
      row.addEventListener('click', () => startPrecheck(checkbox, msg), { once: true });
    }

    function lockTemporarily(msg, secs) {
      let remaining = Math.max(secs, 1);
      msg.className = 'duan-msg err';
      const tick = () => {
        if (remaining <= 0) { renderCheckbox(); return; }
        msg.textContent = `demasiados intentos, esperá ${remaining}s`;
        remaining--;
        setTimeout(tick, 1000);
      };
      tick();
    }

    function markVerified(checkbox, msg, token) {
      checkbox.classList.remove('busy');
      const spinner = checkbox.querySelector('.duan-spinner');
      const check = checkbox.querySelector('.duan-check');
      if (spinner) spinner.style.display = 'none';
      if (check) check.style.display = 'flex';
      checkbox.classList.add('verified');
      msg.textContent = 'verificado ✓ por Duan';
      msg.className = 'duan-msg ok';
      applyToken(token);
    }

    async function startPrecheck(checkbox, msg) {
      checkbox.classList.add('busy');
      checkbox.querySelector('.duan-spinner').style.display = 'block';
      msg.textContent = 'comprobando conexión...';

      const online = await ping();
      if (!online) {
        msg.textContent = 'sin conexión — Duan necesita internet para verificar';
        msg.className = 'duan-msg err';
        checkbox.classList.remove('busy');
        checkbox.querySelector('.duan-spinner').style.display = 'none';
        container.querySelector('#duanRow').addEventListener('click', () => startPrecheck(checkbox, msg), { once: true });
        return;
      }

      msg.textContent = 'verificando...';
      try {
        const body = {
          sitekey,
          mouseMovements: passiveMoves,
          timeOnPage: Date.now() - paintedAt,
          webdriver: navigator.webdriver === true,
          languages: (navigator.languages || []).length,
          plugins: navigator.plugins ? navigator.plugins.length : 0,
          screenW: screen.width,
          screenH: screen.height,
          touch: 'ontouchstart' in window,
        };
        const r = await fetch(`${API_BASE}/api/duan/precheck`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await r.json();

        if (data.blocked) {
          lockTemporarily(msg, Math.ceil((data.retryInMs || 15000) / 1000));
          return;
        }
        if (data.success && data.frictionless) {
          markVerified(checkbox, msg, data.token);
          return;
        }
        loadPuzzle();
      } catch {
        msg.textContent = 'error de red, tocá para reintentar';
        msg.className = 'duan-msg err';
        checkbox.classList.remove('busy');
        checkbox.querySelector('.duan-spinner').style.display = 'none';
        container.querySelector('#duanRow').addEventListener('click', () => startPrecheck(checkbox, msg), { once: true });
      }
    }

    function loadPuzzle() {
      container.innerHTML = `
        <div class="duan-title"><b>段</b> Verificación Duan</div>
        <div class="duan-puzzle-body">
          <div class="duan-track">
            <div class="duan-slot"></div>
            <div class="duan-piece"></div>
          </div>
        </div>
        <div class="duan-msg">cargando desafío...</div>
      `;
      const track = container.querySelector('.duan-track');
      const slot = container.querySelector('.duan-slot');
      const piece = container.querySelector('.duan-piece');
      const msgEl = container.querySelector('.duan-msg');

      let challenge = null;
      let dragging = false, startX = 0, originLeft = 8, movements = [], trusted = true;

      async function fetchChallenge() {
        container.classList.add('locked');
        try {
          const r = await fetch(`${API_BASE}/api/duan/challenge?sitekey=${encodeURIComponent(sitekey)}`);
          challenge = await r.json();
          if (!r.ok) throw new Error(challenge.error || 'error');
          const trackWidth = track.clientWidth;
          const maxLeft = trackWidth - 42;
          const targetLeft = Math.min(challenge.target, maxLeft);
          slot.style.left = targetLeft + 'px';
          piece.style.left = '8px';
          piece.classList.remove('solved');
          movements = [];
          msgEl.textContent = 'arrastrá el círculo hasta encajarlo';
          msgEl.className = 'duan-msg';
          container.classList.remove('locked');
        } catch (e) {
          const reason = e && e.message;
          if (reason === 'ip_bloqueada') { lockTemporarily(msgEl, 15); return; }
          msgEl.textContent = 'no se pudo cargar, tocá para reintentar';
          msgEl.className = 'duan-msg err';
          container.classList.remove('locked');
          piece.addEventListener('pointerdown', fetchChallenge, { once: true });
        }
      }

      function pointerDown(e) {
        if (piece.classList.contains('solved') || !challenge) return;
        dragging = true;
        trusted = e.isTrusted !== false;
        startX = e.touches ? e.touches[0].clientX : e.clientX;
        originLeft = parseFloat(piece.style.left) || 8;
        movements = [{ x: originLeft, t: Date.now() }];
        e.preventDefault();
      }
      function pointerMove(e) {
        if (!dragging) return;
        if (e.isTrusted === false) trusted = false;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const delta = clientX - startX;
        const trackWidth = track.clientWidth;
        const maxLeft = trackWidth - 42;
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
          msgEl.textContent = 'se perdió la conexión, reintentando...';
          msgEl.className = 'duan-msg err';
          return fetchChallenge();
        }

        msgEl.textContent = 'verificando...';
        try {
          const body = {
            id: challenge.id, target: challenge.target, issuedAt: challenge.issuedAt,
            sitekey: challenge.sitekey, sig: challenge.sig,
            achieved, movements, trusted, online,
            webdriver: navigator.webdriver === true,
            languages: (navigator.languages || []).length,
            plugins: navigator.plugins ? navigator.plugins.length : 0,
            screenW: screen.width, screenH: screen.height,
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
            msgEl.textContent = 'verificado ✓ por Duan';
            msgEl.className = 'duan-msg ok';
            applyToken(data.token);
          } else if (data.reason === 'ip_bloqueada') {
            lockTemporarily(msgEl, Math.ceil((data.retryInMs || 15000) / 1000));
          } else {
            msgEl.textContent = 'no coincide, probá de nuevo';
            msgEl.className = 'duan-msg err';
            fetchChallenge();
          }
        } catch {
          msgEl.textContent = 'error de red, reintentando...';
          msgEl.className = 'duan-msg err';
          fetchChallenge();
        }
      }

      piece.addEventListener('pointerdown', pointerDown);
      window.addEventListener('pointermove', pointerMove);
      window.addEventListener('pointerup', pointerUp);

      fetchChallenge();
    }

    renderCheckbox();
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