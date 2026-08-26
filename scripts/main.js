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

export async function invokeFunction(functionName, body, headers = {}) {
    const supabase = await getSupabase();
    let currentHeaders = { ...headers };
    let result = await supabase.functions.invoke(functionName, { body, headers: currentHeaders });
    if (result.error) {
        let detailedError = '';
        if (result.error.context) {
            try {
                if (typeof result.error.context.json === 'function') {
                    const errorBody = await result.error.context.json();
                    detailedError = errorBody.error || errorBody.message || JSON.stringify(errorBody);
                } else if (typeof result.error.context.text === 'function') {
                    detailedError = await result.error.context.text();
                }
            } catch (e) {}
        }
        if (!detailedError) {
            detailedError = result.error.message || String(result.error);
        }
        result.detailedError = detailedError;

        const lowerErr = String(detailedError).toLowerCase();
        const isJwtErr = lowerErr.includes('jwt') || lowerErr.includes('signature') || result.error.status === 401;
        if (isJwtErr) {
            const { data: refreshed } = await supabase.auth.refreshSession();
            const newToken = refreshed?.session?.access_token;
            if (newToken) {
                currentHeaders.Authorization = `Bearer ${newToken}`;
            }
            result = await supabase.functions.invoke(functionName, { body, headers: currentHeaders });
            if (result.error) {
                let retryDetailed = '';
                if (result.error.context) {
                    try {
                        if (typeof result.error.context.json === 'function') {
                            const errorBody = await result.error.context.json();
                            retryDetailed = errorBody.error || errorBody.message || JSON.stringify(errorBody);
                        } else if (typeof result.error.context.text === 'function') {
                            retryDetailed = await result.error.context.text();
                        }
                    } catch (e) {}
                }
                result.detailedError = retryDetailed || result.error.message || String(result.error);
            }
        }
    }
    return result;
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

function disableInputSuggestions(el) {
    if (!el || !el.setAttribute) return;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'FORM') {
        el.setAttribute('autocomplete', 'off');
        el.setAttribute('autocorrect', 'off');
        el.setAttribute('autocapitalize', 'off');
        el.setAttribute('spellcheck', 'false');
    }
}

function initDisableSuggestions() {
    const applyToAll = (root = document) => {
        root.querySelectorAll('input, textarea, form').forEach(disableInputSuggestions);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => applyToAll());
    } else {
        applyToAll();
    }

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) {
                    disableInputSuggestions(node);
                    applyToAll(node);
                }
            }
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    document.addEventListener('focusin', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
            disableInputSuggestions(e.target);
        }
    }, true);
}

initDisableSuggestions();
