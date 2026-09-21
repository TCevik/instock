import {
  getCurrentUser,
  getAvailableModules,
  openAccountModal,
} from "./main.js";

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function initDashboard() {
  const welcomeElement = document.getElementById("welcomeText");
  const gridElement = document.getElementById("dashboardGrid");
  const accountBtn = document.getElementById("dashboardAccountBtn");

  if (accountBtn && window.innerWidth > 768) {
    accountBtn.addEventListener("click", (e) => {
      // Optional: on desktop, user can also open modal directly if preferred or navigate
      // but standard link navigation to account.html works seamlessly.
    });
  }

  const user = await getCurrentUser();
  if (!user) return;

  const displayName = user.full_name?.trim() || user.username?.trim();
  if (displayName && welcomeElement) {
    welcomeElement.textContent = `Welkom terug, ${displayName}`;
  }

  const countBadge = document.getElementById("moduleCountBadge");
  const modules = getAvailableModules(user.role);

  if (countBadge) {
    countBadge.textContent = `${modules.length} actief`;
  }

  gridElement.innerHTML = modules
    .map(
      (m, index) => `
        <a href="${escapeHtml(m.href)}" class="dashboard-tile">
            <div class="tile-header">
                <div class="tile-icon-box">
                    <span class="material-icons">${escapeHtml(m.icon)}</span>
                </div>
                <div class="tile-action-pill">
                    <span>Openen</span>
                    <span class="material-icons tile-arrow">arrow_forward</span>
                </div>
            </div>
            <div class="tile-body">
                <h2 class="tile-title">${escapeHtml(m.title)}</h2>
                <p class="tile-desc">${escapeHtml(m.description)}</p>
            </div>
        </a>
    `,
    )
    .join("");
}

initDashboard();
