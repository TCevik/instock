import { supabase, getCurrentUser, showToast } from './main.js';
import { openUnifiedImportModal } from './vulplanning/import-unified.js';
import { fillRoosterShifts, getAvailableUsers, getFillersData } from './vulplanning/rooster.js';
import { handleImportedColli, getColliData } from './vulplanning/colli-invoer.js';

const btnUnifiedImport = document.getElementById('btn-unified-import');
const btnContinue = document.getElementById('btn-continue');

if (btnUnifiedImport) {
    btnUnifiedImport.addEventListener('click', () => {
        openUnifiedImportModal({
            onRoosterImport: (shifts) => {
                fillRoosterShifts(shifts);
            },
            onColliImport: (colliMap) => {
                handleImportedColli(colliMap);
            },
            availableUsers: getAvailableUsers()
        });
    });
}

if (btnContinue) {
    btnContinue.addEventListener('click', async () => {
        const user = await getCurrentUser();
        if (!user || !user.store_id) {
            showToast('error', 'Geen winkel gekoppeld aan huidige gebruiker');
            return;
        }

        const fillers = getFillersData();
        const tasks = getColliData();

        btnContinue.disabled = true;
        const originalContent = btnContinue.innerHTML;
        btnContinue.innerHTML = `<span>Opslaan...</span>`;

        try {
            const { error } = await supabase
                .from('planner')
                .upsert({
                    store_id: user.store_id,
                    fillers: fillers,
                    tasks: tasks
                }, {
                    onConflict: 'store_id'
                });

            if (error) {
                throw new Error(error.message || 'Fout bij opslaan in database');
            }

            showToast('notification', 'Planning gegevens succesvol opgeslagen');
        } catch (err) {
            showToast('error', err.message || 'Kon gegevens niet opslaan');
        } finally {
            btnContinue.disabled = false;
            btnContinue.innerHTML = originalContent;
        }
    });
}
