import { supabase } from "./supabase.js";
import {
  initModal,
  showModal,
  closeModal,
  showConfirmModal,
  showPromptModal,
  showPasswordPromptModal,
} from "./modal.js";
import { initToast, showToast } from "./toast.js";
import { initGlobalTooltips } from "./tooltip.js";

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
const INACTIVITY_WARNING_MS = INACTIVITY_TIMEOUT_MS - 60 * 1000;
const LAST_ACTIVITY_KEY = "instock_last_activity";
let inactivityWarningShown = false;
let inactivityModalOverlay = null;

const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (response.status === 401 && !window.isLoggingOut && !isLoginPage()) {
    logout();
  }
  return response;
};

function isSharedDevice() {
  return localStorage.getItem("sharedDevice") === "true";
}

function dismissInactivityWarning() {
  if (inactivityWarningShown && inactivityModalOverlay) {
    closeModal(inactivityModalOverlay);
    inactivityModalOverlay = null;
    inactivityWarningShown = false;
  }
}

function recordActivity() {
  localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
  dismissInactivityWarning();
}

function isLoginPage() {
  const p = window.location.pathname.replace(/\/$/, "");
  return p.endsWith("login") || p.endsWith("login.html");
}

function checkInactivity() {
  if (isLoginPage() || !isSharedDevice()) return;

  const last = localStorage.getItem(LAST_ACTIVITY_KEY);
  if (last) {
    const elapsed = Date.now() - Number(last);
    if (elapsed > INACTIVITY_TIMEOUT_MS) {
      logout();
      return;
    }
    if (elapsed > INACTIVITY_WARNING_MS && !inactivityWarningShown) {
      inactivityWarningShown = true;
      showConfirmModal({
        title: "Ben je er nog?",
        message:
          "Je wordt over 60 seconden automatisch uitgelogd wegens inactiviteit.",
        confirmText: "Ja, ik ben er nog",
        cancelText: "Uitloggen",
        isDanger: false,
      }).then((confirmed) => {
        inactivityModalOverlay = null;
        inactivityWarningShown = false;
        if (confirmed) {
          recordActivity();
        } else {
          logout();
        }
      });
      setTimeout(() => {
        inactivityModalOverlay =
          Array.from(document.querySelectorAll(".modal-overlay")).find((el) =>
            el.textContent.includes("Ben je er nog?"),
          ) || document.querySelector(".modal-overlay.active");
      }, 10);
    }
  }
}

function initInactivityTracker() {
  if (isLoginPage()) return;

  if (isSharedDevice()) {
    recordActivity();
  }

  let lastRecorded = 0;
  const updateThrottled = () => {
    if (!isSharedDevice()) return;
    const now = Date.now();
    if (now - lastRecorded > 2000 || inactivityWarningShown) {
      lastRecorded = now;
      recordActivity();
    }
  };

  [
    "mousemove",
    "mousedown",
    "keydown",
    "scroll",
    "touchstart",
    "click",
  ].forEach((event) => {
    window.addEventListener(event, updateThrottled, { passive: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkInactivity();
      updateThrottled();
    }
  });

  window.addEventListener("focus", () => {
    checkInactivity();
    updateThrottled();
  });

  setInterval(checkInactivity, 5000);

  setInterval(async () => {
    if (isLoginPage() || window.isLoggingOut) return;
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: isSessionValid, error } = await supabase.rpc("check_session_status");
      
      if (error || isSessionValid === false) {
        if (!window.isLoggingOut) {
          logout();
        }
      }
    } catch (err) {}
  }, 5000);
}

async function checkAuth() {
  const isLogin = isLoginPage();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session && !isLogin) {
    window.location.replace("login");
    return;
  } else if (session && isLogin) {
    window.location.replace("index");
    return;
  }

  if (!isLogin && isSharedDevice()) {
    const last = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (last && Date.now() - Number(last) > INACTIVITY_TIMEOUT_MS) {
      await logout();
      return;
    }
    recordActivity();
  }

  supabase.auth.onAuthStateChange((_event, newSession) => {
    if (!newSession && !isLoginPage()) {
      window.isLoggingOut = true;
      window.onbeforeunload = null;
      window.location.replace("login");
    }
  });
}

let currentUserData = null;

