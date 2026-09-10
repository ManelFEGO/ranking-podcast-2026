#!/usr/bin/env node
// Descarga la portada real de cada podcast y actualiza data/podcasts.json.
//
//   node tools/fetch-covers.mjs            solo los que aún no tienen portada
//   node tools/fetch-covers.mjs --force    vuelve a intentarlo con todos
//
// Cómo busca cada portada, en este orden:
//   1. Enlaces de Apple Podcasts -> ficha exacta en la base de datos de Apple (por ID).
//   2. Los demás -> búsqueda por nombre en esa misma base de datos, aceptando
//      solo coincidencias fiables de nombre. Si duda, no la coge.
//   3. Si Apple no lo tiene -> etiqueta og:image de la página de destino.
//
// Nada pasa por lovable.app. Requiere Node 18 o superior. Sin dependencias.
// En macOS reescala a 400x400 con `sips`, que ya viene instalado.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const force = process.argv.includes("--force");
const verbose = process.argv.includes("--verbose");

const TIMEOUT_MS = 20000;
const APPLE_PAUSE_MS = 3200;   // Apple limita a unas 20 consultas por minuto
const DOWNLOAD_CONCURRENCY = 5;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
           "(KHTML, like Gecko) Version/17.4 Safari/605.1.15";

// fileURLToPath decodifica los %20, así que las rutas con espacios funcionan.
const rootDir = fileURLToPath(new URL("..", import.meta.url));
const jsonFile = path.join(rootDir, "data", "podcasts.json");
const coversDir = path.join(rootDir, "assets", "covers");

const data = JSON.parse(await fs.readFile(jsonFile, "utf8"));
await fs.mkdir(coversDir, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

function request(url, extraHeaders = {}) {
  return fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": UA,
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      ...extraHeaders
    },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
}

const normalize = value => String(value || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

// Acepta la coincidencia solo si los nombres son iguales o uno contiene al otro
// de forma inequívoca. Así no acaba una portada ajena en una tarjeta.
function isConfidentMatch(wanted, candidate) {
  const a = normalize(wanted);
  const b = normalize(candidate);
  if (!a || !b) return false;
  if (a === b) return true;
  const shortest = Math.min(a.length, b.length);
  if (shortest < 8) return false;
  return a.startsWith(b) || b.startsWith(a);
}

const big = url => String(url || "").replace(/\/\d+x\d+bb\.(jpg|png)$/, "/600x600bb.$1");

let lastAppleCall = 0;
async function appleApi(url) {
  const wait = APPLE_PAUSE_MS - (Date.now() - lastAppleCall);
  if (wait > 0) await sleep(wait);
  lastAppleCall = Date.now();

  const response = await request(url, { Accept: "application/json" });
  if (response.status === 403 || response.status === 429) {
    await sleep(30000);                       // nos hemos pasado de ritmo: esperar y reintentar
    lastAppleCall = Date.now();
    const retry = await request(url, { Accept: "application/json" });
    if (!retry.ok) throw new Error(`Apple ${retry.status}`);
    return retry.json();
  }
  if (!response.ok) throw new Error(`Apple ${response.status}`);
  return response.json();
}

async function fromAppleId(link) {
  const id = link.match(/id(\d+)/)?.[1];
  if (!id) return null;
  const payload = await appleApi(`https://itunes.apple.com/lookup?id=${id}&entity=podcast`);
  const item = payload?.results?.[0];
  if (!item?.artworkUrl600 && !item?.artworkUrl100) return null;
  return { url: big(item.artworkUrl600 || item.artworkUrl100), via: `Apple id${id}`, match: item.collectionName };
}

async function fromAppleSearch(podcast, country) {
  const term = encodeURIComponent(podcast.nombre);
  const payload = await appleApi(
    `https://itunes.apple.com/search?term=${term}&entity=podcast&country=${country}&limit=10`
  );
  const results = payload?.results || [];
  const hit = results.find(r => isConfidentMatch(podcast.nombre, r.collectionName || r.trackName));
  if (!hit) return null;
  const art = hit.artworkUrl600 || hit.artworkUrl100;
  if (!art) return null;
  return { url: big(art), via: `Apple búsqueda ${country}`, match: hit.collectionName || hit.trackName };
}

function metaContent(html, key) {
  const tag = html.match(new RegExp(`<meta[^>]*(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`, "i"))?.[0];
  if (!tag) return "";
  const content = tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];
  return content ? content.replace(/&amp;/g, "&") : "";
}

async function fromPage(link) {
  const response = await request(link, {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  });
  if (!response.ok) return { error: `página ${response.status}` };
  const html = await response.text();
  const art = metaContent(html, "og:image") || metaContent(html, "twitter:image");
  if (!art) return { error: "la página no publica portada" };
  return { url: art.startsWith("//") ? "https:" + art : art, via: "og:image", match: "" };
}

