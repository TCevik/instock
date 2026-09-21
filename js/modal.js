const modalStack = [];
const BASE_Z_INDEX = 2000;

function ensureStyles() {
    if (!document.querySelector('link[href*="modal.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'css/modal.css';
        document.head.appendChild(link);
    }
}

export async function initModal() {
    ensureStyles();
}

function getMainModalButton(overlay) {
    if (!overlay) return null;
    const footer = overlay.querySelector('.modal-footer');
    if (footer) {
        const btns = Array.from(footer.querySelectorAll('button:not([disabled]):not(.modal-close-btn), input[type="button"]:not([disabled]), input[type="submit"]:not([disabled])'))
            .filter(el => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0 || getComputedStyle(el).display !== 'none');
        if (btns.length > 0) {
            return btns[btns.length - 1];
        }
    }
    const allBtns = Array.from(overlay.querySelectorAll('.modal-container button:not(.modal-close-btn):not([disabled])'))
        .filter(el => el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0 || getComputedStyle(el).display !== 'none');
    if (allBtns.length > 0) {
        return allBtns[allBtns.length - 1];
    }
    return null;
}

function focusModalMainButton(overlay) {
    if (!overlay) return;
    const mainBtn = getMainModalButton(overlay);
    if (mainBtn) {
        mainBtn.focus();
    }
}

export async function showModal(contentHtml, extraClass = '') {
    ensureStyles();

    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }

    const zIndex = BASE_Z_INDEX + modalStack.length * 10;
    const overlay = document.createElement('div');
    overlay.className = `modal-overlay ${extraClass || ''}`.trim();
    overlay.style.zIndex = String(zIndex);
    overlay.setAttribute('aria-hidden', 'true');

    overlay.innerHTML = `
        <div class="modal-container" role="dialog" aria-modal="true">
            <div class="modal-bottom-sheet-handle" aria-hidden="true"></div>
            <button type="button" class="modal-close-btn" aria-label="Sluiten">
                <span class="material-icons">close</span>
            </button>
            <div class="modal-content">${contentHtml || ''}</div>
        </div>
    `;

    document.body.appendChild(overlay);
    modalStack.push(overlay);
    document.body.style.overflow = 'hidden';

    const container = overlay.querySelector('.modal-container');
    if (container) {
        void container.offsetHeight;
    }
    void overlay.offsetHeight;

    requestAnimationFrame(() => {
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
        focusModalMainButton(overlay);
    });

    setTimeout(() => {
        if (!overlay.contains(document.activeElement) || document.activeElement === overlay || document.activeElement === container) {
            focusModalMainButton(overlay);
        }
    }, 50);

    const closeBtn = overlay.querySelector('.modal-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeModal(overlay));
    }

    let isOverlayMouseDown = false;
    overlay.addEventListener('mousedown', (e) => {
        isOverlayMouseDown = (e.target === overlay);
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay && isOverlayMouseDown) {
            closeModal(overlay);
        }
        isOverlayMouseDown = false;
    });

    return overlay;
}

export function closeModal(targetOverlay = null) {
    let overlayToClose = null;

    if (targetOverlay instanceof HTMLElement) {
        overlayToClose = targetOverlay.closest('.modal-overlay') || targetOverlay;
        const index = modalStack.indexOf(overlayToClose);
        if (index !== -1) {
            modalStack.splice(index, 1);
        }
    } else if (targetOverlay && targetOverlay.target instanceof HTMLElement) {
        overlayToClose = targetOverlay.target.closest('.modal-overlay');
        const index = modalStack.indexOf(overlayToClose);
        if (index !== -1) {
            modalStack.splice(index, 1);
        }
    } else {
        overlayToClose = modalStack.pop();
    }

    if (overlayToClose && overlayToClose.parentNode) {
        overlayToClose.classList.remove('active');
        overlayToClose.setAttribute('aria-hidden', 'true');
        setTimeout(() => {
            if (overlayToClose.parentNode) {
                overlayToClose.remove();
            }
        }, 200);
    }

    if (modalStack.length === 0) {
        document.body.style.overflow = '';
    } else {
        focusModalMainButton(modalStack[modalStack.length - 1]);
    }
}

export function showConfirmModal({ title = 'Bevestigen', message, confirmText = 'Verwijderen', cancelText = 'Annuleren', isDanger = true }) {
    return new Promise(async (resolve) => {
        const btnClass = isDanger ? 'btn-danger-confirm' : 'btn';
        const overlay = await showModal(`
            <div class="modal-header">
                <h2 class="modal-title">${title}</h2>
                <p class="modal-subtitle">${message}</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="modal-btn-secondary" id="confirmModalCancelBtn">${cancelText}</button>
                <button type="button" class="${btnClass}" id="confirmModalConfirmBtn">${confirmText}</button>
            </div>
        `);

        const confirmBtn = overlay.querySelector('#confirmModalConfirmBtn');
        const cancelBtn = overlay.querySelector('#confirmModalCancelBtn');

        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                closeModal(overlay);
                resolve(true);
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                closeModal(overlay);
                resolve(false);
            });
        }
    });
}

export function showPromptModal({ title = 'Invoer', subtitle = '', placeholder = '', confirmText = 'Toevoegen', cancelText = 'Annuleren', initialValue = '' }) {
    return new Promise(async (resolve) => {
        const overlay = await showModal(`
            <div class="modal-header">
                <h2 class="modal-title">${title}</h2>
                ${subtitle ? `<p class="modal-subtitle">${subtitle}</p>` : ''}
            </div>
            <form class="modal-form" id="promptModalForm">
                <div class="form-group">
                    <input type="text" id="promptModalInput" class="modal-input" placeholder="${placeholder}" value="${initialValue}" required>
                </div>
                <div class="modal-footer">
                    <button type="button" class="modal-btn-secondary" id="promptModalCancelBtn">${cancelText}</button>
                    <button type="submit" class="btn" id="promptModalConfirmBtn">${confirmText}</button>
                </div>
            </form>
        `);

        const input = overlay.querySelector('#promptModalInput');
        const form = overlay.querySelector('#promptModalForm');
        const cancelBtn = overlay.querySelector('#promptModalCancelBtn');

        if (input) {
            setTimeout(() => input.focus(), 50);
        }

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const val = input ? input.value.trim() : '';
                closeModal(overlay);
                resolve(val || null);
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                closeModal(overlay);
                resolve(null);
            });
        }
    });
}

document.addEventListener('keydown', (e) => {
    if (modalStack.length === 0) return;
    const currentOverlay = modalStack[modalStack.length - 1];

    if (e.key === 'Escape') {
        closeModal(currentOverlay);
        return;
    }

    if (e.key === 'Enter') {
        const activeEl = document.activeElement;
        const activeTag = activeEl ? activeEl.tagName.toLowerCase() : '';
        if (activeTag === 'textarea') return;
        if (activeTag === 'button' || (activeEl && activeEl.getAttribute('role') === 'button')) return;
        if (activeTag === 'input') {
            const form = activeEl.closest('form');
            if (form) return;
        }

        const targetBtn = getMainModalButton(currentOverlay);
        if (targetBtn) {
            e.preventDefault();
            targetBtn.click();
        }
    }
});

if (typeof window !== 'undefined') {
    window.showModal = showModal;
    window.closeModal = closeModal;
    window.showConfirmModal = showConfirmModal;
    window.showPromptModal = showPromptModal;
}
