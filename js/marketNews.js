const etfFlowKeywords = [
  "流入", "流出", "淨流入", "淨流出", "inflow", "outflow", "net inflow", "net outflow"
];

const marketNewsMaxAgeHours = 48;
const marketNewsFetchTimeoutMs = 2200;
const IMPORTANT_EVENT_WINDOW_DAYS = 14;

const marketNewsFeeds = [
  { source:"Cointelegraph", url:"https://cointelegraph.com/rss" },
  { source:"CoinDesk", url:"https://www.coindesk.com/arc/outboundfeeds/rss/" }
];

const nfpEventKeywords = [
  "NFP",
  "Nonfarm Payrolls",
  "Non-Farm Payrolls",
  "Non Farm Payrolls",
  "Employment Situation",
  "Payroll Employment",
  "Change in Nonfarm Payroll Employment",
  "U.S. Employment Report",
  "Unemployment Rate",
  "Average Hourly Earnings"
];
const fomcMinutesAliases = [
  "FOMC Minutes",
  "Federal Reserve Minutes",
  "Meeting Minutes",
  "Federal Reserve Meeting Minutes"
];
const blsOfficialCalendarUrl = "https://www.bls.gov/schedule/news_release/bls.ics";
const beaOfficialScheduleUrl = "https://www.bea.gov/news/schedule/full";
const fedUpcomingUrl = "https://www.federalreserve.gov/monetarypolicy.htm";
const fedStatementTimeSourceUrl = "https://www.federalreserve.gov/newsevents/pressreleases/monetary20250905a.htm";
const importantEventCacheKey = "dualcoin-important-events-v1";
const importantEventTimezone = "America/New_York";
let importantEventCache = null;

// 2026-10-05 再查核 BLS 官方 Schedule；只作離線 baseline，不推估下一年度。
const blsOfficialDateFallbacks = {
  NFP: ["2026-08-07", "2026-09-04", "2026-10-02", "2026-11-06", "2026-12-04"],
  CPI: ["2026-08-12", "2026-09-11", "2026-10-14", "2026-11-10", "2026-12-10"],
  PPI: ["2026-08-13", "2026-09-10", "2026-10-15", "2026-11-13", "2026-12-15"]
};

// 2026-10-05 查核 BEA Schedule / Fed Upcoming Dates / FOMC Calendar。
const officialEventBaselines = {
  PCE: ["2026-10-29", "2026-11-25", "2026-12-23"],
  FOMC: ["2026-09-16", "2026-10-28", "2026-12-09", "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-09", "2027-07-28", "2027-09-15", "2027-10-27", "2027-12-08"],
  MINUTES: ["2026-10-07", "2026-11-18"]
};

