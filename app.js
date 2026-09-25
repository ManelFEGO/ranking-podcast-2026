const DATA_URL = "./data/podcasts.json";
const FAVORITES_KEY = "ranking-podcast-2026:favorites";
const OPEN_KEY = "ranking-podcast-2026:abiertas";

const sectionsHost = document.querySelector("#sections");
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
const topToggle = document.querySelector("#topToggle");
const expandAll = document.querySelector("#expandAll");
const collapseAll = document.querySelector("#collapseAll");
const siteHeader = document.querySelector("#siteHeader");
const offlineStatus = document.querySelector("#offlineStatus");

const PLATFORM_LABELS = {
  spotify: "Spotify",
  apple: "Apple Podcasts",
  ivoox: "iVoox",
  castbox: "Castbox",
  web: "Web"
};

const FAVORITOS = "Favoritos";

let podcasts = [];
let categorias = [];
let favorites = loadSet(FAVORITES_KEY);
let abiertas = loadSet(OPEN_KEY);

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function loadSet(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify([...value]));
  } catch {
    /* almacenamiento bloqueado: se pierde al cerrar, nada más */
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

// Color estable por categoría: el mismo nombre da siempre el mismo tono.
function hashOf(text) {
  let hash = 0;
  const source = normalize(text);
  for (let i = 0; i < source.length; i++) hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

// Portada de reserva: SVG generado aquí mismo, sin pedir nada al servidor.
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

  const hue = hashOf(podcast.nombre) % 360;
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

  const cover = document.createElement("img");
  cover.className = "cover";
  cover.width = 88;
  cover.height = 88;
  cover.decoding = "async";
  cover.loading = index < 6 ? "eager" : "lazy";
  cover.alt = "";
  cover.setAttribute("aria-hidden", "true");
  cover.src = podcast.portada ? podcast.portada : fallbackSvg(podcast);
  if (podcast.portada) {
    cover.addEventListener("error", () => { cover.src = fallbackSvg(podcast); }, { once: true });
  }

  const main = document.createElement("div");
  main.className = "card-main";

  const meta = document.createElement("p");
  meta.className = "card-meta";

  if (podcast.ranking) {
    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = `Nº ${podcast.ranking}`;
    rank.title = `Puesto ${podcast.ranking} del Ranking Podcast 2026`;
    meta.append(rank);
  }

  const badge = document.createElement("span");
  badge.className = "platform";
  badge.textContent = platformLabel(podcast.plataforma);
  meta.append(badge);

  const title = document.createElement("h3");
  title.textContent = podcast.nombre;
  main.append(meta, title);

  if (podcast.autor) {
    const author = document.createElement("p");
    author.className = "author";
    author.textContent = podcast.autor;
    main.append(author);
  }

  // El enlace es el único destino. Su ::after cubre la tarjeta entera, así que
  // toda la tarjeta es pulsable pero solo hay un elemento enfocable.
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
    saveSet(FAVORITES_KEY, favorites);

    // Con el filtro de favoritos activo la tarjeta cambia de sección, así que
    // hay que repintar; si no, basta con actualizar el botón.
    if (onlyFavorites()) {
      render();
      return;
    }
    fav.setAttribute("aria-pressed", String(nowFav));
    fav.setAttribute("aria-label", favLabel(podcast, nowFav));
    fav.textContent = nowFav ? "★" : "☆";
  });

  card.append(cover, main, fav);
  return card;
}

function buildSection(nombre, lista, forzarAbierta) {
  const details = document.createElement("details");
  details.className = "section";
  details.dataset.categoria = nombre;
  details.open = forzarAbierta !== null ? forzarAbierta : abiertas.has(nombre);

  const summary = document.createElement("summary");
  summary.className = "section-head";

  const dot = document.createElement("span");
  dot.className = "dot";
  dot.style.background = nombre === FAVORITOS
    ? "hsl(45 90% 60%)"
    : `hsl(${hashOf(nombre) % 360} 70% 58%)`;
  dot.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "section-name";
  label.textContent = nombre;

  const count = document.createElement("span");
  count.className = "section-count";
  count.textContent = lista.length === 1 ? "1 podcast" : `${lista.length} podcasts`;

  const chevron = document.createElement("span");
  chevron.className = "chevron";
  chevron.setAttribute("aria-hidden", "true");

  summary.append(chevron, dot, label, count);

  const grid = document.createElement("div");
  grid.className = "podcast-grid";
  lista.forEach((podcast, index) => grid.append(buildCard(podcast, index)));

  details.append(summary, grid);
  details.addEventListener("toggle", () => {
    if (details.open) abiertas.add(nombre);
    else abiertas.delete(nombre);
    saveSet(OPEN_KEY, abiertas);
  });

  return details;
}

