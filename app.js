const DATA_URL = "./data/podcasts.json";
const FAVORITES_KEY = "ranking-podcast-2026:favorites";

const grid = document.querySelector("#podcastGrid");
const emptyState = document.querySelector("#emptyState");
const emptyTitle = document.querySelector("#emptyTitle");
const emptyText = document.querySelector("#emptyText");
const resetFilters = document.querySelector("#resetFilters");
const totalCount = document.querySelector("#totalCount");
const resultsMeta = document.querySelector("#resultsMeta");
const searchInput = document.querySelector("#searchInput");
const clearSearch = document.querySelector("#clearSearch");
const platformFilter = document.querySelector("#platformFilter");
const favoritesToggle = document.querySelector("#favoritesToggle");
const siteHeader = document.querySelector("#siteHeader");
const offlineStatus = document.querySelector("#offlineStatus");

const PLATFORM_LABELS = {
  spotify: "Spotify",
  apple: "Apple Podcasts",
  ivoox: "iVoox",
  castbox: "Castbox",
  web: "Web"
};

let podcasts = [];
let favorites = loadFavorites();

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function loadFavorites() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  } catch {
    /* almacenamiento lleno o bloqueado: los favoritos duran la sesión */
  }
}

function platformLabel(value) {
  const key = String(value || "web").toLowerCase();
  return PLATFORM_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

function platformForUrl(url) {
  const u = String(url).toLowerCase();
  if (u.includes("spotify.com")) return "spotify";
  if (u.includes("apple.com")) return "apple";
  if (u.includes("ivoox.com")) return "ivoox";
  if (u.includes("castbox.fm")) return "castbox";
  return "web";
}

// Portada de reserva: SVG generado en el cliente, sin peticiones de red.
const fallbackCache = new Map();
function fallbackSvg(podcast) {
  if (fallbackCache.has(podcast.id)) return fallbackCache.get(podcast.id);

  const initials =
    podcast.nombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word[0])
      .join("")
      .toUpperCase() || "P";

  let hash = 0;
  const source = normalize(podcast.nombre);
  for (let i = 0; i < source.length; i++) hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  const hue2 = (hue + 42) % 360;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop stop-color="hsl(${hue} 28% 20%)"/><stop offset="1" stop-color="hsl(${hue2} 34% 12%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="400" height="400" fill="url(#g)"/>` +
    `<circle cx="315" cy="80" r="105" fill="hsl(${hue} 30% 65%)" opacity=".12"/>` +
    `<text x="32" y="348" fill="#ffffff" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="124" font-weight="700">${initials}</text>` +
    `</svg>`;

  const url = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
  fallbackCache.set(podcast.id, url);
  return url;
}

function favLabel(podcast, isFav) {
  return isFav
    ? `Quitar ${podcast.nombre} de favoritos`
    : `Añadir ${podcast.nombre} a favoritos`;
}

function buildCard(podcast, index) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.id = podcast.id;

  const cover = document.createElement("img");
  cover.className = "cover";
  cover.width = 88;
  cover.height = 88;
  cover.decoding = "async";
  cover.loading = index < 6 ? "eager" : "lazy";
  cover.alt = "";                 // decorativa: el título ya está en el <h2>
  cover.setAttribute("aria-hidden", "true");
  // Sin portada local no se pide nada al servidor: se usa el SVG directamente.
  cover.src = podcast.portada ? podcast.portada : fallbackSvg(podcast);
  if (podcast.portada) {
    cover.addEventListener("error", () => { cover.src = fallbackSvg(podcast); }, { once: true });
  }

  const main = document.createElement("div");
  main.className = "card-main";

  const badge = document.createElement("span");
  badge.className = "platform";
  badge.textContent = platformLabel(podcast.plataforma);

  const title = document.createElement("h2");
  title.textContent = podcast.nombre;
  main.append(badge, title);

  if (podcast.autor) {
    const author = document.createElement("p");
    author.className = "author";
    author.textContent = podcast.autor;
    main.append(author);
  }

  // El enlace es el único destino: su ::after cubre la tarjeta entera,
  // así toda la tarjeta es pulsable con un solo elemento enfocable.
  const play = document.createElement("a");
  play.className = "play-btn";
  play.href = podcast.enlace;
  play.target = "_blank";
  play.rel = "noopener noreferrer";
  play.textContent = podcast.plataforma === "web"
    ? "Escuchar"
    : `Escuchar en ${platformLabel(podcast.plataforma)}`;
  main.append(play);

  const isFav = favorites.has(podcast.id);
  const fav = document.createElement("button");
  fav.type = "button";
  fav.className = "favorite-btn";
  fav.setAttribute("aria-pressed", String(isFav));
  fav.setAttribute("aria-label", favLabel(podcast, isFav));
  fav.textContent = isFav ? "★" : "☆";
  fav.addEventListener("click", () => {
    const nowFav = !favorites.has(podcast.id);
    if (nowFav) favorites.add(podcast.id);
    else favorites.delete(podcast.id);
    saveFavorites();

    if (onlyFavorites()) {
      render();                    // la tarjeta debe salir de la lista
      return;
    }
    fav.setAttribute("aria-pressed", String(nowFav));
    fav.setAttribute("aria-label", favLabel(podcast, nowFav));
    fav.textContent = nowFav ? "★" : "☆";
  });

  card.append(cover, main, fav);
  return card;
}