function isPermissionError(err) {
  if (!err) return false;
  const code = String(err.code || "");
  const status = Number(err.status || err.statusCode || 0);
  const text =
    `${err.message || ""} ${err.details || ""} ${err.hint || ""}`.toLowerCase();

  return (
    code === "42501" ||
    code === "PGRST301" ||
    status === 401 ||
    status === 403 ||
    text.includes("row-level security") ||
    text.includes("permission denied") ||
    text.includes("insufficient_privilege") ||
    text.includes("not authorized") ||
    text.includes("unauthorized") ||
    text.includes("forbidden") ||
    text.includes("rechten") ||
    text.includes("policy")
  );
}

async function getCurrentUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session || !session.user) return null;

  const { data, error } = await supabase
    .from("user_data")
    .select("full_name, username, store_id, role, birthday")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error || !data) return null;

  currentUserData = data;
  return currentUserData;
}

async function getStorePaths() {
  const user = await getCurrentUser();
  if (!user || !user.store_id) return [];

  const { data, error } = await supabase
    .from("store_data")
    .select("default_paths")
    .eq("store_id", user.store_id)
    .maybeSingle();

  if (error) throw error;
  return Array.isArray(data?.default_paths) ? data.default_paths : [];
}

const APP_MODULES = [
  {
    id: "bakplan",
    title: "Bakplan",
    description: "Bekijk en beheer het actuele bakplan voor de winkel.",
    icon: "bakery_dining",
    href: "bakplan",
    minRole: 2,
  },
  {
    id: "vulplanning",
    title: "Vulplanning Maker",
    description: "Maak en beheer vulplanningen, taken en shifts.",
    icon: "assignment",
    href: "vulplanning",
    minRole: 2,
  },
  {
    id: "productiviteit",
    title: "Productiviteit",
    description: "Bekijk en analyseer vulprestaties en statistieken.",
    icon: "trending_up",
    href: "productiviteit",
    minRole: 1,
  },
  {
    id: "productenbeheer",
    title: "Productenbeheer",
    description: "Beheer het assortiment, barcodes, vakken en prijzen.",
    icon: "inventory_2",
    href: "productenbeheer",
    minRole: 1,
  },
  {
    id: "gebruikersbeheer",
    title: "Gebruikersbeheer",
    description: "Beheer medewerkers, rollen en winkeltoegang.",
    icon: "people",
    href: "gebruikersbeheer",
    minRole: 2,
  },
  {
    id: "instellingen-winkel",
    title: "Instellingen Winkel",
    description: "Configureer winkelpaden, vulnormen en categorieën.",
    icon: "store",
    href: "instellingen-winkel",
    minRole: 3,
  },
  {
    id: "logs",
    title: "Systeem Logs",
    description: "Bekijk de geschiedenis van acties en wijzigingen.",
    icon: "history",
    href: "logs",
    minRole: 3,
  },
];

function getAvailableModules(role = 1) {
  const numericRole = Number(role) || 1;
  return APP_MODULES.filter((m) => numericRole >= (m.minRole || 1));
}

let overlayLoadingOrLoaded = false;

