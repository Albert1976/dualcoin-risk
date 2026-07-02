function buildLastNotes(normal, fat, info) {
  if (!normal || !fat) return [{ type:"warn", text:"綜合結論：目前資料不足，請先同步資料。" }];

  const dist = Math.abs(state.strike - state.spot) / state.spot;
  const events = state.marketNews?.events || [];
  const notes = [
    successDecisionNote(normal, fat),
    distanceDecisionNote(dist, normal),
    ivDecisionNote()
  ];
  const sourceNote = ivSourceNote();
  if (sourceNote) {
    notes.push(sourceNote);
  } else {
    notes.push(timeDecisionNote(info.hours));
  }
  if (events.length) {
    notes.push({ type:"warn", text:`偵測到 ${events[0].title} 等事件風險，短期波動可能高於模型估算。` });
  } else if (sourceNote) {
    notes.push(timeDecisionNote(info.hours));
  }

  notes.push(buildSummaryNote(dist, normal.success, fat.success, state.iv, info.hours, events.length > 0));
  return notes.slice(0, 4).concat(notes[notes.length - 1]);
}

function successDecisionNote(normal, fat) {
  const drag = normal.success - fat.success;
  if (normal.success >= 0.90 && fat.success >= 0.80) {
    return { type:"good", text:`正常成功率 ${fmtPct(normal.success)} 維持高檔，肥尾情境仍有 ${fmtPct(fat.success)}。` };
  }
  if (drag >= 0.20 || fat.success < 0.65) {
    return { type:"risk", text:`正常成功率 ${fmtPct(normal.success)}，但肥尾成功率降至 ${fmtPct(fat.success)}，極端波動拖累明顯。` };
  }
  if (fat.success < 0.80) {
    return { type:"warn", text:`肥尾成功率 ${fmtPct(fat.success)} 尚可但不寬裕，部位與目標價需保守看待。` };
  }
  return { type:"good", text:"正常與肥尾成功率差距有限，目前成功率結構相對穩定。" };
}

function distanceDecisionNote(dist, normal) {
  const mode = normal.isHighSell ? "高賣" : "低買";
  if (dist < 0.015) return { type:"danger", text:`${mode}目標價距離現價僅 ${(dist * 100).toFixed(2)}%，被執行風險偏高。` };
  if (dist < 0.035) return { type:"risk", text:`${mode}目標價距離現價 ${(dist * 100).toFixed(2)}%，短線波動就可能碰到目標。` };
  return { type:"good", text:`目標價距離現價 ${(dist * 100).toFixed(2)}%，目前仍有一定緩衝。` };
}

function ivDecisionNote() {
  if (state.iv >= 0.75) return { type:"danger", text:`IV ${(state.iv * 100).toFixed(2)}% 偏高，市場波動預期會放大被執行風險。` };
  if (state.iv >= 0.55) return { type:"risk", text:`IV ${(state.iv * 100).toFixed(2)}% 偏高，肥尾成功率比正常成功率更值得參考。` };
  if (state.iv < 0.35) return { type:"warn", text:`IV ${(state.iv * 100).toFixed(2)}% 偏低，若波動突然回升，成功率可能被高估。` };
  return { type:"good", text:`IV ${(state.iv * 100).toFixed(2)}% 屬中性區間，波動假設暫時沒有明顯偏離。` };
}

function ivSourceNote() {
  if (state.dataStatus === "iv_fallback") return { type:"risk", text:"IV 使用歷史資料，非即時資料，成功率需降低信任度。" };
  if (state.dataStatus === "stale_fallback") return { type:"danger", text:"歷史 IV 資料過舊，成功率可信度下降。" };
  if (state.dataStatus === "default_iv" || state.dataStatus === "fallback") return { type:"danger", text:"目前使用系統預設 IV，結果僅供粗略估算。" };
  if (state.dataStatus === "cache") return { type:"warn", text:"目前使用快取市場資料，請留意 IV 可能不是最新狀態。" };
  return null;
}

