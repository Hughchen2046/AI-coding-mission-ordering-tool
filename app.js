// ──────────────────────────────────────────────
// app.js  —  一般使用者點餐頁面邏輯
// ──────────────────────────────────────────────

const DOM = {
  loginSection:      document.getElementById('login-section'),
  orderSection:      document.getElementById('order-section'),
  envStatus:         document.getElementById('env-status'),
  loginBtn:          document.getElementById('login-btn'),
  loginError:        document.getElementById('login-error'),
  userInfo:          document.getElementById('user-info'),
  userEmail:         document.getElementById('user-email'),
  userRole:          document.getElementById('user-role'),
  adminLink:         document.getElementById('admin-link'),
  myOrdersBtn:       document.getElementById('my-orders-btn'),
  logoutBtn:         document.getElementById('logout-btn'),
  statusBanner:      document.getElementById('order-status-banner'),
  todayLabel:        document.getElementById('today-restaurants-label'),
  restaurantTabs:    document.getElementById('restaurant-tabs'),
  menuLoading:       document.getElementById('menu-loading'),
  menuGrid:          document.getElementById('menu-grid'),
  menuEmpty:         document.getElementById('menu-empty'),
  cartFab:           document.getElementById('cart-fab'),
  cartBadge:         document.getElementById('cart-badge'),
  orderPanel:        document.getElementById('order-panel'),
  orderPanelBody:    document.getElementById('order-panel-body'),
  orderTotal:        document.getElementById('order-total'),
  closePanelBtn:     document.getElementById('close-panel-btn'),
  submitBtn:         document.getElementById('submit-order-btn'),
  resetBtn:          document.getElementById('reset-order-btn'),
  orderMsg:          document.getElementById('order-msg'),
  myOrdersModal:     document.getElementById('my-orders-modal'),
  myOrdersModalBody: document.getElementById('my-orders-modal-body'),
  closeMyOrdersBtn:  document.getElementById('close-my-orders-btn'),
  closeMyOrdersBtn2: document.getElementById('close-my-orders-btn2'),
  modifyOrderBtn:    document.getElementById('modify-order-btn'),
};

// ── State ─────────────────────────────────────
const state = {
  spreadsheetId:    null,
  user:             null,
  menuList:         [],
  todayRestaurants: [],
  orderStatus:      '開放',   // '開放' | '截止'
  quantities:       {},
  notes:            {},
  activeTab:        '全部',
};

// ── Init ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (!window.ENV?.GOOGLE_CLIENT_ID || !window.ENV?.GOOGLE_SHEET_ID) {
      throw new Error('config.js 缺少 GOOGLE_CLIENT_ID 或 GOOGLE_SHEET_ID');
    }
    DOM.envStatus.textContent = '設定讀取成功，請登入';
    DOM.loginBtn.classList.remove('hidden');
  } catch (e) {
    DOM.envStatus.textContent = '設定讀取失敗';
    showError(DOM.loginError, e.message);
  }

  DOM.loginBtn.addEventListener('click', handleLogin);
  DOM.logoutBtn.addEventListener('click', handleLogout);
  DOM.submitBtn.addEventListener('click', submitOrder);
  DOM.resetBtn.addEventListener('click', resetOrder);
  DOM.cartFab.addEventListener('click', openPanel);
  DOM.closePanelBtn.addEventListener('click', closePanel);
  DOM.myOrdersBtn.addEventListener('click', openMyOrdersModal);
  DOM.closeMyOrdersBtn.addEventListener('click', closeMyOrdersModal);
  DOM.closeMyOrdersBtn2.addEventListener('click', closeMyOrdersModal);
  DOM.modifyOrderBtn.addEventListener('click', modifyOrder);
});

// ── Auth ──────────────────────────────────────
function handleLogin() {
  state.spreadsheetId = sheetAPI.extractSpreadsheetId(window.ENV.GOOGLE_SHEET_ID);
  if (!state.spreadsheetId) { showError(DOM.loginError, '無效的 Google Sheet ID'); return; }
  try {
    authManager.init(window.ENV.GOOGLE_CLIENT_ID, onLoginSuccess);
    authManager.requestAccessToken();
  } catch (e) { showError(DOM.loginError, e.message); }
}

