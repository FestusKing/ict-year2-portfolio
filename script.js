// ===========================================
// script.js
// Baut die Übersichtsliste aus portfolioEntries (aus entries.js)
// und zeigt bei Klick den vollen Eintrag an.
// ===========================================

// Referenzen auf die wichtigen HTML-Elemente holen
const listSection = document.getElementById("entry-list");
const detailSection = document.getElementById("entry-detail");
const detailContent = document.getElementById("entry-detail-content");
const backButton = document.getElementById("back-button");

// ---- 1. Übersichtsliste aufbauen ----
function renderEntryList() {
  listSection.innerHTML = ""; // vorherigen Inhalt leeren

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
  // Absätze aus body-Array in <p>-Tags umwandeln
  const bodyHtml = entry.body.map(paragraph => `<p>${paragraph}</p>`).join("");

  // Quellen-Liste bauen (falls vorhanden)
  const sourcesHtml = entry.sources && entry.sources.length
    ? `<ul>${entry.sources.map(s => `<li>${s}</li>`).join("")}</ul>`
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

// ---- 4. Beim Laden der Seite: Liste anzeigen ----
renderEntryList();
