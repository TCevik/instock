import { supabase } from "./supabase.js";

const modalStack = [];
const BASE_Z_INDEX = 2000;

function ensureStyles() {
  if (!document.querySelector('link[href*="modal.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/modal.css";
    document.head.appendChild(link);
  }
}

export async function initModal() {
  ensureStyles();
}

function getMainModalButton(overlay) {
  if (!overlay) return null;
  const footer = overlay.querySelector(".modal-footer");
  if (footer) {
    const btns = Array.from(
      footer.querySelectorAll(
        'button:not([disabled]):not(.modal-close-btn), input[type="button"]:not([disabled]), input[type="submit"]:not([disabled])',
      ),
    ).filter(
      (el) =>
        el.offsetParent !== null ||
        el.offsetWidth > 0 ||
        el.offsetHeight > 0 ||
        getComputedStyle(el).display !== "none",
    );
    if (btns.length > 0) {
      return btns[btns.length - 1];
    }
  }
  const allBtns = Array.from(
    overlay.querySelectorAll(
      ".modal-container button:not(.modal-close-btn):not([disabled])",
    ),
  ).filter(
    (el) =>
      el.offsetParent !== null ||
      el.offsetWidth > 0 ||
      el.offsetHeight > 0 ||
      getComputedStyle(el).display !== "none",
  );
  if (allBtns.length > 0) {
    return allBtns[allBtns.length - 1];
  }
  return null;
}

function focusModalMainButton(overlay) {
  if (!overlay) return;
  const isMobile =
    typeof window !== "undefined" &&
    (window.innerWidth <= 768 ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(max-width: 768px)").matches));
  if (isMobile) {
    // Op mobiel / bottom sheet niet automatisch de footer button focussen
    // zodat de modal/bottom sheet altijd netjes bovenaan begint.
    return;
  }
  const mainBtn = getMainModalButton(overlay);
  if (mainBtn) {
    mainBtn.focus({ preventScroll: true });
  }
}

function isAtScrollTop(target, container) {
  let el = target;
  while (el && el !== container && el !== document.body) {
    if (el.scrollHeight > el.clientHeight) {
      const overflowY = window.getComputedStyle(el).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        if (el.scrollTop > 2) {
          return false;
        }
      }
    }
    el = el.parentElement;
  }
  return true;
}

function attachBottomSheetSwipe(overlay, container) {
  if (!container) return;
  const handle = container.querySelector(".modal-bottom-sheet-handle");
  let startY = 0;
  let startX = 0;
  let currentY = 0;
  let startTime = 0;
  let isDragging = false;
  let isDecided = false;
  let canDrag = false;
  let isClosing = false;

  const onTouchStart = (e) => {
    if (isClosing || e.touches.length !== 1) return;
    const touch = e.touches[0];
    startY = touch.clientY;
    startX = touch.clientX;
    currentY = startY;
    startTime = Date.now();
    isDragging = false;
    isDecided = false;

    const isHandleTouch =
      handle && (e.target === handle || handle.contains(e.target));
    const isHeaderTouch = !!e.target.closest(".modal-header");

    canDrag =
      isHandleTouch || isHeaderTouch || isAtScrollTop(e.target, container);
  };

  const onTouchMove = (e) => {
    if (isClosing || e.touches.length !== 1) return;
    const touch = e.touches[0];
    currentY = touch.clientY;
    const deltaY = currentY - startY;
    const deltaX = touch.clientX - startX;

    if (!isDecided) {
      if (Math.abs(deltaY) > 6 || Math.abs(deltaX) > 6) {
        isDecided = true;
        if (
          deltaY > 0 &&
          Math.abs(deltaY) > Math.abs(deltaX) * 1.1 &&
          canDrag
        ) {
          if (isAtScrollTop(e.target, container)) {
            isDragging = true;
          }
        }
      }
    }

    if (isDragging && deltaY > 0) {
      if (e.cancelable) {
        e.preventDefault();
      }
      container.style.transition = "none";
      container.style.transform = `translateY(${deltaY}px)`;
      const containerH = container.offsetHeight || 400;
      const progress = Math.min(1, deltaY / containerH);
      overlay.style.backgroundColor = `rgba(0, 0, 0, ${Math.max(0.1, 0.7 * (1 - progress * 0.75))})`;
    }
  };

  const onTouchEnd = () => {
    if (isClosing || !isDragging) return;
    isDragging = false;
    isDecided = false;

    const deltaY = currentY - startY;
    const elapsed = Math.max(1, Date.now() - startTime);
    const velocity = deltaY / elapsed;
    const containerH = container.offsetHeight || 400;

    const shouldClose =
      deltaY > Math.min(130, containerH * 0.3) ||
      (velocity > 0.45 && deltaY > 30);

    if (shouldClose) {
      isClosing = true;
      container.style.transition =
        "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)";
      container.style.transform = "translateY(100%)";
      overlay.style.transition = "opacity 0.2s ease";
      overlay.style.opacity = "0";
      setTimeout(() => {
        closeModal(overlay);
      }, 200);
    } else {
      container.style.transition =
        "transform 0.24s cubic-bezier(0.16, 1, 0.3, 1)";
      container.style.transform = "";
      overlay.style.transition = "background-color 0.24s ease";
      overlay.style.backgroundColor = "";
      setTimeout(() => {
        container.style.transition = "";
        overlay.style.transition = "";
        overlay.style.backgroundColor = "";
      }, 240);
    }
  };

  container.addEventListener("touchstart", onTouchStart, { passive: true });
  container.addEventListener("touchmove", onTouchMove, { passive: false });
  container.addEventListener("touchend", onTouchEnd, { passive: true });
  container.addEventListener("touchcancel", onTouchEnd, { passive: true });
}

export async function showModal(contentHtml, extraClass = "") {
  ensureStyles();

  if (
    document.activeElement &&
    typeof document.activeElement.blur === "function"
  ) {
    document.activeElement.blur();
  }

  const zIndex = BASE_Z_INDEX + modalStack.length * 10;
  const overlay = document.createElement("div");
  overlay.className = `modal-overlay ${extraClass || ""}`.trim();
  overlay.style.zIndex = String(zIndex);
  overlay.setAttribute("aria-hidden", "true");

  overlay.innerHTML = `
        <div class="modal-container" role="dialog" aria-modal="true">
            <div class="modal-bottom-sheet-handle" aria-hidden="true"></div>
            <button type="button" class="modal-close-btn" aria-label="Sluiten">
                <span class="material-icons">close</span>
            </button>
            <div class="modal-content">${contentHtml || ""}</div>
        </div>
    `;

  document.body.appendChild(overlay);
  modalStack.push(overlay);
  document.body.style.overflow = "hidden";

  const container = overlay.querySelector(".modal-container");
  const content = overlay.querySelector(".modal-content");

  attachBottomSheetSwipe(overlay, container);

  const resetModalScroll = () => {
    if (overlay) overlay.scrollTop = 0;
    if (container) container.scrollTop = 0;
    if (content) content.scrollTop = 0;
    const scrollables = overlay.querySelectorAll(
      ".modal-content, .modal-body, .modal-form, .finalize-list, .helpers-list-container, .print-notes-list, .custom-select-dropdown",
    );
    scrollables.forEach((el) => {
      el.scrollTop = 0;
    });
  };

  resetModalScroll();

  if (container) {
    void container.offsetHeight;
  }
  void overlay.offsetHeight;

  requestAnimationFrame(() => {
    overlay.classList.add("active");
    overlay.setAttribute("aria-hidden", "false");
    resetModalScroll();
    focusModalMainButton(overlay);
  });

  setTimeout(() => {
    if (
      !overlay.contains(document.activeElement) ||
      document.activeElement === overlay ||
      document.activeElement === container
    ) {
      focusModalMainButton(overlay);
    }
    resetModalScroll();
  }, 50);

  setTimeout(() => {
    resetModalScroll();
  }, 150);

  const closeBtn = overlay.querySelector(".modal-close-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => closeModal(overlay));
  }

  let isOverlayMouseDown = false;
  overlay.addEventListener("mousedown", (e) => {
    isOverlayMouseDown = e.target === overlay;
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay && isOverlayMouseDown) {
      closeModal(overlay);
    }
    isOverlayMouseDown = false;
  });

  return overlay;
}

