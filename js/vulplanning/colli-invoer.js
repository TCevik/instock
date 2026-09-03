import { supabase, showToast } from '../main.js';

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

let loadedPaths = [];
const colliCategoriesContainer = document.getElementById('colli-categories-container');

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
            <div class="empty-state" style="padding: 30px 20px;">
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
