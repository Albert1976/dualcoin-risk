const etfFlowKeywords = [
  "流入", "流出", "淨流入", "淨流出", "inflow", "outflow", "net inflow", "net outflow"
];

const marketNewsMaxAgeHours = 48;

const marketEvents = [
  { title:"CPI", date:"2026-06-25", impact:"high" },
  { title:"PCE", date:"2026-06-26", impact:"medium" },
  { title:"非農", date:"2026-07-03", impact:"medium" },
  { title:"FOMC", date:"2026-07-09", impact:"high" }
];

const marketNewsFallback = [
  { title:"FOMC 與聯準會官員談話仍是短線風險焦點", source:"Market Watch", hoursAgo:6 },
  { title:"BTC ETF 單日淨流入帶動加密市場風險偏好", source:"Crypto Desk", hoursAgo:9 },
  { title:"ETH ETF 一般評論文章不應占用事件版面", source:"Crypto Desk", hoursAgo:14 },
  { title:"市場等待 CPI / PCE 數據確認通膨降溫速度", source:"Macro Brief", hoursAgo:20 },
  { title:"非農就業數據可能牽動利率預期與美元走勢", source:"Macro Brief", hoursAgo:26 },
  { title:"地緣政治消息使避險需求與風險資產波動升高", source:"Global News", hoursAgo:31 },
  { title:"BTC 高波動期間雙幣策略需留意被執行風險", source:"Risk Note", hoursAgo:38 },
  { title:"ETH ETF net outflow 使短線情緒轉弱", source:"Risk Note", hoursAgo:44 }
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

function isEtfTitle(title) {
  return title.toLowerCase().includes("etf");
}

function hasEtfFlowDirection(title) {
  return etfFlowKeywords.some(keyword => title.toLowerCase().includes(keyword.toLowerCase()));
}

function shouldShowMarketNews(item) {
  return !isEtfTitle(item.title) || hasEtfFlowDirection(item.title);
}

function marketNewsAgeHours(item, now = Date.now()) {
  const publishedAt = item?.publishedAt ? new Date(item.publishedAt).getTime() : NaN;
  if (!Number.isFinite(publishedAt)) return Infinity;
  return Math.max(0, (now - publishedAt) / 36e5);
}

function isFreshMarketNews(item, now = Date.now()) {
  return marketNewsAgeHours(item, now) <= marketNewsMaxAgeHours;
}

function parseMarketEventDate(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function todayStart(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function marketEventDaysLeft(dateText, now = new Date()) {
  const msPerDay = 864e5;
  return Math.ceil((parseMarketEventDate(dateText) - todayStart(now)) / msPerDay);
}

function getUpcomingMarketEvents(now = new Date()) {
  return marketEvents
    .map(item => ({
      ...item,
      daysLeft: marketEventDaysLeft(item.date, now)
    }))
    .filter(item => item.daysLeft >= 0)
    .sort((a, b) => parseMarketEventDate(a.date) - parseMarketEventDate(b.date));
}

async function loadMarketNews() {
  state.marketNews.loading = true;
  state.marketNews.error = false;
  try {
    const visibleNews = getFallbackMarketNews().filter(shouldShowMarketNews);
    const freshNews = visibleNews.filter(item => isFreshMarketNews(item));
    state.marketNews.items = freshNews;
    state.marketNews.events = getUpcomingMarketEvents();
    state.marketNews.lastUpdated = new Date();
    state.marketNews.loaded = true;
  } catch {
    state.marketNews.items = [];
    state.marketNews.events = [];
    state.marketNews.error = true;
    state.marketNews.lastUpdated = null;
    state.marketNews.loaded = true;
  } finally {
    state.marketNews.loading = false;
  }
}
