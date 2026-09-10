#!/usr/bin/env node
// Descarga la portada real de cada podcast y actualiza data/podcasts.json.
//
//   node tools/fetch-covers.mjs            -> solo los que aún no tienen portada
//   node tools/fetch-covers.mjs --force    -> vuelve a descargarlas todas
//
// De dónde saca cada imagen:
//   Apple Podcasts -> API pública de iTunes (campo artworkUrl600)
//   Spotify, iVoox, Castbox y webs propias -> etiqueta og:image de la página
//
// Nada de esto pasa por lovable.app. Requiere Node 18+. Sin dependencias.
// En macOS reescala a 400x400 con `sips`, que ya viene instalado.

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const force = process.argv.includes("--force");

const CONCURRENCY = 5;
const TIMEOUT_MS = 20000;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
           "(KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const root = new URL("..", import.meta.url);
const jsonPath = new URL("data/podcasts.json", root);
const coversDir = new URL("assets/covers/", root);

const data = JSON.parse(await fs.readFile(jsonPath, "utf8"));
await fs.mkdir(coversDir, { recursive: true });

const get = (url, accept) => fetch(url, {
  redirect: "follow",
  headers: { "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9", ...(accept ? { Accept: accept } : {}) },
  signal: AbortSignal.timeout(TIMEOUT_MS)
});

function metaContent(html, property) {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*>`, "i"
  );
  const tag = html.match(pattern)?.[0];
  if (!tag) return "";
  const content = tag.match(/content=["']([^"']+)["']/i)?.[1];
  return content ? content.replace(/&amp;/g, "&") : "";
}

async function appleArtwork(link) {
  const id = link.match(/id(\d+)/)?.[1];
  if (!id) return "";
  const response = await get(`https://itunes.apple.com/lookup?id=${id}&entity=podcast`);
  if (!response.ok) return "";
  const payload = await response.json();
  const item = payload?.results?.[0];
  const art = item?.artworkUrl600 || item?.artworkUrl100 || "";
  return art.replace(/\/\d+x\d+bb\.jpg$/, "/600x600bb.jpg");
}

async function pageArtwork(link) {
  const response = await get(link, "text/html,application/xhtml+xml");
  if (!response.ok) return "";
  const html = await response.text();
  return metaContent(html, "og:image")
      || metaContent(html, "twitter:image")
      || "";
}

async function resolveArtwork(podcast) {
  if (podcast.plataforma === "apple") {
    const art = await appleArtwork(podcast.enlace);
    if (art) return art;
  }
  return pageArtwork(podcast.enlace);
}

const EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif"
};

let sipsAvailable = null;
async function hasSips() {
  if (sipsAvailable !== null) return sipsAvailable;
  try {
    await run("sips", ["--version"]);
    sipsAvailable = true;
  } catch {
    sipsAvailable = false;
  }
  return sipsAvailable;
}

async function download(podcast) {
  const artwork = await resolveArtwork(podcast);
  if (!artwork) return { status: "sin-imagen" };

  const response = await get(artwork);
  if (!response.ok) return { status: `http-${response.status}` };

  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const extension = EXTENSIONS[type];
  if (!extension) return { status: `tipo-no-valido:${type || "desconocido"}` };

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024) return { status: "imagen-vacia" };

  let filename = `${podcast.id}${extension}`;
  let filePath = path.join(coversDir.pathname, filename);
  await fs.writeFile(filePath, bytes);

  // Normaliza a JPEG de 400x400 si `sips` está disponible (macOS).
  if (await hasSips()) {
    const jpegPath = path.join(coversDir.pathname, `${podcast.id}.jpg`);
    try {
      await run("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", "-Z", "400", filePath, "--out", jpegPath]);
      if (filePath !== jpegPath) await fs.rm(filePath, { force: true });
      filename = `${podcast.id}.jpg`;
    } catch {
      /* se queda el original sin reescalar */
    }
  }

  return { status: "ok", portada: `./assets/covers/${filename}`, origen: artwork };
}

async function runPool(items, size, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]);
      }
    })
  );
  return results;
}

const pending = data.podcasts.filter(p => force || !p.portada);
console.log(`Portadas por descargar: ${pending.length} de ${data.podcasts.length}\n`);

const outcomes = await runPool(pending, CONCURRENCY, async podcast => {
  try {
    const result = await download(podcast);
    if (result.status === "ok") {
      podcast.portada = result.portada;
      podcast.portadaOrigen = result.origen;
      podcast.portadaVerificada = true;
      console.log(`  ok      ${podcast.nombre}`);
    } else {
      console.log(`  ${result.status.padEnd(7)} ${podcast.nombre}`);
    }
    return result.status;
  } catch (error) {
    console.log(`  error   ${podcast.nombre} (${error?.name || "fallo"})`);
    return "error";
  }
});

await fs.writeFile(jsonPath, JSON.stringify(data, null, 2) + "\n", "utf8");

const ok = outcomes.filter(s => s === "ok").length;
console.log(`\nDescargadas ${ok}. Sin portada ${pending.length - ok}.`);
console.log("data/podcasts.json actualizado con portada, portadaOrigen y portadaVerificada.");
if (ok) console.log("Acuérdate de subir CACHE_VERSION en sw.js antes de publicar.");