export function closeModal(targetOverlay = null) {
  let overlayToClose = null;

  if (targetOverlay instanceof HTMLElement) {
    overlayToClose = targetOverlay.closest(".modal-overlay") || targetOverlay;
    const index = modalStack.indexOf(overlayToClose);
    if (index !== -1) {
      modalStack.splice(index, 1);
    }
  } else if (targetOverlay && targetOverlay.target instanceof HTMLElement) {
    overlayToClose = targetOverlay.target.closest(".modal-overlay");
    const index = modalStack.indexOf(overlayToClose);
    if (index !== -1) {
      modalStack.splice(index, 1);
    }
  } else {
    overlayToClose = modalStack.pop();
  }

  if (overlayToClose && overlayToClose.parentNode) {
    overlayToClose.classList.remove("active");
    overlayToClose.setAttribute("aria-hidden", "true");
    setTimeout(() => {
      if (overlayToClose.parentNode) {
        overlayToClose.remove();
      }
    }, 200);
  }

  if (modalStack.length === 0) {
    document.body.style.overflow = "";
  } else {
    focusModalMainButton(modalStack[modalStack.length - 1]);
  }
}

export function showConfirmModal({
  title = "Bevestigen",
  message,
  confirmText = "Verwijderen",
  cancelText = "Annuleren",
  isDanger = true,
}) {
  return new Promise(async (resolve) => {
    const btnClass = isDanger ? "btn-danger-confirm" : "btn";
    const overlay = await showModal(`
            <div class="modal-header">
                <h2 class="modal-title">${title}</h2>
                <p class="modal-subtitle">${message}</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="modal-btn-secondary" id="confirmModalCancelBtn">${cancelText}</button>
                <button type="button" class="${btnClass}" id="confirmModalConfirmBtn">${confirmText}</button>
            </div>
        `);

    const confirmBtn = overlay.querySelector("#confirmModalConfirmBtn");
    const cancelBtn = overlay.querySelector("#confirmModalCancelBtn");

    if (confirmBtn) {
      confirmBtn.addEventListener("click", () => {
        closeModal(overlay);
        resolve(true);
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        closeModal(overlay);
        resolve(false);
      });
    }
  });
}

