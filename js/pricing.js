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
