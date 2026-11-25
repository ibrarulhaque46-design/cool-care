'use strict';
/* Ibrar & Brothers Cool Care - shop app */

const C = window.APP_CONFIG;
const app = document.getElementById('app');
let sb = null;

const S = {
  user: null, profile: null,
  items: [], costs: {},
  cart: [], view: 'home',
  report: { from: null, to: null, chip: 'today' },
  purchaseItem: null,
  installPrompt: null
};

/* ---------------- helpers ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isOwner = () => S.profile && S.profile.role === 'owner';
const trim3 = n => String(Math.round((Number(n) || 0) * 1000) / 1000);
const rs = n => 'Rs ' + Math.round(Number(n) || 0).toLocaleString('en-US');
const itemById = id => S.items.find(i => i.id === id);
const isLow = i => Number(i.stock) <= Number(i.min_stock);
const deviceType = () => /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'laptop';
const errMsg = e => (e && (e.message || e.error_description)) || 'Something went wrong';

const SHORT = { piece: 'pc', kg: 'kg', gram: 'gram', litre: 'litre', ml: 'ml', meter: 'meter', feet: 'feet', gaz: 'gaz' };
const CONV = {
  piece: [['piece', 1]],
  kg: [['kg', 1], ['gram', 0.001]],
  litre: [['litre', 1], ['ml', 0.001]],
  meter: [['meter', 1], ['feet', 0.3048]],
  feet: [['feet', 1], ['meter', 3.28084]],
  gaz: [['gaz', 1], ['feet', 1 / 3]]
};

function unitOptions(item) {
  const list = (CONV[item.unit] || [[item.unit, 1]]).map(([k, f]) => ({ key: k, label: SHORT[k] || k, factor: f }));
  if (Number(item.pack_size) > 0) list.push({ key: 'pack', label: item.pack_name || 'Pack', factor: Number(item.pack_size), pack: true });
  return list;
}
function fmtQty(q, unit) {
  q = Number(q) || 0;
  if ((unit === 'kg' || unit === 'litre') && q !== 0 && Math.abs(q) < 1) return trim3(q * 1000) + ' ' + (unit === 'kg' ? 'gram' : 'ml');
  return trim3(q) + ' ' + (SHORT[unit] || unit);
}
function toast(msg, type = 'ok') {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), type === 'bad' ? 5000 : 3000);
}
function openModal(html) {
  closeModal();
  const m = document.createElement('div');
  m.className = 'modal-bg'; m.id = 'modal';
  m.innerHTML = `<div class="modal">${html}</div>`;
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) closeModal(); });
  document.body.appendChild(m);
  return m;
}
function closeModal() { const m = $('#modal'); if (m) m.remove(); }
function searchItems(text, limit = 12) {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return S.items.filter(i => {
    const hay = (i.name + ' ' + (i.company || '') + ' ' + (i.category || '')).toLowerCase();
    return words.every(w => hay.includes(w));
  }).slice(0, limit);
}
function dayStr(d) { const z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }
function fmtTime(iso) { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
function fmtDate(iso) { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
async function shareText(text) {
  if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); toast('List copied. Paste it in WhatsApp.'); }
  catch { openModal(`<h3>List</h3><textarea style="width:100%;height:240px">${esc(text)}</textarea><div class="modal-actions"><button class="btn" data-close>Close</button></div>`); }
}

/* ---------------- start ---------------- */
async function init() {
  if (!window.supabase) {
    app.innerHTML = `<div class="splash"><div class="logo big">❄</div><p>Check your internet and reopen the page.</p></div>`;
    return;
  }
  sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY);
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') showLogin(); });
  const { data: { session } } = await sb.auth.getSession();
  // "Remember me" band tha aur browser dobara khula: logout
  let live = false; try { live = !!sessionStorage.getItem('cc_live'); } catch (_) {}
  if (session && store.get('cc_forget') && !live) { await sb.auth.signOut(); return showLogin(); }
  if (session) await afterLogin(session.user); else showLogin();
}

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installPrompt = e; });
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && S.profile && S.profile.role !== 'pending') {
    await loadItems();
    if (S.view !== 'sale' && !$('#modal')) render(); else updateBadge();
  }
});

function showLogin() {
  S.user = null; S.profile = null; S.cart = [];
  closeModal();
  const savedEmail = store.get('cc_email') || '';
  // is device par pichli dafa kis role ne login kiya tha (sirf dikhawa; asal ijazat database se)
  const devRole = store.get('cc_role');
  app.innerHTML = `
  <div class="lg-page">
    <div class="lg-hero">
      <img class="lg-scene" src="img/shop.svg" alt="">
      <div class="lg-shade"></div>
      <div class="lg-snow" id="lgSnow"></div>
      <div class="lg-badge lg-b1"><span class="lg-dot"></span><div><b>Live</b><br>Stock update</div></div>
      <div class="lg-badge lg-b2">❄ <div><b>16°C</b><br>Cool Care</div></div>
      <div class="lg-brand">
        <div class="lg-logo"><span>❄</span></div>
        <div><h2>${esc(C.SHOP_NAME)}</h2><small>${esc(C.SHOP_SUB)} · ${esc(C.SHOP_TAG)}</small></div>
      </div>
      <svg class="lg-wave" viewBox="0 0 380 46" preserveAspectRatio="none" aria-hidden="true"><path d="M0 26 C70 2 130 44 200 24 C270 4 320 30 380 16 L380 46 L0 46 Z"/></svg>
      <svg class="lg-wave-v" viewBox="0 0 46 380" preserveAspectRatio="none" aria-hidden="true"><path d="M26 0 C2 70 44 130 24 200 C4 270 30 320 16 380 L46 380 L46 0 Z"/></svg>
    </div>
    <div class="lg-side">
      <form class="lg-form" id="loginForm" autocomplete="on">
        <p class="lg-hello">Welcome back 👋</p>
        <p class="lg-sub" id="lgSub">Sign in to your ${devRole === 'cashier' ? 'cashier' : 'owner'} account</p>
        <div class="lg-seg" id="lgSeg" ${devRole ? 'hidden' : ''}><span class="lg-pill"></span>
          <button type="button" class="on" data-r="owner">👑 Owner</button><button type="button" data-r="cashier">🧾 Cashier</button></div>
        <label class="lg-fld"><span class="lg-ic">✉️</span>
          <input type="email" name="email" required autocomplete="username" placeholder="Email" value="${esc(savedEmail)}"></label>
        <label class="lg-fld"><span class="lg-ic">🔒</span>
          <input type="password" name="password" required autocomplete="current-password" placeholder="Password">
          <button type="button" class="lg-eye" id="lgEye" aria-label="Show password" title="Show password">👁</button></label>
        <div class="lg-row">
          <label><input type="checkbox" name="remember" ${store.get('cc_forget') ? '' : 'checked'}> Remember me</label>
          <a href="#" id="lgForgot">Forgot password?</a>
        </div>
        <button class="lg-btn" type="submit"><span id="lgBtnTxt">Login</span><span class="lg-arr">→</span></button>
        ${devRole ? '<a href="#" class="lg-switch" id="lgSwitch">Use a different account</a>' : ''}
        <div class="lg-foot">🔐 Secure login · <b>${esc(C.SHOP_NAME)}</b> ${esc(C.SHOP_SUB)}</div>
      </form>
    </div>
  </div>`;
  // girti barf
  const snow = $('#lgSnow');
  for (let i = 0; i < 20; i++) {
    const s = document.createElement('i'); s.textContent = '❄';
    s.style.left = Math.random() * 100 + '%'; s.style.fontSize = (7 + Math.random() * 12) + 'px';
    s.style.opacity = (0.35 + Math.random() * 0.55).toFixed(2);
    s.style.animationDuration = (6 + Math.random() * 7) + 's'; s.style.animationDelay = (-Math.random() * 12) + 's';
    snow.appendChild(s);
  }
  // Owner / Cashier (sirf dikhawa; asal role database se aata hai)
  if ($('#lgSwitch')) $('#lgSwitch').onclick = e => {
    e.preventDefault(); store.del('cc_role'); store.del('cc_email'); showLogin();
  };
  // kaunsa tab chuna hai: login usi role ka hona chahiye
  let selRole = devRole || 'owner';
  $('#lgSeg').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    selRole = b.dataset.r;
    $('#lgSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    $('#lgSeg').classList.toggle('c', b.dataset.r === 'cashier');
    $('#lgSub').textContent = `Sign in to your ${b.dataset.r} account`;
  };
  $('#lgEye').onclick = () => {
    const p = $('#loginForm').password, show = p.type === 'password';
    p.type = show ? 'text' : 'password';
    $('#lgEye').textContent = show ? '🙈' : '👁';
    $('#lgEye').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  };
  $('#lgForgot').onclick = e => {
    e.preventDefault();
    openModal(`<h3>Forgot password?</h3>
      <p class="muted">Please contact the shop owner. They will set a new password for you.</p>
      ${C.SHOP_PHONE ? `<p><b>📞 ${esc(C.SHOP_PHONE)}</b></p>` : ''}
      <div class="modal-actions"><button class="btn primary" data-close>OK</button></div>`);
  };
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target), btn = e.target.querySelector('.lg-btn'), txt = $('#lgBtnTxt');
    btn.disabled = true; txt.textContent = 'Logging in...';
    const email = f.get('email').trim();
    const { data, error } = await sb.auth.signInWithPassword({ email, password: f.get('password') });
    if (error) {
      btn.disabled = false; txt.textContent = 'Login';
      return toast(/invalid/i.test(error.message) ? 'Wrong email or password' : errMsg(error), 'bad');
    }
    // Owner tab se sirf owner, Cashier tab se sirf staff
    const { data: prof } = await sb.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
    const role = prof && prof.role;
    if ((role === 'owner' && selRole !== 'owner') || (role === 'staff' && selRole !== 'cashier')) {
      await sb.auth.signOut();
      btn.disabled = false; txt.textContent = 'Login';
      const how = devRole ? 'Tap "Use a different account".' : `Please use the ${role === 'owner' ? 'Owner' : 'Cashier'} tab.`;
      return toast(`This is ${role === 'owner' ? 'an owner' : 'a cashier'} account. ${how}`, 'bad');
    }
    // Remember me: email yaad rakho; na ho to browser band hone par logout
    if (f.get('remember')) { store.set('cc_email', email); store.del('cc_forget'); }
    else { store.del('cc_email'); store.set('cc_forget', '1'); }
    try { sessionStorage.setItem('cc_live', '1'); } catch (_) {}
    await afterLogin(data.user);
  };
}
// localStorage kabhi kabhi band hota hai (private window) — is liye try/catch
const store = {
  get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} },
  del: k => { try { localStorage.removeItem(k); } catch (_) {} }
};

async function afterLogin(user) {
  S.user = user;
  const { data, error } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error || !data) {
    app.innerHTML = `<div class="login-wrap"><div class="card login"><div class="logo big">⚠</div>
      <h1>Database not ready</h1><p class="muted"><b>database.sql</b> has not been run in Supabase yet, or this user has no profile.</p>
      <p class="muted"><small>${esc(error ? errMsg(error) : 'Profile not found')}</small></p>
      <button class="btn big" id="lo">Logout</button></div></div>`;
    $('#lo').onclick = () => sb.auth.signOut();
    return;
  }
  S.profile = data;
  if (data.role === 'owner' || data.role === 'staff') store.set('cc_role', data.role === 'owner' ? 'owner' : 'cashier');
  if (data.role === 'pending') {
    app.innerHTML = `<div class="login-wrap"><div class="card login"><div class="logo big">⏳</div>
      <h1>Waiting for approval</h1><p class="muted">Your account is ready. Ask the owner to make you <b>Staff</b> in <b>Settings → Users</b>.</p>
      <button class="btn big" id="re">Check again</button><button class="btn big" id="lo">Logout</button></div></div>`;
    $('#re').onclick = () => afterLogin(user);
    $('#lo').onclick = () => sb.auth.signOut();
    return;
  }
  await loadItems();
  showApp();
}

async function loadItems() {
  const { data, error } = await sb.from('items').select('*').eq('active', true).order('name');
  if (error) { toast('Could not load stock: ' + errMsg(error), 'bad'); return; }
  S.items = data.map(i => ({ ...i, stock: Number(i.stock), min_stock: Number(i.min_stock), sale_price: Number(i.sale_price),
    pack_size: i.pack_size == null ? null : Number(i.pack_size), pack_price: i.pack_price == null ? null : Number(i.pack_price) }));
  S.costs = {};
  if (isOwner()) {
    const { data: c } = await sb.from('item_costs').select('*');
    (c || []).forEach(r => { S.costs[r.item_id] = Number(r.purchase_price); });
  }
  // cart mein jo items ab nahi rahe un ko hata do
  S.cart = S.cart.filter(l => itemById(l.item_id));
}

/* ---------------- shell ---------------- */
const NAV = [
  ['home', '🏠', 'Home'],
  ['sale', '🧾', 'Sale'],
  ['stock', '📦', 'Stock'],
  ['udhaar', '📒', 'Udhaar'],
  ['report', '📊', 'History'],
  ['menu', '☰', 'Menu']
];
// jo screens nav mein nahi, wo kis tab ke neeche highlight hon
const NAV_PARENT = { low: 'home', purchase: 'menu', users: 'menu' };

// Laptop sidebar: groups
const SIDE = [
  ['Sales', [['home', '🏠', 'Dashboard'], ['sale', '🧾', 'POS / Billing'], ['report', '🧾', 'Sales History']]],
  ['Customers', [['udhaar', '📒', 'Customers & Khata']]],
  ['Stock', [['stock', '📦', 'Products'], ['low', '📋', 'Inventory'], ['purchase', '🚚', 'Purchase']]],
  ['Owner', [['users', '👥', 'Users / Staff'], ['menu', '⚙️', 'Settings']]]
];
const TITLES = { home: 'Dashboard', sale: 'POS / Billing', stock: 'Products', low: 'Inventory', udhaar: 'Customers & Khata',
  report: 'Sales History', menu: 'Settings', purchase: 'Purchase', users: 'Users / Staff' };
const canSee = k => isOwner() || STAFF_VIEWS.includes(k);
function initials(n) { return String(n || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase(); }
function nowText() { return new Date().toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }); }
setInterval(() => { const c = $('#clock'); if (c) c.textContent = nowText(); }, 30000);

