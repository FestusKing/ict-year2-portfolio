// ===========================================
// script.js
// Lädt die Portfolio-Einträge aus data/entries.json (wird von build.js erzeugt),
// baut die Übersichtsliste und zeigt bei Klick den vollen Eintrag an.
//
// Direkt-Links: jeder Eintrag hat eine eigene Adresse, z.B.
//   .../#/eintrag/portfolio-entry-2
// ===========================================

// ---- Konfiguration ----
const ENTRIES_URL = "data/entries.json";
const ABOUT_URL = "data/about.json";

// ---- Referenzen auf die wichtigen HTML-Elemente ----
const introSection = document.getElementById("intro");
const listSection = document.getElementById("entry-list");
const detailSection = document.getElementById("entry-detail");
const detailContent = document.getElementById("entry-detail-content");
const backButton = document.getElementById("back-button");

// Hier landen die geladenen Einträge (am Anfang leer)
let portfolioEntries = [];

// ---- Markdown-Einstellungen ----
// breaks: true  -> ein einfacher Zeilenumbruch bleibt ein Zeilenumbruch.
//                  Sonst würden untereinander getippte Zeilen zu einem Block
//                  zusammenfliessen, was man beim Schreiben nicht erwartet.
// gfm: true     -> GitHub-Markdown (Listen, Tabellen, durchgestrichen ...)
if (window.marked) {
  marked.setOptions({ breaks: true, gfm: true });
}

// ---------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------

// Macht Text sicher für innerHTML (aus "<b>" wird "&lt;b&gt;").
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

