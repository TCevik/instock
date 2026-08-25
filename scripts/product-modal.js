import { showMessage, handleFormSubmit } from './main.js';
import { showToast } from './toast.js';
import { validateBarcode, resizeAndCompressImage } from './productenbeheer/image-utils.js';
import { saveProduct, fetchSingleProduct } from './productenbeheer/product-service.js';
import { formatDateInputValue, parseDateInputToIso } from './product-checker-logic.js';

export function initProductModal({
    supabase,
    storeId = null,
    modalElement = document.getElementById('productModal'),
    onSuccess = null
}) {
    if (!modalElement) return null;

    const form = modalElement.querySelector('#add-product-form') || modalElement.querySelector('form');
    const closeBtn = modalElement.querySelector('#closeProductModalBtn') || modalElement.querySelector('.close-modal-btn');
    const modalTitle = modalElement.querySelector('#product-modal-title');
    const submitBtn = modalElement.querySelector('#submitBtn') || modalElement.querySelector('button[type="submit"]');

    const messageBox = modalElement.querySelector('#modal-message-box') || modalElement.querySelector('#message-box') || modalElement.querySelector('.message');
    const messageIcon = messageBox ? (messageBox.querySelector('#modal-message-icon') || messageBox.querySelector('#message-icon') || messageBox.querySelector('.material-icons')) : null;
    const messageText = messageBox ? (messageBox.querySelector('#modal-message-text') || messageBox.querySelector('#message-text') || messageBox.querySelector('span')) : null;

    const barcodeTypeSelect = modalElement.querySelector('#barcode_type');
    const eanInput = modalElement.querySelector('#ean');
    const naamInput = modalElement.querySelector('#naam');
    const merkInput = modalElement.querySelector('#merk');
    const inhoudInput = modalElement.querySelector('#inhoud');
    const afdelingInput = modalElement.querySelector('#afdeling');
    const voorraadInput = modalElement.querySelector('#voorraad');
    const minimaleVoorraadInput = modalElement.querySelector('#minimale_voorraad');
    const prijsInput = modalElement.querySelector('#prijs');
    const inkoopprijsInput = modalElement.querySelector('#inkoopprijs');
    const thtInput = modalElement.querySelector('#tht');
    const locatiecodeInput = modalElement.querySelector('#locatiecode');

    const btnUploadFile = modalElement.querySelector('#btn-upload-file');
    const btnTakePhoto = modalElement.querySelector('#btn-take-photo');
    const afbeeldingFile = modalElement.querySelector('#afbeelding-file');
    const afbeeldingCamera = modalElement.querySelector('#afbeelding-camera');
    const imagePreviewBox = modalElement.querySelector('#image-preview-box');
    const imagePreview = modalElement.querySelector('#image-preview');
    const placeholderIcon = imagePreviewBox ? imagePreviewBox.querySelector('.placeholder-icon') : null;
    const removeImgBtn = modalElement.querySelector('#remove-img-btn');

    let currentImageData = null;
    let isEditMode = false;
    let editingEan = null;

    const setImageData = (dataUrl) => {
        currentImageData = dataUrl;
        if (dataUrl) {
            if (imagePreview) {
                imagePreview.src = dataUrl;
                imagePreview.style.display = 'block';
            }
            if (placeholderIcon) placeholderIcon.style.display = 'none';
            if (removeImgBtn) removeImgBtn.style.display = 'flex';
        } else {
            if (imagePreview) {
                imagePreview.src = '';
                imagePreview.style.display = 'none';
            }
            if (placeholderIcon) placeholderIcon.style.display = 'block';
            if (removeImgBtn) removeImgBtn.style.display = 'none';
            if (afbeeldingFile) afbeeldingFile.value = '';
            if (afbeeldingCamera) afbeeldingCamera.value = '';
        }
    };

    if (btnUploadFile && afbeeldingFile) {
        btnUploadFile.addEventListener('click', () => afbeeldingFile.click());
    }
    if (btnTakePhoto && afbeeldingCamera) {
        btnTakePhoto.addEventListener('click', () => afbeeldingCamera.click());
    }
    if (removeImgBtn) {
        removeImgBtn.addEventListener('click', () => setImageData(null));
    }

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const compressedUrl = await resizeAndCompressImage(file);
        setImageData(compressedUrl);
    };

    if (afbeeldingFile) afbeeldingFile.addEventListener('change', handleFileSelect);
    if (afbeeldingCamera) afbeeldingCamera.addEventListener('change', handleFileSelect);

    if (thtInput) {
        thtInput.addEventListener('input', (e) => {
            e.target.value = formatDateInputValue(e.target.value);
        });
    }

    const resetForm = () => {
        if (form) form.reset();
        setImageData(null);
        isEditMode = false;
        editingEan = null;
        if (modalTitle) modalTitle.textContent = 'Nieuw Product Toevoegen';
        if (submitBtn) {
            const span = submitBtn.querySelector('span');
            const icon = submitBtn.querySelector('.material-icons');
            if (span) span.textContent = 'Product Opslaan';
            if (icon) icon.textContent = 'add_box';
        }
        if (messageBox) messageBox.style.display = 'none';
    };

    const closeModal = () => {
        modalElement.classList.remove('open');
        resetForm();
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    modalElement.addEventListener('click', (e) => {
        if (e.target === modalElement) closeModal();
    });

    const openForCreate = (prefillData = {}) => {
        resetForm();
        isEditMode = false;
        editingEan = null;
        if (modalTitle) modalTitle.textContent = 'Nieuw Product Toevoegen';
        if (submitBtn) {
            const span = submitBtn.querySelector('span');
            const icon = submitBtn.querySelector('.material-icons');
            if (span) span.textContent = 'Product Opslaan';
            if (icon) icon.textContent = 'add_box';
        }

        if (prefillData.ean && eanInput) {
            eanInput.value = prefillData.ean;
        }
        if (prefillData.barcode_type && barcodeTypeSelect) {
            barcodeTypeSelect.value = prefillData.barcode_type;
        }

        modalElement.classList.add('open');
        requestAnimationFrame(() => {
            if (eanInput && !eanInput.value) {
                eanInput.focus();
            } else if (naamInput) {
                naamInput.focus();
            }
        });
    };

    const openForEdit = async (product) => {
        resetForm();
        isEditMode = true;
        editingEan = product.ean;

        if (modalTitle) modalTitle.textContent = product.naam ? `Product Bewerken: ${product.naam}` : 'Product Bewerken';
        if (submitBtn) {
            const span = submitBtn.querySelector('span');
            const icon = submitBtn.querySelector('.material-icons');
            if (span) span.textContent = 'Wijzigingen Opslaan';
            if (icon) icon.textContent = 'save';
        }

        let p = product;
        if (supabase && product.ean) {
            const { data: fullProduct } = await fetchSingleProduct(supabase, product.ean);
            if (fullProduct) p = fullProduct;
        }

        if (barcodeTypeSelect && p.barcode_type) barcodeTypeSelect.value = p.barcode_type;
        if (eanInput) eanInput.value = p.ean || '';
        if (naamInput) naamInput.value = p.naam || '';
        if (merkInput) merkInput.value = p.merk || '';
        if (inhoudInput) inhoudInput.value = p.inhoud || '';
        if (afdelingInput) afdelingInput.value = p.afdeling || '';
        if (voorraadInput) voorraadInput.value = p.voorraad !== null && p.voorraad !== undefined ? p.voorraad : '';
        if (minimaleVoorraadInput) minimaleVoorraadInput.value = p.minimale_voorraad !== null && p.minimale_voorraad !== undefined ? p.minimale_voorraad : '';
        if (prijsInput) prijsInput.value = p.prijs !== null && p.prijs !== undefined ? Number(p.prijs).toFixed(2) : '';
        if (inkoopprijsInput) inkoopprijsInput.value = p.inkoopprijs !== null && p.inkoopprijs !== undefined ? Number(p.inkoopprijs).toFixed(2) : '';

        if (thtInput) {
            if (p.tht) {
                const d = new Date(p.tht);
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const yyyy = d.getFullYear();
                thtInput.value = `${dd}-${mm}-${yyyy}`;
            } else {
                thtInput.value = '';
            }
        }

        if (locatiecodeInput) locatiecodeInput.value = p.locatiecode || '';
        if (p.afbeelding) {
            setImageData(p.afbeelding);
        }

        modalElement.classList.add('open');
        requestAnimationFrame(() => {
            if (naamInput) naamInput.focus();
        });
    };

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const ean = eanInput ? eanInput.value.trim() : '';
            const naam = naamInput ? naamInput.value.trim() : '';
            const barcodeType = barcodeTypeSelect ? barcodeTypeSelect.value : 'EAN-13';

            if (!ean || !naam) {
                if (messageBox) showMessage(messageBox, messageText, messageIcon, 'EAN en Naam zijn verplichte velden.', 'error');
                return;
            }

            const barcodeValidation = validateBarcode(ean, barcodeType);
            if (!barcodeValidation.valid) {
                if (messageBox) showMessage(messageBox, messageText, messageIcon, barcodeValidation.error, 'error');
                return;
            }

            const productData = {
                ean,
                barcode_type: barcodeType,
                naam,
                merk: merkInput ? (merkInput.value.trim() || null) : null,
                inhoud: inhoudInput ? (inhoudInput.value.trim() || null) : null,
                afdeling: afdelingInput ? (afdelingInput.value.trim() || null) : null,
                voorraad: voorraadInput && voorraadInput.value !== '' ? parseInt(voorraadInput.value, 10) : null,
                minimale_voorraad: minimaleVoorraadInput && minimaleVoorraadInput.value !== '' ? parseInt(minimaleVoorraadInput.value, 10) : null,
                prijs: prijsInput && prijsInput.value !== '' ? parseFloat(prijsInput.value) : null,
                inkoopprijs: inkoopprijsInput && inkoopprijsInput.value !== '' ? parseFloat(inkoopprijsInput.value) : null,
                tht: thtInput ? parseDateInputToIso(thtInput.value) : null,
                locatiecode: locatiecodeInput ? (locatiecodeInput.value.trim() || null) : null,
                afbeelding: currentImageData || null
            };

            if (storeId) {
                productData.winkel_id = storeId;
            }

            await handleFormSubmit(submitBtn, 'Bezig met opslaan...', messageBox, async () => {
                const { error } = await saveProduct(supabase, isEditMode, editingEan, productData);
                if (error) {
                    if (messageBox) showMessage(messageBox, messageText, messageIcon, error.message || 'Er is een fout opgetreden bij het opslaan van het product.', 'error');
                } else {
                    const savedIsEdit = isEditMode;
                    const savedEditingEan = editingEan;
                    closeModal();
                    if (onSuccess) {
                        await onSuccess({ productData, isEditMode: savedIsEdit, editingEan: savedEditingEan });
                    }
                }
            });
        });
    }

    return {
        openForCreate,
        openForEdit,
        closeModal,
        resetForm
    };
}
