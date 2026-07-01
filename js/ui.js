const els = {
  syncBtn: $("syncBtn"), btcBtn: $("btcBtn"), ethBtn: $("ethBtn"),
  stickyMiniBtn: $("stickyMiniBtn"), stickyOffBtn: $("stickyOffBtn"), stickySyncBtn: $("stickySyncBtn"),
  modeLine: $("modeLine"), updatedAt: $("updatedAt"),
  normalHeroSuccess: $("normalHeroSuccess"), fatSuccess: $("fatSuccess"),
  normalSuccess: $("normalSuccess"), normalExercise: $("normalExercise"), fatExercise: $("fatExercise"), fatDrawdown: $("fatDrawdown"),
  stickyMode: $("stickyMode"), stickyNormal: $("stickyNormal"), stickyFat: $("stickyFat"), stickyRisk: $("stickyRisk"),
  riskDot: $("riskDot"), riskTitle: $("riskTitle"), riskDesc: $("riskDesc"),
  quickSpot: $("quickSpot"), quickStrike: $("quickStrike"), quickExpiry: $("quickExpiry"), quickIv: $("quickIv"),
  spotInput: $("spotInput"), strikeInput: $("strikeInput"), strikeMinus: $("strikeMinus"), strikePlus: $("strikePlus"), priceStepLabel: $("priceStepLabel"), autoMode: $("autoMode"),
  targetStatus: $("targetStatus"), resetTargetBtn: $("resetTargetBtn"),
  strikePresets: $("strikePresets"), toggleHistoryBtn: $("toggleHistoryBtn"), saveHistoryBtn: $("saveHistoryBtn"), historyList: $("historyList"),
  dayMinus: $("dayMinus"), dayPlus: $("dayPlus"), settlementLabel: $("settlementLabel"), settlementSub: $("settlementSub"), dayInput: $("dayInput"), dayHint: $("dayHint"),
  ivRange: $("ivRange"), ivLabel: $("ivLabel"), rateLabel: $("rateLabel"),
  lastNotes: $("lastNotes"),
  toggleNewsBtn: $("toggleNewsBtn"), refreshNewsBtn: $("refreshNewsBtn"), marketNewsUpdated: $("marketNewsUpdated"), marketNewsList: $("marketNewsList"),
  toggleEventsBtn: $("toggleEventsBtn"), refreshEventsBtn: $("refreshEventsBtn"), marketEventsUpdated: $("marketEventsUpdated"), marketEventsList: $("marketEventsList"),
  ivHistoryInfoBtn: $("ivHistoryInfoBtn"), ivHistoryInfo: $("ivHistoryInfo"),
  ivHistoryCount: $("ivHistoryCount"), ivHistoryLatest: $("ivHistoryLatest"), ivHistoryTime: $("ivHistoryTime"), ivHistorySource: $("ivHistorySource"),
  ivTable: $("ivTable"), d1Val: $("d1Val"), d2Val: $("d2Val"), rVal: $("rVal"), sourceVal: $("sourceVal"), logList: $("logList")
};

function getIvHistory(coin = state.coin) {
  return state.ivHistory?.[coin] || [];
}
function getLatestIvHistory(coin = state.coin) {
  const rows = getIvHistory(coin);
  return rows.length ? rows[rows.length - 1] : null;
}
function getFreshIvHistoryFallback(coin = state.coin) {
  const latest = getLatestIvHistory(coin);
  if (!latest || latest.status !== "fresh") return null;
  const value = Number(latest.value);
  const timestamp = Number(latest.timestamp);
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(timestamp)) return null;
  return {
    value: value / 100,
    timestamp,
    source: "IV History",
    status: "history_fallback",
    stale: Date.now() - timestamp > 24 * 60 * 60 * 1000
  };
}
function getIvHistoryCount(coin = state.coin) {
  return getIvHistory(coin).length;
}
function saveIvHistory() {
  localStorage.setItem(ivHistoryKey(), JSON.stringify(state.ivHistory));
}
function shouldRecordIvHistory(coin, row) {
  const latest = getLatestIvHistory(coin);
  if (!latest) return true;
  if (row.value !== Number(latest.value)) return true;
  return Math.abs(row.timestamp - Number(latest.timestamp)) > 30 * 60 * 1000;
}
function recordIvHistory(coin, item) {
  const row = {
    value: Number(item?.value),
    timestamp: Number(item?.timestamp),
    source: item?.source,
    status: item?.status
  };
  if (
    row.status !== "fresh" ||
    !Number.isFinite(row.value) || row.value <= 0 ||
    !Number.isFinite(row.timestamp) ||
    typeof row.source !== "string" || !row.source.trim()
  ) return false;
  if (!shouldRecordIvHistory(coin, row)) return false;
  const rows = getIvHistory(coin);
  state.ivHistory[coin] = [...rows, row].slice(-ivHistoryLimit);
  saveIvHistory();
  return true;
}
function renderIvHistoryStatus() {
  if (!els.ivHistoryCount) return;
  const latest = getLatestIvHistory();
  els.ivHistoryCount.textContent = `${getIvHistoryCount()} / ${ivHistoryLimit}`;
  els.ivHistoryLatest.textContent = latest ? `${latest.value.toFixed(1)}%` : "--";
  els.ivHistoryTime.textContent = latest ? fmtMarketTime(new Date(latest.timestamp)) : "--";
  els.ivHistorySource.textContent = latest ? latest.source : "--";
}
function toggleIvHistoryInfo() {
  if (!els.ivHistoryInfo || !els.ivHistoryInfoBtn) return;
  const expanded = els.ivHistoryInfo.classList.toggle("collapsed") === false;
  els.ivHistoryInfoBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
}

