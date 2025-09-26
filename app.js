// app.js - обновена версия: populate dropdown + autocomplete + indicators + chart
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const symbolInput = document.getElementById('symbolInput');
const suggestions = document.getElementById('suggestions');
const symbolSelect = document.getElementById('symbolSelect');
const loadBtn = document.getElementById('loadBtn');
const resetBtn = document.getElementById('resetBtn');
const tfSelect = document.getElementById('tfSelect');
const limitSelect = document.getElementById('limitSelect');
const symbolTitle = document.getElementById('symbolTitle');
const indicatorSummary = document.getElementById('indicatorSummary');

let coinsList = []; // [{id,name,symbol}]
let currentCoin = null;
let chart, candleSeries, buySeries, sellSeries;

function initChart(){
  const chartContainer = document.getElementById('chart');
  chartContainer.innerHTML = '';
  chart = LightweightCharts.createChart(chartContainer, {
    layout: { background: '#081220', textColor: '#dbeafe' },
    grid: { vertLines: { color: 'rgba(255,255,255,0.03)' }, horzLines: { color: 'rgba(255,255,255,0.02)' } },
    timeScale: { timeVisible: true, secondsVisible: false },
    localization: { priceFormatter: price => price.toFixed(6) }
  });
  candleSeries = chart.addCandlestickSeries({
    upColor: '#16a34a', downColor: '#ef4444', borderVisible: false, wickUpColor: '#16a34a', wickDownColor: '#ef4444'
  });
  buySeries = chart.addPointSeries({ shape: 'arrowUp', color: '#10b981', size: 1.6 });
  sellSeries = chart.addPointSeries({ shape: 'arrowDown', color: '#ef4444', size: 1.6 });
}
initChart();

// Load top-200 coins and populate dropdown
async function loadTopCoins(){
  try {
    const res = await fetch(`${COINGECKO_API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1&sparkline=false`);
    const data = await res.json();
    coinsList = data.map(c => ({ id: c.id, name: c.name, symbol: c.symbol.toUpperCase() }));
    populateSelect();
  } catch(err){
    console.error('Failed to load coins', err);
    symbolSelect.innerHTML = '<option value="">Неуспешно зареждане</option>';
  }
}
function populateSelect(){
  symbolSelect.innerHTML = '<option value="">-- избери монета --</option>';
  for(const c of coinsList){
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.symbol})`;
    symbolSelect.appendChild(opt);
  }
}
loadTopCoins();

// Select change -> set currentCoin and update input display
symbolSelect.addEventListener('change', () => {
  const id = symbolSelect.value;
  if(!id){ currentCoin = null; symbolTitle.textContent = 'Няма избрана монета'; return; }
  const found = coinsList.find(c=>c.id === id);
  if(found){ currentCoin = found; symbolInput.value = `${found.name} (${found.symbol})`; symbolTitle.textContent = `${found.name} (${found.symbol})`; }
});

// Autocomplete
symbolInput.addEventListener('input', onInput);
symbolInput.addEventListener('focus', onInput);
document.addEventListener('click', (e) => { if(!e.target.closest('.autocomplete-wrap')) suggestions.innerHTML = ''; });

function onInput(){
  const q = symbolInput.value.trim().toLowerCase();
  suggestions.innerHTML = '';
  if(!q) return;
  const matches = coinsList.filter(c => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q)).slice(0,12);
  for(const m of matches){
    const li = document.createElement('li');
    li.textContent = `${m.name} (${m.symbol})`;
    li.dataset.coinId = m.id;
    li.setAttribute('role','option');
    li.addEventListener('click', () => {
      symbolInput.value = `${m.name} (${m.symbol})`;
      suggestions.innerHTML = '';
      currentCoin = m;
      // sync dropdown
      symbolSelect.value = m.id;
      symbolTitle.textContent = `${m.name} (${m.symbol})`;
    });
    suggestions.appendChild(li);
  }
}

// Reset
resetBtn.addEventListener('click', () => {
  symbolInput.value = '';
  suggestions.innerHTML = '';
  symbolSelect.value = '';
  currentCoin = null;
  symbolTitle.textContent = 'Няма избрана монета';
  indicatorSummary.textContent = '';
  initChart();
});

// Load button
loadBtn.addEventListener('click', async () => {
  // If user selected from dropdown use that, else try currentCoin from autocomplete
  let coinId = symbolSelect.value;
  if(!coinId && currentCoin) coinId = currentCoin.id;
  if(!coinId){
    // try exact match by typed name or symbol
    const q = symbolInput.value.trim().toLowerCase();
    const found = coinsList.find(c => c.name.toLowerCase()===q || c.symbol.toLowerCase()===q);
    if(found) coinId = found.id;
  }
  if(!coinId){ alert('Моля избери валута от dropdown или autocomplete (top-200).'); return; }
  const found = coinsList.find(c=>c.id===coinId);
  if(found){ currentCoin = found; symbolInput.value = `${found.name} (${found.symbol})`; symbolSelect.value = found.id; }
  symbolTitle.textContent = `${currentCoin.name} (${currentCoin.symbol})`;
  await loadAndRender(currentCoin.id);
});

// Fetch OHLC from CoinGecko
async function fetchOHLC(coinId, days=7){
  const url = `${COINGECKO_API}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('OHLC fetch failed');
  const data = await res.json();
  return data.map(d => ({
    time: Math.floor(d[0]/1000),
    open: d[1],
    high: d[2],
    low: d[3],
    close: d[4]
  }));
}

