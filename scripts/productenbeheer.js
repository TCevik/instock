import { getSupabase, checkAuth, showMessage, handleFormSubmit } from './main.js';
import { loadHeader } from './header.js';

document.addEventListener('DOMContentLoaded', async () => {
    const auth = await checkAuth(['beheerder']);
    if (!auth) return;

    loadHeader();

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
    const btnUploadFile = document.getElementById('btn-upload-file');
    const btnTakePhoto = document.getElementById('btn-take-photo');
    const afbeeldingFile = document.getElementById('afbeelding-file');
    const afbeeldingCamera = document.getElementById('afbeelding-camera');
    const imagePreviewBox = document.getElementById('image-preview-box');
    const imagePreview = document.getElementById('image-preview');
    const placeholderIcon = imagePreviewBox.querySelector('.placeholder-icon');
    const removeImgBtn = document.getElementById('remove-img-btn');

    let currentImageData = null;

    const setImageData = (dataUrl) => {
        currentImageData = dataUrl;
        if (dataUrl) {
            imagePreview.src = dataUrl;
            imagePreview.style.display = 'block';
            placeholderIcon.style.display = 'none';
            removeImgBtn.style.display = 'flex';
        } else {
            imagePreview.src = '';
            imagePreview.style.display = 'none';
            placeholderIcon.style.display = 'block';
            removeImgBtn.style.display = 'none';
            afbeeldingFile.value = '';
            afbeeldingCamera.value = '';
        }
    };

    btnUploadFile.addEventListener('click', () => afbeeldingFile.click());
    btnTakePhoto.addEventListener('click', () => afbeeldingCamera.click());

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 128;
                canvas.height = 128;
                const ctx = canvas.getContext('2d');

                const minDim = Math.min(img.width, img.height);
                const sx = (img.width - minDim) / 2;
                const sy = (img.height - minDim) / 2;

                ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, 128, 128);
                const compressedUrl = canvas.toDataURL('image/webp', 0.85);
                setImageData(compressedUrl);
            };
            img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
    };

    afbeeldingFile.addEventListener('change', handleFileSelect);
    afbeeldingCamera.addEventListener('change', handleFileSelect);
    removeImgBtn.addEventListener('click', () => setImageData(null));

    const supabase = await getSupabase();

    const messageBox = document.getElementById('message-box');
    const messageIcon = document.getElementById('message-icon');
    const messageText = document.getElementById('message-text');
    const submitBtn = document.getElementById('submitBtn');

    const inputs = Array.from(form.querySelectorAll('input:not([type="file"])'));
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
            document.title = 'Product Bewerken';
            const pageHeaderIcon = document.querySelector('.page-header-icon');
            if (pageHeaderIcon) pageHeaderIcon.textContent = 'edit';
            document.querySelector('.page-header-title').textContent = 'Product Bewerken';
            document.querySelector('.page-header-subtitle').textContent = `Pas gegevens van ${existingProduct.naam || 'het product'} aan`;
            
            const submitBtnSpan = submitBtn.querySelector('span');
            const submitBtnIcon = submitBtn.querySelector('.material-icons');
            if (submitBtnSpan) submitBtnSpan.textContent = 'Wijzigingen Opslaan';
            if (submitBtnIcon) submitBtnIcon.textContent = 'save';

            if (barcodeTypeSelect && existingProduct.barcode_type) barcodeTypeSelect.value = existingProduct.barcode_type;
            eanInput.value = existingProduct.ean || '';
            naamInput.value = existingProduct.naam || '';
            merkInput.value = existingProduct.merk || '';
            afdelingInput.value = existingProduct.afdeling || '';
            voorraadInput.value = existingProduct.voorraad !== null ? existingProduct.voorraad : '';
            minimaleVoorraadInput.value = existingProduct.minimale_voorraad !== null ? existingProduct.minimale_voorraad : '';
            prijsInput.value = existingProduct.prijs !== null && existingProduct.prijs !== undefined ? Number(existingProduct.prijs).toFixed(2) : '';
            inkoopprijsInput.value = existingProduct.inkoopprijs !== null && existingProduct.inkoopprijs !== undefined ? Number(existingProduct.inkoopprijs).toFixed(2) : '';
            thtInput.value = existingProduct.tht || '';
            locatiecodeInput.value = existingProduct.locatiecode || '';
            if (existingProduct.afbeelding) {
                setImageData(existingProduct.afbeelding);
            }
            naamInput.focus();
        }
    } else {
        requestAnimationFrame(() => eanInput.focus());
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
            afbeelding: currentImageData || null
        };

        await handleFormSubmit(submitBtn, 'Bezig met opslaan...', messageBox, async () => {
            const { error } = isEditMode
                ? await supabase.from('producten').update(productData).eq('ean', editEan)
                : await supabase.from('producten').insert([productData]);

            if (error) {
                showMessage(messageBox, messageText, messageIcon, error.message || 'Er is een fout opgetreden bij het opslaan van het product.', 'error');
            } else {
                const status = isEditMode ? 'updated' : 'created';
                window.location.href = `product_checker.html?ean=${productData.ean}&status=${status}`;
            }
        });
    });
});