const marketEvents = [
  { title:"CPI", impact:"high", eventBias:"neutral", eventImpact:"high", eventAliases:["CPI"], directionReason:"通膨數據需等待公布值判斷方向", contextAdjustmentEnabled:true, contextAdjustmentEligible:false, officialFallbackKey:"CPI", sourceUrl:"https://www.bls.gov/schedule/news_release/cpi.htm", parser: parseBlsScheduleDate, fallbackSourceUrl: blsOfficialCalendarUrl, fallbackParser: parseBlsOfficialCalendarDate, calendarAliases:["Consumer Price Index"] },
  { title:"PPI", impact:"high", eventBias:"neutral", eventImpact:"high", eventAliases:["PPI", "Producer Price Index", "Producer Price", "生產者物價指數"], directionReason:"生產者物價數據需等待公布值判斷方向", contextAdjustmentEnabled:true, contextAdjustmentEligible:false, officialFallbackKey:"PPI", sourceUrl:"https://www.bls.gov/schedule/news_release/ppi.htm", parser: parseBlsScheduleDate, fallbackSourceUrl: blsOfficialCalendarUrl, fallbackParser: parseBlsOfficialCalendarDate, calendarAliases:["Producer Price Index"] },
  { title:"PCE", impact:"medium", eventBias:"neutral", eventImpact:"medium", eventAliases:["PCE"], directionReason:"通膨數據需等待公布值判斷方向", contextAdjustmentEnabled:true, contextAdjustmentEligible:false, officialFallbackKey:"PCE", sourceUrl:"https://www.bea.gov/data/personal-consumption-expenditures-price-index", parser: parseBeaNextReleaseDate, fallbackSourceUrl:beaOfficialScheduleUrl, fallbackParser:parseBeaScheduleDates },
  // NFP / Employment Situation is a Tier 1 macro event, same priority as CPI and FOMC.
  { title:"美國非農就業報告（NFP）", impact:"high", eventBias:"neutral", eventImpact:"high", eventAliases:["NFP", "非農", "美國非農就業報告"], directionReason:"就業數據需等待公布值判斷方向", contextAdjustmentEnabled:true, contextAdjustmentEligible:false, officialFallbackKey:"NFP", aliases:nfpEventKeywords, sourceUrl:"https://www.bls.gov/schedule/news_release/empsit.htm", parser: parseBlsScheduleDate, fallbackSourceUrl: blsOfficialCalendarUrl, fallbackParser: parseBlsOfficialCalendarDate, calendarAliases:["Employment Situation"] },
  { title:"FOMC", impact:"high", eventBias:"neutral", eventImpact:"high", eventAliases:["FOMC"], directionReason:"利率決議需等待聲明與點陣圖判斷方向", contextAdjustmentEnabled:true, contextAdjustmentEligible:false, officialFallbackKey:"FOMC", sourceUrl:"https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", parser: parseFomcMeetingDate, fallbackSourceUrl:fedUpcomingUrl, fallbackParser:parseFedUpcomingDates },
  { title:"FOMC 會議紀錄", impact:"medium", eventBias:"neutral", eventImpact:"medium", eventAliases:fomcMinutesAliases, directionReason:"會議紀錄屬波動事件，但方向需等待內容判斷", contextAdjustmentEnabled:true, contextAdjustmentEligible:false, officialFallbackKey:"MINUTES", sourceUrl:"https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", parser: parseFomcMinutesDate, fallbackSourceUrl:fedUpcomingUrl, fallbackParser:parseFedUpcomingDates }
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

function marketNewsSummary(title) {
  const text = String(title || "").toLowerCase();
  const has = (...keywords) => keywords.some(keyword => text.includes(keyword));
  if (has("etf", "inflow", "outflow", "flow", "flows")) {
    if (has("outflow", "outflows")) return "ETF 資金流出升溫，市場風險偏好轉弱";
    if (has("inflow", "inflows")) return "ETF 資金流入仍是市場焦點，短線情緒偏穩";
    return "ETF 資金流向仍是市場焦點";
  }
  if (has("fed", "fomc", "rate cut", "inflation", "cpi", "pce", "dollar", "treasury", "yield")) {
    return "市場關注通膨數據與聯準會政策";
  }
  if (has("altcoin", "altcoins", "xrp", "solana", "dogecoin", "memecoin", "token", "tokens")) {
    return "山寨幣情緒轉弱，比特幣走勢仍主導市場";
  }
  if (has("volatility", "liquidation", "liquidations", "options", "futures", "open interest", "leverage")) {
    return "加密市場波動升高，雙幣理財需留意被執行風險";
  }
  if (has("bitcoin", "btc")) {
    if (has("downside", "drop", "drops", "fall", "falls", "slump", "selloff", "support")) {
      return "比特幣跌破短期支撐，風險資產同步承壓";
    }
    if (has("rally", "surge", "gain", "gains", "rebound", "breakout")) {
      return "比特幣反彈帶動市場情緒回穩";
    }
    return "比特幣走勢仍主導加密市場風險情緒";
  }
  if (has("ether", "ethereum", "eth")) {
    return "以太坊走勢牽動加密市場短線情緒";
  }
  if (has("sec", "regulation", "regulatory", "license", "mica", "lawsuit", "court")) {
    return "監管消息影響市場情緒，短線波動需留意";
  }
  return "加密市場消息升溫，雙幣理財需留意價格波動";
}

function marketNewsSubject(title) {
  const text = String(title || "").toLowerCase();
  if (text.includes("bitcoin") || text.includes("btc")) return "BTC";
  if (text.includes("ethereum") || text.includes("ether") || text.includes("eth")) return "ETH";
  if (text.includes("xrp")) return "XRP";
  if (text.includes("solana") || text.includes(" sol ")) return "SOL";
  if (text.includes("dogecoin") || text.includes("doge")) return "DOGE";
  if (text.includes("altcoin season")) return "Altcoin Season";
  if (text.includes("altcoin")) return "Altcoin";
  if (text.includes("stablecoin")) return "Stablecoin";
  if (text.includes("etf")) return "ETF";
  if (text.includes("powell")) return "Powell";
  if (text.includes("fed")) return "Fed";
  if (text.includes("fomc")) return "FOMC";
  if (text.includes("cpi")) return "CPI";
  if (text.includes("producer price index") || text.includes("producer price") || text.includes("生產者物價指數") || /\bppi\b/i.test(text)) return "PPI";
  if (text.includes("pce")) return "PCE";
  if (text.includes("inflation")) return "Inflation";
  if (text.includes("sec")) return "SEC";
  if (text.includes("mica")) return "MiCA";
  if (text.includes("cbdc")) return "CBDC";
  if (text.includes("senate")) return "Senate";
  if (text.includes("congress")) return "Congress";
  return "";
}

function marketNewsEventAliases(title) {
  const subject = marketNewsSubject(title);
  const text = String(title || "").toLowerCase();
  if (text.includes("minutes") && (text.includes("fomc") || text.includes("federal reserve") || text.includes("meeting"))) return fomcMinutesAliases;
  if (text.includes("nonfarm") || text.includes("nfp")) return ["NFP", "非農"];
  if (text.includes("cpi")) return ["CPI"];
  if (text.includes("producer price index") || text.includes("producer price") || text.includes("生產者物價指數") || /\bppi\b/i.test(text)) return ["PPI", "Producer Price Index", "Producer Price", "生產者物價指數"];
  if (text.includes("pce")) return ["PCE"];
  if (text.includes("fomc") || text.includes("fed")) return ["FOMC"];
  return subject ? [subject] : [];
}

function marketNewsEventImpact(title) {
  const text = String(title || "").toLowerCase();
  if (text.includes("minutes") && (text.includes("fomc") || text.includes("federal reserve") || text.includes("meeting"))) return "medium";
  if (text.includes("fomc") || text.includes("cpi") || text.includes("nfp") || text.includes("nonfarm")) return "high";
  if (text.includes("producer price index") || text.includes("producer price") || text.includes("生產者物價指數") || /\bppi\b/i.test(text)) return "high";
  if (text.includes("pce") || text.includes("etf") || text.includes("liquidation") || text.includes("volatility")) return "medium";
  return "low";
}

function marketNewsSummaryV522(title) {
  const text = String(title || "").toLowerCase();
  const has = (...keywords) => keywords.some(keyword => text.includes(keyword));
  if (has("xrp")) {
    if (has("support")) return "XRP 接近關鍵支撐區";
    if (has("license", "mica", "sec", "lawsuit", "court")) return "XRP 相關監管消息牽動市場情緒";
    return "XRP 走勢成為山寨幣短線焦點";
  }
  if (has("solana", " sol ")) return "SOL 走勢牽動山寨幣風險偏好";
  if (has("dogecoin", "doge")) return "DOGE 情緒變化反映迷因幣風險偏好";
  if (has("altcoin season")) return "山寨幣季節訊號出現";
  if (has("altcoin", "altcoins")) return "山寨幣情緒轉弱，比特幣走勢仍主導市場";
  if (has("stablecoin", "stablecoins")) return "穩定幣消息影響市場流動性預期";
  if (has("cbdc")) {
    if (has("senate")) return "美國參議院推進 CBDC 相關法案";
    if (has("congress")) return "美國國會關注 CBDC 相關政策";
    return "CBDC 政策消息牽動加密市場監管預期";
  }
  if (has("senate")) return "美國參議院加密政策進展受市場關注";
  if (has("congress")) return "美國國會加密政策進展受市場關注";
  if (has("powell")) return "Powell 談話牽動利率預期與風險情緒";
  if (has("fed", "fomc")) return "Fed / FOMC 政策預期牽動市場情緒";
  if (has("cpi", "pce", "inflation")) return "通膨數據成為市場風險焦點";
  if (has("mica")) return "MiCA 監管消息影響加密市場情緒";
  if (has("sec")) return "SEC 監管消息影響加密市場情緒";
  if (has("etf")) {
    if (has("net outflow", "net outflows")) return "ETF 出現淨流出，市場風險偏好轉弱";
    if (has("outflow", "outflows")) return "ETF 資金流出升溫，市場情緒承壓";
    if (has("net inflow", "net inflows")) return "ETF 出現淨流入，資金面支撐市場情緒";
    if (has("inflow", "inflows")) return "ETF 資金持續流入，市場焦點仍在資金動能";
    return "ETF 資金流向仍是市場焦點";
  }
  if (has("bitcoin", "btc")) {
    if (has("downside", "drop", "drops", "fall", "falls", "slump", "selloff", "support")) return "比特幣接近短期支撐，風險資產同步承壓";
    if (has("rally", "surge", "gain", "gains", "rebound", "breakout")) return "比特幣反彈帶動市場情緒回穩";
    return "比特幣走勢仍主導加密市場風險情緒";
  }
  if (has("ether", "ethereum", "eth")) return "以太坊走勢牽動加密市場短線情緒";
  if (has("volatility", "liquidation", "liquidations", "options", "futures", "open interest", "leverage")) return "加密市場波動升高，雙幣理財需留意被執行風險";
  if (has("regulation", "regulatory", "license", "lawsuit", "court")) return "監管事件牽動市場情緒，短線波動需留意";
  return "加密市場消息升溫，雙幣理財需留意價格波動";
}

function distinguishRepeatedSummaries(items) {
  const counts = new Map();
  return items.map(item => {
    const count = counts.get(item.summaryTitle) || 0;
    counts.set(item.summaryTitle, count + 1);
    if (!count) return item;
    const prefix = item.subject || item.source || "市場";
    return { ...item, summaryTitle: `${prefix}：${item.summaryTitle}` };
  });
}

function parseMarketNewsPayload(text, feed) {
  return parseMarketNewsJson(text, feed).concat(parseMarketNewsFeed(text, feed))
    .map(item => ({
      ...item,
      summaryTitle: marketNewsSummaryV522(item.title),
      subject: marketNewsSubject(item.title),
      eventBias: "neutral",
      eventImpact: "low",
      eventAliases: marketNewsEventAliases(item.title),
      directionReason: "一般新聞預設不參與情境修正",
      contextAdjustmentEnabled: false,
      contextAdjustmentEligible: false
    }));
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
  const items = uniqueMarketNews(batches.flat())
    .filter(shouldShowMarketNews)
    .filter(item => isFreshMarketNews(item))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return distinguishRepeatedSummaries(items);
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
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const month = months.indexOf(String(monthText).toLowerCase().slice(0, 3)) + 1;
  const date = `${yearText}-${String(month).padStart(2, "0")}-${String(dayText).padStart(2, "0")}`;
  return parseMarketEventDate(date) ? date : null;
}

// Shared with the existing calendarState logic; preserve its local-date contract.
function fmtIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseMarketEventDate(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText || "")) return null;
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === dateText ? date : null;
}

