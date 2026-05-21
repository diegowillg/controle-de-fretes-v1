const authConfig = {
  mainElementId: "appMain",
  onLogin: null,
  onLogout: null,
};

function initAuth(config) {
  Object.assign(authConfig, config);
}

function updateAuthUi() {
  const authScreen = document.getElementById("authScreen");
  const appMain = document.getElementById(authConfig.mainElementId);
  const userBar = document.getElementById("userBar");
  const userEmail = document.getElementById("userEmail");
  const recoveryScreen = document.getElementById("passwordRecoveryScreen");

  if (
    typeof isPasswordRecovery !== "undefined" &&
    isPasswordRecovery &&
    recoveryScreen
  ) {
    authScreen.classList.add("hidden");
    recoveryScreen.classList.remove("hidden");
    if (appMain) appMain.classList.add("hidden");
    userBar.classList.add("hidden");
    const siteNav = document.getElementById("siteNav");
    if (siteNav) siteNav.classList.add("hidden");
    return;
  }

  if (recoveryScreen) {
    recoveryScreen.classList.add("hidden");
  }

  const siteNav = document.getElementById("siteNav");

  if (currentUser) {
    authScreen.classList.add("hidden");
    if (appMain) appMain.classList.remove("hidden");
    userBar.classList.remove("hidden");
    if (siteNav) siteNav.classList.remove("hidden");
    userEmail.textContent = currentUser.email || "Usuário logado";
    if (typeof applyInitialTab === "function") {
      applyInitialTab();
    }
  } else {
    authScreen.classList.remove("hidden");
    if (appMain) appMain.classList.add("hidden");
    userBar.classList.add("hidden");
    if (siteNav) siteNav.classList.add("hidden");
    userEmail.textContent = "";
  }
}

function getAuthCredentials() {
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;

  if (!email || !password) {
    showAlert("authAlert", "Informe e-mail e senha.");
    return null;
  }

  if (password.length < 6) {
    showAlert("authAlert", "A senha precisa ter pelo menos 6 caracteres.");
    return null;
  }

  hideAlert("authAlert");
  hideSuccess("authSuccess");
  return { email, password };
}

async function loginUser() {
  const credentials = getAuthCredentials();
  if (!credentials) return;

  const { data, error } =
    await supabaseClient.auth.signInWithPassword(credentials);

  if (error) {
    showAlert("authAlert", "Erro ao entrar. Confira e-mail e senha.");
    console.error(error);
    return;
  }

  hideAlert("authAlert");
  hideSuccess("authSuccess");

  currentUser = data.session?.user || null;

  if (!currentUser) {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    currentUser = sessionData.session?.user || null;
  }

  if (!currentUser) {
    showAlert(
      "authAlert",
      "Login sem sessão ativa. Verifique e-mail confirmado e configurações do Supabase.",
    );
    return;
  }

  if (typeof isPasswordRecovery !== "undefined") {
    isPasswordRecovery = false;
  }

  updateAuthUi();

  if (typeof authConfig.onLogin === "function") {
    await authConfig.onLogin();
  }

  if (typeof loadAccountingFromSupabase === "function") {
    await loadAccountingFromSupabase();
  }

  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === "contabilidade" && typeof initAccountingTab === "function") {
    initAccountingTab();
  }
}

async function logoutUser() {
  if (typeof authConfig.onLogout === "function") {
    authConfig.onLogout();
  }
  await supabaseClient.auth.signOut();
  currentUser = null;
  updateAuthUi();
}

async function listenAuthChanges(onSession) {
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      if (typeof isPasswordRecovery !== "undefined") {
        isPasswordRecovery = true;
      }
      currentUser = session?.user || null;
      updateAuthUi();
      return;
    }

    if (
      event === "SIGNED_IN" ||
      event === "SIGNED_OUT" ||
      event === "TOKEN_REFRESHED" ||
      event === "INITIAL_SESSION"
    ) {
      currentUser = session?.user || null;
      updateAuthUi();
      if (currentUser && event !== "SIGNED_OUT" && typeof onSession === "function") {
        await onSession();
      }
    }
  });
}

async function restoreSession() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) console.error(error);
  currentUser = data.session?.user || null;
  updateAuthUi();
  return !!currentUser;
}
