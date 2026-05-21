let savedTrips = [];
let isPasswordRecovery = false;

let currentTrip = {
  id: null,
  data: "",
  cidadeSaida: "",
  cidadeDestinoFinal: "",
  notas: [],
  combustivel: 0,
  pedagio: 0,
  divisaoPor: 2,
};

function setStep(active) {
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`step${i}`).classList.remove("active");
  }
  document.getElementById(`step${active}`).classList.add("active");
}

function showScreen(screenId, step) {
  [
    "screenTrip",
    "screenNotes",
    "screenExpenses",
    "screenSummary",
  ].forEach((id) => {
    document.getElementById(id).classList.add("hidden");
  });
  document.getElementById(screenId).classList.remove("hidden");
  setStep(step);
}

initAuth({
  mainElementId: "loggedArea",
  onLogin: loadTripsFromSupabase,
  onLogout: () => {
    savedTrips = [];
    resetForm();
    switchTab("fretes", false);
    if (typeof resetAccountingSession === "function") {
      resetAccountingSession();
    }
  },
});

function switchTab(tab, updateUrl = true) {
  const fretesPanel = document.getElementById("tabPanelFretes");
  const contabilidadePanel = document.getElementById("tabPanelContabilidade");
  const buttons = document.querySelectorAll(".tab-btn");

  if (!fretesPanel || !contabilidadePanel) return;

  const isFretes = tab === "fretes";

  fretesPanel.classList.toggle("hidden", !isFretes);
  contabilidadePanel.classList.toggle("hidden", isFretes);

  buttons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });

  if (updateUrl) {
    const url = new URL(window.location.href);
    if (isFretes) {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", "contabilidade");
    }
    window.history.replaceState({}, document.title, url);
  }

  if (!isFretes && typeof initAccountingTab === "function") {
    initAccountingTab();
  }
}

function applyInitialTab() {
  const tab = new URLSearchParams(window.location.search).get("tab");
  switchTab(tab === "contabilidade" ? "contabilidade" : "fretes", false);
}

async function checkAuth() {
  const urlParams = new URLSearchParams(window.location.search);
  const isResetPasswordUrl =
    urlParams.has("reset-password") ||
    window.location.hash.includes("type=recovery");

  if (isResetPasswordUrl) {
    isPasswordRecovery = true;
  }

  const loggedIn = await restoreSession();
  await listenAuthChanges(loadTripsFromSupabase);

  if (loggedIn) {
    await loadTripsFromSupabase();
  }
}

async function forgotPassword() {
  hideAlert("authAlert");
  hideSuccess("authSuccess");

  const email = document.getElementById("authEmail").value.trim();

  if (!email) {
    showAlert(
      "authAlert",
      "Digite o e-mail cadastrado para recuperar a senha.",
    );
    return;
  }

  const { data: exists, error: existsError } = await supabaseClient.rpc(
    "email_usuario_existe",
    { email_input: email },
  );

  if (existsError) {
    console.error(existsError);
    showAlert(
      "authAlert",
      "Erro ao verificar o e-mail. Rode a função SQL de recuperação no Supabase.",
    );
    return;
  }

  if (!exists) {
    showAlert("authAlert", "Este e-mail não está cadastrado no sistema.");
    return;
  }

  const { error } = await supabaseClient.auth.resetPasswordForEmail(
    email,
    {
      redirectTo:
        window.location.origin +
        window.location.pathname +
        "?reset-password=true",
    },
  );

  if (error) {
    console.error(error);
    showAlert(
      "authAlert",
      `Erro ao enviar o link: ${error.message || "verifique as configurações de autenticação no Supabase."}`,
    );
    return;
  }

  showSuccess(
    "authSuccess",
    "Link de redefinição enviado para o e-mail cadastrado.",
  );
}

