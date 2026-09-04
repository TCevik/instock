import { supabase } from './supabase.js';
import { initModal, showModal, closeModal, showConfirmModal, showPromptModal } from './modal.js';
import { initToast, showToast } from './toast.js';

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
const INACTIVITY_WARNING_MS = INACTIVITY_TIMEOUT_MS - 60 * 1000;
const LAST_ACTIVITY_KEY = 'instock_last_activity';
let inactivityWarningShown = false;

function recordActivity() {
    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
}

function checkInactivity() {
    const isLoginPage = window.location.pathname.endsWith('login.html');
    if (isLoginPage) return;

    const last = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (last) {
        const elapsed = Date.now() - Number(last);
        if (elapsed > INACTIVITY_TIMEOUT_MS) {
            logout();
            return;
        }
        if (elapsed > INACTIVITY_WARNING_MS && !inactivityWarningShown) {
            inactivityWarningShown = true;
            showConfirmModal({
                title: 'Ben je er nog?',
                message: 'Je wordt over 60 seconden automatisch uitgelogd wegens inactiviteit.',
                confirmText: 'Ja, ik ben er nog',
                cancelText: 'Uitloggen',
                isDanger: false
            }).then((confirmed) => {
                inactivityWarningShown = false;
                if (confirmed) {
                    recordActivity();
                } else {
                    logout();
                }
            });
        }
    }
}

function initInactivityTracker() {
    if (window.location.pathname.endsWith('login.html')) return;

    recordActivity();

    let lastRecorded = 0;
    const updateThrottled = () => {
        const now = Date.now();
        if (now - lastRecorded > 2000) {
            lastRecorded = now;
            recordActivity();
        }
    };

    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'].forEach((event) => {
        window.addEventListener(event, updateThrottled, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkInactivity();
            updateThrottled();
        }
    });

    window.addEventListener('focus', () => {
        checkInactivity();
        updateThrottled();
    });

    setInterval(checkInactivity, 5000);
}

async function checkAuth() {
    const isLoginPage = window.location.pathname.endsWith('login.html');
    const { data: { session } } = await supabase.auth.getSession();

    if (!session && !isLoginPage) {
        window.location.replace('login.html');
        return;
    } else if (session && isLoginPage) {
        window.location.replace('index.html');
        return;
    }

    if (!isLoginPage) {
        const last = localStorage.getItem(LAST_ACTIVITY_KEY);
        if (last && Date.now() - Number(last) > INACTIVITY_TIMEOUT_MS) {
            await logout();
            return;
        }
        recordActivity();
    }

    supabase.auth.onAuthStateChange((_event, newSession) => {
        if (!newSession && !window.location.pathname.endsWith('login.html')) {
            window.location.replace('login.html');
        }
    });
}

let currentUserData = null;

export async function getCurrentUser() {
    if (currentUserData) return currentUserData;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) return null;

    const { data, error } = await supabase
        .from('user_data')
        .select('full_name, username, store_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

    if (error || !data) return null;

    currentUserData = data;
    return currentUserData;
}

async function loadOverlay() {
    if (window.location.pathname.endsWith('login.html')) return;

    try {
        const response = await fetch('overlay.html');
        if (response.ok) {
            const html = await response.text();
            document.body.insertAdjacentHTML('afterbegin', html);

            const currentPath = window.location.pathname.split('/').pop() || 'index.html';
            const links = document.querySelectorAll('.sidebar-link');
            links.forEach(link => {
                if (link.getAttribute('href') === currentPath) {
                    link.classList.add('active');
                }
            });

            const sidebar = document.querySelector('.app-sidebar');
            const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
            const sidebarBackdrop = document.getElementById('sidebarBackdrop');

            function toggleSidebar() {
                if (!sidebar) return;
                const isOpen = sidebar.classList.toggle('open');
                if (sidebarBackdrop) {
                    sidebarBackdrop.classList.toggle('active', isOpen);
                }
            }

            function closeSidebar() {
                if (sidebar) sidebar.classList.remove('open');
                if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
            }

            if (sidebarToggleBtn) {
                sidebarToggleBtn.addEventListener('click', toggleSidebar);
            }

            if (sidebarBackdrop) {
                sidebarBackdrop.addEventListener('click', closeSidebar);
            }

            links.forEach(link => {
                link.addEventListener('click', closeSidebar);
            });

            const changePasswordBtn = document.getElementById('changePasswordBtn');
            if (changePasswordBtn) {
                changePasswordBtn.addEventListener('click', openChangePasswordModal);
            }

            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', logout);
            }

            const headerUserName = document.getElementById('headerUserName');
            if (headerUserName) {
                const user = await getCurrentUser();
                if (user) {
                    headerUserName.textContent = user.full_name?.trim() || user.username?.trim() || '';
                }
            }
        }
    } catch (error) {
    }
}