export function showPromptModal({
  title = "Invoer",
  subtitle = "",
  placeholder = "",
  confirmText = "Toevoegen",
  cancelText = "Annuleren",
  initialValue = "",
}) {
  return new Promise(async (resolve) => {
    const overlay = await showModal(`
            <div class="modal-header">
                <h2 class="modal-title">${title}</h2>
                ${subtitle ? `<p class="modal-subtitle">${subtitle}</p>` : ""}
            </div>
            <form class="modal-form" id="promptModalForm">
                <div class="form-group">
                    <input type="text" id="promptModalInput" class="modal-input" placeholder="${placeholder}" value="${initialValue}" required>
                </div>
                <div class="modal-footer">
                    <button type="button" class="modal-btn-secondary" id="promptModalCancelBtn">${cancelText}</button>
                    <button type="submit" class="btn" id="promptModalConfirmBtn">${confirmText}</button>
                </div>
            </form>
        `);

    const input = overlay.querySelector("#promptModalInput");
    const form = overlay.querySelector("#promptModalForm");
    const cancelBtn = overlay.querySelector("#promptModalCancelBtn");

    if (input) {
      setTimeout(() => input.focus(), 50);
    }

    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const val = input ? input.value.trim() : "";
        closeModal(overlay);
        resolve(val || null);
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        closeModal(overlay);
        resolve(null);
      });
    }
  });
}

