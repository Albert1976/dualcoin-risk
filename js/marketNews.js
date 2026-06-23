const etfFlowKeywords = [
  "流入", "流出", "淨流入", "淨流出", "inflow", "outflow", "net inflow", "net outflow"
];

const marketNewsMaxAgeHours = 48;
const marketNewsFetchTimeoutMs = 2200;

const marketNewsFeeds = [
  { source:"Cointelegraph", url:"https://cointelegraph.com/rss" },
  { source:"CoinDesk", url:"https://www.coindesk.com/arc/outboundfeeds/rss/" }
];

const marketEvents = [
  { title:"CPI", impact:"high", sourceUrl:"https://www.bls.gov/schedule/news_release/cpi.htm", parser: parseBlsScheduleDate },
  { title:"PCE", impact:"medium", sourceUrl:"https://www.bea.gov/data/personal-consumption-expenditures-price-index", parser: parseBeaNextReleaseDate },
  { title:"非農", impact:"medium", sourceUrl:"https://www.bls.gov/schedule/news_release/empsit.htm", parser: parseBlsScheduleDate },
  { title:"FOMC", impact:"high", sourceUrl:"https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", parser: parseFomcMeetingDate }
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
    publishedAt: new Date(now - item.hoursAgo * 36e5),
    url: item.url
  }));
}

