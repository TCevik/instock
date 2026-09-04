import { showModal, closeModal, showToast } from '../main.js';

if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

export function cleanImportedName(rawName, availableUsers = []) {
    let name = (rawName || '').replace(/[\u2026.]+/g, '').replace(/\|/g, '').trim();

    if (!name) return '';

    if (availableUsers && availableUsers.length > 0) {
        const q = name.toLowerCase();

        const exactMatches = availableUsers.filter(u => {
            const fullName = (u.full_name || '').toLowerCase().trim();
            const username = (u.username || '').toLowerCase().trim();
            return fullName === q || username === q || `@${username}` === q;
        });

        if (exactMatches.length === 1) {
            return exactMatches[0].full_name?.trim() || exactMatches[0].username?.trim() || name;
        }

        const prefixMatches = availableUsers.filter(u => {
            const fullName = (u.full_name || '').toLowerCase().trim();
            return fullName.startsWith(q);
        });

        if (prefixMatches.length === 1) {
            return prefixMatches[0].full_name?.trim() || name;
        }

        const containsMatches = availableUsers.filter(u => {
            const fullName = (u.full_name || '').toLowerCase().trim();
            const username = (u.username || '').toLowerCase().trim();
            return fullName.includes(q) || username.includes(q);
        });

        if (containsMatches.length === 1) {
            return containsMatches[0].full_name?.trim() || containsMatches[0].username?.trim() || name;
        }
    }

    return name;
}

export function parseShiftText(rawText, availableUsers = []) {
    if (!rawText || !rawText.trim()) return [];

    const lines = rawText.split('\n');
    const shifts = [];

    for (let rawLine of lines) {
        let line = rawLine.trim();
        if (!line) continue;

        if (line.includes('Dagrooster |') ||
            line.includes('Afgedrukt op:') ||
            line.startsWith('Winkel:') ||
            line.startsWith('Aanwezig') ||
            line.startsWith('Tijden') ||
            line.startsWith('05:00') ||
            line.startsWith('06:00') ||
            line.startsWith('07:00') ||
            line.startsWith('Goederenverwerking')) {
            continue;
        }

        if (/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]\s+(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]/.test(line)) {
            continue;
        }

        const timeMatches = [...line.matchAll(/(\b(?:[01]?[0-9]|2[0-3]):[0-5][0-9])\s*-\s*((?:[01]?[0-9]|2[0-3]):[0-5][0-9])/g)];
        if (timeMatches.length === 0) continue;

        const firstMatchIndex = timeMatches[0].index;
        let rawName = line.substring(0, firstMatchIndex).trim();

        rawName = rawName.replace(/^(Goederenverwerking|Verkoop|Kassa|Vakkenvullen)\s+/i, '').trim();
        const name = cleanImportedName(rawName, availableUsers);
        if (!name) continue;

        const startTimes = timeMatches.map(m => m[1]);
        const endTimes = timeMatches.map(m => m[2]);

        const formatHHMM = (t) => {
            const [h, m] = t.split(':');
            return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
        };

        const earliestStart = formatHHMM(startTimes[0]);
        const latestEnd = formatHHMM(endTimes[endTimes.length - 1]);

        let pauseStr = '0 min';
        const pauseMatches = [...line.matchAll(/\b(0[0-9]|1[0-9]|2[0-3]):([0-5][0-9])\b/g)];
        const candidateDurations = pauseMatches.filter(m => {
            const idx = m.index;
            return idx > firstMatchIndex;
        });

        if (candidateDurations.length >= 1) {
            let pMatch = candidateDurations[candidateDurations.length - 1];
            if (candidateDurations.length >= 2) {
                pMatch = candidateDurations[candidateDurations.length - 2];
            }
            const pHours = parseInt(pMatch[1], 10);
            const pMins = parseInt(pMatch[2], 10);
            const totalPauseMins = pHours * 60 + pMins;
            pauseStr = `${totalPauseMins} min`;
        }

        shifts.push({
            name,
            from: earliestStart,
            to: latestEnd,
            pause: pauseStr
        });
    }

    return shifts;
}

import { extractTextFromPdf } from './pdf-helper.js';

export { extractTextFromPdf };

export function openImportModal(onImport, availableUsers = []) {
    const modalContent = `
        <div class="modal-header">
            <h2 class="modal-title">Rooster PDF Uploaden</h2>
            <p class="modal-subtitle">Upload hier het dagrooster PDF-bestand.</p>
        </div>
        <div class="modal-body">
            <div class="pdf-dropzone" id="pdf-dropzone">
                <span class="material-icons pdf-dropzone-icon">cloud_upload</span>
                <span class="pdf-dropzone-text" id="dropzone-text">Sleep je dagrooster PDF hierheen of klik om te kiezen</span>
                <span class="pdf-dropzone-subtext">Ondersteunt .pdf bestanden</span>
                <input type="file" id="pdf-file-input" accept="application/pdf" style="display: none;">
            </div>
            <div class="modal-footer">
                <button type="button" class="modal-btn-secondary" id="btn-cancel-import">Annuleren</button>
            </div>
        </div>
    `;

    showModal(modalContent).then(overlay => {
        const dropzone = overlay.querySelector('#pdf-dropzone');
        const fileInput = overlay.querySelector('#pdf-file-input');
        const dropzoneText = overlay.querySelector('#dropzone-text');
        const cancelBtn = overlay.querySelector('#btn-cancel-import');

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
                handleFile(files[0]);
            }
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files.length > 0) {
                handleFile(fileInput.files[0]);
            }
        });

        async function handleFile(file) {
            if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
                showToast('error', 'Upload a.u.b. een geldig PDF bestand.');
                return;
            }

            dropzoneText.textContent = `Bezig met verwerken van ${file.name}...`;

            try {
                const text = await extractTextFromPdf(file);
                const parsed = parseShiftText(text, availableUsers);
                closeModal(overlay);
                if (typeof onImport === 'function') {
                    onImport(parsed);
                }
            } catch (err) {
                dropzoneText.textContent = 'Sleep je dagrooster PDF hierheen of klik om te kiezen';
                showToast('error', 'Fout bij het uitlezen van de PDF: ' + err.message);
            }
        }
    });
}
