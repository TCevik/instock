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

    const closeModal = setupModal(modal, [cancelBtn]);

    const addCategoryRow = (container, name = '', norm = '') => {
        const row = document.createElement('div');
        row.className = 'modal-category-row';
        row.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 6px;';
        row.innerHTML = `
            <input type="text" placeholder="Categorie (bijv. Frisdrank)" value="${name}" class="modal-cat-name" style="flex: 2; padding: 6px 8px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color); font-size: 13px;">
            <input type="number" placeholder="Norm (colli/u)" value="${norm}" class="modal-cat-norm" style="flex: 1; padding: 6px 8px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color); font-size: 13px;">
            <button type="button" class="remove-cat-btn" style="background: none; border: none; color: var(--danger-color); cursor: pointer; padding: 2px;"><i class="material-icons" style="font-size: 18px;">close</i></button>
        `;
        row.querySelector('.remove-cat-btn').addEventListener('click', () => row.remove());
        container.appendChild(row);
    };

    const addPathBlock = (pathName = '') => {
        const block = document.createElement('div');
        block.className = 'modal-path-block';
        block.style.cssText = 'border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; background-color: var(--bg-color); display: flex; flex-direction: column; gap: 8px;';
        block.innerHTML = `
            <div style="display: flex; gap: 8px; align-items: center;">
                <input type="text" placeholder="Padnaam (bijv. Frisdrank, Bier)" value="${pathName}" class="modal-path-name" style="flex: 1; padding: 8px; background-color: var(--input-bg); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-color); font-weight: 600;">
                <button type="button" class="remove-path-btn" style="background: none; border: none; color: var(--danger-color); cursor: pointer; padding: 4px;"><i class="material-icons">delete</i></button>
            </div>
            <div class="modal-categories-container" style="display: flex; flex-direction: column; padding-left: 12px; border-left: 2px solid var(--border-color); margin-top: 4px;"></div>
            <button type="button" class="add-cat-btn" style="align-self: flex-start; padding: 4px 8px; font-size: 12px; background: none; border: 1px dashed var(--border-color); color: var(--text-color); border-radius: 4px; cursor: pointer;">+ Categorie Toevoegen</button>
        `;
        const catContainer = block.querySelector('.modal-categories-container');
        block.querySelector('.add-cat-btn').addEventListener('click', () => addCategoryRow(catContainer));
        block.querySelector('.remove-path-btn').addEventListener('click', () => block.remove());
        pathsList.appendChild(block);
        return catContainer;
    };

    const loadAndRender = async () => {
        pathsList.innerHTML = '';
        if (!storeId || !supabase) {
            const catC = addPathBlock();
            addCategoryRow(catC);
            return;
        }
        const { data } = await supabase.from('stores_info').select('paden_categorieen').eq('store_id', storeId).maybeSingle();
        const paden = data?.paden_categorieen;
        if (Array.isArray(paden) && paden.length > 0) {
            paden.forEach(p => {
                const catC = addPathBlock(p.name || '');
                if (Array.isArray(p.categories) && p.categories.length > 0) {
                    p.categories.forEach(c => addCategoryRow(catC, c.name || '', c.norm || ''));
                } else {
                    addCategoryRow(catC);
                }
            });
        } else {
            const catC = addPathBlock();
            addCategoryRow(catC);
        }
    };

    if (openBtn) {
        openBtn.addEventListener('click', async () => {
            await loadAndRender();
            modal.style.display = 'flex';
        });
    }

    if (addPathBtn) {
        addPathBtn.addEventListener('click', () => {
            const catC = addPathBlock();
            addCategoryRow(catC);
        });
    }

    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const pathBlocks = pathsList.querySelectorAll('.modal-path-block');
            const padenData = [];
            pathBlocks.forEach(b => {
                const name = b.querySelector('.modal-path-name').value.trim();
                if (!name) return;
                const categories = [];
                b.querySelectorAll('.modal-category-row').forEach(cr => {
                    const catName = cr.querySelector('.modal-cat-name').value.trim();
                    const norm = parseFloat(cr.querySelector('.modal-cat-norm').value) || 0;
                    if (catName) {
                        categories.push({ name: catName, norm });
                    }
                });
                padenData.push({ name, categories });
            });

            if (storeId && supabase) {
                await supabase.from('stores_info').upsert({ store_id: storeId, paden_categorieen: padenData }, { onConflict: 'store_id' });
            }
            if (closeModal) closeModal();
            if (onSaved) onSaved(padenData);
        });
    }
}