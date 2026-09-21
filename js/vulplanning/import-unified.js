import { extractTextFromPdf } from './pdf-helper.js';
import { parseShiftText } from './import-rooster.js';
import { parseColliPdfText } from './import-colli.js';
import { showModal, closeModal, showToast } from '../main.js';

export function detectPdfType(text) {
    if (!text) return 'unknown';

    const lower = text.toLowerCase();
    if (lower.includes('overzicht colli') ||
        lower.includes('aantallen per groep') ||
        lower.includes('per bestelgroep') ||
        lower.includes('artikelgroep') ||
        lower.includes('totaal mc') ||
        lower.includes('totaal generaal')) {
        return 'colli';
    }

    if (lower.includes('dagrooster') ||
        lower.includes('aanwezig') ||
        lower.includes('goederenverwerking') ||
        lower.includes('afgedrukt op:') ||
        lower.includes('tijden')) {
        return 'rooster';
    }

    const lines = text.split('\n');
    let hasTimeRange = false;
    let hasColliRow = false;

    for (let line of lines) {
        if (/(\b(?:[01]?[0-9]|2[0-3]):[0-5][0-9])\s*-\s*((?:[01]?[0-9]|2[0-3]):[0-5][0-9]|(?:[01]?[0-9]|2[0-3])(?::(?:\.\.\.|\u2026)?|(?:\.\.\.|\u2026))?(?=\s|[|]|$))/.test(line)) {
            hasTimeRange = true;
        }
        if (/^(?:99999\s*)?(\d{1,4})\s+(.+?)\s+(\d+)/.test(line)) {
            hasColliRow = true;
        }
    }

    if (hasColliRow && !hasTimeRange) return 'colli';
    if (hasTimeRange && !hasColliRow) return 'rooster';

    return 'unknown';
}

export function openUnifiedImportModal({ onRoosterImport, onColliImport, availableUsers = [] }) {
    const modalContent = `
        <div class="modal-header">
            <h2 class="modal-title">PDF Documenten Importeren</h2>
            <p class="modal-subtitle">Upload hier je dagrooster of colli-overzicht PDF. Je kunt beide bestanden tegelijk of los selecteren.</p>
        </div>
        <div class="modal-body">
            <div class="pdf-dropzone" id="unified-pdf-dropzone">
                <span class="material-icons pdf-dropzone-icon">cloud_upload</span>
                <span class="pdf-dropzone-text" id="unified-dropzone-text">Sleep één of beide PDF's hierheen of klik om te kiezen</span>
                <span class="pdf-dropzone-subtext">Ondersteunt Dagrooster & Colli overzichten (.pdf)</span>
                <input type="file" id="unified-pdf-file-input" accept="application/pdf" multiple style="display: none;">
            </div>
            <div class="modal-footer">
                <button type="button" class="modal-btn-secondary" id="btn-cancel-unified-import">Annuleren</button>
            </div>
        </div>
    `;

    showModal(modalContent).then(overlay => {
        const dropzone = overlay.querySelector('#unified-pdf-dropzone');
        const fileInput = overlay.querySelector('#unified-pdf-file-input');
        const dropzoneText = overlay.querySelector('#unified-dropzone-text');
        const cancelBtn = overlay.querySelector('#btn-cancel-unified-import');

        cancelBtn.addEventListener('click', () => {
            closeModal(overlay);
        });

        dropzone.addEventListener('click', () => {
            fileInput.click();
        });

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                processFiles(Array.from(files));
            }
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files.length > 0) {
                processFiles(Array.from(fileInput.files));
            }
        });

        async function processFiles(files) {
            const pdfFiles = files.filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));

            if (pdfFiles.length === 0) {
                showToast('error', 'Selecteer a.u.b. geldige PDF bestanden.');
                return;
            }

            dropzoneText.textContent = `Bezig met verwerken van ${pdfFiles.length} bestand(en)...`;

            let importedRooster = false;
            let importedColli = false;
            let totalShifts = 0;
            let totalColliKeys = 0;

            for (const file of pdfFiles) {
                try {
                    const text = await extractTextFromPdf(file);
                    const type = detectPdfType(text);

                    if (type === 'rooster') {
                        const parsedShifts = parseShiftText(text, availableUsers);
                        if (parsedShifts.length > 0 && typeof onRoosterImport === 'function') {
                            onRoosterImport(parsedShifts);
                            importedRooster = true;
                            totalShifts += parsedShifts.length;
                        }
                    } else if (type === 'colli') {
                        const parsedColli = parseColliPdfText(text);
                        const colliCount = Object.keys(parsedColli).length;
                        if (colliCount > 0 && typeof onColliImport === 'function') {
                            onColliImport(parsedColli);
                            importedColli = true;
                            totalColliKeys += colliCount;
                        }
                    } else {
                        const shifts = parseShiftText(text, availableUsers);
                        const colli = parseColliPdfText(text);

                        if (shifts.length > 0 && typeof onRoosterImport === 'function') {
                            onRoosterImport(shifts);
                            importedRooster = true;
                            totalShifts += shifts.length;
                        } else if (Object.keys(colli).length > 0 && typeof onColliImport === 'function') {
                            onColliImport(colli);
                            importedColli = true;
                            totalColliKeys += Object.keys(colli).length;
                        } else {
                            showToast('error', `Kon type van ${file.name} niet automatisch herkennen.`);
                        }
                    }
                } catch (err) {
                    showToast('error', `Fout bij verwerken van ${file.name}: ` + err.message);
                }
            }

            closeModal(overlay);

            if (importedRooster && importedColli) {
                showToast('notification', `Dagrooster (${totalShifts} medewerkers) & Colli overzicht succesvol geïmporteerd!`);
            } else if (importedRooster) {
                showToast('notification', `Dagrooster succesvol geïmporteerd (${totalShifts} medewerkers)!`);
            } else if (importedColli) {
                showToast('notification', `Colli overzicht succesvol geïmporteerd!`);
            }
        }
    });
}
