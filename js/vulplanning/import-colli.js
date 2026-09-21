import { extractTextFromPdf } from "./pdf-helper.js";
import { showModal, closeModal, showToast } from "../main.js";

export const HARDCODED_PATHS_MAPPING = {
  "Wijn, Chips, Nootjes": ["Wijnen", "Zoutjes Snacks"],
  "Frisdrank, Bier": ["Frisdrank", "Bieren", "Vruchtensappen"],
  Ontbijt: ["Ontbijtvervangers", "Boterhambeleg"],
  "Koffie, Koek, Chocolade": [
    "Koffie Thee",
    "Koffiemelk",
    "Koekjes",
    "Chocolade",
    "Suikerwerk",
    "Suiker",
  ],
  "Maaltijdstraat Conserven": [
    "Groenteconserven",
    "Vleesconserven",
    "Zuren sauzen",
    "Soepen",
    "Houdbare zuivel",
    "Gezondheidsvoeding",
  ],
  "Maaltijdstraat Oosters": [
    "Rijst en deegwaren",
    "Maaltijdstraat LDC + Specerijen",
  ],
  "Eieren, Afbakbrood": ["Eieren", "Meelproducten"],
  "Non Food": [
    "Papierwaren",
    "Kindervoeding",
    "Luiers",
    "Wasmiddelen",
    "Reinigingsmiddelen",
    "Sorbo",
    "Huishoudelijk",
    "Nonfood",
    "Persoonlijke verzorging",
    "Dierenvoeding",
  ],
  Diepvries: ["Diepvries"],
  Zuivel: ["Zuivel", "Geelvetten"],
  Vlees: ["Vers vlees", "Vis"],
  Vleeswaren: ["Vleeswaren AV/AVA", "Vleeswaren ZB"],
  Kaas: ["Kaas AV/AVA", "Kaas ZB"],
};

export const HARDCODED_NORMS = {
  wijnen: 50,
  "zoutjes snacks": 60,
  frisdrank: 80,
  bieren: 80,
  vruchtensappen: 75,
  ontbijtvervangers: 50,
  boterhambeleg: 50,
  "koffie thee": 50,
  koffiemelk: 50,
  koekjes: 50,
  chocolade: 50,
  suikerwerk: 50,
  suiker: 50,
  groenteconserven: 50,
  vleesconserven: 50,
  "zuren sauzen": 50,
  soepen: 50,
  "houdbare zuivel": 50,
  gezondheidsvoeding: 50,
  "rijst en deegwaren": 50,
  "maaltijdstraat ldc + specerijen": 50,
  eieren: 34,
  meelproducten: 50,
  papierwaren: 80,
  kindervoeding: 50,
  luiers: 50,
  wasmiddelen: 54,
  reinigingsmiddelen: 54,
  sorbo: 88,
  huishoudelijk: 88,
  nonfood: 88,
  "persoonlijke verzorging": 60,
  dierenvoeding: 50,
  diepvries: 60,
  zuivel: 60,
  geelvetten: 46,
  "vers vlees": 80,
  vis: 100,
  "vleeswaren av/ava": 90,
  "vleeswaren zb": 70,
  "kaas av/ava": 100,
  "kaas zb": 60,
};

export const HARDCODED_MIRROR_TIMES = {
  "Wijn, Chips, Nootjes": 15,
  "Frisdrank, Bier": 21,
  Ontbijt: 10,
  "Koffie, Koek, Chocolade": 21,
  "Maaltijdstraat Conserven": 21,
  "Maaltijdstraat Oosters": 21,
  "Eieren, Afbakbrood": 15,
  "Non Food": 21,
  Diepvries: 21,
  Zuivel: 21,
  Vlees: 21,
  Vleeswaren: 21,
  Kaas: 21,
};

export const HARDCODED_RESTANTEN_TIMES = {
  "Wijn, Chips, Nootjes": 15,
  "Frisdrank, Bier": 20,
  Ontbijt: 5,
  "Koffie, Koek, Chocolade": 5,
  "Maaltijdstraat Conserven": 5,
  "Maaltijdstraat Oosters": 5,
  "Eieren, Afbakbrood": 5,
  "Non Food": 15,
  Diepvries: 5,
  Zuivel: 15,
  Vlees: 10,
  Vleeswaren: 5,
  Kaas: 5,
};

export function getHardcodedPathsStructure() {
  return Object.keys(HARDCODED_PATHS_MAPPING).map((pathName) => {
    const catNames = HARDCODED_PATHS_MAPPING[pathName];
    return {
      name: pathName,
      spiegelnorm: HARDCODED_MIRROR_TIMES[pathName] || 0,
      restantennorm: HARDCODED_RESTANTEN_TIMES[pathName] || 0,
      categories: catNames.map((cName) => {
        const normKey = cName.toLowerCase().trim();
        return {
          name: cName,
          norm: HARDCODED_NORMS[normKey] || 50,
        };
      }),
    };
  });
}