async function onLoginSuccess(email) {
  DOM.loginError.textContent = '驗證身分中...';
  try {
    const usersData = await sheetAPI.getValues(state.spreadsheetId, 'Users!A:D');
    if (!usersData || usersData.length < 2) throw new Error('找不到 Users 資料表');
    const [header, ...rows] = usersData;
    const userRow = rows.find(r => r[header.indexOf('Email')] === email);
    if (!userRow) throw new Error(`帳號 ${email} 尚無使用權限`);

    state.user = {
      email,
      name:  userRow[header.indexOf('姓名')]  || email,
      role:  userRow[header.indexOf('權限')]  || '一般成員',
    };

    DOM.userEmail.textContent = state.user.name;
    DOM.userRole.textContent  = state.user.role;
    DOM.userInfo.classList.remove('hidden');
    DOM.myOrdersBtn.classList.remove('hidden');
    if (state.user.role === '管理員') DOM.adminLink.classList.remove('hidden');

    DOM.loginSection.classList.add('hidden');
    DOM.orderSection.classList.remove('hidden');
    await loadMenuData();
  } catch (error) { showError(DOM.loginError, error.message); }
}

function handleLogout() {
  authManager.logout();
  state.user = null;
  DOM.userInfo.classList.add('hidden');
  DOM.adminLink.classList.add('hidden');
  DOM.myOrdersBtn.classList.add('hidden');
  DOM.loginSection.classList.remove('hidden');
  DOM.orderSection.classList.add('hidden');
  DOM.loginError.textContent = '';
  closePanel();
}

// ── Load Data ─────────────────────────────────
async function loadMenuData() {
  DOM.menuLoading.classList.remove('hidden');
  DOM.menuGrid.innerHTML = '';

  try {
    // TodayConfig: A=餐廳名稱, B=訂單狀態(B2)
    const todayData = await sheetAPI.getValues(state.spreadsheetId, 'TodayConfig!A:B');
    state.todayRestaurants = [...new Set(
      todayData.slice(1).map(r => (r[0] || '').trim()).filter(Boolean)
    )];
    DOM.todayLabel.textContent = state.todayRestaurants.length
      ? '今日開放：' + state.todayRestaurants.join('、')
      : '今日未設定任何餐廳';

    // 訂單狀態: TodayConfig B2
    state.orderStatus = (todayData[1]?.[1] || '').trim() || '開放';
    updateStatusBanner();

    // Menu: A=餐廳, B=品名, C=單價, D=特價, E=類型, F=分類
    const menuData = await sheetAPI.getValues(state.spreadsheetId, 'menu!A:F');
    if (menuData.length > 1) {
      state.menuList = menuData.slice(1)
        .filter(r => r[0] && r[1])
        .map(r => ({
          id:         `${r[0].trim()}-${r[1].trim()}`,
          restaurant: r[0].trim(),
          name:       r[1].trim(),
          price:      parseInt(r[2] || '0', 10),
          category:   (r[5] || '').trim(),
        }));
    }
    renderTabs();
  } catch (e) {
    DOM.menuEmpty.innerHTML = '<span class="emoji">⚠️</span>載入失敗：' + e.message;
    DOM.menuEmpty.classList.remove('hidden');
  } finally {
    DOM.menuLoading.classList.add('hidden');
  }
}

function updateStatusBanner() {
  const isClosed = state.orderStatus === '截止';
  DOM.statusBanner.className = 'status-banner ' + (isClosed ? 'closed' : 'open');
  DOM.statusBanner.innerHTML = isClosed
    ? '🔒 <strong>訂單已截止</strong>，無法送出或修改訂單。如有疑問請聯繫管理員。'
    : '✅ <strong>訂單開放中</strong>，可隨時點餐或修改。';
  DOM.statusBanner.classList.remove('hidden');
  DOM.submitBtn.disabled = isClosed;
}

// ── Tabs & Cards ──────────────────────────────
function renderTabs() {
  DOM.restaurantTabs.innerHTML = '';
  const available = state.menuList.filter(m => state.todayRestaurants.includes(m.restaurant));
  const restaurants = [...new Set(available.map(m => m.restaurant))];
  if (restaurants.length === 0) { DOM.menuEmpty.classList.remove('hidden'); return; }
  DOM.menuEmpty.classList.add('hidden');

  const makeTab = (label, active) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (active ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => { state.activeTab = label; renderTabs(); });
    return btn;
  };
  DOM.restaurantTabs.appendChild(makeTab('全部', state.activeTab === '全部'));
  restaurants.forEach(r => DOM.restaurantTabs.appendChild(makeTab(r, state.activeTab === r)));
  renderMenuCards(available);
}