async function loadOverlay() {
  if (isLoginPage()) return;
  if (overlayLoadingOrLoaded || document.querySelector(".app-header")) return;
  overlayLoadingOrLoaded = true;

  try {
    const response = await fetch("overlay.html");
    if (response.ok) {
      if (document.querySelector(".app-header")) return;
      const html = await response.text();
      document.body.insertAdjacentHTML("afterbegin", html);

      const rawPath = (
        window.location.pathname.split("/").pop() || "index"
      ).replace(/\.html$/, "");
      const currentPath = rawPath === "" ? "index" : rawPath;
      const links = document.querySelectorAll(".sidebar-link");
      links.forEach((link) => {
        const href = (link.getAttribute("href") || "").replace(/\.html$/, "");
        if (href === currentPath) {
          link.classList.add("active");
        }
      });

      const sidebar = document.querySelector(".app-sidebar");
      const sidebarToggleBtn = document.getElementById("sidebarToggleBtn");
      const sidebarBackdrop = document.getElementById("sidebarBackdrop");

      if (sidebar) {
        const enableHover = () => {
          sidebar.classList.remove("hover-disabled");
          window.removeEventListener("mousemove", onFirstInteraction, true);
          window.removeEventListener("pointerdown", onFirstInteraction, true);
          sidebar.removeEventListener("mouseleave", onMouseLeave);
        };

        const onMouseLeave = () => {
          enableHover();
        };

        const onFirstInteraction = (e) => {
          const rect = sidebar.getBoundingClientRect();
          const isOver =
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom;
          if (isOver) {
            sidebar.addEventListener("mouseleave", onMouseLeave, {
              once: true,
            });
          } else {
            enableHover();
          }
          window.removeEventListener("mousemove", onFirstInteraction, true);
          window.removeEventListener("pointerdown", onFirstInteraction, true);
        };

        window.addEventListener("mousemove", onFirstInteraction, true);
        window.addEventListener("pointerdown", onFirstInteraction, true);
      }

      function toggleSidebar() {
        if (!sidebar) return;
        const isOpen = sidebar.classList.toggle("open");
        if (sidebarBackdrop) {
          sidebarBackdrop.classList.toggle("active", isOpen);
        }
      }

      function closeSidebar() {
        if (sidebar) sidebar.classList.remove("open");
        if (sidebarBackdrop) sidebarBackdrop.classList.remove("active");
      }

      if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener("click", toggleSidebar);
      }

      if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener("click", closeSidebar);
      }

      links.forEach((link) => {
        link.addEventListener("click", closeSidebar);
      });

      const changePasswordBtn = document.getElementById("changePasswordBtn");
      if (changePasswordBtn) {
        changePasswordBtn.addEventListener("click", openChangePasswordModal);
      }

      const logoutBtn = document.getElementById("logoutBtn");
      if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
          const confirmed = await showConfirmModal({
            title: "Uitloggen",
            message: "Weet je zeker dat je wilt uitloggen?",
            confirmText: "Uitloggen",
            cancelText: "Annuleren",
            isDanger: true,
          });
          if (confirmed) logout();
        });
      }

      const headerUserName = document.getElementById("headerUserName");
      const headerUserHandle = document.getElementById("headerUserHandle");
      const user = await getCurrentUser();
      if (user) {
        if (headerUserName) {
          headerUserName.textContent =
            user.full_name?.trim() || user.username?.trim() || "";
        }
        if (headerUserHandle && user.username) {
          const handle = user.username.trim();
          headerUserHandle.textContent = handle.startsWith("@")
            ? handle
            : `@${handle}`;
        }
        const roleNum = Number(user.role) || 1;
        APP_MODULES.forEach((mod) => {
          if (roleNum < (mod.minRole || 1)) {
            const linkEl = document.querySelector(
              `.sidebar-link[href="${mod.href}"]`,
            );
            if (linkEl) {
              linkEl.remove();
            }
          }
        });
      }
    }
  } catch (error) {}
}

