from __future__ import annotations

import json
from pathlib import Path

from export_liftedtrucks_turn_dashboard import build_data, build_insights, build_summary


OUTPUT_HTML = Path(r"D:\liftedtrucks_turnover_dashboard_20260401.html")


def _make_options(values: list[str]) -> str:
    return "".join(f'<option value="{value}">{value}</option>' for value in values)


def _css() -> str:
    return """
:root{--bg:#efede6;--panel:rgba(255,255,255,.78);--panel2:#fbfaf6;--stroke:rgba(17,24,39,.08);--text:#18181b;--muted:#6b7280;--soft:#f4f1e8;--accent:#0f766e;--gold:#b78933;--r:22px;--shadow:0 22px 44px rgba(15,23,42,.08);--ui:"SF Pro Display","Aptos","Segoe UI Variable","Segoe UI",sans-serif}
*{box-sizing:border-box}body{margin:0;font-family:var(--ui);color:var(--text);background:radial-gradient(circle at top left,rgba(255,255,255,.72),transparent 34%),linear-gradient(180deg,#f5f2ea 0%,#ebe8df 100%);min-height:100vh}
.app{max-width:1760px;margin:0 auto;padding:28px}.card,.filters,.inventory,.detail,.insights{background:var(--panel);backdrop-filter:blur(22px);border:1px solid var(--stroke);border-radius:var(--r);box-shadow:var(--shadow)}
.hero{display:grid;grid-template-columns:1.7fr 1fr;gap:18px;margin-bottom:18px}.hero-main{padding:28px;background:linear-gradient(145deg,rgba(255,255,255,.92),rgba(249,247,241,.76))}.hero-main h1{margin:0 0 8px;font-size:clamp(34px,4vw,56px);letter-spacing:-.05em;line-height:.95}.hero-main p{margin:0;color:var(--muted);font-size:15px;max-width:60ch}.hero-meta{margin-top:18px;display:flex;flex-wrap:wrap;gap:10px}.pill{padding:9px 14px;border-radius:999px;background:var(--soft);font-size:12px;border:1px solid rgba(17,24,39,.05)}
.hero-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.stat{padding:18px 20px;text-align:left}.stat-btn{cursor:pointer;transition:transform .14s ease,background .14s ease,border-color .14s ease}.stat-btn:hover{transform:translateY(-1px);background:rgba(255,255,255,.92)}.stat-btn.active{border-color:rgba(15,118,110,.25);background:rgba(15,118,110,.08)}.label{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:16px}.value{font-size:34px;line-height:1;letter-spacing:-.05em;margin-bottom:10px}.sub{color:var(--muted);font-size:13px}
.filters{position:sticky;top:12px;z-index:12;padding:16px;margin-bottom:18px}.fg{display:grid;grid-template-columns:1.2fr .8fr 1.35fr .8fr .8fr .75fr .9fr auto auto auto;gap:12px;align-items:end}.field{display:flex;flex-direction:column;gap:6px}.field label{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted)}.field input,.field select,.field textarea{width:100%;border:1px solid rgba(17,24,39,.08);background:rgba(255,255,255,.9);color:var(--text);padding:12px 14px;border-radius:14px;font:inherit;outline:none}.field input:focus,.field select:focus,.field textarea:focus{border-color:rgba(15,118,110,.35);box-shadow:0 0 0 4px rgba(15,118,110,.08)}.btn{border:0;border-radius:14px;padding:12px 14px;background:#111827;color:#fff;font:inherit;cursor:pointer;min-height:46px}.btn.alt{background:rgba(17,24,39,.06);color:var(--text)}
.year-field .range-stack{padding:10px 12px;border:1px solid rgba(17,24,39,.08);background:rgba(255,255,255,.9);border-radius:14px}.year-line{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--muted);margin-bottom:6px}.year-sliders{display:grid;gap:8px}.year-sliders input{padding:0;border:0;background:transparent}
.insights{padding:18px;margin-bottom:18px}.insights-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:14px}.insights-head h2{margin:0;font-size:22px;letter-spacing:-.04em}.insights-head p{margin:6px 0 0;color:var(--muted);font-size:13px}.insight-grid{display:grid;grid-template-columns:repeat(7,minmax(220px,1fr));gap:12px;overflow:auto;padding-bottom:4px}.insight-card{background:var(--panel2);border:1px solid var(--stroke);border-radius:18px;padding:14px 14px 10px}.insight-card h3{margin:0 0 12px;font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted)}.insight-item{width:100%;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;border:0;background:rgba(17,24,39,.03);padding:10px 12px;border-radius:12px;margin-bottom:8px;cursor:pointer;text-align:left}.insight-item:hover{background:rgba(15,118,110,.08)}.insight-name{font-size:13px;font-weight:600;line-height:1.3}.insight-meta{font-size:11px;color:var(--muted);margin-top:4px}.insight-score{font-size:12px;font-weight:700;color:var(--accent)}
.layout{display:grid;grid-template-columns:1.32fr 1fr;gap:18px;min-height:72vh}.layout.inventory-only{grid-template-columns:1fr}.layout.inventory-only .detail{display:none}.inventory{overflow:hidden;display:flex;flex-direction:column}.inventory-h{padding:18px 20px 14px;border-bottom:1px solid var(--stroke);display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.inventory-h h2{font-size:22px;letter-spacing:-.04em;margin:0}.inventory-tools{display:flex;gap:10px;align-items:center}
.cols,.row{display:grid;grid-template-columns:54px 66px 92px 1.55fr 78px 82px 82px 118px 82px 112px;gap:12px;align-items:center}.cols{padding:0 20px 12px}.colbtn{border:0;background:transparent;padding:0;text-align:left;color:var(--muted);font-size:11px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}.colbtn:hover{color:var(--text)}.colbtn.active{color:var(--accent)}.rows{overflow:auto;padding:0 10px 10px 20px}.row{margin-right:10px;padding:14px 12px;border-radius:18px;cursor:pointer;border:1px solid transparent;transition:transform .16s ease,background .16s ease,border-color .16s ease}.row:hover{transform:translateY(-1px);background:rgba(255,255,255,.55);border-color:rgba(17,24,39,.06)}.row.active{background:rgba(15,118,110,.10);border-color:rgba(15,118,110,.18)}.vtitle{font-size:16px;letter-spacing:-.03em;font-weight:600;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.vsub{display:flex;flex-wrap:wrap;gap:8px;color:var(--muted);font-size:12px}.mini{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:rgba(17,24,39,.05)}.score{display:inline-flex;justify-content:center;align-items:center;min-width:64px;padding:8px 12px;border-radius:999px;font-weight:700;background:rgba(15,118,110,.12);color:var(--accent)}.chip{display:inline-flex;justify-content:center;align-items:center;min-width:106px;padding:8px 12px;border-radius:999px;font-size:12px;font-weight:600;background:rgba(183,137,51,.12);color:var(--gold)}.num{font-variant-numeric:tabular-nums}
.detail{padding:22px;display:flex;flex-direction:column;gap:18px;overflow:auto}.top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.detail h2{margin:0;font-size:31px;letter-spacing:-.05em;line-height:1}.small{color:var(--muted);font-size:13px;margin-top:8px}.rcol{text-align:right}.rank{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:10px}.rankv{font-size:42px;line-height:1;letter-spacing:-.06em}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metric,.section{padding:16px;background:var(--panel2);border:1px solid var(--stroke);border-radius:18px}.section{padding:18px;border-radius:20px}.section h3{margin:0 0 14px;font-size:15px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.causes{display:flex;flex-wrap:wrap;gap:10px}.cause{padding:10px 12px;border-radius:14px;background:rgba(17,24,39,.05);font-size:13px;line-height:1.35}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.metalist{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.meta{padding:12px;border-radius:16px;background:rgba(17,24,39,.04)}.meta label{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}.meta strong{display:block;font-size:15px;line-height:1.35}.bars{display:grid;gap:12px}.bar{display:grid;grid-template-columns:130px 1fr 52px;gap:10px;align-items:center}.track{height:10px;border-radius:999px;background:rgba(17,24,39,.08);overflow:hidden}.fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#0f766e,#16a34a)}.footer{color:var(--muted);font-size:12px;line-height:1.5}.empty{padding:40px 20px 50px;text-align:center;color:var(--muted)}
@media(max-width:1500px){.fg{grid-template-columns:1.1fr .8fr 1.25fr .8fr .8fr .75fr .9fr auto auto auto}.insight-grid{grid-template-columns:repeat(4,minmax(220px,1fr))}}
@media(max-width:1380px){.layout{grid-template-columns:1fr}.insight-grid{grid-template-columns:repeat(3,minmax(220px,1fr))}}
@media(max-width:1080px){.fg{grid-template-columns:repeat(4,minmax(160px,1fr))}.year-field{grid-column:span 2}.hero{grid-template-columns:1fr}.hero-stats{grid-template-columns:repeat(2,1fr)}.metrics{grid-template-columns:repeat(2,1fr)}.grid2,.metalist{grid-template-columns:1fr}.cols,.row{grid-template-columns:54px 62px 84px 1.35fr 72px 72px 72px 100px 72px 98px}.insight-grid{grid-template-columns:repeat(2,minmax(220px,1fr))}}
@media(max-width:760px){.app{padding:16px}.hero-stats{grid-template-columns:1fr}.fg{grid-template-columns:1fr}.year-field{grid-column:auto}.insight-grid{grid-template-columns:1fr}.cols{display:none}.row{grid-template-columns:1fr}.metrics{grid-template-columns:1fr 1fr}}
"""


