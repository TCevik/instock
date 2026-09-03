import { supabase, showToast, showModal, closeModal } from '../main.js';
import {
    openColliImportModal,
    arePathsMatchingDefault,
    getHardcodedPathsStructure
} from './import-colli.js';

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

let loadedPaths = [];
const colliCategoriesContainer = document.getElementById('colli-categories-container');
const btnImportColli = document.getElementById('btn-import-colli');

export async function loadStorePathsForColli() {
    if (!colliCategoriesContainer) return;

    try {
        const { data, error } = await supabase.functions.invoke('manage-store-settings', {
            body: { action: 'get_paths' }
        });

        if (error) {
            let msg = error.message || 'Kon paden niet laden';
            if (error.context && typeof error.context.json === 'function') {
                try {
                    const b = await error.context.json();
                    if (b && b.error) msg = b.error;
                } catch (_) {}
            }
            throw new Error(msg);
        }

        if (data && Array.isArray(data.default_paths)) {
            loadedPaths = data.default_paths;
        } else {
            loadedPaths = [];
        }

        renderColliTable(loadedPaths);
    } catch (err) {
        showToast('error', err.message || 'Fout bij ophalen van winkelpaden');
        loadedPaths = [];
        renderColliTable([]);
    }
}

export function renderColliTable(pathsList) {
    if (!colliCategoriesContainer) return;

    if (!pathsList || pathsList.length === 0) {
        colliCategoriesContainer.innerHTML = `
            <div class="empty-state" style="padding: 20px;">
                Geen vaste paden of categorieën geconfigureerd in de winkelinstellingen.
            </div>
        `;
        return;
    }

    let rowsHtml = '';

    pathsList.forEach(path => {
        const pathName = escapeHtml(path.name || 'Onbenoemd pad');
        const spiegelnorm = path.spiegelnorm !== undefined && path.spiegelnorm !== null ? path.spiegelnorm : 0;
        const restantennorm = path.restantennorm !== undefined && path.restantennorm !== null ? path.restantennorm : 0;
        const categories = Array.isArray(path.categories) ? path.categories : [];

        rowsHtml += `
            <tr class="colli-path-header-row">
                <td colspan="3">
                    <div class="colli-path-header-content">
                        <span class="colli-path-title">${pathName}</span>
                        <span class="colli-path-norms-badge">(Spiegelen: ${spiegelnorm}m | Restanten: ${restantennorm}m)</span>
                    </div>
                </td>
            </tr>
        `;

        if (categories.length === 0) {
            rowsHtml += `
                <tr class="colli-empty-cat-row">
                    <td colspan="3" class="colli-empty-cat-text">Geen categorieën in dit pad</td>
                </tr>
            `;
        } else {
            categories.forEach(cat => {
                const catName = escapeHtml(cat.name || 'Categorie');
                const norm = cat.norm !== undefined && cat.norm !== null ? cat.norm : 0;

                rowsHtml += `
                    <tr class="colli-item-row" data-path-name="${pathName}" data-category-name="${catName}" data-norm="${norm}">
                        <td class="colli-cat-name-cell">
                            <span class="colli-cat-name">${catName}</span>
                        </td>
                        <td class="colli-input-cell">
                            <input type="number" min="0" class="colli-amount-input input-field" placeholder="0" value="0">
                        </td>
                        <td class="colli-norm-cell">
                            <span class="colli-norm-value">${norm}</span>
                        </td>
                    </tr>
                `;
            });
        }
    });

    colliCategoriesContainer.innerHTML = `
        <div class="colli-table-responsive">
            <table class="colli-table">
                <thead>
                    <tr>
                        <th>Categorie</th>
                        <th class="th-colli">Aantal Colli</th>
                        <th class="th-norm">Norm (colli/u)</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
}

export function fillColliValues(colliMap) {
    if (!colliCategoriesContainer || !colliMap) return 0;

    const rows = colliCategoriesContainer.querySelectorAll('.colli-item-row');
    let matchedCount = 0;

    rows.forEach(row => {
        const catName = (row.getAttribute('data-category-name') || '').toLowerCase().trim();
        const input = row.querySelector('.colli-amount-input');
        if (!input) return;

        let amount = 0;
        if (colliMap.hasOwnProperty(catName)) {
            amount = colliMap[catName];
            matchedCount++;
        } else {
            const keys = Object.keys(colliMap);
            const foundKey = keys.find(k => k === catName || k.startsWith(catName) || catName.startsWith(k));
            if (foundKey) {
                amount = colliMap[foundKey];
                matchedCount++;
            }
        }

        input.value = amount || 0;
    });

    return matchedCount;
}

async function saveHardcodedPathsToStore() {
    const defaultStructure = getHardcodedPathsStructure();
    const { data, error } = await supabase.functions.invoke('manage-store-settings', {
        body: {
            action: 'update_paths',
            default_paths: defaultStructure
        }
    });

    if (error) {
        let msg = error.message || 'Fout bij opslaan van instellingen';
        if (error.context && typeof error.context.json === 'function') {
            try {
                const b = await error.context.json();
                if (b && b.error) msg = b.error;
            } catch (_) {}
        }
        throw new Error(msg);
    }

    if (data && data.error) {
        throw new Error(data.error);
    }

    loadedPaths = defaultStructure;
    renderColliTable(loadedPaths);
}

function promptPathMismatch(colliMap) {
    const modalContent = `
        <div class="modal-header">
            <h2 class="modal-title">Paden kartering verschilt</h2>
            <p class="modal-subtitle">De ingestelde paden en categorieën komen niet overeen met de standaard kartering van het colli overzicht document.</p>
        </div>
        <div class="modal-body">
            <p style="font-size: 13px; color: var(--text-color-muted); line-height: 1.5;">
                Wil je de huidige winkelpaden en categorieën overschrijven met de standaard paden en normen uit de PDF layout?
            </p>
            <div class="modal-footer" style="margin-top: 10px;">
                <button type="button" class="modal-btn-secondary" id="btn-cancel-overwrite">Behouden & Invoeren</button>
                <button type="button" class="btn" id="btn-confirm-overwrite">Paden Overschrijven</button>
            </div>
        </div>
    `;

    showModal(modalContent).then(overlay => {
        const cancelBtn = overlay.querySelector('#btn-cancel-overwrite');
        const confirmBtn = overlay.querySelector('#btn-confirm-overwrite');

        cancelBtn.addEventListener('click', () => {
            closeModal(overlay);
            fillColliValues(colliMap);
            showToast('notification', 'Colli ingevuld op huidige paden');
        });

        confirmBtn.addEventListener('click', async () => {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Bezig met opslaan...';
            try {
                await saveHardcodedPathsToStore();
                closeModal(overlay);
                fillColliValues(colliMap);
                showToast('notification', 'Winkelpaden bijgewerkt en colli succesvol ingevuld!');
            } catch (err) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Paden Overschrijven';
                showToast('error', err.message || 'Fout bij overschrijven paden');
            }
        });
    });
}

export function handleImportedColli(colliMap) {
    if (!colliMap || Object.keys(colliMap).length === 0) {
        showToast('error', 'Geen colli gegevens gevonden in het PDF bestand.');
        return;
    }

    const isMatching = arePathsMatchingDefault(loadedPaths);
    if (!isMatching) {
        promptPathMismatch(colliMap);
    } else {
        fillColliValues(colliMap);
        showToast('notification', 'Colli succesvol geïmporteerd!');
    }
}

if (btnImportColli) {
    btnImportColli.addEventListener('click', () => {
        openColliImportModal((colliMap) => {
            handleImportedColli(colliMap);
        });
    });
}

export function getColliData() {
    if (!colliCategoriesContainer) return [];

    const rows = colliCategoriesContainer.querySelectorAll('.colli-item-row');
    const result = [];

    rows.forEach(row => {
        const pathName = row.getAttribute('data-path-name');
        const categoryName = row.getAttribute('data-category-name');
        const norm = Number(row.getAttribute('data-norm')) || 0;
        const input = row.querySelector('.colli-amount-input');
        const colli = input ? (parseInt(input.value, 10) || 0) : 0;

        result.push({
            path: pathName,
            category: categoryName,
            norm,
            colli
        });
    });

    return result;
}

loadStorePathsForColli();

