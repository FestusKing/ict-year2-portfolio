# ICT English Portfolio — Andrej König

Portfolio-Webseite für ICT English Year 2 (TBZ Zürich, Joseph Heeg).

**Adresse:** https://festusking.github.io/ict-year2-portfolio/

| Wer | Was |
|---|---|
| **Du** (Admin) | Einträge schreiben, bearbeiten, löschen, Entwürfe |
| **Lehrer** | Veröffentlichte Einträge lesen + Feedback |
| Alle anderen | nichts – nur die Login-Seite |

Die Seite ist **privat**: Ohne Login sieht man nur die Login-Seite. Entwürfe siehst nur du.

---

## Einmalig: Firebase einrichten (ca. 10 Minuten)

Firebase ist von Google und gratis. Es speichert deine Einträge und macht den Login.
Du brauchst dafür dein Google-Konto.

1. **Projekt erstellen**
   https://console.firebase.google.com → *Projekt erstellen* → Name z. B. `ict-portfolio`
   → Google Analytics **ausschalten** → *Projekt erstellen*

2. **Login einschalten**
   Links *Build → Authentication* → *Jetzt starten* → Anbieter **E-Mail/Passwort** → aktivieren → *Speichern*

3. **Deine Adresse erlauben**
   *Authentication → Einstellungen → Autorisierte Domains* → *Domain hinzufügen* → `festusking.github.io`

4. **Fremde Registrierungen sperren**
   *Authentication → Einstellungen → Nutzeraktionen* → Häkchen bei **„Erstellen (Registrierung) aktivieren"** entfernen → *Speichern*
   (Dann können nur Konten existieren, die du selbst anlegst.)

5. **Konten anlegen**
   *Authentication → Nutzer → Nutzer hinzufügen*
   - **Du:** deine E-Mail + dein Passwort (tippst du selbst ein)
   - **Lehrer:** seine E-Mail + ein langes Zufallspasswort. Das musst du dir **nicht** merken –
     er legt sich über „Forgot password? / First time here?" sein eigenes fest.

6. **Datenbank erstellen**
   *Build → Firestore Database* → *Datenbank erstellen* → Standort **eur3 (Europe)** → **Produktionsmodus** → *Erstellen*

7. **Regeln einfügen**
   *Firestore Database → Regeln* → alles löschen → Inhalt von [`firestore.rules`](firestore.rules) einfügen → *Veröffentlichen*

8. **Web-App registrieren**
   Zahnrad oben links → *Projekteinstellungen* → ganz unten *Meine Apps* → Symbol **`</>`**
   → Name `portfolio` → Firebase Hosting **nicht** anhaken → *App registrieren*
   → den Block `firebaseConfig = { … }` kopieren → in [`js/config.js`](js/config.js) einsetzen

9. **E-Mails eintragen**
   Die Lehrer-E-Mail an **zwei** Stellen eintragen (klein geschrieben, genau gleich):
   - [`js/config.js`](js/config.js) → bei `people`
   - [`firestore.rules`](firestore.rules) → bei `isTeacher()` → danach Schritt 7 wiederholen

Solange in `js/config.js` noch `DEIN_API_KEY` steht, läuft die Seite im **Demo-Modus**
(speichert nur im eigenen Browser, oranger Balken oben).

---

## Einen Eintrag schreiben

1. Seite öffnen → oben rechts **Log in**
2. **+ Neuer Eintrag**
3. Titel, Datum, Teaser, Text, Quellen, KI-Einsatz ausfüllen
   - Bilder: Knopf in der Werkzeugleiste, oder einfach reinziehen / Strg+V
   - Rot unterstrichen = Tippfehler → Rechtsklick zeigt Vorschläge
4. **Entwurf** (nur du siehst ihn) oder **Veröffentlicht** (alle) wählen → **Speichern**

Sofort online – kein Warten, kein Deploy.

Bilder werden beim Einfügen verkleinert und **einzeln** in Firebase gespeichert (Sammlung `images`) –
im Eintrag steht nur ihre ID. Deshalb gibt es keine Grenze, wie viele Bilder ein Eintrag haben darf.

---

## Den Lehrer einladen

Nach Schritt 5 und 9 diese Nachricht in Teams schicken (oder anpassen):

> Hello Mr Heeg,
>
> here is my Year 2 portfolio: https://festusking.github.io/ict-year2-portfolio/
>
> The portfolio is private, so I've created a login for you: open the link, click
> **Forgot password? / First time here?**, enter your school email address and you'll
> receive a link to set your own password. After logging in you can also leave feedback.
>
> Best regards,
> Andrej

---

## Dateien

| Datei | Wozu |
|---|---|
| `index.html` | Grundgerüst |
| `css/style.css` | Aussehen (Farben ganz oben in `:root`) |
| `js/config.js` | **Firebase-Daten + wer darf was** – die einzige Datei zum Anpassen |
| `js/app.js` | Ansichten: Übersicht, Eintrag, Editor, Login, Feedback |
| `js/store.js` | Speichern + Login (Firebase oder Demo) |
| `js/editor.js` | Texteditor, Bilder verkleinern und hochladen |
| `firestore.rules` | Sicherheitsregeln (werden in der Firebase Console eingefügt) |
| `vendor/` | Quill (Editor) und DOMPurify (Schutz vor Schad-Code), lokal statt CDN |

Die Firebase-Daten in `js/config.js` sind **kein Geheimnis** – sie stehen bei jeder
Firebase-Webseite im Quelltext. Geschützt wird alles durch `firestore.rules`.

---

## Häufige Probleme

- **„Keine Berechtigung"** → E-Mail in `js/config.js` und `firestore.rules` stimmt nicht überein,
  oder die Regeln wurden nach dem Ändern nicht neu veröffentlicht (Schritt 7).
- **Login-Fenster sagt „unauthorized domain"** → Schritt 3 vergessen.
- **„Wrong email or password"** → in Firebase unter *Authentication → Nutzer* prüfen, ob das Konto existiert.
- **Bild wird nicht hochgeladen / „Keine Berechtigung"** → die neusten Regeln aus `firestore.rules`
  sind noch nicht in Firebase veröffentlicht (Schritt 7).
- **„Der Text ist zu lang"** → ein Eintrag darf ohne Bilder ca. 900'000 Zeichen haben. Auf zwei Einträge aufteilen.
