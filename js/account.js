import {
  supabase,
  getCurrentUser,
  showToast,
  showConfirmModal,
  showPasswordPromptModal,
  escapeHtml,
  logout,
  invokeFn,
} from "./main.js";

const ROLE_MAP = {
  1: "Medewerker",
  2: "Teamleider",
  3: "Beheerder",
};

document.addEventListener("DOMContentLoaded", () => {
  initAccountPage();
});

async function initAccountPage() {
  initNav();
  initPasswordToggles();
  initPasswordValidation();
  initPasswordForm();
  initPasskeyActions();
  await loadUserData();
  await loadPasskeys();
  await loadSessions();
}

function initNav() {
  const logoutBtn = document.getElementById("accountPageLogoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      const confirmed = await showConfirmModal({
        title: "Uitloggen",
        message: "Weet je zeker dat je wilt uitloggen?",
        confirmText: "Uitloggen",
        cancelText: "Annuleren",
        isDanger: true,
      });
      if (confirmed) {
        logout();
      }
    });
  }
}

function initPasswordToggles() {
  const toggleBtns = document.querySelectorAll(".input-toggle-btn");
  toggleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      if (!targetId) return;
      const input = document.getElementById(targetId);
      if (!input) return;

      const icon = btn.querySelector(".material-icons");
      if (input.type === "password") {
        input.type = "text";
        if (icon) icon.textContent = "visibility_off";
      } else {
        input.type = "password";
        if (icon) icon.textContent = "visibility";
      }
    });
  });
}

function initPasswordValidation() {
  const oldPass = document.getElementById("accOldPassword");
  const newPass = document.getElementById("accNewPassword");
  const confPass = document.getElementById("accConfirmPassword");

  const reqMinLength = document.getElementById("reqMinLength");
  const reqMatch = document.getElementById("reqMatch");
  const reqDiff = document.getElementById("reqDiff");

  function updateChecklist() {
    const valNew = newPass?.value || "";
    const valConf = confPass?.value || "";
    const valOld = oldPass?.value || "";

    const isMinLength = valNew.length >= 8;
    setReqState(reqMinLength, isMinLength);

    const isMatch = valNew.length > 0 && valNew === valConf;
    setReqState(reqMatch, isMatch);

    const isDiff = valNew.length > 0 && valOld.length > 0 && valNew !== valOld;
    setReqState(reqDiff, isDiff);
  }

  function setReqState(el, isValid) {
    if (!el) return;
    el.classList.toggle("valid", isValid);
    const icon = el.querySelector(".material-icons");
    if (icon) {
      icon.textContent = isValid ? "check_circle" : "radio_button_unchecked";
    }
  }

  [oldPass, newPass, confPass].forEach((inp) => {
    if (inp) {
      inp.addEventListener("input", updateChecklist);
    }
  });
}

function initPasswordForm() {
  const form = document.getElementById("changePasswordPageForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("saveNewPasswordBtn");
    const oldPassword = document.getElementById("accOldPassword")?.value;
    const newPassword = document.getElementById("accNewPassword")?.value;
    const confirmPassword = document.getElementById("accConfirmPassword")?.value;

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
      showToast(
        "error",
        "Het nieuwe wachtwoord mag niet hetzelfde zijn als het huidige wachtwoord",
      );
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <span class="material-icons btn-icon" style="font-size: 18px;">hourglass_empty</span>
        <span>Opslaan...</span>
      `;
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

      showToast(
        "notification",
        data?.message || "Wachtwoord succesvol gewijzigd",
      );

      form.reset();
      const reqIcons = form.querySelectorAll(".req-item");
      reqIcons.forEach((el) => {
        el.classList.remove("valid");
        const icon = el.querySelector(".material-icons");
        if (icon) icon.textContent = "radio_button_unchecked";
      });
    } catch (err) {
      showToast("error", err.message || "Fout bij wijzigen van wachtwoord");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <span class="material-icons btn-icon">save</span>
          <span>Wachtwoord opslaan</span>
        `;
      }
    }
  });
}

