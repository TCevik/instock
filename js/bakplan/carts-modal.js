import { showModal, closeModal } from '../modal.js';
import { DEFAULT_CARTS } from './schedule-calculator.js';

export function getStoredCarts() {
    try {
        const stored = localStorage.getItem('bakplan_carts_config');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (e) {}
    return DEFAULT_CARTS;
}

export function openCartsModal(bakplanData, onConfirm) {
    const categories = (bakplanData || []).map(cat => ({ id: cat.id, name: cat.name || '' }));
    let carts = JSON.parse(JSON.stringify(getStoredCarts()));

    const renderRowsHtml = () => {
        return carts.map((cart, index) => {
            const isMixed = cart.type === 'mixed';
            const catOptions = categories.map(cat => `
                <option value="${cat.name}" ${cart.reservedCategory === cat.name ? 'selected' : ''}>
                    ${cat.name}
                </option>
            `).join('');

            return `
                <tr data-index="${index}">
                    <td>
                        <input type="text" class="cart-modal-input cart-input-name" value="${cart.name || `Kar ${index + 1}`}">
                    </td>
                    <td>
                        <select class="cart-modal-select cart-select-type">
                            <option value="single" ${cart.type === 'single' ? 'selected' : ''}>1 Categorie</option>
                            <option value="mixed" ${cart.type === 'mixed' ? 'selected' : ''}>Gemixt</option>
                        </select>
                    </td>
                    <td>
                        <select class="cart-modal-select cart-select-cat" ${isMixed ? 'disabled' : ''}>
                            <option value="" ${!cart.reservedCategory ? 'selected' : ''}>Alle categorieën</option>
                            ${catOptions}
                        </select>
                    </td>
                    <td>
                        <input type="number" min="1" max="99" class="cart-modal-input cart-input-cap" value="${cart.capacity || 15}">
                    </td>
                    <td>
                        <div class="cart-toggle-wrapper">
                            <span class="cart-toggle-label label-thaw ${!cart.oven ? 'active' : ''}">Ontdooien</span>
                            <label class="cart-switch">
                                <input type="checkbox" class="cart-toggle-oven" ${cart.oven ? 'checked' : ''}>
                                <span class="cart-slider"></span>
                            </label>
                            <span class="cart-toggle-label label-oven ${cart.oven ? 'active' : ''}">Oven</span>
                        </div>
                    </td>
                    <td style="text-align: center;">
                        <button type="button" class="cart-row-delete-btn" title="Verwijderen">
                            <span class="material-icons">delete</span>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    };

    const modalHtml = `
        <div class="modal-header">
            <h2 class="modal-title">Karren Beheren</h2>
        </div>
        <div class="modal-body" style="gap: 12px;">
            <div class="carts-table-wrapper">
                <table class="carts-table">
                    <thead>
                        <tr>
                            <th style="width: 22%;">NAAM / NR</th>
                            <th style="width: 20%;">SAMENVOEGEN</th>
                            <th style="width: 32%;">CATEGORIE</th>
                            <th style="width: 12%;">CAPACITEIT</th>
                            <th style="width: 14%;">OVEN / ONTDOOI</th>
                            <th style="width: 40px;"></th>
                        </tr>
                    </thead>
                    <tbody id="carts-table-body">
                        ${renderRowsHtml()}
                    </tbody>
                </table>
            </div>
            <div class="carts-actions-row">
                <button type="button" class="btn-add-cart-row" id="btn-add-cart-row">
                    <span class="material-icons">add</span> Kar Toevoegen
                </button>
            </div>
        </div>
        <div class="modal-footer">
            <button type="button" class="modal-btn-secondary" id="btn-carts-cancel">Annuleren</button>
            <button type="button" class="btn-primary btn-sm" id="btn-carts-save" style="padding: 10px 24px; font-size: 14px; font-weight: 600;">Opslaan</button>
        </div>
    `;

    showModal(modalHtml, 'modal-carts-wide').then(overlay => {
        const tableBody = overlay.querySelector('#carts-table-body');
        const btnAddRow = overlay.querySelector('#btn-add-cart-row');
        const btnCancel = overlay.querySelector('#btn-carts-cancel');
        const btnSave = overlay.querySelector('#btn-carts-save');

        const bindEvents = () => {
            tableBody.querySelectorAll('tr').forEach((row, idx) => {
                const typeSelect = row.querySelector('.cart-select-type');
                const catSelect = row.querySelector('.cart-select-cat');
                const ovenToggle = row.querySelector('.cart-toggle-oven');
                const labelThaw = row.querySelector('.label-thaw');
                const labelOven = row.querySelector('.label-oven');
                const btnDelete = row.querySelector('.cart-row-delete-btn');

                typeSelect.addEventListener('change', (e) => {
                    const isMixed = e.target.value === 'mixed';
                    catSelect.disabled = isMixed;
                    if (isMixed) catSelect.value = '';
                    carts[idx].type = e.target.value;
                    if (isMixed) carts[idx].reservedCategory = '';
                });

                ovenToggle.addEventListener('change', (e) => {
                    const isOven = e.target.checked;
                    carts[idx].oven = isOven;
                    if (isOven) {
                        labelOven.classList.add('active');
                        labelThaw.classList.remove('active');
                    } else {
                        labelThaw.classList.add('active');
                        labelOven.classList.remove('active');
                    }
                });

                btnDelete.addEventListener('click', () => {
                    carts.splice(idx, 1);
                    tableBody.innerHTML = renderRowsHtml();
                    bindEvents();
                });
            });
        };

        bindEvents();

        if (btnAddRow) {
            btnAddRow.addEventListener('click', () => {
                const newId = carts.length + 1;
                carts.push({
                    id: newId,
                    name: `Kar ${newId}`,
                    type: 'single',
                    reservedCategory: '',
                    capacity: 15,
                    oven: true
                });
                tableBody.innerHTML = renderRowsHtml();
                bindEvents();
            });
        }

        if (btnCancel) {
            btnCancel.addEventListener('click', () => {
                closeModal(overlay);
            });
        }

        if (btnSave) {
            btnSave.addEventListener('click', () => {
                const rows = tableBody.querySelectorAll('tr');
                const finalCarts = [];

                rows.forEach((row, idx) => {
                    const nameInput = row.querySelector('.cart-input-name');
                    const typeSelect = row.querySelector('.cart-select-type');
                    const catSelect = row.querySelector('.cart-select-cat');
                    const capInput = row.querySelector('.cart-input-cap');
                    const ovenToggle = row.querySelector('.cart-toggle-oven');

                    const capVal = parseInt(capInput.value, 10);
                    finalCarts.push({
                        id: idx + 1,
                        name: nameInput.value.trim() || `Kar ${idx + 1}`,
                        type: typeSelect.value,
                        reservedCategory: typeSelect.value === 'mixed' ? '' : (catSelect.value || ''),
                        capacity: isNaN(capVal) || capVal <= 0 ? 15 : capVal,
                        oven: ovenToggle.checked
                    });
                });

                try {
                    localStorage.setItem('bakplan_carts_config', JSON.stringify(finalCarts));
                } catch (e) {}

                closeModal(overlay);
                if (onConfirm) onConfirm(finalCarts);
            });
        }
    });
}
