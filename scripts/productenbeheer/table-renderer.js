import { formatPrice } from '../product_checker-logic.js';

export const renderProductTableRows = (data, tableBody, openModalForEdit) => {
    if (!data || data.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" class="loading-cell">Geen producten gevonden.</td></tr>`;
        return;
    }

    tableBody.innerHTML = '';
    data.forEach(product => {
        const tr = document.createElement('tr');

        const tdImg = document.createElement('td');
        tdImg.setAttribute('data-label', 'Afbeelding');
        const thumbDiv = document.createElement('div');
        thumbDiv.className = 'table-thumb';
        if (product.afbeelding) {
            const img = document.createElement('img');
            img.src = product.afbeelding;
            img.alt = product.naam || '';
            thumbDiv.appendChild(img);
        } else {
            thumbDiv.innerHTML = `<i class="material-icons">image</i>`;
        }
        tdImg.appendChild(thumbDiv);

        const tdNaam = document.createElement('td');
        tdNaam.setAttribute('data-label', 'Naam / Merk');
        tdNaam.innerHTML = `<strong>${product.naam || '-'}</strong><br><small style="color:var(--text-color-muted);">${product.merk || '-'}</small>`;

        const tdEan = document.createElement('td');
        tdEan.setAttribute('data-label', 'EAN');
        tdEan.textContent = product.ean || '-';

        const tdAfdeling = document.createElement('td');
        tdAfdeling.setAttribute('data-label', 'Afdeling');
        tdAfdeling.textContent = product.afdeling || '-';

        const tdVoorraad = document.createElement('td');
        tdVoorraad.setAttribute('data-label', 'Voorraad');
        tdVoorraad.textContent = `${product.voorraad !== null ? product.voorraad : 0} (${product.minimale_voorraad !== null ? product.minimale_voorraad : 0})`;

        const tdPrijs = document.createElement('td');
        tdPrijs.setAttribute('data-label', 'Prijs');
        tdPrijs.textContent = formatPrice(product.prijs);

        const tdLocatie = document.createElement('td');
        tdLocatie.setAttribute('data-label', 'Locatie');
        tdLocatie.textContent = product.locatiecode || '-';

        const tdActions = document.createElement('td');
        tdActions.setAttribute('data-label', 'Acties');

        const actionBtns = document.createElement('div');
        actionBtns.className = 'action-btns';

        const editBtn = document.createElement('button');
        editBtn.className = 'action-btn edit';
        editBtn.title = 'Bewerken';
        editBtn.innerHTML = `<i class="material-icons">edit</i>`;
        editBtn.addEventListener('click', () => openModalForEdit(product));

        actionBtns.appendChild(editBtn);
        tdActions.appendChild(actionBtns);

        tr.appendChild(tdImg);
        tr.appendChild(tdNaam);
        tr.appendChild(tdEan);
        tr.appendChild(tdAfdeling);
        tr.appendChild(tdVoorraad);
        tr.appendChild(tdPrijs);
        tr.appendChild(tdLocatie);
        tr.appendChild(tdActions);

        tableBody.appendChild(tr);
    });
};
