const toastStack = [];
let toastContainer = null;

function ensureStyles() {
  if (!document.querySelector('link[href*="toast.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/toast.css";
    document.head.appendChild(link);
  }
}

function ensureContainer() {
  if (!toastContainer || !document.body.contains(toastContainer)) {
    toastContainer = document.querySelector(".toast-container");
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.className = "toast-container";
      document.body.appendChild(toastContainer);
    }
  }
  return toastContainer;
}

export function initToast() {
  ensureStyles();
}

export function removeToast(target) {
  const wrapper = target.classList?.contains("toast-wrapper")
    ? target
    : target.closest(".toast-wrapper");
  if (!wrapper || wrapper.classList.contains("hide")) return;

  const index = toastStack.indexOf(wrapper);
  if (index !== -1) {
    toastStack.splice(index, 1);
  }

  if (wrapper.dataset.timeoutId) {
    clearTimeout(Number(wrapper.dataset.timeoutId));
  }

  wrapper.classList.remove("show");
  wrapper.classList.add("hide");

  setTimeout(() => {
    if (wrapper.parentNode) {
      wrapper.remove();
    }
  }, 450);
}

export function showToast(type = "notification", text = "") {
  ensureStyles();
  const container = ensureContainer();

  const wrapper = document.createElement("div");
  wrapper.className = "toast-wrapper";

  const isError = type === "error";
  const borderClass = isError ? "toast-error" : "toast-notification";
  const iconName = isError ? "error_outline" : "check_circle_outline";

  wrapper.innerHTML = `
        <div class="toast-inner">
            <div class="toast ${borderClass}">
                <div class="toast-content">
                    <span class="material-icons toast-icon">${iconName}</span>
                    <span class="toast-text">${text}</span>
                </div>
                <button type="button" class="toast-close-btn" aria-label="Sluiten">
                    <span class="material-icons">close</span>
                </button>
            </div>
        </div>
    `;

  container.appendChild(wrapper);
  toastStack.push(wrapper);

  const closeBtn = wrapper.querySelector(".toast-close-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => removeToast(wrapper));
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      wrapper.classList.add("show");
    });
  });

  const timeoutId = setTimeout(() => {
    removeToast(wrapper);
  }, 4000);

  wrapper.dataset.timeoutId = String(timeoutId);

  if (toastStack.length >= 6) {
    setTimeout(() => {
      while (toastStack.length > 5) {
        const oldestToast = toastStack[0];
        if (oldestToast) {
          removeToast(oldestToast);
        }
      }
    }, 350);
  }

  return wrapper;
}

if (typeof window !== "undefined") {
  window.showToast = showToast;
}
