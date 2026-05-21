const SUPABASE_URL = "https://isysdxcppvajnjlzfpsh.supabase.co";
const SUPABASE_KEY = "sb_publishable_L4XrcmXphpCRZaeTA-Kkdw_5vEGvV_7";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storageKey: "sb-sistema-unificado-auth",
  },
});

let currentUser = null;

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function parseMoneyValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  return money.format(value || 0);
}

function today() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function formatDateBR(dateString) {
  if (!dateString) return "";
  const parts = dateString.split("-");
  if (parts.length !== 3) return dateString;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getDivisaoPor(trip) {
  const value = Number(trip?.divisaoPor);
  if (Number.isFinite(value) && value >= 1 && value <= 10) {
    return Math.round(value);
  }
  return 2;
}

function inferDivisaoPor(dbTrip) {
  if (dbTrip.divisao_por != null) {
    return getDivisaoPor({ divisaoPor: dbTrip.divisao_por });
  }

  const valorLiquido = Number(dbTrip.valor_liquido);
  const parteCada = Number(dbTrip.parte_cada);

  if (valorLiquido && parteCada) {
    const inferred = Math.round(valorLiquido / parteCada);
    if (inferred >= 1 && inferred <= 10) return inferred;
  }

  return 2;
}

function normalizeTrip(trip) {
  return {
    ...trip,
    divisaoPor: getDivisaoPor(trip),
    cidadeDestinoFinal:
      trip.cidadeDestinoFinal || trip.cidadeDestino || "",
    notas: (trip.notas || []).map((note) => ({
      ...note,
      rota:
        note.rota ||
        note.cidadeDestino ||
        trip.cidadeDestinoFinal ||
        trip.cidadeDestino ||
        "Sem rota",
    })),
  };
}

function dbTripToAppTrip(dbTrip) {
  return normalizeTrip({
    id: dbTrip.id,
    data: dbTrip.data_viagem,
    cidadeSaida: dbTrip.cidade_saida,
    cidadeDestinoFinal: dbTrip.destino_final,
    combustivel: Number(dbTrip.combustivel || 0),
    pedagio: Number(dbTrip.pedagio || 0),
    divisaoPor: inferDivisaoPor(dbTrip),
    notas: (dbTrip.notas_fiscais || []).map((note) => ({
      id: note.id,
      rota: note.rota,
      remetente: note.remetente,
      numeroNf: note.numero_nf,
      valorNf: Number(note.valor_nf || 0),
      valorFrete: Number(note.valor_frete || 0),
    })),
  });
}

function getTotals(tripInput, divisaoOverride = null) {
  const trip = normalizeTrip(tripInput);
  const totalNfs = trip.notas.reduce(
    (sum, note) => sum + Number(note.valorNf || 0),
    0,
  );
  const totalFretes = trip.notas.reduce(
    (sum, note) => sum + Number(note.valorFrete || 0),
    0,
  );
  const combustivel = Number(trip.combustivel || 0);
  const pedagio = Number(trip.pedagio || 0);
  const totalGastos = combustivel + pedagio;
  const valorLiquido = totalFretes - totalGastos;
  const divisaoPor =
    divisaoOverride != null
      ? getDivisaoPor({ divisaoPor: divisaoOverride })
      : getDivisaoPor(trip);
  const parteCada = valorLiquido / divisaoPor;

  return {
    totalNfs,
    totalFretes,
    combustivel,
    pedagio,
    totalGastos,
    valorLiquido,
    divisaoPor,
    parteCada,
  };
}

function showAlert(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideAlert(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = "";
  el.classList.add("hidden");
}

function showSuccess(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideSuccess(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = "";
  el.classList.add("hidden");
}

async function loadTripsForUser() {
  if (!currentUser) return [];

  const { data, error } = await supabaseClient
    .from("viagens")
    .select("*, notas_fiscais(*)")
    .eq("usuario_id", currentUser.id)
    .order("data_viagem", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    console.error(error);
    throw error;
  }

  return (data || []).map(dbTripToAppTrip);
}

function filterTripsByPeriod(trips, startDate, endDate) {
  return trips.filter((trip) => {
    if (!trip.data) return false;
    if (startDate && trip.data < startDate) return false;
    if (endDate && trip.data > endDate) return false;
    return true;
  });
}

function aggregateTotals(trips, divisaoOverride = null) {
  const base = trips.reduce(
    (acc, trip) => {
      const totals = getTotals(trip, divisaoOverride);
      acc.viagens += 1;
      acc.totalNfs += totals.totalNfs;
      acc.totalFretes += totals.totalFretes;
      acc.combustivel += totals.combustivel;
      acc.pedagio += totals.pedagio;
      acc.totalGastos += totals.totalGastos;
      acc.valorLiquido += totals.valorLiquido;
      return acc;
    },
    {
      viagens: 0,
      totalNfs: 0,
      totalFretes: 0,
      combustivel: 0,
      pedagio: 0,
      totalGastos: 0,
      valorLiquido: 0,
    },
  );

  const divisaoPor =
    divisaoOverride != null
      ? getDivisaoPor({ divisaoPor: divisaoOverride })
      : 2;

  base.divisaoPor = divisaoPor;
  base.parteCada =
    divisaoOverride != null
      ? base.valorLiquido / divisaoPor
      : trips.reduce((sum, trip) => sum + getTotals(trip).parteCada, 0);

  return base;
}
