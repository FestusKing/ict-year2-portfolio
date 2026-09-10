// ===========================================
// store.js — alles, was mit Speichern und Login zu tun hat
//
// Zwei Varianten mit GENAU denselben Funktionen:
//   - Firebase: echte Datenbank + Login (sobald js/config.js ausgefüllt ist)
//   - Demo:     speichert nur im eigenen Browser (zum Ausprobieren)
// app.js merkt keinen Unterschied.
// ===========================================

import { firebaseConfig, people } from "./config.js";

export const isDemo = firebaseConfig.apiKey.startsWith("DEIN_");

const FIREBASE_URL = "https://www.gstatic.com/firebasejs/12.18.0";

// Nur diese Felder landen in der Datenbank (firestore.rules prüft genau diese Liste)
const ENTRY_FIELDS = ["title", "date", "teaser", "body", "sources", "aiUsage", "status"];

function pickEntryFields(data) {
  return Object.fromEntries(ENTRY_FIELDS.map((key) => [key, data[key]]));
}

// E-Mail -> { email, name, role }
function describeUser(email) {
  const key = String(email || "").toLowerCase();
  const person = people[key];
  return person ? { email: key, ...person } : { email: key, name: key, role: "guest" };
}

// "Portfolio Entry #2: Brainstorming" -> "portfolio-entry-2-brainstorming"
function slugify(text) {
  const slug = String(text)
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // Akzente entfernen: é -> e
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "entry";
}

// Firebase-Zeitstempel, Text oder nichts -> echtes Date-Objekt
function toDate(value) {
  if (value?.toDate) return value.toDate();
  return value ? new Date(value) : new Date();
}

// Alle Bild-IDs aus dem HTML eines Eintrags (<img data-image-id="...">)
export function imageIdsIn(html) {
  return [...String(html || "").matchAll(/data-image-id="([^"]+)"/g)].map((match) => match[1]);
}

export function createStore() {
  return isDemo ? createDemoStore() : createFirebaseStore();
}

// ---------------------------------------------------------------
// Variante 1: Firebase
// ---------------------------------------------------------------

async function createFirebaseStore() {
  const [{ initializeApp }, fa, fs] = await Promise.all([
    import(`${FIREBASE_URL}/firebase-app.js`),
    import(`${FIREBASE_URL}/firebase-auth.js`),
    import(`${FIREBASE_URL}/firebase-firestore.js`),
  ]);

  const app = initializeApp(firebaseConfig);
  const auth = fa.getAuth(app);
  const db = fs.getFirestore(app);
  let currentUser = null;
  const imageCache = new Map(); // jedes Bild nur einmal laden

  const entryRef = (id) => fs.doc(db, "entries", id);
  const feedbackCol = (entryId) => fs.collection(db, "entries", entryId, "feedback");
  const imageRef = (id) => fs.doc(db, "images", id);

  const fromSnap = (snap) => {
    const data = snap.data();
    return { id: snap.id, ...data, createdAt: toDate(data.createdAt), updatedAt: toDate(data.updatedAt) };
  };

  // Freie ID finden: "titel", sonst "titel-2", "titel-3", ...
  async function freeId(base) {
    let id = base;
    for (let n = 2; (await fs.getDoc(entryRef(id))).exists(); n++) id = `${base}-${n}`;
    return id;
  }

  return {
    onAuthChange(callback) {
      fa.onAuthStateChanged(auth, (firebaseUser) => {
        currentUser = firebaseUser ? describeUser(firebaseUser.email) : null;
        callback(currentUser);
      });
    },
    login: (email, password) => fa.signInWithEmailAndPassword(auth, email.trim(), password),
    logout: () => fa.signOut(auth),
    resetPassword: (email) => fa.sendPasswordResetEmail(auth, email.trim()),

    async listEntries() {
      // Gäste und Lehrer dürfen laut firestore.rules nur Veröffentlichtes abfragen
      const col = fs.collection(db, "entries");
      const q = currentUser?.role === "admin" ? col : fs.query(col, fs.where("status", "==", "published"));
      const snap = await fs.getDocs(q);
      return snap.docs.map(fromSnap);
    },

    async getEntry(id) {
      try {
        const snap = await fs.getDoc(entryRef(id));
        return snap.exists() ? fromSnap(snap) : null;
      } catch (error) {
        // Entwurf, aber nicht als Admin eingeloggt -> für diese Person "gibt es ihn nicht"
        if (error.code === "permission-denied") return null;
        throw error;
      }
    },

    async saveEntry(id, data) {
      const fields = pickEntryFields(data);
      const now = fs.serverTimestamp();
      if (id) {
        await fs.updateDoc(entryRef(id), { ...fields, updatedAt: now });
        return id;
      }
      const newId = await freeId(slugify(fields.title));
      await fs.setDoc(entryRef(newId), { ...fields, createdAt: now, updatedAt: now });
      return newId;
    },

    async deleteEntry(id) {
      // Zuerst Feedback und Bilder des Eintrags löschen, sonst bleiben sie verwaist in der Datenbank
      const snap = await fs.getDoc(entryRef(id));
      const imageIds = snap.exists() ? imageIdsIn(snap.data().body) : [];
      const feedback = await fs.getDocs(feedbackCol(id));
      await Promise.all([
        ...feedback.docs.map((d) => fs.deleteDoc(d.ref)),
        ...imageIds.map((imageId) => fs.deleteDoc(imageRef(imageId)).catch(() => {})),
      ]);
      await fs.deleteDoc(entryRef(id));
    },

    async listFeedback(entryId) {
      const snap = await fs.getDocs(feedbackCol(entryId));
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data(), createdAt: toDate(d.data().createdAt) }))
        .sort((a, b) => a.createdAt - b.createdAt);
    },

    addFeedback(entryId, text) {
      return fs.addDoc(feedbackCol(entryId), {
        text,
        authorEmail: currentUser.email,
        authorName: currentUser.name,
        createdAt: fs.serverTimestamp(),
      });
    },

    deleteFeedback: (entryId, feedbackId) => fs.deleteDoc(fs.doc(db, "entries", entryId, "feedback", feedbackId)),

    // ---- Bilder: jedes Bild ist ein eigenes Objekt in der Sammlung "images" ----

    async uploadImage(dataUrl) {
      const ref = await fs.addDoc(fs.collection(db, "images"), { data: dataUrl, createdAt: fs.serverTimestamp() });
      imageCache.set(ref.id, Promise.resolve(dataUrl));
      return ref.id;
    },

    getImage(id) {
      if (!imageCache.has(id)) {
        const loading = fs.getDoc(imageRef(id)).then((snap) => {
          if (!snap.exists()) throw new Error("Bild nicht gefunden");
          return snap.data().data;
        });
        loading.catch(() => imageCache.delete(id)); // beim nächsten Mal nochmal versuchen
        imageCache.set(id, loading);
      }
      return imageCache.get(id);
    },

    deleteImages: (ids) => Promise.all(ids.map((id) => fs.deleteDoc(imageRef(id)).catch(() => {}))),
  };
}

