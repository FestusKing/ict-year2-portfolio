// ===========================================
// app.js — steuert die ganze Seite
//
// Alles läuft über die Adresszeile (#/...):
//   #/             Übersicht mit allen Einträgen
//   #/entry/<id>   ein Eintrag (+ Feedback für dich und den Lehrer)
//   #/new          neuer Eintrag       (nur Admin)
//   #/edit/<id>    Eintrag bearbeiten  (nur Admin)
//   #/login        Anmelden
//
// Alles, was der Lehrer sieht, ist Englisch. Der Editor (nur für dich) ist Deutsch.
// ===========================================

import { people } from "./config.js";
import { createStore, isDemo, imageIdsIn } from "./store.js";
import { createEditor } from "./editor.js";

const view = document.getElementById("view");
const authArea = document.getElementById("auth-area");

let store = null;
let user = null;             // { email, name, role } oder null (= Gast)
let dirty = false;           // ungespeicherte Änderungen im Editor?
let routeToken = 0;          // verhindert, dass eine alte, langsame Ansicht eine neuere überschreibt
let currentHash = location.hash;
let ignoreNextHashChange = false;

const LEAVE_WARNING = "Du hast ungespeicherte Änderungen. Wenn du jetzt weggehst, sind sie weg.";

// ---------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------

// Macht Text sicher für innerHTML ("<b>" -> "&lt;b&gt;")
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

// Entfernt gefährliches HTML (z.B. <script>) aus dem Eintragstext
const sanitize = (html) => DOMPurify.sanitize(String(html ?? ""));

