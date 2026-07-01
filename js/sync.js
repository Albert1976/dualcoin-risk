async function fetchJson(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache:"no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}
async function getBinanceSpot(coin) {
  const symbol = coin + "USDT";
  const data = await fetchJson(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, 1800);
  const price = Number(data.price);
  if (!Number.isFinite(price)) throw new Error("Binance price invalid");
  return price;
}
async function getDeribitDvol(coin) {
  const end = Date.now(), start = end - 86400000 * 3;
  const url = `https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=${coin}&start_timestamp=${start}&end_timestamp=${end}&resolution=3600`;
  const data = await fetchJson(url, 2200);
  const rows = data?.result?.data || [];
  const last = rows[rows.length - 1];
  const v = Array.isArray(last) ? Number(last[1]) : Number(last?.volatility);
  if (!Number.isFinite(v) || v <= 0) throw new Error("Deribit DVOL invalid");
  return v / 100;
}
function settle(promise, ms, label) {
  const timeout = new Promise(resolve => setTimeout(() => resolve({ ok:false, timeout:true, label }), ms));
  return Promise.race([
    promise.then(v => ({ ok:true, v, label })).catch(e => ({ ok:false, e, label })),
    timeout
  ]);
}
async function syncMarket(show = true) {
  if (state.syncing) return;
  state.syncing = true;
  const syncStart = performance.now();
  const coin = state.coin;
  render();

  let spotR = { ok:false, label:"spot" };
  let ivR = { ok:false, label:"iv" };
  try {
    [spotR, ivR] = await Promise.all([
      settle(getBinanceSpot(coin), 2300, "spot"),
      settle(getDeribitDvol(coin), 2600, "iv")
    ]);
  } catch (err) {
    spotR = { ok:false, e:err, label:"spot" };
    ivR = { ok:false, e:err, label:"iv" };
  }

  if (state.coin === coin) {
    const logs = [];
    const hasLiveData = (spotR.ok && Number.isFinite(spotR.v)) || (ivR.ok && Number.isFinite(ivR.v));
    if (spotR.ok && Number.isFinite(spotR.v)) {
      state.spot = spotR.v;
      initializeStrikeFromSpot(coin, spotR.v);
      logs.push(`Binance Spot ${coin}USDT：${spotR.v.toLocaleString("en-US", { maximumFractionDigits:2 })}`);
    } else {
      logs.push(`Binance Spot ${coin}USDT 失敗：採用目前值 ${state.spot.toLocaleString("en-US", { maximumFractionDigits:2 })}`);
    }
    if (ivR.ok && Number.isFinite(ivR.v)) {
      state.iv = ivR.v;
      recordIvHistory(coin, {
        value: ivR.v * 100,
        timestamp: Date.now(),
        source: "Deribit DVOL",
        status: "fresh"
      });
      logs.push(`Deribit ${coin} DVOL：${(ivR.v*100).toFixed(2)}%`);
    } else {
      logs.push(`Deribit ${coin} DVOL 失敗：採用目前 IV ${(state.iv*100).toFixed(2)}%`);
    }
    logs.push("FRED DGS3MO：前端固定採預設 3.70%，避免 CORS 卡住");
    state.lastSyncMs = performance.now() - syncStart;
    if (hasLiveData) {
      state.lastUpdated = new Date();
      state.dataStatus = "realtime";
      state.source = spotR.ok && ivR.ok ? `Binance / Deribit ${coin}` : `部分即時資料 / 快取補足`;
      saveLocal(state.lastUpdated);
    } else {
      state.dataStatus = "cache";
      state.source = state.lastUpdated ? "快取資料（離線）" : "預設值（離線）";
    }
    logs.unshift(`同步耗時：${(state.lastSyncMs/1000).toFixed(1)} 秒`);
    state.logs.push(...logs);
  }
  state.syncing = false;
  render();
}
