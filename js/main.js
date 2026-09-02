import { supabase } from './supabase.js';
import { initModal, showModal, closeModal, showConfirmModal } from './modal.js';

async function checkAuth() {
    const isLoginPage = window.location.pathname.endsWith('login.html');
    const { data: { session } } = await supabase.auth.getSession();

    if (!session && !isLoginPage) {
        window.location.replace('login.html');
    } else if (session && isLoginPage) {
        window.location.replace('index.html');
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
        .select('full_name, username')
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

export async function logout() {
    currentUserData = null;
    await supabase.auth.signOut();
    window.location.replace('login.html');
}

checkAuth();
loadOverlay();
initModal();

export { supabase, showModal, closeModal, showConfirmModal };
