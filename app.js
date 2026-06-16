'use strict';
const $ = id => document.getElementById(id);
const DEFAULTS = {
  BTC:{spot:66265,strike:69250,volPct:39},
  ETH:{spot:1763.34,strike:1825,volPct:55}
};
const state = { asset:'BTC', rate:0.037, sources:[], fetched:{}, selectedDays:1, wheelScrollTimer:null };
const els = {
  pwaStatus:$('pwaStatus'), refreshBtn:$('refreshBtn'), modeBadge:$('modeBadge'), lastUpdated:$('lastUpdated'),
  fatSuccessRate:$('fatSuccessRate'), normalSuccessRate:$('normalSuccessRate'), exerciseRate:$('exerciseRate'), fatExerciseRate:$('fatExerciseRate'),
  riskBox:$('riskBox'), riskTitle:$('riskTitle'), riskDesc:$('riskDesc'), spotInput:$('spotInput'), strikeInput:$('strikeInput'), spotDisplay:$('spotDisplay'), strikeDisplay:$('strikeDisplay'),
  daysWheel:$('daysWheel'), daysOut:$('daysOut'), daysLabel:$('daysLabel'), expiryHint:$('expiryHint'), volRange:$('volRange'), volOut:$('volOut'), volLabel:$('volLabel'), rateOut:$('rateOut'), autoModeText:$('autoModeText'),
  sensitivityBody:$('sensitivityBody'), d1Out:$('d1Out'), d2Out:$('d2Out'), volSourceOut:$('volSourceOut'), sourceList:$('sourceList'), toast:$('toast')
};

init();
function init(){ registerPWA(); buildDaysPicker(); bindEvents(); setDefaults('BTC'); calculate(); syncMarket(false); }
function bindEvents(){
  document.querySelectorAll('[data-asset]').forEach(btn=>btn.addEventListener('click',()=>{
    state.asset=btn.dataset.asset;
    document.querySelectorAll('[data-asset]').forEach(b=>b.classList.toggle('active',b===btn));
    setDefaults(state.asset); calculate(); syncMarket(true);
  }));
  els.refreshBtn.addEventListener('click',()=>syncMarket(true));
  [els.spotInput, els.strikeInput, els.volRange].forEach(el=>el.addEventListener('input', calculate));
  if(els.daysWheel){
    els.daysWheel.addEventListener('click', e=>{ const opt=e.target.closest('[data-day]'); if(opt) selectDay(Number(opt.dataset.day), true); });
    els.daysWheel.addEventListener('scroll', ()=>{ clearTimeout(state.wheelScrollTimer); state.wheelScrollTimer=setTimeout(syncDayFromScroll, 80); }, {passive:true});
    els.daysWheel.addEventListener('wheel', e=>{ e.preventDefault(); const delta=e.deltaY>0?1:-1; selectDay(clamp(state.selectedDays+delta,0,90), true); }, {passive:false});
  }
}