function isValidNewsUrl(url) {
  if (typeof url !== "string" || !url.trim()) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function proxiedNewsUrl(url) {
  return `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
}

function rssJsonUrl(url) {
  return `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
}

function hasRequiredMarketNewsFields(item) {
  return Boolean(
    item?.title &&
    item?.source &&
    (item.publishedAt || item.time) &&
    isValidNewsUrl(item.url)
  );
}

function isEtfTitle(title) {
  return title.toLowerCase().includes("etf");
}

function hasEtfFlowDirection(title) {
  const lowerTitle = title.toLowerCase();
  return lowerTitle.includes("flow") || etfFlowKeywords.some(keyword => lowerTitle.includes(keyword.toLowerCase()));
}

function shouldShowMarketNews(item) {
  if (!hasRequiredMarketNewsFields(item)) return false;
  return !isEtfTitle(item.title) || hasEtfFlowDirection(item.title);
}

function marketNewsAgeHours(item, now = Date.now()) {
  const publishedAt = item?.publishedAt || item?.time;
  const publishedTime = publishedAt ? new Date(publishedAt).getTime() : NaN;
  if (!Number.isFinite(publishedTime)) return Infinity;
  return Math.max(0, (now - publishedTime) / 36e5);
}

function isFreshMarketNews(item, now = Date.now()) {
  return marketNewsAgeHours(item, now) <= marketNewsMaxAgeHours;
}

function newsItemKey(item) {
  return String(item.url || item.title || "").trim().toLowerCase();
}

function uniqueMarketNews(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = newsItemKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseFeedDate(text) {
  const date = text ? new Date(text) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function xmlText(node, selectors) {
  for (const selector of selectors) {
    const value = node.querySelector(selector)?.textContent?.trim();
    if (value) return value;
  }
  return "";
}

function xmlLink(node) {
  const rssLink = node.querySelector("link")?.textContent?.trim();
  if (rssLink) return rssLink;
  const atomLink = node.querySelector("link[href]")?.getAttribute("href")?.trim();
  return atomLink || "";
}

function parseMarketNewsFeed(xml, feed) {
  if (typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const nodes = [...doc.querySelectorAll("item, entry")];
  return nodes.map((node, index) => ({
    id: `${feed.source}-${index}`,
    title: xmlText(node, ["title"]),
    source: feed.source,
    publishedAt: parseFeedDate(xmlText(node, ["pubDate", "published", "updated", "dc\\:date"])),
    url: xmlLink(node)
  }));
}

function parseMarketNewsJson(text, feed) {
  try {
    const data = JSON.parse(text);
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map((item, index) => ({
      id: `${feed.source}-json-${index}`,
      title: item.title || "",
      source: feed.source,
      publishedAt: parseFeedDate(item.pubDate || item.published || item.updated),
      url: item.link || item.guid || ""
    }));
  } catch {
    return [];
  }
}

function localizeMarketNewsTitle(title) {
  const replacements = [
    [/bitcoin price has limited downside, likely near bottom, contrarian indicator suggests/gi, "比特幣價格下跌空間有限，反向指標顯示可能接近底部"],
    [/ripple gains preliminary mica license ahead of july 1 eu deadline/gi, "Ripple 初步取得 MiCA 牌照，趕在 7 月 1 日歐盟期限前"],
    [/preliminary mica license/gi, "初步 MiCA 牌照"],
    [/ahead of july 1 eu deadline/gi, "趕在 7 月 1 日歐盟期限前"],
    [/eu deadline/gi, "歐盟期限"],
    [/license/gi, "牌照"],
    [/preliminary/gi, "初步"],
    [/ether price/gi, "以太坊價格"],
    [/ethereum price/gi, "以太坊價格"],
    [/bitcoin price/gi, "比特幣價格"],
    [/crypto market/gi, "加密市場"],
    [/contrarian indicator/gi, "反向指標"],
    [/limited downside/gi, "下跌空間有限"],
    [/near bottom/gi, "接近底部"],
    [/rate cut expectations/gi, "降息預期"],
    [/spot bitcoin etf/gi, "比特幣現貨 ETF"],
    [/spot ether etf/gi, "以太坊現貨 ETF"],
    [/spot ethereum etf/gi, "以太坊現貨 ETF"],
    [/net inflow/gi, "淨流入"],
    [/net inflows/gi, "淨流入"],
    [/net outflow/gi, "淨流出"],
    [/net outflows/gi, "淨流出"],
    [/open interest/gi, "未平倉量"],
    [/bitcoin/gi, "比特幣"],
    [/\bbtc\b/gi, "BTC"],
    [/ethereum/gi, "以太坊"],
    [/\bether\b/gi, "以太坊"],
    [/\beth\b/gi, "ETH"],
    [/crypto/gi, "加密市場"],
    [/cryptocurrency/gi, "加密貨幣"],
    [/market/gi, "市場"],
    [/price/gi, "價格"],
    [/prices/gi, "價格"],
    [/trader/gi, "交易員"],
    [/traders/gi, "交易員"],
    [/investor/gi, "投資人"],
    [/investors/gi, "投資人"],
    [/analyst/gi, "分析師"],
    [/analysts/gi, "分析師"],
    [/indicator/gi, "指標"],
    [/suggests/gi, "顯示"],
    [/signals/gi, "釋出訊號"],
    [/likely/gi, "可能"],
    [/could/gi, "可能"],
    [/may/gi, "可能"],
    [/has/gi, ""],
    [/says/gi, "表示"],
    [/said/gi, "表示"],
    [/according to/gi, "根據"],
    [/contrarian/gi, "反向"],
    [/rally/gi, "反彈"],
    [/surge/gi, "急漲"],
    [/jumps/gi, "跳升"],
    [/rises/gi, "上漲"],
    [/gains/gi, "上漲"],
    [/falls/gi, "下跌"],
    [/drops/gi, "下跌"],
    [/slips/gi, "走低"],
    [/plunges/gi, "重挫"],
    [/volatility/gi, "波動"],
    [/risk/gi, "風險"],
    [/record/gi, "創紀錄"],
    [/high/gi, "高點"],
    [/low/gi, "低點"],
    [/fed/gi, "聯準會"],
    [/rate cut/gi, "降息"],
    [/rate cuts/gi, "降息"],
    [/inflation/gi, "通膨"],
    [/dollar/gi, "美元"],
    [/stock/gi, "股票"],
    [/stocks/gi, "股票"],
    [/etf/gi, "ETF"],
    [/inflow/gi, "流入"],
    [/inflows/gi, "流入"],
    [/outflow/gi, "流出"],
    [/outflows/gi, "流出"],
    [/net flow/gi, "淨流量"],
    [/spot/gi, "現貨"],
    [/options/gi, "選擇權"],
    [/futures/gi, "期貨"],
    [/open interest/gi, "未平倉量"],
    [/stablecoin/gi, "穩定幣"],
    [/token/gi, "代幣"],
    [/tokens/gi, "代幣"],
    [/exchange/gi, "交易所"],
    [/sec/gi, "SEC"],
    [/treasury/gi, "美債"],
    [/yield/gi, "殖利率"]
  ];
  return replacements.reduce((text, [pattern, value]) => text.replace(pattern, value), title || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([，。；：、])/g, "$1")
    .replace(/([（「『])\s+/g, "$1")
    .trim();
}

function parseMarketNewsPayload(text, feed) {
  return parseMarketNewsJson(text, feed).concat(parseMarketNewsFeed(text, feed))
    .map(item => ({ ...item, titleZh: localizeMarketNewsTitle(item.title) }));
}

async function fetchMarketNewsFeed(feed) {
  const attempts = [rssJsonUrl(feed.url), proxiedNewsUrl(feed.url), feed.url].map(async url => {
    try {
      const text = await fetchText(url, marketNewsFetchTimeoutMs);
      const items = parseMarketNewsPayload(text, feed);
      if (items.length) return items;
    } catch {
      // Try the next candidate.
    }
    throw new Error("No RSS items");
  });
  try {
    return await Promise.any(attempts);
  } catch {
    return [];
  }
}

async function getLiveMarketNews() {
  const batches = await Promise.all(marketNewsFeeds.map(fetchMarketNewsFeed));
  return uniqueMarketNews(batches.flat())
    .filter(shouldShowMarketNews)
    .filter(item => isFreshMarketNews(item))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

function plainText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseUsDate(monthText, dayText, yearText) {
  const months = {
    jan:0, january:0, feb:1, february:1, mar:2, march:2, apr:3, april:3,
    may:4, jun:5, june:5, jul:6, july:6, aug:7, august:7, sep:8,
    sept:8, september:8, oct:9, october:9, nov:10, november:10,
    dec:11, december:11
  };
  const key = monthText.toLowerCase().replace(".", "");
  const month = months[key];
  const day = Number(dayText);
  const year = Number(yearText);
  if (!Number.isInteger(month) || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  return new Date(year, month, day);
}

function fmtIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function findNextDate(dates, now = new Date()) {
  const today = todayStart(now).getTime();
  return dates
    .filter(date => date instanceof Date && !Number.isNaN(date.getTime()) && date.getTime() >= today)
    .sort((a, b) => a - b)[0] || null;
}

function parseBlsScheduleDate(html, now = new Date()) {
  const text = plainText(html);
  const dates = [];
  const re = /\b(Jan\.?|January|Feb\.?|February|Mar\.?|March|Apr\.?|April|May|Jun\.?|June|Jul\.?|July|Aug\.?|August|Sep\.?|Sept\.?|September|Oct\.?|October|Nov\.?|November|Dec\.?|December)\s+(\d{1,2}),\s+(\d{4})\b/gi;
  let match;
  while ((match = re.exec(text))) {
    const date = parseUsDate(match[1], match[2], match[3]);
    if (date) dates.push(date);
  }
  return fmtIsoDate(findNextDate(dates, now));
}

function parseBeaNextReleaseDate(html, now = new Date()) {
  const text = plainText(html);
  const match = text.match(/Next release:\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i);
  const date = match ? parseUsDate(match[1], match[2], match[3]) : null;
  if (!date || date < todayStart(now)) return null;
  return fmtIsoDate(date);
}

function parseFomcMeetingDate(html, now = new Date()) {
  const text = plainText(html);
  const currentYear = now.getFullYear();
  const dates = [];
  const sectionRe = /(\d{4})\s+FOMC Meetings([\s\S]*?)(?=\d{4}\s+FOMC Meetings|$)/gi;
  const monthRe = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:-(\d{1,2}))?\*?/gi;
  let section;
  while ((section = sectionRe.exec(text))) {
    const year = Number(section[1]);
    if (year < currentYear) continue;
    let match;
    while ((match = monthRe.exec(section[2]))) {
      const endDay = match[3] || match[2];
      const date = parseUsDate(match[1], endDay, String(year));
      if (date) dates.push(date);
    }
  }
  return fmtIsoDate(findNextDate(dates, now));
}

async function fetchText(url, ms = 3500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache:"no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseMarketEventDate(dateText) {
  if (!dateText) return null;
  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function todayStart(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function marketEventDaysLeft(dateText, now = new Date()) {
  if (!dateText) return null;
  const msPerDay = 864e5;
  return Math.ceil((parseMarketEventDate(dateText) - todayStart(now)) / msPerDay);
}

function normalizeMarketEvent(item, date, now = new Date()) {
  const daysLeft = marketEventDaysLeft(date, now);
  return {
    title: item.title,
    impact: item.impact,
    sourceUrl: item.sourceUrl,
    date,
    daysLeft: Number.isFinite(daysLeft) ? daysLeft : null
  };
}

function eventSortValue(item) {
  const date = parseMarketEventDate(item.date);
  return date ? date.getTime() : Number.POSITIVE_INFINITY;
}

function sortUpcomingEvents(items) {
  return items.sort((a, b) => eventSortValue(a) - eventSortValue(b));
}

async function getUpcomingMarketEvents(now = new Date()) {
  const events = await Promise.all(marketEvents.map(async item => {
    try {
      const html = await fetchText(item.sourceUrl);
      const date = item.parser(html, now);
      return normalizeMarketEvent(item, date, now);
    } catch {
      return normalizeMarketEvent(item, null, now);
    }
  }));
  return sortUpcomingEvents(events.filter(item => item.date && Number.isFinite(item.daysLeft) && item.daysLeft >= 0));
}

async function loadMarketNews() {
  state.marketNews.loading = true;
  state.marketNews.error = false;
  try {
    const eventsPromise = getUpcomingMarketEvents().catch(() => []);
    const liveNews = await getLiveMarketNews();
    state.marketNews.items = liveNews;
    state.marketNews.lastUpdated = new Date();
    state.marketNews.loaded = true;
    state.marketNews.loading = false;
    if (typeof renderMarketNews === "function") renderMarketNews();
    const events = await eventsPromise;
    state.marketNews.events = events;
    state.marketNews.eventsUpdatedAt = new Date();
    if (typeof renderMarketEvents === "function") renderMarketEvents();
  } catch {
    state.marketNews.items = [];
    state.marketNews.events = [];
    state.marketNews.eventsUpdatedAt = null;
    state.marketNews.error = true;
    state.marketNews.lastUpdated = null;
    state.marketNews.loaded = true;
  } finally {
    state.marketNews.loading = false;
  }
}
