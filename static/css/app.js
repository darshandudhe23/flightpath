const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const state = {airports: {}, edges: [], routes: [], sel: 0, criterion: 'distance', avoid: new Set(),
               tab: 'routes', compare: null, expanded: new Set(), explain: ''};
const COLORS = {best: '#1d4ed8', alt: '#f59e0b'};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CRIT_NAME = {distance: 'Shortest', cost: 'Cheapest', time: 'Fastest'};
let map, netLayer, routeLayer, reachLayer, planeMarker, planeRAF, searchSeq = 0;

/* ---------- formatting & helpers ---------- */
const fmt = {
  km: v => `${v.toLocaleString()} km`,
  inr: v => `₹${v.toLocaleString()}`,
  time: v => `${Math.floor(v / 60)}h ${String(v % 60).padStart(2, '0')}m`,
  mins: v => v >= 60 ? `${Math.floor(v / 60)}h${v % 60 ? ' ' + v % 60 + 'm' : ''}` : `${v} min`,
};
const label = a => `${a.code} — ${a.city} (${a.name})`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage may be blocked */ } },
};

async function api(url, body) {
  const r = await fetch(url, body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : undefined);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}
function showMsg(t) { const m = $('#msg'); m.textContent = t; m.hidden = !t; }
let toastTimer;
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 1800); }
async function copyText(text, ok) {
  try { await navigator.clipboard.writeText(text); toast(ok); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(ok); } catch (_) { toast('Copy failed'); } ta.remove(); }
}

/* ---------- airport search + combobox ---------- */
function searchAirports(q, exclude = new Set()) {
  q = q.trim().toLowerCase();
  const rank = a => {
    const code = a.code.toLowerCase(), city = a.city.toLowerCase(), name = a.name.toLowerCase(), country = (a.country || '').toLowerCase();
    if (code === q) return 0; if (code.startsWith(q)) return 1; if (city.startsWith(q)) return 2;
    if (name.includes(q)) return 3; if (city.includes(q)) return 4; if (country.includes(q)) return 5; return 9;
  };
  return Object.values(state.airports).filter(a => !exclude.has(a.code))
    .map(a => [q ? rank(a) : 6, a]).filter(([r]) => r < 9)
    .sort((x, y) => x[0] - y[0] || x[1].city.localeCompare(y[1].city)).slice(0, 8).map(([, a]) => a);
}
function resolve(text) {
  const t = text.trim(); if (!t) return null;
  const code = t.split(/\s/)[0].toUpperCase();
  if (state.airports[code]) return code;
  const r = searchAirports(t); return r.length ? r[0].code : null;
}
function combo(input, onPick, getExclude = () => new Set()) {
  const dd = document.createElement('div'); dd.className = 'dd'; dd.hidden = true; input.parentElement.appendChild(dd);
  let items = [], idx = -1;
  const close = () => { dd.hidden = true; idx = -1; };
  const pick = a => { close(); onPick(a); };
  const render = () => {
    items = searchAirports(input.value, getExclude());
    dd.innerHTML = items.length ? items.map((a, i) => `<div data-i="${i}" class="${i === idx ? 'on' : ''}"><b>${a.code}</b>${esc(a.city)}<small>${esc(a.country || '')}</small></div>`).join('')
      : '<div class="none">No matching airport</div>';
    dd.hidden = false;
  };
  input.addEventListener('input', () => { idx = -1; render(); });
  input.addEventListener('focus', () => { input.select(); render(); });
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); if (dd.hidden) render();
      idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(items.length, 1); render();
    } else if (e.key === 'Enter' && !dd.hidden && idx >= 0) { e.preventDefault(); e.stopPropagation(); pick(items[idx]); }
    else if (e.key === 'Escape') close();
  }, true);
  dd.addEventListener('mousedown', e => { const el = e.target.closest('[data-i]'); if (el) { e.preventDefault(); pick(items[+el.dataset.i]); } });
}
function setField(id, code) { const a = state.airports[code]; $(id).value = a ? label(a) : ''; }

