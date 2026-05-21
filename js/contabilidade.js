const ACC_FREIGHT_BUCKET = "documentos-frete";
const ACC_MAX_FILE_SIZE = 8 * 1024 * 1024;
const ACC_ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

let currentAccounting = {
  data: "",
  localPartida: "",
  localDestino: "",
  cidadeDestinoMercadoria: "",
  remetente: "",
  destinatario: "",
  notaFiscal: "",
  valorFrete: 0,
};

let savedAccountingEntries = [];
let accFreightFile = null;
let accFreightPreviewUrl = null;

function setAccountingStep(step) {
  document.getElementById("accStep1").classList.toggle("active", step === 1);
  document.getElementById("accStep2").classList.toggle("active", step === 2);
}

function showAccountingScreen(screenId, step) {
  document.getElementById("accScreenTrip").classList.add("hidden");
  document.getElementById("accScreenMerch").classList.add("hidden");
  document.getElementById(screenId).classList.remove("hidden");
  setAccountingStep(step);
}

function syncAccountingDateField() {
  const field = document.getElementById("accData");
  if (!field) return;
  if (!field.value) {
    field.value = today();
  }
  currentAccounting.data = field.value;
}

function updateAccountingTripSummary() {
  const summary = document.getElementById("accTripSummary");
  if (!summary) return;
  summary.textContent = `${formatDateBR(currentAccounting.data)} | ${currentAccounting.localPartida} → ${currentAccounting.localDestino}`;
}

function isAllowedFreightImage(file) {
  if (!file) return false;
  if (ACC_ALLOWED_IMAGE_TYPES.includes(file.type)) return true;
  return file.type.startsWith("image/");
}

function revokeAccFreightPreview() {
  if (accFreightPreviewUrl) {
    URL.revokeObjectURL(accFreightPreviewUrl);
    accFreightPreviewUrl = null;
  }
}

function renderAccFreightPreview() {
  const empty = document.getElementById("accFreightEmpty");
  const preview = document.getElementById("accFreightPreview");
  const removeBtn = document.getElementById("accFreightRemoveBtn");

  if (!empty || !preview || !removeBtn) return;

  if (accFreightFile) {
    revokeAccFreightPreview();
    accFreightPreviewUrl = URL.createObjectURL(accFreightFile);
    preview.src = accFreightPreviewUrl;
    preview.classList.remove("hidden");
    empty.classList.add("hidden");
    removeBtn.classList.remove("hidden");
  } else {
    preview.src = "";
    preview.classList.add("hidden");
    empty.classList.remove("hidden");
    removeBtn.classList.add("hidden");
  }
}

function setAccFreightFile(file) {
  if (!file) return;

  if (!isAllowedFreightImage(file)) {
    showAlert("accMerchAlert", "Envie apenas imagens (JPG, PNG ou WEBP).");
    return;
  }

  if (file.size > ACC_MAX_FILE_SIZE) {
    showAlert("accMerchAlert", "A imagem deve ter no máximo 8 MB.");
    return;
  }

  hideAlert("accMerchAlert");
  accFreightFile = file;
  renderAccFreightPreview();
}

function clearAccFreightDocument() {
  accFreightFile = null;
  revokeAccFreightPreview();
  renderAccFreightPreview();

  const fileInput = document.getElementById("accFreightFileInput");
  const cameraInput = document.getElementById("accFreightCameraInput");
  if (fileInput) fileInput.value = "";
  if (cameraInput) cameraInput.value = "";
}

function openAccFreightFilePicker() {
  document.getElementById("accFreightFileInput")?.click();
}

function openAccFreightCamera() {
  document.getElementById("accFreightCameraInput")?.click();
}

function handleAccFreightFiles(fileList) {
  const file = fileList?.[0];
  if (file) setAccFreightFile(file);
}

function initAccountingDocumentUpload() {
  const dropzone = document.getElementById("accFreightDropzone");
  const fileInput = document.getElementById("accFreightFileInput");
  const cameraInput = document.getElementById("accFreightCameraInput");

  if (!dropzone || !fileInput || !cameraInput) return;

  fileInput.addEventListener("change", () => {
    handleAccFreightFiles(fileInput.files);
    fileInput.value = "";
  });

  cameraInput.addEventListener("change", () => {
    handleAccFreightFiles(cameraInput.files);
    cameraInput.value = "";
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });

  dropzone.addEventListener("drop", (event) => {
    handleAccFreightFiles(event.dataTransfer?.files);
  });

  dropzone.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    openAccFreightFilePicker();
  });

  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openAccFreightFilePicker();
    }
  });
}

function getFreightFileExtension(file) {
  const fromName = file.name?.split(".").pop()?.toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;

  const mimeMap = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  };

  return mimeMap[file.type] || "jpg";
}

