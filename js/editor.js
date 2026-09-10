// ===========================================
// editor.js — der Texteditor (Quill)
//
// Absichtlich nur wenige Knöpfe: keine Schriftgrössen, keine Farben.
// So sehen alle Einträge gleich aus (Bewertungskriterium "Formatting").
//
// Bilder werden im Browser verkleinert und direkt im Eintrag gespeichert –
// ein eigener Datei-Speicher bei Firebase wäre kostenpflichtig.
// ===========================================

const MAX_IMAGE_WIDTH = 1200; // Pixel
const IMAGE_QUALITY = 0.8;    // JPEG-Qualität (0–1)

// Bild-Datei -> verkleinertes JPEG als Text (data:image/jpeg;base64,...)
async function shrinkImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; // durchsichtige PNGs bekommen weissen Hintergrund
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  return canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
}

async function insertImages(quill, files, index) {
  for (const file of files) {
    try {
      const dataUrl = await shrinkImage(file);
      quill.insertEmbed(index, "image", dataUrl, "user");
      index += 1;
    } catch (error) {
      alert(`Das Bild "${file.name}" konnte nicht geladen werden.`);
      console.error(error);
    }
  }
  quill.setSelection(index, 0, "silent");
}

// Knopf "Bild" in der Werkzeugleiste
function pickImage(quill) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.addEventListener("change", () => {
    const files = [...(input.files || [])];
    if (files.length) insertImages(quill, files, quill.getSelection(true).index);
  });
  input.click();
}

export function createEditor(element, initialHtml = "") {
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
        handlers: { image: () => pickImage(quill) },
      },
      // Bilder per Drag & Drop oder Einfügen (Strg+V) auch verkleinern
      uploader: {
        handler(range, files) {
          insertImages(quill, files, range.index);
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
    // Fertiges, bereinigtes HTML zum Speichern ("" wenn leer)
    getHtml() {
      const isEmpty = quill.getText().trim() === "" && !quill.root.querySelector("img");
      if (isEmpty) return "";
      return DOMPurify.sanitize(quill.getSemanticHTML().replace(/&nbsp;/g, " "));
    },
    onChange(callback) {
      quill.on("text-change", callback);
    },
  };
}