async function openAccountModal(initialTab = "passkeys") {
  const overlay = await showModal(`
        <div class="modal-header">
            <h2 class="modal-title">Accountbeheer</h2>
            <p class="modal-subtitle">Beheer je gekoppelde passkeys en wachtwoord op één centrale plek</p>
        </div>

        <div class="native-segmented-control" role="tablist" style="display: flex; background: var(--input-background); border: 1px solid var(--card-border); border-radius: 12px; padding: 4px; gap: 4px; margin-bottom: 4px;">
            <button type="button" class="native-segment-btn ${initialTab === "passkeys" ? "active" : ""}" id="modalTabBtnPasskeys" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 12px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; background: ${initialTab === "passkeys" ? "var(--card-background)" : "transparent"}; color: ${initialTab === "passkeys" ? "var(--text-color)" : "var(--text-color-muted)"};">
                <span class="material-icons" style="font-size: 17px; color: ${initialTab === "passkeys" ? "var(--accent-color)" : "inherit"};">fingerprint</span>
                <span>Passkeys</span>
            </button>
            <button type="button" class="native-segment-btn ${initialTab === "password" ? "active" : ""}" id="modalTabBtnPassword" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 12px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; background: ${initialTab === "password" ? "var(--card-background)" : "transparent"}; color: ${initialTab === "password" ? "var(--text-color)" : "var(--text-color-muted)"};">
                <span class="material-icons" style="font-size: 17px; color: ${initialTab === "password" ? "var(--accent-color)" : "inherit"};">lock_reset</span>
                <span>Wachtwoord</span>
            </button>
        </div>

        <div id="modalPanelPasskeys" style="display: ${initialTab === "passkeys" ? "flex" : "none"}; flex-direction: column; gap: 14px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--input-background); border: 1px solid var(--card-border); border-radius: 12px; padding: 12px 14px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span class="material-icons" style="font-size: 22px; color: var(--accent-color);">fingerprint</span>
                    <div>
                        <div style="font-size: 13.5px; font-weight: 600; color: var(--text-color);">Nieuwe passkey</div>
                        <div style="font-size: 11.5px; color: var(--text-color-muted);">Touch ID, Face ID of apparaatsleutel</div>
                    </div>
                </div>
                <button type="button" class="btn" id="modalAddPasskeyBtn" style="padding: 8px 12px; font-size: 12.5px; border-radius: 8px; white-space: nowrap;">
                    <span class="material-icons btn-icon" style="font-size: 15px;">add</span>
                    Toevoegen
                </button>
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
                <label style="font-size: 11px; font-weight: 600; letter-spacing: 0.8px; color: var(--text-color-muted); text-transform: uppercase;">
                    Gekoppelde Passkeys
                </label>
                <div id="passkeyListContainer" style="display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto; padding-right: 4px;">
                    <div style="padding: 20px; text-align: center; color: var(--text-color-muted); font-size: 13px;">
                        Passkeys laden...
                    </div>
                </div>
            </div>
        </div>

        <div id="modalPanelPassword" style="display: ${initialTab === "password" ? "flex" : "none"}; flex-direction: column; gap: 12px;">
            <form class="modal-form" id="modalChangePasswordForm">
                <div class="form-group">
                    <label for="modalOldPasswordInput">Huidig wachtwoord *</label>
                    <input type="password" id="modalOldPasswordInput" class="modal-input" placeholder="Voer huidig wachtwoord in" required autocomplete="current-password">
                </div>
                <div class="form-group">
                    <label for="modalNewPasswordInput">Nieuw wachtwoord *</label>
                    <input type="password" id="modalNewPasswordInput" class="modal-input" placeholder="Voer nieuw wachtwoord in (min. 8 tekens)" required autocomplete="new-password" minlength="8">
                </div>
                <div class="form-group">
                    <label for="modalConfirmPasswordInput">Herhaal nieuw wachtwoord *</label>
                    <input type="password" id="modalConfirmPasswordInput" class="modal-input" placeholder="Herhaal nieuw wachtwoord" required autocomplete="new-password" minlength="8">
                </div>
                <button type="submit" class="btn" id="modalSubmitPasswordBtn" style="width: 100%; margin-top: 4px;">Wachtwoord wijzigen</button>
            </form>
        </div>

        <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <a href="account.html" class="modal-btn-secondary" style="text-decoration: none; font-size: 12.5px; display: inline-flex; align-items: center; gap: 4px; padding: 8px 12px;">
                <span class="material-icons" style="font-size: 15px;">open_in_new</span>
                <span>Volledige pagina</span>
            </a>
            <button type="button" class="modal-btn-secondary" id="closeAccountModalBtn">Sluiten</button>
        </div>
    `);

  const closeBtn = document.getElementById("closeAccountModalBtn");
  if (closeBtn) {
    closeBtn.addEventListener("click", closeModal);
  }

  const tabBtnPasskeys = document.getElementById("modalTabBtnPasskeys");
  const tabBtnPassword = document.getElementById("modalTabBtnPassword");
  const panelPasskeys = document.getElementById("modalPanelPasskeys");
  const panelPassword = document.getElementById("modalPanelPassword");

  function switchTab(tab) {
    const isPk = tab === "passkeys";
    if (panelPasskeys) panelPasskeys.style.display = isPk ? "flex" : "none";
    if (panelPassword) panelPassword.style.display = isPk ? "none" : "flex";

    if (tabBtnPasskeys) {
      tabBtnPasskeys.style.background = isPk ? "var(--card-background)" : "transparent";
      tabBtnPasskeys.style.color = isPk ? "var(--text-color)" : "var(--text-color-muted)";
      const icon = tabBtnPasskeys.querySelector(".material-icons");
      if (icon) icon.style.color = isPk ? "var(--accent-color)" : "inherit";
    }

    if (tabBtnPassword) {
      tabBtnPassword.style.background = isPk ? "transparent" : "var(--card-background)";
      tabBtnPassword.style.color = isPk ? "var(--text-color-muted)" : "var(--text-color)";
      const icon = tabBtnPassword.querySelector(".material-icons");
      if (icon) icon.style.color = isPk ? "inherit" : "var(--accent-color)";
    }
  }

  if (tabBtnPasskeys) tabBtnPasskeys.addEventListener("click", () => switchTab("passkeys"));
  if (tabBtnPassword) tabBtnPassword.addEventListener("click", () => switchTab("password"));

  async function loadPasskeys() {
    const container = document.getElementById("passkeyListContainer");
    if (!container) return;

    try {
      const listFn =
        typeof supabase.auth.passkey?.list === "function"
          ? supabase.auth.passkey.list.bind(supabase.auth.passkey)
          : null;

      if (!listFn) {
        container.innerHTML = `
          <div style="padding: 16px; text-align: center; color: var(--text-color-muted); font-size: 13px;">
            Geen passkey beheer ondersteuning beschikbaar in deze browser.
          </div>
        `;
        return;
      }

      const { data, error } = await listFn();

      if (error) {
        container.innerHTML = `
          <div style="padding: 16px; text-align: center; color: var(--danger-color); font-size: 13px;">
            ${escapeHtml(error.message || "Fout bij het ophalen van passkeys")}
          </div>
        `;
        return;
      }

      const passkeys = Array.isArray(data) ? data : data?.passkeys || [];

      if (passkeys.length === 0) {
        container.innerHTML = `
          <div style="padding: 20px; text-align: center; background: var(--input-background); border: 1px dashed var(--card-border); border-radius: 12px; color: var(--text-color-muted); font-size: 13px;">
            <span class="material-icons" style="font-size: 26px; opacity: 0.5; margin-bottom: 4px; display: block;">fingerprint</span>
            Nog geen passkeys ingesteld voor dit account.
          </div>
        `;
        return;
      }

      container.innerHTML = passkeys
        .map((pk, idx) => {
          const pkId = pk.id || pk.passkey_id || pk.credential_id || "";
          const name = pk.friendly_name || pk.name || `Passkey ${idx + 1}`;
          const createdDate = pk.created_at
            ? new Date(pk.created_at).toLocaleDateString("nl-NL", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            : "";

          return `
            <div class="passkey-item" style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: var(--input-background); border: 1px solid var(--card-border); border-radius: 10px;">
              <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                <div style="width: 32px; height: 32px; border-radius: 8px; background: var(--vullen-ghost-bg); border: 1px solid rgba(101, 141, 36, 0.3); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  <span class="material-icons" style="font-size: 18px; color: var(--accent-color);">fingerprint</span>
                </div>
                <div style="min-width: 0;">
                  <div style="font-size: 13px; font-weight: 600; color: var(--text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(name)}</div>
                  ${createdDate ? `<div style="font-size: 11px; color: var(--text-color-muted);">Gekoppeld op ${escapeHtml(createdDate)}</div>` : ""}
                </div>
              </div>
              <button type="button" class="action-btn delete-passkey-btn" data-id="${escapeHtml(pkId)}" title="Passkey verwijderen" style="color: var(--danger-color); margin-left: 8px; padding: 6px;">
                <span class="material-icons" style="font-size: 18px;">delete</span>
              </button>
            </div>
          `;
        })
        .join("");

      container.querySelectorAll(".delete-passkey-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const passkeyId = btn.getAttribute("data-id");
          if (!passkeyId) return;

          const verified = await showPasswordPromptModal({
            title: "Passkey verwijderen",
            subtitle:
              "Voer je wachtwoord in om deze passkey te verwijderen. Je kunt hierna niet meer inloggen met dit apparaat.",
            confirmText: "Verwijderen",
            cancelText: "Annuleren",
            isDanger: true,
          });

          if (!verified) return;

          btn.disabled = true;
          btn.innerHTML = `<span class="material-icons" style="font-size: 18px;">hourglass_empty</span>`;

          try {
            let delRes;
            if (typeof supabase.auth.passkey?.delete === "function") {
              delRes = await supabase.auth.passkey.delete({
                passkeyId: passkeyId,
                id: passkeyId,
              });
            }

            if (delRes?.error) {
              throw delRes.error;
            }

            showToast("notification", "Passkey succesvol verwijderd");
            loadPasskeys();
          } catch (delErr) {
            showToast(
              "error",
              delErr.message || "Fout bij het verwijderen van passkey",
            );
            loadPasskeys();
          }
        });
      });
    } catch (err) {
      container.innerHTML = `
        <div style="padding: 16px; text-align: center; color: var(--danger-color); font-size: 13px;">
          ${escapeHtml(err.message || "Fout bij het ophalen van passkeys")}
        </div>
      `;
    }
  }

  const addBtn = document.getElementById("modalAddPasskeyBtn");
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      const verified = await showPasswordPromptModal({
        title: "Passkey toevoegen",
        subtitle:
          "Voer je wachtwoord in om een nieuwe passkey te koppelen aan dit account.",
        confirmText: "Doorgaan",
        cancelText: "Annuleren",
      });

      if (!verified) return;

      const originalContent = addBtn.innerHTML;
      addBtn.disabled = true;
      addBtn.innerHTML = `
        <span class="material-icons btn-icon" style="font-size: 15px;">hourglass_empty</span>
        Toevoegen...
      `;

      try {
        const registerFn =
          typeof supabase.auth.registerPasskey === "function"
            ? supabase.auth.registerPasskey.bind(supabase.auth)
            : supabase.auth.passkey?.register?.bind(supabase.auth.passkey);

        if (!registerFn) {
          throw new Error(
            "Passkey registratie wordt niet ondersteund door deze client/browser.",
          );
        }

        const { data, error } = await registerFn();

        if (error) {
          showToast(
            "error",
            error.message || "Fout bij het registreren van passkey",
          );
          addBtn.disabled = false;
          addBtn.innerHTML = originalContent;
          return;
        }

        showToast("notification", "Passkey succesvol geregistreerd");
        addBtn.disabled = false;
        addBtn.innerHTML = originalContent;
        loadPasskeys();
      } catch (err) {
        showToast(
          "error",
          err.message || "Fout bij het registreren van passkey",
        );
        addBtn.disabled = false;
        addBtn.innerHTML = originalContent;
      }
    });
  }

  const form = document.getElementById("modalChangePasswordForm");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById("modalSubmitPasswordBtn");
      const oldPassword = document.getElementById("modalOldPasswordInput")?.value;
      const newPassword = document.getElementById("modalNewPasswordInput")?.value;
      const confirmPassword = document.getElementById("modalConfirmPasswordInput")?.value;

      if (!oldPassword || !newPassword) {
        showToast("error", "Beide wachtwoorden zijn verplicht");
        return;
      }

      if (newPassword.length < 8) {
        showToast("error", "Nieuw wachtwoord moet minimaal 8 tekens bevatten");
        return;
      }

      if (newPassword !== confirmPassword) {
        showToast("error", "Nieuwe wachtwoorden komen niet overeen");
        return;
      }

      if (oldPassword === newPassword) {
        showToast("error", "Nieuw wachtwoord mag niet hetzelfde zijn als het huidige");
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Wijzigen...";
      }

      try {
        const data = await invokeFn("update-password", {
          body: { oldPassword, newPassword },
        });

        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user?.email) {
          await supabase.auth.signInWithPassword({
            email: sessionData.session.user.email,
            password: newPassword,
          });
        }

        closeModal();
        showToast(
          "notification",
          data?.message || "Wachtwoord succesvol gewijzigd",
        );
      } catch (err) {
        showToast("error", err.message || "Fout bij wijzigen van wachtwoord");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Wachtwoord wijzigen";
        }
      }
    });
  }

  loadPasskeys();
}