async function loadUserData() {
  const user = await getCurrentUser();
  if (!user) return;

  const fullName = user.full_name?.trim() || "";
  const username = user.username?.trim() || "";
  const displayName = fullName || username || "Gebruiker";
  const roleName = ROLE_MAP[user.role] || `Rol ${user.role || 1}`;

  let storeName = "-";
  let storeCode = "-";
  let storeId = user.store_id || "-";

  if (user.store_id) {
    try {
      const { data: storeData } = await supabase
        .from("store_data")
        .select("store_id, name, store_code")
        .eq("store_id", user.store_id)
        .maybeSingle();

      if (storeData) {
        storeName = storeData.name || "-";
        storeCode = storeData.store_code || "-";
        storeId = storeData.store_id || user.store_id;
      }
    } catch (_) {}
  }

  const nameEl = document.getElementById("userProfileName");
  const handleEl = document.getElementById("userProfileHandle");
  const roleTextEl = document.getElementById("userRoleText");
  const storeTextEl = document.getElementById("userStoreText");
  const storeCodeEl = document.getElementById("userStoreCodeTag");
  const avatarEl = document.getElementById("userAvatarText");

  if (nameEl) nameEl.textContent = displayName;
  if (handleEl) {
    handleEl.textContent = username.startsWith("@") ? username : `@${username}`;
  }
  if (roleTextEl) roleTextEl.textContent = roleName;
  if (storeTextEl) {
    storeTextEl.textContent = storeName !== "-" ? storeName : "Winkel";
  }
  if (storeCodeEl) {
    if (storeCode && storeCode !== "-") {
      storeCodeEl.textContent = `#${storeCode}`;
      storeCodeEl.style.display = "inline";
    } else {
      storeCodeEl.style.display = "none";
    }
  }

  const birthdayBadgeEl = document.getElementById("userBirthdayBadge");
  const birthdayTextEl = document.getElementById("userBirthdayText");

  if (birthdayBadgeEl && birthdayTextEl) {
    if (user.birthday) {
      birthdayTextEl.textContent = formatDutchBirthday(user.birthday);
      birthdayBadgeEl.style.display = "inline-flex";
    } else {
      birthdayBadgeEl.style.display = "none";
    }
  }

  if (avatarEl) {
    const initials = fullName
      ? fullName
          .split(" ")
          .filter(Boolean)
          .map((w) => w[0])
          .slice(0, 2)
          .join("")
          .toUpperCase()
      : username.slice(0, 2).toUpperCase();
    avatarEl.textContent = initials || "IN";
  }
}

function formatDutchBirthday(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    const months = [
      "januari",
      "februari",
      "maart",
      "april",
      "mei",
      "juni",
      "juli",
      "augustus",
      "september",
      "oktober",
      "november",
      "december",
    ];
    const mIdx = parseInt(month, 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      return `${parseInt(day, 10)} ${months[mIdx]} ${year}`;
    }
    return `${day}-${month}-${year}`;
  }
  return dateStr;
}

async function loadPasskeys() {
  const container = document.getElementById("passkeyListGroup");
  if (!container) return;

  try {
    const listFn =
      typeof supabase.auth.passkey?.list === "function"
        ? supabase.auth.passkey.list.bind(supabase.auth.passkey)
        : null;

    if (!listFn) {
      container.innerHTML = `
        <div class="empty-passkeys-state">
          <span class="material-icons">info</span>
          <div class="empty-passkeys-title">Niet ondersteund</div>
          <div class="empty-passkeys-desc">
            Passkey beheer wordt niet ondersteund door deze browser.
          </div>
        </div>
      `;
      return;
    }

    const { data, error } = await listFn();

    if (error) {
      container.innerHTML = `
        <div class="empty-passkeys-state" style="border-color: rgba(239, 68, 68, 0.3);">
          <span class="material-icons" style="color: var(--danger-color);">error_outline</span>
          <div class="empty-passkeys-title" style="color: var(--danger-color);">Fout bij ophalen</div>
          <div class="empty-passkeys-desc">
            ${escapeHtml(error.message || "Kan passkeys niet laden")}
          </div>
        </div>
      `;
      return;
    }

    const passkeys = Array.isArray(data) ? data : data?.passkeys || [];

    if (passkeys.length === 0) {
      container.innerHTML = `
        <div class="empty-passkeys-state">
          <span class="material-icons">fingerprint</span>
          <div class="empty-passkeys-title">Nog geen passkeys ingesteld</div>
          <div class="empty-passkeys-desc">
            Klik hierboven op "Passkey toevoegen" om Touch ID of Face ID in te stellen.
          </div>
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
          <div class="passkey-item-row">
            <div class="passkey-item-left">
              <div class="passkey-item-icon">
                <span class="material-icons">fingerprint</span>
              </div>
              <div style="min-width: 0;">
                <div class="passkey-item-title">${escapeHtml(name)}</div>
                ${createdDate ? `<div class="passkey-item-date">Toegevoegd op ${escapeHtml(createdDate)}</div>` : ""}
              </div>
            </div>
            <button
              type="button"
              class="action-btn delete-passkey-item-btn"
              data-id="${escapeHtml(pkId)}"
              title="Passkey verwijderen"
              style="color: var(--danger-color);"
            >
              <span class="material-icons">delete</span>
            </button>
          </div>
        `;
      })
      .join("");

    container.querySelectorAll(".delete-passkey-item-btn").forEach((btn) => {
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
          await loadPasskeys();
        } catch (delErr) {
          showToast(
            "error",
            delErr.message || "Fout bij het verwijderen van passkey",
          );
          await loadPasskeys();
        }
      });
    });
  } catch (err) {
    container.innerHTML = `
      <div class="empty-passkeys-state">
        <span class="material-icons" style="color: var(--danger-color);">error_outline</span>
        <div class="empty-passkeys-title" style="color: var(--danger-color);">Fout bij ophalen</div>
        <div class="empty-passkeys-desc">
          ${escapeHtml(err.message || "Kan passkeys niet laden")}
        </div>
      </div>
    `;
  }
}

