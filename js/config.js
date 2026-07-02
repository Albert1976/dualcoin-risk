const $ = (id) => document.getElementById(id);
function historyKey() { return "calculationHistory"; }
function selectedAssetKey() { return "selectedAsset"; }
function validAsset(value) {
  return value === "BTC" || value === "ETH" ? value : null;
}
function loadSelectedAsset() {
  return validAsset(localStorage.getItem(selectedAssetKey())) || "ETH";
}
function historySignature(item) {
  return [
    item.coin,
    item.mode,
    Number(item.spot).toFixed(2),
    Number(item.strike).toFixed(2),
    Number(item.iv).toFixed(4),
    item.offsetDays
  ].join("|");
}
function loadHistory() {
  try {
    const rows = JSON.parse(localStorage.getItem(historyKey()) || "[]");
    return Array.isArray(rows) ? rows.slice(0, 20) : [];
  } catch {
    return [];
  }
}
const ivHistoryLimit = 300;
function ivHistoryKey() { return "ivHistory"; }
function ivHistoryVersionKey() { return "ivHistoryVersion"; }
const ivHistoryStorageVersion = "v5.4-clean";
function resetLegacyIvHistory() {
  if (localStorage.getItem(ivHistoryVersionKey()) === ivHistoryStorageVersion) return;
  localStorage.removeItem(ivHistoryKey());
  localStorage.setItem(ivHistoryVersionKey(), ivHistoryStorageVersion);
}
function cleanIvHistoryRows(rows) {
  return Array.isArray(rows) ? rows.filter(item => (
    item &&
    Number.isFinite(Number(item.value)) && Number(item.value) > 0 &&
    Number.isFinite(Number(item.timestamp)) &&
    typeof item.source === "string" && item.source.trim() &&
    item.status === "fresh"
  )).map(item => ({
    value: Number(item.value),
    timestamp: Number(item.timestamp),
    source: item.source,
    status: "fresh"
  })).slice(-ivHistoryLimit) : [];
}
function loadIvHistory() {
  resetLegacyIvHistory();
  try {
    const parsed = JSON.parse(localStorage.getItem(ivHistoryKey()) || "{}");
    return {
      BTC: cleanIvHistoryRows(parsed.BTC),
      ETH: cleanIvHistoryRows(parsed.ETH)
    };
  } catch {
    localStorage.removeItem(ivHistoryKey());
    return { BTC: [], ETH: [] };
  }
}
const fallback = {
  BTC: { spot: 66424, iv: 0.3849 },
  ETH: { spot: 1765.4, iv: 0.5596 }
};
const state = {
  coin: loadSelectedAsset(),
  spot: 1765.4,
  strike: 1818.36,
  targetPriceTouchedByUser: { BTC: false, ETH: false },
  targetPriceState: { BTC: null, ETH: null },
  targetPriceDriftPercent: null,
  offsetDays: 1,
  iv: 0.5596,
  r: 0.037,
  source: "預設值",
  lastUpdated: null,
  lastSyncMs: null,
  dataStatus: "fallback",
  ivFallback: null,
  logs: [],
  syncing: false,
  stickyMode: localStorage.getItem("displayMode") === "sticky",
  historyCollapsed: localStorage.getItem("historyCollapsed") === "true",
  lastNotesExpanded: false,
  history: loadHistory(),
  ivHistory: loadIvHistory(),
  marketNewsExpanded: false,
  marketEventsExpanded: false,
  marketNews: {
    items: [],
    events: [],
    eventsUpdatedAt: null,
    lastUpdated: null,
    error: false,
    loading: false,
    loaded: false
  }
};
