export const showConfirmModal = (title, message, onConfirm, delaySeconds = 0) => {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-message');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    const okBtn = document.getElementById('confirm-ok-btn');

    if (!modal || !titleEl || !msgEl || !cancelBtn || !okBtn) return;

    titleEl.textContent = title;
    msgEl.textContent = message;
    modal.style.display = 'flex';

    const originalOkText = okBtn.dataset.originalText || okBtn.textContent;
    okBtn.dataset.originalText = originalOkText;

    let timer = null;
    if (delaySeconds > 0) {
        okBtn.disabled = true;
        let count = delaySeconds;
        okBtn.textContent = `${originalOkText} (${count}s)`;
        timer = setInterval(() => {
            count--;
            if (count > 0) {
                okBtn.textContent = `${originalOkText} (${count}s)`;
            } else {
                clearInterval(timer);
                timer = null;
                okBtn.disabled = false;
                okBtn.textContent = originalOkText;
            }
        }, 1000);
    } else {
        okBtn.disabled = false;
        okBtn.textContent = originalOkText;
    }

    const close = () => {
        if (timer) clearInterval(timer);
        okBtn.disabled = false;
        okBtn.textContent = originalOkText;
        modal.style.display = 'none';
        cancelBtn.removeEventListener('click', handleCancel);
        okBtn.removeEventListener('click', handleOk);
    };

    const handleCancel = () => close();
    const handleOk = () => {
        if (okBtn.disabled) return;
        close();
        onConfirm();
    };

    cancelBtn.addEventListener('click', handleCancel);
    okBtn.addEventListener('click', handleOk);
};