function buildDaysPicker(){
  if(!els.daysWheel) return;
  const maxDays = 90;
  els.daysWheel.innerHTML = '<div class="wheel-pad" aria-hidden="true"></div>';
  for(let i=0;i<=maxDays;i++){
    const opt=document.createElement('button');
    opt.type='button';
    opt.className='day-option';
    opt.dataset.day=String(i);
    opt.setAttribute('role','option');
    opt.textContent=i===0?'今天':String(i);
    els.daysWheel.appendChild(opt);
  }
  els.daysWheel.insertAdjacentHTML('beforeend','<div class="wheel-pad" aria-hidden="true"></div>');
  requestAnimationFrame(()=>selectDay(1, true));
}
function selectDay(day, scroll){
  state.selectedDays = Number(clamp(day,0,90));
  if(els.daysWheel){
    els.daysWheel.querySelectorAll('.day-option').forEach(opt=>{
      const active = Number(opt.dataset.day)===state.selectedDays;
      opt.classList.toggle('active', active);
      opt.setAttribute('aria-selected', active?'true':'false');
    });
    if(scroll){
      const active = els.daysWheel.querySelector(`.day-option[data-day="${state.selectedDays}"]`);
      if(active) active.scrollIntoView({block:'center', behavior:'smooth'});
    }
  }
  calculate();
}
function syncDayFromScroll(){
  if(!els.daysWheel) return;
  const box = els.daysWheel.getBoundingClientRect();
  const center = box.top + box.height/2;
  let best=null, dist=Infinity;
  els.daysWheel.querySelectorAll('.day-option').forEach(opt=>{
    const r=opt.getBoundingClientRect();
    const d=Math.abs((r.top+r.height/2)-center);
    if(d<dist){dist=d; best=opt;}
  });
  if(best){ selectDay(Number(best.dataset.day), false); best.scrollIntoView({block:'center', behavior:'smooth'}); }
}
function getDayInfo(){
  const selected = Number(state.selectedDays ?? 1);
  if(selected===0){
    const now = new Date();
    const expiry = new Date(now);
    expiry.setHours(16,0,0,0);
    if(expiry <= now) expiry.setDate(expiry.getDate()+1);
    const hours = Math.max((expiry-now)/36e5, 0.25);
    const effectiveDays = hours/24;
    return {selectedDays:0, effectiveDays, label:'今天', hint:`今天 16:00 結算，約 ${hours.toFixed(1)} 小時；BS T = ${effectiveDays.toFixed(3)} / 365`};
  }
  return {selectedDays:selected, effectiveDays:selected, label:`${selected} 天`, hint:`${selected} 天到期，BS T = ${selected} / 365`};
}