async function updateRecoveredPassword() {
  hideAlert("recoveryAlert");
  hideSuccess("recoverySuccess");

  const newPassword = document.getElementById("newPassword").value;
  const confirmNewPassword =
    document.getElementById("confirmNewPassword").value;

  const { data: sessionData } = await supabaseClient.auth.getSession();

  if (!sessionData.session) {
    showAlert(
      "recoveryAlert",
      "Sessão de recuperação não encontrada. Abra novamente o link recebido por e-mail.",
    );
    return;
  }

  if (!newPassword || !confirmNewPassword) {
    showAlert("recoveryAlert", "Preencha e confirme a nova senha.");
    return;
  }

  if (newPassword.length < 6) {
    showAlert(
      "recoveryAlert",
      "A nova senha precisa ter pelo menos 6 caracteres.",
    );
    return;
  }

  if (newPassword !== confirmNewPassword) {
    showAlert("recoveryAlert", "As senhas não conferem.");
    return;
  }

  const { error } = await supabaseClient.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    console.error(error);
    showAlert(
      "recoveryAlert",
      "Erro ao atualizar a senha. Abra novamente o link enviado por e-mail.",
    );
    return;
  }

  showSuccess("recoverySuccess", "Senha alterada com sucesso.");
  isPasswordRecovery = false;
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmNewPassword").value = "";
  window.history.replaceState(
    {},
    document.title,
    window.location.origin + window.location.pathname,
  );
  await supabaseClient.auth.signOut();
  isPasswordRecovery = false;
  currentUser = null;
  updateAuthUi();
  showSuccess(
    "authSuccess",
    "Senha alterada. Entre novamente com a nova senha.",
  );
}

function goToNotes() {
  const data = document.getElementById("dataViagem").value;
  const cidadeSaida = document.getElementById("cidadeSaida").value.trim();
  const cidadeDestinoFinal = document
    .getElementById("cidadeDestinoFinal")
    .value.trim();

  if (!data || !cidadeSaida || !cidadeDestinoFinal) {
    showAlert(
      "tripAlert",
      "Preencha data, cidade de saída e destino final.",
    );
    return;
  }

  hideAlert("tripAlert");
  currentTrip.data = data;
  currentTrip.cidadeSaida = cidadeSaida;
  currentTrip.cidadeDestinoFinal = cidadeDestinoFinal;
  showScreen("screenNotes", 2);
  renderNotes();
}

function backToTrip() {
  showScreen("screenTrip", 1);
}

function addNote() {
  const rota = document.getElementById("rotaNota").value.trim();
  const remetente = document.getElementById("remetente").value.trim();
  const numeroNf = document.getElementById("numeroNf").value.trim();
  const valorNf = parseMoneyValue(
    document.getElementById("valorNf").value,
  );
  const valorFrete = parseMoneyValue(
    document.getElementById("valorFrete").value,
  );

  if (
    !rota ||
    !remetente ||
    !numeroNf ||
    valorNf <= 0 ||
    valorFrete <= 0
  ) {
    showAlert(
      "noteAlert",
      "Preencha rota, remetente, número da NF, valor da NF e valor do frete.",
    );
    return;
  }

  hideAlert("noteAlert");

  currentTrip.notas.push({
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now(),
    rota,
    remetente,
    numeroNf,
    valorNf,
    valorFrete,
  });

  document.getElementById("rotaNota").value = "";
  document.getElementById("remetente").value = "";
  document.getElementById("numeroNf").value = "";
  document.getElementById("valorNf").value = "";
  document.getElementById("valorFrete").value = "";
  document.getElementById("rotaNota").focus();

  renderNotes();
}

function removeNote(id) {
  currentTrip.notas = currentTrip.notas.filter(
    (note) => String(note.id) !== String(id),
  );
  renderNotes();
}

function getExportDivisaoPor() {
  const select = document.getElementById("exportDivisaoPor");
  if (!select) return 2;
  return getDivisaoPor({ divisaoPor: select.value });
}

function syncDivisaoPorSelect() {
  const select = document.getElementById("divisaoPor");
  if (!select) return;
  select.value = String(getDivisaoPor(currentTrip));
}

function updateDivisaoPor() {
  const select = document.getElementById("divisaoPor");
  if (!select) return;
  currentTrip.divisaoPor = getDivisaoPor({ divisaoPor: select.value });
  renderFinalSummary();
}

function getRouteTotals(tripInput = currentTrip) {
  const trip = normalizeTrip(tripInput);
  const grouped = {};

  trip.notas.forEach((note) => {
    const rota = note.rota || "Sem rota";
    if (!grouped[rota]) {
      grouped[rota] = {
        rota,
        quantidadeNotas: 0,
        totalNfs: 0,
        totalFretes: 0,
      };
    }

    grouped[rota].quantidadeNotas += 1;
    grouped[rota].totalNfs += Number(note.valorNf || 0);
    grouped[rota].totalFretes += Number(note.valorFrete || 0);
  });

  return Object.values(grouped).sort((a, b) =>
    a.rota.localeCompare(b.rota),
  );
}

