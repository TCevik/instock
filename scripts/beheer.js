document.addEventListener("DOMContentLoaded", async () => {
    const client = await window.getSupabase();
    const { data: { session } } = await client.auth.getSession();
    if (!session) {
        window.location.href = "login.html";
        return;
    }

    const { data: profile, error: profileError } = await client
        .from("profielen")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();

    if (profileError || !profile || profile.rol !== "beheerder") {
        window.location.href = "index.html";
        return;
    }

    const myWinkelId = profile.winkel_id;
    const myUserId = session.user.id;
    const beheerMsg = document.getElementById("beheer-msg");
    const createUserForm = document.getElementById("create-user-form");
    const usersList = document.getElementById("users-list");

    const editModal = document.getElementById("edit-user-modal");
    const editForm = document.getElementById("edit-user-form");
    const editMsg = document.getElementById("edit-msg");
    const closeEditModalBtn = document.getElementById("close-edit-modal-btn");

    const loadEmployees = async () => {
        usersList.innerHTML = "";
        try {
            const { data: employees, error } = await client
                .from("profielen")
                .select("*")
                .eq("winkel_id", myWinkelId)
                .neq("id", myUserId)
                .order("volledige_naam");

            if (error) throw error;

            const filteredEmployees = employees.filter(emp => {
                if (emp.is_hoofdbeheerder === true && emp.id !== myUserId) {
                    return false;
                }
                return true;
            });

            if (!filteredEmployees || filteredEmployees.length === 0) {
                usersList.innerHTML = '<div class="empty-state">Geen medewerkers gevonden.</div>';
                return;
            }

            filteredEmployees.forEach(emp => {
                const item = document.createElement("div");
                item.className = "user-item";

                const info = document.createElement("div");
                info.className = "user-info";

                const nameContainer = document.createElement("div");
                nameContainer.className = "user-name-container";

                const name = document.createElement("span");
                name.className = "user-name";
                name.textContent = emp.volledige_naam || "Naamloze medewerker";
                nameContainer.appendChild(name);

                if (emp.rol === "beheerder") {
                    const badge = document.createElement("span");
                    badge.className = "user-badge admin-badge";
                    badge.textContent = "Beheerder";
                    nameContainer.appendChild(badge);
                }

                const number = document.createElement("span");
                number.className = "user-number";
                number.textContent = `Personeelsnummer: ${emp.personeelsnummer || "-"}`;

                info.appendChild(nameContainer);
                info.appendChild(number);

                const actions = document.createElement("div");
                actions.className = "user-actions";

                const editBtn = document.createElement("button");
                editBtn.className = "btn-edit";
                editBtn.textContent = "Bewerken";
                editBtn.addEventListener("click", () => {
                    document.getElementById("edit-user-id").value = emp.id;
                    document.getElementById("edit-medewerker-naam").value = emp.volledige_naam || "";
                    document.getElementById("edit-medewerker-nummer").value = emp.personeelsnummer || "";
                    document.getElementById("edit-medewerker-rol").value = emp.rol || "medewerker";
                    document.getElementById("edit-medewerker-password").value = "";
                    editMsg.className = "message-box";
                    editModal.classList.remove("hidden");
                });

                const deleteBtn = document.createElement("button");
                deleteBtn.className = "btn-delete";
                deleteBtn.textContent = "Verwijderen";
                deleteBtn.addEventListener("click", async () => {
                    const confirmed = await window.showConfirm(`Weet u zeker dat u ${emp.volledige_naam || "deze medewerker"} wilt verwijderen?`);
                    if (confirmed) {
                        try {
                            const { error: deleteError } = await client.rpc("delete_medewerker", {
                                target_user_id: emp.id
                            });

                            if (deleteError) throw deleteError;

                            window.showToast("Medewerker succesvol verwijderd.", "success");
                            loadEmployees();
                        } catch (err) {
                            window.showToast(err.message, "error");
                        }
                    }
                });

                actions.appendChild(editBtn);
                actions.appendChild(deleteBtn);

                item.appendChild(info);
                item.appendChild(actions);
                usersList.appendChild(item);
            });
        } catch (err) {
            window.showToast(err.message, "error");
        }
    };

    closeEditModalBtn.addEventListener("click", () => {
        editModal.classList.add("hidden");
    });

    editModal.addEventListener("click", (e) => {
        if (e.target === editModal) {
            editModal.classList.add("hidden");
        }
    });

    createUserForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const naam = document.getElementById("medewerker-naam").value.trim();
        const personeelsnummer = document.getElementById("medewerker-nummer").value.trim();
        const rol = document.getElementById("medewerker-rol").value;
        const password = document.getElementById("medewerker-password").value;
        const btn = createUserForm.querySelector("button");

        btn.disabled = true;

        try {
            const numVal = parseInt(personeelsnummer, 10);
            const { data: existingUser, error: checkError } = await client
                .from("profielen")
                .select("id")
                .eq("personeelsnummer", numVal)
                .eq("winkel_id", myWinkelId)
                .maybeSingle();

            if (checkError) throw checkError;
            if (existingUser) {
                throw new Error("Dit personeelsnummer is al in gebruik binnen deze winkel.");
            }

            const authClient = supabase.createClient(
                "https://geabdfhcbzfgmetuaocl.supabase.co",
                "sb_publishable_BFeKHHjqJmwvlU_GZ2CKZA_sidiX_Ov",
                {
                    auth: {
                        persistSession: false,
                        autoRefreshToken: false,
                        detectSessionInUrl: false,
                        storage: {
                            getItem: () => null,
                            setItem: () => { },
                            removeItem: () => { }
                        }
                    }
                }
            );

            const email = `${personeelsnummer}@${myWinkelId}.instock.local`;

            const { error: signUpError } = await authClient.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        winkel_id: myWinkelId,
                        full_name: naam,
                        personeelsnummer: numVal,
                        rol: rol
                    }
                }
            });

            if (signUpError) throw signUpError;

            window.showToast("Medewerker succesvol aangemaakt!", "success");
            createUserForm.reset();
            loadEmployees();
        } catch (err) {
            window.showToast(err.message, "error");
        } finally {
            btn.disabled = false;
        }
    });

    editForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const userId = document.getElementById("edit-user-id").value;
        const naam = document.getElementById("edit-medewerker-naam").value.trim();
        const personeelsnummer = document.getElementById("edit-medewerker-nummer").value.trim();
        const rol = document.getElementById("edit-medewerker-rol").value;
        const password = document.getElementById("edit-medewerker-password").value;
        const btn = editForm.querySelector("button[type='submit']");

        btn.disabled = true;

        try {
            const { error } = await client.rpc("update_medewerker", {
                target_user_id: userId,
                nieuwe_naam: naam,
                nieuw_personeelsnummer: parseInt(personeelsnummer, 10),
                nieuw_wachtwoord: password || null,
                nieuwe_rol: rol
            });

            if (error) throw error;

            window.showToast("Medewerker succesvol aangepast!", "success");

            editModal.classList.add("hidden");
            loadEmployees();
        } catch (err) {
            window.showToast(err.message, "error");
        } finally {
            btn.disabled = false;
        }
    });

    await loadEmployees();
});
