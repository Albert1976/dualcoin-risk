(() => {
  const $ = (id) => document.getElementById(id);
  const state = {
    coin: "ETH",
    spot: 1786.99,
    strike: 1825,
    offsetDays: 1,
    iv: 0.53,
    r: 0.037,
    source: "預設值",
    lastUpdated: null,
    lastSyncMs: null,
    logs: [],
    syncing: false
  };

  const els = {
    syncBtn: $("syncBtn"), btcBtn: $("btcBtn"), ethBtn: $("ethBtn"),
    modeLine: $("modeLine"), updatedAt: $("updatedAt"),
    normalHeroSuccess: $("normalHeroSuccess"), fatSuccess: $("fatSuccess"),
    normalSuccess: $("normalSuccess"), normalExercise: $("normalExercise"), fatExercise: $("fatExercise"),
    riskDot: $("riskDot"), riskTitle: $("riskTitle"), riskDesc: $("riskDesc"),
    quickSpot: $("quickSpot"), quickStrike: $("quickStrike"), quickExpiry: $("quickExpiry"), quickIv: $("quickIv"),
    spotInput: $("spotInput"), strikeInput: $("strikeInput"), autoMode: $("autoMode"),
    dayMinus: $("dayMinus"), dayPlus: $("dayPlus"), settlementLabel: $("settlementLabel"), settlementSub: $("settlementSub"), dayInput: $("dayInput"), dayHint: $("dayHint"),
    ivRange: $("ivRange"), ivLabel: $("ivLabel"), rateLabel: $("rateLabel"),
    ivTable: $("ivTable"), d1Val: $("d1Val"), d2Val: $("d2Val"), rVal: $("rVal"), sourceVal: $("sourceVal"), logList: $("logList"), noteList: $("noteList"), noteBadge: $("noteBadge")
  };

  const fallback = {
    BTC: { spot: 66902, strike: 69250, iv: 0.388 },
    ETH: { spot: 1786.99, strike: 1825, iv: 0.53 }
  };

  function minOffsetDays() {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(16, 0, 0, 0);
    return now < cutoff ? 0 : 1;
  }

  function normalizeOffsetDays(v) {
    return Math.max(minOffsetDays(), Math.min(90, Math.round(Number(v) || 0)));
  }

  function settlementInfo(offsetDays = state.offsetDays) {
    const now = new Date();
    const min = minOffsetDays();
    const d = Math.max(min, Number(offsetDays));
    const expiry = new Date(now);
    expiry.setDate(expiry.getDate() + d);
    expiry.setHours(16, 0, 0, 0);

    const hours = Math.max((expiry - now) / 36e5, 0.25);
    let label;
    if (d === 0) label = "今天";
    else if (d === 1) label = "明天";
    else label = `${d} 天後`;

    return {
      offsetDays: d,
      label,
      hours,
      T: hours / 24 / 365,
      hint: `${label} 16:00 結算，約 ${hours.toFixed(1)} 小時`
    };
  }

  function fmtPct(x, n = 2) { return Number.isFinite(x) ? `${(x * 100).toFixed(n)}%` : "--"; }
  function fmtMoney(x) { return Number.isFinite(x) ? "$" + x.toLocaleString("en-US", { maximumFractionDigits: x < 10000 ? 2 : 0 }) : "$--"; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
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
    const normal = bs(state.spot, state.strike, state.r, state.iv, state.offsetDays);
    const fat = bs(state.spot, state.strike, state.r, state.iv * 1.5, state.offsetDays);
    return { normal, fat };
  }

  function render() {
    state.offsetDays = normalizeOffsetDays(state.offsetDays);
    const info = settlementInfo(state.offsetDays);
    const { normal, fat } = calcAll();
    const mode = normal?.isHighSell ? "高賣" : "低買";

    els.modeLine.textContent = `${state.coin}｜${mode}`;
    els.quickSpot.textContent = fmtMoney(state.spot);
    els.quickStrike.textContent = fmtMoney(state.strike);
    els.quickExpiry.textContent = info.label;
    els.quickIv.textContent = `${(state.iv * 100).toFixed(2)}%`;
    els.spotInput.value = Number.isFinite(state.spot) ? state.spot : "";
    els.strikeInput.value = Number.isFinite(state.strike) ? state.strike : "";
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
    els.d1Val.textContent = normal ? normal.d1.toFixed(4) : "--";
    els.d2Val.textContent = normal ? normal.d2.toFixed(4) : "--";

    const [cls, title, desc] = riskLevel(fat?.success);
    els.riskDot.className = `risk-dot ${cls}`;
    els.riskTitle.textContent = title;
    els.riskDesc.textContent = desc;

    els.btcBtn.classList.toggle("active", state.coin === "BTC");
    els.ethBtn.classList.toggle("active", state.coin === "ETH");

    if (state.syncing) {
      els.updatedAt.textContent = "背景同步中，已先用現有資料計算";
    } else if (state.lastUpdated) {
      const t = state.lastUpdated.toLocaleString("zh-TW", { hour12:false });
      const sec = Number.isFinite(state.lastSyncMs) ? `（${(state.lastSyncMs/1000).toFixed(1)} 秒）` : "";
      els.updatedAt.textContent = `最後更新：${t} ${sec}`;
    }

    renderIvTable();
    renderNotes(normal, fat, info, mode);
    renderLogs();
  }


  function renderNotes(normal, fat, info, mode) {
    if (!els.noteList) return;
    if (!normal || !fat) {
      els.noteList.innerHTML = '<li class="info">等待有效價格、目標價與 IV 後產生最後筆記。</li>';
      return;
    }

    const dist = Math.abs(state.strike - state.spot) / state.spot;
    const notes = [];
    const add = (cls, text) => notes.push(`<li class="${cls}">${text}</li>`);

    if (fat.success >= 0.90) add('good', `肥尾成功率 ${fmtPct(fat.success)}，目前屬於相對保守區間。`);
    else if (fat.success >= 0.80) add('warn', `肥尾成功率 ${fmtPct(fat.success)}，已進入需控倉區間。`);
    else if (fat.success >= 0.70) add('warn', `肥尾成功率 ${fmtPct(fat.success)}，偏進取；若本金較大，建議拉開目標價。`);
    else add('danger', `肥尾成功率僅 ${fmtPct(fat.success)}，被執行風險偏高，不適合重倉追利息。`);

    if (dist < 0.015) add('danger', `目標價距離現價只有 ${(dist*100).toFixed(2)}%，價格太貼近，短線插針就可能被執行。`);
    else if (dist < 0.035) add('warn', `目標價距離現價 ${(dist*100).toFixed(2)}%，屬於中等距離，需留意短線波動。`);
    else add('good', `目標價距離現價 ${(dist*100).toFixed(2)}%，距離相對較開。`);

    if (state.iv >= 0.80) add('danger', `IV ${(state.iv*100).toFixed(2)}% 偏高，代表市場正在定價大波動，肥尾結果要優先看。`);
    else if (state.iv >= 0.55) add('warn', `IV ${(state.iv*100).toFixed(2)}% 不低，雙幣利息可能漂亮，但被執行機率也會被放大。`);
    else add('info', `IV ${(state.iv*100).toFixed(2)}% 屬於較平穩區間，但仍需確認是否有重大新聞。`);

    if (info.hours <= 8) add('warn', `距離 ${info.label} 16:00 結算只剩約 ${info.hours.toFixed(1)} 小時，短時間內價格波動影響會變大。`);
    else if (info.hours <= 24) add('info', `距離結算約 ${info.hours.toFixed(1)} 小時，仍需留意結算前急拉或急跌。`);
    else add('info', `距離結算約 ${info.hours.toFixed(1)} 小時，時間越長，外部事件變數越多。`);

    add('info', '本工具未讀取即時新聞；若遇到 CPI、Fed、戰爭、交易所事件或 ETF 重大消息，請額外手動確認。');

    els.noteList.innerHTML = notes.slice(0, 5).join('');
    if (els.noteBadge) els.noteBadge.textContent = `${mode}提醒 × ${notes.length}`;
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

  function setCoin(coin) {
    state.coin = coin;
    const d = fallback[coin];
    state.spot = Number(localStorage.getItem(`${coin}Spot`)) || d.spot;
    state.strike = Number(localStorage.getItem(`${coin}Strike`)) || d.strike;
    state.iv = Number(localStorage.getItem(`${coin}Iv`)) || d.iv;
    state.source = "預設 / 快取值";
    render();
    syncMarket(false);
  }

  function saveLocal() {
    localStorage.setItem(`${state.coin}Spot`, state.spot);
    localStorage.setItem(`${state.coin}Strike`, state.strike);
    localStorage.setItem(`${state.coin}Iv`, state.iv);
  }

  function updateOffsetDays(v) {
    state.offsetDays = normalizeOffsetDays(v);
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
    els.syncBtn.textContent = "同步中";
    render();

    const [spotR, ivR] = await Promise.all([
      settle(getBinanceSpot(coin), 2300, "spot"),
      settle(getDeribitDvol(coin), 2600, "iv")
    ]);

    const logs = [];
    if (state.coin === coin) {
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
    els.syncBtn.textContent = "同步";
    render();
  }

  function bind() {
    els.btcBtn.addEventListener("click", () => setCoin("BTC"));
    els.ethBtn.addEventListener("click", () => setCoin("ETH"));
    els.syncBtn.addEventListener("click", () => syncMarket(true));

    els.spotInput.addEventListener("input", () => {
      const v = Number(els.spotInput.value);
      if (v > 0) { state.spot = v; saveLocal(); render(); }
    });

    els.strikeInput.addEventListener("input", () => {
      const v = Number(els.strikeInput.value);
      if (v > 0) { state.strike = v; saveLocal(); render(); }
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
