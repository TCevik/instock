import { openUnifiedImportModal } from './vulplanning/import-unified.js';
import { fillRoosterShifts, getAvailableUsers } from './vulplanning/rooster.js';
import { handleImportedColli } from './vulplanning/colli-invoer.js';

const btnUnifiedImport = document.getElementById('btn-unified-import');

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
