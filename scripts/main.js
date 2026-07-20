import { supabasePromise } from './supabase.js';

export async function getSupabase() {
    return supabasePromise;
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

    return { session, userData: data };
}

export function showMessage(messageBox, messageText, messageIcon, text, type) {
    if (!messageBox || !messageText) return;
    messageText.textContent = text;
    messageBox.className = `message ${type}`;
    if (messageIcon) {
        messageIcon.textContent = type === 'error' ? 'error_outline' : (type === 'success' ? 'check_circle_outline' : 'info_outline');
    }
    messageBox.style.display = 'flex';
}