export function showPasswordPromptModal({
  title = "Wachtwoord vereist",
  subtitle = "Voer je wachtwoord in om door te gaan",
  confirmText = "Bevestigen",
  cancelText = "Annuleren",
  isDanger = false,
}) {
  return new Promise(async (resolve) => {
    let isResolved = false;
    const finish = (val) => {
      if (!isResolved) {
        isResolved = true;
        document.removeEventListener("keydown", handleKeyDown);
        resolve(val);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        finish(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    const btnClass = isDanger ? "btn-danger-confirm" : "btn";
    const overlay = await showModal(`
      <div class="modal-header">
        <h2 class="modal-title">${title}</h2>
        ${subtitle ? `<p class="modal-subtitle">${subtitle}</p>` : ""}
      </div>
      <form class="modal-form" id="passwordPromptForm">
        <div class="form-group">
          <label for="passwordPromptInput">Wachtwoord *</label>
          <input type="password" id="passwordPromptInput" class="modal-input" placeholder="Voer je wachtwoord in" required autocomplete="current-password">
        </div>
        <div id="passwordPromptError" style="display: none; color: var(--danger-color); font-size: 13px; margin-top: -6px;"></div>
        <div class="modal-footer">
          <button type="button" class="modal-btn-secondary" id="passwordPromptCancelBtn">${cancelText}</button>
          <button type="submit" class="${btnClass}" id="passwordPromptConfirmBtn">${confirmText}</button>
        </div>
      </form>
    `);

    const input = overlay.querySelector("#passwordPromptInput");
    const form = overlay.querySelector("#passwordPromptForm");
    const cancelBtn = overlay.querySelector("#passwordPromptCancelBtn");
    const confirmBtn = overlay.querySelector("#passwordPromptConfirmBtn");
    const errorEl = overlay.querySelector("#passwordPromptError");
    const closeBtn = overlay.querySelector(".modal-close-btn");

    if (closeBtn) {
      closeBtn.addEventListener("click", () => finish(false));
    }

    if (input) {
      setTimeout(() => input.focus(), 60);
    }

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const password = input ? input.value : "";
        if (!password) return;

        if (confirmBtn) {
          confirmBtn.disabled = true;
          confirmBtn.textContent = "Controleren...";
        }
        if (errorEl) {
          errorEl.style.display = "none";
          errorEl.textContent = "";
        }

        try {
          const { data: isValid, error: authError } = await supabase.rpc("verify_user_password", {
            p_password: password
          });

          if (authError || !isValid) {
            throw new Error("Onjuist wachtwoord. Probeer het opnieuw.");
          }

          closeModal(overlay);
          finish(true);
        } catch (err) {
          if (errorEl) {
            errorEl.textContent = err.message || "Onjuist wachtwoord";
            errorEl.style.display = "block";
          }
          if (input) {
            input.value = "";
            input.focus();
          }
          if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = confirmText;
          }
        }
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        closeModal(overlay);
        finish(false);
      });
    }
  });
}

document.addEventListener("keydown", (e) => {
  if (modalStack.length === 0) return;
  const currentOverlay = modalStack[modalStack.length - 1];

  if (e.key === "Escape") {
    closeModal(currentOverlay);
    return;
  }

  if (e.key === "Enter") {
    const activeEl = document.activeElement;
    const activeTag = activeEl ? activeEl.tagName.toLowerCase() : "";
    if (activeTag === "textarea") return;
    if (
      activeTag === "button" ||
      (activeEl && activeEl.getAttribute("role") === "button")
    )
      return;
    if (activeTag === "input") {
      const form = activeEl.closest("form");
      if (form) return;
    }

    const targetBtn = getMainModalButton(currentOverlay);
    if (targetBtn) {
      e.preventDefault();
      targetBtn.click();
    }
  }
});

if (typeof window !== "undefined") {
  window.showModal = showModal;
  window.closeModal = closeModal;
  window.showConfirmModal = showConfirmModal;
  window.showPromptModal = showPromptModal;
  window.showPasswordPromptModal = showPasswordPromptModal;
}
