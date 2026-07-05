const EVENT_BIASES = ["bullish", "bearish", "neutral", "mixed"];
const EVENT_IMPACTS = ["low", "medium", "high", "extreme"];
const CALENDAR_STATES = ["weekday", "weekend", "holiday"];

function normalizeEventBias(value) {
  return EVENT_BIASES.includes(value) ? value : "neutral";
}

function normalizeEventImpact(value) {
  return EVENT_IMPACTS.includes(value) ? value : "low";
}

function normalizeCalendarState(value) {
  return CALENDAR_STATES.includes(value) ? value : "weekday";
}

function tradeModeFromResult(result) {
  return result?.isHighSell ? "sell-high" : "buy-low";
}

function calendarState(date = new Date()) {
  const iso = fmtIsoDate(date);
  if (Array.isArray(CALIBRATION_CONFIG.holidayDates) && CALIBRATION_CONFIG.holidayDates.includes(iso)) return "holiday";
  const day = date.getDay();
  return day === 0 || day === 6 ? "weekend" : "weekday";
}

function inferEventBiasFromText(text) {
  const value = String(text || "").toLowerCase();
  const bullish = [
    "bullish", "rally", "surge", "gain", "gains", "rebound", "breakout",
    "inflow", "inflows", "approval", "rate cut", "easing"
  ].some(keyword => value.includes(keyword));
  const bearish = [
    "bearish", "drop", "drops", "fall", "falls", "slump", "selloff",
    "outflow", "outflows", "liquidation", "liquidations", "downside",
    "rate hike", "hawkish", "inflation"
  ].some(keyword => value.includes(keyword));
  if (bullish && bearish) return "mixed";
  if (bullish) return "bullish";
  if (bearish) return "bearish";
  return "neutral";
}

function strongestEventImpact(events = [], news = []) {
  const rank = { low: 0, medium: 1, high: 2, extreme: 3 };
  const enabledEvents = events.filter(item => item.contextAdjustmentEnabled !== false);
  const enabledNews = news.filter(item => item.contextAdjustmentEnabled !== false);
  const impacts = enabledEvents.map(item => normalizeEventImpact(item.eventImpact || item.impact));
  impacts.push(enabledNews.length ? "medium" : "low");
  return impacts.sort((a, b) => rank[b] - rank[a])[0] || "low";
}

function combineEventBias(events = [], news = []) {
  const biases = []
    .concat(events.filter(item => item.contextAdjustmentEnabled !== false).map(item => normalizeEventBias(item.eventBias || item.bias || inferEventBiasFromText(item.title))))
    .concat(news.filter(item => item.contextAdjustmentEnabled !== false).slice(0, 5).map(item => normalizeEventBias(item.eventBias || item.bias || inferEventBiasFromText(`${item.title || ""} ${item.summaryTitle || ""}`))))
    .filter(item => item !== "neutral");
  if (!biases.length) return "neutral";
  const hasBullish = biases.includes("bullish");
  const hasBearish = biases.includes("bearish");
  if (biases.includes("mixed") || (hasBullish && hasBearish)) return "mixed";
  return hasBullish ? "bullish" : "bearish";
}

function contextEventLabel() {
  const events = (state.marketNews?.events || []).filter(item => item.contextAdjustmentEnabled !== false);
  const news = (state.marketNews?.items || []).filter(item => item.contextAdjustmentEnabled !== false);
  const item = events[0] || news[0] || null;
  if (!item) return "事件";
  const aliases = Array.isArray(item.eventAliases) ? item.eventAliases : [];
  return aliases[0] || item.subject || item.title || "事件";
}

function currentContextInput(mode) {
  const events = state.marketNews?.events || [];
  const news = state.marketNews?.items || [];
  return {
    mode,
    eventBias: combineEventBias(events, news),
    eventImpact: strongestEventImpact(events, news),
    calendarState: calendarState()
  };
}

function eventDirectionRelation(mode, eventBias) {
  const bias = normalizeEventBias(eventBias);
  if (bias === "mixed" || bias === "neutral") return "neutral";
  if (mode === "sell-high") return bias === "bullish" ? "adverse" : "favorable";
  if (mode === "buy-low") return bias === "bearish" ? "adverse" : "favorable";
  return "neutral";
}