const onlyFavorites = () => favoritesToggle.getAttribute("aria-pressed") === "true";
const onlyTop = () => topToggle.getAttribute("aria-pressed") === "true";
const hasQuery = () => searchInput.value.trim().length > 0;

function getFiltered() {
  const q = normalize(searchInput.value);
  const platform = platformFilter.value;

  return podcasts.filter(p => {
    const matchesSearch = !q || normalize(`${p.nombre} ${p.autor} ${p.categoria}`).includes(q);
    const matchesPlatform = platform === "all" || p.plataforma === platform;
    const matchesFavorite = !onlyFavorites() || favorites.has(p.id);
    const matchesTop = !onlyTop() || Boolean(p.ranking);
    return matchesSearch && matchesPlatform && matchesFavorite && matchesTop;
  });
}

function render() {
  const filtered = getFiltered();
  const total = podcasts.length;
  totalCount.textContent = String(total);
  clearSearch.hidden = searchInput.value.length === 0;

  // Mientras se busca, las secciones se abren solas para no esconder resultados.
  const forzarAbierta = hasQuery() || onlyFavorites() ? true : null;

  const porCategoria = new Map();
  for (const podcast of filtered) {
    const clave = onlyFavorites() ? FAVORITOS : (podcast.categoria || "Otros");
    if (!porCategoria.has(clave)) porCategoria.set(clave, []);
    porCategoria.get(clave).push(podcast);
  }

  const orden = onlyFavorites()
    ? [FAVORITOS]
    : [...categorias, ...[...porCategoria.keys()].filter(c => !categorias.includes(c)).sort()];

  const fragment = document.createDocumentFragment();
  for (const nombre of orden) {
    const lista = porCategoria.get(nombre);
    if (lista && lista.length) fragment.append(buildSection(nombre, lista, forzarAbierta));
  }
  sectionsHost.replaceChildren(fragment);

  if (filtered.length) {
    emptyState.hidden = true;
    const secciones = porCategoria.size;
    const sufijo = onlyFavorites()
      ? ""
      : ` en ${secciones} ${secciones === 1 ? "categoría" : "categorías"}`;
    resultsMeta.textContent = `${filtered.length} de ${total}${sufijo}`;
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
  const orden = ["spotify", "apple", "ivoox", "castbox", "web"];
  const presentes = [...new Set(podcasts.map(p => p.plataforma))]
    .sort((a, b) => orden.indexOf(a) - orden.indexOf(b));
  platformFilter.replaceChildren(new Option("Todas las plataformas", "all"));
  for (const plataforma of presentes) {
    const cuantos = podcasts.filter(p => p.plataforma === plataforma).length;
    platformFilter.add(new Option(`${platformLabel(plataforma)} (${cuantos})`, plataforma));
  }
}

function setAllSections(open) {
  abiertas = open ? new Set(categorias) : new Set();
  saveSet(OPEN_KEY, abiertas);
  for (const details of sectionsHost.querySelectorAll("details.section")) details.open = open;
}

function reset() {
  searchInput.value = "";
  platformFilter.value = "all";
  favoritesToggle.setAttribute("aria-pressed", "false");
  topToggle.setAttribute("aria-pressed", "false");
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
    categorias = Array.isArray(data.categorias) && data.categorias.length
      ? data.categorias
      : [...new Set(podcasts.map(p => p.categoria).filter(Boolean))].sort();

    // La primera visita abre la primera sección para que no se vea todo cerrado.
    if (!abiertas.size && categorias.length) {
      abiertas = new Set([categorias[0]]);
      saveSet(OPEN_KEY, abiertas);
    }

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
topToggle.addEventListener("click", () => {
  topToggle.setAttribute("aria-pressed", String(!onlyTop()));
  render();
});
expandAll.addEventListener("click", () => setAllSections(true));
collapseAll.addEventListener("click", () => setAllSections(false));
resetFilters.addEventListener("click", reset);
window.addEventListener("scroll", () => {
  siteHeader.classList.toggle("compact", window.scrollY > 14);
}, { passive: true });

init();