// Indicators (sma, ema, macd, rsi, atr) - same implementations
function sma(values, period){
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for(let i=0;i<values.length;i++){
    sum += values[i];
    if(i>=period) sum -= values[i-period];
    if(i>=period-1) out[i] = sum/period;
  }
  return out;
}
function ema(values, period){
  const out = new Array(values.length).fill(null);
  const k = 2/(period+1);
  let prev = 0;
  let seedSum = 0;
  for(let i=0;i<values.length;i++){
    if(i < period){ seedSum += values[i]; if(i===period-1){ prev = seedSum/period; out[i]=prev; } }
    else { prev = values[i]*k + prev*(1-k); out[i] = prev; }
  }
  return out;
}
function macd(values, fast=12, slow=26, signal=9){
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine = values.map((v,i) => (emaFast[i]!=null && emaSlow[i]!=null) ? (emaFast[i] - emaSlow[i]) : null);
  const signalLine = ema(macdLine.map(v=>v===null?0:v), signal);
  const hist = macdLine.map((v,i) => (v!=null && signalLine[i]!=null) ? (v - signalLine[i]) : null );
  const crossUp = new Array(values.length).fill(false);
  const crossDown = new Array(values.length).fill(false);
  for(let i=1;i<values.length;i++){
    if(macdLine[i-1]!=null && signalLine[i-1]!=null && macdLine[i]!=null && signalLine[i]!=null){
      if(macdLine[i-1] <= signalLine[i-1] && macdLine[i] > signalLine[i]) crossUp[i] = true;
      if(macdLine[i-1] >= signalLine[i-1] && macdLine[i] < signalLine[i]) crossDown[i] = true;
    }
  }
  return { macdLine, signalLine, hist, crossUp, crossDown };
}
function rsi(values, period=14){
  const out = new Array(values.length).fill(null);
  let avgGain=0, avgLoss=0;
  for(let i=1;i<values.length;i++){
    const change = values[i] - values[i-1];
    const gain = Math.max(0, change);
    const loss = Math.max(0, -change);
    if(i <= period){
      avgGain += gain; avgLoss += loss;
      if(i===period){ avgGain/=period; avgLoss/=period; out[i] = avgLoss===0 ? 100 : 100 - (100/(1 + avgGain/avgLoss)); }
    } else {
      avgGain = (avgGain*(period-1) + gain)/period;
      avgLoss = (avgLoss*(period-1) + loss)/period;
      out[i] = avgLoss===0 ? 100 : 100 - (100/(1 + avgGain/avgLoss));
    }
  }
  return out;
}
function atr(highs, lows, closes, period=14){
  const out = new Array(highs.length).fill(null);
  const tr = new Array(highs.length).fill(null);
  for(let i=0;i<highs.length;i++){
    if(i===0) tr[i] = highs[i] - lows[i];
    else tr[i] = Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1]));
  }
  let sum = 0;
  for(let i=0;i<tr.length;i++){
    if(i < period){ sum += tr[i]; if(i===period-1){ out[i] = sum/period; } }
    else if(i >= period){ out[i] = (out[i-1]*(period-1) + tr[i]) / period; }
  }
  return out;
}
function unzipOHLC(ohlc){
  const closes = ohlc.map(x=>x.close);
  const highs = ohlc.map(x=>x.high);
  const lows = ohlc.map(x=>x.low);
  const volumes = ohlc.map(_=>0);
  return { closes, highs, lows, volumes };
}