function calculateContextMultiplier(input) {
  const cfg = CALIBRATION_CONFIG.contextAdjustment;
  const eventBias = normalizeEventBias(input?.eventBias);
  const eventImpact = normalizeEventImpact(input?.eventImpact);
  const stateName = normalizeCalendarState(input?.calendarState);
  const relation = eventDirectionRelation(input?.mode, eventBias);
  const hasMajorEvent = eventImpact === "high" || eventImpact === "extreme";
  const holidayLowVol = (stateName === "weekend" || stateName === "holiday") && !hasMajorEvent;
  let multiplier = cfg[relation]?.[eventImpact] ?? cfg.neutral[eventImpact] ?? 1;
  if (holidayLowVol) multiplier *= cfg.weekendLowVol;
  multiplier = clamp(multiplier, cfg.minMultiplier, cfg.maxMultiplier);
  return { multiplier, relation, holidayLowVol, calibrationPending: cfg.calibrationPending === true };
}

function signedPct(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function calculateContextSuccessAdjustment(input) {
  const cfg = CALIBRATION_CONFIG.successContextAdjustment;
  const normalSuccessRate = clamp(Number(input?.normalSuccessRate), 0, 1);
  const fatTailSuccessRate = clamp(Number(input?.fatTailSuccessRate), 0, 1);
  const eventBias = normalizeEventBias(input?.eventBias);
  const eventImpact = normalizeEventImpact(input?.eventImpact);
  const stateName = normalizeCalendarState(input?.calendarState);
  const relation = eventDirectionRelation(input?.mode, eventBias);
  const hasMajorEvent = eventImpact === "high" || eventImpact === "extreme";
  const holidayLowVol = (stateName === "weekend" || stateName === "holiday") && !hasMajorEvent;
  const reasons = [];
  let delta = 0;

  if (relation === "adverse") {
    const value = cfg.unfavorable[eventImpact] ?? 0;
    delta += value;
    reasons.push({ type: "event", text: `${contextEventLabel()} ${eventBias === "bullish" ? "利多" : "利空"}事件影響：${signedPct(value)}`, delta: value });
  } else if (relation === "favorable") {
    const value = Math.min(cfg.favorable[eventImpact] ?? 0, cfg.favorableBonusMax);
    delta += value;
    reasons.push({ type: "event", text: `${contextEventLabel()} ${eventBias === "bullish" ? "利多" : "利空"}事件影響：${signedPct(value)}`, delta: value });
  } else if (eventBias === "neutral" || eventBias === "mixed") {
    const value = cfg.neutralMixedPenalty;
    delta += value;
    reasons.push({ type: "event", text: `事件方向不明：${signedPct(value)}`, delta: value });
  }

  if (holidayLowVol) {
    delta += cfg.holidayLowVolBonus;
    reasons.push({ type: "calendar", text: `假日低波動：${signedPct(cfg.holidayLowVolBonus)}`, delta: cfg.holidayLowVolBonus });
  }

  const adjusted = clamp(fatTailSuccessRate + delta / 100, 0, normalSuccessRate);
  return {
    contextAdjustedSuccessRate: adjusted,
    contextAdjustmentDelta: (adjusted - fatTailSuccessRate) * 100,
    contextAdjustmentReasons: reasons,
    calibrationPending: cfg.calibrationPending === true
  };
}

function contextAdjustmentLabel(input, result) {
  const bias = normalizeEventBias(input?.eventBias);
  if (result?.holidayLowVol) return "情境調整：假日低波動，未偵測重大事件。";
  if (result?.relation === "adverse") {
    return input.mode === "sell-high"
      ? "情境調整：利多事件對高賣不利，肥尾風險已上修。"
      : "情境調整：利空事件對低買不利，肥尾風險已上修。";
  }
  if (result?.relation === "favorable") {
    return input.mode === "sell-high"
      ? "情境調整：利空事件對高賣有利，未額外放大上行肥尾。"
      : "情境調整：利多事件對低買有利，未額外放大下行肥尾。";
  }
  if (bias === "mixed" || bias === "neutral") return "情境調整：事件方向不明，維持保守肥尾假設。";
  return "情境調整：維持保守肥尾假設。";
}