async function uploadAccFreightDocument(file) {
  const extension = getFreightFileExtension(file);
  const path = `${currentUser.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { error } = await supabaseClient.storage
    .from(ACC_FREIGHT_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });

  if (error) throw error;
  return path;
}

async function getAccFreightSignedUrl(path) {
  if (!path) return null;

  const { data, error } = await supabaseClient.storage
    .from(ACC_FREIGHT_BUCKET)
    .createSignedUrl(path, 3600);

  if (error) {
    console.error(error);
    return null;
  }

  return data.signedUrl;
}

async function deleteAccFreightDocument(path) {
  if (!path || !currentUser) return;

  const { error } = await supabaseClient.storage
    .from(ACC_FREIGHT_BUCKET)
    .remove([path]);

  if (error) console.error(error);
}

function accountingGoNext() {
  hideAlert("accTripAlert");

  const data = document.getElementById("accData").value;
  const localPartida = document.getElementById("accLocalPartida").value.trim();
  const localDestino = document.getElementById("accLocalDestino").value.trim();

  if (!data || !localPartida || !localDestino) {
    showAlert("accTripAlert", "Preencha data, local de partida e local de destino.");
    return;
  }

  currentAccounting.data = data;
  currentAccounting.localPartida = localPartida;
  currentAccounting.localDestino = localDestino;

  updateAccountingTripSummary();
  showAccountingScreen("accScreenMerch", 2);
  document.getElementById("accCidadeDestinoMercadoria").focus();
}

function accountingGoBack() {
  hideAlert("accMerchAlert");
  hideSuccess("accMerchSuccess");
  showAccountingScreen("accScreenTrip", 1);
}

function clearAccountingMerchFields() {
  document.getElementById("accCidadeDestinoMercadoria").value = "";
  document.getElementById("accRemetente").value = "";
  document.getElementById("accDestinatario").value = "";
  document.getElementById("accNotaFiscal").value = "";
  document.getElementById("accValorFrete").value = "";
  clearAccFreightDocument();
}

function resetAccountingForm() {
  currentAccounting = {
    data: today(),
    localPartida: "",
    localDestino: "",
    cidadeDestinoMercadoria: "",
    remetente: "",
    destinatario: "",
    notaFiscal: "",
    valorFrete: 0,
  };

  document.getElementById("accData").value = today();
  document.getElementById("accLocalPartida").value = "";
  document.getElementById("accLocalDestino").value = "";
  clearAccountingMerchFields();

  hideAlert("accTripAlert");
  hideAlert("accMerchAlert");
  hideSuccess("accMerchSuccess");
  showAccountingScreen("accScreenTrip", 1);
}

function resetAccountingSession() {
  savedAccountingEntries = [];
  resetAccountingForm();
  renderAccountingList();
}

async function loadAccountingFromSupabase() {
  if (!currentUser) return;

  const list = document.getElementById("accountingList");
  if (list) {
    list.innerHTML = '<div class="empty">Carregando lançamentos...</div>';
  }

  const { data, error } = await supabaseClient
    .from("lancamentos_contabilidade")
    .select("*")
    .eq("usuario_id", currentUser.id)
    .order("data_lancamento", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    console.error(error);
    savedAccountingEntries = [];
    if (list) {
      list.innerHTML =
        '<div class="empty">Erro ao carregar lançamentos. Confira as políticas RLS da tabela.</div>';
    }
    return;
  }

  savedAccountingEntries = await Promise.all(
    (data || []).map(async (row) => ({
      id: row.id,
      data: row.data_lancamento,
      localPartida: row.local_partida,
      localDestino: row.local_destino,
      cidadeDestinoMercadoria: row.cidade_destino_mercadoria,
      remetente: row.remetente,
      destinatario: row.destinatario,
      notaFiscal: row.nota_fiscal,
      valorFrete: Number(row.valor_frete || 0),
      documentoFretePath: row.documento_frete_path || null,
      documentoFreteUrl: row.documento_frete_path
        ? await getAccFreightSignedUrl(row.documento_frete_path)
        : null,
    })),
  );

  renderAccountingList();
}

async function saveAccountingEntry() {
  hideAlert("accMerchAlert");
  hideSuccess("accMerchSuccess");

  if (!currentUser) {
    showAlert("accMerchAlert", "Você precisa estar logado para salvar.");
    return;
  }

  const cidadeDestinoMercadoria = document
    .getElementById("accCidadeDestinoMercadoria")
    .value.trim();
  const remetente = document.getElementById("accRemetente").value.trim();
  const destinatario = document.getElementById("accDestinatario").value.trim();
  const notaFiscal = document.getElementById("accNotaFiscal").value.trim();
  const valorFrete = parseMoneyValue(
    document.getElementById("accValorFrete").value,
  );

  if (
    !cidadeDestinoMercadoria ||
    !remetente ||
    !destinatario ||
    !notaFiscal ||
    valorFrete <= 0
  ) {
    showAlert(
      "accMerchAlert",
      "Preencha cidade destino da mercadoria, remetente, destinatário, nota fiscal e valor do frete.",
    );
    return;
  }

  if (!accFreightFile) {
    showAlert("accMerchAlert", "Anexe a foto do documento de frete.");
    return;
  }

  currentAccounting.cidadeDestinoMercadoria = cidadeDestinoMercadoria;
  currentAccounting.remetente = remetente;
  currentAccounting.destinatario = destinatario;
  currentAccounting.notaFiscal = notaFiscal;
  currentAccounting.valorFrete = valorFrete;

  let documentoFretePath = null;

  try {
    documentoFretePath = await uploadAccFreightDocument(accFreightFile);
  } catch (uploadError) {
    console.error(uploadError);
    showAlert(
      "accMerchAlert",
      `Erro ao enviar a foto: ${uploadError.message || "crie o bucket documentos-frete no Supabase Storage."}`,
    );
    return;
  }

  const payload = {
    usuario_id: currentUser.id,
    data_lancamento: currentAccounting.data,
    local_partida: currentAccounting.localPartida,
    local_destino: currentAccounting.localDestino,
    cidade_destino_mercadoria: currentAccounting.cidadeDestinoMercadoria,
    remetente: currentAccounting.remetente,
    destinatario: currentAccounting.destinatario,
    nota_fiscal: currentAccounting.notaFiscal,
    valor_frete: currentAccounting.valorFrete,
    documento_frete_path: documentoFretePath,
  };

  let { error } = await supabaseClient
    .from("lancamentos_contabilidade")
    .insert(payload)
    .select()
    .single();

  if (error && /documento_frete_path/i.test(error.message || "")) {
    const { documento_frete_path, ...payloadSemFoto } = payload;
    await deleteAccFreightDocument(documentoFretePath);
    ({ error } = await supabaseClient
      .from("lancamentos_contabilidade")
      .insert(payloadSemFoto)
      .select()
      .single());
    if (!error) {
      showAlert(
        "accMerchAlert",
        "Lançamento salvo, mas falta a coluna documento_frete_path na tabela. Rode o SQL de atualização no Supabase.",
      );
      return;
    }
  }

  if (error) {
    console.error(error);
    await deleteAccFreightDocument(documentoFretePath);
    showAlert(
      "accMerchAlert",
      `Erro ao salvar online: ${error.message || "verifique permissões RLS no Supabase."}`,
    );
    return;
  }

  await loadAccountingFromSupabase();
  showSuccess("accMerchSuccess", "Lançamento e documento salvos com sucesso.");
  clearAccountingMerchFields();
}

async function deleteAccountingEntry(id) {
  const confirmDelete = confirm("Deseja remover este lançamento?");
  if (!confirmDelete) return;

  const entry = savedAccountingEntries.find(
    (item) => String(item.id) === String(id),
  );

  if (currentUser) {
    if (entry?.documentoFretePath) {
      await deleteAccFreightDocument(entry.documentoFretePath);
    }

    const { error } = await supabaseClient
      .from("lancamentos_contabilidade")
      .delete()
      .eq("id", id)
      .eq("usuario_id", currentUser.id);

    if (error) {
      console.error(error);
    }
  }

  await loadAccountingFromSupabase();
}

function renderAccountingList() {
  const list = document.getElementById("accountingList");
  if (!list) return;

  if (savedAccountingEntries.length === 0) {
    list.innerHTML = '<div class="empty">Nenhum lançamento salvo ainda.</div>';
    return;
  }

  list.innerHTML = savedAccountingEntries
    .map((entry) => {
      const docLink = entry.documentoFreteUrl
        ? `<a class="doc-link" href="${entry.documentoFreteUrl}" target="_blank" rel="noopener noreferrer">Ver documento de frete</a>`
        : entry.documentoFretePath
          ? '<span class="trip-date">Documento anexado</span>'
          : "";

      return `
    <div class="trip-item">
      <div class="trip-head">
        <div>
          <div class="trip-route">${entry.localPartida} → ${entry.localDestino}</div>
          <div class="trip-date">${formatDateBR(entry.data)}</div>
          <div class="trip-date">Mercadoria: ${entry.cidadeDestinoMercadoria}</div>
          <div class="trip-date">NF ${entry.notaFiscal} | ${entry.remetente} → ${entry.destinatario}</div>
          ${docLink}
        </div>
        <div class="actions" style="margin-top:0;">
          <button class="btn-danger" onclick="deleteAccountingEntry('${entry.id}')">Excluir</button>
        </div>
      </div>
      <div class="trip-values">
        <div>Valor do frete:<br><strong>${formatMoney(entry.valorFrete)}</strong></div>
      </div>
    </div>
  `;
    })
    .join("");
}

function initAccountingTab() {
  syncAccountingDateField();
  showAccountingScreen("accScreenTrip", 1);
  if (currentUser) {
    loadAccountingFromSupabase();
  } else {
    renderAccountingList();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  syncAccountingDateField();
  initAccountingDocumentUpload();
});
