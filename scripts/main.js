import { supabasePromise } from './supabase.js';
import { showToast } from './toast.js';
export { setupModal, initPadenModal, showConfirmModal } from './modal.js';



export async function getSupabase() {
    return supabasePromise;
}

export function setAppReady() {
    document.body.classList.add('app-ready');
}

export async function checkAuth(allowedRoles = null) {
    const supabase = await getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
        return null;
    }

    const { data, error } = await supabase.from('user_data').select('role, winkel').eq('id', session.user.id).single();
    if (error || !data) {
        window.location.href = 'login.html';
        return null;
    }

    if (allowedRoles && !allowedRoles.includes(data.role)) {
        window.location.href = 'index.html';
        return null;
    }

    let storeCode = '';
    if (session.user.email) {
        const parts = session.user.email.split('@');
        if (parts.length > 1) {
            storeCode = parts[1].split('.')[0].toLowerCase();
        }
    }

    if (!window._authListenerRegistered) {
        window._authListenerRegistered = true;
        supabase.auth.onAuthStateChange((event, s) => {
            if (event === 'SIGNED_OUT' || !s) {
                window.location.href = 'login.html';
            }
        });
    }

    setAppReady();
    return { session, userData: data, storeCode };
}

export function showMessage(messageBox, messageText, messageIcon, text, type) {
    if (text) {
        showToast(text, type);
    }
    if (messageBox) {
        messageBox.style.display = 'none';
    }
}



export async function handleFormSubmit(submitBtn, loadingText, messageBox, actionFn) {
    if (!submitBtn) return;
    const originalText = submitBtn.querySelector('span') ? submitBtn.querySelector('span').textContent : submitBtn.textContent;
    const btnTextSpan = submitBtn.querySelector('span');

    if (messageBox) messageBox.style.display = 'none';
    submitBtn.disabled = true;
    if (btnTextSpan) {
        btnTextSpan.textContent = loadingText;
    } else {
        submitBtn.textContent = loadingText;
    }

    try {
        await actionFn();
    } catch (err) {
        console.error(err);
    } finally {
        submitBtn.disabled = false;
        if (btnTextSpan) {
            btnTextSpan.textContent = originalText;
        } else {
            submitBtn.textContent = originalText;
        }
    }
}
