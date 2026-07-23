export function showToast(message, type = 'error', duration = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; pointer-events: none;';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const borderColor = type === 'success' ? 'var(--accent-color)' : (type === 'warning' ? 'var(--warning-color)' : 'var(--danger-color)');
    toast.style.cssText = `pointer-events: auto; min-width: 280px; max-width: 380px; padding: 12px 16px; border-radius: 8px; font-size: 14px; font-weight: 500; color: var(--text-color); background-color: var(--card-bg); border: 1px solid var(--border-color); display: flex; align-items: center; gap: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); opacity: 0; transform: translateY(12px); transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); border-left: 4px solid ${borderColor};`;

    const iconName = type === 'success' ? 'check_circle' : (type === 'warning' ? 'warning' : 'error');
    toast.innerHTML = `<i class="material-icons" style="color: ${borderColor}; font-size: 20px;">${iconName}</i><span style="flex: 1; line-height: 1.4;">${message}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(12px)';
        setTimeout(() => toast.remove(), 250);
    }, duration);
}
