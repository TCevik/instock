import { supabase } from './supabase.js';

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
        }
    } catch (error) {
    }
}

export async function logout() {
    await supabase.auth.signOut();
    window.location.replace('login.html');
}

checkAuth();
loadOverlay();

export { supabase };
