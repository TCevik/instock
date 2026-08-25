import { formatPrice, formatDate, calculateThtStatus } from '../product-checker-logic.js';

export const renderProductTableRows = (data, tableBody, openModalForEdit, openDeleteConfirm) => {
    if (!data || data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" class="loading-cell">Geen producten gevonden.</td></tr>`;
        return;
    }

    tableBody.innerHTML = '';
    data.forEach(product => {
        const tr = document.createElement('tr');

        const tdTht = document.createElement('td');
        tdTht.setAttribute('data-label', 'THT Datum');
        const thtStatus = calculateThtStatus(product.tht);
        if (thtStatus) {
            tdTht.innerHTML = `<strong>${formatDate(product.tht)}</strong><br><small style="color:${thtStatus.color};font-weight:600;">${thtStatus.text}</small>`;
        } else {
            tdTht.textContent = '-';
        }

        const tdNaam = document.createElement('td');
        tdNaam.setAttribute('data-label', 'Naam / Merk');
        tdNaam.innerHTML = `<strong>${product.naam || '-'}</strong><br><small style="color:var(--text-color-muted);">${product.merk || '-'}</small>`;

        const tdEan = document.createElement('td');
        tdEan.setAttribute('data-label', 'EAN');
        tdEan.textContent = product.ean || '-';

        const tdInhoud = document.createElement('td');
        tdInhoud.setAttribute('data-label', 'Inhoud');
        tdInhoud.textContent = product.inhoud || '-';

        const tdAfdeling = document.createElement('td');
        tdAfdeling.setAttribute('data-label', 'Afdeling / Locatie');
        tdAfdeling.innerHTML = `<strong>${product.afdeling || '-'}</strong><br><small style="color:var(--text-color-muted);">${product.locatiecode || '-'}</small>`;

        const tdVoorraad = document.createElement('td');
        tdVoorraad.setAttribute('data-label', 'Voorraad');
        const vr = product.voorraad !== null ? product.voorraad : 0;
        const minVr = product.minimale_voorraad !== null ? product.minimale_voorraad : 0;
        tdVoorraad.innerHTML = `<strong>${vr}</strong><br><small style="color:var(--text-color-muted);">Min: ${minVr}</small>`;

        const tdPrijs = document.createElement('td');
        tdPrijs.setAttribute('data-label', 'Prijs');
        tdPrijs.textContent = formatPrice(product.prijs);

        const tdActions = document.createElement('td');
        tdActions.setAttribute('data-label', 'Acties');

        const actionBtns = document.createElement('div');
        actionBtns.className = 'action-btns';

        const editBtn = document.createElement('button');
        editBtn.className = 'action-btn edit';
        editBtn.title = 'Bewerken';
        editBtn.innerHTML = `<i class="material-icons">edit</i>`;
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openModalForEdit(product);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'action-btn delete';
        deleteBtn.title = 'Verwijderen';
        deleteBtn.innerHTML = `<i class="material-icons">delete</i>`;
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDeleteConfirm(product);
        });

        actionBtns.appendChild(editBtn);
        actionBtns.appendChild(deleteBtn);
        tdActions.appendChild(actionBtns);

        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => {
            const currentSearch = window.location.search;
            const returnUrl = encodeURIComponent('productenbeheer.html');
            window.location.href = `product-checker.html?ean=${product.ean}&return_url=${returnUrl}`;
        });

        tr.appendChild(tdNaam);
        tr.appendChild(tdEan);
        tr.appendChild(tdAfdeling);
        tr.appendChild(tdVoorraad);
        tr.appendChild(tdInhoud);
        tr.appendChild(tdTht);
        tr.appendChild(tdPrijs);
        tr.appendChild(tdActions);

        tableBody.appendChild(tr);
    });
};
