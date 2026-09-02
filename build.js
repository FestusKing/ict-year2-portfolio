#!/usr/bin/env node
/**
 * build.js
 * ---------------------------------------------------------------
 * Sammelt alle Portfolio-Einträge aus data/entries/*.json und
 * schreibt sie als EINE Datei nach data/entries.json.
 *
 * Warum? Die Webseite muss dann nur noch eine einzige Datei laden,
 * statt die GitHub-API zu fragen (die erlaubt nur 60 Anfragen pro
 * Stunde und IP -- im Schul-WLAN ist das schnell aufgebraucht).
 *
 * Aufruf:  node build.js
 * Render:  Build Command = node build.js
 * ---------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

const ENTRIES_DIR = path.join(__dirname, "data", "entries");
const OUTPUT_FILE = path.join(__dirname, "data", "entries.json");

/**
 * Wandelt "18.08.2026" (TT.MM.JJJJ) in eine sortierbare Zahl um.
 * Gibt NaN zurück, wenn das Datum unbrauchbar ist.
 */
function dateValue(dateStr) {
  if (typeof dateStr !== "string") return NaN;
  const match = dateStr.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return NaN;
  const [, day, month, year] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
}

function build() {
  if (!fs.existsSync(ENTRIES_DIR)) {
    console.error(`FEHLER: Ordner ${ENTRIES_DIR} existiert nicht.`);
    process.exit(1);
  }

  const files = fs.readdirSync(ENTRIES_DIR).filter((f) => f.endsWith(".json"));

  // Dateien, die nicht .json sind, würden sonst still verschwinden -> warnen.
  const ignored = fs.readdirSync(ENTRIES_DIR).filter((f) => !f.endsWith(".json"));
  if (ignored.length) {
    console.warn(`WARNUNG: Diese Dateien werden ignoriert (kein .json): ${ignored.join(", ")}`);
  }

  const entries = [];

  for (const file of files) {
    const fullPath = path.join(ENTRIES_DIR, file);
    let entry;

    try {
      entry = JSON.parse(fs.readFileSync(fullPath, "utf8"));
    } catch (error) {
      console.error(`FEHLER: ${file} ist kein gültiges JSON -- ${error.message}`);
      process.exit(1);
    }

    // slug = Dateiname ohne .json -> wird für die Direkt-Links gebraucht
    entry.slug = file.replace(/\.json$/, "");

    if (!entry.title) console.warn(`WARNUNG: ${file} hat keinen Titel.`);
    if (Number.isNaN(dateValue(entry.date))) {
      console.warn(`WARNUNG: ${file} hat kein Datum im Format TT.MM.JJJJ (gefunden: ${JSON.stringify(entry.date)}).`);
    }

    entries.push(entry);
  }

  // Neueste zuerst. Einträge ohne brauchbares Datum wandern ans Ende,
  // statt die ganze Sortierung durcheinanderzubringen.
  entries.sort((a, b) => {
    const dateA = dateValue(a.date);
    const dateB = dateValue(b.date);
    if (Number.isNaN(dateA) && Number.isNaN(dateB)) return 0;
    if (Number.isNaN(dateA)) return 1;
    if (Number.isNaN(dateB)) return -1;
    return dateB - dateA;
  });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(entries, null, 2) + "\n", "utf8");
  console.log(`OK: ${entries.length} Eintrag/Einträge nach data/entries.json geschrieben.`);
}

build();