function showApp() {
  const p = S.profile;
  app.innerHTML = `
  <div class="shell">
  <aside class="side">
    <div class="side-brand"><div class="logo">❄</div><div><b>${esc(C.SHOP_NAME)}</b><small>${esc(C.SHOP_SUB)} · ${esc(C.SHOP_TAG)}</small></div></div>
    ${SIDE.map(([g, list]) => { const l = list.filter(([k]) => canSee(k)); return l.length ? `<div class="side-group">${g === 'Owner' && !isOwner() ? 'Account' : g}</div>` +
      l.map(([k, ic, t]) => `<button class="side-item" data-nav="${k}"><span>${ic}</span>${t}</button>`).join('') : ''; }).join('')}
    <div class="side-user"><div class="avatar">${esc(initials(p.full_name))}</div><div><b>${esc(p.full_name || '')}</b><small>${isOwner() ? 'Owner' : 'Staff'}</small></div></div>
  </aside>
  <div class="main-col">
  <header class="top">
    <div class="brand"><div class="logo">❄</div><div><b>${esc(C.SHOP_NAME)}</b><small>${esc(C.SHOP_SUB)} · ${esc(C.SHOP_TAG)}</small></div></div>
    <h1 class="page-title" id="pageTitle"></h1>
    <div class="top-chips">
      <div class="tchip"><small>${isOwner() ? 'Owner' : 'Cashier'}</small><b>${esc(p.full_name || '')}</b></div>
      <div class="tchip"><small>Today</small><b id="clock">${nowText()}</b></div>
    </div>
    <div class="top-actions">
      ${isOwner() ? '<button class="icon-btn bell" id="bellBtn" title="Low stock alerts">🔔<span class="badge" id="lowBadge" hidden></span></button>' : ''}
      <button class="icon-btn" id="refreshBtn" title="Refresh">⟳</button>
    </div>
  </header>
  <nav class="nav">${NAV.filter(([k]) => isOwner() || STAFF_VIEWS.includes(k)).map(([k, ic, t]) => `<button data-nav="${k}"><span class="ic">${ic}</span>${t}</button>`).join('')}</nav>
  <main id="view"></main>
  </div></div>
  <button class="fab" id="fab" title="New sale">＋</button>`;
  app.querySelectorAll('.nav, .side').forEach(n => n.onclick = e => { const b = e.target.closest('[data-nav]'); if (b) go(b.dataset.nav); });
  if ($('#bellBtn')) $('#bellBtn').onclick = () => go('low');
  $('#fab').onclick = () => go('sale');
  $('#refreshBtn').onclick = async () => { await loadItems(); render(); toast('Data refreshed'); };
  render();
}
// Staff (cashier) sirf yeh screens dekh sakta hai
const STAFF_VIEWS = ['sale', 'stock', 'menu'];
function go(view) { S.view = view; render(); window.scrollTo(0, 0); }
function updateBadge() {
  const n = S.items.filter(isLow).length, b = $('#lowBadge');
  if (b) { b.hidden = !n; b.textContent = n; }
}
function render() {
  if (!isOwner() && !STAFF_VIEWS.includes(S.view)) S.view = 'sale';
  document.querySelectorAll('.nav [data-nav]').forEach(b => {
    b.classList.toggle('active', b.dataset.nav === (NAV_PARENT[S.view] || S.view));
  });
  document.querySelectorAll('.side [data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === S.view));
  const pt = $('#pageTitle'); if (pt) pt.textContent = TITLES[S.view] || '';
  updateBadge();
  const fab = $('#fab');
  if (fab) fab.hidden = S.view === 'sale';
  const v = $('#view');
  if (!v) return;
  v.onclick = v.oninput = v.onchange = null;
  ({ home: viewHome, sale: viewSale, stock: viewStock, low: viewLow, udhaar: viewUdhaar, report: viewReport, menu: viewMenu, purchase: viewPurchase, users: viewUsers }[S.view] || viewHome)(v);
}

/* ---------------- HOME ---------------- */
function viewHome(v) {
  const lowList = S.items.filter(isLow).sort((a, b) => a.stock - b.stock);
  const low = lowList.length;
  v.innerHTML = `
  <div class="summary-head">
    <div><h2>Today's Summary</h2><small>${new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · sales, udhaar and stock</small></div>
    <button class="btn primary desk-only" data-go="sale">＋ New Sale</button>
  </div>
  <div class="stat-grid">
    <button class="scard b-blue" data-go="report" id="hero"><small>Today's sale (<span id="hBills">…</span>)</small><b id="hToday">…</b><em id="hCmp"></em></button>
    <button class="scard b-green" data-go="report"><small>Gross profit (est.)</small><b id="hProfit">…</b></button>
    <button class="scard b-purple" data-go="udhaar"><small>Udhaar outstanding</small><b id="hUdhaar">…</b><em id="hUdhaarN"></em></button>
    <button class="scard b-red" data-go="low"><small>Low stock items</small><b>${low}</b></button>
    <button class="scard b-cyan" data-go="report"><small>Yesterday's sale</small><b id="hYest">…</b></button>
    <button class="scard b-amber" data-go="report"><small>Last 7 days</small><b id="hWeek">…</b></button>
    <button class="scard b-grey" data-go="stock"><small>Items in stock</small><b>${S.items.length}</b></button>
    <button class="scard b-grey" data-go="stock"><small>Stock value (cost)</small><b>${rs(S.items.reduce((s, i) => s + Math.max(i.stock, 0) * (S.costs[i.id] || 0), 0))}</b></button>
  </div>
  <div class="actions mob-only">
    <button class="act" data-go="sale"><span>🧾</span>New Sale</button>
    ${isOwner() ? '<button class="act" data-go="purchase"><span>🚚</span>Purchase</button>' : '<button class="act" data-go="stock"><span>📦</span>Stock</button>'}
    <button class="act" data-go="udhaar"><span>📒</span>Udhaar</button>
    <button class="act" data-go="low"><span>⚠️</span>Low Stock</button>
  </div>
  <div class="panels">
    <section class="card"><h3>Last 7 days</h3><div id="hChart"><p class="empty">Loading...</p></div></section>
    <section class="card"><div class="row-between"><h3>Low stock</h3><button class="btn small" data-go="low">View all</button></div>
      ${low ? `<table class="tbl"><thead><tr><th>Product</th><th>Stock</th><th>Min</th></tr></thead><tbody>
        ${lowList.slice(0, 6).map(i => `<tr><td>${esc(i.name)}</td><td><span class="pill ${i.stock <= 0 ? 'grey' : 'red'}">${i.stock <= 0 ? 'Out' : fmtQty(i.stock, i.unit)}</span></td><td>${trim3(i.min_stock)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="empty">✅ All items are in stock.</p>'}</section>
  </div>
  <section class="card"><div class="row-between"><h3>Recent sales</h3><button class="btn small" data-go="report">Sales History</button></div><div id="hRecent"><p class="empty">Loading...</p></div></section>`;
  v.onclick = e => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); };
  loadHome();
}

async function loadHome() {
  const hero = $('#hero');
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 6);
  const { data, error } = await sb.from('sales').select('id, created_at, total, voided, seller_name, summary, device, payment')
    .gte('created_at', start.toISOString()).order('created_at', { ascending: false }).limit(3000);
  if (hero !== $('#hero')) return; // user doosri screen par chala gaya
  if (error) { $('#hToday').textContent = '—'; $('#hCmp').textContent = errMsg(error); return; }

  const ok = data.filter(s => !s.voided);
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push({ key: dayStr(d), d, total: 0, bills: 0 }); }
  ok.forEach(s => { const day = days.find(x => x.key === dayStr(new Date(s.created_at))); if (day) { day.total += Number(s.total); day.bills++; } });
  const today = days[6], yest = days[5];

  let cmp = 'No sales yesterday';
  if (yest.total > 0) {
    const p = Math.round((today.total - yest.total) / yest.total * 100);
    cmp = `${p >= 0 ? '↑' : '↓'} ${Math.abs(p)}% vs yesterday`;
  }
  const credToday = ok.filter(s => s.payment === 'credit' && dayStr(new Date(s.created_at)) === today.key).reduce((t, s) => t + Number(s.total), 0);
  $('#hToday').textContent = rs(today.total);
  $('#hCmp').textContent = `Cash ${rs(today.total - credToday)} · Udhaar ${rs(credToday)} · ${cmp}`;
  if (isOwner()) udhaarBalances().then(map => {
    const due = Object.values(map).filter(m => m.balance > 0);
    if ($('#hUdhaar')) { $('#hUdhaar').textContent = rs(due.reduce((t, m) => t + m.balance, 0)); $('#hUdhaarN').textContent = `${due.length} customer${due.length === 1 ? '' : 's'}`; }
  }).catch(() => { if ($('#hUdhaar')) $('#hUdhaar').textContent = '—'; });
  $('#hBills').textContent = `${today.bills} bill${today.bills === 1 ? '' : 's'}`;
  $('#hYest').textContent = rs(yest.total);
  $('#hWeek').textContent = rs(days.reduce((s, x) => s + x.total, 0));

  const max = Math.max(...days.map(x => x.total), 1);
  $('#hChart').innerHTML = (max <= 1 ? '<p class="muted center" style="margin:0 0 6px">No sales in the last 7 days yet.</p>' : '') + `<div class="bars">${days.map((x, i) =>
      `<div class="bar ${i === 6 ? 'today' : ''}" style="height:${Math.max(x.total / max * 100, 2)}%" title="${x.d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}: ${rs(x.total)}"></div>`).join('')}</div>
    <div class="blabels">${days.map((x, i) => `<span>${i === 6 ? 'Today' : x.d.toLocaleDateString('en-US', { weekday: 'short' })}</span>`).join('')}</div>`;

  const recent = data.slice(0, 5);
  $('#hRecent').innerHTML = recent.length ? recent.map(s => `<div class="row ${s.voided ? 'voided' : ''}">
      <div><b>${s.device === 'mobile' ? '📱' : '💻'} ${fmtTime(s.created_at)} · ${esc(s.seller_name || '')}</b><small>${esc(s.summary || '')}</small></div>
      <div class="right"><b class="amt">${rs(s.total)}</b></div></div>`).join('')
    : '<p class="empty">No sales yet. Tap ＋ to make a sale.</p>';

  if (isOwner()) {
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    const r = await sb.from('sale_lines').select('cost, sales!inner(created_at, voided)')
      .gte('sales.created_at', t0.toISOString()).eq('sales.voided', false).limit(5000);
    const el = $('#hProfit');
    if (el) el.textContent = r.error ? '—' : rs(today.total - (r.data || []).reduce((s, x) => s + Number(x.cost), 0));
  }
}

/* ---------------- shared (customers, udhaar, csv) ---------------- */
async function loadCustomers() {
  const { data, error } = await sb.from('customers').select('*').eq('active', true).order('name');
  if (error) { toast('Could not load customers: ' + errMsg(error), 'bad'); S.customers = S.customers || []; return; }
  S.customers = data.map(c => ({ ...c, credit_limit: Number(c.credit_limit) || 0 }));
}
const custById = id => (S.customers || []).find(c => c.id === id);

// Har customer ka udhaar: kul udhaar sale - kul wasooli
// Supabase ek dafa mein 1000 lines deta hai; yeh sab pages jor kar laata hai
async function fetchAll(make) {
  let out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make().range(from, from + 999);
    if (error) return { data: null, error };
    out = out.concat(data);
    if (data.length < 1000) return { data: out, error: null };
  }
}
async function udhaarBalances() {
  const [s, p] = await Promise.all([
    fetchAll(() => sb.from('sales').select('id, customer_id, total, created_at, summary').eq('payment', 'credit').eq('voided', false)
      .not('customer_id', 'is', null).order('id', { ascending: false })),
    fetchAll(() => sb.from('khata_payments').select('id, customer_id, amount, created_at, note').order('id', { ascending: false }))
  ]);
  if (s.error || p.error) throw (s.error || p.error);
  // udhaar wale returns bhi khata kam karte hain
  const rt = await fetchAll(() => sb.from('sale_returns').select('id, customer_id, total, created_at, summary, seller_name')
    .eq('payment', 'credit').not('customer_id', 'is', null).order('id', { ascending: false }));
  if (rt.error) throw rt.error;
  const map = {};
  const get = id => (map[id] = map[id] || { credit: 0, paid: 0, last: null, sales: [], pays: [], rets: [] });
  rt.data.forEach(x => { const m = get(x.customer_id); m.paid += Number(x.total); m.rets.push(x); if (!m.last || x.created_at > m.last) m.last = x.created_at; });
  s.data.forEach(x => { const m = get(x.customer_id); m.credit += Number(x.total); m.sales.push(x); if (!m.last || x.created_at > m.last) m.last = x.created_at; });
  p.data.forEach(x => { const m = get(x.customer_id); m.paid += Number(x.amount); m.pays.push(x); if (!m.last || x.created_at > m.last) m.last = x.created_at; });
  Object.values(map).forEach(m => { m.balance = Math.round((m.credit - m.paid) * 100) / 100; });
  return map;
}
function downloadCsv(name, rows) {
  const csv = rows.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function waLink(phone, text) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '92' + d.slice(1);
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}
const pageHead = (title, sub, right = '') =>
  `<div class="summary-head"><div><h2>${title}</h2><small>${sub}</small></div>${right ? `<div class="head-btns">${right}</div>` : ''}</div>`;
const catList = () => [...new Set(S.items.map(i => i.category).filter(Boolean))].sort();

function customerForm(c, onSaved, prefillName = '') {
  const it = c || { name: prefillName, credit_limit: 0 };
  const m = openModal(`
    <h2>${c ? 'Edit customer' : 'New customer'}</h2>
    <form id="custForm">
      <label>Name *<input name="name" required value="${esc(it.name || '')}" placeholder="e.g. Akram Mistri"></label>
      <div class="line-grid two">
        <label>Phone / WhatsApp<input name="phone" inputmode="tel" value="${esc(it.phone || '')}" placeholder="03xx-xxxxxxx"></label>
        <label>Area<input name="area" value="${esc(it.area || '')}" placeholder="e.g. Model Town"></label>
      </div>
      ${isOwner() ? `<label>Credit limit (Rs) — 0 means no limit<input name="credit_limit" type="number" min="0" step="any" value="${esc(it.credit_limit || 0)}"></label>` : ''}
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button class="btn primary">Save</button>
      </div>
    </form>`);
  const f = $('#custForm', m);
  f.onsubmit = async e => {
    e.preventDefault();
    const d = new FormData(f), t = k => String(d.get(k) || '').trim() || null;
    const payload = { name: t('name'), phone: t('phone'), area: t('area') };
    if (isOwner()) payload.credit_limit = Number(d.get('credit_limit')) || 0;
    const btn = f.querySelector('.btn.primary'); btn.disabled = true;
    const r = c ? await sb.from('customers').update(payload).eq('id', c.id).select('id').single()
                : await sb.from('customers').insert(payload).select('id').single();
    btn.disabled = false;
    if (r.error) return toast('Not saved: ' + errMsg(r.error), 'bad');
    closeModal(); await loadCustomers();
    toast(c ? 'Customer updated' : 'Customer added');
    if (onSaved) onSaved(r.data.id);
  };
  f.name.focus();
}

/* ---------------- SALE (POS) ---------------- */
function calcAmount(line) {
  const it = itemById(line.item_id);
  const o = unitOptions(it).find(x => x.key === line.unit) || unitOptions(it)[0];
  const q = Number(line.qty) || 0;
  return Math.round(o.pack && it.pack_price > 0 ? q * it.pack_price : q * o.factor * it.sale_price);
}
function baseQty(line) {
  const it = itemById(line.item_id);
  const o = unitOptions(it).find(x => x.key === line.unit) || unitOptions(it)[0];
  return Math.round((Number(line.qty) || 0) * o.factor * 1000) / 1000;
}
function lineInfo(l) {
  const it = itemById(l.item_id);
  let s = `${rs(it.sale_price)}/${SHORT[it.unit]} · stock ${fmtQty(it.stock, it.unit)}`;
  if (it.pack_size > 0 && it.pack_price > 0) s += ` · ${esc(it.pack_name || 'Pack')} ${rs(it.pack_price)}`;
  if (baseQty(l) > it.stock + 1e-9) s += ` <span class="red">· Not enough stock!</span>`;
  return s;
}
const saleBtnHtml = '✔ Complete Sale <kbd>F4</kbd>';

