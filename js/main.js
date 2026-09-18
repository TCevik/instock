import { supabase } from './supabase.js';
import { initModal, showModal, closeModal, showConfirmModal, showPromptModal } from './modal.js';
import { initToast, showToast } from './toast.js';
import { initGlobalTooltips } from './tooltip.js';

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
const INACTIVITY_WARNING_MS = INACTIVITY_TIMEOUT_MS - 60 * 1000;
const LAST_ACTIVITY_KEY = 'instock_last_activity';
let inactivityWarningShown = false;

function recordActivity() {
    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
}

function isLoginPage() {
    const p = window.location.pathname.replace(/\/$/, '');
    return p.endsWith('login') || p.endsWith('login.html');
}

function checkInactivity() {
    if (isLoginPage()) return;

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
    if (isLoginPage()) return;

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
    const isLogin = isLoginPage();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session && !isLogin) {
        window.location.replace('login');
        return;
    } else if (session && isLogin) {
        window.location.replace('index');
        return;
    }

    if (!isLogin) {
        const last = localStorage.getItem(LAST_ACTIVITY_KEY);
        if (last && Date.now() - Number(last) > INACTIVITY_TIMEOUT_MS) {
            await logout();
            return;
        }
        recordActivity();
    }

    supabase.auth.onAuthStateChange((_event, newSession) => {
        if (!newSession && !isLoginPage()) {
            window.isLoggingOut = true;
            window.onbeforeunload = null;
            window.location.replace('login');
        }
    });
}

let currentUserData = null;

function isPermissionError(err) {
    if (!err) return false;
    const code = String(err.code || '');
    const status = Number(err.status || err.statusCode || 0);
    const text = `${err.message || ''} ${err.details || ''} ${err.hint || ''}`.toLowerCase();

    return (
        code === '42501' ||
        code === 'PGRST301' ||
        status === 401 ||
        status === 403 ||
        text.includes('row-level security') ||
        text.includes('permission denied') ||
        text.includes('insufficient_privilege') ||
        text.includes('not authorized') ||
        text.includes('unauthorized') ||
        text.includes('forbidden') ||
        text.includes('rechten') ||
        text.includes('policy')
    );
}

export async function getCurrentUser() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) return null;

    const { data, error } = await supabase
        .from('user_data')
        .select('full_name, username, store_id, role')
        .eq('user_id', session.user.id)
        .maybeSingle();

    if (error || !data) return null;

    currentUserData = data;
    return currentUserData;
}

export async function getStorePaths() {
    const user = await getCurrentUser();
    if (!user || !user.store_id) return [];

    const { data, error } = await supabase
        .from('store_data')
        .select('default_paths')
        .eq('store_id', user.store_id)
        .maybeSingle();

    if (error) throw error;
    return Array.isArray(data?.default_paths) ? data.default_paths : [];
}

const APP_MODULES = [

    {
        id: 'bakplan',
        title: 'Bakplan',
        description: 'Bekijk en beheer het actuele bakplan voor de winkel.',
        icon: 'bakery_dining',
        href: 'bakplan',
        minRole: 2
    },
    {
        id: 'vulplanning',
        title: 'Vulplanning Maker',
        description: 'Maak en beheer vulplanningen, taken en shifts.',
        icon: 'assignment',
        href: 'vulplanning',
        minRole: 2
    },
    {
        id: 'productiviteit',
        title: 'Productiviteit',
        description: 'Bekijk en analyseer vulprestaties en statistieken.',
        icon: 'trending_up',
        href: 'productiviteit',
        minRole: 1
    },
    {
        id: 'productenbeheer',
        title: 'Productenbeheer',
        description: 'Beheer het assortiment, barcodes, vakken en prijzen.',
        icon: 'inventory_2',
        href: 'productenbeheer',
        minRole: 1
    },
    {
        id: 'gebruikersbeheer',
        title: 'Gebruikersbeheer',
        description: 'Beheer medewerkers, rollen en winkeltoegang.',
        icon: 'people',
        href: 'gebruikersbeheer',
        minRole: 2
    },
    {
        id: 'instellingen-winkel',
        title: 'Instellingen Winkel',
        description: 'Configureer winkelpaden, vulnormen en categorieën.',
        icon: 'store',
        href: 'instellingen-winkel',
        minRole: 3
    },
    {
        id: 'logs',
        title: 'Systeem Logs',
        description: 'Bekijk de geschiedenis van acties en wijzigingen.',
        icon: 'history',
        href: 'logs',
        minRole: 3
    }
];