function zonedEventParts(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", second:"2-digit", hourCycle:"h23"
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.filter(p => p.type !== "literal").map(p => [p.type, p.value]));
  return { date:`${fields.year}-${fields.month}-${fields.day}`, time:`${fields.hour}:${fields.minute}:${fields.second}` };
}

// Intl supplies IANA/DST rules. Reject nonexistent or ambiguous wall-clock times.
function eventDateTime(date, time, timeZone = importantEventTimezone) {
  if (!parseMarketEventDate(date) || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time || "")) return null;
  try {
    const wallTime = time.length === 5 ? `${time}:00` : time;
    const nominal = Date.parse(`${date}T${wallTime}Z`);
    const matches = new Set();
    for (const hours of [-36, 0, 36]) {
      const sample = nominal + hours * 36e5;
      const parts = zonedEventParts(sample, timeZone);
      const offset = Date.parse(`${parts.date}T${parts.time}Z`) - sample;
      const candidate = nominal - offset;
      const check = zonedEventParts(candidate, timeZone);
      if (check.date === date && check.time === wallTime) matches.add(candidate);
    }
    return matches.size === 1 ? new Date([...matches][0]).toISOString() : null;
  } catch {
    return null;
  }
}

function parseOfficialTime(text) {
  const match = String(text).match(/\b(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/i);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 12 || Number(match[2]) > 59) return null;
  const hour = Number(match[1]) % 12 + (match[3].toLowerCase() === "p" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function officialEventRecord(date, time = null, extra = {}) {
  if (!parseMarketEventDate(date)) return null;
  const sourceTimezone = extra.sourceTimezone || importantEventTimezone;
  const datetime = time ? eventDateTime(date, time, sourceTimezone) : null;
  if (time && !datetime) return null;
  return { date, time, sourceTimezone, datetime, ...extra };
}

function nextOfficialRecord(records, now = new Date()) {
  const today = zonedEventParts(now, importantEventTimezone).date;
  return records.filter(Boolean).filter(record => record.datetime
    ? Date.parse(record.datetime) > now.getTime() : record.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.time || "").localeCompare(String(b.time || "")))[0] || null;
}

// Parse release cells only; page metadata and reference-month dates are not releases.
function parseBlsScheduleDate(html) {
  const records = [];
  for (const row of String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => plainText(m[1]));
    if (cells.length < 3) continue;
    const match = cells[1].match(/^([A-Za-z.]+)\s+(\d{1,2}),\s*(\d{4})$/);
    if (match) records.push(officialEventRecord(parseUsDate(match[1], match[2], match[3]), parseOfficialTime(cells[2])));
  }
  return records.filter(Boolean);
}

