import { getSupabase, handleFormSubmit } from './main.js';
import { loadHeader } from './header.js';
import { showToast } from './toast.js';

const initDashboard = async () => {
    const supabase = await getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (session && session.user) {
        const { data } = await supabase
            .from('user_data')
            .select('full_name')
            .eq('id', session.user.id);
        const welcomeEl = document.getElementById("welcome-message");
        if (welcomeEl) {
            if (data && data[0] && data[0].full_name) {
                welcomeEl.textContent = `Welkom, ${data[0].full_name}!`;
            } else {
                welcomeEl.textContent = "Welkom terug!";
            }
        }
    }
};

const setupPasswordModal = () => {
    const modal = document.getElementById('passwordModal');
    const openBtn = document.getElementById('changePasswordBtn');
    const closeBtn = document.getElementById('closePasswordModal');
    const form = document.getElementById('change-password-form');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');

    if (!modal || !form) return;

    const openModal = () => {
        form.reset();
        modal.classList.add('open');
    };

    const closeModal = () => {
        modal.classList.remove('open');
        form.reset();
    };

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (!newPassword) {
            showToast('Vul een nieuw wachtwoord in.', 'error');
            return;
        }

        if (newPassword.length < 6) {
            showToast('Wachtwoord moet minimaal 6 tekens lang zijn.', 'error');
            return;
        }

        if (!confirmPassword) {
            showToast('Vul de bevestiging van het wachtwoord in.', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            showToast('Wachtwoorden komen niet overeen.', 'error');
            return;
        }

        const submitBtn = form.querySelector('.submit-btn');
        await handleFormSubmit(submitBtn, 'Bezig met opslaan...', null, async () => {
            const supabase = await getSupabase();
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) {
                showToast(error.message, 'error');
            } else {
                showToast('Wachtwoord succesvol gewijzigd.', 'success');
                closeModal();
            }
        });
    });
};

const generateDashboardCards = () => {
    const grid = document.getElementById("dashboardGrid");
    if (!grid) return;
    grid.innerHTML = "";
    const items = document.querySelectorAll(".drawer-item");
    items.forEach(item => {
        if (item.style.display === "none") return;
        const text = item.querySelector("span").textContent.trim();
        if (text.toLowerCase() === "dashboard") return;
        const icon = item.querySelector("i").textContent.trim();
        const href = item.getAttribute("href");

        const card = document.createElement("a");
        card.className = "dashboard-card";
        card.href = href;

        if (href === "#") {
            card.addEventListener("click", (e) => {
                e.preventDefault();
                item.click();
            });
        }

        const iconContainer = document.createElement("div");
        iconContainer.className = "dashboard-card-icon";
        const iconEl = document.createElement("i");
        iconEl.className = "material-icons";
        iconEl.textContent = icon;
        iconContainer.appendChild(iconEl);

        const title = document.createElement("div");
        title.className = "dashboard-card-title";
        title.textContent = text;

        const arrow = document.createElement("i");
        arrow.className = "material-icons dashboard-card-arrow";
        arrow.textContent = "arrow_forward";

        card.appendChild(iconContainer);
        card.appendChild(title);
        card.appendChild(arrow);
        grid.appendChild(card);
    });
};

window.addEventListener("menuReady", generateDashboardCards);

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        loadHeader();
        initDashboard();
        setupPasswordModal();
    });
} else {
    loadHeader();
    initDashboard();
    setupPasswordModal();
}
