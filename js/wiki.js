import { getCurrentUser } from './main.js';
import { showConfirmModal } from './modal.js';

let defaultPageHtml = '';

document.addEventListener('DOMContentLoaded', async () => {
    const user = await getCurrentUser();
    const roleNum = Number(user?.role) || 1;

    const mainContainer = document.querySelector('.page-container');
    if (mainContainer) {
        defaultPageHtml = mainContainer.innerHTML;
    }

    if (roleNum >= 3) {
        initAddButton();
    }
});

function initAddButton() {
    const heroContent = document.getElementById('wikiHeroContent');
    if (heroContent && !document.getElementById('addArticleBtn')) {
        const addBtn = document.createElement('button');
        addBtn.id = 'addArticleBtn';
        addBtn.className = 'hero-action-btn';
        addBtn.innerHTML = `
            <span class="material-icons">add</span>
            <span>Artikel toevoegen</span>
        `;
        addBtn.addEventListener('click', showEditorPage);
        heroContent.appendChild(addBtn);
    }
}

function showEditorPage() {
    const mainContainer = document.querySelector('.page-container');
    if (!mainContainer) return;

    mainContainer.innerHTML = `
        <div class="dashboard-hero">
            <div class="hero-content">
                <div class="hero-greeting">
                    <span class="hero-badge">Kennisbank</span>
                    <h1 class="welcome-heading">Artikel Toevoegen</h1>
                    <p class="dashboard-subtitle">Schrijf en bewerk een nieuw artikel voor de winkel wiki</p>
                </div>
                <button id="cancelArticleBtn" class="hero-action-btn">
                    <span class="material-icons">close</span>
                    <span>Annuleren</span>
                </button>
            </div>
        </div>

        <div class="wiki-editor-card">
            <input type="text" id="wikiTitleInput" class="wiki-editor-title-input" placeholder="Titel van het artikel..." />
            
            <div class="wiki-toolbar">
                <button type="button" class="wiki-toolbar-btn" data-cmd="formatBlock" data-val="H1">H1</button>
                <button type="button" class="wiki-toolbar-btn" data-cmd="formatBlock" data-val="H2">H2</button>
                <button type="button" class="wiki-toolbar-btn" data-cmd="formatBlock" data-val="H3">H3</button>
                <button type="button" class="wiki-toolbar-btn" data-cmd="bold" title="Vetgedrukt"><b>B</b></button>
                <span class="wiki-toolbar-divider"></span>
                <button type="button" class="wiki-toolbar-btn" data-cmd="insertUnorderedList" title="Puntjes lijst">
                    <span class="material-icons" style="font-size: 18px;">format_list_bulleted</span>
                </button>
                <button type="button" class="wiki-toolbar-btn" data-cmd="insertOrderedList" title="Genummerde lijst">
                    <span class="material-icons" style="font-size: 18px;">format_list_numbered</span>
                </button>
                <span class="wiki-toolbar-divider"></span>
                <div class="wiki-color-picker-wrapper" id="wikiColorPickerWrapper">
                    <button type="button" class="wiki-color-btn" id="wikiColorBtn" title="Tekstkleur">
                        <span class="material-icons" style="font-size: 18px;">palette</span>
                        <span class="wiki-color-preview-dot" id="wikiColorPreview"></span>
                    </button>
                    <div class="wiki-color-popover" id="wikiColorPopover">
                        <div class="wiki-color-presets">
                            <button type="button" class="wiki-color-swatch" data-color="#ffffff" style="background: #ffffff;" title="Wit"></button>
                            <button type="button" class="wiki-color-swatch" data-color="#658d24" style="background: #658d24;" title="Groen"></button>
                            <button type="button" class="wiki-color-swatch" data-color="#3b82f6" style="background: #3b82f6;" title="Blauw"></button>
                            <button type="button" class="wiki-color-swatch" data-color="#a855f7" style="background: #a855f7;" title="Paars"></button>
                            <button type="button" class="wiki-color-swatch" data-color="#f59e0b" style="background: #f59e0b;" title="Oranje"></button>
                            <button type="button" class="wiki-color-swatch" data-color="#ef4444" style="background: #ef4444;" title="Rood"></button>
                            <button type="button" class="wiki-color-swatch" data-color="#ec4899" style="background: #ec4899;" title="Roze"></button>
                            <button type="button" class="wiki-color-swatch" data-color="#8e8e93" style="background: #8e8e93;" title="Grijs"></button>
                            <button type="button" class="wiki-color-swatch" data-color="#eab308" style="background: #eab308;" title="Geel"></button>
                            <button type="button" class="wiki-color-swatch" data-color="#14b8a6" style="background: #14b8a6;" title="Cyaan"></button>
                        </div>
                        <div class="wiki-custom-picker-container">
                            <div class="wiki-sat-val-box" id="wikiSatValBox">
                                <div class="wiki-sat-layer"></div>
                                <div class="wiki-val-layer"></div>
                                <div class="wiki-sat-handle" id="wikiSatHandle"></div>
                            </div>
                            <div class="wiki-hue-slider-wrapper" id="wikiHueSlider">
                                <div class="wiki-hue-handle" id="wikiHueHandle"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div id="wikiEditorContent" class="wiki-editor-content" contenteditable="true" placeholder="Typ hier de inhoud van het artikel..."></div>
        </div>
    `;

    setupEditorEvents();
}