function parseBlsOfficialCalendarDate(ics, item) {
  const aliases = item.calendarAliases || [];
  const records = [];
  const unfolded = String(ics).replace(/\r?\n[ \t]/g, "");
  for (const block of unfolded.split(/BEGIN:VEVENT/i).slice(1)) {
    const summary = block.match(/^SUMMARY(?:;[^:]*)?:(.*)$/im)?.[1]?.trim() || "";
    if (!aliases.some(alias => summary.toLowerCase().includes(alias.toLowerCase()))) continue;
    const withheld = /^STATUS:CANCELLED\s*$/im.test(block);
    const match = block.match(/^DTSTART([^:]*):(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?\s*$/im);
    if (!match) continue;
    const timezone = match[8] ? "UTC" : (match[1].match(/TZID="?([^;"]+)/i)?.[1] || importantEventTimezone);
    const time = match[5] ? `${match[5]}:${match[6]}:${match[7]}` : null;
    records.push(officialEventRecord(`${match[2]}-${match[3]}-${match[4]}`, time, { sourceTimezone:timezone, withheld }));
  }
  return records.filter(Boolean);
}

function parseBeaNextReleaseDate(html) {
  const text = plainText(html);
  const match = text.match(/Next release:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})([^.]*?(?:[ap]\.m\.)[^<]*|)/i);
  return match ? [officialEventRecord(parseUsDate(match[1], match[2], match[3]), parseOfficialTime(match[4]))].filter(Boolean) : [];
}