function renderMenuCards(available) {
  DOM.menuGrid.innerHTML = '';
  const filtered = state.activeTab === '全部' ? available : available.filter(m => m.restaurant === state.activeTab);
  if (filtered.length === 0) { DOM.menuEmpty.classList.remove('hidden'); return; }

  filtered.forEach(meal => {
    const qty  = state.quantities[meal.id] || 0;
    const note = state.notes[meal.id] || '';
    const card = document.createElement('div');
    card.className = 'menu-card' + (qty > 0 ? ' has-item' : '');
    card.innerHTML = `
      <div>
        <div class="menu-card-name">${meal.name}</div>
        <div class="menu-card-meta">${meal.restaurant}${meal.category ? ' · ' + meal.category : ''}</div>
      </div>
      <div class="menu-card-price">$${meal.price}</div>
      <div class="qty-control">
        <button class="qty-btn" data-action="minus">−</button>
        <span class="qty-display">${qty}</span>
        <button class="qty-btn" data-action="plus">＋</button>
      </div>
      <input type="text" class="card-note" placeholder="備註（可留空）" value="${note}" data-id="${meal.id}">
    `;
    card.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.orderStatus === '截止') return;
        state.quantities[meal.id] = btn.dataset.action === 'plus'
          ? (state.quantities[meal.id] || 0) + 1
          : Math.max(0, (state.quantities[meal.id] || 0) - 1);
        card.querySelector('.qty-display').textContent = state.quantities[meal.id];
        card.classList.toggle('has-item', state.quantities[meal.id] > 0);
        refreshOrderPanel();
      });
    });
    card.querySelector('.card-note').addEventListener('input', e => {
      state.notes[meal.id] = e.target.value;
      refreshOrderPanel();
    });
    DOM.menuGrid.appendChild(card);
  });
}

// ── Order Panel (Cart) ────────────────────────
function openPanel()  { DOM.orderPanel.classList.add('open'); document.body.classList.add('panel-open'); }
function closePanel() { DOM.orderPanel.classList.remove('open'); document.body.classList.remove('panel-open'); }

function refreshOrderPanel() {
  const selected = state.menuList.filter(m => (state.quantities[m.id] || 0) > 0);
  const totalQty   = selected.reduce((s, m) => s + state.quantities[m.id], 0);
  const totalPrice = selected.reduce((s, m) => s + m.price * state.quantities[m.id], 0);

  DOM.cartFab.classList.toggle('hidden', totalQty === 0);
  DOM.cartBadge.textContent = totalQty;
  DOM.orderTotal.textContent = '$' + totalPrice;

  if (selected.length === 0) {
    DOM.orderPanelBody.innerHTML = '<p class="order-panel-empty">尚未選擇任何餐點</p>';
    DOM.submitBtn.disabled = true;
    return;
  }
  if (state.orderStatus !== '截止') DOM.submitBtn.disabled = false;

  DOM.orderPanelBody.innerHTML = '';
  selected.forEach(meal => {
    const qty = state.quantities[meal.id];
    const note = state.notes[meal.id] || '';
    const li = document.createElement('div');
    li.className = 'order-line-item';
    li.innerHTML = `
      <div class="item-name">${meal.name}</div>
      <div class="item-detail">
        <span class="item-qty">$${meal.price} × ${qty}</span>
        <span class="item-subtotal">$${meal.price * qty}</span>
      </div>
      ${note ? `<div class="item-note">備註：${note}</div>` : ''}
    `;
    DOM.orderPanelBody.appendChild(li);
  });
}

// ── Submit Order ──────────────────────────────
async function submitOrder() {
  if (state.orderStatus === '截止') { showMsg(DOM.orderMsg, '⛔ 訂單已截止，無法送出', 'error'); return; }
  const selected = state.menuList.filter(m => (state.quantities[m.id] || 0) > 0);
  if (selected.length === 0) return;

  DOM.submitBtn.disabled = true;
  DOM.submitBtn.textContent = '送出中...';

  try {
    const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    for (const meal of selected) {
      const qty  = state.quantities[meal.id];
      const note = state.notes[meal.id] || '';
      // 欄位: 點餐時間 | 訂購人 Email | 餐廳名稱 | 餐點內容 | 金額 | 備註 | 狀態
      const row = [now, state.user.email, meal.restaurant, qty > 1 ? `${meal.name} x${qty}` : meal.name, meal.price * qty, note, 'active'];
      await sheetAPI.appendValues(state.spreadsheetId, 'Orders!A:G', row);
    }
    showMsg(DOM.orderMsg, '✅ 訂單送出成功！點擊「我的訂單」可查看紀錄。', 'success');
    resetOrder();
    closePanel();
  } catch (e) {
    showMsg(DOM.orderMsg, '送出失敗：' + e.message, 'error');
  } finally {
    DOM.submitBtn.disabled = state.orderStatus === '截止';
    DOM.submitBtn.textContent = '送出訂單';
  }
}