function renderRouteTotals(targetId, trip = currentTrip) {
  const target = document.getElementById(targetId);
  const routes = getRouteTotals(trip);

  if (routes.length === 0) {
    target.innerHTML =
      '<div class="empty">Nenhuma rota lançada ainda.</div>';
    return;
  }

  target.innerHTML = routes
    .map(
      (route) => `
  <div class="route-item">
    <div class="route-title">${route.rota}</div>
    <div class="route-details">
      Notas: ${route.quantidadeNotas}<br>
      Total das NFs: ${formatMoney(route.totalNfs)}<br>
      Total dos fretes desta rota: <strong>${formatMoney(route.totalFretes)}</strong>
    </div>
  </div>
`,
    )
    .join("");
}

function renderRouteTable(trip = currentTrip) {
  const routes = getRouteTotals(trip);

  if (routes.length === 0) {
    return '<div class="empty">Nenhuma rota lançada.</div>';
  }

  const rows = routes
    .map(
      (route) => `
  <tr>
    <td>${route.rota}</td>
    <td>${route.quantidadeNotas}</td>
    <td>${formatMoney(route.totalNfs)}</td>
    <td><strong>${formatMoney(route.totalFretes)}</strong></td>
  </tr>
`,
    )
    .join("");

  return `
  <table class="route-table">
    <thead>
      <tr>
        <th>Rota/Cidade</th>
        <th>Notas</th>
        <th>Total NFs</th>
        <th>Total fretes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
`;
}

function renderNotes() {
  const list = document.getElementById("noteList");
  const totals = getTotals();

  document.getElementById("totalNfs").textContent = formatMoney(
    totals.totalNfs,
  );
  document.getElementById("totalFretes").textContent = formatMoney(
    totals.totalFretes,
  );
  renderRouteTotals("routeTotalsNotes");

  if (currentTrip.notas.length === 0) {
    list.innerHTML =
      '<div class="empty">Nenhuma nota adicionada ainda.</div>';
    return;
  }

  list.innerHTML = currentTrip.notas
    .map(
      (note) => `
  <div class="note-item">
    <div class="note-item-top">
      <div>
        <div class="note-title">${note.rota} | NF ${note.numeroNf} - ${note.remetente}</div>
        <div class="note-details">
          Valor da NF: ${formatMoney(note.valorNf)}<br>
          Frete da NF: ${formatMoney(note.valorFrete)}
        </div>
      </div>
      <button class="btn-danger" onclick="removeNote('${note.id}')">Remover</button>
    </div>
  </div>
`,
    )
    .join("");
}

function finishNotes() {
  if (currentTrip.notas.length === 0) {
    showAlert(
      "noteAlert",
      "Adicione pelo menos uma nota fiscal antes de continuar.",
    );
    return;
  }

  hideAlert("noteAlert");
  showScreen("screenExpenses", 3);
}

function backToNotes() {
  showScreen("screenNotes", 2);
  renderNotes();
}

function goToSummary() {
  currentTrip.combustivel = parseMoneyValue(
    document.getElementById("combustivel").value,
  );
  currentTrip.pedagio = parseMoneyValue(
    document.getElementById("pedagio").value,
  );
  syncDivisaoPorSelect();
  renderFinalSummary();
  showScreen("screenSummary", 4);
}

function backToExpenses() {
  showScreen("screenExpenses", 3);
}

function renderFinalSummary() {
  const totals = getTotals();
  const notesRows = normalizeTrip(currentTrip)
    .notas.map(
      (note) => `
  <div class="note-item">
    <div class="note-title">${note.rota} | ${note.remetente} | NF ${note.numeroNf}</div>
    <div class="note-details">
      Valor da NF: ${formatMoney(note.valorNf)} | Frete: ${formatMoney(note.valorFrete)}
    </div>
  </div>
`,
    )
    .join("");

  document.getElementById("finalSummary").innerHTML = `
  <div class="summary">
    <div class="summary-box">
      <span>Viagem</span>
      <strong style="font-size:15px;">${currentTrip.cidadeSaida} → ${currentTrip.cidadeDestinoFinal}</strong>
    </div>
    <div class="summary-box">
      <span>Total das NFs</span>
      <strong>${formatMoney(totals.totalNfs)}</strong>
    </div>
    <div class="summary-box">
      <span>Total dos fretes</span>
      <strong>${formatMoney(totals.totalFretes)}</strong>
    </div>
    <div class="summary-box">
      <span>Total de gastos</span>
      <strong>${formatMoney(totals.totalGastos)}</strong>
    </div>
    <div class="summary-box">
      <span>Combustível</span>
      <strong>${formatMoney(totals.combustivel)}</strong>
    </div>
    <div class="summary-box">
      <span>Pedágio</span>
      <strong>${formatMoney(totals.pedagio)}</strong>
    </div>
    <div class="summary-box highlight">
      <span>Valor líquido geral</span>
      <strong>${formatMoney(totals.valorLiquido)}</strong>
    </div>
    <div class="summary-box highlight">
      <span>Parte de cada (÷${totals.divisaoPor})</span>
      <strong>${formatMoney(totals.parteCada)}</strong>
    </div>
  </div>

  <h3>Fretes separados por rota</h3>
  ${renderRouteTable()}

  <h3>Notas fiscais lançadas</h3>
  <div class="note-list">${notesRows}</div>
`;
}

