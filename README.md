# ICT Year 2 Portfolio — Andrej König

Portfolio-Webseite für ICT English Year 2 (TBZ Zürich, Joseph Heeg).

**Live:** _(Render-Adresse hier eintragen)_
**Bearbeiten:** _(Render-Adresse)_`/admin/`

---

## Einen neuen Eintrag schreiben

Du brauchst **kein** VS Code dafür.

1. Im Browser deine Adresse + `/admin/` öffnen
2. Mit **GitHub** einloggen
   → Beim ersten Mal des Tages kann das ~1 Minute dauern (siehe unten)
3. Links **„Portfolio Einträge"** → oben rechts **„New Portfolio Eintrag"**
4. Ausfüllen: Titel, Datum (Kalender anklicken), Teaser, Text, Quellen, KI-Einsatz
5. Oben auf **„Publish"** klicken
6. ~1–2 Minuten warten → Render baut die Seite neu → dein Eintrag ist online

Die **Kurz-Vorstellung** auf der Startseite änderst du unter **„Startseite" → „Über mich"**.

---

## Wie das Ganze aufgebaut ist

```
CMS (/admin) → Commit auf GitHub → Render baut neu → Webseite aktuell
                                        ↓
                          node build.js erzeugt data/entries.json
```

| Datei | Wozu |
|-------|------|
| `index.html` | Grundgerüst der Seite |
| `style.css` | Aussehen (Farben ganz oben in `:root` änderbar) |
| `script.js` | Lädt die Einträge, baut Liste + Detailansicht, Direkt-Links |
| `build.js` | Fasst alle `data/entries/*.json` zu `data/entries.json` zusammen |
| `vendor/marked.min.js` | Markdown → HTML (liegt lokal im Repo, kein CDN) |
| `admin/config.yml` | Welche Felder das CMS anbietet |
| `render.yaml` | Render-Einstellungen |
| `data/entries/*.json` | Deine Einträge (schreibt das CMS) |
| `data/about.json` | Die Kurz-Vorstellung |

`data/entries.json` steht in `.gitignore` — sie wird bei jedem Build neu erzeugt
und darf **nie** von Hand bearbeitet werden.

---

## Direkt-Links auf einzelne Einträge

Jeder Eintrag hat eine eigene Adresse:

```
https://DEINE-ADRESSE.onrender.com/#/eintrag/portfolio-entry-2
```

So kannst du dem Lehrer auch einen einzelnen Eintrag schicken.

---

## Lokal testen (optional, in VS Code)

```bash
node build.js                  # erzeugt data/entries.json
python3 -m http.server 8000    # dann http://localhost:8000 öffnen
```

> `file://` funktioniert **nicht** — der Browser blockiert dabei das Laden
> der JSON-Dateien. Es braucht einen kleinen lokalen Server.

---

## Deployment auf Render (einmalig einrichten)

1. [render.com](https://render.com) → **New** → **Static Site**
2. GitHub-Repo `ict-year2-portfolio` verbinden
3. Einstellen:
   - **Branch:** `main`
   - **Build Command:** `node build.js`
   - **Publish Directory:** `.`
4. **Create Static Site**

Danach wird bei jedem Push auf `main` automatisch neu deployed.

---

## Wenn der CMS-Login nicht geht

Der GitHub-Login läuft über einen eigenen kleinen Dienst auf Render
(`portfolio-login.onrender.com`). Das ist ein
Render **Web Service** — und die schlafen auf dem Gratis-Plan nach
15 Minuten ohne Zugriff ein.

- **Erster Login dauert lange (~50 s):** normal, der Dienst wacht auf. Warten, nicht abbrechen.
- **Login schlägt fehl:** Seite neu laden und nochmal probieren.
- **`portfolio-login.onrender.com` direkt im Browser zeigt einen Fehler
  (401 / „Whitelabel Error Page"):** Das ist **kein** Defekt. Der Dienst ist keine
  Webseite, er antwortet nur auf `/auth` und `/callback`. Dass überhaupt eine
  Antwort kommt, heisst: er läuft.
- **Geht gar nicht:** Notfall-Weg → Eintrag direkt auf github.com im Web-Editor
  bearbeiten (`data/entries/…json`). Auch das ist nicht VS Code.

Zu prüfen, falls es dauerhaft klemmt:
- GitHub → Settings → Developer settings → OAuth Apps:
  **Authorization callback URL** = `https://portfolio-login.onrender.com/callback`
- Im Render-Dashboard beim OAuth-Provider: die Umgebungsvariable für erlaubte
  Domains/Origins muss deine Static-Site-Adresse enthalten.
