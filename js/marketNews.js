const marketEventKeywords = [
  "CPI", "FOMC", "PCE", "非農", "NFP", "BTC ETF", "ETH ETF", "ETF", "聯準會", "Fed", "地緣", "戰爭"
];

const marketNewsFallback = [
  { title:"FOMC 與聯準會官員談話仍是短線風險焦點", source:"Market Watch", hoursAgo:6 },
  { title:"BTC ETF 資金流向影響加密市場風險偏好", source:"Crypto Desk", hoursAgo:9 },
  { title:"ETH ETF 與鏈上活動帶動波動率預期變化", source:"Crypto Desk", hoursAgo:14 },
  { title:"市場等待 CPI / PCE 數據確認通膨降溫速度", source:"Macro Brief", hoursAgo:20 },
  { title:"非農就業數據可能牽動利率預期與美元走勢", source:"Macro Brief", hoursAgo:26 },
  { title:"地緣政治消息使避險需求與風險資產波動升高", source:"Global News", hoursAgo:31 },
  { title:"BTC 高波動期間雙幣策略需留意被執行風險", source:"Risk Note", hoursAgo:38 },
  { title:"ETH 短天期 IV 對事件消息反應較敏感", source:"Risk Note", hoursAgo:44 }
];

function getFallbackMarketNews() {
  const now = Date.now();
  return marketNewsFallback.map((item, index) => ({
    id: index + 1,
    title: item.title,
    source: item.source,
    publishedAt: new Date(now - item.hoursAgo * 36e5)
  }));
}

function isImportantEventTitle(title) {
  return marketEventKeywords.some(keyword => title.toLowerCase().includes(keyword.toLowerCase()));
}

function deriveMarketEvents(items) {
  return items
    .filter(item => isImportantEventTitle(item.title))
    .slice(0, 3)
    .map(item => ({
      title: item.title,
      source: item.source,
      publishedAt: item.publishedAt
    }));
}

async function loadMarketNews() {
  state.marketNews.loading = true;
  state.marketNews.error = false;
  try {
    const items = getFallbackMarketNews();
    state.marketNews.items = items;
    state.marketNews.events = deriveMarketEvents(items);
    state.marketNews.lastUpdated = new Date();
  } catch {
    state.marketNews.items = [];
    state.marketNews.events = [];
    state.marketNews.error = true;
    state.marketNews.lastUpdated = null;
  } finally {
    state.marketNews.loading = false;
  }
}