async function loadTripsFromSupabase() {
  if (!currentUser) return;

  const list = document.getElementById("tripList");
  list.innerHTML =
    '<div class="empty">Carregando viagens do Supabase...</div>';

  const { data, error } = await supabaseClient
    .from("viagens")
    .select("*, notas_fiscais(*)")
    .eq("usuario_id", currentUser.id)
    .order("data_viagem", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    console.error(error);
    list.innerHTML =
      '<div class="empty">Erro ao carregar dados. Confira as tabelas, usuario_id e permissões RLS.</div>';
    return;
  }

  savedTrips = (data || []).map(dbTripToAppTrip);
  renderTrips();
}

async function saveTrip() {
  hideAlert("saveAlert");
  hideSuccess("saveSuccess");

  if (!currentUser) {
    showAlert("saveAlert", "Você precisa estar logado para salvar.");
    return;
  }

  const saveButton = document.getElementById("saveButton");
  saveButton.disabled = true;
  saveButton.textContent = "Salvando...";

  const totals = getTotals();
  const rotas = getRouteTotals();

  const viagemPayload = {
    usuario_id: currentUser.id,
    data_viagem: currentTrip.data,
    cidade_saida: currentTrip.cidadeSaida,
    destino_final: currentTrip.cidadeDestinoFinal,
    combustivel: totals.combustivel,
    pedagio: totals.pedagio,
    total_notas: totals.totalNfs,
    total_fretes: totals.totalFretes,
    total_gastos: totals.totalGastos,
    valor_liquido: totals.valorLiquido,
    parte_cada: totals.parteCada,
    divisao_por: totals.divisaoPor,
  };

  let { data: viagemCriada, error: erroViagem } = await supabaseClient
    .from("viagens")
    .insert(viagemPayload)
    .select()
    .single();

  if (erroViagem && /divisao_por/i.test(erroViagem.message || "")) {
    const { divisao_por, ...payloadSemDivisao } = viagemPayload;
    ({ data: viagemCriada, error: erroViagem } = await supabaseClient
      .from("viagens")
      .insert(payloadSemDivisao)
      .select()
      .single());
  }

  if (erroViagem) {
    console.error(erroViagem);
    showAlert(
      "saveAlert",
      "Erro ao salvar a viagem. Confira se a coluna usuario_id e as políticas RLS foram criadas.",
    );
    saveButton.disabled = false;
    saveButton.textContent = "Salvar viagem online";
    return;
  }

  const viagemId = viagemCriada.id;

  const notasParaSalvar = currentTrip.notas.map((nota) => ({
    viagem_id: viagemId,
    rota: nota.rota,
    remetente: nota.remetente,
    numero_nf: nota.numeroNf,
    valor_nf: nota.valorNf,
    valor_frete: nota.valorFrete,
  }));

  const { error: erroNotas } = await supabaseClient
    .from("notas_fiscais")
    .insert(notasParaSalvar);

  if (erroNotas) {
    console.error(erroNotas);
    showAlert(
      "saveAlert",
      "A viagem foi salva, mas houve erro ao salvar as notas fiscais.",
    );
    saveButton.disabled = false;
    saveButton.textContent = "Salvar viagem online";
    return;
  }

  const rotasParaSalvar = rotas.map((rota) => ({
    viagem_id: viagemId,
    rota: rota.rota,
    quantidade_notas: rota.quantidadeNotas,
    total_notas: rota.totalNfs,
    total_fretes: rota.totalFretes,
  }));

  const { error: erroRotas } = await supabaseClient
    .from("rotas_resumo")
    .insert(rotasParaSalvar);

  if (erroRotas) {
    console.error(erroRotas);
    showAlert(
      "saveAlert",
      "A viagem e as notas foram salvas, mas houve erro ao salvar o resumo das rotas.",
    );
    saveButton.disabled = false;
    saveButton.textContent = "Salvar viagem online";
    return;
  }

  showSuccess("saveSuccess", "Viagem salva online com sucesso.");
  saveButton.disabled = false;
  saveButton.textContent = "Salvar viagem online";

  await loadTripsFromSupabase();
  resetForm();
}