function initPasskeyActions() {
  const addBtn = document.getElementById("addNewPasskeyBtn");
  if (!addBtn) return;

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
      <span class="material-icons btn-icon" style="font-size: 16px;">hourglass_empty</span>
      <span>Toevoegen...</span>
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
        return;
      }

      showToast("notification", "Passkey succesvol geregistreerd!");
      await loadPasskeys();
    } catch (err) {
      showToast(
        "error",
        err.message || "Fout bij het registreren van passkey",
      );
    } finally {
      addBtn.disabled = false;
      addBtn.innerHTML = originalContent;
    }
  });
}

async function loadSessions() {
  const container = document.getElementById("sessionListGroup");
  if (!container) return;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const currentToken = sessionData?.session?.access_token;
    
    let currentSessionId = null;
    if (currentToken) {
      try {
        const payloadStr = currentToken.split(".")[1];
        if (payloadStr) {
          const payload = JSON.parse(atob(payloadStr));
          currentSessionId = payload.session_id;
        }
      } catch (e) {}
    }

    const data = await invokeFn("manage-sessions", {
      body: { action: "list", current_session_id: currentSessionId }
    });

    const sessions = data.sessions || [];
    
    if (sessions.length === 0) {
      container.innerHTML = `
        <div class="empty-passkeys-state">
          <span class="material-icons">devices</span>
          <div class="empty-passkeys-title">Geen sessies gevonden</div>
        </div>
      `;
      return;
    }

    container.innerHTML = sessions
      .map((sess, idx) => {
        const sId = sess.id;
        const isCurrent = sId === currentSessionId || sId === data.currentSessionId;
        
        const createdDate = sess.created_at
          ? new Date(sess.created_at).toLocaleDateString("nl-NL", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            })
          : "";

        const userAgent = sess.user_agent || "Onbekend apparaat";
        let deviceIcon = "device_unknown";
        if (userAgent.toLowerCase().includes("mobile") || userAgent.toLowerCase().includes("android") || userAgent.toLowerCase().includes("iphone")) {
           deviceIcon = "smartphone";
        } else if (userAgent.toLowerCase().includes("mac") || userAgent.toLowerCase().includes("windows") || userAgent.toLowerCase().includes("linux")) {
           deviceIcon = "computer";
        }

        return `
          <div class="passkey-item-row" style="${isCurrent ? 'border-color: var(--accent-color); background-color: var(--vullen-ghost-bg);' : ''}">
            <div class="passkey-item-left">
              <div class="passkey-item-icon" style="${isCurrent ? 'background-color: var(--accent-color); color: white;' : ''}">
                <span class="material-icons">${deviceIcon}</span>
              </div>
              <div style="min-width: 0;">
                <div class="passkey-item-title" title="${escapeHtml(userAgent)}">
                  ${escapeHtml(userAgent.length > 30 ? userAgent.substring(0, 30) + "..." : userAgent)}
                  ${isCurrent ? '<span style="font-size: 10px; background-color: var(--accent-color); color: white; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">Huidig</span>' : ''}
                </div>
                ${createdDate ? `<div class="passkey-item-date">Ingelogd op ${escapeHtml(createdDate)}</div>` : ""}
                ${sess.ip ? `<div class="passkey-item-date">IP: ${escapeHtml(sess.ip)}</div>` : ""}
              </div>
            </div>
            ${!isCurrent ? `
            <button
              type="button"
              class="action-btn delete-session-item-btn"
              data-id="${escapeHtml(sId)}"
              title="Sessie uitloggen"
              style="color: var(--danger-color);"
            >
              <span class="material-icons">logout</span>
            </button>` : ''}
          </div>
        `;
      })
      .join("");

    container.querySelectorAll(".delete-session-item-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const sessId = btn.getAttribute("data-id");
        if (!sessId) return;

        const verified = await showPasswordPromptModal({
          title: "Sessie uitloggen",
          subtitle:
            "Voer je wachtwoord in om deze sessie veilig uit te loggen.",
          confirmText: "Uitloggen",
          cancelText: "Annuleren",
          isDanger: true,
        });

        if (!verified) return;

        btn.disabled = true;
        btn.innerHTML = `<span class="material-icons" style="font-size: 18px;">hourglass_empty</span>`;

        try {
          await invokeFn("manage-sessions", {
            body: { action: "delete", session_id: sessId }
          });

          showToast("notification", "Sessie succesvol uitgelogd");
          await loadSessions();
        } catch (err) {
          showToast(
            "error",
            err.message || "Fout bij het uitloggen van sessie",
          );
          await loadSessions();
        }
      });
    });

  } catch (err) {
    container.innerHTML = `
      <div class="empty-passkeys-state">
        <span class="material-icons" style="color: var(--danger-color);">error_outline</span>
        <div class="empty-passkeys-title" style="color: var(--danger-color);">Fout bij ophalen</div>
        <div class="empty-passkeys-desc">
          ${escapeHtml(err.message || "Kan sessies niet laden")}
        </div>
      </div>
    `;
  }
}
