const STORAGE_KEY = "backlogMaldito.games";

const statuses = [
  "🎮 Lo quiero jugar",
  "🔥 Esperando oferta",
  "💀 Terror / oscuro",
  "🕹️ Indie pendiente",
  "⏳ Esperando lanzamiento",
  "✅ Jugado",
  "⭐ Recomendado",
  "❌ Descartado"
];

const platforms = ["PC", "PS5", "Xbox", "Switch", "Switch 2", "Steam Deck"];

const state = {
  games: [],
  selectedPlatforms: new Set(["PC"])
};

const el = {
  tabs: [...document.querySelectorAll(".tab")],
  panels: {
    radar: document.getElementById("radar-panel"),
    backlog: document.getElementById("backlog-panel")
  },
  title: document.getElementById("game-title"),
  url: document.getElementById("game-url"),
  status: document.getElementById("game-status"),
  filterStatus: document.getElementById("filter-status"),
  note: document.getElementById("game-note"),
  interest: document.getElementById("game-interest"),
  interestValue: document.getElementById("interest-value"),
  platformOptions: document.getElementById("platform-options"),
  save: document.getElementById("save-game"),
  generate: document.getElementById("generate-copy"),
  copy: document.getElementById("copy-text"),
  generated: document.getElementById("generated-copy"),
  search: document.getElementById("search-input"),
  list: document.getElementById("backlog-list")
};

init();

async function init() {
  renderStatusOptions();
  renderPlatforms();
  bindEvents();
  await detectCurrentTab();
  await loadGames();
  renderBacklog();
  updateInterestLabel();
}

function renderStatusOptions() {
  statuses.forEach((status) => {
    el.status.add(new Option(status, status));
    el.filterStatus.add(new Option(status, status));
  });
  el.filterStatus.add(new Option("Todos", "ALL"), 0);
}

function renderPlatforms() {
  el.platformOptions.innerHTML = "";
  platforms.forEach((platform) => {
    const label = document.createElement("label");
    label.className = "chip";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selectedPlatforms.has(platform);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selectedPlatforms.add(platform);
      else state.selectedPlatforms.delete(platform);
    });
    label.append(checkbox, document.createTextNode(platform));
    el.platformOptions.appendChild(label);
  });
}

function bindEvents() {
  el.tabs.forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
  el.interest.addEventListener("input", updateInterestLabel);
  el.save.addEventListener("click", onSaveGame);
  el.generate.addEventListener("click", onGenerateCopy);
  el.copy.addEventListener("click", onCopyText);
  el.search.addEventListener("input", renderBacklog);
  el.filterStatus.addEventListener("change", renderBacklog);
}

function switchTab(tabId) {
  el.tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === tabId);
    tab.setAttribute("aria-selected", String(tab.dataset.tab === tabId));
  });
  Object.entries(el.panels).forEach(([id, panel]) => panel.classList.toggle("active", id === tabId));
}

async function detectCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const extracted = await extractGameDataFromPage(tab.id);
  el.title.value = extracted.title || sanitizeTitle(tab.title || "");
  el.url.value = tab.url || "";

  if (extracted.platforms.length) {
    state.selectedPlatforms = new Set(extracted.platforms);
    renderPlatforms();
  }

  if (extracted.note) {
    el.note.value = extracted.note;
  }
}

async function extractGameDataFromPage(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const fromMeta = document.querySelector('meta[property="og:title"]')?.content || "";
        const h1 = document.querySelector("h1")?.textContent?.trim() || "";
        const title = fromMeta || h1 || document.title || "";

        const bodyText = document.body?.innerText?.slice(0, 6000) || "";
        const lower = bodyText.toLowerCase();
        const platformMap = [
          ["ps5", "PS5"],
          ["playstation 5", "PS5"],
          ["xbox", "Xbox"],
          ["switch 2", "Switch 2"],
          ["nintendo switch", "Switch"],
          ["switch", "Switch"],
          ["steam deck", "Steam Deck"],
          ["pc", "PC"],
          ["windows", "PC"]
        ];

        const detectedPlatforms = platformMap
          .filter(([needle]) => lower.includes(needle))
          .map(([, platform]) => platform)
          .filter((platform, index, self) => self.indexOf(platform) === index);

        const demo = lower.includes("demo") || lower.includes("probar gratis") ? "Demo disponible detectada." : "";
        return {
          title: title.replace(/\s*\|.*$/, "").replace(/\s*-\s*Steam.*$/i, "").trim(),
          platforms: detectedPlatforms,
          note: demo
        };
      }
    });
    return result.result;
  } catch {
    return { title: "", platforms: [], note: "" };
  }
}

