const els = {
  syncBtn: $("syncBtn"), btcBtn: $("btcBtn"), ethBtn: $("ethBtn"),
  stickyMiniBtn: $("stickyMiniBtn"), stickyOffBtn: $("stickyOffBtn"), stickySyncBtn: $("stickySyncBtn"),
  modeLine: $("modeLine"), updatedAt: $("updatedAt"),
  normalHeroSuccess: $("normalHeroSuccess"), fatSuccess: $("fatSuccess"),
  normalSuccess: $("normalSuccess"), normalExercise: $("normalExercise"), fatExercise: $("fatExercise"),
  stickyMode: $("stickyMode"), stickyNormal: $("stickyNormal"), stickyFat: $("stickyFat"), stickyRisk: $("stickyRisk"),
  riskDot: $("riskDot"), riskTitle: $("riskTitle"), riskDesc: $("riskDesc"),
  quickSpot: $("quickSpot"), quickStrike: $("quickStrike"), quickExpiry: $("quickExpiry"), quickIv: $("quickIv"),
  spotInput: $("spotInput"), strikeInput: $("strikeInput"), strikeMinus: $("strikeMinus"), strikePlus: $("strikePlus"), priceStepLabel: $("priceStepLabel"), autoMode: $("autoMode"),
  strikePresets: $("strikePresets"), toggleHistoryBtn: $("toggleHistoryBtn"), saveHistoryBtn: $("saveHistoryBtn"), historyList: $("historyList"),
  dayMinus: $("dayMinus"), dayPlus: $("dayPlus"), settlementLabel: $("settlementLabel"), settlementSub: $("settlementSub"), dayInput: $("dayInput"), dayHint: $("dayHint"),
  ivRange: $("ivRange"), ivLabel: $("ivLabel"), rateLabel: $("rateLabel"),
  lastNotes: $("lastNotes"),
  toggleNewsBtn: $("toggleNewsBtn"), marketNewsUpdated: $("marketNewsUpdated"), marketNewsList: $("marketNewsList"),
  toggleEventsBtn: $("toggleEventsBtn"), marketEventsUpdated: $("marketEventsUpdated"), marketEventsList: $("marketEventsList"),
  ivTable: $("ivTable"), d1Val: $("d1Val"), d2Val: $("d2Val"), rVal: $("rVal"), sourceVal: $("sourceVal"), logList: $("logList")
};

