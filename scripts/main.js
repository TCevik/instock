import { supabasePromise } from './supabase.js';
import { showToast } from './toast.js';

(function initCachedTheme() {
    const hex = localStorage.getItem('store_primary_color');
    if (hex) {
        document.documentElement.style.setProperty('--accent-color', hex);
        const r = parseInt(hex.slice(1, 3), 16) || 101;
        const g = parseInt(hex.slice(3, 5), 16) || 141;
        const b = parseInt(hex.slice(5, 7), 16) || 36;
        document.documentElement.style.setProperty('--vullen-bg', `rgba(${r}, ${g}, ${b}, 0.15)`);
        document.documentElement.style.setProperty('--vullen-card-bg', `rgba(${r}, ${g}, ${b}, 0.05)`);
        document.documentElement.style.setProperty('--vullen-border', `rgba(${r}, ${g}, ${b}, 0.3)`);
        document.documentElement.style.setProperty('--pdf-new-bg', `rgba(${r}, ${g}, ${b}, 0.15)`);
        document.documentElement.style.setProperty('--pdf-new-border', `rgba(${r}, ${g}, ${b}, 0.5)`);
        document.documentElement.style.setProperty('--status-new-bg', `rgba(${r}, ${g}, ${b}, 0.2)`);
        document.documentElement.style.setProperty('--gem-verk-bg', `rgba(${r}, ${g}, ${b}, 0.15)`);
    }
})();

export async function getSupabase() {
    return supabasePromise;
}

export async function checkAuth(allowedRoles = null) {
    const supabase = await getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
        return null;
    }

    const { data, error } = await supabase.from('user_data').select('role, winkel').eq('id', session.user.id).single();
    if (error || !data) {
        window.location.href = 'login.html';
        return null;
    }

    if (allowedRoles && !allowedRoles.includes(data.role)) {
        window.location.href = 'index.html';
        return null;
    }

    let storeCode = '';
    if (session.user.email) {
        const parts = session.user.email.split('@');
        if (parts.length > 1) {
            storeCode = parts[1].split('.')[0].toLowerCase();
        }
    }

    return { session, userData: data, storeCode };
}

export function showMessage(messageBox, messageText, messageIcon, text, type) {
    if (text) {
        showToast(text, type);
    }
    if (messageBox) {
        messageBox.style.display = 'none';
    }
}

