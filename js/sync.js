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
function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function isValidRiskFreeRate(rate) {
  return Number.isFinite(rate) && rate >= 0 && rate <= RISK_FREE_RATE_CONFIG.maxRate;
}
function loadRiskFreeRateState() {
  try {
    const saved = JSON.parse(localStorage.getItem(RISK_FREE_RATE_STORAGE_KEY) || "null");
    if (!saved || saved.source !== RISK_FREE_RATE_CONFIG.source ||
        !isValidRiskFreeRate(Number(saved.lastTrustedRate)) || !isIsoDate(saved.lastTrustedRateDate)) return;
    const hasCandidate = isValidRiskFreeRate(Number(saved.candidateRate)) && isIsoDate(saved.candidateStartDate);
    state.r = Number(saved.lastTrustedRate);
    state.riskFreeRate = {
      lastTrustedRate: Number(saved.lastTrustedRate),
      lastTrustedRateDate: saved.lastTrustedRateDate,
      source: RISK_FREE_RATE_CONFIG.source,
      status: hasCandidate ? "candidate_pending" : "last_trusted_fallback",
      candidateRate: hasCandidate ? Number(saved.candidateRate) : null,
      candidateStartDate: hasCandidate ? saved.candidateStartDate : null
    };
  } catch {}
}
function saveRiskFreeRateState() {
  try {
    localStorage.setItem(RISK_FREE_RATE_STORAGE_KEY, JSON.stringify(state.riskFreeRate));
  } catch {}
}
function parseFredDgs3moCsv(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const headers = (lines.shift() || "").split(",").map(value => value.trim().toLowerCase());
  if (headers[0] !== "observation_date" || headers[1] !== "dgs3mo") throw new Error("FRED CSV header invalid");
  const today = new Date().toISOString().slice(0, 10);
  const observations = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields = line.split(",");
    const date = (fields[0] || "").trim();
    const rawValue = (fields[1] || "").trim();
    if (!isIsoDate(date) || date > today) throw new Error("FRED observation date invalid");
    if (rawValue === ".") continue;
    if (!/^\d+(?:\.\d+)?$/.test(rawValue)) throw new Error("FRED observation value invalid");
    const percent = Number(rawValue);
    if (!Number.isFinite(percent) || percent < 0 || percent / 100 > RISK_FREE_RATE_CONFIG.maxRate) {
      throw new Error("FRED observation value invalid");
    }
    observations.push({ date, rate: percent / 100 });
  }
  if (!observations.length) throw new Error("FRED observations missing");
  const latest = observations[observations.length - 1];
  const ageDays = (Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${latest.date}T00:00:00.000Z`)) / 86400000;
  if (ageDays < 0 || ageDays > RISK_FREE_RATE_CONFIG.maxObservationAgeDays) throw new Error("FRED observation stale");
  return observations;
}
async function fetchFredDgs3mo() {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - RISK_FREE_RATE_CONFIG.historyWindowDays);
  const startDate = start.toISOString().slice(0, 10);
  const url = `${RISK_FREE_RATE_CONFIG.sourceUrl}?id=DGS3MO&cosd=${startDate}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RISK_FREE_RATE_CONFIG.requestTimeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store", mode: "cors" });
    if (!response.ok) throw new Error(`FRED HTTP ${response.status}`);
    return parseFredDgs3moCsv(await response.text());
  } finally {
    clearTimeout(timer);
  }
}
function applyFredDgs3mo(observations) {
  const trusted = state.riskFreeRate.lastTrustedRate;
  const latest = observations[observations.length - 1];
  if (latest.date < state.riskFreeRate.lastTrustedRateDate) throw new Error("FRED observation older than trusted value");
  const threshold = RISK_FREE_RATE_CONFIG.abnormalJumpThreshold;
  let abnormalRun = [];
  let previousObservation = null;
  for (const observation of observations) {
    if (Math.abs(observation.rate - trusted) >= threshold) {
      const gapDays = previousObservation
        ? (Date.parse(`${observation.date}T00:00:00.000Z`) - Date.parse(`${previousObservation.date}T00:00:00.000Z`)) / 86400000
        : 0;
      if (gapDays > RISK_FREE_RATE_CONFIG.maxCandidateObservationGapDays) abnormalRun = [];
      abnormalRun.push(observation);
    } else {
      abnormalRun = [];
    }
    previousObservation = observation;
  }
  const runStart = abnormalRun[0];
  const runDays = runStart
    ? (Date.parse(`${latest.date}T00:00:00.000Z`) - Date.parse(`${runStart.date}T00:00:00.000Z`)) / 86400000
    : 0;
  const confirmsNewLevel = runStart && runDays >= RISK_FREE_RATE_CONFIG.candidateConfirmationDays &&
    abnormalRun.length >= RISK_FREE_RATE_CONFIG.minimumCandidateObservations;
  if (!runStart || confirmsNewLevel) {
    state.r = latest.rate;
    state.riskFreeRate = {
      lastTrustedRate: latest.rate,
      lastTrustedRateDate: latest.date,
      source: RISK_FREE_RATE_CONFIG.source,
      status: "fresh",
      candidateRate: null,
      candidateStartDate: null
    };
  } else {
    state.riskFreeRate.status = "candidate_pending";
    state.riskFreeRate.candidateRate = latest.rate;
    state.riskFreeRate.candidateStartDate = runStart.date;
  }
  saveRiskFreeRateState();
}
let riskFreeRateSyncing = false;
async function syncRiskFreeRate() {
  if (riskFreeRateSyncing) return;
  riskFreeRateSyncing = true;
  try {
    applyFredDgs3mo(await fetchFredDgs3mo());
  } catch {
    if (state.riskFreeRate.status !== "candidate_pending") {
      state.riskFreeRate.status = state.riskFreeRate.status === "built_in_fallback"
        ? "built_in_fallback"
        : "last_trusted_fallback";
    }
    saveRiskFreeRateState();
  } finally {
    riskFreeRateSyncing = false;
    render();
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
  void syncRiskFreeRate();
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
      state.ivFallback = null;
      recordIvHistory(coin, {
        value: ivR.v * 100,
        timestamp: Date.now(),
        source: "Deribit DVOL",
        status: "fresh"
      });
      logs.push(`Deribit ${coin} DVOL：${(ivR.v*100).toFixed(2)}%`);
    } else {
      const fallbackIv = getFreshIvHistoryFallback(coin);
      if (fallbackIv) {
        state.iv = fallbackIv.value;
        state.ivFallback = fallbackIv;
        const fallbackTime = new Date(fallbackIv.timestamp).toLocaleString("zh-TW", { hour12:false });
        logs.push(`Deribit ${coin} DVOL 失敗：採用 IV History ${fallbackTime} ${(state.iv*100).toFixed(2)}%`);
      } else {
        state.ivFallback = null;
        logs.push(`Deribit ${coin} DVOL 失敗：採用目前 IV ${(state.iv*100).toFixed(2)}%`);
      }
    }
    state.lastSyncMs = performance.now() - syncStart;
    if (hasLiveData) {
      state.lastUpdated = new Date();
      state.dataStatus = ivR.ok ? "realtime" : (state.ivFallback ? (state.ivFallback.stale ? "stale_fallback" : "iv_fallback") : "default_iv");
      state.source = ivR.ok
        ? "Deribit"
        : (state.ivFallback ? `IV History / ${new Date(state.ivFallback.timestamp).toLocaleString("zh-TW", { hour12:false })}` : "System Default");
      saveLocal(state.lastUpdated);
      if (!ivR.ok) {
        state.dataStatus = state.ivFallback ? (state.ivFallback.stale ? "stale_fallback" : "iv_fallback") : "default_iv";
        state.source = state.ivFallback
          ? `IV History / ${new Date(state.ivFallback.timestamp).toLocaleString("zh-TW", { hour12:false })}`
          : "System Default";
      }
    } else {
      if (state.ivFallback) {
        state.dataStatus = state.ivFallback.stale ? "stale_fallback" : "iv_fallback";
        state.source = `IV History / ${new Date(state.ivFallback.timestamp).toLocaleString("zh-TW", { hour12:false })}`;
      } else {
        state.dataStatus = "default_iv";
        state.source = "System Default";
      }
    }
    logs.unshift(`同步耗時：${(state.lastSyncMs/1000).toFixed(1)} 秒`);
    state.logs.push(...logs);
  }
  state.syncing = false;
  render();
}