async function deleteTrip(id) {
  if (!currentUser) return;

  const confirmDelete = confirm(
    "Deseja remover esta viagem salva? As notas e rotas também serão removidas.",
  );
  if (!confirmDelete) return;

  const { error } = await supabaseClient
    .from("viagens")
    .delete()
    .eq("id", id)
    .eq("usuario_id", currentUser.id);

  if (error) {
    console.error(error);
    alert("Erro ao excluir a viagem no Supabase.");
    return;
  }

  await loadTripsFromSupabase();
}

function viewTrip(id) {
  const trip = savedTrips.find((item) => Number(item.id) === Number(id));
  if (!trip) return;

  currentTrip = JSON.parse(JSON.stringify(normalizeTrip(trip)));
  document.getElementById("dataViagem").value = currentTrip.data;
  document.getElementById("cidadeSaida").value = currentTrip.cidadeSaida;
  document.getElementById("cidadeDestinoFinal").value =
    currentTrip.cidadeDestinoFinal;
  document.getElementById("combustivel").value = currentTrip.combustivel;
  document.getElementById("pedagio").value = currentTrip.pedagio;
  syncDivisaoPorSelect();
  renderFinalSummary();
  showScreen("screenSummary", 4);
}

function renderTrips() {
  const trips = savedTrips;
  const list = document.getElementById("tripList");

  const totalLiquido = trips.reduce(
    (sum, trip) => sum + getTotals(trip).valorLiquido,
    0,
  );
  const somaPartes = trips.reduce(
    (sum, trip) => sum + getTotals(trip).parteCada,
    0,
  );

  document.getElementById("monthlyLiquid").textContent =
    formatMoney(totalLiquido);
  document.getElementById("monthlyPart").textContent =
    formatMoney(somaPartes);

  if (trips.length === 0) {
    list.innerHTML =
      '<div class="empty">Nenhuma viagem salva ainda.</div>';
    return;
  }

  list.innerHTML = trips
    .map((trip) => {
      const totals = getTotals(trip);
      const routes = getRouteTotals(trip)
        .map((route) => route.rota)
        .join(", ");
      return `
    <div class="trip-item">
      <div class="trip-head">
        <div>
          <div class="trip-route">${trip.cidadeSaida} → ${trip.cidadeDestinoFinal}</div>
          <div class="trip-date">${formatDateBR(trip.data)}</div>
          <div class="trip-date">Rotas: ${routes || "Sem rotas"}</div>
        </div>
        <div class="actions" style="margin-top:0;">
          <button class="btn-secondary" onclick="viewTrip(${trip.id})">Ver</button>
          <button class="btn-danger" onclick="deleteTrip(${trip.id})">Excluir</button>
        </div>
      </div>
      <div class="trip-values">
        <div>Total fretes:<br><strong>${formatMoney(totals.totalFretes)}</strong></div>
        <div>Gastos juntos:<br><strong>${formatMoney(totals.totalGastos)}</strong></div>
        <div>Líquido geral:<br><strong>${formatMoney(totals.valorLiquido)}</strong></div>
        <div>Parte (÷${totals.divisaoPor}):<br><strong>${formatMoney(totals.parteCada)}</strong></div>
      </div>
    </div>
  `;
    })
    .join("");
}

function getTripsByPeriod(startDate, endDate) {
  return savedTrips.filter((trip) => {
    if (!trip.data) return false;
    return trip.data >= startDate && trip.data <= endDate;
  });
}

