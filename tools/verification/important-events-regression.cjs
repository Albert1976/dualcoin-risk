// Minimal event-calendar tests. No browser, network, pricing or full regression.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const store = new Map();
const context = vm.createContext({ Date, Intl, URL, AbortController, setTimeout, clearTimeout,
  localStorage: { getItem:key => store.get(key) || null, setItem:(key, value) => store.set(key, value) },
  state:{ offsetDays:1, marketNews:{ events:[] } }, normalizeEventBias:value => value, normalizeEventImpact:value => value
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "../../js/marketNews.js"), "utf8"), context);
const run = code => vm.runInContext(code, context);
const now = new Date("2026-10-05T00:00:00Z");
context.testNow = now;
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
function schedule(date = "Oct. 14, 2026", time = "08:30 AM") {
  return `<p>Last Modified: October 6, 2026</p><table><tr><th>Reference Month</th><th>Release Date</th><th>Release Time</th></tr><tr><td>September 2026</td><td>${date}</td><td>${time}</td></tr></table>`;
}
function ics(date = "20261014", time = "083000", params = ";TZID=America/New_York") {
  return `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Consumer Price\r\n  Index\r\nDTSTART${params}:${date}T${time}\r\nEND:VEVENT\r\nEND:VCALENDAR`;
}
const fed = `<h4><a>2026 FOMC Meetings</a></h4><div class="fomc-meeting__month"><strong>September</strong></div><div class="fomc-meeting__date">15-16*</div><div class="fomc-meeting__minutes">Minutes: PDF | HTML (Released October 7, 2026)</div><div class="fomc-meeting__month">October</div><div class="fomc-meeting__date">27-28</div><h4><a>2027 FOMC Meetings</a></h4><div class="fomc-meeting__month">January</div><div class="fomc-meeting__date">26-27</div>`;
const upcoming = `<h5>Upcoming Dates</h5><p><strong>Oct. 7</strong> FOMC Minutes<br>Meeting of Sept. 15-16</p><p><strong>Oct. 27-28</strong> FOMC Meeting</p><p><strong>Nov. 18</strong> FOMC Minutes<br>Meeting of Oct. 27-28</p><ul></ul><p>Last Update: October 1, 2026</p>`;
const monthly = `<h4>October 2026</h4><div class="col-xs-2"><p>2:00 p.m.</p></div><div class="col-xs-7"><p>FOMC Minutes</p><p>Meeting of September 15-16</p></div><div class="col-xs-3"><p>7</p></div>`;
context.schedule = schedule(); context.ics = ics(); context.fed = fed; context.upcoming = upcoming; context.monthly = monthly;
check("BLS release cells / metadata exclusion / invalid date", () => {
  assert.equal(run("parseBlsScheduleDate(schedule)[0].date"), "2026-10-14");
  assert.equal(run("parseBlsScheduleDate(schedule)[0].time"), "08:30");
  assert.equal(run("parseMarketEventDate('2026-02-30')"), null);
});
check("ICS folding / TZID / UTC / cancelled / date-only", () => {
  assert.equal(run("parseBlsOfficialCalendarDate(ics,marketEvents[0])[0].datetime"), "2026-10-14T12:30:00.000Z");
  context.utcIcs = ics("20261014", "123000Z", "");
  assert.equal(run("parseBlsOfficialCalendarDate(utcIcs,marketEvents[0])[0].datetime"), "2026-10-14T12:30:00.000Z");
  context.cancelled = ics().replace("END:VEVENT", "STATUS:CANCELLED\r\nEND:VEVENT");
  assert.equal(run("parseBlsOfficialCalendarDate(cancelled,marketEvents[0])[0].withheld"), true);
  context.dateOnly = ics().replace("DTSTART;TZID=America/New_York:20261014T083000", "DTSTART;VALUE=DATE:20261014");
  assert.equal(run("parseBlsOfficialCalendarDate(dateOnly,marketEvents[0])[0].datetime"), null);
});
check("BEA next release / PIO schedule / no unrelated releases", () => {
  context.bea = `<table><th>Year 2026</th><tr><td>October 29 <small>8:30 AM</small></td><td>GDP (Advance Estimate)</td></tr><tr><td>October 29 <small>8:30 AM</small></td><td>Personal Income and Outlays, September 2026</td></tr></table>`;
  assert.equal(run("parseBeaScheduleDates(bea).length"), 1);
  assert.equal(run("parseBeaScheduleDates(bea)[0].datetime"), "2026-10-29T12:30:00.000Z");
  assert.equal(run("parseBeaNextReleaseDate('Next release: October 29, 2026')[0].time"), null);
  assert.equal(run("parseBeaNextReleaseDate('Next release: October 29, 2026, at 8:30 a.m. EDT')[0].time"), "08:30");
  context.rescheduled = context.bea + `<script>const updates=[{"target-date":"October 29","replacement-releaseText":"To Be Rescheduled","apply-to":null}]</script>`;
  assert.equal(run("parseBeaScheduleDates(rescheduled)[0].withheld"), true);
});
check("Fed separate meeting and explicit Minutes / 2027 / year rollover", () => {
  assert.equal(run("nextOfficialRecord(parseFomcMeetingDate(fed),testNow).date"), "2026-10-28");
  assert.equal(run("parseFomcMeetingDate(fed).some(r=>r.date==='2026-10-07')"), false);
  assert.equal(run("parseFomcMeetingDate(fed).some(r=>r.date==='2027-01-27')"), true);
  assert.equal(run("parseFomcMinutesDate(fed)[0].date"), "2026-10-07");
  assert.equal(run("parseFomcMinutesDate(fed.replace('Released October 7, 2026','')).length"), 0);
  assert.equal(run("parseFedMonthlyMinutes(monthly)[0].datetime"), "2026-10-07T18:00:00.000Z");
  assert.equal(run("nextOfficialRecord(parseFedUpcomingDates(upcoming,marketEvents[5]),testNow).date"), "2026-10-07");
  assert.equal(run("parseFedUpcomingDates(upcoming,marketEvents[5]).length"), 2);
  assert.equal(run("parseFedUpcomingDates('<h5>Upcoming Dates</h5><p>Jan. 5 FOMC Minutes</p><ul></ul>Last Update: December 1, 2026',marketEvents[5])[0].date"), "2027-01-05");
});
check("DST summer/winter / gap and fold rejection / Taiwan rollover", () => {
  assert.equal(run("eventDateTime('2026-10-14','08:30')"), "2026-10-14T12:30:00.000Z");
  assert.equal(run("eventDateTime('2026-11-10','08:30')"), "2026-11-10T13:30:00.000Z");
  assert.equal(run("eventDateTime('2026-03-08','02:30')"), null);
  assert.equal(run("eventDateTime('2026-11-01','01:30')"), null);
  assert.equal(run("marketEventDaysLeft(officialEventRecord('2026-10-07','14:00'),new Date('2026-10-07T00:00:00Z'))"), 1);
});
check("official agreement / missing time / date and time conflict", () => {
  context.sourceDate = "2026-10-15";
  assert.equal(run("resolveOfficialCalendar(marketEvents[0],[[officialEventRecord('2026-10-14','08:30')],[officialEventRecord('2026-10-14','08:30')]],testNow).next.sourceType"), "verified");
  assert.equal(run("resolveOfficialCalendar(marketEvents[0],[[officialEventRecord('2026-10-14')],[officialEventRecord('2026-10-14','08:30')]],testNow).next.datetime"), "2026-10-14T12:30:00.000Z");
  assert.equal(run("resolveOfficialCalendar(marketEvents[0],[[officialEventRecord('2026-10-14','08:30')],[officialEventRecord(sourceDate,'08:30')]],testNow).next.sourceType"), "conflict");
  assert.equal(run("resolveOfficialCalendar(marketEvents[0],[[officialEventRecord('2026-10-14','08:30')],[officialEventRecord('2026-10-14','09:30')]],testNow).next.date"), null);
  assert.equal(run("resolveOfficialCalendar(marketEvents[0],[[officialEventRecord('2026-10-14','08:30')],parseBlsOfficialCalendarDate(cancelled,marketEvents[0])],testNow).next.sourceType"), "conflict");
});
check("settlement boundary / same-date after 16:00 / unknown and derived", () => {
  const evaluate = (time, settlement = "2026-10-14T08:00:00Z") => run(`eventSettlementRelation(officialEventRecord('2026-10-14','${time}'), '${settlement}', testNow)`);
  assert.equal(evaluate("08:30"), "after");
  assert.equal(evaluate("03:59"), "before");
  assert.equal(evaluate("04:00"), "after");
  assert.equal(run("eventSettlementRelation(officialEventRecord('2026-10-14'), '2026-10-14T08:00:00Z', testNow)"), "unknown");
  assert.equal(run("eventSettlementRelation({...officialEventRecord('2026-10-14','03:59'),sourceType:'derived'}, '2026-10-14T08:00:00Z', testNow)"), "unknown");
  assert.equal(run("importantEventSettlement(new Date('2026-10-14T09:00:00Z'),0)"), "2026-10-15T08:00:00.000Z");
});
async function integration() {
  const urls = run("marketEvents.map(i=>[i.sourceUrl,i.fallbackSourceUrl])");
  const data = new Map([[urls[0][0], schedule()], [urls[0][1], ics()], [urls[4][0], fed], [urls[4][1], upcoming],
    ["https://www.federalreserve.gov/newsevents/2026-october.htm", monthly]]);
  context.fetchText = async url => { if (!data.has(url)) throw new Error("offline"); return data.get(url); };
  const list = await run("getUpcomingMarketEvents(testNow)");
  check("online verified / single / Minutes 14 days / source metadata", () => {
    assert.equal(list.find(i=>i.title==='CPI').sourceType, "verified");
    assert.equal(list.find(i=>i.title==='FOMC 會議紀錄').sourceType, "verified");
    assert.equal(list.find(i=>i.title==='FOMC 會議紀錄').windowDays, 14);
    assert.equal(run("readImportantEventCache().events.CPI.records[0].sourceUrls.length"), 2);
  });
  data.delete(urls[0][1]);
  await run("getUpcomingMarketEvents(testNow)");
  check("official-single", () => assert.equal(run("state.marketNews.eventSourceStatus.find(i=>i.title==='CPI').sourceType"), "official-single"));
  data.clear();
  const offline = await run("getUpcomingMarketEvents(testNow)");
  check("offline LKG before bundled / persistent cache reload", () => {
    assert.equal(offline.find(i=>i.title==='CPI').sourceType, "cached-official");
    run("importantEventCache=null");
    assert.ok(run("readImportantEventCache().events.CPI.records.length > 0"));
  });
  data.set(urls[0][0],schedule()); data.set(urls[0][1],ics("20261015"));
  const conflicted = await run("getUpcomingMarketEvents(testNow)");
  check("conflict fails closed and does not overwrite LKG", () => {
    assert.equal(conflicted.some(i=>i.title==='CPI'), false);
    assert.equal(run("readImportantEventCache().events.CPI.records[0].date"), "2026-10-14");
    assert.equal(run("state.marketNews.eventSourceStatus.find(i=>i.title==='CPI').sourceType"), "conflict");
  });
  data.clear(); run("importantEventCache=null");
  await run("getUpcomingMarketEvents(testNow)");
  check("conflict remains blocked across reload and outage", () => assert.equal(run("state.marketNews.eventSourceStatus.find(i=>i.title==='CPI').sourceType"), "conflict"));
  data.set(urls[0][0],schedule());
  await run("getUpcomingMarketEvents(testNow)");
  check("one surviving source cannot silently clear conflict", () => assert.equal(run("state.marketNews.eventSourceStatus.find(i=>i.title==='CPI').sourceType"), "conflict"));
  data.set(urls[0][1],ics());
  await run("getUpcomingMarketEvents(testNow)");
  check("two agreeing sources clear conflict", () => assert.equal(run("state.marketNews.eventSourceStatus.find(i=>i.title==='CPI').sourceType"), "verified"));
  data.clear(); store.clear(); run("importantEventCache=null");
  await run("getUpcomingMarketEvents(testNow)");
  check("bundled officially confirmed baseline", () => assert.equal(run("state.marketNews.eventSourceStatus.find(i=>i.title==='CPI').sourceType"), "fallback"));
  const future = await run("getUpcomingMarketEvents(new Date('2027-01-01T00:00:00Z'))");
  check("no invented 2027 BLS/BEA dates / fail closed", () => {
    assert.equal(future.some(i=>['CPI','PPI','PCE','美國非農就業報告（NFP）'].includes(i.title)), false);
    assert.equal(run("bundledOfficialRecords(marketEvents[4]).filter(i=>i.date.startsWith('2027')).length"), 8);
  });
  check("derived Minutes only at last resort / no invented time", () => {
    const result = run("derivedMinutesRecord(bundledOfficialRecords(marketEvents[4]),new Date('2026-12-15T00:00:00Z'))");
    assert.equal(result.sourceType, "derived"); assert.equal(result.date, "2026-12-30"); assert.equal(result.datetime, null);
  });
  context.localStorage = { getItem:()=>{throw new Error('denied')}, setItem:()=>{throw new Error('quota')} };
  run("importantEventCache=null");
  const noStorage = await run("getUpcomingMarketEvents(testNow)");
  check("storage failure preserves Offline First", () => assert.ok(noStorage.length > 0));
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../../js/contextAdjustment.js"), "utf8"), context);
  context.CALIBRATION_CONFIG = { holidayDates:[] };
  check("shared calendar helper remains available to event consumer", () => {
    assert.equal(run("calendarState(new Date(2026,9,5,12))"), "weekday");
    assert.equal(run("calendarState(new Date(2026,9,4,12))"), "weekend");
  });
  console.log(`${checks} minimal test groups passed`);
}
integration().catch(error => { console.error(error); process.exitCode=1; });