document.addEventListener('keydown', e => {
  if (S.view !== 'sale' || $('#modal')) return;
  if (e.key === 'F2') { e.preventDefault(); const q = $('#q'); if (q) q.focus(); }
  if (e.key === 'F4') { e.preventDefault(); const b = $('#saveSale'); if (b && !b.disabled) saveSale(); }
});

function viewSale(v) {
  S.saleExtra = S.saleExtra || { disc: '', payment: 'cash', customer_id: null };
  const cats = catList();
  v.innerHTML = `
  <div class="pos">
    <div class="pos-left">
      <div class="pos-search-wrap">
        <input id="q" class="search pos-search" placeholder="🔍 Type item name, company or category...  (F2)" autocomplete="off">
        <div id="results" class="results pop"></div>
      </div>
      <section class="card cart-card">
        <div class="cart-head"><b>Current Sale</b><span id="cartCount"></span><button class="cart-clear" id="clearCart">Clear</button></div>
        <div id="cartBody"></div>
      </section>
      <section class="card">
        <div class="row-between">
          <select id="posCat" class="cat-select"><option value="">All categories</option>${cats.map(c => `<option ${S.posCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          <small>Quick pick — tap to add</small>
        </div>
        <div class="quick" id="quick"></div>
      </section>
    </div>
    <div class="pos-right">
      <section class="card">
        <h3>Customer</h3>
        <small class="lbl">Sale type</small>
        <div class="seg2" id="paySeg"><button type="button" data-pay="cash">💵 Cash</button><button type="button" data-pay="credit">📒 Udhaar (Credit)</button></div>
        <div id="custBox"></div>
      </section>
      <section class="card">
        <div class="sum-row"><span>Subtotal</span><b id="sub">Rs 0</b></div>
        <div class="sum-row"><span>Bill discount (Rs)</span><input id="disc" type="number" inputmode="numeric" min="0" placeholder="0" value="${esc(S.saleExtra.disc)}"></div>
        <div class="grand"><span>GRAND TOTAL</span><b id="grand">Rs 0</b></div>
        <button class="btn primary big" id="saveSale">${saleBtnHtml}</button>
      </section>
    </div>
  </div>`;
  const q = $('#q', v);
  q.onkeydown = e => {
    if (e.key === 'Enter') { const f = $('#results [data-add]'); if (f) f.click(); }
    if (e.key === 'Escape') { q.value = ''; renderResults(''); }
  };
  renderCart(); renderQuick(); renderCustBox();
  if (!S.customers) loadCustomers().then(renderCustBox);

  const step = (i, d) => {
    const l = S.cart[i];
    l.qty = String(Math.max(0, Math.round(((Number(l.qty) || 0) + d) * 1000) / 1000));
    l.amount = calcAmount(l); renderCart();
  };
  v.onclick = e => {
    const t = e.target, ex = S.saleExtra;
    const add = t.closest('[data-add]');
    if (add) { const fromSearch = !!add.closest('#results'); addToCart(+add.dataset.add, fromSearch); if (fromSearch) { q.value = ''; renderResults(''); } return; }
    const rm = t.closest('[data-rm]'); if (rm) { S.cart.splice(+rm.dataset.rm, 1); renderCart(); return; }
    const inc = t.closest('[data-inc]'); if (inc) return step(+inc.dataset.inc, 1);
    const dec = t.closest('[data-dec]'); if (dec) return step(+dec.dataset.dec, -1);
    const pay = t.closest('[data-pay]'); if (pay) { ex.payment = pay.dataset.pay; renderCustBox(); return; }
    const cu = t.closest('[data-cust]'); if (cu) { ex.customer_id = +cu.dataset.cust; renderCustBox(); return; }
    if (t.closest('#custChange')) { ex.customer_id = null; renderCustBox(); const i = $('#custQ'); if (i) i.focus(); return; }
    if (t.closest('#custNew')) return customerForm(null, id => { ex.customer_id = id; renderCustBox(); }, ($('#custQ') || {}).value || '');
    if (t.closest('#saveSale')) return saveSale();
    if (t.closest('#clearCart') && confirm('Remove all items from this bill?')) { S.cart = []; renderCart(); }
  };
  v.oninput = e => {
    const el = e.target;
    if (el.id === 'q') return renderResults(el.value);
    if (el.id === 'custQ') return renderCustResults(el.value);
    if (el.id === 'disc') { S.saleExtra.disc = el.value; return updateTotals(); }
    if (el.dataset.i === undefined) return;
    const i = +el.dataset.i, line = S.cart[i];
    if (el.dataset.f === 'qty') {
      line.qty = el.value; line.amount = calcAmount(line);
      $(`[data-i="${i}"][data-f="amount"]`).value = line.amount;
      $(`#info${i}`).innerHTML = lineInfo(line);
    }
    if (el.dataset.f === 'amount') line.amount = el.value;
    updateTotals();
  };
  v.onchange = e => {
    const el = e.target;
    if (el.id === 'posCat') { S.posCat = el.value; return renderQuick(); }
    if (el.dataset.f === 'unit') {
      const line = S.cart[+el.dataset.i];
      line.unit = el.value; line.amount = calcAmount(line); renderCart();
    }
  };
  if (!S.cart.length && deviceType() === 'laptop') setTimeout(() => q.focus(), 50);
}