async function exportPdfByPeriod() {
  hideAlert("exportAlert");
  hideSuccess("exportSuccess");

  await loadTripsFromSupabase();

  const startDate = document.getElementById("exportStart").value;
  const endDate = document.getElementById("exportEnd").value;

  if (!startDate || !endDate) {
    showAlert(
      "exportAlert",
      "Informe a data inicial e a data final para gerar o PDF.",
    );
    return;
  }

  if (startDate > endDate) {
    showAlert(
      "exportAlert",
      "A data inicial não pode ser maior que a data final.",
    );
    return;
  }

  const trips = getTripsByPeriod(startDate, endDate);

  if (trips.length === 0) {
    showAlert("exportAlert", "Nenhuma viagem encontrada nesse período.");
    return;
  }

  const divisaoExport = getExportDivisaoPor();

  const grandTotals = trips.reduce(
    (acc, tripInput) => {
      const totals = getTotals(tripInput, divisaoExport);
      acc.totalNfs += totals.totalNfs;
      acc.totalFretes += totals.totalFretes;
      acc.combustivel += totals.combustivel;
      acc.pedagio += totals.pedagio;
      acc.totalGastos += totals.totalGastos;
      acc.valorLiquido += totals.valorLiquido;
      return acc;
    },
    {
      totalNfs: 0,
      totalFretes: 0,
      combustivel: 0,
      pedagio: 0,
      totalGastos: 0,
      valorLiquido: 0,
    },
  );

  grandTotals.divisaoPor = divisaoExport;
  grandTotals.parteCada = grandTotals.valorLiquido / divisaoExport;

  const tripsHtml = trips
    .map((tripInput, index) => {
      const trip = normalizeTrip(tripInput);
      const totals = getTotals(trip, divisaoExport);
      const routeRows = getRouteTotals(trip)
        .map(
          (route) => `
    <tr>
      <td>${route.rota}</td>
      <td>${route.quantidadeNotas}</td>
      <td>${formatMoney(route.totalNfs)}</td>
      <td>${formatMoney(route.totalFretes)}</td>
    </tr>
  `,
        )
        .join("");

      const noteRows = trip.notas
        .map(
          (note) => `
    <tr>
      <td>${note.rota}</td>
      <td>${note.remetente}</td>
      <td>${note.numeroNf}</td>
      <td>${formatMoney(note.valorNf)}</td>
      <td>${formatMoney(note.valorFrete)}</td>
    </tr>
  `,
        )
        .join("");

      return `
    <section class="trip-section">
      <h2>${index + 1}. ${trip.cidadeSaida} → ${trip.cidadeDestinoFinal}</h2>
      <p class="muted">Data: ${formatDateBR(trip.data)} | Divisão: ${totals.divisaoPor} pessoa(s)</p>
      <div class="summary-grid">
        <div><span>Total NFs</span><strong>${formatMoney(totals.totalNfs)}</strong></div>
        <div><span>Total fretes</span><strong>${formatMoney(totals.totalFretes)}</strong></div>
        <div><span>Combustível</span><strong>${formatMoney(totals.combustivel)}</strong></div>
        <div><span>Pedágio</span><strong>${formatMoney(totals.pedagio)}</strong></div>
        <div><span>Total gastos</span><strong>${formatMoney(totals.totalGastos)}</strong></div>
        <div><span>Líquido</span><strong>${formatMoney(totals.valorLiquido)}</strong></div>
        <div><span>Parte de cada (÷${totals.divisaoPor})</span><strong>${formatMoney(totals.parteCada)}</strong></div>
      </div>
      <h3>Fretes separados por rota</h3>
      <table>
        <thead>
          <tr><th>Rota/Cidade</th><th>Notas</th><th>Total NFs</th><th>Total fretes</th></tr>
        </thead>
        <tbody>${routeRows}</tbody>
      </table>
      <h3>Notas fiscais</h3>
      <table>
        <thead>
          <tr><th>Rota</th><th>Remetente</th><th>NF</th><th>Valor NF</th><th>Frete</th></tr>
        </thead>
        <tbody>${noteRows}</tbody>
      </table>
    </section>
  `;
    })
    .join("");

  const reportHtml = `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>Relatório de Fretes</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 24px; background: #ffffff; }
      .header { border-bottom: 3px solid #1f4f46; padding-bottom: 14px; margin-bottom: 18px; }
      h1 { margin: 0; color: #1f4f46; font-size: 24px; }
      h2 { color: #1f4f46; font-size: 18px; margin: 24px 0 4px; }
      h3 { color: #374151; font-size: 14px; margin: 18px 0 8px; }
      .muted { color: #6b7280; font-size: 12px; margin: 4px 0 12px; }
      .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
      .summary-grid div { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; background: #f9fafb; }
      .summary-grid span { display: block; color: #6b7280; font-size: 11px; margin-bottom: 4px; }
      .summary-grid strong { font-size: 14px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 12px; }
      th, td { border: 1px solid #d1d5db; padding: 7px; text-align: left; }
      th { background: #eef2f7; color: #374151; }
      .trip-section { page-break-inside: avoid; margin-bottom: 22px; }
      .total-box { border: 2px solid #1f4f46; border-radius: 10px; padding: 12px; margin: 16px 0 22px; background: #f9fafb; }
      .footer { color: #6b7280; font-size: 11px; margin-top: 24px; border-top: 1px solid #d1d5db; padding-top: 10px; }
      @media print { body { margin: 12mm; } button { display: none; } .trip-section { page-break-inside: avoid; } }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>Relatório de Fretes</h1>
      <p class="muted">Período: ${formatDateBR(startDate)} até ${formatDateBR(endDate)}</p>
      <p class="muted">Divisão do relatório: ${divisaoExport} pessoa(s)</p>
      <p class="muted">Gerado em: ${formatDateBR(today())}</p>
    </div>
    <div class="total-box">
      <h2 style="margin-top:0;">Resumo geral do período</h2>
      <div class="summary-grid">
        <div><span>Viagens</span><strong>${trips.length}</strong></div>
        <div><span>Total NFs</span><strong>${formatMoney(grandTotals.totalNfs)}</strong></div>
        <div><span>Total fretes</span><strong>${formatMoney(grandTotals.totalFretes)}</strong></div>
        <div><span>Combustível</span><strong>${formatMoney(grandTotals.combustivel)}</strong></div>
        <div><span>Pedágio</span><strong>${formatMoney(grandTotals.pedagio)}</strong></div>
        <div><span>Total gastos</span><strong>${formatMoney(grandTotals.totalGastos)}</strong></div>
        <div><span>Líquido geral</span><strong>${formatMoney(grandTotals.valorLiquido)}</strong></div>
        <div><span>Parte de cada (÷${grandTotals.divisaoPor})</span><strong>${formatMoney(grandTotals.parteCada)}</strong></div>
      </div>
    </div>
    ${tripsHtml}
    <div class="footer">Relatório gerado pelo sistema de controle de fretes.</div>
    <script>window.onload = function() { window.print(); };<\/script>
  </body>
  </html>
`;

  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    showAlert(
      "exportAlert",
      "O navegador bloqueou a abertura do relatório. Libere pop-ups para gerar o PDF.",
    );
    return;
  }

  printWindow.document.open();
  printWindow.document.write(reportHtml);
  printWindow.document.close();

  showSuccess(
    "exportSuccess",
    `Relatório aberto (${trips.length} viagem(ns), divisão ÷${divisaoExport}). Na janela de impressão, escolha "Salvar como PDF".`,
  );
}

