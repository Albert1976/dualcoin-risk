const $ = (id) => document.getElementById(id);
function historyKey() { return "calculationHistory"; }
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
const fallback = {
  BTC: { spot: 66424, strike: 69250, iv: 0.3849 },
  ETH: { spot: 1765.4, strike: 1825, iv: 0.5596 }
};
const state = {
  coin: "ETH",
  spot: 1765.4,
  strike: 1825,
  offsetDays: 1,
  iv: 0.5596,
  r: 0.037,
  source: "預設值",
  lastUpdated: null,
  lastSyncMs: null,
  dataStatus: "fallback",
  logs: [],
  syncing: false,
  stickyMode: localStorage.getItem("displayMode") === "sticky",
  historyCollapsed: localStorage.getItem("historyCollapsed") === "true",
  history: loadHistory(),
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