function renderResults(text) {
  const box = $('#results');
  if (!box) return;
  if (!text.trim()) { box.innerHTML = ''; return; }
  const r = searchItems(text);
  box.innerHTML = r.length
    ? r.map(i => `<button class="result" data-add="${i.id}">
        <span><b>${esc(i.name)}</b> <small>${esc(i.company || '')} · ${rs(i.sale_price)}/${SHORT[i.unit]}</small></span>
        <span class="pill ${i.stock <= 0 ? 'grey' : isLow(i) ? 'red' : ''}">${i.stock <= 0 ? 'Out' : fmtQty(i.stock, i.unit)}</span></button>`).join('')
    : `<p class="empty">No item named "${esc(text)}".${isOwner() ? ' Add it from Products.' : ''}</p>`;
}
function renderQuick() {
  const box = $('#quick');
  if (!box) return;
  const list = S.items.filter(i => !S.posCat || i.category === S.posCat).slice(0, S.posCat ? 300 : 60);
  box.innerHTML = list.map(i => `<button class="qp ${i.stock <= 0 ? 'out' : isLow(i) ? 'low' : ''}" data-add="${i.id}">
      <b>${esc(i.name)}</b><span><em>${rs(i.sale_price)}</em> · ${i.stock <= 0 ? 'out of stock' : 'stock ' + fmtQty(i.stock, i.unit)}</span></button>`).join('')
    || '<p class="empty">No items in this category.</p>';
}
function addToCart(id, focus) {
  const it = itemById(id);
  if (!it) return;
  if (it.stock <= 0) toast(`${it.name} is out of stock`, 'bad');
  let idx = S.cart.findIndex(l => l.item_id === id);
  if (idx === -1) {
    const line = { item_id: id, qty: '1', unit: unitOptions(it)[0].key, amount: 0 };
    line.amount = calcAmount(line);
    S.cart.push(line); idx = S.cart.length - 1;
  } else {
    const l = S.cart[idx]; l.qty = String((Number(l.qty) || 0) + 1); l.amount = calcAmount(l);
  }
  renderCart();
  if (focus) { const inp = $(`[data-i="${idx}"][data-f="qty"]`); if (inp) { inp.focus(); inp.select(); } }
}
function renderCart() {
  const c = $('#cartBody');
  if (!c) return;
  const n = S.cart.length;
  $('#cartCount').textContent = `${n} item${n === 1 ? '' : 's'}`;
  $('#clearCart').hidden = !n;
  if (!n) { c.innerHTML = '<p class="empty">Cart is empty — search above or tap an item below.</p>'; updateTotals(); return; }
  c.innerHTML = `<div class="cl cl-h"><span>#</span><span>Item</span><span>Qty</span><span>Unit</span><span>Total (Rs)</span><span></span></div>` +
    S.cart.map((l, i) => {
      const it = itemById(l.item_id);
      return `<div class="cl">
        <span class="cl-n">${i + 1}</span>
        <div class="cl-item"><b>${esc(it.name)}</b><small id="info${i}">${lineInfo(l)}</small></div>
        <div class="cl-qty"><button type="button" data-dec="${i}">−</button><input type="number" inputmode="decimal" step="any" min="0" data-i="${i}" data-f="qty" value="${esc(l.qty)}"><button type="button" data-inc="${i}">+</button></div>
        <select class="cl-unit" data-i="${i}" data-f="unit">${unitOptions(it).map(o => `<option value="${o.key}" ${o.key === l.unit ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
        <input class="cl-amt" type="number" inputmode="numeric" step="any" min="0" data-i="${i}" data-f="amount" value="${esc(l.amount)}">
        <button class="x" data-rm="${i}" title="Remove">✕</button>
      </div>`;
    }).join('');
  updateTotals();
}
function updateTotals() {
  const sum = S.cart.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const disc = Number(S.saleExtra && S.saleExtra.disc) || 0;
  if ($('#sub')) $('#sub').textContent = rs(sum);
  if ($('#grand')) $('#grand').textContent = rs(sum - disc);
  const b = $('#saveSale'); if (b) b.disabled = !S.cart.length;
}
function renderCustBox() {
  const box = $('#custBox');
  if (!box) return;
  const ex = S.saleExtra;
  document.querySelectorAll('#paySeg [data-pay]').forEach(b => b.classList.toggle('on', b.dataset.pay === ex.payment));
  const c = custById(ex.customer_id);
  if (c) {
    box.innerHTML = `<div class="cust-sel"><div class="avatar">${esc(initials(c.name))}</div>
      <div><b>${esc(c.name)}</b><small>${esc([c.phone, c.area].filter(Boolean).join(' · ') || 'No phone')}</small></div>
      <button class="btn small" id="custChange">Change</button></div>
      <div class="cust-acct" id="custAcct"><small>Loading udhaar...</small></div>`;
    loadCustAcct(c);
    return;
  }
  box.innerHTML = `<div class="cust-find"><input id="custQ" placeholder="Search customer name or phone..." autocomplete="off"><button class="btn" id="custNew">＋ New</button></div>
    <div id="custRes" class="results"></div>
    <small class="hint">${ex.payment === 'credit' ? '<span class="red">An udhaar sale needs a customer.</span>' : 'Walk-in customer. Pick a customer only if you want it on their record.'}</small>`;
}
function renderCustResults(t) {
  const box = $('#custRes');
  if (!box) return;
  const w = t.trim().toLowerCase();
  if (!w) { box.innerHTML = ''; return; }
  const r = (S.customers || []).filter(c => (c.name + ' ' + (c.phone || '') + ' ' + (c.area || '')).toLowerCase().includes(w)).slice(0, 6);
  box.innerHTML = r.length
    ? r.map(c => `<button class="result" data-cust="${c.id}"><span><b>${esc(c.name)}</b> <small>${esc(c.phone || '')}</small></span><small>${esc(c.area || '')}</small></button>`).join('')
    : '<p class="empty">No customer found. Tap ＋ New.</p>';
}

/* ----- Customer ka udhaar, statement aur return (owner + cashier) ----- */
async function custStatement(id) {
  const { data, error } = await sb.rpc('customer_statement', { p_customer: id });
  if (error) throw error;
  return { balance: Number(data.balance) || 0, entries: data.entries || [] };
}
async function loadCustAcct(c) {
  const box = $('#custAcct');
  try {
    const st = await custStatement(c.id);
    if (!box || box !== $('#custAcct')) return;
    box.innerHTML = `<div class="acct-bal"><small>Previous udhaar</small><b class="${st.balance > 0 ? 'purple' : ''}">${rs(st.balance)}</b></div>
      <div class="acct-btns"><button class="btn small" id="custStmt">📄 Statement</button><button class="btn small" id="custReturn">↩ Return items</button></div>`;
    $('#custStmt').onclick = () => statementModal(c, st);
    $('#custReturn').onclick = () => returnModal({ customer: c });
  } catch (e) { if (box) box.innerHTML = `<small class="red">${esc(errMsg(e))}</small>`; }
}
function statementText(c, st) {
  const lines = st.entries.slice().reverse().map(x =>
    `${fmtDate(x.at)}  ${x.type === 'sale' ? 'Bill #' + x.ref : x.type === 'payment' ? 'Paid' : 'Returned'}${x.text ? ' (' + x.text + ')' : ''}  ${x.amount < 0 ? '−' : '+'}${rs(Math.abs(x.amount))}`);
  return `*${C.SHOP_NAME} - ${C.SHOP_SUB}*\n*Udhaar statement: ${c.name}*\n${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}\n━━━━━━━━━━━━\n` +
    (lines.length ? lines.join('\n') : 'No entries') + `\n━━━━━━━━━━━━\n*Balance due: ${rs(st.balance)}*`;
}
function statementModal(c, st) {
  const label = { sale: 'Udhaar sale', payment: 'Payment received', return: 'Items returned' };
  const m = openModal(`
    <h2 style="margin:0">${esc(c.name)}</h2><small>${esc([c.phone, c.area].filter(Boolean).join(' · '))}</small>
    <div class="scard b-purple" style="cursor:default;margin:10px 0"><small>Balance due</small><b class="purple">${rs(st.balance)}</b></div>
    ${st.entries.length ? `<div class="tbl-wrap" style="max-height:45vh;overflow:auto"><table class="tbl"><thead><tr><th>Date</th><th>Detail</th><th>Amount</th></tr></thead><tbody>
      ${st.entries.map(x => `<tr><td><small class="nowrap">${fmtDate(x.at)}<br>${fmtTime(x.at)}</small></td>
        <td>${label[x.type]}${x.type === 'sale' ? ' #' + x.ref : ''}<small>${esc(x.text || '')}</small></td>
        <td class="nowrap ${x.amount < 0 ? 'green' : ''}">${x.amount < 0 ? '− ' : '+ '}${rs(Math.abs(x.amount))}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="empty">No udhaar history yet.</p>'}
    <div class="modal-actions">
      <button class="btn" id="stSend">💬 Send to customer</button>
      <button class="btn primary" data-close>Close</button>
    </div>`);
  $('#stSend', m).onclick = () => { const t = statementText(c, st); c.phone ? window.open(waLink(c.phone, t), '_blank') : shareText(t); };
}
// opts: { customer } ya { sale } (bill # se, sirf owner)
async function returnModal(opts) {
  const params = opts.customer ? { p_customer: opts.customer.id } : { p_sale: opts.sale };
  const { data, error } = await sb.rpc('returnable_lines', params);
  if (error) return toast(errMsg(error), 'bad');
  const lines = data.map(l => ({ ...l, qty: Number(l.qty), returned: Number(l.returned), amount: Number(l.amount) }))
    .filter(l => l.qty - l.returned > 0.0005);
  const title = opts.customer ? esc(opts.customer.name) : `Bill #${opts.sale}`;
  if (!lines.length) return openModal(`<h3>Return items · ${title}</h3><p class="empty">Nothing to return${opts.customer ? ' — no udhaar items found for this customer' : ''}.</p>
    <div class="modal-actions"><button class="btn primary" data-close>OK</button></div>`);
  const unitOf = l => (itemById(l.item_id) || {}).unit;
  const m = openModal(`
    <h2 style="margin:0">↩ Return items</h2><small>${title} · enter how much came back</small>
    <div class="tbl-wrap" style="max-height:50vh;overflow:auto;margin-top:10px"><table class="tbl ret">
      <thead><tr><th>Item</th><th>Can return</th><th>Return</th><th>Refund</th></tr></thead><tbody>
      ${lines.map((l, i) => { const left = Math.round((l.qty - l.returned) * 1000) / 1000, u = unitOf(l); return `<tr>
        <td><b>${esc(l.item_name)}</b><small>Bill #${l.sale_id} · ${fmtDate(l.sold_at)} · ${l.payment === 'credit' ? 'Udhaar' : 'Cash'}</small></td>
        <td class="nowrap">${u ? fmtQty(left, u) : trim3(left)}</td>
        <td><input type="number" class="imp-num" min="0" max="${left}" step="any" inputmode="decimal" data-r="${i}" placeholder="0 ${u ? SHORT[u] : ''}"></td>
        <td class="nowrap" id="rf${i}">—</td></tr>`; }).join('')}
      </tbody></table></div>
    <label style="margin-top:10px">Note<input id="retNote" placeholder="optional, e.g. not used"></label>
    <div class="sum-row"><span>Total refund</span><b id="retTotal">Rs 0</b></div>
    <small id="retHint" class="hint"></small>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="retSave" disabled>✔ Save return</button></div>`);
  const picked = () => lines.map((l, i) => ({ l, q: Number($(`[data-r="${i}"]`, m).value) || 0 })).filter(x => x.q > 0);
  m.oninput = e => {
    const i = e.target.dataset.r; if (i === undefined) return;
    const l = lines[+i], q = Number(e.target.value) || 0;
    $(`#rf${i}`, m).textContent = q > 0 ? rs(l.amount * q / l.qty) : '—';
    const p = picked(), total = p.reduce((s, x) => s + x.l.amount * x.q / x.l.qty, 0);
    const over = p.some(x => x.q > x.l.qty - x.l.returned + 0.0005);
    const mixed = new Set(p.map(x => x.l.payment)).size > 1;
    $('#retTotal', m).textContent = rs(total);
    $('#retHint', m).innerHTML = over ? '<span class="red">Cannot return more than sold.</span>'
      : mixed ? '<span class="red">Return udhaar and cash items separately.</span>'
      : p.length && p[0].l.payment === 'credit' ? 'This amount will be removed from the customer\'s udhaar.' : p.length ? 'Give this cash back to the customer.' : '';
    $('#retSave', m).disabled = !p.length || over || mixed;
  };
  $('#retSave', m).onclick = async () => {
    const p = picked();
    if (!p.length || !confirm('Save this return? Stock will go up.')) return;
    const btn = $('#retSave', m); btn.disabled = true; btn.textContent = 'Saving...';
    const { error: er } = await sb.rpc('create_return', { p_lines: p.map(x => ({ line_id: x.l.line_id, qty: x.q })), p_note: $('#retNote', m).value || null });
    if (er) { btn.disabled = false; btn.textContent = '✔ Save return'; return toast(errMsg(er), 'bad'); }
    closeModal(); toast('Return saved ✔ Stock updated');
    await loadItems(); render();
  };
}

async function saveSale() {
  const btn = $('#saveSale'), ex = S.saleExtra;
  if (!S.cart.length) return;
  const lines = [];
  for (const l of S.cart) {
    const it = itemById(l.item_id);
    const o = unitOptions(it).find(x => x.key === l.unit) || unitOptions(it)[0];
    const q = baseQty(l);
    if (!(q > 0)) return toast(`${it.name}: enter a quantity`, 'bad');
    if (q > it.stock + 1e-9) return toast(`${it.name}: not enough stock (only ${fmtQty(it.stock, it.unit)} left)`, 'bad');
    lines.push({ item_id: it.id, qty: q, entered_qty: Number(l.qty), entered_unit: o.label, amount: Number(l.amount) || 0, name: it.name });
  }
  if (ex.payment === 'credit' && !ex.customer_id) return toast('Udhaar sale: please select a customer', 'bad');
  const disc = Number(ex.disc) || 0;
  btn.disabled = true; btn.textContent = 'Saving...';
  const { data, error } = await sb.rpc('create_sale', {
    p_lines: lines.map(({ name, ...x }) => x), p_customer: null, p_discount: disc, p_device: deviceType(),
    p_payment: ex.payment, p_customer_id: ex.customer_id
  });
  if (error) {
    btn.disabled = false; btn.innerHTML = saleBtnHtml;
    return toast('Sale not saved: ' + errMsg(error), 'bad');
  }
  const cust = custById(ex.customer_id);
  const receipt = { id: data, lines, disc, cust: cust ? cust.name : '', phone: cust && cust.phone, payment: ex.payment,
    total: lines.reduce((s, l) => s + l.amount, 0) - disc, date: new Date(), seller: S.profile.full_name };
  S.cart = []; S.saleExtra = null;
  await loadItems();
  render();
  toast('Sale saved ✔ Stock updated');
  showReceipt(receipt);
}

function showReceipt(r) {
  const credit = r.payment === 'credit';
  const m = openModal(`
    <div id="receipt">
      <div class="c"><b>${esc(C.SHOP_NAME).toUpperCase()}</b><br>${esc(C.SHOP_SUB)}<br><small>${esc(C.SHOP_TAG)}</small>
      ${C.SHOP_ADDRESS ? `<small>${esc(C.SHOP_ADDRESS)}</small>` : ''}${C.SHOP_PHONE ? `<small>📞 ${esc(C.SHOP_PHONE)}</small>` : ''}</div>
      <hr>
      Bill #${esc(r.id)} · ${credit ? 'UDHAAR' : 'CASH'}<br>${r.date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
      ${r.seller ? `<br>Cashier: ${esc(r.seller)}` : ''}
      ${r.cust ? `<br>Customer: ${esc(r.cust)}` : ''}
      <table>${r.lines.map(l => `<tr><td>${esc(l.name)}<br><small>${trim3(l.entered_qty)} ${esc(l.entered_unit || '')}</small></td><td>${rs(l.amount)}</td></tr>`).join('')}</table>
      <hr>
      ${r.disc ? `<table><tr><td>Discount</td><td>- ${rs(r.disc)}</td></tr></table>` : ''}
      <table><tr><td><b>TOTAL</b></td><td><b>${rs(r.total)}</b></td></tr></table>
      <div class="c"><small>Thank you! Please visit again.</small></div>
    </div>
    <div class="modal-actions">
      <button class="btn" id="shareBill">📤 WhatsApp</button>
      <button class="btn" id="printBill">🖨 Print</button>
      <button class="btn primary" data-close>Done</button>
    </div>`);
  const text = `*${C.SHOP_NAME} - ${C.SHOP_SUB}*\nBill #${r.id} (${credit ? 'Udhaar' : 'Cash'})\n` +
    r.lines.map(l => `${trim3(l.entered_qty)} ${l.entered_unit || ''} ${l.name} = ${rs(l.amount)}`).join('\n') +
    (r.disc ? `\nDiscount: -${rs(r.disc)}` : '') + `\n*Total: ${rs(r.total)}*`;
  $('#printBill', m).onclick = () => window.print();
  $('#shareBill', m).onclick = () => r.phone ? window.open(waLink(r.phone, text), '_blank') : shareText(text);
}

/* ---------------- STOCK (Products) ---------------- */
function viewStock(v) {
  const cats = catList();
  v.innerHTML = pageHead('Products', `All items with stock and rates${isOwner() ? ', cost and margin' : ''}.`,
    isOwner() ? '<button class="btn" id="expCsv">Export CSV</button><button class="btn primary" id="newItem">＋ Add Product</button>' : '') + `
  <section class="card">
    <div class="toolbar">
      <input id="sq" class="search" placeholder="🔍 Search name, company or category..." autocomplete="off" value="${esc(S.stockQuery || '')}">
      <select id="scat"><option value="">All categories</option>${cats.map(c => `<option ${S.stockCat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <small id="scount"></small>
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Product</th><th class="hide-m">Category</th><th>Stock</th>${isOwner() ? '<th class="hide-m">Cost</th>' : ''}<th>Sale</th>${isOwner() ? '<th class="hide-m">Margin</th><th class="hide-m"></th>' : ''}</tr></thead>
      <tbody id="stockList"></tbody>
    </table></div>
  </section>`;
  const list = () => {
    const t = S.stockQuery || '';
    return (t.trim() ? searchItems(t, 5000) : S.items).filter(i => !S.stockCat || i.category === S.stockCat);
  };
  const draw = () => {
    const l = list();
    $('#scount').textContent = `${l.length} result${l.length === 1 ? '' : 's'}`;
    $('#stockList').innerHTML = l.length ? l.map(stockRow).join('')
      : `<tr><td colspan="7" class="empty">${S.items.length ? 'No item found.' : 'No items yet.'}</td></tr>`;
  };
  draw();
  v.oninput = e => { if (e.target.id === 'sq') { S.stockQuery = e.target.value; draw(); } };
  v.onchange = e => { if (e.target.id === 'scat') { S.stockCat = e.target.value; draw(); } };
  v.onclick = e => {
    if (e.target.closest('#newItem')) return itemForm();
    if (e.target.closest('#expCsv')) return downloadCsv(`cool-care-products-${dayStr(new Date())}.csv`,
      [['Name', 'Company', 'Category', 'Unit', 'Stock', 'Min stock', 'Sale rate', 'Cost rate']]
        .concat(list().map(i => [i.name, i.company, i.category, i.unit, trim3(i.stock), trim3(i.min_stock), i.sale_price, S.costs[i.id] ?? ''])));
    const r = e.target.closest('[data-edit]');
    if (r && isOwner()) itemForm(itemById(+r.dataset.edit));
  };
}
function stockRow(i) {
  const cost = S.costs[i.id];
  const margin = cost != null && i.sale_price > 0 ? Math.round((i.sale_price - cost) / i.sale_price * 100) + '%' : '—';
  return `<tr class="${isOwner() ? 'click' : ''}" data-edit="${i.id}">
    <td><b>${esc(i.name)}</b><small>${esc(i.company || '')}${isOwner() ? '' : ''}</small></td>
    <td class="hide-m">${esc(i.category || '')}</td>
    <td><span class="pill ${i.stock <= 0 ? 'grey' : isLow(i) ? 'red' : ''}">${i.stock <= 0 ? 'Out' : fmtQty(i.stock, i.unit)}</span></td>
    ${isOwner() ? `<td class="hide-m">${cost != null ? rs(cost) : '—'}</td>` : ''}
    <td><b>${rs(i.sale_price)}</b><small>/${SHORT[i.unit]}</small></td>
    ${isOwner() ? `<td class="hide-m">${margin}</td><td class="hide-m"><button class="btn small">Edit</button></td>` : ''}
  </tr>`;
}

const UNIT_LABELS = { piece: 'Piece', kg: 'Kilo (kg) — gas etc.', litre: 'Litre — oil etc.', meter: 'Meter', feet: 'Feet — pipe etc.', gaz: 'Gaz — wire etc.' };
// opts.prefill: naye item ke liye pehle se bhari values; opts.onSaved(id): save ke baad
function itemForm(item, opts = {}) {
  const it = item || { unit: 'piece', stock: 0, min_stock: 0, sale_price: 0, ...(opts.prefill || {}) };
  const cats = catList();
  const comps = [...new Set(S.items.map(i => i.company).filter(Boolean))];
  const val = x => x == null ? '' : esc(x);
  const m = openModal(`
    <h2>${item ? 'Edit product' : 'New product'}</h2>
    <form id="itemForm">
      <label>Name *<input name="name" required value="${val(it.name)}" placeholder="e.g. Capacitor 35uF"></label>
      <div class="line-grid two">
        <label>Company<input name="company" list="compList" value="${val(it.company)}" placeholder="Haier, Dawlance..."></label>
        <label>Category<input name="category" list="catList" value="${val(it.category)}" placeholder="Gas, Capacitor..."></label>
      </div>
      <datalist id="catList">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <datalist id="compList">${comps.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <label>Sold by<select name="unit">${Object.entries(UNIT_LABELS).map(([k, t]) => `<option value="${k}" ${k === it.unit ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <div class="line-grid two">
        <label>Sale rate (per <span class="u">${SHORT[it.unit]}</span>) *<input name="sale_price" type="number" step="any" min="0" required value="${val(it.sale_price)}"></label>
        <label>Cost rate (per <span class="u">${SHORT[it.unit]}</span>)<input name="purchase_price" type="number" step="any" min="0" value="${val(item ? S.costs[item.id] : '')}"></label>
      </div>
      <div class="line-grid two">
        <label>${item ? 'Stock (only to fix a mistake)' : 'Opening stock'}<input name="stock" type="number" step="any" min="0" value="${val(trim3(it.stock))}"></label>
        <label>Low stock alert at<input name="min_stock" type="number" step="any" min="0" value="${val(trim3(it.min_stock))}"></label>
      </div>
      <fieldset><legend>Also sold as a full pack / cylinder? (optional)</legend>
        <div class="line-grid">
          <label>Name<input name="pack_name" value="${val(it.pack_name)}" placeholder="Cylinder"></label>
          <label>Size (<span class="u">${SHORT[it.unit]}</span>)<input name="pack_size" type="number" step="any" min="0" value="${val(it.pack_size)}" placeholder="13.6"></label>
          <label>Full price<input name="pack_price" type="number" step="any" min="0" value="${val(it.pack_price)}"></label>
        </div>
      </fieldset>
      <div class="modal-actions">
        ${item ? '<button type="button" class="btn danger" id="delItem">Delete</button>' : ''}
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>`);
  const form = $('#itemForm', m);
  form.unit.onchange = () => m.querySelectorAll('.u').forEach(s => { s.textContent = SHORT[form.unit.value]; });
  form.onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(form);
    const n = k => { const x = String(f.get(k) || '').trim(); return x === '' ? null : Number(x); };
    const t = k => String(f.get(k) || '').trim() || null;
    const payload = {
      name: t('name'), company: t('company'), category: t('category'), unit: f.get('unit'),
      sale_price: n('sale_price') || 0, stock: n('stock') || 0, min_stock: n('min_stock') || 0,
      pack_name: t('pack_name'), pack_size: n('pack_size'), pack_price: n('pack_price')
    };
    if (!payload.pack_size) { payload.pack_size = null; payload.pack_price = null; }
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    let id = item && item.id, error;
    if (item) ({ error } = await sb.from('items').update(payload).eq('id', id));
    else { const r = await sb.from('items').insert(payload).select('id').single(); error = r.error; id = r.data && r.data.id; }
    if (!error && n('purchase_price') != null) ({ error } = await sb.from('item_costs').upsert({ item_id: id, purchase_price: n('purchase_price') }));
    btn.disabled = false;
    if (error) return toast('Not saved: ' + errMsg(error), 'bad');
    closeModal(); await loadItems();
    if (opts.onSaved) opts.onSaved(id);
    render(); toast(item ? 'Product updated' : 'Product added');
  };
  const del = $('#delItem', m);
  if (del) del.onclick = async () => {
    if (!confirm(`Remove "${item.name}" from the list? (Old sales records stay safe)`)) return;
    const { error } = await sb.from('items').update({ active: false }).eq('id', item.id);
    if (error) return toast(errMsg(error), 'bad');
    closeModal(); await loadItems(); render(); toast('Product removed');
  };
}

/* ---------------- INVENTORY (low stock + adjustments) ---------------- */
function viewLow(v) {
  if (S.lowOnly == null) S.lowOnly = true;
  const low = S.items.filter(isLow);
  const costVal = S.items.reduce((s, i) => s + Math.max(i.stock, 0) * (S.costs[i.id] || 0), 0);
  const saleVal = S.items.reduce((s, i) => s + Math.max(i.stock, 0) * i.sale_price, 0);
  v.innerHTML = pageHead('Inventory', 'Stock levels, adjustments (damage / lost / count) and stock movement history.',
    low.length ? '<button class="btn" id="shareLow">📤 Send low stock list</button>' : '') + `
  <div class="stat-grid">
    <div class="scard b-green"><small>Active products</small><b>${S.items.length}</b></div>
    <div class="scard b-blue"><small>Stock value (cost)</small><b>${rs(costVal)}</b></div>
    <div class="scard b-cyan"><small>Stock value (sale)</small><b>${rs(saleVal)}</b></div>
    <button class="scard b-red" id="lowCard"><small>Low stock items</small><b>${low.length}</b></button>
  </div>
  <div class="panels wide">
    <section class="card">
      <div class="toolbar">
        <input id="iq" class="search" placeholder="🔍 Search..." autocomplete="off" value="${esc(S.invQuery || '')}">
        <label class="check"><input type="checkbox" id="lowOnly" ${S.lowOnly ? 'checked' : ''}> Low stock only</label>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Product</th><th>Stock</th><th>Min</th><th class="hide-m">Value (cost)</th><th></th></tr></thead>
        <tbody id="invList"></tbody>
      </table></div>
    </section>
    <section class="card"><h3>Recent stock movements</h3><div id="moves"><p class="empty">Loading...</p></div></section>
  </div>`;
  const draw = () => {
    const t = S.invQuery || '';
    const l = (t.trim() ? searchItems(t, 5000) : S.items).filter(i => !S.lowOnly || isLow(i)).sort((a, b) => S.lowOnly ? a.stock - b.stock : 0);
    $('#invList').innerHTML = l.length ? l.map(i => `<tr>
        <td><b>${esc(i.name)}</b><small>${esc([i.company, i.category].filter(Boolean).join(' · '))}</small></td>
        <td><span class="pill ${i.stock <= 0 ? 'grey' : isLow(i) ? 'red' : ''}">${i.stock <= 0 ? 'Out' : fmtQty(i.stock, i.unit)}</span></td>
        <td>${trim3(i.min_stock)}</td>
        <td class="hide-m">${rs(Math.max(i.stock, 0) * (S.costs[i.id] || 0))}</td>
        <td><button class="btn small" data-adj="${i.id}">Adjust</button></td></tr>`).join('')
      : `<tr><td colspan="5" class="empty">${S.lowOnly ? '✅ All items have enough stock.' : 'No item found.'}</td></tr>`;
  };
  draw();
  v.oninput = e => { if (e.target.id === 'iq') { S.invQuery = e.target.value; draw(); } };
  v.onchange = e => { if (e.target.id === 'lowOnly') { S.lowOnly = e.target.checked; draw(); } };
  v.onclick = e => {
    if (e.target.closest('#lowCard')) { S.lowOnly = true; $('#lowOnly').checked = true; return draw(); }
    const a = e.target.closest('[data-adj]'); if (a) return adjustForm(itemById(+a.dataset.adj));
    if (e.target.closest('#shareLow')) showLowStockShare(low);
  };
  loadMoves();
}
// WhatsApp ke liye saaf order list: khatam aur kam alag, category ke hisaab se
function lowStockMessage(low) {
  const label = i => i.name + (i.company && !i.name.toLowerCase().includes(i.company.toLowerCase()) ? ` (${i.company})` : '');
  let n = 0;
  const section = (title, list, withQty) => {
    if (!list.length) return '';
    const groups = {};
    list.forEach(i => { (groups[i.category || 'Other'] = groups[i.category || 'Other'] || []).push(i); });
    return `\n${title} (${list.length})\n` + Object.keys(groups).sort().map(cat =>
      `\n_${cat}_\n` + groups[cat].sort((a, b) => a.name.localeCompare(b.name))
        .map(i => `${++n}. ${label(i)}${withQty ? `  —  *${fmtQty(i.stock, i.unit)}* left` : ''}`).join('\n')).join('\n') + '\n';
  };
  const out = low.filter(i => i.stock <= 0), few = low.filter(i => i.stock > 0);
  const line = '━━━━━━━━━━━━━━';
  return `*❄ ${C.SHOP_NAME} — ${C.SHOP_SUB}*\n*Order List* · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}\n${line}\n` +
    section('🔴 *OUT OF STOCK*', out, false) +
    section('🟡 *RUNNING LOW*', few, true) +
    `${line}\nTotal: *${low.length} item${low.length === 1 ? '' : 's'}*`;
}

/* ----- Kam stock ki PICTURE (design/low-stock-picture.svg ke mutabiq) ----- */
function lowStockPicture(low) {
  const W = 720, PAD = 36, CW = 648;               // design ki chaurai
  const out = low.filter(i => i.stock <= 0).sort((a, b) => a.name.localeCompare(b.name));
  const few = low.filter(i => i.stock > 0).sort((a, b) => a.stock / (a.min_stock || 1) - b.stock / (b.min_stock || 1));
  const OUT_ROW = 54, LOW_ROW = 58, HEAD = 52;
  const outH = out.length ? HEAD + out.length * OUT_ROW + 24 : 0;
  const lowH = few.length ? HEAD + few.length * LOW_ROW + 22 : 0;
  let H = 304 + outH + (outH && lowH ? 24 : 0) + lowH + 110;
  // bohat lambi picture ho to resolution kam (browser ki had ~32k px)
  const scale = H * 2 > 30000 ? 1 : 2;
  const cv = document.createElement('canvas');
  cv.width = W * scale; cv.height = H * scale;
  const g = cv.getContext('2d');
  g.scale(scale, scale);
  const FONT = '"Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const font = (size, weight = 400) => { g.font = `${weight} ${size}px ${FONT}`; };
  const text = (s, x, y, size, color, weight = 400, align = 'left') => { font(size, weight); g.fillStyle = color; g.textAlign = align; g.fillText(s, x, y); };
  const rrect = (x, y, w, h, r, color, stroke) => {
    g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h);
    if (color) { g.fillStyle = color; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
  };
  // lamba naam: pehle font chhota, phir bhi na aaye to "…"
  const fitText = (s, x, y, maxW, color) => {
    let size = 19;
    font(size); while (g.measureText(s).width > maxW && size > 14) font(--size);
    let t = s;
    if (g.measureText(t).width > maxW) { while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1); t += '…'; }
    g.fillStyle = color; g.textAlign = 'left'; g.fillText(t, x, y);
  };
  const now = new Date();
  const dateTxt = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeTxt = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  g.fillStyle = '#f2f6fa'; g.fillRect(0, 0, W, H);
  // header
  const grad = g.createLinearGradient(0, 0, W, 170); grad.addColorStop(0, '#0b6fb8'); grad.addColorStop(1, '#16b3d9');
  g.fillStyle = grad; g.fillRect(0, 0, W, 170);
  rrect(36, 38, 64, 64, 18, '#fff');
  text('❄', 68, 83, 38, '#0b6fb8', 400, 'center');
  text(String(C.SHOP_NAME).toUpperCase(), 120, 66, 30, '#fff', 800);
  text(`${C.SHOP_SUB} · ${C.SHOP_TAG}`, 120, 96, 19, '#dff3fb');
  const pill = `📋 ORDER LIST · ${dateTxt}`;
  font(17, 700); const pw = g.measureText(pill).width + 40;
  rrect(36, 120, pw, 34, 17, 'rgba(255,255,255,.2)');
  text(pill, 36 + pw / 2, 143, 17, '#fff', 700, 'center');
  // tiles
  [['Out of stock', out.length, '#fdecea', '#d92d20'], ['Running low', few.length, '#fff3dc', '#c77700'], ['Total items', low.length, '#e6f2fb', '#0b6fb8']]
    .forEach(([t, n, bg, fg], k) => { const x = 36 + k * 224; rrect(x, 194, 200, 86, 16, bg); text(t, x + 20, 226, 16, fg); text(String(n), x + 20, 262, 32, fg, 800); });
  // card ka sar (upar gol, neeche seedha)
  const cardHead = (y, h, color, title) => {
    rrect(PAD, y, CW, h, 18, '#fff', '#dde5ee');
    rrect(PAD, y, CW, HEAD, 18, color); g.fillStyle = color; g.fillRect(PAD, y + 32, CW, 20);
    text(title, 60, y + 34, 20, '#fff', 800);
  };
  let y = 304, n = 0;
  if (out.length) {
    cardHead(y, outH, '#d92d20', '🔴 OUT OF STOCK');
    out.forEach((i, k) => {
      const by = y + 90 + k * OUT_ROW;
      // category pill ke saath right side par (zyada se zyada 130px), naam baqi jagah mein
      let catW = 0;
      if (i.category) {
        font(15); let c = i.category;
        if (g.measureText(c).width > 130) { while (c.length > 3 && g.measureText(c + '…').width > 130) c = c.slice(0, -1); c += '…'; }
        catW = g.measureText(c).width;
        text(c, 594, by, 15, '#64748b', 400, 'right');
      }
      fitText(`${++n}.  ${i.name}`, 60, by, 594 - catW - 16 - 60, '#14212e');
      rrect(606, by - 20, 58, 28, 14, '#eef1f5'); text('0', 635, by, 14, '#64748b', 700, 'center');
      if (k < out.length - 1) { g.strokeStyle = '#eef1f5'; g.beginPath(); g.moveTo(60, by + 20); g.lineTo(660, by + 20); g.stroke(); }
    });
    y += outH + (lowH ? 24 : 0);
  }
  if (few.length) {
    cardHead(y, lowH, '#f08a00', '🟡 RUNNING LOW');
    few.forEach((i, k) => {
      const by = y + 90 + k * LOW_ROW;
      fitText(`${++n}.  ${i.name}`, 60, by, 325, '#14212e');
      text(`Min: ${trim3(i.min_stock)}${i.unit === 'piece' ? '' : ' ' + SHORT[i.unit]}`, 400, by, 14, '#64748b');
      rrect(560, by - 20, 104, 28, 14, '#fdecea'); text(fmtQty(i.stock, i.unit), 612, by, 15, '#d92d20', 700, 'center');
      rrect(60, by + 12, 600, 6, 3, '#eef1f5');
      const p = Math.max(0.04, Math.min(1, i.stock / (i.min_stock || 1)));
      rrect(60, by + 12, 600 * p, 6, 3, '#f08a00');
    });
    y += lowH;
  }
  // footer
  text(`Made with Cool Care App · ${dateTxt}, ${timeTxt}`, W / 2, y + 46, 16, '#64748b', 400, 'center');
  text(`❄ ${C.SHOP_NAME} ${C.SHOP_SUB}`, W / 2, y + 74, 14, '#94a3b8', 400, 'center');
  return cv;
}
function showLowStockShare(low) {
  const cv = lowStockPicture(low);
  const fname = `order-list-${dayStr(new Date())}.png`;
  const m = openModal(`
    <h3>Order list</h3>
    <div class="pic-preview"><img src="${cv.toDataURL('image/png')}" alt="Order list picture"></div>
    <div class="modal-actions">
      <button class="btn primary" id="sendPic">🖼 Send picture</button>
      <button class="btn" id="sendTxt">📝 Send text</button>
    </div>
    <div class="modal-actions"><button class="btn" data-close>Close</button></div>`);
  $('#sendTxt', m).onclick = () => shareText(lowStockMessage(low));
  $('#sendPic', m).onclick = () => cv.toBlob(async blob => {
    if (!blob) return toast('Could not make the picture', 'bad');
    const file = new File([blob], fname, { type: 'image/png' });
    // mobile: seedha share (WhatsApp), laptop: download
    if (deviceType() === 'mobile' && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Order list' }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = fname;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Picture downloaded. Attach it in WhatsApp.');
  }, 'image/png');
}

async function loadMoves() {
  const box = $('#moves');
  const [sl, pu, ad, rl] = await Promise.all([
    sb.from('sale_lines').select('item_id, item_name, qty, sale_id, sales!inner(created_at, voided)').order('id', { ascending: false }).limit(40),
    sb.from('purchases').select('item_id, item_name, qty, supplier, created_at').order('created_at', { ascending: false }).limit(40),
    sb.from('stock_adjustments').select('item_id, item_name, qty, reason, created_at').order('created_at', { ascending: false }).limit(40),
    sb.from('return_lines').select('item_id, item_name, qty, sale_id, sale_returns!inner(created_at, seller_name)').order('id', { ascending: false }).limit(40)
  ]);
  if (!box || box !== $('#moves')) return;
  const err = sl.error || pu.error || ad.error || rl.error;
  if (err) { box.innerHTML = `<p class="empty red">${esc(errMsg(err))}</p>`; return; }
  const rows = [
    ...sl.data.map(x => ({ at: x.sales.created_at, id: x.item_id, name: x.item_name, type: x.sales.voided ? 'cancelled' : 'sale', qty: x.sales.voided ? 0 : -x.qty, ref: 'Bill #' + x.sale_id })),
    ...pu.data.map(x => ({ at: x.created_at, id: x.item_id, name: x.item_name, type: 'purchase', qty: +x.qty, ref: x.supplier || '' })),
    ...ad.data.map(x => ({ at: x.created_at, id: x.item_id, name: x.item_name, type: 'adjust', qty: +x.qty, ref: x.reason || '' })),
    ...rl.data.map(x => ({ at: x.sale_returns.created_at, id: x.item_id, name: x.item_name, type: 'return', qty: +x.qty, ref: `Bill #${x.sale_id}${x.sale_returns.seller_name ? ' · ' + x.sale_returns.seller_name : ''}` }))
  ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 30);
  const PILL = { sale: 'red', purchase: '', adjust: 'amber', cancelled: 'grey', return: 'amber' };
  box.innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th class="hide-m">Ref</th></tr></thead><tbody>
    ${rows.map(r => { const u = (itemById(r.id) || {}).unit; return `<tr>
      <td><small class="nowrap">${fmtDate(r.at)}<br>${fmtTime(r.at)}</small></td><td>${esc(r.name || '')}</td>
      <td><span class="pill ${PILL[r.type]}">${r.type}</span></td>
      <td class="nowrap">${r.qty > 0 ? '+' : ''}${u ? fmtQty(r.qty, u) : trim3(r.qty)}</td>
      <td class="hide-m"><small>${esc(r.ref)}</small></td></tr>`; }).join('')}
    </tbody></table></div>` : '<p class="empty">No stock movements yet.</p>';
}
function adjustForm(it) {
  if (!it) return;
  const m = openModal(`
    <h2>Adjust stock</h2>
    <p class="muted" style="margin-top:0">${esc(it.name)} · current stock <b>${fmtQty(it.stock, it.unit)}</b></p>
    <form id="adjForm">
      <div class="seg2" id="adjType"><button type="button" data-t="-1" class="on">➖ Remove (damage / lost)</button><button type="button" data-t="1">➕ Add (count correction)</button></div>
      <div class="line-grid two">
        <label>Quantity<input name="qty" type="number" step="any" min="0" required inputmode="decimal"></label>
        <label>Unit<select name="unit">${unitOptions(it).map(o => `<option value="${o.key}">${esc(o.label)}</option>`).join('')}</select></label>
      </div>
      <label>Reason<input name="reason" placeholder="e.g. Damaged, Expired, Stock count"></label>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div>
    </form>`);
  let sign = -1;
  $('#adjType', m).onclick = e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    sign = +b.dataset.t; m.querySelectorAll('#adjType button').forEach(x => x.classList.toggle('on', x === b));
  };
  const f = $('#adjForm', m);
  f.onsubmit = async e => {
    e.preventDefault();
    const o = unitOptions(it).find(x => x.key === f.unit.value);
    const q = Math.round((Number(f.qty.value) || 0) * o.factor * 1000) / 1000;
    if (!(q > 0)) return toast('Enter a quantity', 'bad');
    const btn = f.querySelector('.btn.primary'); btn.disabled = true;
    const { error } = await sb.rpc('adjust_stock', { p_item: it.id, p_qty: sign * q, p_reason: f.reason.value || null });
    btn.disabled = false;
    if (error) return toast(errMsg(error), 'bad');
    closeModal(); await loadItems(); render(); toast(`${it.name}: stock ${sign > 0 ? 'increased' : 'reduced'} by ${fmtQty(q, it.unit)}`);
  };
  f.qty.focus();
}

/* ---------------- SALES HISTORY (Report) ---------------- */
function setRange(chip) {
  const d = new Date(), t = dayStr(d);
  const back = n => { const x = new Date(); x.setDate(x.getDate() - n); return dayStr(x); };
  const r = {
    today: [t, t], yesterday: [back(1), back(1)], week: [back(6), t],
    month: [dayStr(new Date(d.getFullYear(), d.getMonth(), 1)), t]
  }[chip];
  S.report = { from: r[0], to: r[1], chip };
}
function viewReport(v) {
  if (!S.report.from) setRange('today');
  S.repF = S.repF || { cashier: '', type: '', q: '' };
  const chips = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 days'], ['month', 'This month']];
  v.innerHTML = pageHead('Sales History', 'View bills, reprint, or cancel a wrong sale (stock comes back).') + `
  <section class="card">
    <div class="chips">${chips.map(([k, t]) => `<button class="chip ${S.report.chip === k ? 'on' : ''}" data-chip="${k}">${t}</button>`).join('')}</div>
    <div class="filters">
      <label>From<input type="date" id="rf" value="${S.report.from}"></label>
      <label>To<input type="date" id="rt" value="${S.report.to}"></label>
      <label>Cashier<select id="rc"><option value="">All</option></select></label>
      <label>Type<select id="rty"><option value="">All</option><option value="cash" ${S.repF.type === 'cash' ? 'selected' : ''}>Cash</option><option value="credit" ${S.repF.type === 'credit' ? 'selected' : ''}>Udhaar</option></select></label>
      <label class="grow">Search<input id="rq" placeholder="Bill # / customer / item" value="${esc(S.repF.q)}"></label>
    </div>
    <div class="sum-chips" id="repChips"></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Bill</th><th>Date</th><th class="hide-m">Cashier</th><th class="hide-m">Customer</th><th>Type</th><th>Total</th><th></th></tr></thead>
      <tbody id="repRows"><tr><td colspan="7" class="empty">Loading...</td></tr></tbody>
    </table></div>
  </section>
  <div id="repReturns"></div>
  <div id="repTop"></div>`;
  if (!S.customers) loadCustomers().then(() => drawReport());
  v.onclick = async e => {
    const c = e.target.closest('[data-chip]');
    if (c) { setRange(c.dataset.chip); return render(); }
    const vw = e.target.closest('[data-view]');
    if (vw) return viewBill(+vw.dataset.view);
    const vd = e.target.closest('[data-void]');
    if (vd && confirm('Cancel this sale? Its stock will be added back.')) {
      const { error } = await sb.rpc('void_sale', { p_sale: +vd.dataset.void });
      if (error) return toast(errMsg(error), 'bad');
      await loadItems(); render(); toast('Sale cancelled, stock added back');
    }
  };
  v.onchange = e => {
    const id = e.target.id;
    if (id === 'rf' || id === 'rt') {
      S.report = { from: $('#rf').value || S.report.from, to: $('#rt').value || S.report.to, chip: null };
      return render();
    }
    if (id === 'rc') { S.repF.cashier = e.target.value; drawReport(); }
    if (id === 'rty') { S.repF.type = e.target.value; drawReport(); }
  };
  v.oninput = e => { if (e.target.id === 'rq') { S.repF.q = e.target.value; drawReport(); } };
  loadReport();
}
async function loadReport() {
  const body = $('#repRows');
  const from = new Date(S.report.from + 'T00:00:00');
  const to = new Date(S.report.to + 'T00:00:00'); to.setDate(to.getDate() + 1);
  const { data: sales, error } = await fetchAll(() => sb.from('sales').select('*')
    .gte('created_at', from.toISOString()).lt('created_at', to.toISOString())
    .order('created_at', { ascending: false }).order('id', { ascending: false }));
  if (!body || body !== $('#repRows')) return;
  if (error) { body.innerHTML = `<tr><td colspan="7" class="empty red">${esc(errMsg(error))}</td></tr>`; return; }
  let lines = [];
  if (isOwner()) {
    const r = await fetchAll(() => sb.from('sale_lines').select('sale_id, item_name, qty, amount, cost, item_id, sales!inner(created_at, voided)')
      .gte('sales.created_at', from.toISOString()).lt('sales.created_at', to.toISOString()).eq('sales.voided', false).order('id'));
    lines = r.data || [];
  }
  let returns = [];
  if (isOwner()) {
    const r = await fetchAll(() => sb.from('sale_returns').select('*, return_lines(sale_id, cost)')
      .gte('created_at', from.toISOString()).lt('created_at', to.toISOString()).order('created_at', { ascending: false }));
    returns = r.data || [];
  }
  if (body !== $('#repRows')) return;
  S.repData = { sales, lines, returns };
  const sellers = [...new Set(sales.map(s => s.seller_name).filter(Boolean))].sort();
  if (S.repF.cashier && !sellers.includes(S.repF.cashier)) S.repF.cashier = '';
  $('#rc').innerHTML = '<option value="">All</option>' + sellers.map(n => `<option ${n === S.repF.cashier ? 'selected' : ''}>${esc(n)}</option>`).join('');
  drawReport();

  const top = {};
  lines.forEach(l => {
    const k = l.item_name;
    top[k] = top[k] || { name: k, qty: 0, amount: 0, unit: (itemById(l.item_id) || {}).unit || '' };
    top[k].qty += Number(l.qty); top[k].amount += Number(l.amount);
  });
  const topList = Object.values(top).sort((a, b) => b.amount - a.amount).slice(0, 10);
  const staff = {};
  sales.filter(s => !s.voided).forEach(s => { const k = s.seller_name || '—'; staff[k] = (staff[k] || 0) + Number(s.total); });
  $('#repTop').innerHTML = isOwner() && sales.length ? `<div class="panels">
    <section class="card"><h3>Top selling items</h3>${topList.length ? `<table class="tbl"><thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead><tbody>
      ${topList.map(t => `<tr><td>${esc(t.name)}</td><td>${t.unit ? fmtQty(t.qty, t.unit) : trim3(t.qty)}</td><td><b>${rs(t.amount)}</b></td></tr>`).join('')}</tbody></table>` : '<p class="empty">—</p>'}</section>
    <section class="card"><h3>Sales by staff</h3><table class="tbl"><thead><tr><th>Cashier</th><th>Sale</th></tr></thead><tbody>
      ${Object.entries(staff).sort((a, b) => b[1] - a[1]).map(([n, t]) => `<tr><td><span class="who"><span class="avatar sm">${esc(initials(n))}</span>${esc(n)}</span></td><td><b>${rs(t)}</b></td></tr>`).join('')}</tbody></table></section>
  </div>` : '';
}
function drawReport() {
  if (!S.repData || !$('#repRows')) return;
  const f = S.repF, w = f.q.trim().toLowerCase();
  const list = S.repData.sales.filter(s =>
    (!f.cashier || s.seller_name === f.cashier) && (!f.type || (s.payment || 'cash') === f.type) &&
    (!w || String(s.id) === w.replace('#', '') || (s.customer || '').toLowerCase().includes(w) || (s.summary || '').toLowerCase().includes(w)));
  const ok = list.filter(s => !s.voided);
  const sum = arr => arr.reduce((t, s) => t + Number(s.total), 0);
  const total = sum(ok), credit = sum(ok.filter(s => s.payment === 'credit'));
  const ids = new Set(ok.map(s => s.id));
  const cost = S.repData.lines.filter(l => ids.has(l.sale_id)).reduce((t, l) => t + Number(l.cost), 0);
  // is waqt mein jo maal wapis hua (cashier/type filter ke saath)
  const rets = (S.repData.returns || []).filter(r => (!f.cashier || r.seller_name === f.cashier) && (!f.type || r.payment === f.type));
  const retTotal = rets.reduce((t, r) => t + Number(r.total), 0);
  const retCost = rets.reduce((t, r) => t + (r.return_lines || []).reduce((a, x) => a + Number(x.cost), 0), 0);
  $('#repChips').innerHTML = `<span class="schip">${ok.length} bill${ok.length === 1 ? '' : 's'}</span>
    <span class="schip green">Net total ${rs(total - retTotal)}</span><span class="schip blue">Cash ${rs(total - credit)}</span>
    <span class="schip amber">Udhaar ${rs(credit)}</span>${retTotal ? `<span class="schip">Returns −${rs(retTotal)}</span>` : ''}
    ${isOwner() ? `<span class="schip purple">Profit (est.) ${rs(total - cost - (retTotal - retCost))}</span>` : ''}`;
  const rb = $('#repReturns');
  if (rb) rb.innerHTML = rets.length ? `<section class="card"><h3>↩ Returns (${rets.length})</h3><div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>Date</th><th>By</th><th>Customer</th><th>Items</th><th>Type</th><th>Amount</th></tr></thead><tbody>
    ${rets.map(r => `<tr><td class="nowrap">${fmtDate(r.created_at)} ${fmtTime(r.created_at)}</td><td>${esc(r.seller_name || '')}</td>
      <td>${esc((custById(r.customer_id) || {}).name || 'Walk-in')}</td><td><small>${esc(r.summary || '')}</small>${r.note ? `<small>${esc(r.note)}</small>` : ''}</td>
      <td><span class="pill ${r.payment === 'credit' ? 'amber' : ''}">${r.payment === 'credit' ? 'Udhaar' : 'Cash'}</span></td>
      <td class="nowrap"><b>−${rs(r.total)}</b></td></tr>`).join('')}
    </tbody></table></div></section>` : '';
  const multiDay = S.report.from !== S.report.to;
  $('#repRows').innerHTML = list.length ? list.map(s => `<tr class="${s.voided ? 'voided' : ''}">
      <td><b>#${s.id}</b></td>
      <td class="nowrap">${multiDay ? fmtDate(s.created_at) + ' ' : ''}${fmtTime(s.created_at)} <span title="${s.device || ''}">${s.device === 'mobile' ? '📱' : '💻'}</span></td>
      <td class="hide-m">${esc(s.seller_name || '')}</td>
      <td class="hide-m">${esc(s.customer || 'Walk-in')}<small>${esc(s.summary || '')}</small></td>
      <td><span class="pill ${s.payment === 'credit' ? 'amber' : ''}">${s.payment === 'credit' ? 'Udhaar' : 'Cash'}</span></td>
      <td><b class="amt">${rs(s.total)}</b>${s.voided ? '<small class="red">Cancelled</small>' : ''}</td>
      <td class="nowrap">${isOwner() ? `<button class="btn small" data-view="${s.id}">View</button>` : ''}${isOwner() && !s.voided ? ` <button class="btn small danger" data-void="${s.id}">Cancel</button>` : ''}</td>
    </tr>`).join('') : '<tr><td colspan="7" class="empty">No sales in this period.</td></tr>';
}
async function viewBill(id) {
  const s = (S.repData.sales || []).find(x => x.id === id);
  const { data, error } = await sb.from('sale_lines').select('item_name, entered_qty, entered_unit, qty, amount').eq('sale_id', id).order('id');
  if (error || !s) return toast(error ? errMsg(error) : 'Bill not found', 'bad');
  const cust = custById(s.customer_id);
  showReceipt({ id, lines: data.map(l => ({ name: l.item_name, entered_qty: l.entered_qty ?? l.qty, entered_unit: l.entered_unit, amount: Number(l.amount) })),
    disc: Number(s.discount), cust: s.customer, phone: cust && cust.phone, payment: s.payment, total: Number(s.total), date: new Date(s.created_at), seller: s.seller_name });
  // owner bill se seedha maal wapis le sakta hai (cash bhi)
  const acts = $('#modal .modal-actions');
  if (isOwner() && !s.voided && acts) {
    const b = document.createElement('button');
    b.className = 'btn'; b.textContent = '↩ Return';
    b.onclick = () => returnModal({ sale: id });
    acts.insertBefore(b, acts.lastElementChild);
  }
}

/* ---------------- CUSTOMERS & KHATA (Udhaar) ---------------- */
function viewUdhaar(v) {
  S.khataTab = S.khataTab || 'all';
  const tabs = [['all', 'All customers'], ['due', 'Outstanding'], ['limit', 'Limit alerts']];
  v.innerHTML = pageHead('Customers & Khata', 'Customer records, credit limits, udhaar ledger and payment collection.',
    '<button class="btn primary" id="newCust">＋ New Customer</button>') + `
  <div class="tabs">${tabs.map(([k, t]) => `<button class="${S.khataTab === k ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('')}</div>
  <div class="stat-grid three" id="kstats"></div>
  <section class="card">
    <div class="toolbar"><input id="kq" class="search" placeholder="🔍 Search name, phone, area..." autocomplete="off" value="${esc(S.khataQ || '')}"><button class="btn" id="kcsv">Export CSV</button></div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Customer</th><th class="hide-m">Phone</th><th class="hide-m">Area</th><th>Balance</th><th class="hide-m">Limit</th><th class="hide-m">Used</th><th class="hide-m">Last activity</th><th></th></tr></thead>
      <tbody id="klist"><tr><td colspan="8" class="empty">Loading...</td></tr></tbody>
    </table></div>
  </section>`;
  v.onclick = e => {
    const t = e.target;
    const tab = t.closest('[data-tab]'); if (tab) { S.khataTab = tab.dataset.tab; v.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b === tab)); return drawKhata(); }
    if (t.closest('#newCust')) return customerForm(null, () => reloadKhata());
    if (t.closest('#kcsv')) return downloadCsv(`cool-care-udhaar-${dayStr(new Date())}.csv`,
      [['Customer', 'Phone', 'Area', 'Balance', 'Credit limit', 'Last activity']].concat(khataRows().map(({ c, b }) => [c.name, c.phone, c.area, b.balance, c.credit_limit, b.last ? fmtDate(b.last) : ''])));
    const rc = t.closest('[data-recv]'); if (rc) return receiveForm(custById(+rc.dataset.recv));
    const wa = t.closest('[data-wa]'); if (wa) return remind(custById(+wa.dataset.wa));
    const lg = t.closest('[data-ledger]'); if (lg) return ledger(custById(+lg.dataset.ledger));
  };
  v.oninput = e => { if (e.target.id === 'kq') { S.khataQ = e.target.value; drawKhata(); } };
  reloadKhata();
}
async function reloadKhata() {
  await loadCustomers();
  try { S.khata = await udhaarBalances(); }
  catch (e) { S.khata = {}; toast('Could not load udhaar: ' + errMsg(e), 'bad'); }
  if (S.view === 'udhaar') drawKhata();
}
const balOf = id => (S.khata && S.khata[id]) || { balance: 0, last: null, sales: [], pays: [], rets: [] };
function khataRows() {
  const w = (S.khataQ || '').trim().toLowerCase();
  return (S.customers || []).map(c => ({ c, b: balOf(c.id) }))
    .filter(({ c, b }) => S.khataTab === 'due' ? b.balance > 0 : S.khataTab === 'limit' ? c.credit_limit > 0 && b.balance >= c.credit_limit * 0.8 : true)
    .filter(({ c }) => !w || (c.name + ' ' + (c.phone || '') + ' ' + (c.area || '')).toLowerCase().includes(w))
    .sort((a, b) => b.b.balance - a.b.balance || a.c.name.localeCompare(b.c.name));
}
function drawKhata() {
  const box = $('#klist');
  if (!box || !S.customers) return;
  const all = S.customers.map(c => ({ c, b: balOf(c.id) }));
  const due = all.filter(x => x.b.balance > 0);
  const cross = all.filter(x => x.c.credit_limit > 0 && x.b.balance > x.c.credit_limit);
  $('#kstats').innerHTML = `
    <div class="scard b-green"><small>Total customers</small><b>${all.length}</b></div>
    <div class="scard b-amber"><small>Total outstanding (${due.length} customer${due.length === 1 ? '' : 's'})</small><b>${rs(due.reduce((s, x) => s + x.b.balance, 0))}</b></div>
    <div class="scard b-red"><small>Over credit limit</small><b>${cross.length}</b></div>`;
  const rows = khataRows();
  box.innerHTML = rows.length ? rows.map(({ c, b }) => {
    const pct = c.credit_limit > 0 ? Math.min(100, Math.max(0, b.balance / c.credit_limit * 100)) : 0;
    return `<tr>
      <td><button class="link name" data-ledger="${c.id}">${esc(c.name)}</button><small class="show-m">${esc(c.phone || '')}</small></td>
      <td class="hide-m">${esc(c.phone || '')}</td>
      <td class="hide-m">${esc(c.area || '')}</td>
      <td class="nowrap"><b class="${b.balance > 0 ? 'purple' : ''}">${rs(b.balance)}</b></td>
      <td class="hide-m">${c.credit_limit > 0 ? rs(c.credit_limit) : '—'}</td>
      <td class="hide-m"><div class="used"><i style="width:${pct}%" class="${pct >= 100 ? 'over' : pct >= 80 ? 'near' : ''}"></i></div></td>
      <td class="hide-m"><small>${b.last ? fmtDate(b.last) + ' ' + fmtTime(b.last) : '—'}</small></td>
      <td class="nowrap"><button class="btn small green" data-recv="${c.id}" ${b.balance > 0 ? '' : 'disabled'}>Receive</button>
        ${c.phone && b.balance > 0 ? `<button class="btn small" data-wa="${c.id}" title="WhatsApp reminder">💬</button>` : ''}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="8" class="empty">${S.customers.length ? 'No customer here.' : 'No customers yet. Tap ＋ New Customer.'}</td></tr>`;
}
function receiveForm(c) {
  if (!c) return;
  const bal = balOf(c.id).balance;
  const m = openModal(`
    <h2>Receive payment</h2>
    <p class="muted" style="margin-top:0">${esc(c.name)} · outstanding <b class="purple">${rs(bal)}</b></p>
    <form id="recvForm">
      <label>Amount received (Rs)<input name="amount" type="number" min="1" step="any" required inputmode="numeric" value="${bal > 0 ? bal : ''}"></label>
      <label>Note<input name="note" placeholder="optional, e.g. JazzCash"></label>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">✔ Save payment</button></div>
    </form>`);
  const f = $('#recvForm', m);
  f.onsubmit = async e => {
    e.preventDefault();
    const amount = Number(f.amount.value);
    if (!(amount > 0)) return toast('Enter an amount', 'bad');
    const btn = f.querySelector('.btn.primary'); btn.disabled = true;
    const { error } = await sb.from('khata_payments').insert({ customer_id: c.id, amount, note: f.note.value.trim() || null });
    btn.disabled = false;
    if (error) return toast('Not saved: ' + errMsg(error), 'bad');
    closeModal(); toast(`${rs(amount)} received from ${c.name}`);
    await reloadKhata();
  };
  f.amount.select();
}
function remind(c) {
  if (!c) return;
  const bal = balOf(c.id).balance;
  window.open(waLink(c.phone, `Assalam o Alaikum ${c.name},\n${C.SHOP_NAME} - ${C.SHOP_SUB}: your outstanding udhaar is *${rs(bal)}*. Please clear it at your earliest. Thank you!`), '_blank');
}
function ledger(c) {
  if (!c) return;
  const b = balOf(c.id);
  const entries = [
    ...b.sales.map(s => ({ at: s.created_at, text: `Sale #${s.id}`, sub: s.summary || '', amt: Number(s.total) })),
    ...b.pays.map(p => ({ at: p.created_at, text: 'Payment received', sub: p.note || '', amt: -Number(p.amount) })),
    ...(b.rets || []).map(r => ({ at: r.created_at, text: `Items returned${r.seller_name ? ' (by ' + r.seller_name + ')' : ''}`, sub: r.summary || '', amt: -Number(r.total) }))
  ].sort((x, y) => (x.at < y.at ? -1 : 1));
  let run = 0;
  entries.forEach(x => { run += x.amt; x.bal = run; });
  const m = openModal(`
    <div class="row-between"><div><h2 style="margin:0">${esc(c.name)}</h2><small>${esc([c.phone, c.area].filter(Boolean).join(' · '))}</small></div>
      <button class="btn small" id="ledEdit">Edit</button></div>
    <div class="scard b-purple" style="cursor:default;margin:10px 0"><small>Outstanding balance</small><b class="purple">${rs(b.balance)}</b>
      <em>${c.credit_limit > 0 ? 'Credit limit ' + rs(c.credit_limit) : 'No credit limit'}</em></div>
    ${entries.length ? `<div class="tbl-wrap" style="max-height:45vh;overflow:auto"><table class="tbl"><thead><tr><th>Date</th><th>Detail</th><th>Amount</th><th>Balance</th></tr></thead><tbody>
      ${entries.slice().reverse().map(x => `<tr><td><small class="nowrap">${fmtDate(x.at)}</small></td><td>${esc(x.text)}<small>${esc(x.sub)}</small></td>
        <td class="nowrap ${x.amt < 0 ? 'green' : ''}">${x.amt < 0 ? '− ' + rs(-x.amt) : '+ ' + rs(x.amt)}</td><td class="nowrap">${rs(x.bal)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="empty">No udhaar history yet.</p>'}
    <div class="modal-actions">
      ${c.phone && b.balance > 0 ? '<button class="btn" id="ledWa">💬 Remind</button>' : ''}
      ${b.balance > 0 ? '<button class="btn green" id="ledRecv">Receive</button>' : ''}
      <button class="btn primary" data-close>Close</button>
    </div>`);
  $('#ledEdit', m).onclick = () => customerForm(c, () => reloadKhata());
  if ($('#ledWa', m)) $('#ledWa', m).onclick = () => remind(c);
  if ($('#ledRecv', m)) $('#ledRecv', m).onclick = () => receiveForm(c);
}

/* ---------------- MENU / SETTINGS ---------------- */
function viewMenu(v) {
  const p = S.profile;
  v.innerHTML = pageHead('Settings', 'Your account, staff and app options.') + `
  <section class="card">
    <div class="who big"><span class="avatar">${esc(initials(p.full_name))}</span><div><b>${esc(p.full_name || '')}</b><small>${esc(p.email || '')}</small></div>
    <span class="pill" style="margin-left:auto">${isOwner() ? 'Owner' : 'Staff'}</span></div>
  </section>
  <section class="card menu-list">
    ${isOwner() ? `<button class="btn" data-go="purchase">🚚 Purchase (stock in)</button>
    <button class="btn" data-go="udhaar">📒 Customers & Khata</button>
    <button class="btn" data-go="low">📋 Inventory & adjustments</button>
    <button class="btn" data-go="users">👥 Users / Staff</button>` : ''}
    <button class="btn" id="install">📲 Install app on phone / laptop</button>
    <button class="btn" id="pw">🔑 Change my password</button>
    <button class="btn danger" id="logout">🚪 Logout</button>
  </section>`;
  v.onclick = async e => {
    const g = e.target.closest('[data-go]');
    if (g) return go(g.dataset.go);
    if (e.target.closest('#logout') && confirm('Logout?')) { await sb.auth.signOut(); }
    if (e.target.closest('#install')) {
      if (S.installPrompt) { S.installPrompt.prompt(); S.installPrompt = null; return; }
      openModal(`<h3>Install the app</h3><div class="note">
        <b>Android (Chrome):</b><ol><li>Tap ⋮ (3 dots) at the top</li><li>Choose "Add to Home screen" or "Install app"</li></ol><br>
        <b>iPhone (Safari):</b><ol><li>Tap the Share ⬆ button</li><li>Choose "Add to Home Screen"</li></ol><br>
        <b>Laptop (Chrome / Edge):</b><ol><li>Click the install ⊕ icon on the right of the address bar</li></ol></div>
        <div class="modal-actions"><button class="btn primary" data-close>OK</button></div>`);
    }
    if (e.target.closest('#pw')) {
      const m = openModal(`<h3>New password</h3><form id="pwForm">
        <label>New password (at least 8 characters)<input type="password" name="p1" minlength="8" required autocomplete="new-password"></label>
        <label>Type it again<input type="password" name="p2" minlength="8" required autocomplete="new-password"></label>
        <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary">Save</button></div></form>`);
      $('#pwForm', m).onsubmit = async ev => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        if (f.get('p1') !== f.get('p2')) return toast('Passwords do not match', 'bad');
        const { error } = await sb.auth.updateUser({ password: f.get('p1') });
        if (error) return toast(errMsg(error), 'bad');
        closeModal(); toast('Password changed');
      };
    }
  };
}

/* ---------------- PURCHASE (owner) ---------------- */
function viewPurchase(v) {
  if (!isOwner()) return go('sale');
  if (S.imp) return viewImport(v);
  v.innerHTML = pageHead('Purchase (Stock In)', 'When new stock arrives, enter it here. Stock goes up automatically.',
    '<label class="btn primary file-btn">📥 Import bill (Excel)<input type="file" id="impFile" accept=".xlsx,.xls,.csv" hidden></label><button class="btn" data-go="menu">← Settings</button>') + `
  <div class="panels">
    <section class="card">
      <input id="pq" class="search" placeholder="🔍 Search item..." autocomplete="off">
      <div id="presults" class="results"></div>
      <div id="pform"></div>
    </section>
    <section class="card"><h3>Recent purchases</h3><div id="plist"><p class="empty">Loading...</p></div></section>
  </div>`;
  const pq = $('#pq');
  pq.oninput = () => {
    const r = searchItems(pq.value);
    $('#presults').innerHTML = pq.value.trim() ? (r.length ? r.map(i => `<button class="result" data-pick="${i.id}"><span><b>${esc(i.name)}</b> <small>${esc(i.company || '')}</small></span><span class="pill ${isLow(i) ? 'red' : ''}">${fmtQty(i.stock, i.unit)}</span></button>`).join('')
      : '<p class="empty">Item not found. First add it in Products.</p>') : '';
  };
  v.onclick = e => {
    const g = e.target.closest('[data-go]'); if (g) return go(g.dataset.go);
    const p = e.target.closest('[data-pick]');
    if (p) { S.purchaseItem = +p.dataset.pick; pq.value = ''; $('#presults').innerHTML = ''; drawPurchaseForm(); }
  };
  v.onchange = e => { if (e.target.id === 'impFile' && e.target.files[0]) startImport(e.target.files[0]); };
  if (S.purchaseItem) drawPurchaseForm();
  loadPurchases();
}

/* ---------------- IMPORT BILL (Excel / CSV) ---------------- */
// Excel parhne ki library sirf zaroorat par load hoti hai
function loadXlsx() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((ok, bad) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = ok; s.onerror = () => bad(new Error('Could not load the Excel reader. Check your internet.'));
    document.head.appendChild(s);
  });
}
const num = v => { if (typeof v === 'number') return v; const n = parseFloat(String(v ?? '').replace(/,/g, '').replace(/[^\d.\-]/g, '')); return isNaN(n) ? null : n; };
const COLS = {
  name: /item|name|desc|product|particular|detail|saman|article/i,
  qty: /qty|quan|pcs|nag|tadad|units?$/i,
  rate: /rate|price|unit ?cost|per/i,
  total: /amount|total|value|amt/i
};
function guessColumns(rows) {
  // header row: pehli 10 lines mein jis mein "item/name" jaisa lafz ho
  let h = -1;
  for (let r = 0; r < Math.min(rows.length, 10); r++) if (rows[r].some(c => typeof c === 'string' && COLS.name.test(c))) { h = r; break; }
  const map = { name: -1, qty: -1, rate: -1, total: -1 };
  if (h >= 0) {
    rows[h].forEach((c, i) => {
      const t = String(c ?? '');
      for (const k of ['name', 'qty', 'rate', 'total']) if (map[k] === -1 && COLS[k].test(t)) { map[k] = i; break; }
    });
  }
  const body = rows.slice(h + 1).filter(r => r.some(c => String(c ?? '').trim()));
  const width = Math.max(0, ...rows.map(r => r.length));
  if (map.name === -1) { // bina header: sab se zyada text wala column naam hai
    let best = -1, bestN = -1;
    for (let i = 0; i < width; i++) { const n = body.filter(r => typeof r[i] === 'string' && num(r[i]) == null).length; if (n > bestN) { bestN = n; best = i; } }
    map.name = best;
  }
  const numericCols = [];
  for (let i = 0; i < width; i++) if (i !== map.name && body.filter(r => num(r[i]) != null).length >= body.length * 0.5) numericCols.push(i);
  const free = numericCols.filter(i => !Object.values(map).includes(i));
  // bacha hua: pehla number = qty, aakhri = total, beech wala = rate
  if (map.qty === -1 && free.length) map.qty = free.shift();
  if (map.total === -1 && free.length) map.total = free.pop();
  if (map.rate === -1 && free.length) map.rate = free.shift();
  return { header: h, map, width };
}

// naam milana: chhoti ghaltiyon ke saath bhi
const SYN = { capister: 'capacitor', capasitor: 'capacitor', capacitar: 'capacitor', cap: 'capacitor', coper: 'copper', road: 'rod',
  tap: 'tape', val: 'valve', vall: 'valve', gag: 'gauge', gage: 'gauge', blub: 'bulb', realy: 'relay', rely: 'relay', cabel: 'cable',
  mfd: 'uf', not: 'nut', nout: 'nut', breakar: 'breaker', tarminal: 'terminal', gass: 'gas', angal: 'angle', angel: 'angle', ft: 'feet', f: 'feet' };
function tokens(s) {
  return String(s || '').toLowerCase().replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2')
    .split(/[^a-z0-9./+]+/).filter(Boolean).map(t => SYN[t] || t);
}
function matchItem(text) {
  const a = tokens(text);
  if (!a.length) return { item: null, score: 0 };
  const aNums = a.filter(t => /\d/.test(t));
  let best = null, bestS = 0;
  for (const it of S.items) {
    const b = tokens(it.name + ' ' + (it.company || ''));
    const common = a.filter(t => b.includes(t)).length;
    let s = 2 * common / (a.length + tokens(it.name).length);
    const bNums = b.filter(t => /\d/.test(t));
    if (aNums.length && aNums.some(n => !bNums.includes(n))) s *= 0.5;   // size/number alag ho to kam yaqeen
    if (aNums.length && aNums.every(n => bNums.includes(n))) s += 0.1;
    if (s > bestS) { bestS = s; best = it; }
  }
  return { item: best, score: Math.min(1, bestS) };
}

async function startImport(file) {
  try {
    toast('Reading file...');
    await loadXlsx();
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    if (!rows.length) return toast('The file is empty', 'bad');
    const g = guessColumns(rows);
    S.imp = { file: file.name, rows, header: g.header, map: g.map, width: g.width, supplier: '', lines: [] };
    buildImportLines();
    render();
  } catch (e) { toast('Could not read file: ' + errMsg(e), 'bad'); }
}
function buildImportLines() {
  const im = S.imp, m = im.map;
  im.lines = [];
  im.rows.slice(im.header + 1).forEach(r => {
    const name = String(r[m.name] ?? '').trim();
    if (!name || /^(sub ?total|grand ?total|total|net|discount|balance)\b/i.test(name)) return;
    const qty = m.qty >= 0 ? num(r[m.qty]) : null;
    const rate = m.rate >= 0 ? num(r[m.rate]) : null;
    let total = m.total >= 0 ? num(r[m.total]) : null;
    if (!(qty > 0)) return;
    if (total == null && rate != null) total = Math.round(qty * rate * 100) / 100;
    const mt = matchItem(name);
    const ok = mt.score >= 0.45;
    im.lines.push({ text: name, item_id: ok ? mt.item.id : null, score: ok ? mt.score : 0, qty, unit: ok ? unitOptions(mt.item)[0].key : null,
      total: total ?? '', on: true });
  });
}
function viewImport(v) {
  const im = S.imp;
  const colOpts = sel => `<option value="-1">— none —</option>` + Array.from({ length: im.width }, (_, i) => {
    const h = im.header >= 0 ? String(im.rows[im.header][i] ?? '') : '';
    return `<option value="${i}" ${i === sel ? 'selected' : ''}>Column ${String.fromCharCode(65 + i)}${h ? ' — ' + esc(h) : ''}</option>`; }).join('');
  const sorted = S.items.slice().sort((a, b) => a.name.localeCompare(b.name));
  const used = im.lines.filter(l => l.on && l.item_id);
  const totalCost = used.reduce((s, l) => s + (num(l.total) || 0), 0);
  const nNew = im.lines.filter(l => l.on && !l.item_id).length;
  v.innerHTML = pageHead('Import bill', `File: ${esc(im.file)} · check every line, then add all to stock.`,
    '<button class="btn" id="impCancel">✕ Cancel import</button>') + `
  <section class="card">
    <h3>1. Which column is which?</h3>
    <div class="filters four">
      <label>Item name<select data-col="name">${colOpts(im.map.name)}</select></label>
      <label>Quantity<select data-col="qty">${colOpts(im.map.qty)}</select></label>
      <label>Rate<select data-col="rate">${colOpts(im.map.rate)}</select></label>
      <label>Total<select data-col="total">${colOpts(im.map.total)}</select></label>
    </div>
    <small>The app guessed these. Change them if the lines below look wrong.</small>
  </section>
  <section class="card">
    <div class="row-between"><h3>2. Check the lines (${im.lines.length})</h3>
      <small><span class="dot g"></span> matched <span class="dot y"></span> please check <span class="dot r"></span> not found</small></div>
    ${im.lines.length ? `<div class="tbl-wrap"><table class="tbl imp">
      <thead><tr><th></th><th>On bill</th><th>Item in your shop</th><th>Qty</th><th>Unit</th><th>Total cost (Rs)</th></tr></thead><tbody>
      ${im.lines.map((l, i) => { const it = itemById(l.item_id); const c = !it ? 'r' : l.score >= 0.75 ? 'g' : 'y'; return `<tr class="${l.on ? '' : 'off'}">
        <td><input type="checkbox" data-l="${i}" data-k="on" ${l.on ? 'checked' : ''} title="Include this line"></td>
        <td><span class="dot ${c}"></span> ${esc(l.text)}</td>
        <td><select data-l="${i}" data-k="item_id" class="imp-item">
          <option value="">— choose item —</option><option value="new">＋ Create new item...</option>
          ${sorted.map(x => `<option value="${x.id}" ${x.id === l.item_id ? 'selected' : ''}>${esc(x.name)}${x.company ? ' (' + esc(x.company) + ')' : ''}</option>`).join('')}
        </select></td>
        <td><input type="number" step="any" min="0" data-l="${i}" data-k="qty" value="${esc(l.qty)}" class="imp-num"></td>
        <td>${it ? `<select data-l="${i}" data-k="unit">${unitOptions(it).map(o => `<option value="${o.key}" ${o.key === l.unit ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>` : '—'}</td>
        <td><input type="number" step="any" min="0" data-l="${i}" data-k="total" value="${esc(l.total)}" class="imp-num"></td>
      </tr>`; }).join('')}
      </tbody></table></div>` : '<p class="empty">No item lines found. Check the column choices above.</p>'}
  </section>
  <section class="card">
    <h3>3. Save</h3>
    <div class="line-grid two"><label>Supplier<input id="impSup" placeholder="Bought from" value="${esc(im.supplier)}"></label>
      <div class="imp-sum"><small>${used.length} line${used.length === 1 ? '' : 's'} · total cost</small><b>${rs(totalCost)}</b></div></div>
    ${nNew ? `<p class="red" style="margin:0 0 8px">${nNew} ticked line${nNew === 1 ? ' has' : 's have'} no item chosen — choose an item, create one, or untick it.</p>` : ''}
    <button class="btn primary big" id="impSave" ${used.length && !nNew ? '' : 'disabled'}>✔ Add ${used.length} item${used.length === 1 ? '' : 's'} to stock</button>
  </section>`;

  v.onclick = e => { if (e.target.closest('#impCancel') && confirm('Cancel this import?')) { S.imp = null; render(); } if (e.target.closest('#impSave')) saveImport(); };
  v.oninput = e => { if (e.target.id === 'impSup') im.supplier = e.target.value; };
  v.onchange = e => {
    const el = e.target;
    if (el.dataset.col) { im.map[el.dataset.col] = +el.value; buildImportLines(); return render(); }
    if (el.dataset.l === undefined) return;
    const l = im.lines[+el.dataset.l], k = el.dataset.k;
    if (k === 'on') l.on = el.checked;
    else if (k === 'item_id') {
      if (el.value === 'new') {
        el.value = l.item_id || '';
        return itemForm(null, { prefill: { name: l.text, stock: 0 }, onSaved: id => {
          l.item_id = id; l.score = 1; l.unit = unitOptions(itemById(id))[0].key;
        } });
      }
      l.item_id = el.value ? +el.value : null; l.score = 1;
      l.unit = l.item_id ? unitOptions(itemById(l.item_id))[0].key : null;
    }
    else if (k === 'unit') l.unit = el.value;
    else l[k] = el.value;
    render();
  };
}
async function saveImport() {
  const im = S.imp;
  const todo = im.lines.filter(l => l.on && l.item_id);
  if (!todo.length) return;
  if (!confirm(`Add ${todo.length} item${todo.length === 1 ? '' : 's'} to stock?`)) return;
  const btn = $('#impSave'); btn.disabled = true;
  let done = 0;
  for (const l of todo) {
    const it = itemById(l.item_id);
    const o = unitOptions(it).find(x => x.key === l.unit) || unitOptions(it)[0];
    const q = Math.round((Number(l.qty) || 0) * o.factor * 1000) / 1000;
    if (!(q > 0)) { toast(`${it.name}: enter a quantity`, 'bad'); break; }
    btn.textContent = `Saving ${done + 1} of ${todo.length}...`;
    const { error } = await sb.rpc('add_purchase', { p_item: it.id, p_qty: q, p_total_cost: num(l.total) || 0,
      p_supplier: im.supplier.trim() || null, p_note: 'Import: ' + im.file });
    if (error) { toast(`${it.name}: ${errMsg(error)}`, 'bad'); break; }
    l.on = false; l.saved = true; done++;
  }
  await loadItems();
  im.lines = im.lines.filter(l => !l.saved);
  if (done === todo.length) { S.imp = null; toast(`✔ ${done} item${done === 1 ? '' : 's'} added to stock`); }
  else toast(`${done} saved. The remaining lines are still here — fix and save again.`, 'bad');
  render();
}
function drawPurchaseForm() {
  const it = itemById(S.purchaseItem), box = $('#pform');
  if (!it) { box.innerHTML = ''; return; }
  box.innerHTML = `<form id="purForm" class="line" style="margin-top:10px">
    <div class="line-top"><b>${esc(it.name)} <small style="display:inline">${esc(it.company || '')}</small></b><button type="button" class="x" id="pcancel">✕</button></div>
    <div class="line-info muted">Current stock: ${fmtQty(it.stock, it.unit)}${S.costs[it.id] != null ? ` · Last cost: ${rs(S.costs[it.id])}/${SHORT[it.unit]}` : ''}</div>
    <div class="line-grid">
      <label>Quantity<input name="qty" type="number" step="any" min="0" required inputmode="decimal"></label>
      <label>Unit<select name="unit">${unitOptions(it).map(o => `<option value="${o.key}">${esc(o.label)}</option>`).join('')}</select></label>
      <label>Total cost (Rs)<input name="cost" type="number" step="any" min="0" inputmode="numeric"></label>
    </div>
    <div class="line-grid two" style="margin-top:8px">
      <label>Supplier<input name="supplier" placeholder="Bought from"></label>
      <label>Note<input name="note" placeholder="optional"></label>
    </div>
    <div class="line-info muted" id="perUnit"></div>
    <button class="btn primary big">✔ Add to stock</button>
  </form>`;
  const f = $('#purForm');
  const base = () => { const o = unitOptions(it).find(x => x.key === f.unit.value); return Math.round((Number(f.qty.value) || 0) * o.factor * 1000) / 1000; };
  f.oninput = f.onchange = () => {
    const q = base(), c = Number(f.cost.value) || 0;
    $('#perUnit').textContent = q > 0 ? `= ${fmtQty(q, it.unit)}${c > 0 ? ` · Rate: ${rs(c / q)}/${SHORT[it.unit]}` : ''}` : '';
  };
  $('#pcancel').onclick = () => { S.purchaseItem = null; drawPurchaseForm(); };
  f.onsubmit = async e => {
    e.preventDefault();
    const q = base();
    if (!(q > 0)) return toast('Enter a quantity', 'bad');
    const btn = f.querySelector('.btn.primary'); btn.disabled = true;
    const { error } = await sb.rpc('add_purchase', {
      p_item: it.id, p_qty: q, p_total_cost: Number(f.cost.value) || 0,
      p_supplier: f.supplier.value || null, p_note: f.note.value || null
    });
    btn.disabled = false;
    if (error) return toast(errMsg(error), 'bad');
    S.purchaseItem = null;
    await loadItems(); render(); toast(`${it.name}: ${fmtQty(q, it.unit)} added to stock`);
  };
  f.qty.focus();
}
async function loadPurchases() {
  const { data, error } = await sb.from('purchases').select('*').order('created_at', { ascending: false }).limit(30);
  const box = $('#plist');
  if (!box) return;
  if (error) { box.innerHTML = `<p class="empty red">${esc(errMsg(error))}</p>`; return; }
  box.innerHTML = data.length ? data.map(p => {
    const it = itemById(p.item_id);
    return `<div class="row"><div><b>${esc(p.item_name)}</b><small>${fmtDate(p.created_at)} ${fmtTime(p.created_at)}${p.supplier ? ' · ' + esc(p.supplier) : ''}${p.note ? ' · ' + esc(p.note) : ''}</small></div>
      <div class="right"><span class="pill">+${it ? fmtQty(p.qty, it.unit) : trim3(p.qty)}</span>${Number(p.total_cost) ? `<small>${rs(p.total_cost)}</small>` : ''}</div></div>`;
  }).join('') : '<p class="empty">No entries yet.</p>';
}

/* ---------------- USERS (owner) ---------------- */
async function viewUsers(v) {
  if (!isOwner()) return go('sale');
  v.innerHTML = pageHead('Users / Staff', 'Give staff access, or block it.', '<button class="btn" data-go="menu">← Settings</button>') + `
  <div class="panels">
    <section class="card"><div id="ulist"><p class="empty">Loading...</p></div></section>
    <section class="card"><h3>How to add a new staff member</h3><div class="note"><ol>
      <li>Open the Supabase website → your project → <b>Authentication</b> → <b>Users</b></li>
      <li><b>Add user</b> → <b>Create new user</b></li>
      <li>Enter the staff email and password, and tick <b>Auto Confirm User</b></li>
      <li>Come back here and set that user to <b>Staff</b></li>
      <li>Tell the staff member their email and password</li></ol></div></section>
  </div>`;
  v.onclick = async e => {
    const g = e.target.closest('[data-go]'); if (g) return go(g.dataset.go);
    const n = e.target.closest('[data-name]');
    if (n) {
      const name = prompt('Name (shown on bills and reports):', n.dataset.cur || '');
      if (name == null || !name.trim()) return;
      const { error } = await sb.from('profiles').update({ full_name: name.trim() }).eq('id', n.dataset.name);
      if (error) return toast(errMsg(error), 'bad');
      if (n.dataset.name === S.user.id) S.profile.full_name = name.trim();
      render(); toast('Name changed');
    }
  };
  v.onchange = async e => {
    const s = e.target.closest('[data-role]');
    if (!s) return;
    if (s.dataset.role === S.user.id && s.value !== 'owner') { toast('You cannot remove your own Owner role', 'bad'); s.value = 'owner'; return; }
    const { error } = await sb.from('profiles').update({ role: s.value }).eq('id', s.dataset.role);
    if (error) return toast(errMsg(error), 'bad');
    toast('Role updated');
  };
  const { data, error } = await sb.from('profiles').select('*').order('created_at');
  const box = $('#ulist');
  if (!box) return;
  if (error) { box.innerHTML = `<p class="empty red">${esc(errMsg(error))}</p>`; return; }
  box.innerHTML = data.map(u => `<div class="row">
    <div class="who"><span class="avatar sm">${esc(initials(u.full_name))}</span><div><b>${esc(u.full_name || '')}</b> <button class="link" data-name="${u.id}" data-cur="${esc(u.full_name || '')}" title="Rename">✎</button><small>${esc(u.email || '')}</small></div></div>
    <div class="right"><select data-role="${u.id}" style="width:auto">
      <option value="owner" ${u.role === 'owner' ? 'selected' : ''}>Owner</option>
      <option value="staff" ${u.role === 'staff' ? 'selected' : ''}>Staff</option>
      <option value="pending" ${u.role === 'pending' ? 'selected' : ''}>Blocked (no access)</option>
    </select></div></div>`).join('');
}

init();