function clearExportDates() {
  document.getElementById("exportStart").value = "";
  document.getElementById("exportEnd").value = "";
  const exportDivisao = document.getElementById("exportDivisaoPor");
  if (exportDivisao) exportDivisao.value = "2";
  hideAlert("exportAlert");
  hideSuccess("exportSuccess");
}

function resetForm() {
  currentTrip = {
    id: null,
    data: today(),
    cidadeSaida: "",
    cidadeDestinoFinal: "",
    notas: [],
    combustivel: 0,
    pedagio: 0,
    divisaoPor: 2,
  };

  syncDivisaoPorSelect();
  document.getElementById("dataViagem").value = today();
  document.getElementById("cidadeSaida").value = "";
  document.getElementById("cidadeDestinoFinal").value = "";
  document.getElementById("rotaNota").value = "";
  document.getElementById("remetente").value = "";
  document.getElementById("numeroNf").value = "";
  document.getElementById("valorNf").value = "";
  document.getElementById("valorFrete").value = "";
  document.getElementById("combustivel").value = "";
  document.getElementById("pedagio").value = "";

  hideAlert("tripAlert");
  hideAlert("noteAlert");
  hideAlert("saveAlert");
  hideSuccess("saveSuccess");
  renderNotes();
  showScreen("screenTrip", 1);
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("dataViagem").value = today();
  currentTrip.data = today();
  renderNotes();
  await checkAuth();
  if (currentUser) {
    await loadTripsFromSupabase();
  }
});