function setupEditorEvents() {
    const cancelBtn = document.getElementById('cancelArticleBtn');
    const titleInput = document.getElementById('wikiTitleInput');
    const editorContent = document.getElementById('wikiEditorContent');
    const colorBtn = document.getElementById('wikiColorBtn');
    const colorPopover = document.getElementById('wikiColorPopover');
    const colorPreview = document.getElementById('wikiColorPreview');
    const swatches = document.querySelectorAll('.wiki-color-swatch');
    const toolbarBtns = document.querySelectorAll('.wiki-toolbar-btn');

    const satValBox = document.getElementById('wikiSatValBox');
    const satHandle = document.getElementById('wikiSatHandle');
    const hueSlider = document.getElementById('wikiHueSlider');
    const hueHandle = document.getElementById('wikiHueHandle');

    let h = 100, s = 1, v = 0.6;

    function hsvToRgb(h, s, v) {
        let r, g, b;
        let i = Math.floor(h / 60);
        let f = h / 60 - i;
        let p = v * (1 - s);
        let q = v * (1 - s * f);
        let t = v * (1 - s * (1 - f));
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    function rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    function updateColorFromHsv() {
        const rgb = hsvToRgb(h, s, v);
        const hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
        if (satValBox) satValBox.style.backgroundColor = `hsl(${h}, 100%, 50%)`;
        if (satHandle) {
            satHandle.style.left = `${s * 100}%`;
            satHandle.style.top = `${(1 - v) * 100}%`;
        }
        if (hueHandle) {
            hueHandle.style.left = `${(h / 360) * 100}%`;
        }
        applyColor(hex);
    }

    let isDraggingSat = false;
    let isDraggingHue = false;

    function handleSatMove(e) {
        if (!satValBox) return;
        const rect = satValBox.getBoundingClientRect();
        let x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        let y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        s = x / rect.width;
        v = 1 - (y / rect.height);
        updateColorFromHsv();
    }

    function handleHueMove(e) {
        if (!hueSlider) return;
        const rect = hueSlider.getBoundingClientRect();
        let x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        h = (x / rect.width) * 360;
        updateColorFromHsv();
    }

    if (satValBox) {
        satValBox.addEventListener('mousedown', (e) => {
            isDraggingSat = true;
            handleSatMove(e);
        });
    }

    if (hueSlider) {
        hueSlider.addEventListener('mousedown', (e) => {
            isDraggingHue = true;
            handleHueMove(e);
        });
    }

    window.addEventListener('mousemove', (e) => {
        if (isDraggingSat) handleSatMove(e);
        if (isDraggingHue) handleHueMove(e);
    });

    window.addEventListener('mouseup', () => {
        isDraggingSat = false;
        isDraggingHue = false;
    });

    let savedRange = null;

    function saveSelection() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            savedRange = sel.getRangeAt(0);
        }
    }

    function restoreSelection() {
        if (!editorContent) return;
        editorContent.focus();
        const sel = window.getSelection();
        if (savedRange && sel) {
            sel.removeAllRanges();
            sel.addRange(savedRange);
        } else if (sel) {
            const range = document.createRange();
            range.selectNodeContents(editorContent);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
            savedRange = range;
        }
    }

    if (editorContent) {
        editorContent.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                if (e.shiftKey) {
                    document.execCommand('outdent', false, null);
                } else {
                    document.execCommand('indent', false, null);
                }
                saveSelection();
                updateToolbarState();
            }
        });
        editorContent.addEventListener('keyup', saveSelection);
        editorContent.addEventListener('mouseup', saveSelection);
        editorContent.addEventListener('click', saveSelection);
        editorContent.addEventListener('blur', saveSelection);
    }

    let activeColor = '#ffffff';

    const applyColor = (color) => {
        activeColor = color;
        if (colorPreview) colorPreview.style.backgroundColor = color;
        if (editorContent) {
            restoreSelection();
            document.execCommand('foreColor', false, color);
            saveSelection();
        }
    };

    if (colorBtn && colorPopover) {
        colorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            colorPopover.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!colorPopover.contains(e.target) && e.target !== colorBtn) {
                colorPopover.classList.remove('active');
            }
        });
    }

    swatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            const color = swatch.getAttribute('data-color');
            applyColor(color);
            if (colorPopover) colorPopover.classList.remove('active');
        });
    });

    function updateToolbarState() {
        if (!editorContent) return;

        const isBold = document.queryCommandState('bold');
        const boldBtn = document.querySelector('.wiki-toolbar-btn[data-cmd="bold"]');
        if (boldBtn) boldBtn.classList.toggle('active', isBold);

        const isUnordered = document.queryCommandState('insertUnorderedList');
        const ulBtn = document.querySelector('.wiki-toolbar-btn[data-cmd="insertUnorderedList"]');
        if (ulBtn) ulBtn.classList.toggle('active', isUnordered);

        const isOrdered = document.queryCommandState('insertOrderedList');
        const olBtn = document.querySelector('.wiki-toolbar-btn[data-cmd="insertOrderedList"]');
        if (olBtn) olBtn.classList.toggle('active', isOrdered);

        const blockType = (document.queryCommandValue('formatBlock') || '').toLowerCase();
        ['h1', 'h2', 'h3'].forEach(tag => {
            const btn = document.querySelector(`.wiki-toolbar-btn[data-val="${tag.toUpperCase()}"]`);
            if (btn) {
                btn.classList.toggle('active', blockType === tag);
            }
        });

        const color = document.queryCommandValue('foreColor');
        if (color && colorPreview) {
            colorPreview.style.backgroundColor = color;
        }
    }

    if (editorContent) {
        editorContent.addEventListener('keyup', updateToolbarState);
        editorContent.addEventListener('mouseup', updateToolbarState);
        editorContent.addEventListener('click', updateToolbarState);
    }

    toolbarBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            restoreSelection();
            const cmd = btn.getAttribute('data-cmd');
            const val = btn.getAttribute('data-val');

            if (cmd === 'formatBlock') {
                const currentBlock = (document.queryCommandValue('formatBlock') || '').toLowerCase();
                if (currentBlock === val.toLowerCase()) {
                    document.execCommand('formatBlock', false, '<p>');
                } else {
                    document.execCommand('formatBlock', false, `<${val}>`);
                }
            } else if (cmd === 'bold') {
                document.execCommand('bold', false, null);
            } else if (cmd === 'insertUnorderedList') {
                document.execCommand('insertUnorderedList', false, null);
            } else if (cmd === 'insertOrderedList') {
                document.execCommand('insertOrderedList', false, null);
            }
            saveSelection();
            updateToolbarState();
        });
    });

    let isEditingActive = true;

    const handleBeforeUnload = (e) => {
        if (!isEditingActive) return;
        const hasTitle = titleInput && titleInput.value.trim().length > 0;
        const hasContent = editorContent && editorContent.innerText.trim().length > 0;
        if (hasTitle || hasContent) {
            e.preventDefault();
            e.returnValue = '';
            return '';
        }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    if (cancelBtn) {
        cancelBtn.addEventListener('click', async () => {
            const hasTitle = titleInput && titleInput.value.trim().length > 0;
            const hasContent = editorContent && editorContent.innerText.trim().length > 0;

            if (hasTitle || hasContent) {
                const confirmed = await showConfirmModal({
                    title: 'Wijzigingen negeren?',
                    message: 'Je hebt al tekst ingevoerd. Weet je zeker dat je wilt annuleren? De ingevoerde tekst gaat verloren.',
                    confirmText: 'Ja, annuleren',
                    cancelText: 'Verder bewerken',
                    isDanger: true
                });

                if (confirmed) {
                    isEditingActive = false;
                    window.removeEventListener('beforeunload', handleBeforeUnload);
                    restoreMainPage();
                }
            } else {
                isEditingActive = false;
                window.removeEventListener('beforeunload', handleBeforeUnload);
                restoreMainPage();
            }
        });
    }
}

function restoreMainPage() {
    const mainContainer = document.querySelector('.page-container');
    if (mainContainer) {
        mainContainer.innerHTML = defaultPageHtml;
        initAddButton();
    }
}