function setDefaults(asset){
  const d = state.fetched[asset] || DEFAULTS[asset];
  els.spotInput.value = d.spot;
  els.strikeInput.value = d.strike;
  els.volRange.value = d.volPct;
  updateLabels();
}
function syncMarket(showToast=true){
  const asset = state.asset;
  const started = Date.now();
  if(showToast) toast('背景同步中，先用目前數值計算');
  els.refreshBtn.disabled = true; els.refreshBtn.textContent = '同步中';
  setStatus('同步中：價格 / DVOL / 利率背景更新');
  calculate();

  const tasks = [
    fetchSpot(asset).then(x=>applyFetch(asset,'spot',x)).catch(()=>addSource('Binance Spot 失敗：保留目前現價，可手動修正')),
    fetchVol(asset).then(x=>applyFetch(asset,'vol',x)).catch(()=>addSource('Deribit/HV 失敗：保留目前 IV，可手動調整')),
    fetchRate().then(x=>applyFetch(asset,'rate',x)).catch(()=>applyFetch(asset,'rate',{value:0.037,source:'利率採預設 3.70%'}))
  ];
  Promise.allSettled(tasks).then(()=>{
    if(asset!==state.asset) return;
    const sec = ((Date.now()-started)/1000).toFixed(1);
    els.lastUpdated.textContent = '最後更新：'+new Date().toLocaleString('zh-TW',{hour12:false})+`（${sec} 秒）`;
    els.refreshBtn.disabled=false; els.refreshBtn.textContent='同步';
    rememberCurrent(asset);
    calculate();
    if(showToast) toast('同步完成');
  });
}
function applyFetch(asset, kind, result){
  if(asset!==state.asset) return;
  addSource(result.source);
  if(kind==='spot') els.spotInput.value = round(result.value, asset==='BTC'?0:2);
  if(kind==='vol') els.volRange.value = round(result.value*100,2);
  if(kind==='rate') state.rate = result.value || 0.037;
  rememberCurrent(asset);
  calculate();
}
function addSource(source){
  if(!source) return;
  state.sources = [source, ...(state.sources||[]).filter(s=>s!==source)].slice(0,5);
  renderSources();
}
function rememberCurrent(asset){
  state.fetched[asset]={spot:Number(els.spotInput.value), strike:Number(els.strikeInput.value), volPct:Number(els.volRange.value)};
}
function calculate(){
  updateLabels();
  const S=Number(els.spotInput.value), K=Number(els.strikeInput.value), dayInfo=getDayInfo(), days=dayInfo.effectiveDays, sigma=Number(els.volRange.value)/100, r=Number(state.rate||0.037);
  const type = S>0 && K>0 ? (K>=S?'高賣':'低買') : '--';
  els.modeBadge.textContent = `${state.asset}｜${type}`;
  els.autoModeText.textContent = type==='--' ? '自動模式判斷：--' : `${type}：${K>=S?'目標價高於現價':'目標價低於現價'}，裁決固定用肥尾 σ×1.5。`;
  if(!(S>0 && K>0 && days>0 && sigma>0)){ setEmpty(); return; }
  const T = days / 365;
  const normal = calcBS(S,K,r,sigma,T,type);
  const fat = calcBS(S,K,r,sigma*1.5,T,type);
  els.normalSuccessRate.textContent=pct(normal.success);
  els.exerciseRate.textContent=pct(normal.exercise);
  els.fatSuccessRate.textContent=pct(fat.success);
  els.fatExerciseRate.textContent=pct(fat.exercise);
  els.d1Out.textContent=fmt(normal.d1,4);
  els.d2Out.textContent=fmt(normal.d2,4);
  els.volSourceOut.textContent=volSource();
  renderSources(); renderSensitivity(S,K,r,sigma,T,type); renderRisk(fat.success,normal.success,fat.exercise,type);
}
function calcBS(S,K,r,sigma,T,type){
  const sqrtT=Math.sqrt(T);
  const d1=(Math.log(S/K)+(r+0.5*sigma*sigma)*T)/(sigma*sqrtT);
  const d2=d1-sigma*sqrtT;
  const exercise = type==='高賣' ? N(d2) : N(-d2);
  return {d1,d2,success:clamp(1-exercise,0,1),exercise:clamp(exercise,0,1)};
}
function renderRisk(success, normalSuccess, fatExercise, type){
  els.riskBox.className='risk-box';
  let title, cls;
  if(success>=0.9){ title='綠燈：相對安全'; cls='green'; }
  else if(success>=0.8){ title='黃燈：需控倉'; cls='yellow'; }
  else if(success>=0.7){ title='橘燈：偏緊繃'; cls='orange'; }
  else { title='紅燈：偏危險'; cls='red'; }
  els.riskBox.classList.add(cls);
  els.riskTitle.textContent=title;
  els.riskDesc.textContent=`${type}肥尾成功率 ${pct(success)}；正常成功率 ${pct(normalSuccess)}；肥尾被執行 ${pct(fatExercise)}。`;
}
function renderSensitivity(S,K,r,sigma,T,type){
  const arr=[0.7,0.8,0.9,1,1.1,1.2,1.3];
  els.sensitivityBody.innerHTML = arr.map(m=>{
    const v=sigma*m, n=calcBS(S,K,r,v,T,type), f=calcBS(S,K,r,v*1.5,T,type);
    return `<tr><td>${pct(v)}</td><td>${pct(n.success)}</td><td>${pct(f.success)}</td></tr>`;
  }).join('');
}
function setEmpty(){ ['fatSuccessRate','normalSuccessRate','exerciseRate','fatExerciseRate','d1Out','d2Out','volSourceOut'].forEach(k=>els[k].textContent='--'); }
function updateLabels(){
  const dayInfo = getDayInfo(), vol = Number(els.volRange.value), S=Number(els.spotInput.value), K=Number(els.strikeInput.value);
  els.daysOut.textContent=dayInfo.label; els.daysLabel.textContent=dayInfo.label;
  if(els.expiryHint) els.expiryHint.textContent=dayInfo.hint;
  els.volOut.textContent=vol.toFixed(2)+'%'; els.volLabel.textContent=vol.toFixed(2)+'%';
  els.spotDisplay.textContent = S>0 ? '$'+formatPrice(S) : '--';
  els.strikeDisplay.textContent = K>0 ? '$'+formatPrice(K) : '--';
  els.rateOut.textContent=pct(state.rate||0.037);
}
function renderSources(){ els.sourceList.innerHTML=(state.sources||[]).map(s=>`<li>${escapeHtml(s)}</li>`).join(''); }
function volSource(){ const s=(state.sources||[]).find(x=>/(DVOL|HV)/.test(x||'')); return s?.split('：')[0] || '手動/預設 IV'; }
function setStatus(text){ els.lastUpdated.textContent = text; }
async function fetchWithTimeout(url, ms=2800){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), ms);
  try{ return await fetch(url,{cache:'no-store',signal:ctrl.signal}); }
  finally{ clearTimeout(t); }
}
async function fetchSpot(asset){
  const symbol=asset+'USDT';
  const r=await fetchWithTimeout(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,2600);
  if(!r.ok) throw Error('spot');
  const j=await r.json(); const price=Number(j.price); if(!(price>0)) throw Error('spot empty');
  return {value:price, source:`Binance Spot ${symbol}：${price.toLocaleString()}`};
}
async function fetchVol(asset){
  try{
    const end=Date.now(), start=end-86400000*3;
    const r=await fetchWithTimeout(`https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=${asset}&start_timestamp=${start}&end_timestamp=${end}&resolution=3600`,3200);
    if(!r.ok) throw Error('dvol');
    const j=await r.json(); const data=j.result?.data||[]; const last=data[data.length-1];
    const v=Array.isArray(last)?Number(last[1]):Number(last?.volatility);
    if(v>0) return {value:v/100, source:`Deribit ${asset} DVOL：${v.toFixed(2)}%`};
    throw Error('dvol empty');
  }catch(e){ return fetchHV(asset,30); }
}
async function fetchHV(asset,days){
  try{
    const symbol=asset+'USDT';
    const r=await fetchWithTimeout(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=${days+1}`,2800);
    if(!r.ok) throw Error('hv');
    const rows=await r.json(); const closes=rows.map(x=>Number(x[4])).filter(Boolean);
    if(closes.length<3) throw Error('hv empty');
    const rets=[]; for(let i=1;i<closes.length;i++) rets.push(Math.log(closes[i]/closes[i-1]));
    const hv=std(rets)*Math.sqrt(365);
    return {value:hv, source:`Binance ${asset} HV${days}：${(hv*100).toFixed(2)}%`};
  }catch(e){ if(days===30) return fetchHV(asset,7); throw e; }
}
async function fetchRate(){
  try{
    const r=await fetchWithTimeout('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS3MO',900);
    if(!r.ok) throw Error('fred');
    const text=await r.text(); const lines=text.trim().split('\n').slice(1).reverse();
    for(const line of lines){ const [date,val]=line.split(','); const n=Number(val); if(Number.isFinite(n)) return {value:n/100, source:`FRED DGS3MO：${n.toFixed(2)}% (${date})`}; }
    throw Error('fred empty');
  }catch(e){ return {value:0.037, source:'FRED DGS3MO 讀取失敗：採預設 3.70%'}; }
}
function N(x){ const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911; const sign=x<0?-1:1; x=Math.abs(x)/Math.sqrt(2); const t=1/(1+p*x); const y=1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x); return 0.5*(1+sign*y); }
function std(a){ const m=a.reduce((s,x)=>s+x,0)/a.length; return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1)); }
function pct(x){ return Number.isFinite(x)?(x*100).toFixed(2)+'%':'--'; }
function fmt(x,n=2){ return Number.isFinite(x)?x.toFixed(n):'--'; }
function round(x,n=2){ const p=10**n; return Math.round(x*p)/p; }
function clamp(x,a,b){ return Math.max(a,Math.min(b,x)); }
function formatPrice(x){ return Number(x).toLocaleString(undefined,{maximumFractionDigits:x>10000?0:2}); }
function toast(msg){ els.toast.textContent=msg; els.toast.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>els.toast.classList.remove('show'),1800); }
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function registerPWA(){
  const manifest={name:'雙幣理財風險分析助理',short_name:'雙幣風險',start_url:'.',display:'standalone',background_color:'#090d18',theme_color:'#090d18',icons:[]};
  const url=URL.createObjectURL(new Blob([JSON.stringify(manifest)],{type:'application/json'}));
  const link=document.createElement('link'); link.rel='manifest'; link.href=url; document.head.appendChild(link);
  if('serviceWorker' in navigator){
    const sw=`self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>clients.claim());self.addEventListener('fetch',e=>{});`;
    const swUrl=URL.createObjectURL(new Blob([sw],{type:'text/javascript'}));
    navigator.serviceWorker.register(swUrl).then(()=>els.pwaStatus.textContent='PWA').catch(()=>els.pwaStatus.textContent='PWA');
  }
}