async function openChangePasswordModal() {
  return openAccountModal("password");
}

async function openPasskeyModal() {
  return openAccountModal("passkeys");
}

async function logout() {
  window.isLoggingOut = true;
  currentUserData = null;
  localStorage.removeItem(LAST_ACTIVITY_KEY);
  window.onbeforeunload = null;
  window.addEventListener(
    "beforeunload",
    (e) => {
      delete e.returnValue;
    },
    { capture: true },
  );
  try {
    await supabase.auth.signOut();
  } catch (_) {}
  window.location.replace("login");
}

function disableInputSuggestions(root = document) {
  const inputs = root.querySelectorAll(
    'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea',
  );
  inputs.forEach((input) => {
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("spellcheck", "false");
  });
}

disableInputSuggestions();

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === 1) {
        if (node.matches && node.matches("input, textarea")) {
          disableInputSuggestions(node.parentElement || document);
        } else if (node.querySelectorAll) {
          disableInputSuggestions(node);
        }
      }
    }
  }
});

observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("offline", () => {
  showToast("error", "Netwerkverbinding verbroken. Opnieuw verbinden...");
});

window.addEventListener("online", () => {
  showToast("notification", "Opnieuw verbonden met het netwerk");
});

checkAuth();
loadOverlay();
initModal();
initToast();
initInactivityTracker();
initGlobalTooltips();

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function parseUserDisplay(nameStr, unameStr = "") {
  let title = String(nameStr || "").trim();
  let sub = String(unameStr || "").trim();

  if (sub && !sub.startsWith("@")) {
    sub = `@${sub}`;
  }

  const match = title.match(/^(.*?)\s*\(?@([a-zA-Z0-9._-]+)\)?$/);
  if (match) {
    title = match[1].trim();
    if (!sub) {
      sub = `@${match[2].trim()}`;
    }
  }

  return { title, sub };
}
async function invokeFn(fnName, options) {
  const { data, error } = await supabase.functions.invoke(fnName, options);
  if (error) {
    let msg = "";
    if (error.context && typeof error.context.json === "function") {
      try {
        const body = await error.context.json();
        msg = body?.error || body?.message || "";
      } catch (_) {}
    }
    if (!msg && error.context && typeof error.context.text === "function") {
      try {
        const text = await error.context.text();
        if (text) {
          try {
            const parsed = JSON.parse(text);
            msg = parsed?.error || parsed?.message || text;
          } catch (_) {
            msg = text;
          }
        }
      } catch (_) {}
    }
    if (!msg && data && typeof data === "object" && data.error) {
      msg = data.error;
    }
    if (!msg && error.message) {
      msg = error.message;
    }
    const status = Number(error.context?.status || error.status || 0);
    const errText = `${error.message || ""} ${msg || ""}`.toLowerCase();
    if (
      status === 401 ||
      errText.includes("401") ||
      errText.includes("unauthorized") ||
      errText.includes("jwt") ||
      errText.includes("token") ||
      errText.includes("session")
    ) {
      if (!isLoginPage()) {
        logout();
      }
      throw new Error("Niet ingelogd of sessie verlopen");
    }
    if (!msg || msg.includes("non-2xx")) {
      if (status === 403) {
        msg = "Geen toegang voor deze actie";
      } else if (status === 404) {
        msg = "Functie of gegevens niet gevonden";
      } else {
        msg = "Er is een fout opgetreden bij het uitvoeren";
      }
    }
    throw new Error(msg);
  }
  if (data && typeof data === "object" && data.error) {
    throw new Error(data.error);
  }
  return data;
}