async function openChangePasswordModal() {
    await showModal(`
        <div class="modal-header">
            <h2 class="modal-title">Wachtwoord wijzigen</h2>
            <p class="modal-subtitle">Voer je huidige en nieuwe wachtwoord in</p>
        </div>
        <form class="modal-form" id="changePasswordForm">
            <div class="form-group">
                <label for="oldPasswordInput">Huidig wachtwoord *</label>
                <input type="password" id="oldPasswordInput" class="modal-input" placeholder="Voer huidig wachtwoord in" required>
            </div>
            <div class="form-group">
                <label for="newPasswordInput">Nieuw wachtwoord *</label>
                <input type="password" id="newPasswordInput" class="modal-input" placeholder="Voer nieuw wachtwoord in" required>
            </div>
            <div class="form-group">
                <label for="confirmPasswordInput">Herhaal nieuw wachtwoord *</label>
                <input type="password" id="confirmPasswordInput" class="modal-input" placeholder="Herhaal nieuw wachtwoord" required>
            </div>
            <div class="modal-footer">
                <button type="button" class="modal-btn-secondary" id="cancelChangePasswordBtn">Annuleren</button>
                <button type="submit" class="btn" id="submitPasswordBtn">Wijzigen</button>
            </div>
        </form>
    `);

    const cancelBtn = document.getElementById('cancelChangePasswordBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeModal);
    }

    const form = document.getElementById('changePasswordForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('submitPasswordBtn');
            const oldPassword = document.getElementById('oldPasswordInput')?.value;
            const newPassword = document.getElementById('newPasswordInput')?.value;
            const confirmPassword = document.getElementById('confirmPasswordInput')?.value;

            if (!oldPassword || !newPassword) {
                showToast('error', 'Beide wachtwoorden zijn verplicht');
                return;
            }

            if (newPassword !== confirmPassword) {
                showToast('error', 'Nieuwe wachtwoorden komen niet overeen');
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Wijzigen...';
            }

            try {
                const { data, error } = await supabase.functions.invoke('update-password', {
                    body: { oldPassword, newPassword }
                });

                if (error) {
                    let msg = error.message || 'Fout bij wijzigen van wachtwoord';
                    if (error.context && typeof error.context.json === 'function') {
                        try {
                            const body = await error.context.json();
                            if (body && body.error) msg = body.error;
                        } catch (_) {}
                    } else if (error.context && typeof error.context.text === 'function') {
                        try {
                            const text = await error.context.text();
                            const parsed = JSON.parse(text);
                            if (parsed && parsed.error) msg = parsed.error;
                        } catch (_) {}
                    }
                    throw new Error(msg);
                }

                if (data && data.error) {
                    throw new Error(data.error);
                }

                const { data: sessionData } = await supabase.auth.getSession();
                if (sessionData?.session?.user?.email) {
                    await supabase.auth.signInWithPassword({
                        email: sessionData.session.user.email,
                        password: newPassword
                    });
                }

                closeModal();
                showToast('notification', data?.message || 'Wachtwoord succesvol gewijzigd');
            } catch (err) {
                showToast('error', err.message || 'Fout bij wijzigen van wachtwoord');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Wijzigen';
                }
            }
        });
    }
}

export async function logout() {
    currentUserData = null;
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    await supabase.auth.signOut();
    window.location.replace('login.html');
}

function disableInputSuggestions(root = document) {
    const inputs = root.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea');
    inputs.forEach(input => {
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocorrect', 'off');
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('spellcheck', 'false');
    });
}

disableInputSuggestions();

const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType === 1) {
                if (node.matches && node.matches('input, textarea')) {
                    disableInputSuggestions(node.parentElement || document);
                } else if (node.querySelectorAll) {
                    disableInputSuggestions(node);
                }
            }
        }
    }
});

observer.observe(document.documentElement, { childList: true, subtree: true });

checkAuth();
loadOverlay();
initModal();
initToast();
initInactivityTracker();

export { supabase, initModal, showModal, closeModal, showConfirmModal, showPromptModal, initToast, showToast, openChangePasswordModal };