function priceStep() { return state.coin === "BTC" ? 50 : 5; }
function presetGap() { return state.coin === "BTC" ? 500 : 25; }
function snapPrice(v, step = priceStep()) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return step;
  return Math.round(n / step) * step;
}
function dynamicStrikePresets() {
  const gap = presetGap();
  const center = snapPrice(state.spot || state.strike || fallback[state.coin].strike, gap);
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
function render() {
  state.offsetDays = normalizeOffsetDays(state.offsetDays);
  document.body.classList.toggle("sticky-mode", state.stickyMode);
  const info = settlementInfo(state.offsetDays);
  const { normal, fat } = calcAll();
  const mode = normal?.isHighSell ? "高賣" : "低買";
  const [riskCls, riskTitle, riskDesc] = riskLevel(fat?.success);

  els.stickyMiniBtn.classList.toggle("active", state.stickyMode);
  els.stickyMiniBtn.textContent = state.stickyMode ? "固定✓" : "固定";
  if (els.stickyOffBtn) els.stickyOffBtn.textContent = "固定✓";
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
  els.settlementSub.textContent = `約 ${info.hours.toFixed(1)} 小時`;
  els.dayInput.min = String(minOffsetDays());
  els.dayInput.value = state.offsetDays;
  els.dayMinus.disabled = state.offsetDays <= minOffsetDays();
  els.dayHint.textContent = `${info.hint}，BS T = ${info.T.toFixed(6)} 年`;
  els.ivRange.value = (state.iv * 100).toFixed(1);
  els.ivLabel.textContent = `${(state.iv * 100).toFixed(2)}%`;
  els.rateLabel.textContent = `${(state.r * 100).toFixed(2)}%`;
  els.rVal.textContent = `${(state.r * 100).toFixed(2)}%`;
  els.sourceVal.textContent = state.source;
  els.autoMode.textContent = normal ? `${mode}：目標價${normal.isHighSell ? "高於" : "低於"}現價，裁決固定採用肥尾 σ×1.5。` : "自動判斷：--";

  els.normalHeroSuccess.textContent = normal ? fmtPct(normal.success) : "--";
  els.normalSuccess.textContent = normal ? fmtPct(normal.success) : "--";
  els.normalExercise.textContent = normal ? fmtPct(normal.exercise) : "--";
  els.fatSuccess.textContent = fat ? fmtPct(fat.success) : "--";
  els.fatExercise.textContent = fat ? fmtPct(fat.exercise) : "--";
  els.stickyNormal.textContent = normal ? fmtPct(normal.success) : "--";
  els.stickyFat.textContent = fat ? fmtPct(fat.success) : "--";
  els.stickyRisk.textContent = riskTitle.replace("：", " ");
  els.d1Val.textContent = normal ? normal.d1.toFixed(4) : "--";
  els.d2Val.textContent = normal ? normal.d2.toFixed(4) : "--";

  els.riskDot.className = `risk-dot ${riskCls}`;
  els.riskTitle.textContent = riskTitle;
  els.riskDesc.textContent = riskDesc;
  els.btcBtn.classList.toggle("active", state.coin === "BTC");
  els.ethBtn.classList.toggle("active", state.coin === "ETH");

  if (state.syncing) {
    els.updatedAt.textContent = "背景同步中，已先用現有資料計算";
  } else if (state.lastUpdated) {
    const t = state.lastUpdated.toLocaleString("zh-TW", { hour12:false });
    const sec = Number.isFinite(state.lastSyncMs) ? `（${(state.lastSyncMs/1000).toFixed(1)} 秒）` : "";
    els.updatedAt.textContent = `最後更新：${t} ${sec}`;
  } else {
    els.updatedAt.textContent = "使用預設值，可立即計算";
  }

  renderNotes(buildLastNotes(normal, fat, info));
  renderStrikePresets();
  renderHistory();
  renderMarketEvents();
  renderMarketNews();
  renderIvTable();
  renderLogs();
}

function renderNotes(notes) {
  els.lastNotes.innerHTML = notes.map(n => `<li class="${n.type}">${n.text}</li>`).join("");
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
function renderMarketEvents() {
  if (!els.marketEventsList) return;
  const events = state.marketNews.events || [];
  els.toggleEventsBtn.textContent = state.marketEventsExpanded ? "收合" : "展開";
  els.marketEventsList.classList.toggle("collapsed", !state.marketEventsExpanded);
  els.marketEventsUpdated.textContent = events.length ? `最後更新：${fmtMarketTime(state.marketNews.lastUpdated)}` : "目前未偵測到重大事件";
  if (!state.marketEventsExpanded) {
    els.marketEventsList.innerHTML = "";
    return;
  }
  if (!events.length) {
    els.marketEventsList.innerHTML = `<div class="market-empty">目前未偵測到重大事件</div>`;
    return;
  }
  els.marketEventsList.innerHTML = events.slice(0, 3).map(item => `
    <div class="market-item">
      <strong>${item.title}</strong>
      <span>${item.source}｜${fmtMarketTime(item.publishedAt)}</span>
    </div>
  `).join("");
}
function renderMarketNews() {
  if (!els.marketNewsList) return;
  const items = state.marketNews.items || [];
  const limit = state.marketNewsExpanded ? 8 : 3;
  els.toggleNewsBtn.textContent = state.marketNewsExpanded ? "收合" : "展開";
  els.marketNewsList.classList.toggle("collapsed", !state.marketNewsExpanded);
  if (state.marketNews.error || (!state.marketNews.loading && !items.length)) {
    els.marketNewsUpdated.textContent = "市場重點暫時無法更新";
    els.marketNewsList.innerHTML = `<div class="market-empty">市場重點暫時無法更新</div>`;
    return;
  }
  els.marketNewsUpdated.textContent = state.marketNews.loading ? "市場重點更新中" : `最後更新：${fmtMarketTime(state.marketNews.lastUpdated)}`;
  els.marketNewsList.innerHTML = items.slice(0, limit).map(item => `
    <div class="market-item">
      <strong>${item.title}</strong>
      <span>${item.source}｜${fmtMarketTime(item.publishedAt)}</span>
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
  els.toggleHistoryBtn.textContent = state.historyCollapsed ? "展開" : "收合";
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
        <div class="history-title">${item.coin}｜${item.mode} K ${fmtMoney(item.strike)}</div>
        <div class="history-meta">S ${fmtMoney(item.spot)}｜IV ${(item.iv * 100).toFixed(2)}%｜${item.expiryLabel}｜${item.savedAt}</div>
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
      <button class="history-delete" type="button" data-delete-history="${item.id}" aria-label="刪除此筆">刪除</button>
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
    state.logs.push("最近紀錄：同一組設定已存在，未重複新增");
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
function toggleMarketNews() {
  state.marketNewsExpanded = !state.marketNewsExpanded;
  renderMarketNews();
}
function toggleMarketEvents() {
  state.marketEventsExpanded = !state.marketEventsExpanded;
  renderMarketEvents();
}
function saveLocal() {
  localStorage.setItem(`${state.coin}Spot`, state.spot);
  localStorage.setItem(`${state.coin}Strike`, state.strike);
  localStorage.setItem(`${state.coin}Iv`, state.iv);
}
function setCoin(coin) {
  state.coin = coin;
  const d = fallback[coin];
  state.spot = Number(localStorage.getItem(`${coin}Spot`)) || d.spot;
  state.strike = Number(localStorage.getItem(`${coin}Strike`)) || d.strike;
  state.iv = Number(localStorage.getItem(`${coin}Iv`)) || d.iv;
  state.source = "預設 / 快取值";
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
  const current = Number(state.strike) || Number(els.strikeInput.value) || fallback[state.coin].strike;
  state.strike = snapPrice(current + dir * step, step);
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
    if (v > 0) { state.spot = v; saveLocal(); render(); }
  });
  els.spotInput.addEventListener("blur", () => {
    const v = Number(els.spotInput.value);
    if (v > 0) { state.spot = v; saveLocal(); render(); }
  });
  els.strikeInput.addEventListener("change", () => {
    const v = Number(els.strikeInput.value);
    if (v > 0) { state.strike = snapPrice(v); saveLocal(); render(); }
  });
  els.strikeInput.addEventListener("blur", () => {
    const v = Number(els.strikeInput.value);
    if (v > 0) { state.strike = snapPrice(v); saveLocal(); render(); }
  });
  els.strikeInput.addEventListener("wheel", (e) => {
    e.preventDefault();
    adjustStrike(e.deltaY > 0 ? -1 : 1);
  }, { passive:false });
  els.strikeMinus.addEventListener("click", () => adjustStrike(-1));
  els.strikePlus.addEventListener("click", () => adjustStrike(1));
  els.strikePresets.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-price]");
    if (!btn) return;
    state.strike = Number(btn.dataset.price);
    saveLocal();
    render();
  });
  els.saveHistoryBtn.addEventListener("click", saveHistorySnapshot);
  els.toggleHistoryBtn.addEventListener("click", toggleHistory);
  if (els.toggleNewsBtn) els.toggleNewsBtn.addEventListener("click", toggleMarketNews);
  if (els.toggleEventsBtn) els.toggleEventsBtn.addEventListener("click", toggleMarketEvents);
  els.historyList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-delete-history]");
    if (!btn) return;
    deleteHistoryItem(btn.dataset.deleteHistory);
  });
  els.ivRange.addEventListener("input", () => {
    state.iv = Number(els.ivRange.value) / 100;
    saveLocal();
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
