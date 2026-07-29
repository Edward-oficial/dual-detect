# Duan — verificación anti-bots

Widget de verificación tipo "arrastrá la pieza gris hasta encajarla", con
detección de bots combinando: análisis de trayectoria del arrastre (velocidad,
cantidad de puntos), `navigator.webdriver`, plugins/idiomas del navegador,
resoluciones típicas de headless, chequeo de conexión a internet en tiempo
real, y challenges firmados con HMAC (no se pueden falsificar desde la consola).

## Estructura

```
duan/
├── server.js          # backend Express: challenges, verificación, siteverify
├── package.json
└── public/
    ├── index.html      # landing con demo en vivo + generador de site key
    └── duan-widget.js  # el widget embebible (esto es lo que otras páginas cargan)
```

## Probarlo local

```bash
npm install
npm start
```

Abrí `http://localhost:3000`.

## Desplegar en Render

1. Subí esta carpeta a un repo de GitHub (o conectá el repo existente).
2. En Render: **New +** → **Web Service** → conectá el repo.
3. Configurá:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
4. Agregá una variable de entorno:
   - `DUAN_SECRET` → una cadena larga y aleatoria (esto firma los challenges y tokens; sin esto, Render usa un secret de desarrollo inseguro por defecto).
5. Deploy. Tu URL quedará algo como `https://duan-xxxx.onrender.com`.

> ⚠️ El plan free de Render "duerme" el servicio tras un rato de inactividad.
> El primer request después de dormir puede tardar ~30s en despertar — el
> widget maneja eso mostrando "sin conexión" o "verificando" mientras espera,
> pero si vas a usarlo en producción real conviene un plan que no duerma.

## Usar Duan en otra página

En la página que querés proteger (login, formulario de contacto, registro, etc.):

```html
<form>
  ...
  <div class="duan-widget-container" data-sitekey="TU_SITE_KEY"></div>
  <script src="https://tu-app.onrender.com/duan-widget.js" async defer></script>
  <button type="submit">Enviar</button>
</form>
```

Conseguí tu `site key` y `secret key` desde la landing (`/`) con el botón
"Generar site key + secret key".

Al verificarse, el widget agrega automáticamente un input oculto
`duan-response` con el token dentro del `<form>` más cercano — se manda solo
junto con el resto de los campos.

### Validar el token en tu backend

Nunca confíes solo en que el widget se puso verde del lado del cliente —
siempre validá server-to-server con tu `secret key`:

```js
const r = await fetch("https://tu-app.onrender.com/api/duan/siteverify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    token: req.body["duan-response"],
    secret: process.env.DUAN_SECRET_KEY, // tu secret key, nunca la mandes al frontend
  }),
});
const { success } = await r.json();

if (!success) {
  return res.status(403).json({ error: "verificación fallida" });
}
// seguí con el registro / envío del formulario
```

## Limitaciones a tener en cuenta

- Las site keys viven **en memoria** del servidor (un `Map`). Si Render
  reinicia el servicio o hace deploy de nuevo, se pierden. Para persistencia
  real, migrar `siteKeys` a Supabase (una tabla simple `site_key`,
  `secret_key`, `created_at` alcanza).
- El endpoint `/api/keys` no tiene autenticación — cualquiera que entre a la
  landing puede generar llaves. Para un uso serio, protegelo con login o con
  un token de administrador.
- La detección de bots acá es heurística (basada en reglas), no un modelo de
  ML entrenado como hCaptcha o Cloudflare Turnstile. Filtra bien a scripts
  simples (curl, fetch directo, Selenium sin stealth) pero un bot muy
  sofisticado que simule movimientos de mouse con ruido humano podría
  colarse. Sirve como primera capa, no como única defensa — combinalo con
  rate limiting por IP en tus endpoints sensibles.
