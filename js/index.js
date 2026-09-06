import { getCurrentUser, getAvailableModules } from './main.js';

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

async function initDashboard() {
    const welcomeElement = document.getElementById('welcomeText');
    const gridElement = document.getElementById('dashboardGrid');

    const user = await getCurrentUser();
    if (!user) return;

    const displayName = user.full_name?.trim() || user.username?.trim();
    if (displayName && welcomeElement) {
        welcomeElement.textContent = `Welkom terug, ${displayName}`;
    }

    if (!gridElement) return;

    const modules = getAvailableModules(user.role);
    gridElement.innerHTML = modules.map(m => `
        <a href="${escapeHtml(m.href)}" class="dashboard-tile">
            <div class="tile-header">
                <div class="tile-icon-box">
                    <span class="material-icons">${escapeHtml(m.icon)}</span>
                </div>
                <span class="material-icons tile-arrow">arrow_forward</span>
            </div>
            <div class="tile-body">
                <h2 class="tile-title">${escapeHtml(m.title)}</h2>
                <p class="tile-desc">${escapeHtml(m.description)}</p>
            </div>
        </a>
    `).join('');
}

initDashboard();