export function getAvailableModules(role = 1) {
    const numericRole = Number(role) || 1;
    return APP_MODULES.filter(m => numericRole >= (m.minRole || 1));
}

let overlayLoadingOrLoaded = false;

async function loadOverlay() {
    if (isLoginPage()) return;
    if (overlayLoadingOrLoaded || document.querySelector('.app-header')) return;
    overlayLoadingOrLoaded = true;

    try {
        const response = await fetch('overlay.html');
        if (response.ok) {
            if (document.querySelector('.app-header')) return;
            const html = await response.text();
            document.body.insertAdjacentHTML('afterbegin', html);

            const rawPath = (window.location.pathname.split('/').pop() || 'index').replace(/\.html$/, '');
            const currentPath = rawPath === '' ? 'index' : rawPath;
            const links = document.querySelectorAll('.sidebar-link');
            links.forEach(link => {
                const href = (link.getAttribute('href') || '').replace(/\.html$/, '');
                if (href === currentPath) {
                    link.classList.add('active');
                }
            });

            const sidebar = document.querySelector('.app-sidebar');
            const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
            const sidebarBackdrop = document.getElementById('sidebarBackdrop');

            if (sidebar) {
                const enableHover = () => {
                    sidebar.classList.remove('hover-disabled');
                    window.removeEventListener('mousemove', onFirstInteraction, true);
                    window.removeEventListener('pointerdown', onFirstInteraction, true);
                    sidebar.removeEventListener('mouseleave', onMouseLeave);
                };

                const onMouseLeave = () => {
                    enableHover();
                };

                const onFirstInteraction = (e) => {
                    const rect = sidebar.getBoundingClientRect();
                    const isOver = e.clientX >= rect.left && e.clientX <= rect.right &&
                                   e.clientY >= rect.top && e.clientY <= rect.bottom;
                    if (isOver) {
                        sidebar.addEventListener('mouseleave', onMouseLeave, { once: true });
                    } else {
                        enableHover();
                    }
                    window.removeEventListener('mousemove', onFirstInteraction, true);
                    window.removeEventListener('pointerdown', onFirstInteraction, true);
                };

                window.addEventListener('mousemove', onFirstInteraction, true);
                window.addEventListener('pointerdown', onFirstInteraction, true);
            }

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
                logoutBtn.addEventListener('click', async () => {
                    const confirmed = await showConfirmModal({
                        title: 'Uitloggen',
                        message: 'Weet je zeker dat je wilt uitloggen?',
                        confirmText: 'Uitloggen',
                        cancelText: 'Annuleren',
                        isDanger: true
                    });
                    if (confirmed) logout();
                });
            }

            const headerUserName = document.getElementById('headerUserName');
            const headerUserHandle = document.getElementById('headerUserHandle');
            const user = await getCurrentUser();
            if (user) {
                if (headerUserName) {
                    headerUserName.textContent = user.full_name?.trim() || user.username?.trim() || '';
                }
                if (headerUserHandle && user.username) {
                    const handle = user.username.trim();
                    headerUserHandle.textContent = handle.startsWith('@') ? handle : `@${handle}`;
                }
                const roleNum = Number(user.role) || 1;
                APP_MODULES.forEach(mod => {
                    if (roleNum < (mod.minRole || 1)) {
                        const linkEl = document.querySelector(`.sidebar-link[href="${mod.href}"]`);
                        if (linkEl) {
                            linkEl.remove();
                        }
                    }
                });
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
    window.isLoggingOut = true;
    currentUserData = null;
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    window.onbeforeunload = null;
    window.addEventListener('beforeunload', (e) => {
        delete e.returnValue;
    }, { capture: true });
    await supabase.auth.signOut();
    window.location.replace('login');
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
initGlobalTooltips();

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function parseUserDisplay(nameStr, unameStr = '') {
    let title = String(nameStr || '').trim();
    let sub = String(unameStr || '').trim();

    if (sub && !sub.startsWith('@')) {
        sub = `@${sub}`;
    }

    const match = title.match(/^(.*?)\s*\(?@([a-zA-Z0-9._-]+)\)?$/);
    if (match) {
        title = match[1].trim();
        if (!sub) {
            sub = `@${match[2].trim()}`;
        }
    }

    return { title, sub };
}
async function invokeFn(fnName, options) {
    const { data, error } = await supabase.functions.invoke(fnName, options);
    if (error) {
        let msg = '';
        if (error.context && typeof error.context.json === 'function') {
            try {
                const body = await error.context.json();
                msg = body?.error || body?.message || '';
            } catch (_) {}
        }
        if (!msg && error.context && typeof error.context.text === 'function') {
            try {
                const text = await error.context.text();
                if (text) {
                    try {
                        const parsed = JSON.parse(text);
                        msg = parsed?.error || parsed?.message || text;
                    } catch (_) {
                        msg = text;
                    }
                }
            } catch (_) {}
        }
        if (!msg && data && typeof data === 'object' && data.error) {
            msg = data.error;
        }
        if (!msg && error.message) {
            msg = error.message;
        }
        if (!msg || msg.includes('non-2xx')) {
            const status = error.context?.status;
            if (status === 403) {
                msg = 'Geen toegang voor deze actie';
            } else if (status === 401) {
                msg = 'Niet ingelogd of sessie verlopen';
            } else if (status === 404) {
                msg = 'Functie of gegevens niet gevonden';
            } else {
                msg = 'Er is een fout opgetreden bij het uitvoeren';
            }
        }
        throw new Error(msg);
    }
    if (data && typeof data === 'object' && data.error) {
        throw new Error(data.error);
    }
    return data;
}

function renderTableSkeletons(tbody, cardsContainer, columnsCount = 7, rowsCount = 5) {
    const elTbody = typeof tbody === 'string' ? document.getElementById(tbody) : tbody;
    const elCards = typeof cardsContainer === 'string' ? document.getElementById(cardsContainer) : cardsContainer;
    if (elTbody) {
        let html = '';
        const widths = [65, 80, 45, 70, 50, 60, 40, 75];
        for (let r = 0; r < rowsCount; r++) {
            html += '<tr>';
            for (let c = 0; c < columnsCount; c++) {
                const w = widths[(r + c) % widths.length];
                html += `<td><div class="skeleton" style="height: 16px; width: ${w}%;"></div></td>`;
            }
            html += '</tr>';
        }
        elTbody.innerHTML = html;
    }
    if (elCards) {
        let html = '';
        for (let r = 0; r < 3; r++) {
            html += `
                <div style="padding: 16px; border-bottom: 1px solid var(--card-border); display: flex; flex-direction: column; gap: 8px;">
                    <div class="skeleton" style="height: 16px; width: 65%;"></div>
                    <div class="skeleton" style="height: 14px; width: 40%;"></div>
                </div>
            `;
        }
        elCards.innerHTML = html;
    }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}

export { supabase, initModal, showModal, closeModal, showConfirmModal, showPromptModal, initToast, showToast, openChangePasswordModal, isPermissionError, escapeHtml, initGlobalTooltips, parseUserDisplay, invokeFn, renderTableSkeletons };