function resetOrder() {
  state.quantities = {};
  state.notes = {};
  document.querySelectorAll('.menu-card').forEach(c => {
    c.classList.remove('has-item');
    const qd = c.querySelector('.qty-display'); if (qd) qd.textContent = '0';
    const ni = c.querySelector('.card-note');   if (ni) ni.value = '';
  });
  refreshOrderPanel();
}

// ── My Orders Modal ───────────────────────────
async function openMyOrdersModal() {
  DOM.myOrdersModal.classList.remove('hidden');
  DOM.myOrdersModalBody.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem;">讀取中...</p>';
  DOM.modifyOrderBtn.classList.add('hidden');

  try {
    const myOrders = await fetchMyActiveOrders();
    if (myOrders.length === 0) {
      DOM.myOrdersModalBody.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem;">今日尚無點餐紀錄</p>';
      return;
    }

    const total = myOrders.reduce((s, o) => s + o.price, 0);
    let html = `<table class="orders-table">
      <thead><tr><th>餐廳</th><th>餐點</th><th>金額</th><th>備註</th></tr></thead><tbody>`;
    myOrders.forEach(o => {
      html += `<tr><td>${o.restaurant}</td><td>${o.itemName}</td><td>$${o.price}</td><td>${o.note || '—'}</td></tr>`;
    });
    html += `</tbody></table>
      <div style="text-align:right;margin-top:0.75rem;font-weight:700;color:var(--frieren-primary-dark);">合計：$${total}</div>`;
    DOM.myOrdersModalBody.innerHTML = html;

    // Show modify button only if order is open
    if (state.orderStatus !== '截止') DOM.modifyOrderBtn.classList.remove('hidden');
  } catch (e) {
    DOM.myOrdersModalBody.innerHTML = `<p style="color:var(--danger);padding:1rem;">讀取失敗：${e.message}</p>`;
  }
}

function closeMyOrdersModal() { DOM.myOrdersModal.classList.add('hidden'); }

async function fetchMyActiveOrders() {
  const data = await sheetAPI.getValues(state.spreadsheetId, 'Orders!A:G');
  if (data.length < 2) return [];
  return data.slice(1).map((row, i) => ({
    sheetRow:   i + 2,
    time:       row[0] || '',
    email:      row[1] || '',
    restaurant: row[2] || '',
    itemName:   row[3] || '',
    price:      parseInt(row[4] || '0', 10),
    note:       row[5] || '',
    status:     row[6] || 'active',
  })).filter(o => o.email === state.user.email && o.status === 'active');
}

// ── Modify Order ──────────────────────────────
async function modifyOrder() {
  if (state.orderStatus === '截止') { alert('⛔ 訂單已截止，無法修改'); return; }
  DOM.modifyOrderBtn.disabled = true;
  DOM.modifyOrderBtn.textContent = '處理中...';

  try {
    const myOrders = await fetchMyActiveOrders();

    // Cancel existing orders
    for (const order of myOrders) {
      await sheetAPI.updateValues(state.spreadsheetId, `Orders!G${order.sheetRow}`, [['cancelled']]);
    }

    // Pre-populate cart
    resetOrder();
    for (const order of myOrders) {
      const qtyMatch = order.itemName.match(/\s+x(\d+)$/);
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
      const cleanName = qtyMatch ? order.itemName.replace(/\s+x\d+$/, '') : order.itemName;
      const meal = state.menuList.find(m => m.restaurant === order.restaurant && m.name === cleanName);
      if (meal) {
        state.quantities[meal.id] = qty;
        state.notes[meal.id] = order.note;
      }
    }

    closeMyOrdersModal();
    // Re-render cards with restored quantities
    const available = state.menuList.filter(m => state.todayRestaurants.includes(m.restaurant));
    renderMenuCards(available);
    refreshOrderPanel();
    openPanel();
  } catch (e) {
    alert('修改失敗：' + e.message);
  } finally {
    DOM.modifyOrderBtn.disabled = false;
    DOM.modifyOrderBtn.textContent = '✏️ 修改訂單';
  }
}

// ── Utils ─────────────────────────────────────
function showError(el, msg) { el.textContent = msg; el.style.color = 'var(--danger)'; }
function showMsg(el, msg, type) {
  el.textContent = msg;
  el.className = 'msg ' + type;
  if (type === 'success') setTimeout(() => { el.textContent = ''; }, 4000);
}
