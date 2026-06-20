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