export function setupModal(modal, closeButtons, onReset) {
    if (!modal) return;
    const closeModal = () => {
        if (modal.classList.contains('open')) {
            modal.classList.remove('open');
        } else {
            modal.style.display = 'none';
        }
        if (onReset) onReset();
    };

    if (closeButtons) {
        closeButtons.forEach(btn => {
            if (btn) {
                btn.addEventListener('click', closeModal);
            }
        });
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    return closeModal;
}

export async function handleFormSubmit(submitBtn, loadingText, messageBox, actionFn) {
    if (!submitBtn) return;
    const originalText = submitBtn.querySelector('span') ? submitBtn.querySelector('span').textContent : submitBtn.textContent;
    const btnTextSpan = submitBtn.querySelector('span');

    if (messageBox) messageBox.style.display = 'none';
    submitBtn.disabled = true;
    if (btnTextSpan) {
        btnTextSpan.textContent = loadingText;
    } else {
        submitBtn.textContent = loadingText;
    }

    try {
        await actionFn();
    } catch (err) {
        console.error(err);
    } finally {
        submitBtn.disabled = false;
        if (btnTextSpan) {
            btnTextSpan.textContent = originalText;
        } else {
            submitBtn.textContent = originalText;
        }
    }
}

export function initPadenModal(supabase, storeId, onSaved) {
    const openBtn = document.getElementById('open-paden-modal-btn');
    const modal = document.getElementById('paden-modal');
    if (!modal) return;

    const pathsList = document.getElementById('modal-paths-list');
    const addPathBtn = document.getElementById('modal-add-path-btn');
    const cancelBtn = document.getElementById('paden-modal-cancel-btn');
    const saveBtn = document.getElementById('paden-modal-save-btn');

    const addCategoryRow = (catTbody, name = '', norm = '', catIdx = 0) => {
        const tr = document.createElement('tr');
        tr.className = 'modal-category-row';
        tr.setAttribute('data-path-idx', catIdx);
        tr.innerHTML = `
            <td style="padding: 3px 4px;">
                <input type="text" placeholder="bijv. Frisdrank" value="${name}" class="modal-cat-name modal-path-input" style="width: 100%;">
            </td>
            <td style="padding: 3px 4px; width: 140px;">
                <input type="number" placeholder="colli/u" value="${norm}" class="modal-cat-norm modal-path-input" style="width: 100%;">
            </td>
            <td style="padding: 3px 4px; text-align: right; width: 40px;">
                <button type="button" class="remove-cat-btn action-btn delete" style="padding: 6px; border-radius: 6px;" title="Categorie Verwijderen"><i class="material-icons" style="font-size: 16px;">delete</i></button>
            </td>
        `;
        tr.querySelector('.remove-cat-btn').addEventListener('click', () => tr.remove());
        catTbody.appendChild(tr);
    };

    const addPathBlock = (pathName = '', mirrorNorm = '') => {
        const pathIdx = Date.now() + Math.random();

        const card = document.createElement('div');
        card.className = 'modal-path-card';

        const header = document.createElement('div');
        header.className = 'modal-path-header modal-path-card-header';
        header.setAttribute('data-path-idx', pathIdx);
        header.innerHTML = `
            <div style="display: flex; gap: 8px; align-items: center; flex: 1; min-width: 200px;">
                <input type="text" placeholder="bijv. Frisdrank, Bier" value="${pathName}" class="modal-path-name modal-path-input" style="flex: 1; font-weight: 600;">
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
                <span class="modal-path-label" style="color: var(--text-color-muted);">SPIEGELNORM (MIN):</span>
                <input type="number" placeholder="min" value="${mirrorNorm}" class="modal-path-mirror-norm modal-path-input" style="width: 75px;">
            </div>
            <div style="display: flex; gap: 6px; align-items: center; margin-left: auto;">
                <button type="button" class="add-cat-btn action-btn" style="padding: 6px 10px; background-color: var(--accent-color); color: #fff; display: flex; align-items: center; border-radius: 6px;" title="Categorie Toevoegen"><i class="material-icons" style="font-size: 16px;">add</i></button>
                <button type="button" class="remove-path-btn action-btn delete" style="padding: 6px; border-radius: 6px;" title="Pad Verwijderen"><i class="material-icons" style="font-size: 16px;">delete</i></button>
            </div>
        `;

        const tableContainer = document.createElement('div');
        tableContainer.innerHTML = `
            <table class="modal-cat-table">
                <thead>
                    <tr>
                        <th>Categorie</th>
                        <th style="width: 140px;">Norm (colli/u)</th>
                        <th style="width: 40px;"></th>
                    </tr>
                </thead>
                <tbody class="modal-cat-tbody"></tbody>
            </table>
        `;
        const catTbody = tableContainer.querySelector('.modal-cat-tbody');

        card.appendChild(header);
        card.appendChild(tableContainer);
        pathsList.appendChild(card);

        const addCat = (cName = '', cNorm = '') => addCategoryRow(catTbody, cName, cNorm, pathIdx);

        header.querySelector('.add-cat-btn').addEventListener('click', () => addCat());
        header.querySelector('.remove-path-btn').addEventListener('click', () => card.remove());

        return { addCategoryRow: addCat };
    };

    const loadAndRender = async () => {
        pathsList.innerHTML = '';
        if (!storeId || !supabase) {
            const pathRes = addPathBlock();
            pathRes.addCategoryRow();
            return;
        }
        let paden = null;
        const { data: vpData } = await supabase.from('vulplanningen').select('instellingen').eq('id', storeId).maybeSingle();
        if (vpData?.instellingen?.paden_categorieen && vpData.instellingen.paden_categorieen.length > 0) {
            paden = vpData.instellingen.paden_categorieen;
        } else {
            const { data: storeData } = await supabase.from('stores_info').select('paden_categorieen').eq('store_id', storeId).maybeSingle();
            if (storeData?.paden_categorieen && storeData.paden_categorieen.length > 0) {
                paden = storeData.paden_categorieen;
            }
        }
        if (!paden || paden.length === 0) {
            const pathRes = addPathBlock();
            pathRes.addCategoryRow();
        } else {
            paden.forEach(p => {
                const pathRes = addPathBlock(p.name || '', p.mirrorNorm !== undefined ? p.mirrorNorm : '');
                if (Array.isArray(p.categories) && p.categories.length > 0) {
                    p.categories.forEach(c => pathRes.addCategoryRow(c.name || '', c.norm || ''));
                } else {
                    pathRes.addCategoryRow();
                }
            });
        }
    };

    const closeModal = () => modal.style.display = 'none';

    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeModal);
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    if (openBtn) {
        openBtn.addEventListener('click', async () => {
            await loadAndRender();
            modal.style.display = 'flex';
        });
    }

    if (addPathBtn) {
        addPathBtn.addEventListener('click', () => {
            const pathRes = addPathBlock();
            pathRes.addCategoryRow();
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const tbody = document.getElementById('modal-paths-tbody') || pathsList;
            const headerRows = tbody.querySelectorAll('.modal-path-header');
            const padenData = [];
            headerRows.forEach(headerTr => {
                const pathIdx = headerTr.getAttribute('data-path-idx');
                const name = headerTr.querySelector('.modal-path-name').value.trim();
                if (!name) return;
                const mirrorNormVal = headerTr.querySelector('.modal-path-mirror-norm').value;
                const mirrorNorm = mirrorNormVal !== '' ? parseFloat(mirrorNormVal) : 21;
                const categories = [];
                tbody.querySelectorAll(`tr.modal-category-row[data-path-idx="${pathIdx}"]`).forEach(cr => {
                    const catName = cr.querySelector('.modal-cat-name').value.trim();
                    const norm = parseFloat(cr.querySelector('.modal-cat-norm').value) || 0;
                    if (catName) {
                        categories.push({ name: catName, norm });
                    }
                });
                padenData.push({ name, mirrorNorm, categories });
            });

            if (storeId && supabase) {
                const { error: storeError } = await supabase.from('stores_info').upsert({ store_id: storeId, paden_categorieen: padenData }, { onConflict: 'store_id' });
                if (storeError) {
                    showToast('Fout bij opslaan in stores_info: ' + storeError.message, 'error');
                }
                const { error: vpError } = await supabase.from('vulplanningen').upsert({ id: storeId, instellingen: { paden_categorieen: padenData } }, { onConflict: 'id' });
                if (vpError) {
                    showToast('Fout bij opslaan van instellingen: ' + vpError.message, 'error');
                } else {
                    showToast('Paden en normen opgeslagen!', 'success');
                }
            }
            closeModal();
            if (onSaved) onSaved(padenData);
        });
    }
}