export function parseColliPdfText(rawText) {
  if (!rawText || !rawText.trim()) return {};

  const lines = rawText.split("\n");
  const colliMap = {};

  for (let rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;

    if (
      line.includes("Overzicht colli") ||
      line.includes("aantallen per groep") ||
      line.includes("Lammenschans") ||
      line.startsWith("Artikelgroep") ||
      line.startsWith("Totaal") ||
      line.startsWith("CBO") ||
      line.startsWith("Plus Retail") ||
      line.startsWith("Blz.") ||
      line.includes("per bestelgroep")
    ) {
      continue;
    }

    const match = line.match(
      /^(?:99999\s*)?(\d{1,4})\s+(.+?)\s+(\d+)(?:\s+[A-Z0-9].*)?$/i,
    );
    if (match) {
      const desc = match[2].trim();
      const totalColli = parseInt(match[3], 10);
      if (!isNaN(totalColli) && desc.length > 1) {
        colliMap[desc.toLowerCase()] = totalColli;
      }
    }
  }

  return colliMap;
}

export function arePathsMatchingDefault(currentPaths) {
  if (!Array.isArray(currentPaths) || currentPaths.length === 0) return false;

  const expectedStructure = getHardcodedPathsStructure();
  if (currentPaths.length !== expectedStructure.length) return false;

  for (let i = 0; i < expectedStructure.length; i++) {
    const expPath = expectedStructure[i];
    const curPath = currentPaths[i];

    if (!curPath) return false;
    if (
      (curPath.name || "").trim().toLowerCase() !== expPath.name.toLowerCase()
    )
      return false;

    const curCats = Array.isArray(curPath.categories) ? curPath.categories : [];
    if (curCats.length !== expPath.categories.length) return false;

    for (let j = 0; j < expPath.categories.length; j++) {
      const expCat = expPath.categories[j];
      const curCat = curCats[j];
      if (!curCat) return false;
      if (
        (curCat.name || "").trim().toLowerCase() !== expCat.name.toLowerCase()
      )
        return false;
    }
  }

  return true;
}

export function openColliImportModal(onImport) {
  const modalContent = `
        <div class="modal-header">
            <h2 class="modal-title">Colli PDF Uploaden</h2>
            <p class="modal-subtitle">Upload hier het overzicht colli aantallen per groep PDF-bestand.</p>
        </div>
        <div class="modal-body">
            <div class="pdf-dropzone" id="colli-pdf-dropzone">
                <span class="material-icons pdf-dropzone-icon">cloud_upload</span>
                <span class="pdf-dropzone-text" id="colli-dropzone-text">Sleep je colli PDF hierheen of klik om te kiezen</span>
                <span class="pdf-dropzone-subtext">Ondersteunt .pdf bestanden</span>
                <input type="file" id="colli-pdf-file-input" accept="application/pdf" style="display: none;">
            </div>
            <div class="modal-footer">
                <button type="button" class="modal-btn-secondary" id="btn-cancel-colli-import">Annuleren</button>
            </div>
        </div>
    `;

  showModal(modalContent).then((overlay) => {
    const dropzone = overlay.querySelector("#colli-pdf-dropzone");
    const fileInput = overlay.querySelector("#colli-pdf-file-input");
    const dropzoneText = overlay.querySelector("#colli-dropzone-text");
    const cancelBtn = overlay.querySelector("#btn-cancel-colli-import");

    cancelBtn.addEventListener("click", () => {
      closeModal(overlay);
    });

    dropzone.addEventListener("click", () => {
      fileInput.click();
    });

    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });

    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("dragover");
    });

    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    });

    fileInput.addEventListener("change", () => {
      if (fileInput.files && fileInput.files.length > 0) {
        handleFile(fileInput.files[0]);
      }
    });

    async function handleFile(file) {
      if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
        showToast("error", "Upload a.u.b. een geldig PDF bestand.");
        return;
      }

      dropzoneText.textContent = `Bezig met verwerken van ${file.name}...`;

      try {
        const text = await extractTextFromPdf(file);
        const parsedColli = parseColliPdfText(text);
        closeModal(overlay);
        if (typeof onImport === "function") {
          onImport(parsedColli);
        }
      } catch (err) {
        dropzoneText.textContent =
          "Sleep je colli PDF hierheen of klik om te kiezen";
        showToast("error", "Fout bij het uitlezen van de PDF: " + err.message);
      }
    }
  });
}