// Text mit Web-Adressen -> Text mit klickbaren Links
function linkify(text) {
  return esc(text).replace(/https?:\/\/[^\s<]+/g, (url) =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
}

// "2026-08-26" -> "26 August 2026"
function formatDate(iso) {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso || "No date";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateTime(date) {
  return date.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// Heute als "JJJJ-MM-TT" (das schwedische Datumsformat ist genau dieses)
const today = () => new Date().toLocaleDateString("sv-SE");

const isAdmin = () => user?.role === "admin";
const isMember = () => user?.role === "admin" || user?.role === "teacher";

// Neueste zuerst; bei gleichem Datum der zuletzt erstellte zuerst
const newestFirst = (a, b) => (b.date || "").localeCompare(a.date || "") || b.createdAt - a.createdAt;

// Verständliche Meldungen statt Firebase-Fehlercodes
function friendlyError(error) {
  const messages = {
    "auth/invalid-credential": "Wrong email or password.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/missing-password": "Please enter your password.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "No connection. Please check your internet.",
    "permission-denied": "Keine Berechtigung. Sind die neusten Regeln in Firebase veröffentlicht (Firestore → Regeln)?",
    unavailable: "The database can't be reached right now. Please try again.",
  };
  return messages[error?.code] || error?.message || String(error);
}

// Neue Ansicht einsetzen
function render(html, title = "") {
  view.innerHTML = html;
  document.title = title ? `${title} — Andrej König` : "Andrej König — ICT English Portfolio";
  window.scrollTo(0, 0);
}

// Links im Eintrag öffnen in einem neuen Tab
function setupSanitizer() {
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node.hasAttribute("href")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

// ---------------------------------------------------------------
// Eigene Dialoge statt confirm()/alert()
// (die Browser-Fenster werden in manchen Browsern still blockiert –
//  dann passiert beim Klick einfach nichts)
// ---------------------------------------------------------------

const dialog = document.createElement("dialog");
dialog.className = "dialog";
document.body.appendChild(dialog);

// Frage stellen -> true (bestätigt) oder false (abgebrochen / Esc)
function ask(message, { confirmLabel = "OK", cancelLabel = "Abbrechen", danger = false } = {}) {
  return new Promise((resolve) => {
    if (dialog.open) dialog.close();
    dialog.innerHTML = `
      <form method="dialog" class="dialog-body">
        <p>${esc(message)}</p>
        <div class="dialog-actions">
          ${cancelLabel ? `<button class="btn" value="cancel">${esc(cancelLabel)}</button>` : ""}
          <button class="btn ${danger ? "btn-danger-solid" : "btn-primary"}" value="ok">${esc(confirmLabel)}</button>
        </div>
      </form>
    `;
    dialog.returnValue = "";
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), { once: true });
    dialog.showModal();
    (dialog.querySelector('[value="cancel"]') || dialog.querySelector('[value="ok"]')).focus();
  });
}

// Nur eine Meldung mit einem Knopf
const notify = (message) => ask(message, { cancelLabel: "" });

const confirmLeave = () => ask(LEAVE_WARNING, { confirmLabel: "Verwerfen", cancelLabel: "Weiter bearbeiten", danger: true });

const confirmDelete = (title) =>
  ask(`„${title}“ wirklich löschen? Das kann man nicht rückgängig machen.`, { confirmLabel: "Löschen", danger: true });

// ---------------------------------------------------------------
// Bilder (im Eintrag steht nur <img data-image-id="...">)
// ---------------------------------------------------------------

// Bilder in einem Bereich der Seite nachladen
async function hydrateImages(root) {
  if (!root) return;
  const images = [...root.querySelectorAll("img[data-image-id]")];
  await Promise.all(images.map(async (img) => {
    try {
      img.src = await store.getImage(img.dataset.imageId);
    } catch (error) {
      console.warn("Bild konnte nicht geladen werden:", error);
      img.alt = "Image could not be loaded";
      img.classList.add("img-missing");
    }
  }));
}

// Für den Editor: HTML mit echten Bildern statt nur IDs
async function withImageSources(html) {
  if (!html || !html.includes("data-image-id")) return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  await hydrateImages(template.content);
  return template.innerHTML;
}

// ---------------------------------------------------------------
// Kopfzeile: "Log in" oder Name + "Log out"
// ---------------------------------------------------------------

function renderAuthArea() {
  if (!user) {
    authArea.innerHTML = `<a class="nav-link" href="#/login">Log in</a>`;
    return;
  }

  const roleLabel = { admin: "Admin", teacher: "Teacher" }[user.role] || "No access";
  authArea.innerHTML = `
    <span class="who">
      <span>${esc(user.name)}</span>
      <span class="who-role">${roleLabel}</span>
    </span>
    <button class="link-btn nav-link" id="logout-btn" type="button">Log out</button>
  `;

  document.getElementById("logout-btn").addEventListener("click", async () => {
    if (dirty && !(await confirmLeave())) return;
    dirty = false;
    await store.logout();
    location.hash = "#/";
  });
}

// ---------------------------------------------------------------
// Ansicht: Übersicht
// ---------------------------------------------------------------

const INTRO = `
  <section class="intro">
    <p class="eyebrow">ICT English · Year 2 · TBZ Zürich</p>
    <h1>Hi, I'm Andrej.</h1>
    <p>
      My name is Andrej König. I live in Switzerland, in the city of Winterthur. I work as an ICT-Fachmann at Quellenhof-Stiftung and PVComp, and I am in my second year of my apprenticeship. I play golf and like to go to the gym, and I attend the school TBZ. 

      Yeah, that's me. I hope you like my portfolio entry! :) 
    </p>
  </section>
`;

async function showList(isStale) {
  render(`${INTRO}<p class="muted">Loading entries…</p>`);

  const entries = (await store.listEntries()).sort(newestFirst);
  if (isStale()) return;

  const cards = entries.map((entry) => `
    <li>
      <a class="entry-card" href="#/entry/${encodeURIComponent(entry.id)}">
        <time class="entry-card-date" datetime="${esc(entry.date)}">${esc(formatDate(entry.date))}</time>
        <span class="entry-card-title">
          ${esc(entry.title)}${entry.status === "draft" ? `<span class="badge">Entwurf</span>` : ""}
        </span>
        ${entry.teaser ? `<span class="entry-card-teaser">${esc(entry.teaser)}</span>` : ""}
      </a>
    </li>
  `).join("");

  render(`
    ${INTRO}
    <div class="section-head">
      <h2>Entries<span class="count">${entries.length}</span></h2>
      ${isAdmin() ? `<a class="btn btn-primary" href="#/new">+ Neuer Eintrag</a>` : ""}
    </div>
    ${entries.length
      ? `<ol class="entry-list">${cards}</ol>`
      : `<p class="empty">No entries yet.</p>`}
  `);
}

// ---------------------------------------------------------------
// Ansicht: ein Eintrag
// ---------------------------------------------------------------

async function showEntry(id, isStale) {
  render(`<p class="muted">Loading…</p>`);

  const entry = await store.getEntry(id);
  if (isStale()) return;
  if (!entry) return showNotFound();

  const sources = entry.sources?.length
    ? `<ul>${entry.sources.map((source) => `<li>${linkify(source)}</li>`).join("")}</ul>`
    : `<p>No external sources used.</p>`;

  const adminActions = isAdmin() ? `
    <div class="admin-actions">
      <a class="btn" href="#/edit/${encodeURIComponent(entry.id)}">Bearbeiten</a>
      ${entry.status === "draft"
        ? `<button class="btn btn-ok" id="publish-btn" type="button">Jetzt veröffentlichen</button>`
        : `<button class="btn" id="unpublish-btn" type="button">Zurück zu Entwurf</button>`}
      <button class="btn btn-danger" id="delete-btn" type="button">Löschen</button>
    </div>
  ` : "";

  const feedback = isMember() ? `
    <section class="feedback" aria-labelledby="feedback-title">
      <h2 id="feedback-title">Feedback</h2>
      <p class="hint">Only Andrej and his teacher can see this.</p>
      <div id="feedback-list"><p class="muted">Loading feedback…</p></div>
      <form id="feedback-form" class="feedback-form">
        <label class="sr-only" for="feedback-text">Your feedback</label>
        <textarea id="feedback-text" rows="4" maxlength="5000" required
          placeholder="${isAdmin() ? "Antwort schreiben…" : "Write your feedback for Andrej…"}"></textarea>
        <p id="feedback-error" class="form-error" hidden></p>
        <button class="btn btn-primary" type="submit">Post</button>
      </form>
    </section>
  ` : "";

  render(`
    <a class="back" href="#/">← All entries</a>
    <article>
      <header class="entry-head">
        <time class="entry-date" datetime="${esc(entry.date)}">${esc(formatDate(entry.date))}</time>
        ${entry.status === "draft" ? `<span class="badge">Entwurf – nur für dich sichtbar</span>` : ""}
        <h1>${esc(entry.title)}</h1>
        ${entry.teaser ? `<p class="lead">${esc(entry.teaser)}</p>` : ""}
      </header>

      <div class="prose">
        ${sanitize(entry.body) || `<p class="muted">No text yet.</p>`}
      </div>

      <footer class="entry-foot">
        <div>
          <h2>Sources</h2>
          ${sources}
        </div>
        <div>
          <h2>Use of AI</h2>
          <p>${esc(entry.aiUsage || "Not specified.")}</p>
        </div>
      </footer>
      ${adminActions}
    </article>
    ${feedback}
  `, entry.title);

  hydrateImages(view.querySelector(".prose"));
  if (isAdmin()) wireAdminActions(entry);
  if (isMember()) wireFeedback(entry.id);
}

function wireAdminActions(entry) {
  const setStatus = async (status) => {
    try {
      await store.saveEntry(entry.id, { ...entry, status });
      route();
    } catch (error) {
      notify(friendlyError(error));
    }
  };

  document.getElementById("publish-btn")?.addEventListener("click", () => setStatus("published"));
  document.getElementById("unpublish-btn")?.addEventListener("click", () => setStatus("draft"));

  document.getElementById("delete-btn").addEventListener("click", async () => {
    if (!(await confirmDelete(entry.title))) return;
    try {
      await store.deleteEntry(entry.id);
      location.hash = "#/";
    } catch (error) {
      notify(friendlyError(error));
    }
  });
}

async function loadFeedback(entryId) {
  const list = document.getElementById("feedback-list");
  if (!list) return;

  let items;
  try {
    items = await store.listFeedback(entryId);
  } catch (error) {
    list.innerHTML = `<p class="form-error">${esc(friendlyError(error))}</p>`;
    return;
  }
  if (!list.isConnected) return;

  list.innerHTML = items.length
    ? items.map((item) => {
        const own = item.authorEmail === user.email;
        const fromTeacher = people[item.authorEmail]?.role === "teacher";
        return `
          <div class="comment ${fromTeacher ? "comment-teacher" : ""}">
            <div class="comment-meta">
              <strong>${esc(item.authorName)}</strong>
              <time>${esc(formatDateTime(item.createdAt))}</time>
              ${own || isAdmin() ? `<button class="link-btn" type="button" data-delete="${esc(item.id)}">Delete</button>` : ""}
            </div>
            <p>${esc(item.text)}</p>
          </div>
        `;
      }).join("")
    : `<p class="muted">No feedback yet.</p>`;

  list.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const sure = await ask("Delete this comment?", { confirmLabel: "Delete", cancelLabel: "Cancel", danger: true });
      if (!sure) return;
      try {
        await store.deleteFeedback(entryId, button.dataset.delete);
        loadFeedback(entryId);
      } catch (error) {
        notify(friendlyError(error));
      }
    });
  });
}

