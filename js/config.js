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
const CALIBRATION_CONFIG = {
  // V5.6 calibration pending: conservative first-stage context multipliers.
  contextAdjustment: {
    adverse: { low: 1.03, medium: 1.06, high: 1.10, extreme: 1.18 },
    favorable: { low: 1.00, medium: 0.98, high: 0.96, extreme: 0.94 },
    neutral: { low: 1.00, medium: 1.02, high: 1.05, extreme: 1.10 },
    weekendLowVol: 0.97,
    minMultiplier: 0.94,
    maxMultiplier: 1.20,
    calibrationPending: true
  },
  // V5.6.1 calibration pending: success-rate point adjustments.
  successContextAdjustment: {
    holidayLowVolBonus: 0.8,
    unfavorable: { low: -0.5, medium: -1.5, high: -4.0, extreme: -8.0 },
    favorableBonusMax: 1.0,
    favorable: { low: 0.0, medium: 0.5, high: 1.0, extreme: 1.0 },
    neutralMixedPenalty: -0.5,
    calibrationPending: true
  },
  holidayDates: []
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
