import { showToast } from './toast.js';

export function setupModal(modal, closeButtons, onReset) {
    if (!modal) return;
    const closeModal = () => {
        modal.classList.remove('open');
        modal.style.display = '';
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

export function showConfirmModal(title, message, btnTextOrCallback, onConfirmArg, onCancelArg, cancelBtnText) {
    let btnText, onConfirm;
    if (typeof btnTextOrCallback === 'function') {
        btnText = 'Overschrijven';
        onConfirm = btnTextOrCallback;
    } else {
        btnText = btnTextOrCallback;
        onConfirm = onConfirmArg;
    }
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-message');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    const okBtn = document.getElementById('confirm-ok-btn');

    if (!modal || !titleEl || !msgEl || !cancelBtn || !okBtn) return;

    titleEl.textContent = title;
    if (typeof message === 'string' && message.includes('<')) {
        msgEl.innerHTML = message;
    } else {
        msgEl.textContent = message;
    }
    okBtn.textContent = btnText;
    cancelBtn.textContent = cancelBtnText || 'Annuleren';
    modal.style.display = 'flex';

    const close = () => {
        modal.style.display = 'none';
        cancelBtn.removeEventListener('click', handleCancel);
        okBtn.removeEventListener('click', handleOk);
    };

    const handleCancel = () => {
        close();
        if (typeof onCancelArg === 'function') onCancelArg();
    };
    const handleOk = () => {
        close();
        onConfirm();
    };

    cancelBtn.addEventListener('click', handleCancel);
    okBtn.addEventListener('click', handleOk);
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
        const { data: vpData } = await supabase.from('vulplanningen').select('instellingen').eq('id', storeId).maybeSingle();
        let paden = vpData?.instellingen?.paden_categorieen || null;
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
            const pathHeaders = pathsList.querySelectorAll('.modal-path-header');
            const padenData = [];
            let missingName = false;

            pathHeaders.forEach(header => {
                const pathIdx = header.getAttribute('data-path-idx');
                const pathName = header.querySelector('.modal-path-name').value.trim();
                const mirrorNormVal = header.querySelector('.modal-path-mirror-norm').value;
                const mirrorNorm = mirrorNormVal !== '' ? parseInt(mirrorNormVal, 10) : 21;

                if (!pathName) missingName = true;

                const catRows = pathsList.querySelectorAll(`.modal-category-row[data-path-idx="${pathIdx}"]`);
                const categories = [];

                catRows.forEach(row => {
                    const catName = row.querySelector('.modal-cat-name').value.trim();
                    const normVal = row.querySelector('.modal-cat-norm').value;
                    const norm = normVal !== '' ? parseInt(normVal, 10) : 62;
                    if (catName) {
                        categories.push({ name: catName, norm });
                    }
                });

                if (pathName) {
                    padenData.push({ name: pathName, mirrorNorm, categories });
                }
            });

            if (missingName) {
                showToast('Vul een naam in voor elk pad', 'error');
                return;
            }

            if (storeId && supabase) {
                await supabase.from('vulplanningen').upsert({
                    id: storeId,
                    instellingen: { paden_categorieen: padenData }
                });
            }

            closeModal();
            showToast('Paden & Categorieën opgeslagen', 'success');
            if (onSaved) onSaved(padenData);
        });
    }
}

export function showLoadingOverlay(text = 'Opslaan...') {
    let overlay = document.getElementById('global-loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'global-loading-overlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-spinner"></div>
            <span class="loading-overlay-text">${text}</span>
        `;
        document.body.appendChild(overlay);
    } else {
        const textEl = overlay.querySelector('.loading-overlay-text');
        if (textEl) textEl.textContent = text;
    }
    requestAnimationFrame(() => {
        overlay.classList.add('active');
    });
}

export function hideLoadingOverlay() {
    const overlay = document.getElementById('global-loading-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}
