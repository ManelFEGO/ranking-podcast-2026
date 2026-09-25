#!/usr/bin/env node
// Vuelve a enlazar las portadas que ya tienes descargadas en assets/covers/.
//
//   node tools/enlazar-portadas.mjs
//
// Para qué sirve: al sustituir data/podcasts.json por una versión nueva, el
// archivo llega con el campo "portada" vacío, aunque las imágenes sigan en su
// carpeta. Este script mira qué hay realmente en assets/covers/ y rellena la
// ruta de cada podcast que tenga su imagen ahí. No descarga nada ni borra nada.
//
// Requiere Node 18 o superior. Sin dependencias.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath decodifica los %20, así que las rutas con espacios funcionan.
const rootDir = fileURLToPath(new URL("..", import.meta.url));
const jsonFile = path.join(rootDir, "data", "podcasts.json");
const coversDir = path.join(rootDir, "assets", "covers");

const EXTENSIONES = [".jpg", ".jpeg", ".png", ".webp"];

const data = JSON.parse(await fs.readFile(jsonFile, "utf8"));

let archivos = [];
try {
  archivos = await fs.readdir(coversDir);
} catch {
  console.log("\nNo existe la carpeta assets/covers/. No hay nada que enlazar.\n");
  process.exit(0);
}

// Índice de lo que hay en disco: nombre sin extensión -> nombre de archivo.
const enDisco = new Map();
for (const archivo of archivos) {
  const extension = path.extname(archivo).toLowerCase();
  if (!EXTENSIONES.includes(extension)) continue;
  enDisco.set(path.basename(archivo, path.extname(archivo)), archivo);
}

let enlazadas = 0;
let yaTenian = 0;
const sinImagen = [];

for (const podcast of data.podcasts) {
  const archivo = enDisco.get(podcast.id);
  if (!archivo) {
    if (!podcast.portada) sinImagen.push(podcast.nombre);
    continue;
  }
  const ruta = `./assets/covers/${archivo}`;
  if (podcast.portada === ruta) {
    yaTenian++;
    continue;
  }
  podcast.portada = ruta;
  podcast.portadaVerificada = true;
  enlazadas++;
}

await fs.writeFile(jsonFile, JSON.stringify(data, null, 2) + "\n", "utf8");

const total = data.podcasts.length;
const conPortada = data.podcasts.filter(p => p.portada).length;

console.log(`\nImágenes encontradas en assets/covers/: ${enDisco.size}`);
console.log(`Portadas enlazadas ahora: ${enlazadas}`);
if (yaTenian) console.log(`Ya estaban enlazadas: ${yaTenian}`);
console.log(`Total con portada: ${conPortada} de ${total}`);

if (sinImagen.length) {
  console.log(`\nSin portada todavía (${sinImagen.length}):`);
  for (const nombre of sinImagen) console.log(`  · ${nombre}`);
  console.log(`\nPara intentar descargarlas:  node tools/fetch-covers.mjs`);
}
console.log("");