// Wandelt Markdown in HTML um. Fällt auf einfache Absätze zurück,
// falls marked.min.js einmal nicht geladen werden konnte.
function renderMarkdown(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return "<p><em>Für diesen Eintrag ist noch kein Text erfasst.</em></p>";
  if (window.marked) return marked.parse(raw);
  return raw
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

// Zeigt eine Fehlermeldung in der Übersicht an.
function showError(message) {
  listSection.innerHTML = `<p class="message message-error">${escapeHtml(message)}</p>`;
}

// ---------------------------------------------------------------
// 1. Daten laden
// ---------------------------------------------------------------

async function loadEntries() {
  listSection.innerHTML = `<p class="message">Lade Einträge…</p>`;

  try {
    const response = await fetch(ENTRIES_URL, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`Server antwortete mit Status ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("data/entries.json enthält keine Liste von Einträgen");
    }

    // build.js sortiert bereits (neueste zuerst) und ergänzt den slug.
    portfolioEntries = data;

    renderEntryList();
    handleRoute(); // falls die Seite direkt mit #/eintrag/... geöffnet wurde
  } catch (error) {
    showError(`Einträge konnten nicht geladen werden (${error.message}).`);
    console.error("Fehler beim Laden der Einträge:", error);
  }
}

// Kurz-Vorstellung oben auf der Seite. Fehlt die Datei, bleibt der
// Bereich einfach leer -- die Einträge sollen trotzdem funktionieren.
async function loadAbout() {
  try {
    const response = await fetch(ABOUT_URL, { cache: "no-cache" });
    if (!response.ok) return;

    const about = await response.json();
    const facts = [about.role, about.school, about.company].filter(Boolean);

    introSection.innerHTML = `
      <h2 class="intro-name">${escapeHtml(about.name || "")}</h2>
      ${facts.length ? `<p class="intro-facts">${facts.map(escapeHtml).join(" · ")}</p>` : ""}
      <div class="intro-text markdown-body">${renderMarkdown(about.intro)}</div>
    `;
    introSection.hidden = false;
  } catch (error) {
    console.warn("Kurz-Vorstellung konnte nicht geladen werden:", error);
  }
}

// ---------------------------------------------------------------
// 2. Übersichtsliste aufbauen
// ---------------------------------------------------------------

function renderEntryList() {
  listSection.innerHTML = "";

  if (portfolioEntries.length === 0) {
    listSection.innerHTML = `<p class="message">Noch keine Einträge vorhanden.</p>`;
    return;
  }

  portfolioEntries.forEach((entry, index) => {
    // Nummer formatieren: 1 -> "01", 2 -> "02", usw.
    const number = String(index + 1).padStart(2, "0");

    // Als <a> statt <div>: Tastaturbedienung, Rechtsklick "Link kopieren"
    // und der Browser-Zurück-Knopf funktionieren damit von selbst.
    const card = document.createElement("a");
    card.className = "entry-card";
    card.href = `#/eintrag/${encodeURIComponent(entry.slug)}`;

    card.innerHTML = `
      <span class="entry-number">[${number}]</span>
      <span class="entry-card-body">
        <span class="entry-card-title">${escapeHtml(entry.title || "Ohne Titel")}</span>
        ${entry.teaser ? `<span class="entry-card-teaser">${escapeHtml(entry.teaser)}</span>` : ""}
      </span>
      <span class="entry-card-date">${escapeHtml(entry.date || "—")}</span>
    `;

    listSection.appendChild(card);
  });
}

// ---------------------------------------------------------------
// 3. Detailansicht
// ---------------------------------------------------------------

function showEntryDetail(entry) {
  const hasSources = Array.isArray(entry.sources) && entry.sources.length > 0;
  const sourcesHtml = hasSources
    ? `<ul>${entry.sources.map((source) => `<li>${escapeHtml(source)}</li>`).join("")}</ul>`
    : `<p>Keine externen Quellen verwendet.</p>`;

  const coverHtml = entry.cover
    ? `<img class="detail-cover" src="${escapeHtml(entry.cover)}" alt="Bild zum Eintrag: ${escapeHtml(entry.title || "")}">`
    : "";

  detailContent.innerHTML = `
    <h2 class="detail-title">${escapeHtml(entry.title || "Ohne Titel")}</h2>
    <div class="detail-date">${escapeHtml(entry.date || "Kein Datum angegeben")}</div>
    ${coverHtml}
    <div class="detail-body markdown-body">${renderMarkdown(entry.body)}</div>
    <div class="detail-sources">
      <strong>Quellen:</strong>
      ${sourcesHtml}
      <p class="detail-ai"><strong>KI-Einsatz:</strong> ${escapeHtml(entry.aiUsage || "Nicht angegeben.")}</p>
    </div>
  `;

  document.title = `${entry.title || "Eintrag"} — ICT Year 2 Portfolio`;

  introSection.classList.add("hidden");
  listSection.classList.add("hidden");
  detailSection.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showList() {
  document.title = "Andrej König — ICT Year 2 Portfolio";

  detailSection.classList.add("hidden");
  introSection.classList.remove("hidden");
  listSection.classList.remove("hidden");
}

// ---------------------------------------------------------------
// 4. Routing über die Adresszeile (#/eintrag/<slug>)
// ---------------------------------------------------------------

function handleRoute() {
  const match = location.hash.match(/^#\/eintrag\/(.+)$/);

  if (!match) {
    showList();
    return;
  }

  const slug = decodeURIComponent(match[1]);
  const entry = portfolioEntries.find((item) => item.slug === slug);

  if (entry) {
    showEntryDetail(entry);
  } else if (portfolioEntries.length > 0) {
    // Link zeigt auf einen Eintrag, den es nicht (mehr) gibt:
    // Liste normal zeigen und einen Hinweis darüber setzen.
    showList();
    renderEntryList();
    listSection.insertAdjacentHTML(
      "afterbegin",
      `<p class="message message-error">Der Eintrag "${escapeHtml(slug)}" wurde nicht gefunden.</p>`
    );
  }
  // Sind die Einträge noch nicht geladen, ruft loadEntries() handleRoute() erneut auf.
}

window.addEventListener("hashchange", handleRoute);

backButton.addEventListener("click", () => {
  location.hash = "#/";
});

// ---------------------------------------------------------------
// 5. Start
// ---------------------------------------------------------------

loadAbout();
loadEntries();
