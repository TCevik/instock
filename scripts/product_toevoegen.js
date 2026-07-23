import { getSupabase, checkAuth, showMessage, handleFormSubmit } from './main.js';
import { loadHeader } from './header.js';

document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('add-product-form');
    const eanInput = document.getElementById('ean');
    const naamInput = document.getElementById('naam');
    const merkInput = document.getElementById('merk');
    const afdelingInput = document.getElementById('afdeling');
    const voorraadInput = document.getElementById('voorraad');
    const minimaleVoorraadInput = document.getElementById('minimale_voorraad');
    const prijsInput = document.getElementById('prijs');
    const inkoopprijsInput = document.getElementById('inkoopprijs');
    const thtInput = document.getElementById('tht');
    const locatiecodeInput = document.getElementById('locatiecode');
    const afbeeldingInput = document.getElementById('afbeelding');

    loadHeader();

    const auth = await checkAuth(['beheerder']);
    if (!auth) return;

    const supabase = await getSupabase();

    const messageBox = document.getElementById('message-box');
    const messageIcon = document.getElementById('message-icon');
    const messageText = document.getElementById('message-text');
    const submitBtn = document.getElementById('submitBtn');

    const inputs = Array.from(form.querySelectorAll('input'));
    inputs.forEach((input, index) => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const nextInput = inputs[index + 1];
                if (nextInput) {
                    nextInput.focus();
                } else {
                    submitBtn.click();
                }
            }
        });
    });

    const barcodeTypeSelect = document.getElementById('barcode_type');

    const validateBarcode = (code, type) => {
        if (!code) return { valid: false, error: 'Barcode mag niet leeg zijn.' };

        if (type === 'EAN-13') {
            if (!/^\d{13}$/.test(code)) {
                return { valid: false, error: 'EAN-13 moet precies 13 cijfers bevatten.' };
            }
        } else if (type === 'EAN-8') {
            if (!/^\d{8}$/.test(code)) {
                return { valid: false, error: 'EAN-8 moet precies 8 cijfers bevatten.' };
            }
        } else if (type === 'UPC-A') {
            if (!/^\d{12}$/.test(code)) {
                return { valid: false, error: 'UPC-A moet precies 12 cijfers bevatten.' };
            }
        } else if (type === 'Modified Plessy') {
            if (!/^[0-9A-Fa-f]{2,16}$/.test(code)) {
                return { valid: false, error: 'Modified Plessy moet 2 tot 16 hexadecimale tekens (0-9, A-F) bevatten.' };
            }
        }

        return { valid: true };
    };

    const urlParams = new URLSearchParams(window.location.search);
    const editEan = urlParams.get('edit');
    let isEditMode = false;

    if (editEan) {
        const { data: existingProduct } = await supabase.from('producten').select('*').eq('ean', editEan).maybeSingle();
        if (existingProduct) {
            isEditMode = true;
            document.querySelector('.page-header-title').textContent = 'Product Bewerken';
            document.querySelector('.page-header-subtitle').textContent = 'Pas productgegevens aan in de database';
            submitBtn.querySelector('span').textContent = 'Product Opslaan';

            if (barcodeTypeSelect && existingProduct.barcode_type) barcodeTypeSelect.value = existingProduct.barcode_type;
            eanInput.value = existingProduct.ean || '';
            naamInput.value = existingProduct.naam || '';
            merkInput.value = existingProduct.merk || '';
            afdelingInput.value = existingProduct.afdeling || '';
            voorraadInput.value = existingProduct.voorraad !== null ? existingProduct.voorraad : '';
            minimaleVoorraadInput.value = existingProduct.minimale_voorraad !== null ? existingProduct.minimale_voorraad : '';
            prijsInput.value = existingProduct.prijs !== null ? existingProduct.prijs : '';
            inkoopprijsInput.value = existingProduct.inkoopprijs !== null ? existingProduct.inkoopprijs : '';
            thtInput.value = existingProduct.tht || '';
            locatiecodeInput.value = existingProduct.locatiecode || '';
            afbeeldingInput.value = existingProduct.afbeelding || '';
        }
    } else {
        eanInput.focus();
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const ean = eanInput.value.trim();
        const naam = naamInput.value.trim();
        const barcodeType = barcodeTypeSelect ? barcodeTypeSelect.value : 'EAN-13';

        if (!ean || !naam) {
            showMessage(messageBox, messageText, messageIcon, 'EAN en Naam zijn verplichte velden.', 'error');
            return;
        }

        const barcodeValidation = validateBarcode(ean, barcodeType);
        if (!barcodeValidation.valid) {
            showMessage(messageBox, messageText, messageIcon, barcodeValidation.error, 'error');
            return;
        }

        const productData = {
            ean: ean,
            barcode_type: barcodeType,
            naam: naam,
            merk: merkInput.value.trim() || null,
            afdeling: afdelingInput.value.trim() || null,
            voorraad: voorraadInput.value === '' ? null : parseInt(voorraadInput.value, 10),
            minimale_voorraad: minimaleVoorraadInput.value === '' ? null : parseInt(minimaleVoorraadInput.value, 10),
            prijs: prijsInput.value === '' ? null : parseFloat(prijsInput.value),
            inkoopprijs: inkoopprijsInput.value === '' ? null : parseFloat(inkoopprijsInput.value),
            tht: thtInput.value || null,
            locatiecode: locatiecodeInput.value.trim() || null,
            afbeelding: afbeeldingInput.value.trim() || null
        };

        await handleFormSubmit(submitBtn, 'Bezig met opslaan...', messageBox, async () => {
            const { error } = isEditMode
                ? await supabase.from('producten').update(productData).eq('ean', editEan)
                : await supabase.from('producten').insert([productData]);

            if (error) {
                showMessage(messageBox, messageText, messageIcon, error.message || 'Er is een fout opgetreden bij het opslaan van het product.', 'error');
            } else {
                showMessage(messageBox, messageText, messageIcon, isEditMode ? 'Product succesvol bijgewerkt!' : 'Product succesvol toegevoegd!', 'success');
                if (isEditMode) {
                    setTimeout(() => {
                        window.location.href = `product_checker.html?ean=${productData.ean}`;
                    }, 1000);
                } else {
                    form.reset();
                    eanInput.focus();
                }
            }
        });
    });
});
