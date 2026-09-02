import { getCurrentUser } from './main.js';

async function loadWelcome() {
    const welcomeElement = document.getElementById('welcomeText');
    if (!welcomeElement) return;

    const user = await getCurrentUser();
    if (!user) return;

    const displayName = user.full_name?.trim() || user.username?.trim();
    if (displayName) {
        welcomeElement.textContent = `Welkom terug, ${displayName}`;
    }
}

loadWelcome();
