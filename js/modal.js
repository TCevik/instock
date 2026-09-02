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

export async function showModal(contentHtml) {
    ensureStyles();

    const zIndex = BASE_Z_INDEX + modalStack.length * 10;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = String(zIndex);
    overlay.setAttribute('aria-hidden', 'true');

    overlay.innerHTML = `
        <div class="modal-container" role="dialog" aria-modal="true">
            <button type="button" class="modal-close-btn" aria-label="Sluiten">
                <span class="material-icons">close</span>
            </button>
            <div class="modal-content">${contentHtml || ''}</div>
        </div>
    `;

    document.body.appendChild(overlay);
    modalStack.push(overlay);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');
    });

    const closeBtn = overlay.querySelector('.modal-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeModal(overlay));
    }

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal(overlay);
        }
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

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalStack.length > 0) {
        closeModal();
    }
});

if (typeof window !== 'undefined') {
    window.showModal = showModal;
    window.closeModal = closeModal;
    window.showConfirmModal = showConfirmModal;
}
