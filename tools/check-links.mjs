#!/usr/bin/env node
// Verifica los enlaces de data/podcasts.json.
//   node tools/check-links.mjs                 -> tabla en pantalla
//   node tools/check-links.mjs > enlaces.md    -> guarda la tabla
// Requiere Node 18 o superior. Sin dependencias.

import fs from "node:fs/promises";

const CONCURRENCY = 8;
const TIMEOUT_MS = 12000;

// Spotify, Apple y varios CDN devuelven 403 a agentes que no parecen un navegador.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
           "(KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const HEADERS = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
};

const jsonPath = new URL("../data/podcasts.json", import.meta.url);
const { podcasts = [] } = JSON.parse(await fs.readFile(jsonPath, "utf8"));

async function request(url, method) {
  const response = await fetch(url, {
    method,
    redirect: "follow",
    headers: HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  return { code: response.status, finalUrl: response.url || url };
}

async function check(url) {
  try {
    const head = await request(url, "HEAD");
    // Muchos servidores no implementan bien HEAD: se reintenta con GET.
    if (head.code === 405 || head.code === 403 || head.code >= 500) {
      try {
        return await request(url, "GET");
      } catch {
        return head;
      }
    }
    return head;
  } catch {
    try {
      return await request(url, "GET");
    } catch (error) {
      return { code: "ERR", finalUrl: "", note: error?.name || "fallo de red" };
    }
  }
}

async function runPool(items, size, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

const clean = value => String(value).replace(/\s+/g, " ").replace(/\|/g, "/").trim();

const results = await runPool(podcasts, CONCURRENCY, async podcast => ({
  podcast,
  ...(await check(podcast.enlace))
}));

console.log("| nombre | URL | código | URL final |");
console.log("| --- | --- | --- | --- |");
for (const { podcast, code, finalUrl } of results) {
  const moved = finalUrl && finalUrl.replace(/\/$/, "") !== podcast.enlace.replace(/\/$/, "") ? finalUrl : "";
  console.log(`| ${clean(podcast.nombre)} | ${podcast.enlace} | ${code} | ${moved} |`);
}

const ok = results.filter(r => typeof r.code === "number" && r.code >= 200 && r.code < 400);
const failed = results.filter(r => !ok.includes(r));

console.log(`\nComprobados ${results.length}. Correctos ${ok.length}. Con problema ${failed.length}.`);
if (failed.length) {
  console.log("\nRevisar a mano:");
  for (const { podcast, code, note } of failed) {
    console.log(`  ${code}${note ? ` (${note})` : ""} — ${clean(podcast.nombre)} — ${podcast.enlace}`);
  }
  console.log("\nUn 403 casi siempre es un antibot, no un enlace roto: ábrelo en el navegador antes de tocarlo.");
}

process.exit(failed.length ? 1 : 0);
