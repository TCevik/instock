import {
  getCurrentUser,
  getAvailableModules,
  openAccountModal,
} from "./main.js";

const dashShapes = document.querySelector(".dashboard-shapes");
if (dashShapes) {
  const shapes = [
    '<rect x="3" y="3" width="18" height="18" rx="2" />',
    '<circle cx="12" cy="12" r="9" />',
    '<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />',
    '<polygon points="12 3 22 21 2 21" />'
  ];
  for (let i = 1; i <= 10; i++) {
    dashShapes.insertAdjacentHTML("beforeend", `<svg class="dash-shape dash-shape-${i}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${shapes[(i - 1) % 4]}</svg>`);
  }
}

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
    accountBtn.addEventListener("click", (e) => {});
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
