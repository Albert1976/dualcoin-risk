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

function isContextAdjustmentEligible(item) {
  const impact = normalizeEventImpact(item?.eventImpact || item?.impact);
  const bias = normalizeEventBias(item?.eventBias || item?.bias);
  return (
    item?.contextAdjustmentEnabled === true &&
    item?.contextAdjustmentEligible === true &&
    (impact === "high" || impact === "extreme") &&
    (bias === "bullish" || bias === "bearish")
  );
}

function eventRelevanceScore(item) {
  const aliases = Array.isArray(item?.eventAliases) ? item.eventAliases : [];
  const text = [item?.title, item?.summaryTitle, item?.subject, ...aliases].join(" ").toLowerCase();
  return /(btc|bitcoin|eth|ethereum|macro|fed|cpi|nfp|fomc|etf|sec)/i.test(text) ? 1 : 0;
}

function eventTimeValue(item) {
  if (Number.isFinite(item?.daysLeft)) return item.daysLeft;
  const publishedAt = item?.publishedAt || item?.time;
  const t = publishedAt ? new Date(publishedAt).getTime() : NaN;
  return Number.isFinite(t) ? Math.abs(Date.now() - t) / 864e5 : Number.POSITIVE_INFINITY;
}

function selectContextEvent(events = [], news = []) {
  const impactRank = { low: 0, medium: 1, high: 2, extreme: 3 };
  return events.concat(news)
    .filter(isContextAdjustmentEligible)
    .sort((a, b) => (
      impactRank[normalizeEventImpact(b.eventImpact || b.impact)] - impactRank[normalizeEventImpact(a.eventImpact || a.impact)] ||
      Number(b.contextAdjustmentEnabled === true) - Number(a.contextAdjustmentEnabled === true) ||
      eventRelevanceScore(b) - eventRelevanceScore(a) ||
      eventTimeValue(a) - eventTimeValue(b)
    ))[0] || null;
}

function contextEventLabel(item) {
  if (!item) return "事件";
  const aliases = Array.isArray(item.eventAliases) ? item.eventAliases : [];
  return aliases[0] || item.subject || item.title || "事件";
}

function currentContextInput(mode) {
  const events = state.marketNews?.events || [];
  const news = state.marketNews?.items || [];
  const selectedEvent = selectContextEvent(events, news);
  return {
    mode,
    selectedEvent,
    contextAdjustmentEligible: Boolean(selectedEvent),
    eventBias: selectedEvent ? normalizeEventBias(selectedEvent.eventBias) : "neutral",
    eventImpact: selectedEvent ? normalizeEventImpact(selectedEvent.eventImpact || selectedEvent.impact) : "low",
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
  const relation = input?.contextAdjustmentEligible ? eventDirectionRelation(input?.mode, eventBias) : "neutral";
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
  const eligible = input?.contextAdjustmentEligible === true;
  const relation = eligible ? eventDirectionRelation(input?.mode, eventBias) : "neutral";
  const hasMajorEvent = eventImpact === "high" || eventImpact === "extreme";
  const holidayLowVol = (stateName === "weekend" || stateName === "holiday") && !hasMajorEvent;
  const reasons = [];
  let delta = 0;

  if (relation === "adverse") {
    const value = cfg.unfavorable[eventImpact] ?? 0;
    delta += value;
    reasons.push({ type: "event", text: `${contextEventLabel(input.selectedEvent)} ${eventBias === "bullish" ? "利多" : "利空"}事件影響：${signedPct(value)}`, delta: value });
  } else if (relation === "favorable") {
    const value = Math.min(cfg.favorable[eventImpact] ?? 0, cfg.favorableBonusMax);
    delta += value;
    reasons.push({ type: "event", text: `${contextEventLabel(input.selectedEvent)} ${eventBias === "bullish" ? "利多" : "利空"}事件影響：${signedPct(value)}`, delta: value });
  } else if (!eligible) {
    reasons.push({ type: "event", text: "未偵測重大事件", delta: 0 });
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
    contextAdjustmentEligible: eligible,
    calibrationPending: cfg.calibrationPending === true
  };
}

function contextAdjustmentLabel(input, result) {
  const bias = normalizeEventBias(input?.eventBias);
  if (result?.holidayLowVol) return "情境調整：假日低波動，未偵測重大事件。";
  if (!input?.contextAdjustmentEligible) return "情境調整：未偵測重大事件。";
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
