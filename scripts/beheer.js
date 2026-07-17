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

            if (!employees || employees.length === 0) {
                usersList.innerHTML = '<div class="empty-state">Geen medewerkers gevonden.</div>';
                return;
            }

            employees.forEach(emp => {
                const item = document.createElement("div");
                item.className = "user-item";

                const info = document.createElement("div");
                info.className = "user-info";

                const name = document.createElement("span");
                name.className = "user-name";
                name.textContent = emp.volledige_naam || "Naamloze medewerker";

                const number = document.createElement("span");
                number.className = "user-number";
                number.textContent = `Personeelsnummer: ${emp.personeelsnummer || "-"}`;

                info.appendChild(name);
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
                    document.getElementById("edit-medewerker-password").value = "";
                    editMsg.className = "message-box";
                    editModal.classList.remove("hidden");
                });

                const deleteBtn = document.createElement("button");
                deleteBtn.className = "btn-delete";
                deleteBtn.textContent = "Verwijderen";
                deleteBtn.addEventListener("click", async () => {
                    if (confirm(`Weet u zeker dat u ${emp.volledige_naam || "deze medewerker"} wilt verwijderen?`)) {
                        try {
                            const { error: deleteError } = await client
                                .from("profielen")
                                .delete()
                                .eq("id", emp.id);

                            if (deleteError) throw deleteError;

                            beheerMsg.textContent = "Medewerker succesvol verwijderd.";
                            beheerMsg.className = "message-box success";
                            loadEmployees();
                        } catch (err) {
                            beheerMsg.textContent = err.message;
                            beheerMsg.className = "message-box error";
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
            beheerMsg.textContent = err.message;
            beheerMsg.className = "message-box error";
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
        const password = document.getElementById("medewerker-password").value;
        const btn = createUserForm.querySelector("button");

        btn.disabled = true;
        beheerMsg.className = "message-box";

        try {
            const authClient = supabase.createClient(
                "https://geabdfhcbzfgmetuaocl.supabase.co",
                "sb_publishable_BFeKHHjqJmwvlU_GZ2CKZA_sidiX_Ov",
                {
                    auth: {
                        persistSession: false,
                        autoRefreshToken: false
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
                        personeelsnummer: parseInt(personeelsnummer, 10),
                        rol: 'medewerker'
                    }
                }
            });

            if (signUpError) throw signUpError;

            beheerMsg.textContent = "Medewerker succesvol aangemaakt!";
            beheerMsg.className = "message-box success";
            createUserForm.reset();
            loadEmployees();
        } catch (err) {
            beheerMsg.textContent = err.message;
            beheerMsg.className = "message-box error";
        } finally {
            btn.disabled = false;
        }
    });

    editForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const userId = document.getElementById("edit-user-id").value;
        const naam = document.getElementById("edit-medewerker-naam").value.trim();
        const personeelsnummer = document.getElementById("edit-medewerker-nummer").value.trim();
        const password = document.getElementById("edit-medewerker-password").value;
        const btn = editForm.querySelector("button[type='submit']");

        btn.disabled = true;
        editMsg.className = "message-box";

        try {
            const { error } = await client.rpc("update_medewerker", {
                target_user_id: userId,
                nieuwe_naam: naam,
                nieuw_personeelsnummer: parseInt(personeelsnummer, 10),
                nieuw_wachtwoord: password || null
            });

            if (error) throw error;

            beheerMsg.textContent = "Medewerker succesvol aangepast!";
            beheerMsg.className = "message-box success";

            editModal.classList.add("hidden");
            loadEmployees();
        } catch (err) {
            editMsg.textContent = err.message;
            editMsg.className = "message-box error";
        } finally {
            btn.disabled = false;
        }
    });

    await loadEmployees();
});