function wireFeedback(entryId) {
  loadFeedback(entryId);

  const form = document.getElementById("feedback-form");
  const textarea = document.getElementById("feedback-text");
  const errorBox = document.getElementById("feedback-error");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = textarea.value.trim();
    if (!text) return;

    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    errorBox.hidden = true;
    try {
      await store.addFeedback(entryId, text);
      textarea.value = "";
      await loadFeedback(entryId);
    } catch (error) {
      errorBox.textContent = friendlyError(error);
      errorBox.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
}

// ---------------------------------------------------------------
// Ansicht: Editor (neu / bearbeiten) — nur für dich
// ---------------------------------------------------------------

async function showEditor(id, isStale) {
  if (!isAdmin()) {
    location.hash = "#/login";
    return;
  }

  let entry = { title: "", date: today(), teaser: "", body: "", sources: [], aiUsage: "", status: "draft" };
  if (id) {
    render(`<p class="muted">Loading…</p>`);
    const found = await store.getEntry(id);
    if (isStale()) return;
    if (!found) return showNotFound();
    entry = found;
  }

  // Bilder für den Editor laden (im Eintrag steht nur ihre ID)
  const bodyWithImages = await withImageSources(entry.body);
  if (isStale()) return;

  const cancelHref = id ? `#/entry/${encodeURIComponent(id)}` : "#/";
  const checked = (status) => (entry.status === status ? "checked" : "");

  render(`
    <a class="back" href="${cancelHref}">← Abbrechen</a>
    <h1 class="page-title">${id ? "Eintrag bearbeiten" : "Neuer Eintrag"}</h1>

    <form id="entry-form" class="form" novalidate>
      <div class="field">
        <label for="f-title">Titel</label>
        <input id="f-title" type="text" maxlength="200" lang="en" spellcheck="true"
          value="${esc(entry.title)}" placeholder="Portfolio Entry #3: My Complex Task">
      </div>

      <div class="field-row">
        <div class="field">
          <label for="f-date">Datum</label>
          <input id="f-date" type="date" value="${esc(entry.date)}">
        </div>
        <fieldset class="field">
          <legend>Sichtbarkeit</legend>
          <div class="segmented">
            <label><input type="radio" name="status" value="draft" ${checked("draft")}><span>Entwurf</span></label>
            <label><input type="radio" name="status" value="published" ${checked("published")}><span>Veröffentlicht</span></label>
          </div>
        </fieldset>
      </div>
      <p class="hint field-note">Entwurf = nur du siehst ihn. Veröffentlicht = alle, auch dein Lehrer.</p>

      <div class="field">
        <label for="f-teaser">Teaser <span class="hint">– ein Satz, steht in der Übersicht</span></label>
        <input id="f-teaser" type="text" maxlength="300" lang="en" spellcheck="true" value="${esc(entry.teaser)}">
      </div>

      <div class="field">
        <label>Text</label>
        <div id="f-body"></div>
        <p class="upload-status" id="f-body-status" role="status" hidden></p>
        <p class="hint">Rot unterstrichen = Tippfehler. Rechtsklick darauf zeigt Vorschläge. Bilder: Knopf oben, reinziehen oder Strg+V.</p>
      </div>

      <div class="field">
        <label for="f-sources">Quellen <span class="hint">– eine pro Zeile, leer lassen wenn keine</span></label>
        <textarea id="f-sources" rows="3" placeholder="https://…">${esc((entry.sources || []).join("\n"))}</textarea>
      </div>

      <div class="field">
        <label for="f-ai">KI-Einsatz <span class="hint">– welche KI wofür? (wird bewertet!)</span></label>
        <textarea id="f-ai" rows="2" lang="en" spellcheck="true"
          placeholder="e.g. I used ChatGPT to check my grammar.">${esc(entry.aiUsage)}</textarea>
      </div>

      <p id="form-error" class="form-error" hidden></p>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">Speichern</button>
        <a class="btn" href="${cancelHref}">Abbrechen</a>
        ${id ? `<button class="btn btn-danger form-actions-end" id="editor-delete" type="button">Löschen</button>` : ""}
      </div>
    </form>
  `, id ? "Bearbeiten" : "Neuer Eintrag");

  const form = document.getElementById("entry-form");
  const errorBox = document.getElementById("form-error");
  const statusBox = document.getElementById("f-body-status");

  const fail = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
    errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const editor = createEditor(document.getElementById("f-body"), bodyWithImages, {
    uploadImage: (dataUrl) => store.uploadImage(dataUrl),
    onStatus: (text) => {
      statusBox.textContent = text;
      statusBox.hidden = !text;
    },
    onError: (error, name) => fail(`Bild „${name}“ wurde nicht hochgeladen: ${friendlyError(error)}`),
  });

  editor.onChange(() => { dirty = true; });
  form.addEventListener("input", () => { dirty = true; });

  document.getElementById("editor-delete")?.addEventListener("click", async () => {
    if (!(await confirmDelete(entry.title))) return;
    try {
      await store.deleteEntry(id);
      dirty = false;
      location.hash = "#/";
    } catch (error) {
      fail(friendlyError(error));
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.hidden = true;

    const data = {
      title: form.querySelector("#f-title").value.trim(),
      date: form.querySelector("#f-date").value,
      teaser: form.querySelector("#f-teaser").value.trim(),
      body: "",
      sources: form.querySelector("#f-sources").value.split("\n").map((line) => line.trim()).filter(Boolean),
      aiUsage: form.querySelector("#f-ai").value.trim(),
      status: form.querySelector("input[name=status]:checked")?.value || "draft",
    };

    if (!data.title) return fail("Bitte einen Titel eingeben.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) return fail("Bitte ein Datum wählen.");

    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Speichere…";
    try {
      // Wartet auf laufende Bild-Uploads und lagert eingefügte Bilder aus
      data.body = await editor.getHtml();
      // Firebase erlaubt max. 1 MB pro Eintrag – ohne Bilder erreicht man das praktisch nie
      if (data.body.length > 900_000) {
        throw new Error("Der Text ist zu lang. Teile ihn bitte auf zwei Einträge auf.");
      }

      const savedId = await store.saveEntry(id, data);

      // Bilder, die du aus dem Eintrag entfernt hast, auch in Firebase löschen
      const kept = new Set(imageIdsIn(data.body));
      const removed = imageIdsIn(entry.body).filter((imageId) => !kept.has(imageId));
      if (removed.length) store.deleteImages(removed).catch(() => {});

      dirty = false;
      location.hash = `#/entry/${encodeURIComponent(savedId)}`;
    } catch (error) {
      fail(friendlyError(error));
      button.disabled = false;
      button.textContent = "Speichern";
    }
  });
}

// ---------------------------------------------------------------
// Ansicht: Login
// ---------------------------------------------------------------

function showLogin() {
  if (user) {
    location.hash = "#/";
    return;
  }

  const demoButtons = isDemo ? `
    <div class="demo-login">
      <p>Demo-Modus: einfach eine Rolle wählen, kein Passwort nötig.</p>
      <button class="btn" type="button" data-demo="admin">Als Andrej (Admin)</button>
      <button class="btn" type="button" data-demo="teacher">Als Lehrer</button>
    </div>
  ` : "";

  render(`
    <div class="login">
      <h1>Log in</h1>
      <p class="muted">For Andrej and his teacher. Everyone can read the portfolio without logging in.</p>
      ${demoButtons}
      <form id="login-form" class="form">
        <div class="field">
          <label for="l-email">Email</label>
          <input id="l-email" type="email" autocomplete="username" required>
        </div>
        <div class="field">
          <label for="l-pass">Password</label>
          <input id="l-pass" type="password" autocomplete="current-password" required>
        </div>
        <p id="login-error" class="form-error" hidden></p>
        <button class="btn btn-primary btn-block" type="submit">Log in</button>
      </form>
      <button class="link-btn" id="forgot-btn" type="button">Forgot password? / First time here?</button>
      <p id="reset-msg" class="form-ok" hidden></p>
    </div>
  `, "Log in");

  const form = document.getElementById("login-form");
  const errorBox = document.getElementById("login-error");
  const resetMsg = document.getElementById("reset-msg");
  const emailInput = document.getElementById("l-email");

  view.querySelectorAll("[data-demo]").forEach((button) => {
    button.addEventListener("click", () => store.demoLogin(button.dataset.demo));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Logging in…";
    try {
      await store.login(emailInput.value, document.getElementById("l-pass").value);
      // Weiter geht's automatisch über onAuthChange -> route()
    } catch (error) {
      errorBox.textContent = friendlyError(error);
      errorBox.hidden = false;
      button.disabled = false;
      button.textContent = "Log in";
    }
  });

  // Passwort vergessen / zum ersten Mal hier: Mail mit Link zum Passwort-Festlegen
  document.getElementById("forgot-btn").addEventListener("click", async () => {
    errorBox.hidden = true;
    resetMsg.hidden = true;
    if (!emailInput.value.trim()) {
      errorBox.textContent = "Please enter your email address above first.";
      errorBox.hidden = false;
      emailInput.focus();
      return;
    }
    try {
      await store.resetPassword(emailInput.value);
    } catch (error) {
      if (error.code === "auth/invalid-email") {
        errorBox.textContent = friendlyError(error);
        errorBox.hidden = false;
        return;
      }
      // Andere Fehler bewusst nicht anzeigen: sonst könnte man testen, welche E-Mails existieren
    }
    resetMsg.textContent = "If this email has an account, you'll get a link to set your password.";
    resetMsg.hidden = false;
  });
}

// ---------------------------------------------------------------
// Nicht gefunden / Fehler
// ---------------------------------------------------------------

function showNotFound() {
  render(`
    <div class="state">
      <h1>Not found</h1>
      <p class="muted">This entry doesn't exist or isn't published yet.</p>
      <a class="btn" href="#/">← All entries</a>
    </div>
  `, "Not found");
}

function showError(error) {
  render(`
    <div class="state">
      <h1>Something went wrong</h1>
      <p class="form-error">${esc(friendlyError(error))}</p>
      <button class="btn" type="button" onclick="location.reload()">Reload page</button>
    </div>
  `, "Error");
}

// ---------------------------------------------------------------
// Routing
// ---------------------------------------------------------------

const routes = [
  [/^#?\/?$/, (m, isStale) => showList(isStale)],
  [/^#\/entry\/([^/]+)$/, (m, isStale) => showEntry(decodeURIComponent(m[1]), isStale)],
  [/^#\/new$/, (m, isStale) => showEditor(null, isStale)],
  [/^#\/edit\/([^/]+)$/, (m, isStale) => showEditor(decodeURIComponent(m[1]), isStale)],
  [/^#\/login$/, () => showLogin()],
];

async function route() {
  const token = ++routeToken;
  const isStale = () => token !== routeToken;
  currentHash = location.hash;
  dirty = false;

  const hash = location.hash || "#/";
  const found = routes.find(([pattern]) => pattern.test(hash));
  if (!found) return showNotFound();

  try {
    await found[1](hash.match(found[0]), isStale);
  } catch (error) {
    console.error(error);
    if (!isStale()) showError(error);
  }
}

// Wegnavigieren mit ungespeicherten Änderungen -> erst nachfragen
window.addEventListener("hashchange", async () => {
  if (ignoreNextHashChange) {
    ignoreNextHashChange = false;
    return;
  }
  if (dirty) {
    // Zuerst zurück in den Editor (ohne ihn neu zu laden), dann fragen
    const target = location.hash;
    ignoreNextHashChange = true;
    location.hash = currentHash;
    if (await confirmLeave()) {
      dirty = false;
      location.hash = target;
    }
    return;
  }
  route();
});

window.addEventListener("beforeunload", (event) => {
  if (dirty) event.preventDefault();
});

// ---------------------------------------------------------------
// Start
// ---------------------------------------------------------------

async function start() {
  setupSanitizer();
  document.getElementById("demo-banner").hidden = !isDemo;

  try {
    store = await createStore();
  } catch (error) {
    console.error(error);
    render(`
      <div class="state">
        <h1>The portfolio couldn't be loaded</h1>
        <p class="muted">Please check your connection and reload the page.</p>
        <button class="btn" type="button" onclick="location.reload()">Reload page</button>
      </div>
    `, "Error");
    return;
  }

  // Wird beim Start und bei jedem Login/Logout aufgerufen
  store.onAuthChange((newUser) => {
    user = newUser;
    renderAuthArea();
    route();
  });
}

start();
