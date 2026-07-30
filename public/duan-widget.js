(function () {
  const scriptEl = document.currentScript;
  const API_BASE = new URL(scriptEl.src).origin;

  const STYLE = `
  .duan-box{font-family:Inter,system-ui,sans-serif;background:#0e0e0e;border:1px solid #232323;border-radius:12px;padding:16px;max-width:320px;color:#f2e6d2;box-sizing:border-box}
  .duan-box.locked{opacity:.55;pointer-events:none}
  .duan-row{display:flex;align-items:center;gap:12px;cursor:pointer}
  .duan-checkbox{width:30px;height:30px;border:2px solid #d4af37;border-radius:50%;position:relative;flex-shrink:0;background:#000;transition:border-color .2s,background .2s}
  .duan-checkbox.verified{border-color:#b91c1c;background:radial-gradient(circle at 35% 30%,#e8544a,#b91c1c 70%)}
  .duan-checkbox.busy{border-color:#b91c1c}
  .duan-spinner{position:absolute;inset:3px;border:2px solid transparent;border-top-color:#b91c1c;border-radius:50%;animation:duan-spin .7s linear infinite}
  .duan-check{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#f2e6d2;font-size:14px}
  @keyframes duan-spin{to{transform:rotate(360deg)}}
  .duan-label{font-size:13px;font-weight:500}
  .duan-label small{display:block;color:#8a7360;font-size:10.5px;font-weight:400;margin-top:2px}
  .duan-title{display:flex;align-items:center;gap:8px;font-size:12px;color:#8a7360;margin-bottom:10px}
  .duan-title b{color:#d4af37;font-family:'Noto Serif SC',serif;font-size:15px}
  .duan-track{position:relative;height:52px;border-radius:10px;overflow:hidden;border:1px solid #232323;
    background-color:#000;
    background-image:
      radial-gradient(circle at 12% 30%, rgba(212,175,55,.14) 0 2px, transparent 3px),
      radial-gradient(circle at 34% 68%, rgba(212,175,55,.14) 0 2px, transparent 3px),
      radial-gradient(circle at 58% 22%, rgba(212,175,55,.14) 0 2px, transparent 3px),
      radial-gradient(circle at 78% 60%, rgba(212,175,55,.14) 0 2px, transparent 3px),
      radial-gradient(circle at 94% 32%, rgba(212,175,55,.14) 0 2px, transparent 3px);
  }
  .duan-slot{position:absolute;top:8px;width:36px;height:36px;border-radius:50%;border:2px dashed #d4af37;opacity:.65;box-sizing:border-box}
  .duan-piece{position:absolute;top:8px;left:6px;width:36px;height:36px;border-radius:50%;cursor:grab;touch-action:none;background:#3a3a3a;box-shadow:inset 0 0 0 2px rgba(0,0,0,.25);transition:background .2s,box-shadow .2s}
  .duan-piece:active{cursor:grabbing}
  .duan-piece.solved{background:radial-gradient(circle at 35% 30%,#e8544a,#b91c1c 70%);box-shadow:0 0 0 3px rgba(185,28,28,.3),inset 0 0 8px rgba(0,0,0,.25)}
  .duan-msg{margin-top:8px;font-size:11px;color:#8a7360;min-height:14px}
  .duan-msg.err{color:#e8817a}
  .duan-msg.ok{color:#d4af37}
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

    function loadPuzzle() {
      container.innerHTML = `
        <div class="duan-title"><b>段</b> Verificación Duan</div>
        <div class="duan-track">
          <div class="duan-slot"></div>
          <div class="duan-piece"></div>
        </div>
        <div class="duan-msg">cargando desafío...</div>
      `;
      const track = container.querySelector('.duan-track');
      const slot = container.querySelector('.duan-slot');
      const piece = container.querySelector('.duan-piece');
      const msgEl = container.querySelector('.duan-msg');

      let challenge = null;
      let dragging = false, startX = 0, originLeft = 6, movements = [], trusted = true;

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
          piece.style.left = '6px';
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
        originLeft = parseFloat(piece.style.left) || 6;
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
