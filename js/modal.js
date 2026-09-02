let modalPromise = null;

export async function initModal() {
    if (modalPromise) return modalPromise;

    modalPromise = (async () => {
        if (document.getElementById('appModalOverlay')) return;

        if (!document.querySelector('link[href*="modal.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'css/modal.css';
            document.head.appendChild(link);
        }

        try {
            const response = await fetch('modal.html');
            if (response.ok) {
                const html = await response.text();
                document.body.insertAdjacentHTML('beforeend', html);

                const overlay = document.getElementById('appModalOverlay');
                const closeBtn = document.getElementById('modalCloseBtn');

                if (closeBtn) {
                    closeBtn.addEventListener('click', closeModal);
                }

                if (overlay) {
                    overlay.addEventListener('click', (e) => {
                        if (e.target === overlay) {
                            closeModal();
                        }
                    });
                }

                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && overlay && overlay.classList.contains('active')) {
                        closeModal();
                    }
                });
            }
        } catch (error) {
        }
    })();

    return modalPromise;
}

export async function showModal(contentHtml) {
    await initModal();

    const overlay = document.getElementById('appModalOverlay');
    const content = document.getElementById('appModalContent');

    if (!overlay || !content) return;

    content.innerHTML = contentHtml || '';
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

export function closeModal() {
    const overlay = document.getElementById('appModalOverlay');
    if (!overlay) return;

    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

if (typeof window !== 'undefined') {
    window.showModal = showModal;
    window.closeModal = closeModal;
}
