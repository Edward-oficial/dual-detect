(function () {
  const scriptEl = document.currentScript;
  const API_BASE = new URL(scriptEl.src).origin;

  const STYLE = `
  .duan-box{font-family:Inter,system-ui,sans-serif;background:#1c2030;border:1px solid #2c3145;border-radius:10px;padding:16px;max-width:320px;color:#f2e9d8;box-sizing:border-box}
  .duan-box.locked{opacity:.55;pointer-events:none}
  .duan-row{display:flex;align-items:center;gap:12px;cursor:pointer}
  .duan-checkbox{width:28px;height:28px;border:2px solid #565d80;border-radius:6px;position:relative;flex-shrink:0;transition:border-color .2s,background .2s}
  .duan-checkbox.verified{border-color:#a8322d;background:#a8322d}
  .duan-checkbox.busy{border-color:#a8322d}
  .duan-spinner{position:absolute;inset:3px;border:2px solid transparent;border-top-color:#a8322d;border-radius:50%;animation:duan-spin .7s linear infinite}
  .duan-check{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#f2e9d8;font-size:15px}
  @keyframes duan-spin{to{transform:rotate(360deg)}}
  .duan-label{font-size:13px;font-weight:500}
  .duan-label small{display:block;color:#8a90ab;font-size:10.5px;font-weight:400;margin-top:2px}
  .duan-title{display:flex;align-items:center;gap:8px;font-size:12px;color:#8a90ab;margin-bottom:10px}
  .duan-title b{color:#a8322d;font-family:serif;font-size:14px}
  .duan-track{position:relative;height:48px;background:#0f1119;border-radius:8px;overflow:hidden;border:1px dashed #3a4059}
  .duan-slot-svg{position:absolute;top:4px;opacity:.6}
  .duan-slot-svg path{fill:none;stroke:#565d80;stroke-width:1.5;stroke-dasharray:3 3}
  .duan-piece{position:absolute;top:4px;left:4px;cursor:grab;touch-action:none}
  .duan-piece:active{cursor:grabbing}
  .duan-piece path{fill:#565d80;transition:fill .2s}
  .duan-piece.solved path{fill:#a8322d}
  .duan-msg{margin-top:8px;font-size:11px;color:#6b7086;min-height:14px}
  .duan-msg.err{color:#c66}
  .duan-msg.ok{color:#7bab7e}
  `;

  const PIECE_PATH = 'M4,4 H16 C16,0 22,0 22,4 H34 V16 C38,16 38,22 34,22 V34 H22 C22,38 16,38 16,34 H4 V22 C0,22 0,16 4,16 Z';

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

    // señales pasivas: cuánto se movió el mouse y cuánto tiempo pasó desde que se pintó el widget
    const paintedAt = Date.now();
    let passiveMoves = 0;
    const onPassiveMove = () => { passiveMoves++; };
    document.addEventListener('mousemove', onPassiveMove, { passive: true });

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
        <div class="duan-row" id="duanRow">
          <div class="duan-checkbox" id="duanCheckbox">
            <div class="duan-spinner" style="display:none"></div>
            <div class="duan-check" style="display:none">&#10003;</div>
          </div>
          <div class="duan-label">No soy un robot<small>Certificado por Duan 段</small></div>
        </div>
        <div class="duan-msg"></div>
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

    // --- Desafío del rompecabezas: solo aparece si el chequeo silencioso detectó riesgo ---
    function loadPuzzle() {
      container.innerHTML = `
        <div class="duan-title"><b>段</b> Verificación Duan</div>
        <div class="duan-track">
          <svg class="duan-slot-svg" width="40" height="40" viewBox="0 0 40 40"><path d="${PIECE_PATH}"></path></svg>
          <div class="duan-piece"><svg width="40" height="40" viewBox="0 0 40 40"><path d="${PIECE_PATH}"></path></svg></div>
        </div>
        <div class="duan-msg">cargando desafío...</div>
      `;
      const track = container.querySelector('.duan-track');
      const slot = container.querySelector('.duan-slot-svg');
      const piece = container.querySelector('.duan-piece');
      const msgEl = container.querySelector('.duan-msg');

      let challenge = null;
      let dragging = false, startX = 0, originLeft = 4, movements = [], trusted = true;

      async function fetchChallenge() {
        container.classList.add('locked');
        try {
          const r = await fetch(`${API_BASE}/api/duan/challenge?sitekey=${encodeURIComponent(sitekey)}`);
          challenge = await r.json();
          if (!r.ok) throw new Error(challenge.error || 'error');
          const trackWidth = track.clientWidth;
          const maxLeft = trackWidth - 44;
          const targetLeft = Math.min(challenge.target, maxLeft);
          slot.style.left = targetLeft + 'px';
          piece.style.left = '4px';
          piece.classList.remove('solved');
          movements = [];
          msgEl.textContent = 'arrastrá la pieza hasta encajarla';
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
        const maxLeft = trackWidth - 44;
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