function timeDecisionNote(hours) {
  if (hours < 8) return { type:"warn", text:`距離結算約 ${hours.toFixed(1)} 小時，時間短但插針影響會更直接。` };
  if (hours < 24) return { type:"warn", text:`距離結算約 ${hours.toFixed(1)} 小時，短期價格跳動仍會主導結果。` };
  return { type:"good", text:`距離結算約 ${hours.toFixed(1)} 小時，仍有時間緩衝可觀察市場變化。` };
}

function buildSummaryNote(dist, normalSuccess, fatSuccess, iv, hours, hasEvents) {
  const bands = [
    distanceRiskBand(dist),
    successRiskBand(normalSuccess),
    fatSuccessRiskBand(fatSuccess),
    ivRiskBand(iv),
    timeRiskBand(hours),
    ivSourceRiskBand(),
    hasEvents ? { score:2, text:"重大事件風險存在" } : { score:0, text:"無重大事件風險" }
  ];
  const score = Math.max(...bands.map(b => b.score));
  const level = summaryRiskLevel(score);
  const type = summaryRiskType(score);
  const reasons = bands
    .filter(b => b.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(b => b.text);
  const detail = reasons.length ? reasons.join("，") : "成功率、IV 與目標價距離暫時沒有明顯壓力";
  return { type, text:`綜合結論：目前屬於${level}方案。${detail}。` };
}

function distanceRiskBand(dist) {
  if (dist < 0.015) return { score:4, text:"目標價距離太近" };
  if (dist < 0.035) return { score:3, text:"目標價距離偏近" };
  if (dist < 0.06) return { score:1, text:"目標價距離中性" };
  return { score:0, text:"目標價仍有緩衝" };
}

function successRiskBand(success) {
  if (success < 0.65) return { score:4, text:"正常成功率偏低" };
  if (success < 0.80) return { score:2, text:"正常成功率不寬裕" };
  if (success < 0.90) return { score:1, text:"正常成功率尚可" };
  return { score:0, text:"正常成功率高" };
}

function fatSuccessRiskBand(success) {
  if (success < 0.55) return { score:4, text:"肥尾成功率偏低" };
  if (success < 0.65) return { score:3, text:"肥尾成功率拖累明顯" };
  if (success < 0.80) return { score:2, text:"肥尾成功率不寬裕" };
  return { score:0, text:"肥尾成功率尚可" };
}

function ivRiskBand(iv) {
  if (iv >= 0.75) return { score:3, text:"IV 偏高" };
  if (iv >= 0.55) return { score:2, text:"IV 中性偏高" };
  if (iv < 0.35) return { score:1, text:"IV 偏低" };
  return { score:0, text:"IV 中性" };
}

function ivSourceRiskBand() {
  if (state.dataStatus === "default_iv" || state.dataStatus === "fallback") return { score:4, text:"使用系統預設 IV" };
  if (state.dataStatus === "stale_fallback") return { score:4, text:"歷史 IV 資料過舊" };
  if (state.dataStatus === "iv_fallback") return { score:3, text:"IV 非即時資料" };
  if (state.dataStatus === "cache") return { score:2, text:"使用快取資料" };
  return { score:0, text:"IV 為即時資料" };
}

function timeRiskBand(hours) {
  if (hours < 8) return { score:2, text:"結算時間很短" };
  if (hours < 24) return { score:1, text:"結算時間偏短" };
  return { score:0, text:"結算仍有緩衝" };
}

function summaryRiskLevel(score) {
  if (score >= 4) return "高風險";
  if (score === 3) return "偏積極";
  if (score === 2) return "中性偏積極";
  if (score === 1) return "中性";
  return "偏保守";
}

function summaryRiskType(score) {
  if (score >= 4) return "danger";
  if (score === 3) return "risk";
  if (score === 2) return "warn";
  return "good";
}