def _js() -> str:
    return """
const HOTNESS_ORDER = {'Hot now':0,'Strong watch':1,'Review':2,'Lower priority':3};
const SORT_DEFAULTS = {rank:'asc',year:'desc',make:'asc',model:'asc',clicks:'desc',velocity:'desc',days:'asc',price:'asc',turn:'desc',hotness:'asc'};
const state = {
  search:'',
  make:'',
  yearMin:DEFAULTS.minYear,
  yearMax:DEFAULTS.maxYear,
  maxPrice:DEFAULTS.maxPrice,
  maxMiles:DEFAULTS.maxMiles,
  minClicks:0,
  sortKey:'turn',
  sortDir:'desc',
  preset:'all',
  inventoryOnly:false,
  selected:DATA[0] ? DATA[0].vin : null,
  notes:JSON.parse(localStorage.getItem('lifted_notes') || '{}'),
  actions:JSON.parse(localStorage.getItem('lifted_actions') || '{}')
};
const $ = id => document.getElementById(id);
const fmtC = value => value == null ? '-' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
const fmtN = value => value == null ? '-' : new Intl.NumberFormat('en-US').format(value);
const fmt1 = value => value == null ? '-' : Number(value).toFixed(1);
const scrollToWorkspace = () => document.getElementById('workspace').scrollIntoView({behavior:'smooth', block:'start'});
const presetName = () => ({all:'All units',hot:'Hot units',aged:'Aged and engaged'}[state.preset] || 'All units');
const yearText = () => `${state.yearMin} to ${state.yearMax}`;
const filterText = () => [presetName(), state.make || 'All makes', yearText(), `<= ${fmtC(state.maxPrice)}`, `<= ${fmtN(state.maxMiles)} mi`, `>= ${state.minClicks} clicks`].join(' - ');
const haystack = item => [item.title,item.vin,item.make,item.model,item.trim,item.aftermarket_parts,item.carfax_summary,item.wheel_style,item.tire_model,item.lift_brand,item.exterior_color,...(item.mod_tags||[]),...(item.possible_causes||[])].join(' ').toLowerCase();

function sortValue(item, key) {
  if (key === 'rank') return item.rank ?? 9999;
  if (key === 'year') return item.year ?? 0;
  if (key === 'make') return item.make || '';
  if (key === 'model') return `${item.model || ''} ${item.trim || ''}`;
  if (key === 'clicks') return item.website_clicks_7d ?? -1;
  if (key === 'velocity') return item.engagement_per_day ?? -1;
  if (key === 'days') return item.days_in_stock ?? 9999;
  if (key === 'price') return item.vehicle_price ?? item.asking_total ?? 0;
  if (key === 'turn') return item.turn_score ?? 0;
  if (key === 'hotness') return HOTNESS_ORDER[item.hotness] ?? 9;
  return item.turn_score ?? 0;
}

function compareRows(a, b) {
  const av = sortValue(a, state.sortKey);
  const bv = sortValue(b, state.sortKey);
  let result = 0;
  if (typeof av === 'string' || typeof bv === 'string') result = String(av).localeCompare(String(bv));
  else result = av - bv;
  return state.sortDir === 'asc' ? result : -result;
}

function filteredRows() {
  const rows = DATA.filter(item => {
    if (state.preset === 'hot' && item.turn_score < 72) return false;
    if (state.preset === 'aged' && !((item.days_in_stock || 0) >= 60 && (item.click_rank || 999) <= 50)) return false;
    if (state.search && !haystack(item).includes(state.search.toLowerCase())) return false;
    if (state.make && item.make !== state.make) return false;
    if ((item.year ?? 0) < state.yearMin || (item.year ?? 0) > state.yearMax) return false;
    if ((item.vehicle_price ?? item.asking_total ?? 0) > state.maxPrice) return false;
    if ((item.mileage ?? 0) > state.maxMiles) return false;
    if ((item.website_clicks_7d ?? 0) < state.minClicks) return false;
    return true;
  });
  rows.sort(compareRows);
  return rows;
}

function setSort(key) {
  if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  else {
    state.sortKey = key;
    state.sortDir = SORT_DEFAULTS[key] || 'desc';
  }
  $('sortPreset').value = `${state.sortKey}_${state.sortDir}`;
  render();
}

function setPreset(preset, inventoryOnly=true) {
  state.preset = preset;
  state.inventoryOnly = inventoryOnly;
  if (preset === 'all') { state.sortKey = 'turn'; state.sortDir = 'desc'; }
  if (preset === 'hot') { state.sortKey = 'turn'; state.sortDir = 'desc'; }
  if (preset === 'aged') { state.sortKey = 'clicks'; state.sortDir = 'desc'; }
  $('sortPreset').value = `${state.sortKey}_${state.sortDir}`;
  scrollToWorkspace();
  render();
}

function applyInsight(category, label) {
  state.inventoryOnly = true;
  state.preset = 'all';
  if (category === 'years') {
    const year = Number(label);
    state.yearMin = year;
    state.yearMax = year;
    $('yearMin').value = year;
    $('yearMax').value = year;
  } else {
    state.search = label;
    $('search').value = label;
  }
  scrollToWorkspace();
  render();
}

function renderInsights() {
  const titles = {years:'Best Years',models:'Best Models',wheels:'Best Wheels',tires:'Best Tires',lifts:'Best Lift Kits',colors:'Best Colors',parts:'Best Add-On Parts'};
  $('insightGrid').innerHTML = Object.entries(titles).map(([key, title]) => {
    const items = INSIGHTS[key] || [];
    return `<div class="insight-card"><h3>${title}</h3>${items.map(item => `
      <button type="button" class="insight-item" data-category="${key}" data-label="${item.label}">
        <div>
          <div class="insight-name">${item.label}</div>
          <div class="insight-meta">${item.count} units - ${item.avg_clicks} avg clicks - ${item.avg_velocity}/day</div>
        </div>
        <div class="insight-score">${item.score}</div>
      </button>`).join('')}</div>`;
  }).join('');
  document.querySelectorAll('.insight-item').forEach(node => node.addEventListener('click', () => applyInsight(node.dataset.category, node.dataset.label)));
}

function renderRows(rows) {
  if (!rows.length) { $('rows').innerHTML = '<div class="empty">No units match these filters.</div>'; return; }
  $('rows').innerHTML = rows.map(item => {
    const sub = [item.trim || '', item.vin || '', item.wheel_style || item.tire_model || ''].filter(Boolean);
    return `<div class="row ${item.vin === state.selected ? 'active' : ''}" data-vin="${item.vin}">
      <div class="num">${fmtN(item.rank)}</div>
      <div class="num">${fmtN(item.year)}</div>
      <div>${item.make || '-'}</div>
      <div><div class="vtitle">${item.model || ''}</div><div class="vsub">${sub.map(bit => `<span class="mini">${bit}</span>`).join('')}</div></div>
      <div class="num">${fmtN(item.website_clicks_7d)}</div>
      <div class="num">${fmt1(item.engagement_per_day)}</div>
      <div class="num">${fmtN(item.days_in_stock)}</div>
      <div class="num">${fmtC(item.vehicle_price || item.asking_total)}</div>
      <div><span class="score num">${fmt1(item.turn_score)}</span></div>
      <div><span class="chip">${item.hotness}</span></div>
    </div>`;
  }).join('');
  document.querySelectorAll('.row').forEach(node => node.addEventListener('click', () => { state.selected = node.dataset.vin; render(); }));
}

function selectedRow(rows) {
  if (!rows.length) return null;
  const hit = rows.find(item => item.vin === state.selected);
  if (hit) return hit;
  state.selected = rows[0].vin;
  return rows[0];
}

function renderDetail(item) {
  if (!item) { $('detail').innerHTML = '<div class="empty">Select a vehicle to see detail.</div>'; return; }
  const note = state.notes[item.vin] || '';
  const action = state.actions[item.vin] || '';
  const bars = [['Engagement',item.score_breakdown.engagement,60],['Freshness',item.score_breakdown.freshness,15],['Carfax',item.score_breakdown.carfax,10],['Price Edge',item.score_breakdown.price_edge,10],['Build',item.score_breakdown.build,5]];
  $('detail').innerHTML = `<div class="top">
    <div>
      <h2>${item.title}</h2>
      <div class="small">${item.vin} - ${fmtN(item.mileage)} miles - ${item.make} - ${item.drivetrain || '-'}</div>
    </div>
    <div class="rcol"><div class="rank">Turn Score</div><div class="rankv num">${fmt1(item.turn_score)}</div></div>
  </div>
  <div class="metrics">
    <div class="metric"><div class="label">Clicks / 7d</div><div class="value num">${fmtN(item.website_clicks_7d)}</div><div class="sub">${item.click_rank ? `Rank #${item.click_rank}` : 'No public rank'}</div></div>
    <div class="metric"><div class="label">Engagement / Day</div><div class="value num">${fmt1(item.engagement_per_day)}</div><div class="sub">${item.engagement_rank ? `Rank #${item.engagement_rank}` : 'No public rank'}</div></div>
    <div class="metric"><div class="label">Days In Stock</div><div class="value num">${fmtN(item.days_in_stock)}</div><div class="sub">site-age proxy</div></div>
    <div class="metric"><div class="label">Price</div><div class="value num">${fmtC(item.vehicle_price || item.asking_total)}</div><div class="sub">${item.aftermarket_price != null ? `${fmtC(item.aftermarket_price)} aftermarket` : 'aftermarket price not disclosed'}</div></div>
  </div>
  <div class="section"><h3>Why It Gets Attention</h3><div class="causes">${item.possible_causes.map(cause => `<div class="cause">${cause}</div>`).join('')}</div></div>
  <div class="grid2">
    <div class="section"><h3>Vehicle Snapshot</h3><div class="metalist">
      <div class="meta"><label>Vehicle Price</label><strong>${fmtC(item.vehicle_price)}</strong></div>
      <div class="meta"><label>Aftermarket Price</label><strong>${fmtC(item.aftermarket_price)}</strong></div>
      <div class="meta"><label>Peer Median</label><strong>${fmtC(item.peer_median_price)}</strong></div>
      <div class="meta"><label>Exterior Color</label><strong>${item.exterior_color || '-'}</strong></div>
      <div class="meta"><label>Wheel Style</label><strong>${item.wheel_style || '-'}</strong></div>
      <div class="meta"><label>Tire Model</label><strong>${item.tire_model || '-'}</strong></div>
      <div class="meta"><label>Lift Kit</label><strong>${item.lift_brand || '-'}</strong></div>
      <div class="meta"><label>Aftermarket Parts</label><strong>${item.aftermarket_parts || '-'}</strong></div>
    </div></div>
    <div class="section"><h3>Carfax + Plan</h3><div class="metalist">
      <div class="meta"><label>Carfax Summary</label><strong>${item.carfax_summary}</strong></div>
      <div class="meta"><label>Carfax Badge</label><strong>${item.carfax_badge || 'Not exposed'}</strong></div>
      <div class="meta"><label>Engine</label><strong>${item.engine || '-'}</strong></div>
      <div class="meta"><label>Transmission</label><strong>${item.transmission || '-'}</strong></div>
      <div class="meta" style="grid-column:1 / -1"><label>Move This Unit</label><strong>${item.action_plan.join(' ')}</strong></div>
    </div></div>
  </div>
  <div class="section"><h3>Score Breakdown</h3><div class="bars">${bars.map(([label,val,max]) => `<div class="bar"><div class="label">${label}</div><div class="track"><div class="fill" style="width:${Math.max(6,(val/max)*100)}%"></div></div><div class="num">${fmt1(val)}</div></div>`).join('')}</div></div>
  <div class="section"><h3>My Action</h3><div class="grid2">
    <div class="field"><label>Priority</label><select id="actionSel"><option value="">No tag</option><option value="Push Hard" ${action==='Push Hard'?'selected':''}>Push Hard</option><option value="Feature Now" ${action==='Feature Now'?'selected':''}>Feature Now</option><option value="Price Review" ${action==='Price Review'?'selected':''}>Price Review</option><option value="Merch Refresh" ${action==='Merch Refresh'?'selected':''}>Merch Refresh</option><option value="Watch" ${action==='Watch'?'selected':''}>Watch</option></select></div>
    <div class="field"><label>Saved Note</label><textarea id="noteBox" rows="4" placeholder="What do you want to remember about this unit?">${note}</textarea></div>
  </div></div>
  <div class="footer">This dashboard weights engagement the hardest because the goal is fast turnover. Carfax is summarized from dealer-page signals, not direct full-report scraping. Days in stock is a site-age proxy, not true market supply.</div>`;
  $('actionSel').addEventListener('change', event => { state.actions[item.vin] = event.target.value; localStorage.setItem('lifted_actions', JSON.stringify(state.actions)); });
  $('noteBox').addEventListener('input', event => { state.notes[item.vin] = event.target.value; localStorage.setItem('lifted_notes', JSON.stringify(state.notes)); });
}

function renderHeaderState() {
  $('yearReadout').textContent = yearText();
  $('summaryLine').textContent = (() => {
    const rows = filteredRows();
    const avgClicks = rows.length ? (rows.reduce((sum, item) => sum + (item.website_clicks_7d || 0), 0) / rows.length).toFixed(1) : '0.0';
    const avgTurn = rows.length ? (rows.reduce((sum, item) => sum + item.turn_score, 0) / rows.length).toFixed(1) : '0.0';
    return `${rows.length} of ${DATA.length} units - avg clicks ${avgClicks} - avg turn score ${avgTurn}`;
  })();
  $('filterLine').textContent = filterText();
  document.getElementById('workspace').classList.toggle('inventory-only', state.inventoryOnly);
  $('viewToggle').textContent = state.inventoryOnly ? 'Back to Split View' : 'Full Inventory';
  document.querySelectorAll('.colbtn').forEach(node => {
    const base = node.dataset.label || node.textContent.replace(/ [↑↓]$/, '');
    node.dataset.label = base;
    const active = node.dataset.sortKey === state.sortKey;
    node.classList.toggle('active', active);
    node.textContent = active ? `${base} ${state.sortDir === 'asc' ? '↑' : '↓'}` : base;
  });
  $('kpiUnits').classList.toggle('active', state.inventoryOnly && state.preset === 'all');
  $('kpiClicks').classList.toggle('active', state.sortKey === 'clicks' && state.inventoryOnly);
  $('kpiHot').classList.toggle('active', state.preset === 'hot');
  $('kpiAged').classList.toggle('active', state.preset === 'aged');
}

function exportCsv(rows) {
  const headers = ['rank','turn_score','hotness','year','make','model','trim','vin','mileage','vehicle_price','aftermarket_price','days_in_stock','website_clicks_7d','engagement_per_day','wheel_style','tire_model','lift_brand','exterior_color','carfax_summary','aftermarket_parts','possible_causes'];
  const csv = [headers.join(','), ...rows.map(item => headers.map(key => {
    let value = item[key];
    if (Array.isArray(value)) value = value.join(' | ');
    value = value ?? '';
    return `"${String(value).replace(/"/g, '""')}"`;
  }).join(','))].join('\\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'liftedtrucks_turnover_filtered_view.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function render() {
  const rows = filteredRows();
  renderRows(rows);
  renderDetail(selectedRow(rows));
  renderHeaderState();
}

$('search').addEventListener('input', event => { state.search = event.target.value; render(); });
$('make').addEventListener('change', event => { state.make = event.target.value; render(); });
$('yearMin').addEventListener('input', event => {
  state.yearMin = Number(event.target.value);
  if (state.yearMin > state.yearMax) { state.yearMax = state.yearMin; $('yearMax').value = state.yearMax; }
  render();
});
$('yearMax').addEventListener('input', event => {
  state.yearMax = Number(event.target.value);
  if (state.yearMax < state.yearMin) { state.yearMin = state.yearMax; $('yearMin').value = state.yearMin; }
  render();
});
$('price').addEventListener('input', event => { state.maxPrice = Number(event.target.value); render(); });
$('miles').addEventListener('input', event => { state.maxMiles = Number(event.target.value); render(); });
$('clicks').addEventListener('input', event => { state.minClicks = Number(event.target.value); render(); });
$('sortPreset').addEventListener('change', event => {
  const [key, dir] = event.target.value.split('_');
  state.sortKey = key;
  state.sortDir = dir;
  render();
});
$('reset').addEventListener('click', () => {
  state.search = '';
  state.make = '';
  state.yearMin = DEFAULTS.minYear;
  state.yearMax = DEFAULTS.maxYear;
  state.maxPrice = DEFAULTS.maxPrice;
  state.maxMiles = DEFAULTS.maxMiles;
  state.minClicks = 0;
  state.sortKey = 'turn';
  state.sortDir = 'desc';
  state.preset = 'all';
  state.inventoryOnly = false;
  $('search').value = '';
  $('make').value = '';
  $('yearMin').value = DEFAULTS.minYear;
  $('yearMax').value = DEFAULTS.maxYear;
  $('price').value = DEFAULTS.maxPrice;
  $('miles').value = DEFAULTS.maxMiles;
  $('clicks').value = 0;
  $('sortPreset').value = 'turn_desc';
  render();
});
$('export').addEventListener('click', () => exportCsv(filteredRows()));
$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText(filteredRows().map(item => item.vin).join('\\n'));
  $('copy').textContent = 'VINs Copied';
  setTimeout(() => $('copy').textContent = 'Copy VINs', 1400);
});
$('viewToggle').addEventListener('click', () => { state.inventoryOnly = !state.inventoryOnly; render(); });
$('kpiUnits').addEventListener('click', () => { state.preset = 'all'; state.inventoryOnly = true; state.sortKey = 'turn'; state.sortDir = 'desc'; scrollToWorkspace(); render(); });
$('kpiClicks').addEventListener('click', () => { state.preset = 'all'; state.inventoryOnly = true; state.sortKey = 'clicks'; state.sortDir = 'desc'; scrollToWorkspace(); render(); });
$('kpiHot').addEventListener('click', () => setPreset('hot', true));
$('kpiAged').addEventListener('click', () => setPreset('aged', true));
document.querySelectorAll('.colbtn').forEach(node => node.addEventListener('click', () => setSort(node.dataset.sortKey)));
renderInsights();
render();
"""


