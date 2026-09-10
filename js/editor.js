// ===========================================
// editor.js — der Texteditor (Quill)
//
// Absichtlich nur wenige Knöpfe: keine Schriftgrössen, keine Farben.
// So sehen alle Einträge gleich aus (Bewertungskriterium "Formatting").
//
// Bilder: werden im Browser verkleinert und als EIGENES Objekt in Firebase
// gespeichert (Sammlung "images"). Im Eintrag steht nur <img data-image-id="...">.
// So gilt die 1-MB-Grenze von Firebase pro Bild – nicht pro Eintrag.
// (Firebase Storage wäre der "richtige" Datei-Speicher, verlangt aber eine Kreditkarte.)
// ===========================================

// Firebase erlaubt max. 1 MB pro Objekt -> jedes Bild muss darunter bleiben
const MAX_IMAGE_CHARS = 900_000;

// Der Reihe nach probieren, bis das Bild klein genug ist: [max. Breite in Pixel, JPEG-Qualität]
const IMAGE_STEPS = [[1600, 0.85], [1280, 0.78], [1000, 0.7], [800, 0.6]];

// Quill-Bild, das sich zusätzlich die ID des Bildes in Firebase merkt
const BaseImage = Quill.import("formats/image");

class PortfolioImage extends BaseImage {
  static create(value) {
    const node = super.create(typeof value === "string" ? value : value?.src || "");
    if (value?.id) node.setAttribute("data-image-id", value.id);
    return node;
  }

  static value(node) {
    const id = node.getAttribute("data-image-id");
    const src = node.getAttribute("src") || "";
    return id ? { src, id } : src;
  }
}

Quill.register("formats/image", PortfolioImage, true);

// Bild auf eine Leinwand zeichnen und als JPEG-Text zurückgeben
function drawJpeg(bitmap, maxWidth, quality) {
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; // durchsichtige PNGs bekommen weissen Hintergrund
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL("image/jpeg", quality);
}

// Datei/Blob -> verkleinertes JPEG, das sicher unter der Grenze liegt
async function shrink(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    for (const [maxWidth, quality] of IMAGE_STEPS) {
      const dataUrl = drawJpeg(bitmap, maxWidth, quality);
      if (dataUrl.length <= MAX_IMAGE_CHARS) return dataUrl;
    }
    throw new Error("Das Bild ist auch verkleinert noch zu gross.");
  } finally {
    bitmap.close?.();
  }
}

// Bild, das schon als Text im Eintrag steckt (z.B. aus Word eingefügt) -> verkleinern
const shrinkDataUrl = async (dataUrl) => shrink(await (await fetch(dataUrl)).blob());

// options:
//   uploadImage(dataUrl) -> Promise<id>   Bild in Firebase speichern
//   onStatus(text)                        Statuszeile ("Bild wird hochgeladen …", "" = fertig)
//   onError(error, name)                  Bild konnte nicht hochgeladen werden
export function createEditor(element, initialHtml = "", { uploadImage, onStatus = () => {}, onError = () => {} } = {}) {
  const pending = new Set(); // Bilder, die gerade hochgeladen werden

  // Bilder verkleinern, hochladen und ab Position "index" einfügen
  function insertImages(files, index) {
    const job = (async () => {
      for (const file of files) {
        const name = file.name || "Bild";
        onStatus(`Bild wird hochgeladen … (${name})`);
        try {
          const src = await shrink(file);
          const id = await uploadImage(src);
          quill.insertEmbed(index, "image", { src, id }, "user");
          index += 1;
        } catch (error) {
          console.error(error);
          onError(error, name);
        }
      }
      quill.setSelection(index, 0, "silent");
    })();

    pending.add(job);
    job.finally(() => {
      pending.delete(job);
      if (!pending.size) onStatus("");
    });
    return job;
  }

  // Knopf "Bild" in der Werkzeugleiste
  function pickImage() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.addEventListener("change", () => {
      const files = [...(input.files || [])];
      if (files.length) insertImages(files, quill.getSelection(true).index);
    });
    input.click();
  }

  const quill = new Quill(element, {
    theme: "snow",
    placeholder: "Write your entry here…",
    modules: {
      toolbar: {
        container: [
          [{ header: [2, 3, false] }],
          ["bold", "italic", "underline"],
          [{ list: "ordered" }, { list: "bullet" }],
          ["blockquote", "link", "image"],
          ["clean"],
        ],
        handlers: { image: pickImage },
      },
      // Bilder per Drag & Drop oder Einfügen (Strg+V) genauso behandeln
      uploader: {
        handler(range, files) {
          insertImages(files, range.index);
        },
      },
    },
  });

  // Rechtschreibprüfung des Browsers auf Englisch
  quill.root.setAttribute("spellcheck", "true");
  quill.root.setAttribute("lang", "en");

  if (initialHtml) {
    quill.clipboard.dangerouslyPasteHTML(DOMPurify.sanitize(initialHtml), "silent");
  }

  return {
    // Fertiges, bereinigtes HTML zum Speichern ("" wenn leer).
    // Wartet auf laufende Uploads und lagert eingefügte Bilder noch aus.
    async getHtml() {
      await Promise.all([...pending]);

      const isEmpty = quill.getText().trim() === "" && !quill.root.querySelector("img");
      if (isEmpty) return "";

      const template = document.createElement("template");
      template.innerHTML = quill.getSemanticHTML().replace(/&nbsp;/g, " ");

      for (const img of template.content.querySelectorAll("img")) {
        const src = img.getAttribute("src") || "";
        if (!img.dataset.imageId && src.startsWith("data:")) {
          img.dataset.imageId = await uploadImage(await shrinkDataUrl(src));
        }
        // Im Eintrag nur die ID speichern – das Bild selbst liegt separat
        if (img.dataset.imageId) img.removeAttribute("src");
      }

      return DOMPurify.sanitize(template.innerHTML);
    },

    onChange(callback) {
      quill.on("text-change", callback);
    },
  };
}