// Signals
function generateSignals(ohlc){
  const { closes, highs, lows, volumes } = unzipOHLC(ohlc);
  const len = closes.length;
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const mac = macd(closes, 12, 26, 9);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(highs, lows, closes, 14);
  const volMA = sma(volumes, 20);

  const signals = [];
  for(let i=0;i<len;i++){
    if(i<200) continue;
    const trendLong = ema50[i] != null && ema200[i] != null && ema50[i] > ema200[i];
    const trendShort = ema50[i] != null && ema200[i] != null && ema50[i] < ema200[i];
    const macUp = mac.crossUp[i];
    const macDown = mac.crossDown[i];
    const rsiVal = rsi14[i];
    const buyCond = trendLong && macUp && rsiVal !== null && rsiVal > 40;
    const sellCond = trendShort && macDown && rsiVal !== null && rsiVal < 60;
    if(buyCond){
      signals.push({ time: ohlc[i].time, type: 'buy', price: ohlc[i].low * 0.997, reason: `EMA50>EMA200; MACD up; RSI=${rsiVal.toFixed(1)}` });
    } else if(sellCond){
      signals.push({ time: ohlc[i].time, type: 'sell', price: ohlc[i].high * 1.003, reason: `EMA50<EMA200; MACD down; RSI=${rsiVal.toFixed(1)}` });
    }
  }
  return { signals, ema50, ema200, mac, rsi14, atr14 };
}

// Render
async function loadAndRender(coinId){
  const days = tfSelect.value;
  const limit = parseInt(limitSelect.value,10);
  symbolTitle.textContent = `${currentCoin.name} (${currentCoin.symbol}) — зареждане...`;
  try {
    let ohlc = await fetchOHLC(coinId, days);
    if(!ohlc || ohlc.length===0) throw new Error('No OHLC returned');
    if(ohlc.length > limit) ohlc = ohlc.slice(ohlc.length - limit);
    candleSeries.setData(ohlc);
    const { signals, ema50, ema200, mac, rsi14, atr14 } = generateSignals(ohlc);

    const buyPoints = signals.filter(s=>s.type==='buy').map(s=>({ time: s.time, price: s.price }));
    const sellPoints = signals.filter(s=>s.type==='sell').map(s=>({ time: s.time, price: s.price }));
    buySeries.setData(buyPoints.map(p=>({ time: p.time, position: 'belowBar', color:'#10b981', shape:'arrowUp', text:'BUY', price:p.price })));
    sellSeries.setData(sellPoints.map(p=>({ time: p.time, position: 'aboveBar', color:'#ef4444', shape:'arrowDown', text:'SELL', price:p.price })));

    const last = ohlc[ohlc.length-1];
    const lastIdx = ohlc.length-1;
    const lastEMA50 = ema50[lastIdx] || 0;
    const lastEMA200 = ema200[lastIdx] || 0;
    const lastMACD = mac.hist[lastIdx] || 0;
    const lastRSI = rsi14[lastIdx] || 0;
    const lastATR = atr14[lastIdx] || 0;

    const trendText = lastEMA50 > lastEMA200 ? 'Bullish (EMA50 > EMA200)' : (lastEMA50 < lastEMA200 ? 'Bearish (EMA50 < EMA200)' : 'Neutral');
    indicatorSummary.textContent =
`Последна цена: ${last.close}
Trend: ${trendText}
MACD histogram (последен): ${lastMACD.toFixed(6)}
RSI(14): ${lastRSI.toFixed(2)}
ATR(14): ${lastATR.toFixed(6)}
Сигнали намерени: ${signals.length}
Последни 5 сигнала:
${signals.slice(-5).map(s=>`${new Date(s.time*1000).toLocaleString()} ${s.type.toUpperCase()} ${s.reason}`).join('\n')}`;

    symbolTitle.textContent = `${currentCoin.name} (${currentCoin.symbol}) — ${last.close}`;
  } catch(err){
    console.error(err);
    alert('Грешка при зареждането на данни: ' + err.message);
    symbolTitle.textContent = `${currentCoin ? currentCoin.name : ''} — Грешка`;
  }
}