function buildLastNotes(normal, fat, info) {
  if (!normal || !fat) return [{ type:"warn", text:"資料不足，請確認現價、目標價、IV 與結算日。" }];
  const dist = Math.abs(state.strike - state.spot) / state.spot;
  const direction = normal.isHighSell ? "高賣" : "低買";
  const notes = [];
  if (dist < 0.015) notes.push({ type:"danger", text:`目標價距離現價僅 ${(dist*100).toFixed(2)}%，${direction}被執行風險偏高。` });
  else if (dist < 0.035) notes.push({ type:"risk", text:`目標價距離現價 ${(dist*100).toFixed(2)}%，仍需留意短線波動。` });
  else notes.push({ type:"good", text:`目標價距離現價 ${(dist*100).toFixed(2)}%，距離相對有緩衝。` });
  if (fat.success < 0.70) notes.push({ type:"danger", text:`肥尾成功率 ${fmtPct(fat.success)}，偏向高風險，不適合重倉追利息。` });
  else if (fat.success < 0.80) notes.push({ type:"risk", text:`肥尾成功率 ${fmtPct(fat.success)}，屬橘燈區，需控制部位或拉開目標價。` });
  else if (fat.success < 0.90) notes.push({ type:"warn", text:`肥尾成功率 ${fmtPct(fat.success)}，屬黃燈區，仍需留意被執行風險。` });
  else notes.push({ type:"good", text:`肥尾成功率 ${fmtPct(fat.success)}，目前屬相對安全區。` });
  if (state.iv >= 0.75) notes.push({ type:"danger", text:`IV ${(state.iv*100).toFixed(2)}% 偏高，市場預期波動大。` });
  else if (state.iv >= 0.55) notes.push({ type:"risk", text:`IV ${(state.iv*100).toFixed(2)}% 偏高，肥尾測試比正常成功率更值得參考。` });
  else notes.push({ type:"good", text:`IV ${(state.iv*100).toFixed(2)}%，目前波動率沒有特別誇張。` });
  if (state.ivFallback) {
    notes.push({
      type: state.ivFallback.stale ? "warn" : "risk",
      text: state.ivFallback.stale
        ? "歷史資料過舊：目前 IV 使用歷史紀錄備援資料，非即時市場波動率，結果僅供參考。"
        : "目前 IV 使用歷史紀錄備援資料，非即時市場波動率，結果僅供參考。"
    });
  }
  if (info.hours < 8) notes.push({ type:"warn", text:`距離結算約 ${info.hours.toFixed(1)} 小時，短時間插針影響會更直接。` });
  else notes.push({ type:"good", text:`距離結算約 ${info.hours.toFixed(1)} 小時，仍有時間緩衝。` });
  const events = state.marketNews?.events || [];
  if (events.length) {
    notes.push({ type:"warn", text:`近期偵測到 ${events[0].title} 等事件訊號，短期波動風險可能高於模型估計值。` });
  } else {
    notes.push({ type:"good", text:"目前未偵測到重大事件，模型結果可信度較高。" });
  }
  notes.push(buildSummaryNote(dist, normal.success, fat.success, state.iv, info.hours));
  return notes;
}

function buildSummaryNote(dist, normalSuccess, fatSuccess, iv, hours) {
  const bands = [
    distanceRiskBand(dist),
    successRiskBand(normalSuccess, "正常成功率"),
    fatSuccessRiskBand(fatSuccess),
    ivRiskBand(iv),
    timeRiskBand(hours)
  ];
  const score = Math.max(...bands.map(b => b.score));
  const level = summaryRiskLevel(score);
  const type = summaryRiskType(score);
  const reasons = bands
    .filter(b => b.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(b => b.text);
  const detail = reasons.length ? reasons.join("，") : "目標價距離、成功率與波動條件目前相對平衡";
  return { type, text:`綜合結論：目前${level}。${detail}。` };
}

function distanceRiskBand(dist) {
  if (dist < 0.03) return { score:4, text:"目標價距離很近" };
  if (dist < 0.05) return { score:3, text:"目標價距離偏近" };
  if (dist < 0.08) return { score:1, text:"目標價距離尚可" };
  return { score:0, text:"目標價距離充足" };
}

function successRiskBand(success, label) {
  if (success < 0.60) return { score:4, text:`${label}偏低` };
  if (success < 0.70) return { score:2, text:`${label}落在中等區間` };
  if (success < 0.80) return { score:1, text:`${label}尚可` };
  return { score:0, text:`${label}偏高` };
}

function fatSuccessRiskBand(success) {
  if (success < 0.55) return { score:4, text:"肥尾風險偏高" };
  if (success < 0.65) return { score:3, text:"肥尾風險升高" };
  if (success < 0.75) return { score:1, text:"肥尾成功率仍可接受" };
  return { score:0, text:"肥尾下仍穩定" };
}

function ivRiskBand(iv) {
  if (iv > 0.80) return { score:3, text:"IV很高" };
  if (iv >= 0.60) return { score:2, text:"IV偏高" };
  if (iv >= 0.40) return { score:1, text:"IV中等" };
  return { score:0, text:"IV偏低" };
}

function timeRiskBand(hours) {
  const days = Math.max(0, hours / 24);
  if (days <= 1) return { score:3, text:"短天期需留意價格波動" };
  if (days <= 3) return { score:2, text:"短期風險明顯" };
  if (days <= 7) return { score:1, text:"時間風險中等" };
  return { score:1, text:"需關注波動累積" };
}

function summaryRiskLevel(score) {
  if (score >= 4) return "風險偏高";
  if (score === 3) return "風險中等偏高";
  if (score === 2) return "風險中等";
  if (score === 1) return "風險中等偏低";
  return "風險偏低";
}

function summaryRiskType(score) {
  if (score >= 4) return "danger";
  if (score === 3) return "risk";
  if (score === 2) return "warn";
  return "good";
}
