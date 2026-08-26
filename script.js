// ===========================================
// script.js
// Lädt Portfolio-Einträge dynamisch aus data/entries/*.json (via GitHub API),
// baut die Übersichtsliste und zeigt bei Klick den vollen Eintrag an.
// ===========================================

// GitHub API URL, die den Inhalt des Ordners data/entries/ zurückgibt
// (Liste aller Dateien mit Namen + Download-Link)
const GITHUB_API_URL =
  "https://api.github.com/repos/FestusKing/ict-year2-portfolio/contents/data/entries";

// Referenzen auf die wichtigen HTML-Elemente holen
const listSection = document.getElementById("entry-list");
const detailSection = document.getElementById("entry-detail");
const detailContent = document.getElementById("entry-detail-content");
const backButton = document.getElementById("back-button");

// Hier landen die geladenen Einträge (am Anfang leer)
let portfolioEntries = [];

// ---- 0. Einträge von GitHub laden ----
async function loadEntries() {
  listSection.innerHTML = `<p style="color:var(--text-muted)">Lade Einträge…</p>`;

  try {
    // Schritt 1: Liste aller Dateien im Ordner data/entries/ holen
    const listResponse = await fetch(GITHUB_API_URL);
    if (!listResponse.ok) {
      throw new Error(`GitHub API antwortete mit Status ${listResponse.status}`);
    }
    const files = await listResponse.json();

    // Schritt 2: Nur .json Dateien behalten (falls z.B. ein Screenshot im Ordner landet)
    const jsonFiles = files.filter((file) => file.name.endsWith(".json"));

    // Schritt 3: Jede Datei einzeln herunterladen und als JSON parsen
    // Promise.all lädt alle gleichzeitig statt nacheinander (schneller)
    portfolioEntries = await Promise.all(
      jsonFiles.map((file) => fetch(file.download_url).then((res) => res.json()))
    );

    // Schritt 4: Neueste zuerst anzeigen
    portfolioEntries.sort((a, b) => parseGermanDate(b.date) - parseGermanDate(a.date));

    // Schritt 5: Liste anzeigen
    renderEntryList();
  } catch (error) {
    // Falls z.B. das GitHub API Rate Limit erreicht ist oder keine Internetverbindung besteht
    listSection.innerHTML = `<p style="color:var(--accent)">Einträge konnten nicht geladen werden (${error.message}).</p>`;
    console.error("Fehler beim Laden der Einträge:", error);
  }
}

// Wandelt "18.08.2026" (TT.MM.JJJJ) in ein echtes Date-Objekt um, zum Sortieren
function parseGermanDate(dateStr) {
  const [day, month, year] = dateStr.split(".");
  return new Date(`${year}-${month}-${day}`);
}

// ---- 1. Übersichtsliste aufbauen ----
function renderEntryList() {
  listSection.innerHTML = ""; // vorherigen Inhalt leeren

  if (portfolioEntries.length === 0) {
    listSection.innerHTML = `<p style="color:var(--text-muted)">Noch keine Einträge vorhanden.</p>`;
    return;
  }

  portfolioEntries.forEach((entry, index) => {
    // Nummer formatieren: 1 -> "01", 2 -> "02", usw.
    const number = String(index + 1).padStart(2, "0");

    // Karte (Card) für diesen Eintrag erstellen
    const card = document.createElement("div");
    card.className = "entry-card";
    card.tabIndex = 0; // per Tastatur erreichbar (Barrierefreiheit)
    card.setAttribute("role", "button");

    card.innerHTML = `
      <span class="entry-number">[${number}]</span>
      <div class="entry-card-body">
        <div class="entry-card-title">${entry.title}</div>
        <div class="entry-card-teaser">${entry.teaser}</div>
      </div>
      <span class="entry-card-date">${entry.date}</span>
    `;

    // Klick -> Detailansicht öffnen
    card.addEventListener("click", () => showEntryDetail(entry));
    // Auch mit Enter-Taste öffnen können
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") showEntryDetail(entry);
    });

    listSection.appendChild(card);
  });
}

// ---- 2. Detailansicht für einen Eintrag anzeigen ----
function showEntryDetail(entry) {
  // WICHTIG: body kommt aus dem CMS als EIN String mit Leerzeilen zwischen Absätzen
  // (z.B. "Erster Absatz.\n\nZweiter Absatz."), nicht als Array.
  // Deshalb hier zuerst bei Leerzeilen aufsplitten:
  const paragraphs = entry.body.split(/\n\s*\n/);
  const bodyHtml = paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("");

  // Quellen-Liste bauen (falls vorhanden)
  const sourcesHtml =
    entry.sources && entry.sources.length
      ? `<ul>${entry.sources.map((s) => `<li>${s}</li>`).join("")}</ul>`
      : `<p>Keine externen Quellen verwendet.</p>`;

  detailContent.innerHTML = `
    <h2 class="detail-title">${entry.title}</h2>
    <div class="detail-date">${entry.date}</div>
    <div class="detail-body">${bodyHtml}</div>
    <div class="detail-sources">
      <strong>Quellen:</strong>
      ${sourcesHtml}
      <p style="margin-top:10px;"><strong>KI-Einsatz:</strong> ${entry.aiUsage || "Nicht angegeben."}</p>
    </div>
  `;

  // Übersicht ausblenden, Detail einblenden
  listSection.classList.add("hidden");
  detailSection.classList.remove("hidden");

  // Nach oben scrollen, damit man den Titel sofort sieht
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---- 3. Zurück-Button ----
backButton.addEventListener("click", () => {
  detailSection.classList.add("hidden");
  listSection.classList.remove("hidden");
});

// ---- 4. Beim Laden der Seite: Einträge von GitHub holen ----
loadEntries();