function priceStep() { return state.coin === "BTC" ? 50 : 5; }
function presetGap() { return state.coin === "BTC" ? 500 : 25; }
function snapPrice(v, step = priceStep()) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return step;
  return Math.round(n / step) * step;
}
function validSavedNumber(key) {
  const n = Number(localStorage.getItem(key));
  return Number.isFinite(n) && n > 0 ? n : NaN;
}
function validSavedDate(key) {
  const time = Date.parse(localStorage.getItem(key) || "");
  return Number.isFinite(time) ? new Date(time) : null;
}
function defaultTargetPrice(spot) {
  const n = Number(spot);
  return Number.isFinite(n) && n > 0 ? Number((n * 1.03).toFixed(2)) : NaN;
}
function targetStateKey(coin) {
  return `dualcoin_target_state_${coin}`;
}
function cleanTargetState(raw, coin, spot) {
  if (!raw || typeof raw !== "object") return null;
  const targetPrice = Number(raw.targetPrice);
  const source = raw.targetPriceSource === "manual" ? "manual" : "auto";
  const base = Number(raw.basePriceWhenTargetSet);
  const time = Date.parse(raw.targetPriceSetTime || "");
  return {
    targetPrice: Number.isFinite(targetPrice) && targetPrice > 0 ? targetPrice : defaultTargetPrice(spot || fallback[coin].spot),
    targetPriceSource: source,
    basePriceWhenTargetSet: Number.isFinite(base) && base > 0 ? base : null,
    targetPriceSetTime: Number.isFinite(time) ? new Date(time).toISOString() : null
  };
}
function loadTargetState(coin, spot) {
  try {
    const parsed = JSON.parse(localStorage.getItem(targetStateKey(coin)) || "null");
    const cleaned = cleanTargetState(parsed, coin, spot);
    if (cleaned) return cleaned;
  } catch {
    localStorage.removeItem(targetStateKey(coin));
  }

  const legacyStrike = validSavedNumber(`${coin}Strike`);
  if (hasUserTouchedStrike(coin) && Number.isFinite(legacyStrike)) {
    const savedSpot = validSavedNumber(`${coin}Spot`);
    const savedAt = validSavedDate(`${coin}UpdatedAt`);
    return {
      targetPrice: legacyStrike,
      targetPriceSource: "manual",
      basePriceWhenTargetSet: Number.isFinite(savedSpot) ? savedSpot : (Number.isFinite(spot) ? spot : null),
      targetPriceSetTime: savedAt ? savedAt.toISOString() : new Date().toISOString()
    };
  }

  return {
    targetPrice: defaultTargetPrice(spot || fallback[coin].spot),
    targetPriceSource: "auto",
    basePriceWhenTargetSet: Number.isFinite(spot) && spot > 0 ? spot : null,
    targetPriceSetTime: null
  };
}
function saveTargetState(coin) {
  const target = state.targetPriceState[coin];
  if (!target) return;
  localStorage.setItem(targetStateKey(coin), JSON.stringify(target));
}
function targetDriftPercent(coin = state.coin) {
  const target = state.targetPriceState[coin];
  const base = Number(target?.basePriceWhenTargetSet);
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(state.spot)) return null;
  return ((state.spot - base) / base) * 100;
}
function setManualTargetPrice(coin, price) {
  const targetPrice = snapPrice(price);
  state.strike = targetPrice;
  state.targetPriceTouchedByUser[coin] = true;
  localStorage.setItem(strikeTouchedKey(coin), "true");
  state.targetPriceState[coin] = {
    targetPrice,
    targetPriceSource: "manual",
    basePriceWhenTargetSet: Number.isFinite(state.spot) && state.spot > 0 ? state.spot : null,
    targetPriceSetTime: new Date().toISOString()
  };
  saveTargetState(coin);
}
function setAutoTargetPrice(coin, spot = state.spot, setTime = false) {
  if (state.coin !== coin) return false;
  if (!Number.isFinite(spot) || spot <= 0) return false;
  const targetPrice = defaultTargetPrice(spot);
  state.strike = targetPrice;
  state.targetPriceTouchedByUser[coin] = false;
  localStorage.setItem(strikeTouchedKey(coin), "false");
  localStorage.removeItem(`${coin}Strike`);
  state.targetPriceState[coin] = {
    targetPrice,
    targetPriceSource: "auto",
    basePriceWhenTargetSet: spot,
    targetPriceSetTime: setTime ? new Date().toISOString() : null
  };
  saveTargetState(coin);
  return true;
}
function resetTargetToAuto() {
  if (!setAutoTargetPrice(state.coin, state.spot, true)) return;
  saveLocal();
  render();
}
function strikeTouchedKey(coin) {
  return `${coin}StrikeTouched`;
}
function hasUserTouchedStrike(coin) {
  return localStorage.getItem(strikeTouchedKey(coin)) === "true";
}
function markStrikeTouched(coin, touched = true) {
  state.targetPriceTouchedByUser[coin] = touched;
  localStorage.setItem(strikeTouchedKey(coin), touched ? "true" : "false");
}
function loadCoinState(coin) {
  const d = fallback[coin];
  const savedSpot = validSavedNumber(`${coin}Spot`);
  const savedIv = validSavedNumber(`${coin}Iv`);
  const savedAt = validSavedDate(`${coin}UpdatedAt`);
  state.coin = coin;
  state.spot = savedSpot || d.spot;
  const targetState = loadTargetState(coin, state.spot);
  state.targetPriceState[coin] = targetState;
  state.targetPriceTouchedByUser[coin] = targetState.targetPriceSource === "manual";
  state.strike = targetState.targetPrice;
  state.iv = savedIv || d.iv;
  state.lastUpdated = savedAt;
  state.lastSyncMs = null;
  state.dataStatus = savedAt ? "cache" : "fallback";
  state.ivFallback = null;
  state.source = savedAt ? "CACHE" : "DEFAULT";
}
function initializeStrikeFromSpot(coin, spot) {
  if (state.coin !== coin) return false;
  if (!Number.isFinite(spot) || spot <= 0) return false;
  if (state.targetPriceTouchedByUser[coin]) return false;
  return setAutoTargetPrice(coin, spot);
}
function dynamicStrikePresets() {
  const gap = presetGap();
  const center = snapPrice(state.spot || state.strike || defaultTargetPrice(fallback[state.coin].spot), gap);
  return [-2, -1, 0, 1, 2].map(n => center + n * gap).filter(v => v > 0);
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
function fatDrawdown(normal, fat) {
  return normal && fat ? Math.max(0, normal.success - fat.success) : NaN;
}
function fmtFatDrawdown(normal, fat) {
  const v = fatDrawdown(normal, fat);
  return Number.isFinite(v) ? `-${fmtPct(v)}` : "--";
}
function riskDetail(riskCls, normal, fat) {
  if (!fat) return "資料不足，請確認現價與 IV。";
  const cut = fmtFatDrawdown(normal, fat).replace("-", "");
  if (riskCls === "green") return `肥尾成功率 ${fmtPct(fat.success)}\n肥尾折減 ${cut}\n\n目前風險相對可控，但仍需留意現價變動。`;
  if (riskCls === "yellow") return "肥尾成功率落在中性區間，請留意波動率與結算時間。";
  if (riskCls === "red") return "肥尾成功率偏低，整體風險偏高。";
  return riskCls === "orange" ? "肥尾成功率偏低，請重新確認目標價與 IV。" : "資料不足，請確認現價與 IV。";
}
function render() {
  state.offsetDays = normalizeOffsetDays(state.offsetDays);
  document.body.classList.toggle("sticky-mode", state.stickyMode);
  const info = settlementInfo(state.offsetDays);
  const { normal, fat } = calcAll();
  const mode = normal?.isHighSell ? "高賣" : "低買";
  const [riskCls, riskTitle, riskDesc] = riskLevel(fat?.success);

  els.stickyMiniBtn.classList.toggle("active", state.stickyMode);
  els.stickyMiniBtn.textContent = state.stickyMode ? "已固定" : "固定";
  if (els.stickyOffBtn) els.stickyOffBtn.textContent = "取消";
  if (els.stickySyncBtn) els.stickySyncBtn.textContent = state.syncing ? "同步中" : "同步";
  els.syncBtn.textContent = state.syncing ? "同步中" : "同步";

  els.modeLine.textContent = `${state.coin}｜${mode}`;
  els.stickyMode.textContent = `${state.coin}｜${mode}`;
  els.quickSpot.textContent = fmtMoney(state.spot);
  els.quickStrike.textContent = fmtMoney(state.strike);
  els.quickExpiry.textContent = info.label;
  els.quickIv.textContent = `${(state.iv * 100).toFixed(2)}%`;
  els.spotInput.value = Number.isFinite(state.spot) ? state.spot : "";
  els.strikeInput.value = Number.isFinite(state.strike) ? state.strike : "";
  els.strikeInput.step = String(priceStep());
  els.priceStepLabel.textContent = `目標價快調：${state.coin} 每次 ±${priceStep()}`;
  els.settlementLabel.textContent = info.label;
  els.settlementSub.textContent = `距離結算約 ${info.hours.toFixed(1)} 小時`;
  els.dayInput.min = String(minOffsetDays());
  els.dayInput.value = state.offsetDays;
  els.dayMinus.disabled = state.offsetDays <= minOffsetDays();
  els.dayHint.textContent = `${info.hint}，BS T = ${info.T.toFixed(6)} 年`;
  els.ivRange.value = (state.iv * 100).toFixed(1);
  els.ivLabel.textContent = `${(state.iv * 100).toFixed(2)}%`;
  els.rateLabel.textContent = `${(state.r * 100).toFixed(2)}%`;
  els.rVal.textContent = `${(state.r * 100).toFixed(2)}%`;
  els.sourceVal.textContent = state.ivFallback
    ? `${dataStatusLabel()}｜時間：${new Date(state.ivFallback.timestamp).toLocaleString("zh-TW", { hour12:false })}`
    : dataStatusLabel();
  els.autoMode.textContent = normal ? `自動判斷：${mode}，${normal.isHighSell ? "目標價高於現價" : "目標價低於現價"}，肥尾模式固定 σ × 1.5` : "自動判斷：--";
  renderTargetStatus();

  els.normalHeroSuccess.textContent = normal ? fmtPct(normal.success) : "--";
  els.normalSuccess.textContent = normal ? fmtPct(normal.success) : "--";
  els.normalExercise.textContent = normal ? fmtPct(normal.exercise) : "--";
  els.fatSuccess.textContent = fat ? fmtPct(fat.success) : "--";
  els.fatExercise.textContent = fat ? fmtPct(fat.exercise) : "--";
  els.fatDrawdown.textContent = fmtFatDrawdown(normal, fat);
  els.stickyNormal.textContent = normal ? fmtPct(normal.success) : "--";
  els.stickyFat.textContent = fat ? fmtPct(fat.success) : "--";
  els.stickyRisk.textContent = riskTitle;
  els.d1Val.textContent = normal ? normal.d1.toFixed(4) : "--";
  els.d2Val.textContent = normal ? normal.d2.toFixed(4) : "--";

  els.riskDot.className = `risk-dot ${riskCls}`;
  els.riskTitle.textContent = riskTitle;
  els.riskDesc.textContent = riskDetail(riskCls, normal, fat);
  els.btcBtn.classList.toggle("active", state.coin === "BTC");
  els.ethBtn.classList.toggle("active", state.coin === "ETH");

  if (state.syncing) {
    els.updatedAt.textContent = `${dataStatusLabel()}同步中...`;
  } else if (state.ivFallback) {
    const t = new Date(state.ivFallback.timestamp).toLocaleString("zh-TW", { hour12:false });
    els.updatedAt.textContent = `${dataStatusLabel()}｜時間：${t}`;
  } else if (state.lastUpdated) {
    const t = state.lastUpdated.toLocaleString("zh-TW", { hour12:false });
    const sec = Number.isFinite(state.lastSyncMs) ? `，耗時 ${(state.lastSyncMs/1000).toFixed(1)} 秒` : "";
    els.updatedAt.textContent = `${dataStatusLabel()}｜時間：${t}${sec}`;
  } else {
    els.updatedAt.textContent = dataStatusLabel();
  }

  renderNotes(buildLastNotes(normal, fat, info));
  renderStrikePresets();
  renderHistory();
  renderMarketEvents();
  renderMarketNews();
  renderIvHistoryStatus();
  renderIvTable();
  renderLogs();
}

function renderNotes(notes) {
  els.lastNotes.innerHTML = notes.map(n => `<li class="${n.type}">${n.text}</li>`).join("");
}
function dataStatusLabel() {
  if (state.dataStatus === "realtime") return "即時 IV｜來源：Deribit";
  if (state.dataStatus === "iv_fallback") return "歷史 IV｜來源：IV History｜非即時資料";
  if (state.dataStatus === "stale_fallback") return "歷史 IV｜來源：IV History｜資料過舊｜非即時資料";
  return "預設 IV｜來源：System Default｜僅供粗略估算";
}
function fmtTargetTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString("zh-TW", { hour12:false })
    : "--";
}
function renderTargetStatus() {
  if (!els.targetStatus || !els.resetTargetBtn) return;
  const target = state.targetPriceState[state.coin] || loadTargetState(state.coin, state.spot);
  state.targetPriceState[state.coin] = target;
  const drift = targetDriftPercent();
  state.targetPriceDriftPercent = drift;
  const isManual = target.targetPriceSource === "manual";
  const driftText = Number.isFinite(drift) ? `${drift >= 0 ? "+" : ""}${drift.toFixed(1)}%` : "--";
  const warning = isManual && Number.isFinite(drift) && Math.abs(drift) >= 5;
  els.targetStatus.className = `target-status ${isManual ? "manual" : "auto"}${warning ? " drift-warning" : ""}`;
  els.resetTargetBtn.hidden = !isManual;
  els.targetStatus.innerHTML = isManual ? `
    <div><strong>目標價：上次手動設定</strong><span>設定時間：${fmtTargetTime(target.targetPriceSetTime)}</span></div>
    <div class="target-status-grid">
      <span>設定時現價：${Number.isFinite(target.basePriceWhenTargetSet) ? fmtMoney(target.basePriceWhenTargetSet) : "--"}</span>
      <span>目前現價：${fmtMoney(state.spot)}</span>
      <span>現價變動：${driftText}</span>
    </div>
    ${warning ? `<p>現價已較設定時明顯變動，建議重新評估目標價。</p>` : ""}
  ` : `
    <div><strong>目標價：系統預設（現價 +3%）</strong><span>目前以 ${fmtMoney(state.spot)} 估算</span></div>
  `;
}
function renderIvTable() {
  const current = state.iv * 100;
  const rows = [];
  for (const m of [0.7,0.8,0.9,1,1.1,1.2,1.3]) {
    const iv = clamp(current * m, 1, 300) / 100;
    const n = bs(state.spot, state.strike, state.r, iv, state.offsetDays);
    const f = bs(state.spot, state.strike, state.r, iv * 1.5, state.offsetDays);
    rows.push(`<tr><td>${(iv*100).toFixed(2)}%</td><td>${n ? fmtPct(n.success) : "--"}</td><td>${f ? fmtPct(f.success) : "--"}</td></tr>`);
  }
  els.ivTable.innerHTML = rows.join("");
}
function renderLogs() {
  els.logList.innerHTML = state.logs.slice(-8).map(x => `<li>${x}</li>`).join("");
}
function fmtMarketTime(date) {
  return date ? date.toLocaleString("zh-TW", { hour12:false }) : "--";
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}
function safeNewsUrl(url) {
  if (typeof url !== "string" || !url.trim()) return "";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : "";
  } catch {
    return "";
  }
}
function marketNewsAgeHours(item) {
  const publishedAt = item?.publishedAt || item?.time;
  const publishedTime = publishedAt ? new Date(publishedAt).getTime() : NaN;
  if (!Number.isFinite(publishedTime)) return Infinity;
  return Math.max(0, (Date.now() - publishedTime) / 36e5);
}
function fmtRelativeMarketTime(item) {
  const hours = marketNewsAgeHours(item);
  if (!Number.isFinite(hours)) return "--";
  if (hours < 1) return "剛剛";
  if (hours < 24) return `${Math.floor(hours)} 小時前`;
  return `${Math.floor(hours / 24)} 天前`;
}
function marketNewsFreshnessLabel(item) {
  const label = fmtRelativeMarketTime(item);
  return marketNewsAgeHours(item) >= 24 ? `較舊 ${label}` : label;
}
function fmtMarketEventDate(dateText) {
  if (!dateText) return "日期未知";
  const [year, month, day] = dateText.split("-");
  return `${year}/${month}/${day}`;
}
function fmtMarketEventCountdown(daysLeft) {
  if (!Number.isFinite(daysLeft)) return "";
  if (daysLeft === 0) return "今天";
  return `剩 ${daysLeft} 天`;
}
function marketEventImpactIcon(impact) {
  return impact === "high" ? "!" : "i";
}
function renderMarketEvents() {
  if (!els.marketEventsList) return;
  const events = state.marketNews.events || [];
  els.toggleEventsBtn.textContent = state.marketEventsExpanded ? "收合" : "展開";
  if (els.refreshEventsBtn) els.refreshEventsBtn.disabled = state.marketNews.loading;
  els.marketEventsList.classList.toggle("collapsed", !state.marketEventsExpanded);
  els.marketEventsUpdated.textContent = state.marketNews.eventsUpdatedAt ? `事件更新：${fmtMarketTime(state.marketNews.eventsUpdatedAt)}` : "事件尚未更新";
  if (!state.marketEventsExpanded) {
    els.marketEventsList.innerHTML = "";
    return;
  }
  if (state.marketNews.loading) {
    els.marketEventsList.innerHTML = `<div class="market-empty">事件更新中...</div>`;
    return;
  }
  if (!events.length) {
    els.marketEventsList.innerHTML = `<div class="market-empty">目前沒有重要事件。</div>`;
    return;
  }
  els.marketEventsList.innerHTML = events.map(item => `
    <div class="market-item">
      <strong>${marketEventImpactIcon(item.impact)} ${escapeHtml(item.title)}</strong>
      <span>${[fmtMarketEventDate(item.date), fmtMarketEventCountdown(item.daysLeft)].filter(Boolean).join(" | ")}</span>
    </div>
  `).join("");
}
function renderMarketNews() {
  if (!els.marketNewsList) return;
  const items = state.marketNews.items || [];
  const limit = state.marketNewsExpanded ? 8 : 3;
  els.toggleNewsBtn.textContent = state.marketNewsExpanded ? "收合" : "展開";
  if (els.refreshNewsBtn) els.refreshNewsBtn.disabled = state.marketNews.loading;
  els.marketNewsList.classList.toggle("collapsed", !state.marketNewsExpanded);
  if (!state.marketNewsExpanded) {
    els.marketNewsUpdated.textContent = state.marketNews.loaded ? `最後更新：${fmtMarketTime(state.marketNews.lastUpdated)}` : "新聞尚未更新";
    els.marketNewsList.innerHTML = "";
    return;
  }
  if (state.marketNews.error) {
    els.marketNewsUpdated.textContent = "新聞更新失敗";
    els.marketNewsList.innerHTML = `<div class="market-empty">新聞更新失敗。</div>`;
    return;
  }
  if (!state.marketNews.loading && !items.length) {
    els.marketNewsUpdated.textContent = "近 48 小時無相關市場重點。";
    els.marketNewsList.innerHTML = `<div class="market-empty">近 48 小時無相關市場重點。</div>`;
    return;
  }
  els.marketNewsUpdated.textContent = state.marketNews.loading ? "新聞更新中..." : `最後更新：${fmtMarketTime(state.marketNews.lastUpdated)}`;
  els.marketNewsList.innerHTML = items.slice(0, limit).map(item => `
    <div class="market-item">
      <strong>${escapeHtml(item.summaryTitle || item.title)}</strong>
      <span>${escapeHtml(item.source)} | ${marketNewsFreshnessLabel(item)} | <a class="market-link" href="${safeNewsUrl(item.url)}" target="_blank" rel="noopener noreferrer">來源</a></span>
    </div>
  `).join("");
}
function renderStrikePresets() {
  const presets = dynamicStrikePresets();
  els.strikePresets.innerHTML = presets.map(price => {
    const active = snapPrice(state.strike) === price ? " active" : "";
    return `<button class="${active}" type="button" data-price="${price}">${fmtMoney(price)}</button>`;
  }).join("");
}
function renderHistory() {
  els.toggleHistoryBtn.textContent = state.historyCollapsed ? "展開紀錄" : "收合";
  els.historyList.classList.toggle("collapsed", state.historyCollapsed);
  if (state.historyCollapsed) {
    els.historyList.innerHTML = `<div class="history-empty">已收合 ${state.history.length} 筆紀錄。</div>`;
    return;
  }
  if (!state.history.length) {
    els.historyList.innerHTML = `<div class="history-empty">尚無紀錄，調好目標價後可儲存比較。</div>`;
    return;
  }
  els.historyList.innerHTML = state.history.map(item => `
    <div class="history-item" data-history-id="${item.id}">
      <div class="history-main">
        <div class="history-title">${item.coin}｜${escapeHtml(item.mode)} K ${fmtMoney(item.strike)}</div>
        <div class="history-meta">S ${fmtMoney(item.spot)}｜IV ${(item.iv * 100).toFixed(2)}%｜${escapeHtml(item.expiryLabel)}｜${escapeHtml(item.savedAt)}</div>
      </div>
      <div class="history-scores">
        <div>
          <strong>${fmtPct(item.normalSuccess)}</strong>
          <span>正常成功</span>
        </div>
        <div>
          <strong>${fmtPct(item.fatSuccess)}</strong>
          <span>肥尾成功</span>
        </div>
      </div>
      <button class="history-delete" type="button" data-delete-history="${item.id}" aria-label="刪除此筆紀錄">刪除</button>
    </div>
  `).join("");
}
function saveHistorySnapshot() {
  const info = settlementInfo(state.offsetDays);
  const { normal, fat } = calcAll();
  if (!normal || !fat) return;
  const item = {
    id: Date.now(),
    coin: state.coin,
    mode: normal.isHighSell ? "高賣" : "低買",
    spot: state.spot,
    strike: state.strike,
    iv: state.iv,
    offsetDays: state.offsetDays,
    expiryLabel: info.label,
    normalSuccess: normal.success,
    fatSuccess: fat.success,
    savedAt: new Date().toLocaleString("zh-TW", { hour12:false, month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" })
  };
  if (state.history.some(row => historySignature(row) === historySignature(item))) {
    state.logs.push("已略過重複的最近紀錄。");
    render();
    return;
  }
  state.history = [item, ...state.history].slice(0, 20);
  localStorage.setItem(historyKey(), JSON.stringify(state.history));
  renderHistory();
}
function deleteHistoryItem(id) {
  state.history = state.history.filter(item => String(item.id) !== String(id));
  localStorage.setItem(historyKey(), JSON.stringify(state.history));
  renderHistory();
}
function toggleHistory() {
  state.historyCollapsed = !state.historyCollapsed;
  localStorage.setItem("historyCollapsed", state.historyCollapsed ? "true" : "false");
  renderHistory();
}
async function refreshMarketData() {
  await loadMarketNews();
  render();
}
async function toggleMarketNews() {
  state.marketNewsExpanded = !state.marketNewsExpanded;
  if (state.marketNewsExpanded && !state.marketNews.loaded && !state.marketNews.loading) {
    refreshMarketData();
    renderMarketNews();
    return;
  }
  renderMarketNews();
}
async function toggleMarketEvents() {
  state.marketEventsExpanded = !state.marketEventsExpanded;
  if (state.marketEventsExpanded && !state.marketNews.loaded && !state.marketNews.loading) {
    await refreshMarketData();
    return;
  }
  renderMarketEvents();
}
function saveLocal(updatedAt = null) {
  localStorage.setItem(`${state.coin}Spot`, state.spot);
  if (state.targetPriceState[state.coin]) saveTargetState(state.coin);
  if (state.targetPriceTouchedByUser[state.coin] && Number.isFinite(state.strike) && state.strike > 0) localStorage.setItem(`${state.coin}Strike`, state.strike);
  else localStorage.removeItem(`${state.coin}Strike`);
  localStorage.setItem(`${state.coin}Iv`, state.iv);
  if (updatedAt instanceof Date && !Number.isNaN(updatedAt.getTime())) {
    state.lastUpdated = updatedAt;
    if (state.dataStatus !== "realtime") {
      state.dataStatus = "cache";
      state.source = "手動輸入，目前未同步";
    }
    localStorage.setItem(`${state.coin}UpdatedAt`, updatedAt.toISOString());
  }
}
function setCoin(coin) {
  if (!validAsset(coin)) return;
  localStorage.setItem(selectedAssetKey(), coin);
  loadCoinState(coin);
  state.syncing = false;
  render();
  setTimeout(() => syncMarket(false), 0);
}
function updateOffsetDays(v) {
  state.offsetDays = normalizeOffsetDays(v);
  render();
}
function adjustStrike(dir) {
  const step = priceStep();
  const current = Number(state.strike) || Number(els.strikeInput.value) || defaultTargetPrice(fallback[state.coin].spot);
  setManualTargetPrice(state.coin, snapPrice(current + dir * step, step));
  saveLocal();
  render();
}
function setDisplayMode(sticky) {
  state.stickyMode = sticky;
  localStorage.setItem("displayMode", sticky ? "sticky" : "normal");
  render();
}
function bind() {
  els.btcBtn.addEventListener("click", () => setCoin("BTC"));
  els.ethBtn.addEventListener("click", () => setCoin("ETH"));
  els.syncBtn.addEventListener("click", () => syncMarket(true));
  els.stickyMiniBtn.addEventListener("click", () => setDisplayMode(!state.stickyMode));
  if (els.stickySyncBtn) els.stickySyncBtn.addEventListener("click", () => syncMarket(true));
  if (els.stickyOffBtn) els.stickyOffBtn.addEventListener("click", () => setDisplayMode(false));

  els.spotInput.addEventListener("change", () => {
    const v = Number(els.spotInput.value);
    if (v > 0) { state.spot = v; initializeStrikeFromSpot(state.coin, v); saveLocal(new Date()); render(); }
  });
  els.spotInput.addEventListener("blur", () => {
    const v = Number(els.spotInput.value);
    if (v > 0) { state.spot = v; initializeStrikeFromSpot(state.coin, v); saveLocal(new Date()); render(); }
  });
  els.strikeInput.addEventListener("change", () => {
    const v = Number(els.strikeInput.value);
    if (v > 0) { setManualTargetPrice(state.coin, v); saveLocal(); render(); }
  });
  els.strikeInput.addEventListener("blur", () => {
    const v = Number(els.strikeInput.value);
    if (v > 0) { setManualTargetPrice(state.coin, v); saveLocal(); render(); }
  });
  els.strikeInput.addEventListener("wheel", (e) => {
    e.preventDefault();
    adjustStrike(e.deltaY > 0 ? -1 : 1);
  }, { passive:false });
  els.strikeMinus.addEventListener("click", () => adjustStrike(-1));
  els.strikePlus.addEventListener("click", () => adjustStrike(1));
  if (els.resetTargetBtn) els.resetTargetBtn.addEventListener("click", resetTargetToAuto);
  els.strikePresets.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-price]");
    if (!btn) return;
    setManualTargetPrice(state.coin, Number(btn.dataset.price));
    saveLocal();
    render();
  });
  els.saveHistoryBtn.addEventListener("click", saveHistorySnapshot);
  els.toggleHistoryBtn.addEventListener("click", toggleHistory);
  if (els.toggleNewsBtn) els.toggleNewsBtn.addEventListener("click", toggleMarketNews);
  if (els.toggleEventsBtn) els.toggleEventsBtn.addEventListener("click", toggleMarketEvents);
  if (els.refreshNewsBtn) els.refreshNewsBtn.addEventListener("click", refreshMarketData);
  if (els.refreshEventsBtn) els.refreshEventsBtn.addEventListener("click", refreshMarketData);
  if (els.ivHistoryInfoBtn) els.ivHistoryInfoBtn.addEventListener("click", toggleIvHistoryInfo);
  els.historyList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-delete-history]");
    if (!btn) return;
    deleteHistoryItem(btn.dataset.deleteHistory);
  });
  els.ivRange.addEventListener("input", () => {
    state.iv = Number(els.ivRange.value) / 100;
    state.ivFallback = null;
    saveLocal(new Date());
    render();
  });
  els.dayMinus.addEventListener("click", () => updateOffsetDays(state.offsetDays - 1));
  els.dayPlus.addEventListener("click", () => updateOffsetDays(state.offsetDays + 1));
  els.dayInput.addEventListener("input", () => updateOffsetDays(els.dayInput.value));
  els.dayInput.addEventListener("wheel", (e) => {
    e.preventDefault();
    updateOffsetDays(state.offsetDays + (e.deltaY > 0 ? 1 : -1));
  }, { passive:false });
}
