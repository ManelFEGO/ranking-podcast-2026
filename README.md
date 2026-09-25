# Podcasts 2026

Directorio personal de podcasts de marketing, eCommerce, SEO y negocio digital, agrupados por temática en secciones desplegables. Pensado como acceso directo desde la pantalla de inicio del iPhone.

Se publica en `https://manelfego.github.io/ranking-podcast-2026/`.

74 podcasts: los 71 del listado de candidaturas más los tres que aparecen en la edición 2026 del ranking. Los 50 primeros llevan su posición. No depende de ningún servidor externo ni de ninguna librería.

## Qué hay que hacer para actualizar

Tres comandos en el Terminal, dentro de la carpeta del proyecto, en este orden:

```bash
node tools/enlazar-portadas.mjs
node tools/fetch-covers.mjs
```

El primero mira qué imágenes hay realmente en `assets/covers/` y vuelve a apuntar a ellas desde el JSON nuevo. No descarga ni borra nada: solo recupera el enlace de las portadas que ya tenías.

El segundo busca únicamente las que falten, así que tarda segundos en lugar de minutos.

Después, sube todo a GitHub.

## Cambiar una categoría

Todo está en `data/podcasts.json`. Cada podcast tiene un campo `categoria` con el nombre de la sección donde aparece:

```json
"categoria": "Marketing y estrategia"
```

Cambia el texto y el podcast se mueve de sección. Las secciones y su orden en la página salen del array `categorias`, al final del mismo archivo: para renombrar una sección, cámbiala ahí y en los podcasts que la usen; para reordenarlas, mueve el nombre de sitio.

La clasificación temática es propia. El artículo de Marketing4eCommerce es un ranking plano del 1 al 50 sin categorías, así que no hay ninguna fuente de la que copiarlas. Cambia las que no te encajen.

El campo `ranking` es la posición en el top 50, o `null` para los que no entraron.

## Publicar

```bash
git add .
git commit -m "Ranking 2026 con categorías"
git push origin main
```

O, desde el navegador: **Add file → Upload files**, arrastrar y **Commit changes**.

En GitHub: **Settings → Pages → Build and deployment**, origen `Deploy from a branch`, rama `main`, carpeta `/ (root)`.

## Importante: al editar, sube la versión de la caché

El service worker guarda una copia local para que la página funcione sin conexión. Los datos van con estrategia de red primero, así que un cambio en `data/podcasts.json` se ve en cuanto haya conexión. Pero si tocas `index.html`, `style.css`, `app.js` o añades portadas, **cambia la constante de la primera línea de `sw.js`**:

```js
const CACHE_VERSION = "podcasts-2026-v3";   // -> v4, v5...
```

Sin eso, el iPhone seguirá mostrando la versión antigua.

## Comprobar los enlaces

```bash
node tools/check-links.mjs
```

Devuelve una tabla `nombre | URL | código | URL final` y un resumen. Va de ocho en ocho y se identifica como Safari, porque Spotify y Apple devuelven 403 a los agentes que no parecen un navegador. **Un 403 casi nunca es un enlace roto**: ábrelo en el navegador antes de cambiarlo.

## Estructura

```
index.html                carcasa; no contiene ningún podcast escrito a mano
style.css                 oscuro por defecto, claro según el sistema
app.js                    carga el JSON, agrupa por categoría, busca y filtra
sw.js                     caché offline
manifest.json             instalación como web app
favicon.svg               icono del navegador
icon-192.png              icono del manifest
icon-512.png              icono del manifest
apple-touch-icon.png      icono de la pantalla de inicio del iPhone
.nojekyll                 evita que GitHub Pages procese la carpeta con Jekyll
data/podcasts.json        los 74 registros, las categorías y su orden
assets/covers/            portadas locales
tools/enlazar-portadas.mjs  vuelve a enlazar las portadas del disco
tools/fetch-covers.mjs    descarga de portadas
tools/check-links.mjs     verificación de enlaces
```

## Fuentes

- Listado de candidaturas (capturado el 9 de septiembre de 2026): `https://votacion-rk-podcast-m4c.lovable.app/candidaturas`
- Ranking y posiciones (24 de septiembre de 2026): `https://marketing4ecommerce.net/mejores-podcasts-de-marketing-digital/`
