# Podcasts 2026

Copia estática e independiente del listado de candidaturas del Ranking Podcast 2026 de Marketing4eCommerce, pensada como acceso directo desde la pantalla de inicio del iPhone.

Datos congelados el 9 de septiembre de 2026: 71 podcasts con nombre, autor y enlace de escucha. No depende de `lovable.app`, ni de servidores propios, ni de ninguna librería externa.

Se publica en `https://manelfego.github.io/ranking-podcast-2026/`.

## Publicar

```bash
cd ranking-podcast-2026
git add .
git commit -m "Copia independiente de podcasts 2026"
git push origin main
```

En GitHub: **Settings → Pages → Build and deployment**, origen `Deploy from a branch`, rama `main`, carpeta `/ (root)`. La primera publicación tarda un par de minutos.

Después, en el iPhone: abre la URL en Safari, botón compartir, **Añadir a pantalla de inicio**.

## Descargar las portadas reales

El paquete se entrega sin portadas: cada tarjeta muestra un cuadro de color con las iniciales, generado en el navegador. Para sustituirlas por las carátulas de verdad, con Node 18 o superior:

```bash
node tools/fetch-covers.mjs
```

Busca cada portada en la API pública de iTunes (los de Apple Podcasts) o en la etiqueta `og:image` de la página de destino (Spotify, iVoox, Castbox y webs propias), las guarda en `assets/covers/` y actualiza `data/podcasts.json` con la ruta, la URL de origen y `portadaVerificada: true`.

En macOS reescala a 400×400 con `sips`, que ya viene instalado. Las que no consiga te las lista por pantalla y esas se quedan con el cuadro de iniciales.

Para rehacerlas todas: `node tools/fetch-covers.mjs --force`.

## Comprobar los enlaces

```bash
node tools/check-links.mjs
```

Devuelve una tabla `nombre | URL | código | URL final` y un resumen al final. Va de ocho en ocho y se identifica como Safari, porque Spotify y Apple devuelven 403 a los agentes que no parecen un navegador. **Un 403 casi nunca es un enlace roto**: ábrelo en el navegador antes de cambiarlo.

Para guardarlo: `node tools/check-links.mjs > enlaces.md`.

## Importante: al editar los datos, sube la versión de la caché

El service worker guarda una copia local para que la página funcione sin conexión. Los datos van con estrategia de red primero, así que un cambio en `data/podcasts.json` se ve en cuanto haya conexión. Pero si tocas `index.html`, `style.css`, `app.js` o añades portadas, **cambia la constante de la primera línea de `sw.js`**:

```js
const CACHE_VERSION = "podcasts-2026-v2";   // -> v3, v4...
```

Sin eso, el iPhone seguirá mostrando la versión antigua.

## Estructura

```
index.html            carcasa; no contiene ningún podcast escrito a mano
style.css             oscuro por defecto, claro según el sistema
app.js                carga el JSON, renderiza, busca, filtra y guarda favoritos
sw.js                 caché offline
manifest.json         instalación como web app
favicon.svg           icono del navegador
icon-192.png          icono del manifest
icon-512.png          icono del manifest
apple-touch-icon.png  icono de la pantalla de inicio del iPhone
.nojekyll             evita que GitHub Pages procese la carpeta con Jekyll
data/podcasts.json    los 71 registros
assets/covers/        portadas locales (vacía hasta que ejecutes fetch-covers)
tools/fetch-covers.mjs
tools/check-links.mjs
```

## Editar el listado

Todo está en `data/podcasts.json`. Los campos `description` y `category` están vacíos a propósito: el listado original no los tiene. Si los rellenas, la interfaz los ignora por ahora; añadirlos a la tarjeta es una línea en `app.js`.

Para quitar un podcast, borra su objeto del array. El contador de la cabecera se calcula solo.