/* ---------- map ---------- */
// Quadratic-bezier arc between two airports. Always built from the alphabetically smaller code
// so a route leg lies exactly on top of its network line.
function arc(c1, c2, n = 28, curv = .16) {
  const flip = c1 > c2, A = state.airports[flip ? c2 : c1], B = state.airports[flip ? c1 : c2];
  const x1 = A.lon, y1 = A.lat, x2 = B.lon, y2 = B.lat, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const cx = (x1 + x2) / 2 - dy / len * len * curv, cy = (y1 + y2) / 2 + dx / len * len * curv, pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    pts.push([u * u * y1 + 2 * u * t * cy + t * t * y2, u * u * x1 + 2 * u * t * cx + t * t * x2]);
  }
  return flip ? pts.reverse() : pts;
}
function popupFor(a) {
  const direct = state.edges.filter(e => e.from === a.code).length;
  const el = document.createElement('div'); el.className = 'pop';
  el.innerHTML = `<b>${a.code}</b> — ${esc(a.name)}<div class="sub">${esc(a.city)}, ${esc(a.country || '')} · ${direct} direct route${direct === 1 ? '' : 's'}</div>
    <div class="pop-actions"><button data-a="from">From here</button><button data-a="to">To here</button><button data-a="reach">Reachable</button></div>`;
  el.addEventListener('click', e => {
    const act = e.target.dataset.a; if (!act) return;
    map.closePopup();
    if (act === 'from') setField('#src', a.code); else if (act === 'to') setField('#dst', a.code); else showReachable(a.code);
    if (act !== 'reach' && resolve($('#src').value) && resolve($('#dst').value)) findRoutes();
  });
  return el;
}
function initMap() {
  map = L.map('map', {zoomControl: true}).setView([22, 80], 4);
  const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution: '© OpenStreetMap contributors', maxZoom: 12});
  tiles.on('tileerror', () => $('#tile-warn').hidden = false);
  tiles.addTo(map);
  netLayer = L.layerGroup().addTo(map);
  reachLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);
  const seen = new Set();
  state.edges.forEach(e => {                       // draw each airport pair once
    const key = [e.from, e.to].sort().join('-');
    if (seen.has(key) || !state.airports[e.from] || !state.airports[e.to]) return;
    seen.add(key);
    L.polyline(arc(e.from, e.to, 20), {color: '#b6c0d0', weight: 1, opacity: .6, interactive: false}).addTo(netLayer);
  });
  Object.values(state.airports).forEach(a =>
    L.circleMarker([a.lat, a.lon], {radius: 5, color: '#64748b', fillColor: '#fff', fillOpacity: 1, weight: 1.5})
      .bindTooltip(`${a.code} · ${a.city}`).bindPopup(() => popupFor(a)).addTo(netLayer));
  $('#net-stats').textContent = `${Object.keys(state.airports).length} airports · ${seen.size} routes`; $('#net-stats').hidden = false;
}
function stopPlane() { cancelAnimationFrame(planeRAF); if (planeMarker) { routeLayer.removeLayer(planeMarker); planeMarker = null; } }
function startPlane(pts) {
  stopPlane();
  if (reduceMotion || !$('#t-anim').checked || pts.length < 2) return;
  const svg = '<div class="plane"><svg viewBox="0 0 24 24"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/></svg></div>';
  planeMarker = L.marker(pts[0], {icon: L.divIcon({className: '', html: svg, iconSize: [0, 0]}), interactive: false, zIndexOffset: 1000}).addTo(routeLayer);
  const dur = Math.min(Math.max(pts.length * 40, 4000), 12000), pause = 1200, t0 = performance.now();
  const tick = now => {
    const t = ((now - t0) % (dur + pause)) / dur, f = Math.min(t, 1) * (pts.length - 1), i = Math.min(Math.floor(f), pts.length - 2), k = f - i;
    const a = pts[i], b = pts[i + 1];
    planeMarker.setLatLng([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
    const pa = map.latLngToLayerPoint(a), pb = map.latLngToLayerPoint(b), el = planeMarker.getElement();
    if (el && el.firstChild) el.firstChild.style.transform = `rotate(${Math.atan2(pb.x - pa.x, -(pb.y - pa.y)) * 180 / Math.PI}deg)`;
    planeRAF = requestAnimationFrame(tick);
  };
  planeRAF = requestAnimationFrame(tick);
}
function drawRoutes() {
  routeLayer.clearLayers(); planeMarker = null; cancelAnimationFrame(planeRAF);
  const order = state.routes.map((_, i) => i).filter(i => i !== state.sel).concat(state.sel); // selected on top
  let selPts = [];
  order.forEach(i => {
    const r = state.routes[i], isSel = i === state.sel;
    const pts = r.path.slice(1).flatMap((c, k) => arc(r.path[k], c).slice(k ? 1 : 0));
    L.polyline(pts, {color: isSel ? COLORS.best : COLORS.alt, weight: isSel ? 5 : 3, opacity: isSel ? .95 : .55, dashArray: isSel ? null : '6 6', interactive: false}).addTo(routeLayer);
    if (isSel) {
      selPts = pts;
      r.path.forEach((c, k) => {
        const a = state.airports[c], end = k === 0 || k === r.path.length - 1;
        const note = end ? (k ? 'Destination' : 'Origin') : 'Layover / intermediate stop';
        L.marker([a.lat, a.lon], {icon: L.divIcon({className: '', html: `<div class="apin ${end ? '' : 'mid'}">${c}</div>`, iconSize: [30, 30]})})
          .bindPopup(`<b>${c}</b> — ${esc(a.name)}<br>${esc(a.city)} · ${note}`).addTo(routeLayer);
      });
    }
  });
  const sel = state.routes[state.sel];
  map.fitBounds(L.latLngBounds(selPts.length ? selPts : sel.path.map(c => [state.airports[c].lat, state.airports[c].lon])), {padding: [70, 70]});
  startPlane(selPts);
}
async function showReachable(code) {
  try {
    const {reachable} = await api(`/api/reachable/${code}`);
    reachLayer.clearLayers();
    reachable.forEach(c => { const a = state.airports[c];
      if (a) L.circleMarker([a.lat, a.lon], {radius: 10, color: '#16a34a', fillColor: '#22c55e', fillOpacity: .25, weight: 2, interactive: false}).addTo(reachLayer); });
    const a = state.airports[code];
    L.circleMarker([a.lat, a.lon], {radius: 12, color: '#1d4ed8', fillOpacity: 0, weight: 3, interactive: false}).addTo(reachLayer);
    $('#map-note-text').textContent = `${reachable.length} of ${Object.keys(state.airports).length - 1} airports reachable from ${code}`;
    $('#map-note').hidden = false;
  } catch (e) { toast(e.message); }
}
function clearReachable() { reachLayer.clearLayers(); $('#map-note').hidden = true; }

/* ---------- rendering routes ---------- */
function tagsFor(r) {
  if (state.routes.length < 2) return [];
  const best = k => Math.min(...state.routes.map(x => x[k]));
  const all = k => state.routes.every(x => x[k] === state.routes[0][k]);
  return [['distance', 'Shortest'], ['cost', 'Cheapest'], ['time', 'Fastest'], ['stops', 'Fewest stops']]
    .filter(([k]) => r[k] === best(k) && !all(k)).map(([, t]) => t);
}
function deltaFor(r, base) {
  if (r === base) return '';
  const k = state.criterion, d = r[k] - base[k]; if (!d) return 'same as best';
  const f = k === 'cost' ? fmt.inr(Math.abs(d)) : k === 'time' ? fmt.mins(Math.abs(d)) : fmt.km(Math.abs(d));
  return `${d > 0 ? '+' : '−'}${f} vs best`;
}
function legsHtml(r) {
  return '<ol class="legs">' + r.legs.map((l, i) => `
    <li><b>${l.from} → ${l.to}</b><small>${fmt.km(l.distance)} · ${fmt.time(l.time)} · ${fmt.inr(l.cost)}</small></li>
    ${r.layover_total && i < r.legs.length - 1 ? `<li class="lay">Layover in ${l.to} · ${fmt.mins(r.layover_total / r.stops)}</li>` : ''}`).join('') + '</ol>';
}
function statsHtml(r, win = {}) {
  const c = k => win[k] ? ' class="win"' : '';
  return `<div class="stats">
    <div${c('distance')}>${r.distance.toLocaleString()}<small>km</small></div>
    <div${c('cost')}>${fmt.inr(r.cost)}<small>est. cost</small></div>
    <div${c('time')}>${fmt.time(r.time)}<small>${r.layover_total ? 'incl. layovers' : 'est. time'}</small></div>
    <div${c('stops')}>${r.stops}<small>stop${r.stops === 1 ? '' : 's'}</small></div></div>`;
}
function renderRoutes() {
  $('#explain').textContent = state.explain || '';
  const base = state.routes[0];
  $('#route-list').innerHTML = state.routes.map((r, i) => {
    const tags = tagsFor(r), open = state.expanded.has(i);
    return `<div class="route ${i === state.sel ? 'sel' : ''}" data-i="${i}">
      <div class="top"><span>Option ${i + 1} <span class="delta">${deltaFor(r, base)}</span></span>
        <span class="tags">${i === 0 ? '<span class="badge best">★ Best</span>' : '<span class="badge">Alternative</span>'}${tags.map(t => `<span class="badge good">${t}</span>`).join('')}</span></div>
      <div class="path">${r.path.map(c => `<b title="${esc(state.airports[c].city)}">${c}</b>`).join('<span>→</span>')}</div>
      ${statsHtml(r)}
      <button class="more" data-more="${i}" type="button">${open ? 'Hide' : 'Show'} flight details</button>
      ${open ? legsHtml(r) : ''}
    </div>`;
  }).join('');
  $('#results').hidden = false; $('#hint').hidden = true;
  $$('.route').forEach(el => el.onclick = e => {
    const i = +el.dataset.i;
    if (e.target.dataset.more !== undefined) { state.expanded.has(i) ? state.expanded.delete(i) : state.expanded.add(i); renderRoutes(); return; }
    if (state.sel !== i) { state.sel = i; renderRoutes(); drawRoutes(); }
  });
}
const COMPARE_ROWS = [['shortest', 'Shortest distance', 'Dijkstra · km'], ['cheapest', 'Cheapest', 'Dijkstra · ₹'],
                      ['fastest', 'Fastest', 'Dijkstra · minutes'], ['fewest', 'Fewest flights', 'BFS · hops']];
function renderCompare() {
  const c = state.compare, el = $('#compare-list');
  if (!c) { el.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>'; return; }
  const rows = COMPARE_ROWS.filter(([k]) => c[k]);
  const min = k => Math.min(...rows.map(([n]) => c[n][k]));
  el.innerHTML = rows.map(([n, title, sub]) => {
    const r = c[n], win = {distance: r.distance === min('distance'), cost: r.cost === min('cost'), time: r.time === min('time'), stops: r.stops === min('stops')};
    return `<div class="cmp" data-k="${n}"><h4><span>${title}</span><span class="delta">${sub}</span></h4>
      <div class="path">${r.path.map(x => `<b>${x}</b>`).join('<span>→</span>')}</div>${statsHtml(r, win)}</div>`;
  }).join('');
  $$('.cmp').forEach(row => row.onclick = () => {
    const n = row.dataset.k, crit = {shortest: 'distance', cheapest: 'cost', fastest: 'time'}[n];
    if (crit) { setCriterion(crit); findRoutes(); }
    else { state.routes = [c[n]]; state.sel = 0; state.expanded.clear(); state.explain = 'Fewest flights: BFS ignores weights and minimises the number of connections.'; setTab('routes'); renderRoutes(); drawRoutes(); }
  });
}
function setTab(t) {
  state.tab = t;
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  $('#tab-routes').hidden = t !== 'routes'; $('#tab-compare').hidden = t !== 'compare';
  if (t === 'compare') renderCompare();
}
function setCriterion(c) { state.criterion = c; $$('#criterion button').forEach(x => x.classList.toggle('active', x.dataset.v === c)); }

/* ---------- options, history, share ---------- */
function options() {
  const ms = $('#max-stops').value;
  return {layover: +$('#layover').value, avoid: [...state.avoid], max_stops: ms === '' ? null : +ms};
}
function updateAdvBadge() {
  const o = options(), n = (o.layover ? 1 : 0) + (o.max_stops !== null ? 1 : 0) + o.avoid.length;
  $('#adv-badge').textContent = n; $('#adv-badge').hidden = !n;
  $('#layover-out').textContent = fmt.mins(o.layover);
}
function renderAvoid() {
  $('#avoid-chips').innerHTML = [...state.avoid].map(c => `<span class="chip rm">${c}<button data-c="${c}" aria-label="Remove ${c}" type="button">×</button></span>`).join('');
  $$('#avoid-chips button').forEach(b => b.onclick = () => { state.avoid.delete(b.dataset.c); renderAvoid(); updateAdvBadge(); });
  updateAdvBadge();
}
function renderRecent() {
  const rec = store.get('fp_recent', []), box = $('#recent-chips');
  const items = rec.length ? rec : [{s: 'DEL', t: 'TRV', c: 'cost'}, {s: 'BOM', t: 'SIN', c: 'time'}, {s: 'GAU', t: 'LHR', c: 'distance'}];
  $('#recent-label').textContent = rec.length ? 'Recent searches' : 'Try an example';
  box.innerHTML = items.filter(x => state.airports[x.s] && state.airports[x.t])
    .map(x => `<button class="chip" type="button" data-s="${x.s}" data-t="${x.t}" data-c="${x.c}">${x.s} → ${x.t} · ${CRIT_NAME[x.c].toLowerCase()}</button>`).join('');
  $('#recent').hidden = !box.children.length;
  $$('#recent-chips .chip').forEach(b => b.onclick = () => { setField('#src', b.dataset.s); setField('#dst', b.dataset.t); setCriterion(b.dataset.c); findRoutes(); });
}
function remember(s, t, c) {
  const rec = store.get('fp_recent', []).filter(x => !(x.s === s && x.t === t && x.c === c));
  store.set('fp_recent', [{s, t, c}, ...rec].slice(0, 5)); renderRecent();
}
function shareUrl(s, t) {
  const o = options(), p = new URLSearchParams({from: s, to: t, by: state.criterion});
  if (o.layover) p.set('layover', o.layover);
  if (o.max_stops !== null) p.set('stops', o.max_stops);
  if (o.avoid.length) p.set('avoid', o.avoid.join(','));
  return `${location.origin}${location.pathname}#${p}`;
}
function loadFromHash() {
  const p = new URLSearchParams(location.hash.slice(1)), s = (p.get('from') || '').toUpperCase(), t = (p.get('to') || '').toUpperCase();
  if (!state.airports[s] || !state.airports[t]) return;
  setField('#src', s); setField('#dst', t);
  if (CRIT_NAME[p.get('by')]) setCriterion(p.get('by'));
  const lay = +p.get('layover') || 0; $('#layover').value = Math.min(Math.max(lay, 0), 240);
  if (['0', '1', '2'].includes(p.get('stops'))) $('#max-stops').value = p.get('stops');
  (p.get('avoid') || '').split(',').map(x => x.toUpperCase()).filter(x => state.airports[x] && x !== s && x !== t).forEach(x => state.avoid.add(x));
  renderAvoid(); if (lay || p.get('stops') || state.avoid.size) $('#adv').open = true;
  findRoutes();
}
function tripText() {
  const r = state.routes[state.sel]; if (!r) return '';
  const a = c => `${c} (${state.airports[c].city})`;
  return [`FlightPath itinerary: ${a(r.path[0])} → ${a(r.path[r.path.length - 1])}`,
    ...r.legs.map((l, i) => `${i + 1}. ${a(l.from)} → ${a(l.to)} · ${fmt.km(l.distance)} · ${fmt.time(l.time)} · ${fmt.inr(l.cost)}`),
    `Total: ${fmt.km(r.distance)} · ${fmt.time(r.time)}${r.layover_total ? ' (incl. layovers)' : ''} · ${fmt.inr(r.cost)} · ${r.stops} stop${r.stops === 1 ? '' : 's'}`,
    '(Costs and times are illustrative estimates.)'].join('\n');
}

/* ---------- main action ---------- */
async function findRoutes() {
  showMsg('');
  const source = resolve($('#src').value), destination = resolve($('#dst').value);
  if (!source || !destination) return showMsg('Please choose valid airports from the list.');
  if (source === destination) return showMsg('Source and destination must be different.');
  setField('#src', source); setField('#dst', destination);
  const seq = ++searchSeq, btn = $('#go'), o = options(), body = {source, destination, criterion: state.criterion, k: 3, ...o};
  btn.disabled = true; btn.textContent = 'Calculating…';
  $('#results').hidden = false; $('#hint').hidden = true;
  $('#route-list').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>'; state.compare = null;
  try {
    const [res, cmp] = await Promise.all([api('/api/route', body), api('/api/compare', body).catch(() => null)]);
    if (seq !== searchSeq) return;                     // a newer search superseded this one
    state.compare = cmp;
    if (!res.routes.length) {
      $('#results').hidden = true; $('#hint').hidden = false; routeLayer.clearLayers(); stopPlane();
      return showMsg(res.filtered_out ? 'No route satisfies the stop limit. Try allowing more stops.' : 'No route exists between these airports' + (o.avoid.length ? ' with those airports avoided.' : '.'));
    }
    state.routes = res.routes; state.sel = 0; state.expanded.clear(); state.explain = res.explanation;
    renderRoutes(); drawRoutes(); if (state.tab === 'compare') renderCompare();
    history.replaceState(null, '', shareUrl(source, destination)); remember(source, destination, state.criterion);
    $('#copy-link').dataset.url = shareUrl(source, destination);
  } catch (e) { $('#results').hidden = true; $('#hint').hidden = false; showMsg(e.message); }
  finally { if (seq === searchSeq) { btn.disabled = false; btn.textContent = 'Find best routes'; } }
}

function bind() {
  $$('#criterion button').forEach(b => b.onclick = () => { setCriterion(b.dataset.v); if (state.routes.length && !$('#results').hidden) findRoutes(); });
  $$('.tab').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  $('#go').onclick = findRoutes;
  $('#swap').onclick = () => { [$('#src').value, $('#dst').value] = [$('#dst').value, $('#src').value]; };
  ['#src', '#dst'].forEach(s => $(s).addEventListener('keydown', e => e.key === 'Enter' && !e.defaultPrevented && findRoutes()));
  $('#layover').oninput = updateAdvBadge; $('#max-stops').onchange = updateAdvBadge;
  const rerun = () => { if (state.routes.length && !$('#results').hidden) findRoutes(); };
  $('#layover').onchange = rerun; $('#max-stops').onchange = () => { updateAdvBadge(); rerun(); };
  $('#copy-link').onclick = () => {
    const s = resolve($('#src').value), t = resolve($('#dst').value);
    if (s && t) copyText(shareUrl(s, t), 'Link copied');
  };
  $('#copy-trip').onclick = () => copyText(tripText(), 'Itinerary copied');
  $('#t-net').onchange = e => e.target.checked ? netLayer.addTo(map) : map.removeLayer(netLayer);
  $('#t-anim').onchange = () => state.routes.length ? drawRoutes() : null;
  $('#map-note-x').onclick = clearReachable;
  $('#theme').onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; store.set('fp_theme', next);
  };
  window.addEventListener('hashchange', () => { if (location.hash.length > 1 && location.href !== $('#copy-link').dataset.url) loadFromHash(); });
}

(async function init() {
  bind();
  try {
    const [airports, edges] = await Promise.all([api('/api/airports'), api('/api/edges')]);
    airports.forEach(a => state.airports[a.code] = a);
    state.edges = edges;
    combo($('#src'), a => setField('#src', a.code));
    combo($('#dst'), a => setField('#dst', a.code));
    combo($('#avoid-in'), a => { state.avoid.add(a.code); $('#avoid-in').value = ''; renderAvoid(); },
      () => new Set([...state.avoid, resolve($('#src').value), resolve($('#dst').value)].filter(Boolean)));
    initMap(); renderRecent(); updateAdvBadge(); loadFromHash();
  } catch (e) { showMsg('Could not load airport data: ' + e.message); }
})();
