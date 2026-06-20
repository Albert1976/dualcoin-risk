(() => {
  const $ = (id) => document.getElementById(id);
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
    logs: [],
    syncing: false,
    stickyMode: localStorage.getItem("displayMode") === "sticky",
    historyCollapsed: localStorage.getItem("historyCollapsed") === "true",
    history: loadHistory()
  };

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
  function minOffsetDays() {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(16, 0, 0, 0);
    return now < cutoff ? 0 : 1;
  }
  function normalizeOffsetDays(v) { return Math.max(minOffsetDays(), Math.min(90, Math.round(Number(v) || 0))); }
  function settlementInfo(offsetDays = state.offsetDays) {
    const now = new Date();
    const d = Math.max(minOffsetDays(), Number(offsetDays));
    const expiry = new Date(now);
    expiry.setDate(expiry.getDate() + d);
    expiry.setHours(16, 0, 0, 0);
    const hours = Math.max((expiry - now) / 36e5, 0.25);
    let label = d === 0 ? "今天" : (d === 1 ? "明天" : `${d} 天後`);
    return { offsetDays: d, label, hours, T: hours / 24 / 365, hint: `${label} 16:00 結算，約 ${hours.toFixed(1)} 小時` };
  }
  function fmtPct(x, n = 2) { return Number.isFinite(x) ? `${(x * 100).toFixed(n)}%` : "--"; }
  function fmtMoney(x) { return Number.isFinite(x) ? "$" + x.toLocaleString("en-US", { maximumFractionDigits: x < 10000 ? 2 : 0 }) : "$--"; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
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
  function erf(x) {
    const sign = x < 0 ? -1 : 1; x = Math.abs(x);
    const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=.3275911;
    const t=1/(1+p*x);
    const y=1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
    return sign*y;
  }
  function normCdf(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }
  function bs(S, K, r, sigma, offsetDays) {
    const { T } = settlementInfo(offsetDays);
    const volT = sigma * Math.sqrt(T);
    if (!(S > 0 && K > 0 && sigma > 0 && T > 0 && volT > 0)) return null;
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / volT;
    const d2 = d1 - volT;
    const isHighSell = K >= S;
    const success = isHighSell ? 1 - normCdf(d2) : 1 - normCdf(-d2);
    return { d1, d2, success: clamp(success, 0, 1), exercise: clamp(1 - success, 0, 1), isHighSell };
  }
  function riskLevel(p) {
    if (!Number.isFinite(p)) return ["neutral", "等待資料", "先用預設值估算，市場資料回來後自動更新。"];
    if (p >= 0.90) return ["green", "綠燈：相對安全", `肥尾成功率 ${fmtPct(p)}，可作為較保守參考。`];
    if (p >= 0.80) return ["yellow", "黃燈：需控倉", `肥尾成功率 ${fmtPct(p)}，仍有明顯被執行風險。`];
    if (p >= 0.70) return ["orange", "橘燈：偏進取", `肥尾成功率 ${fmtPct(p)}，建議降低部位或提高目標價。`];
    return ["red", "紅燈：偏危險", `肥尾成功率 ${fmtPct(p)}，被執行風險偏高。`];
  }
  function calcAll() {
    return {
      normal: bs(state.spot, state.strike, state.r, state.iv, state.offsetDays),
      fat: bs(state.spot, state.strike, state.r, state.iv * 1.5, state.offsetDays)
    };
  }
  function buildLastNotes(normal, fat, info) {
    if (!normal || !fat) return [{ type:"warn", text:"資料不足，請確認現價、目標價、IV 與結算日。" }];
    const dist = Math.abs(state.strike - state.spot) / state.spot;
    const direction = normal.isHighSell ? "高賣" : "低買";
    const notes = [];
    if (dist < 0.015) notes.push({ type:"danger", text:`目標價距離現價僅 ${(dist*100).toFixed(2)}%，${direction}被執行風險偏高。` });
    else if (dist < 0.035) notes.push({ type:"risk", text:`目標價距離現價 ${(dist*100).toFixed(2)}%，仍需留意短線波動。` });
    else notes.push({ type:"good", text:`目標價距離現價 ${(dist*100).toFixed(2)}%，距離相對有緩衝。` });
    if (fat.success < 0.70) notes.push({ type:"danger", text:`肥尾成功率 ${fmtPct(fat.success)}，偏向高風險，不適合重倉追利息。` });
    else if (fat.success < 0.80) notes.push({ type:"risk", text:`肥尾成功率 ${fmtPct(fat.success)}，屬橘燈區，建議控倉或拉開目標價。` });
    else if (fat.success < 0.90) notes.push({ type:"warn", text:`肥尾成功率 ${fmtPct(fat.success)}，屬黃燈區，可以做但別忽略被執行風險。` });
    else notes.push({ type:"good", text:`肥尾成功率 ${fmtPct(fat.success)}，目前屬相對安全區。` });
    if (state.iv >= 0.75) notes.push({ type:"danger", text:`IV ${(state.iv*100).toFixed(2)}% 偏高，市場預期波動大。` });
    else if (state.iv >= 0.55) notes.push({ type:"risk", text:`IV ${(state.iv*100).toFixed(2)}% 偏高，肥尾測試比正常成功率更值得參考。` });
    else notes.push({ type:"good", text:`IV ${(state.iv*100).toFixed(2)}%，目前波動率沒有特別誇張。` });
    if (info.hours < 8) notes.push({ type:"warn", text:`距離結算約 ${info.hours.toFixed(1)} 小時，短時間插針影響會更直接。` });
    else notes.push({ type:"good", text:`距離結算約 ${info.hours.toFixed(1)} 小時，仍有時間緩衝。` });
    return notes.slice(0, 5);
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
      if (spotR.ok && Number.isFinite(spotR.v)) {
        state.spot = spotR.v;
        logs.push(`Binance Spot ${coin}USDT：${spotR.v.toLocaleString("en-US", { maximumFractionDigits:2 })}`);
      } else {
        logs.push(`Binance Spot ${coin}USDT 失敗：採用目前值 ${state.spot.toLocaleString("en-US", { maximumFractionDigits:2 })}`);
      }
      if (ivR.ok && Number.isFinite(ivR.v)) {
        state.iv = ivR.v;
        state.source = `Deribit ${coin} DVOL`;
        logs.push(`Deribit ${coin} DVOL：${(ivR.v*100).toFixed(2)}%`);
      } else {
        state.source = "預設 / 手動 IV";
        logs.push(`Deribit ${coin} DVOL 失敗：採用目前 IV ${(state.iv*100).toFixed(2)}%`);
      }
      logs.push("FRED DGS3MO：前端固定採預設 3.70%，避免 CORS 卡住");
      state.lastUpdated = new Date();
      state.lastSyncMs = performance.now() - syncStart;
      logs.unshift(`同步耗時：${(state.lastSyncMs/1000).toFixed(1)} 秒`);
      state.logs.push(...logs);
      saveLocal();
    }
    state.syncing = false;
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

  bind();
  render();
  syncMarket(false);
})();