function renderTableSkeletons(
  tbody,
  cardsContainer,
  columnsCount = 7,
  rowsCount = 5,
) {
  const elTbody =
    typeof tbody === "string" ? document.getElementById(tbody) : tbody;
  const elCards =
    typeof cardsContainer === "string"
      ? document.getElementById(cardsContainer)
      : cardsContainer;
  if (elTbody) {
    let html = "";
    const widths = [65, 80, 45, 70, 50, 60, 40, 75];
    for (let r = 0; r < rowsCount; r++) {
      html += "<tr>";
      for (let c = 0; c < columnsCount; c++) {
        const w = widths[(r + c) % widths.length];
        html += `<td><div class="skeleton" style="height: 16px; width: ${w}%;"></div></td>`;
      }
      html += "</tr>";
    }
    elTbody.innerHTML = html;
  }
  if (elCards) {
    let html = "";
    for (let r = 0; r < 3; r++) {
      html += `
                <div style="padding: 16px; border-bottom: 1px solid var(--card-border); display: flex; flex-direction: column; gap: 8px;">
                    <div class="skeleton" style="height: 16px; width: 65%;"></div>
                    <div class="skeleton" style="height: 14px; width: 40%;"></div>
                </div>
            `;
    }
    elCards.innerHTML = html;
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

export {
  supabase,
  getCurrentUser,
  getStorePaths,
  getAvailableModules,
  logout,
  initModal,
  showModal,
  closeModal,
  showConfirmModal,
  showPromptModal,
  showPasswordPromptModal,
  initToast,
  showToast,
  openAccountModal,
  openChangePasswordModal,
  openPasskeyModal,
  isPermissionError,
  escapeHtml,
  initGlobalTooltips,
  parseUserDisplay,
  invokeFn,
  renderTableSkeletons,
};