// ---------------------------------------------------------------
// Variante 2: Demo (localStorage)
// ---------------------------------------------------------------

function createDemoStore() {
  const DATA_KEY = "portfolio-demo-data";
  const USER_KEY = "portfolio-demo-user";
  const IMAGES_KEY = "portfolio-demo-images";
  const FULL = "Der Browser-Speicher ist voll (Demo-Modus). Bitte ein Bild entfernen.";

  const read = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch {
      return fallback;
    }
  };

  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      throw new Error(FULL);
    }
  };

  const load = () => read(DATA_KEY, { entries: {}, feedback: {} });
  const save = (data) => write(DATA_KEY, data);
  const loadImages = () => read(IMAGES_KEY, {});
  const saveImages = (images) => write(IMAGES_KEY, images);

  let current = null;
  let listener = () => {};
  try {
    const saved = localStorage.getItem(USER_KEY);
    current = saved ? describeUser(saved) : null;
  } catch {
    current = null;
  }

  const setUser = (email) => {
    current = email ? describeUser(email) : null;
    try {
      if (email) localStorage.setItem(USER_KEY, email);
      else localStorage.removeItem(USER_KEY);
    } catch {
      // Speichern nicht möglich (z.B. privates Fenster) -> Login gilt nur bis zum Neuladen
    }
    listener(current);
  };

  const withDates = (entry) => ({ ...entry, createdAt: toDate(entry.createdAt), updatedAt: toDate(entry.updatedAt) });
  const canSee = (entry) => entry.status === "published" || current?.role === "admin";
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  return {
    onAuthChange(callback) {
      listener = callback;
      queueMicrotask(() => callback(current));
    },

    async login(email) {
      const key = email.trim().toLowerCase();
      if (!people[key]) throw Object.assign(new Error("Unknown user"), { code: "auth/invalid-credential" });
      setUser(key);
    },

    // Nur im Demo-Modus: mit einem Klick als Admin oder Lehrer einloggen
    async demoLogin(role) {
      setUser(Object.keys(people).find((email) => people[email].role === role));
    },

    async logout() {
      setUser(null);
    },

    async resetPassword() {},

    async listEntries() {
      return Object.values(load().entries).filter(canSee).map(withDates);
    },

    async getEntry(id) {
      const entry = load().entries[id];
      return entry && canSee(entry) ? withDates(entry) : null;
    },

    async saveEntry(id, data) {
      const all = load();
      const now = new Date().toISOString();
      const fields = pickEntryFields(data);
      if (id && all.entries[id]) {
        all.entries[id] = { ...all.entries[id], ...fields, updatedAt: now };
      } else {
        const base = slugify(fields.title);
        id = base;
        for (let n = 2; id in all.entries; n++) id = `${base}-${n}`;
        all.entries[id] = { id, ...fields, createdAt: now, updatedAt: now };
      }
      save(all);
      return id;
    },

    async deleteEntry(id) {
      const all = load();
      const images = loadImages();
      imageIdsIn(all.entries[id]?.body).forEach((imageId) => delete images[imageId]);
      saveImages(images);
      delete all.entries[id];
      delete all.feedback[id];
      save(all);
    },

    async listFeedback(entryId) {
      return (load().feedback[entryId] || []).map((f) => ({ ...f, createdAt: toDate(f.createdAt) }));
    },

    async addFeedback(entryId, text) {
      const all = load();
      (all.feedback[entryId] ||= []).push({
        id: newId(),
        text,
        authorEmail: current.email,
        authorName: current.name,
        createdAt: new Date().toISOString(),
      });
      save(all);
    },

    async deleteFeedback(entryId, feedbackId) {
      const all = load();
      all.feedback[entryId] = (all.feedback[entryId] || []).filter((f) => f.id !== feedbackId);
      save(all);
    },

    async uploadImage(dataUrl) {
      const images = loadImages();
      const id = newId();
      images[id] = dataUrl;
      saveImages(images);
      return id;
    },

    async getImage(id) {
      const data = loadImages()[id];
      if (!data) throw new Error("Bild nicht gefunden");
      return data;
    },

    async deleteImages(ids) {
      const images = loadImages();
      ids.forEach((id) => delete images[id]);
      saveImages(images);
    },
  };
}