function parseBeaScheduleDates(html) {
  const records = [];
  const activeTab = plainText(String(html).match(/<li class="active">([\s\S]*?)<\/li>/i)?.[1] || "Full Schedule");
  for (const table of String(html).matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const year = plainText(table[1]).match(/\bYear\s+(\d{4})\b/)?.[1];
    if (!year) continue;
    for (const row of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const text = plainText(row[1]);
      if (!/\bPersonal Income and Outlays,\s/i.test(text)) continue;
      const match = text.match(/^([A-Za-z]+)\s+(\d{1,2})\b/);
      if (!match) continue;
      // BEA sometimes applies rescheduling via inline JS. Do not use an affected raw row.
      const rawDate = `${match[1]} ${match[2]}`;
      const changed = [...String(html).matchAll(/\{[^{}]*"target-date"\s*:\s*"([^"]+)"[^{}]*\}/g)]
        .some(change => {
          const tabs = change[0].match(/"apply-to"\s*:\s*\[([^\]]*)\]/)?.[1];
          return change[1] === rawDate && /"(?:replacement-releaseText|replacement-smallText)"\s*:\s*"|"row-disable"\s*:\s*true/.test(change[0])
            && (!tabs || [...tabs.matchAll(/"([^"]+)"/g)].some(tab => tab[1] === activeTab));
        });
      records.push(officialEventRecord(parseUsDate(match[1], match[2], year), parseOfficialTime(text), {
        withheld:changed || /To Be|Rescheduled|Cancelled/i.test(text)
      }));
    }
  }
  return records.filter(Boolean);
}

function parseFomcMeetingDate(html) {
  const records = [];
  const sections = /<h4\b[^>]*>\s*(?:<a\b[^>]*>)?(\d{4})\s+FOMC Meetings(?:<\/a>)?\s*<\/h4>([\s\S]*?)(?=<h4\b|$)/gi;
  for (const section of String(html).matchAll(sections)) {
    const year = section[1];
    // Use only month/date cells: Minutes release dates must never become meeting dates.
    const rows = /class="[^"]*fomc-meeting__month[^\"]*"[^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*class="[^"]*fomc-meeting__date[^\"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    for (const row of section[2].matchAll(rows)) {
      const months = plainText(row[1]).split("/");
      const days = plainText(row[2]).match(/^(\d{1,2})\s*[-–—]\s*(\d{1,2})\*?$/);
      if (!days) continue; // Exclude notation votes and unscheduled single-day entries.
      const date = parseUsDate(months[months.length - 1], days[2], year);
      records.push(officialEventRecord(date, "14:00", { timeSourceUrl:fedStatementTimeSourceUrl, tentative:true }));
    }
  }
  return records.filter(Boolean);
}

function parseFomcMinutesDate(html) {
  const records = [];
  const cells = /<div\b[^>]*class="[^"]*fomc-meeting__minutes[^\"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  for (const cell of String(html).matchAll(cells)) {
    const match = plainText(cell[1]).match(/(?:Released|Release(?: date)?[: ]+)\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})(.*)/i);
    if (match) records.push(officialEventRecord(parseUsDate(match[1], match[2], match[3]), parseOfficialTime(match[4])));
  }
  return records.filter(Boolean); // No inferred dates in the official parser.
}

function parseFedUpcomingDates(html, item) {
  // Anchor the omitted year to the page's own Last Update, never the user's current year.
  const text = plainText(html);
  const updated = text.match(/Last Update:\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/i);
  const anchor = updated ? parseUsDate(updated[1], updated[2], updated[3]) : null;
  if (!anchor) return [];
  const section = String(html).split(/Upcoming Dates<\/h5>/i)[1]?.split(/<ul|<h[1-6]|<hr/i)[0] || "";
  const records = [];
  let year = Number(updated[3]);
  let previousMonth = Number(anchor.slice(5, 7));
  for (const row of section.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const value = plainText(row[1]);
    const match = value.match(/^([A-Za-z.]+)\s+(\d{1,2})(?:\s*[-–—]\s*(\d{1,2}))?\s+(FOMC Minutes|FOMC Meeting)\b/i);
    if (!match) continue;
    const provisional = parseUsDate(match[1], match[3] || match[2], String(year));
    if (!provisional) continue;
    const month = Number(provisional.slice(5, 7));
    if (previousMonth - month > 6) year += 1;
    previousMonth = month;
    const isMinutes = match[4].toLowerCase().includes("minutes");
    if (isMinutes !== (item.officialFallbackKey === "MINUTES")) continue;
    const date = parseUsDate(match[1], match[3] || match[2], String(year));
    records.push(officialEventRecord(date, isMinutes ? parseOfficialTime(value) : "14:00",
      isMinutes ? {} : { timeSourceUrl:fedStatementTimeSourceUrl, tentative:true }));
  }
  return records.filter(Boolean);
}