def _build_html(data: list[dict]) -> str:
    summary = build_summary(data)
    insights = build_insights(data)
    makes = sorted({item["make"] for item in data if item.get("make")})
    years = sorted({item["year"] for item in data if item.get("year") is not None})
    min_year = min(years)
    max_year = max(years)
    max_price = int(max((item.get("vehicle_price") or item.get("asking_total") or 0) for item in data))
    max_miles = int(max((item.get("mileage") or 0) for item in data))
    max_clicks = int(max((item.get("website_clicks_7d") or 0) for item in data))
    data_json = json.dumps(data)
    insights_json = json.dumps(insights)
    make_options = _make_options(makes)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Lifted Trucks Turnover Dashboard</title>
  <style>
{_css()}
  </style>
</head>
<body>
  <div class="app">
    <section class="hero">
      <div class="card hero-main">
        <h1>Turnover Dashboard</h1>
        <p>Built to answer one thing fast: which units are getting attention, why they are getting it, and what to push next.</p>
        <div class="hero-meta">
          <span class="pill">Updated 2026-04-01</span>
          <span class="pill">Engagement-weighted ranking</span>
          <span class="pill">One-file offline dashboard</span>
          <span class="pill">Days of supply uses site-age proxy</span>
        </div>
      </div>
      <div class="hero-stats">
        <button class="card stat stat-btn" id="kpiUnits" type="button">
          <div class="label">Units</div>
          <div class="value num">{summary["units"]}</div>
          <div class="sub">all live rows in dashboard</div>
        </button>
        <button class="card stat stat-btn" id="kpiClicks" type="button">
          <div class="label">Average Clicks / 7d</div>
          <div class="value num">{summary["avg_clicks"]}</div>
          <div class="sub">click to sort by raw traffic</div>
        </button>
        <button class="card stat stat-btn" id="kpiHot" type="button">
          <div class="label">Hot Units</div>
          <div class="value num">{summary["hot_units"]}</div>
          <div class="sub">turn score 72+</div>
        </button>
        <button class="card stat stat-btn" id="kpiAged" type="button">
          <div class="label">Aged + Still Engaged</div>
          <div class="value num">{summary["aged_engaged"]}</div>
          <div class="sub">older units still pulling traffic</div>
        </button>
      </div>
    </section>

    <section class="filters">
      <div class="fg">
        <div class="field">
          <label>Search</label>
          <input id="search" type="text" placeholder="VIN, trim, wheel, tire, color, part">
        </div>
        <div class="field">
          <label>Make</label>
          <select id="make">
            <option value="">All makes</option>
            {make_options}
          </select>
        </div>
        <div class="field year-field">
          <label>Year Range</label>
          <div class="range-stack">
            <div class="year-line"><span id="yearReadout"></span><span>drag both ends</span></div>
            <div class="year-sliders">
              <input id="yearMin" type="range" min="{min_year}" max="{max_year}" step="1" value="{min_year}">
              <input id="yearMax" type="range" min="{min_year}" max="{max_year}" step="1" value="{max_year}">
            </div>
          </div>
        </div>
        <div class="field">
          <label>Max Price</label>
          <input id="price" type="range" min="25000" max="{max_price}" step="1000" value="{max_price}">
        </div>
        <div class="field">
          <label>Max Mileage</label>
          <input id="miles" type="range" min="0" max="{max_miles}" step="1000" value="{max_miles}">
        </div>
        <div class="field">
          <label>Min Clicks / 7d</label>
          <input id="clicks" type="range" min="0" max="{max_clicks}" step="1" value="0">
        </div>
        <div class="field">
          <label>Sort Preset</label>
          <select id="sortPreset">
            <option value="turn_desc">Turn score</option>
            <option value="clicks_desc">Clicks / 7d</option>
            <option value="velocity_desc">Engagement / day</option>
            <option value="days_asc">Days in stock, low first</option>
            <option value="days_desc">Days in stock, high first</option>
            <option value="price_asc">Price, low first</option>
            <option value="price_desc">Price, high first</option>
            <option value="mileage_asc">Mileage, low first</option>
            <option value="year_desc">Year, new first</option>
            <option value="make_asc">Make, A to Z</option>
            <option value="model_asc">Model, A to Z</option>
          </select>
        </div>
        <button class="btn alt" id="reset" type="button">Reset</button>
        <button class="btn alt" id="export" type="button">Export View</button>
        <button class="btn" id="copy" type="button">Copy VINs</button>
      </div>
    </section>

    <section class="insights">
      <div class="insights-head">
        <div>
          <h2>What Actually Pulls Attention</h2>
          <p>Tap any item to push the inventory through that signal.</p>
        </div>
        <div class="pill">ranked by engagement signal + count</div>
      </div>
      <div class="insight-grid" id="insightGrid"></div>
    </section>

    <section class="layout" id="workspace">
      <div class="inventory">
        <div class="inventory-h">
          <div>
            <h2>Inventory Flow</h2>
            <div class="sub" id="summaryLine"></div>
          </div>
          <div class="inventory-tools">
            <button class="btn alt" id="viewToggle" type="button">Full Inventory</button>
            <div class="pill" id="filterLine"></div>
          </div>
        </div>
        <div class="cols">
          <button class="colbtn" data-sort-key="rank">Rank</button>
          <button class="colbtn" data-sort-key="year">Year</button>
          <button class="colbtn" data-sort-key="make">Make</button>
          <button class="colbtn" data-sort-key="model">Model</button>
          <button class="colbtn" data-sort-key="clicks">Clicks</button>
          <button class="colbtn" data-sort-key="velocity">/ Day</button>
          <button class="colbtn" data-sort-key="days">Days</button>
          <button class="colbtn" data-sort-key="price">Price</button>
          <button class="colbtn" data-sort-key="turn">Turn</button>
          <button class="colbtn" data-sort-key="hotness">Suggested</button>
        </div>
        <div class="rows" id="rows"></div>
      </div>
      <aside class="detail" id="detail"></aside>
    </section>
  </div>
  <script>
    const DATA = {data_json};
    const INSIGHTS = {insights_json};
    const DEFAULTS = {{
      minYear: {min_year},
      maxYear: {max_year},
      maxPrice: {max_price},
      maxMiles: {max_miles},
      maxClicks: {max_clicks}
    }};
{_js()}
  </script>
</body>
</html>"""


def main() -> int:
    data = build_data()
    OUTPUT_HTML.write_text(_build_html(data), encoding="utf-8")
    print(json.dumps({"ok": True, "html": str(OUTPUT_HTML), "row_count": len(data)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
