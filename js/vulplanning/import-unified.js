import { parsePdfWithEdge } from './pdf-helper.js';
import { showModal, closeModal, showToast } from '../main.js';

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

            dropzoneText.textContent = 'Bezig met verwerken...';

            try {
                const result = await parsePdfWithEdge(pdfFiles, { availableUsers });
                closeModal(overlay);

                if (result.shifts && result.shifts.length > 0 && typeof onRoosterImport === 'function') {
                    onRoosterImport(result.shifts);
                }
                if (result.colli && Object.keys(result.colli).length > 0 && typeof onColliImport === 'function') {
                    onColliImport(result.colli, result.pathsMatchingDefault);
                }
                if (result.message) {
                    showToast('notification', result.message);
                }
            } catch (err) {
                dropzoneText.textContent = 'Sleep één of beide PDF\'s hierheen of klik om te kiezen';
                showToast('error', err.message || 'Fout bij verwerken');
            }
        }
    });
}
