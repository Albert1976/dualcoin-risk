function buildLastNotes(normal, fat, info) {
  if (!normal || !fat) return [{ type:"warn", text:"資料不足，請確認現價、目標價、IV 與結算日。" }];

  const dist = Math.abs(state.strike - state.spot) / state.spot;
  const iv = Number(state.iv) || 0;
  const daysLeft = Math.max(0, (info?.hours || 0) / 24);
  const mode = normal.isHighSell ? "高賣" : "低買";

  const distBand = distanceBand(dist);
  const normalBand = normalSuccessBand(normal.success);
  const fatBand = fatSuccessBand(fat.success);
  const ivBand = ivRiskBand(iv);
  const timeBand = timeRiskBand(daysLeft);
  const level = lastNoteRiskLevel(distBand, normalBand, fatBand, ivBand, timeBand);
  const type = lastNoteType(level);

  return [
    { type, text:`風險等級：${level}` },
    { type, text:`重點原因：${buildLastNoteReason(distBand, normalBand, fatBand, ivBand, timeBand)}` },
    { type, text:`操作提醒：${buildLastNoteReminder(level, mode, fatBand, ivBand, timeBand)}` }
  ];
}

function distanceBand(dist) {
  if (dist >= 0.08) return { score:0, text:"目標價距離充足" };
  if (dist >= 0.05) return { score:1, text:"目標價距離尚可" };
  if (dist >= 0.03) return { score:2, text:"目標價距離偏近" };
  return { score:4, text:"目標價距離很近" };
}

function normalSuccessBand(success) {
  if (success >= 0.80) return { score:0, text:"正常成功率高" };
  if (success >= 0.70) return { score:1, text:"正常成功率尚可" };
  if (success >= 0.60) return { score:2, text:"正常情境風險中等" };
  return { score:4, text:"正常成功率偏低" };
}

function fatSuccessBand(success) {
  if (success >= 0.75) return { score:0, text:"肥尾下仍穩定" };
  if (success >= 0.65) return { score:1, text:"肥尾下可接受" };
  if (success >= 0.55) return { score:3, text:"肥尾風險升高" };
  return { score:4, text:"肥尾風險偏高" };
}

function ivRiskBand(iv) {
  if (iv < 0.40) return { score:0, text:"IV偏低" };
  if (iv < 0.60) return { score:1, text:"IV中等" };
  if (iv <= 0.80) return { score:2, text:"IV偏高" };
  return { score:3, text:"IV很高" };
}

function timeRiskBand(daysLeft) {
  if (daysLeft <= 1) return { score:3, text:"短天期風險較大" };
  if (daysLeft <= 3) return { score:2, text:"短期風險明顯" };
  if (daysLeft <= 7) return { score:1, text:"時間風險中等" };
  return { score:1, text:"需關注波動累積" };
}

function lastNoteRiskLevel(...bands) {
  const score = Math.max(...bands.map(b => b.score));
  if (score >= 4) return "風險偏高";
  if (score === 3) return "風險中等偏高";
  if (score === 2) return "風險中等";
  if (score === 1) return "風險中等偏低";
  return "風險偏低";
}

function lastNoteType(level) {
  if (level === "風險偏高") return "danger";
  if (level === "風險中等偏高") return "risk";
  if (level === "風險中等") return "warn";
  return "good";
}

function buildLastNoteReason(distBand, normalBand, fatBand, ivBand, timeBand) {
  const bands = [distBand, fatBand, normalBand, ivBand, timeBand]
    .filter(b => b.score > 0)
    .sort((a, b) => b.score - a.score);
  const reasons = bands.length ? bands.slice(0, 3).map(b => b.text) : [distBand.text, fatBand.text];
  return `${reasons.join("，")}。`;
}

function buildLastNoteReminder(level, mode, fatBand, ivBand, timeBand) {
  if (level === "風險偏高") {
    return `${mode}轉幣風險偏高，建議保守評估，不要只看APR。`;
  }
  if (level === "風險中等偏高") {
    return `APR具吸引力時仍要先看轉幣風險，建議保留更大安全邊際。`;
  }
  if (level === "風險中等") {
    return `${mode}可先確認部位大小，避免短線波動讓結果超出預期。`;
  }
  if (fatBand.score > 0 || ivBand.score > 1 || timeBand.score > 1) {
    return `條件尚可，但仍需留意肥尾與短期波動。`;
  }
  return `目前風險相對較低，仍應以可承受轉幣結果為前提。`;
}