async function resolve(podcast) {
  const notes = [];
  try {
    if (podcast.plataforma === "apple") {
      const found = await fromAppleId(podcast.enlace);
      if (found) return found;
      notes.push("Apple no devuelve ficha");
    } else {
      for (const country of ["ES", "US"]) {
        const found = await fromAppleSearch(podcast, country);
        if (found) return found;
      }
      notes.push("sin coincidencia fiable en Apple");
    }
  } catch (error) {
    notes.push(error.message || "fallo consultando Apple");
  }

  try {
    const page = await fromPage(podcast.enlace);
    if (page.url) return page;
    notes.push(page.error);
  } catch (error) {
    notes.push(error?.name === "TimeoutError" ? "la página tardó demasiado" : "no se pudo abrir la página");
  }

  return { error: notes.join("; ") };
}

const MAGIC = [
  { ext: ".jpg", bytes: [0xff, 0xd8, 0xff] },
  { ext: ".png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: ".webp", bytes: [0x52, 0x49, 0x46, 0x46] }
];

function imageExtension(buffer) {
  return MAGIC.find(m => m.bytes.every((b, i) => buffer[i] === b))?.ext || "";
}

let sipsReady = null;
async function hasSips() {
  if (sipsReady === null) {
    try { await run("sips", ["--version"]); sipsReady = true; }
    catch { sipsReady = false; }
  }
  return sipsReady;
}

async function download(podcast, found) {
  const response = await request(found.url, { Accept: "image/avif,image/webp,image/*,*/*;q=0.8" });
  if (!response.ok) return { error: `descarga ${response.status}` };

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1024) return { error: "imagen demasiado pequeña" };

  const extension = imageExtension(buffer);
  if (!extension) return { error: "el archivo no es una imagen" };

  let filename = `${podcast.id}${extension}`;
  const original = path.join(coversDir, filename);
  await fs.writeFile(original, buffer);

  if (await hasSips()) {
    const jpeg = path.join(coversDir, `${podcast.id}.jpg`);
    try {
      await run("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", "-Z", "400", original, "--out", jpeg]);
      if (original !== jpeg) await fs.rm(original, { force: true });
      filename = `${podcast.id}.jpg`;
    } catch { /* se queda el original */ }
  }

  return { portada: `./assets/covers/${filename}`, origen: found.url, via: found.via, match: found.match };
}

async function pool(items, size, worker) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  }));
}

// ---------------------------------------------------------------- ejecución

const pending = data.podcasts.filter(p => force || !p.portada);
console.log(`\nPortadas por buscar: ${pending.length} de ${data.podcasts.length}`);
console.log(`Tarda unos ${Math.ceil(pending.length * APPLE_PAUSE_MS / 60000)} minutos: Apple limita el ritmo de consultas.\n`);

const resolved = [];
const failures = [];

for (const [index, podcast] of pending.entries()) {
  const found = await resolve(podcast);
  const position = String(index + 1).padStart(2, " ");
  if (found.url) {
    resolved.push([podcast, found]);
    console.log(`${position}/${pending.length}  encontrada   ${podcast.nombre}${verbose ? `   [${found.via}${found.match ? " -> " + found.match : ""}]` : ""}`);
  } else {
    failures.push([podcast, found.error]);
    console.log(`${position}/${pending.length}  NO           ${podcast.nombre}   (${found.error})`);
  }
}

console.log(`\nDescargando ${resolved.length} imágenes...`);
let saved = 0;
await pool(resolved, DOWNLOAD_CONCURRENCY, async ([podcast, found]) => {
  const result = await download(podcast, found).catch(e => ({ error: e?.message || "fallo" }));
  if (result.error) {
    failures.push([podcast, result.error]);
    console.log(`  fallo al guardar  ${podcast.nombre}  (${result.error})`);
    return;
  }
  podcast.portada = result.portada;
  podcast.portadaOrigen = result.origen;
  podcast.portadaVerificada = true;
  saved++;
});

await fs.writeFile(jsonFile, JSON.stringify(data, null, 2) + "\n", "utf8");

console.log(`\n${"=".repeat(52)}`);
console.log(`Portadas guardadas: ${saved}`);
console.log(`Sin portada: ${data.podcasts.filter(p => !p.portada).length}`);
console.log(`Carpeta: ${coversDir}`);
if (failures.length) {
  console.log(`\nSe quedan con el cuadro de iniciales:`);
  for (const [podcast, reason] of failures) console.log(`  · ${podcast.nombre} — ${reason}`);
}
if (saved) console.log(`\nSube CACHE_VERSION en sw.js antes de publicar.`);
console.log("");