function onlyFavorites() {
  return favoritesToggle.getAttribute("aria-pressed") === "true";
}

function getFiltered() {
  const q = normalize(searchInput.value);
  const platform = platformFilter.value;
  const favsOnly = onlyFavorites();

  return podcasts.filter(p => {
    const matchesSearch = !q || normalize(`${p.nombre} ${p.autor}`).includes(q);
    const matchesPlatform = platform === "all" || p.plataforma === platform;
    const matchesFavorite = !favsOnly || favorites.has(p.id);
    return matchesSearch && matchesPlatform && matchesFavorite;
  });
}

function render() {
  const filtered = getFiltered();
  const total = podcasts.length;

  const fragment = document.createDocumentFragment();
  filtered.forEach((podcast, index) => fragment.append(buildCard(podcast, index)));
  grid.replaceChildren(fragment);

  totalCount.textContent = String(total);
  clearSearch.hidden = searchInput.value.length === 0;

  if (filtered.length) {
    emptyState.hidden = true;
    resultsMeta.textContent = `${filtered.length} de ${total}${onlyFavorites() ? ", solo favoritos" : ""}`;
    return;
  }

  emptyState.hidden = false;
  resultsMeta.textContent = total ? `0 de ${total}` : "";
  if (onlyFavorites() && !favorites.size) {
    emptyTitle.textContent = "Todavía no tienes favoritos";
    emptyText.textContent = "Marca la estrella de una tarjeta para guardarla aquí.";
  } else {
    emptyTitle.textContent = "No hay resultados";
    emptyText.textContent = "Prueba con otro término o quita los filtros activos.";
  }
}

function setupPlatforms() {
  const order = ["spotify", "apple", "ivoox", "castbox", "web"];
  const present = [...new Set(podcasts.map(p => p.plataforma))]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b));
  platformFilter.replaceChildren(new Option("Todas las plataformas", "all"));
  present.forEach(platform => {
    const count = podcasts.filter(p => p.plataforma === platform).length;
    platformFilter.add(new Option(`${platformLabel(platform)} (${count})`, platform));
  });
}

function reset() {
  searchInput.value = "";
  platformFilter.value = "all";
  favoritesToggle.setAttribute("aria-pressed", "false");
  render();
  searchInput.focus();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js", { scope: "./" })
    .then(() => { offlineStatus.textContent = "Disponible sin conexión"; })
    .catch(() => { offlineStatus.textContent = ""; });
}

async function init() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    podcasts = (Array.isArray(data.podcasts) ? data.podcasts : [])
      .map(p => ({ ...p, plataforma: p.plataforma || platformForUrl(p.enlace) }));
    setupPlatforms();
    render();
  } catch (error) {
    console.error(error);
    emptyState.hidden = false;
    emptyTitle.textContent = "No se pudo cargar el directorio";
    emptyText.textContent = "Falta data/podcasts.json o no se pudo leer. Recarga la página.";
    resetFilters.hidden = true;
  } finally {
    registerServiceWorker();
  }
}

searchInput.addEventListener("input", render);
clearSearch.addEventListener("click", () => { searchInput.value = ""; render(); searchInput.focus(); });
platformFilter.addEventListener("change", render);
favoritesToggle.addEventListener("click", () => {
  favoritesToggle.setAttribute("aria-pressed", String(!onlyFavorites()));
  render();
});
resetFilters.addEventListener("click", reset);
window.addEventListener("scroll", () => {
  siteHeader.classList.toggle("compact", window.scrollY > 14);
}, { passive: true });

init();