function fedMonthlyCalendarUrl(date) {
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  return `https://www.federalreserve.gov/newsevents/${date.slice(0, 4)}-${months[Number(date.slice(5, 7)) - 1]}.htm`;
}

function parseFedMonthlyMinutes(html) {
  const heading = String(html).match(/<h4\b[^>]*>\s*([A-Za-z]+)\s+(\d{4})\s*<\/h4>/i);
  if (!heading) return [];
  const records = [];
  // Separate time/title/release-day cells; the meeting's reference dates are not release dates.
  const rows = /<div class="col-xs-2">([\s\S]*?)<\/div>\s*<div class="col-xs-7">([\s\S]*?)<\/div>\s*<div class="col-xs-3">([\s\S]*?)<\/div>/gi;
  for (const row of String(html).matchAll(rows)) {
    if (!/^FOMC Minutes\b/i.test(plainText(row[2]))) continue;
    const day = plainText(row[3]);
    if (!/^\d{1,2}$/.test(day)) continue;
    records.push(officialEventRecord(parseUsDate(heading[1], day, heading[2]), parseOfficialTime(plainText(row[1]))));
  }
  return records.filter(Boolean);
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

function bundledOfficialRecords(item) {
  const key = item.officialFallbackKey;
  return (blsOfficialDateFallbacks[key] || officialEventBaselines[key] || []).map(date => officialEventRecord(date,
    key === "MINUTES" || key === "FOMC" ? "14:00" : "08:30", {
      sourceUrl:key === "PCE" ? beaOfficialScheduleUrl : key === "MINUTES" ? fedUpcomingUrl : item.sourceUrl,
      checkedAt:"2026-10-05", ...(key === "FOMC" ? { tentative:true, timeSourceUrl:fedStatementTimeSourceUrl } : {}),
      ...(key === "MINUTES" ? { timeSourceUrl:fedMonthlyCalendarUrl(date) } : {})
    })).filter(Boolean);
}

function readImportantEventCache() {
  if (importantEventCache) return importantEventCache;
  try {
    const saved = JSON.parse(localStorage.getItem(importantEventCacheKey));
    importantEventCache = saved?.schema === 1 && saved.events && typeof saved.events === "object" ? saved : null;
  } catch { /* Offline/storage restrictions must not block events or calculations. */ }
  return importantEventCache || (importantEventCache = { schema:1, events:{} });
}

function saveImportantEventCache() {
  try { localStorage.setItem(importantEventCacheKey, JSON.stringify(readImportantEventCache())); }
  catch { /* Keep the in-memory calendar when persistence is unavailable. */ }
}

function trustedCachedRecords(item, entry, now) {
  if (!Array.isArray(entry?.records) || !Number.isFinite(Date.parse(entry.savedAt)) || Date.parse(entry.savedAt) > now.getTime()) return [];
  const isOfficialUrl = url => [item.sourceUrl, item.fallbackSourceUrl].includes(url)
    || (item.officialFallbackKey === "MINUTES" && /^https:\/\/www\.federalreserve\.gov\/newsevents\/\d{4}-(january|february|march|april|may|june|july|august|september|october|november|december)\.htm$/.test(url));
  return entry.records.filter(record => record && ["verified", "official-single"].includes(record.sourceType)
    && Array.isArray(record.sourceUrls) && record.sourceUrls.length > 0 && record.sourceUrls.every(isOfficialUrl))
    .map(record => officialEventRecord(record.date, record.time, {
      sourceTimezone:record.sourceTimezone, sourceUrl:record.sourceUrl, sourceUrls:record.sourceUrls,
      timeSourceUrl:record.timeSourceUrl, tentative:record.tentative, verifiedFields:record.verifiedFields,
      cachedAt:entry.savedAt, originalSourceType:record.sourceType
    })).filter(Boolean);
}

function compareOfficialRecords(a, b) {
  if (a.datetime && b.datetime) return a.datetime === b.datetime;
  return a.date === b.date; // Missing time is unknown, never a disagreement by itself.
}

function resolveOfficialCalendar(item, calendars, now = new Date()) {
  const next = calendars.map(records => nextOfficialRecord(records, now));
  const available = next.filter(Boolean);
  if (!available.length) return { records:[], next:null };
  const internallyConflicted = calendars.some(records => records.some((a, i) => records.slice(i + 1).some(b => a.date === b.date && !compareOfficialRecords(a, b))));
  if (internallyConflicted || available.some(a => a.withheld || available.some(b => !compareOfficialRecords(a, b)))) {
    return { records:[], next:{ sourceType:"conflict", date:null, candidates:available } };
  }
  const records = [];
  for (let i = 0; i < calendars.length; i += 1) {
    for (const record of calendars[i]) {
      const peers = calendars.filter((_, index) => index !== i).flat().filter(value => value.date === record.date);
      if (record.withheld || peers.some(other => other.withheld || !compareOfficialRecords(record, other))) continue;
      const sourceType = peers.length ? "verified" : "official-single";
      const chosen = [record, ...peers].find(value => value.datetime) || record;
      const sourceUrls = [...new Set([record, ...peers].map(value => value.sourceUrl).filter(Boolean))];
      if (!records.some(value => value.date === chosen.date)) records.push({ ...chosen, sourceType, sourceUrls,
        timeSourceUrl:chosen.timeSourceUrl || (chosen.datetime ? chosen.sourceUrl : null),
        verifiedFields:peers.length ? ([record, ...peers].filter(value => value.datetime).length > 1 ? ["date", "datetime"] : ["date"]) : [] });
    }
  }
  return { records, next:nextOfficialRecord(records, now) };
}

function derivedMinutesRecord(meetings, now) {
  const records = meetings.filter(record => record.date <= zonedEventParts(now, importantEventTimezone).date).map(meeting => {
    const date = parseMarketEventDate(meeting.date);
    date.setUTCDate(date.getUTCDate() + 21);
    return officialEventRecord(date.toISOString().slice(0, 10), null, { sourceType:"derived", derivedFrom:meeting.date, sourceUrl:meeting.sourceUrl });
  });
  return nextOfficialRecord(records, now);
}

function marketEventDaysLeft(record, now = new Date()) {
  if (!record?.date) return null;
  const date = record.datetime ? zonedEventParts(record.datetime, "Asia/Taipei").date : record.date;
  const today = zonedEventParts(now, "Asia/Taipei").date;
  return Math.round((parseMarketEventDate(date) - parseMarketEventDate(today)) / 864e5);
}

function importantEventSettlement(now = new Date(), offsetDays = state.offsetDays) {
  const parts = zonedEventParts(now, "Asia/Taipei");
  const offset = Math.max(parts.time >= "16:00:00" ? 1 : 0, Math.round(Number(offsetDays) || 0));
  const date = parseMarketEventDate(parts.date);
  date.setUTCDate(date.getUTCDate() + offset);
  return eventDateTime(date.toISOString().slice(0, 10), "16:00", "Asia/Taipei");
}

function eventSettlementRelation(record, settlement, now = new Date()) {
  if (!record?.datetime || ["conflict", "derived"].includes(record.sourceType)) return "unknown";
  const time = Date.parse(record.datetime);
  if (!Number.isFinite(time) || !Number.isFinite(Date.parse(settlement))) return "unknown";
  if (time <= now.getTime()) return "past";
  return time < Date.parse(settlement) ? "before" : "after";
}

function marketEventsBeforeSettlement(events = state.marketNews?.events || [], now = new Date(), offsetDays = state.offsetDays) {
  const settlement = importantEventSettlement(now, offsetDays);
  return events.filter(record => eventSettlementRelation(record, settlement, now) === "before");
}

function marketEventTitle(item) {
  const aliases = Array.isArray(item.aliases) ? item.aliases : [];
  const text = [item.title, ...aliases].join(" ").toLowerCase();
  if (nfpEventKeywords.some(keyword => text.includes(keyword.toLowerCase()))) return "美國非農就業報告（NFP）";
  return item.title;
}

function normalizeMarketEvent(item, record, now = new Date()) {
  const daysLeft = marketEventDaysLeft(record, now);
  return {
    title: marketEventTitle(item),
    impact: item.impact,
    eventBias: normalizeEventBias(item.eventBias),
    eventImpact: normalizeEventImpact(item.eventImpact || item.impact),
    eventAliases: Array.isArray(item.eventAliases) ? item.eventAliases : [],
    directionReason: item.directionReason || "事件方向未校準，預設中性",
    contextAdjustmentEnabled: item.contextAdjustmentEnabled !== false,
    contextAdjustmentEligible: item.contextAdjustmentEligible === true,
    windowDays: IMPORTANT_EVENT_WINDOW_DAYS,
    sourceUrl: item.sourceUrl,
    ...record,
    daysLeft: Number.isFinite(daysLeft) ? daysLeft : null
  };
}

function eventSortValue(item) {
  return Date.parse(item.datetime || `${item.date}T00:00:00Z`) || Number.POSITIVE_INFINITY;
}

function sortUpcomingEvents(items) {
  return items.sort((a, b) => eventSortValue(a) - eventSortValue(b));
}

async function getUpcomingMarketEvents(now = new Date()) {
  const cache = readImportantEventCache();
  // Deduplicate shared BLS ICS/Fed pages, and read both official sources on each refresh.
  const responses = new Map();
  const readSource = url => {
    if (!responses.has(url)) responses.set(url, fetchText(url).catch(() => null));
    return responses.get(url);
  };
  const statuses = [];
  const events = await Promise.all(marketEvents.map(async item => {
    const texts = await Promise.all([readSource(item.sourceUrl), readSource(item.fallbackSourceUrl)]);
    const calendars = texts.map((text, index) => {
      if (!text) return [];
      try {
        const parser = index === 0 ? item.parser : item.fallbackParser;
        return parser(text, item).map(record => ({ ...record, sourceUrl:index === 0 ? item.sourceUrl : item.fallbackSourceUrl }));
      } catch { return []; }
    });
    const key = item.officialFallbackKey;
    const saved = cache.events[key];
    if (key === "MINUTES") {
      const seed = nextOfficialRecord(calendars.flat(), now) || nextOfficialRecord(trustedCachedRecords(item, saved, now), now)
        || nextOfficialRecord(bundledOfficialRecords(item), now);
      const url = fedMonthlyCalendarUrl(seed?.date || zonedEventParts(now, importantEventTimezone).date);
      const monthly = await readSource(url);
      calendars.push(monthly ? parseFedMonthlyMinutes(monthly).map(record => ({ ...record, sourceUrl:url, timeSourceUrl:url })) : []);
    }
    const resolved = resolveOfficialCalendar(item, calendars, now);
    let record = resolved.next;
    // A previous conflict stays blocked across outages/single-source responses.
    if (saved?.conflict && record?.sourceType !== "verified") {
      record = record?.sourceType === "conflict" ? record : { ...saved.conflict, sourceType:"conflict", date:null };
    }
    if (record?.sourceType === "conflict") {
      cache.events[key] = { ...saved, conflict:record };
    } else if (record) {
      cache.events[key] = { records:resolved.records, savedAt:now.toISOString() };
    } else {
      record = nextOfficialRecord(trustedCachedRecords(item, saved, now), now);
      if (record) record = { ...record, sourceType:"cached-official" };
      if (!record) {
        record = nextOfficialRecord(bundledOfficialRecords(item), now);
        if (record) record = { ...record, sourceType:"fallback" };
      }
      if (!record && key === "MINUTES") {
        const fomc = marketEvents.find(event => event.officialFallbackKey === "FOMC");
        const fomcResolution = resolveOfficialCalendar(fomc, [
          texts[0] ? parseFomcMeetingDate(texts[0]) : [],
          texts[1] ? parseFedUpcomingDates(texts[1], fomc) : []
        ], now);
        if (fomcResolution.next?.sourceType !== "conflict" && !cache.events.FOMC?.conflict) {
          const meetings = texts[0] ? parseFomcMeetingDate(texts[0]) : [];
          const cachedMeetings = trustedCachedRecords(fomc, cache.events.FOMC, now);
          record = derivedMinutesRecord(meetings.length ? meetings : cachedMeetings.length ? cachedMeetings : bundledOfficialRecords(fomc), now);
        }
      }
    }
    statuses.push({ title:marketEventTitle(item), sourceType:record?.sourceType || "unavailable", date:record?.date || null,
      candidates:record?.candidates || [], sourceUrls:record?.sourceUrls || [], cachedAt:record?.cachedAt || null });
    return record ? normalizeMarketEvent(item, record, now) : null;
  }));
  saveImportantEventCache();
  state.marketNews.eventSourceStatus = statuses;
  return sortUpcomingEvents(events.filter(item => item?.date && Number.isFinite(item.daysLeft)
    && item.daysLeft >= 0 && item.daysLeft <= IMPORTANT_EVENT_WINDOW_DAYS));
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
    if (typeof render === "function") render();
    else if (typeof renderMarketEvents === "function") renderMarketEvents();
  } catch {
    state.marketNews.items = [];
    state.marketNews.events = [];
    state.marketNews.eventsUpdatedAt = null;
    state.marketNews.error = true;
    state.marketNews.lastUpdated = null;
    state.marketNews.loaded = true;
    state.marketNews.loading = false;
    if (typeof render === "function") render();
  } finally {
    state.marketNews.loading = false;
  }
}