function sanitizeTitle(title) {
  return title.replace(/\s*\|.*$/, "").replace(/\s*-\s*Steam.*$/i, "").trim();
}

function updateInterestLabel() {
  const value = Number(el.interest.value);
  el.interestValue.textContent = "★".repeat(value) + "☆".repeat(5 - value);
}

async function loadGames() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  state.games = data[STORAGE_KEY] || [];
}

async function saveGames() {
  await chrome.storage.local.set({ [STORAGE_KEY]: state.games });
}

async function onSaveGame() {
  const game = {
    id: crypto.randomUUID(),
    title: el.title.value.trim(),
    url: el.url.value.trim(),
    status: el.status.value,
    note: el.note.value.trim(),
    interest: Number(el.interest.value),
    platforms: [...state.selectedPlatforms],
    createdAt: new Date().toISOString()
  };

  if (!game.title) {
    el.generated.value = "Ponle nombre al juego antes de guardarlo.";
    return;
  }

  const existingIdx = state.games.findIndex((g) => normalizeKey(g.title) === normalizeKey(game.title));
  if (existingIdx >= 0) {
    const existing = state.games[existingIdx];
    state.games[existingIdx] = { ...existing, ...game, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
    el.generated.value = `Actualizado: ${game.title}`;
  } else {
    state.games.unshift(game);
  
  }
  await saveGames();
  renderBacklog();

}

function onGenerateCopy() {
  const title = el.title.value.trim() || "Este juego";
  const status = el.status.value;
  const note = el.note.value.trim();
  const text = `${title} acaba de entrar en mi #BacklogMaldito. Estado: ${status}. ${note || "Pinta brutal para quien busca algo diferente."} ¿Lo jugarías? #Videojuegos #GamingEspaña #JuegosIndie #TikTokGaming`;
  el.generated.value = text;
}

async function onCopyText() {
  try {
    await navigator.clipboard.writeText(el.generated.value.trim());
    el.generated.value = "Copy copiado al portapapeles.";
  } catch {
    el.generated.value = "No se pudo copiar automáticamente. Copia el texto manualmente.";
  }
}

function renderBacklog() {
  const query = el.search.value.toLowerCase().trim();
  const filter = el.filterStatus.value;

  const filtered = state.games.filter((game) => {
    const bySearch = !query || game.title.toLowerCase().includes(query);
    const byStatus = filter === "ALL" || game.status === filter;
    return bySearch && byStatus;
  });

  el.list.innerHTML = "";
  if (!filtered.length) {
    el.list.innerHTML = "<li class='backlog-item'><p>No hay juegos para este filtro.</p></li>";
    return;
  }

  filtered.forEach((game) => {
    const item = document.createElement("li");
    item.className = "backlog-item";
    item.innerHTML = `
      <h3>${escapeHtml(game.title)}</h3>
      <p><strong>Estado:</strong> ${escapeHtml(game.status)}</p>
      <p><strong>Plataformas:</strong> ${escapeHtml(game.platforms.join(" / "))}</p>
      <p><strong>Interés:</strong> ${"★".repeat(game.interest)}${"☆".repeat(5 - game.interest)}</p>
      <p><strong>Nota:</strong> ${escapeHtml(game.note || "Sin nota")}</p>
      <div class="row-actions">
        <button data-action="edit" data-id="${game.id}">Editar</button>
        <button data-action="delete" data-id="${game.id}">Eliminar</button>
      </div>
    `;
    el.list.appendChild(item);
  });
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


el.list.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.getAttribute("data-action");
  const id = target.getAttribute("data-id");
  if (!action || !id) return;

  const idx = state.games.findIndex((g) => g.id === id);
  if (idx === -1) return;

  if (action === "delete") {
    state.games.splice(idx, 1);
    await saveGames();
    renderBacklog();
    el.generated.value = "Juego eliminado del backlog.";
    return;
  }

  if (action === "edit") {
    const game = state.games[idx];
    switchTab("radar");
    el.title.value = game.title;
    el.url.value = game.url;
    el.status.value = game.status;
    el.note.value = game.note;
    el.interest.value = String(game.interest || 3);
    updateInterestLabel();
    state.selectedPlatforms = new Set(game.platforms || []);
    renderPlatforms();
    state.games.splice(idx, 1);
    await saveGames();
    renderBacklog();
    el.generated.value = "Editando juego: guarda para actualizarlo.";
  }
});

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}
