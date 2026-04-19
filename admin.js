const ADOM = {
  loginGuard:         document.getElementById('admin-login-guard'),
  adminMain:          document.getElementById('admin-main'),
  envStatus:          document.getElementById('admin-env-status'),
  loginBtn:           document.getElementById('admin-login-btn'),
  loginError:         document.getElementById('admin-login-error'),
  userEmail:          document.getElementById('admin-user-email'),
  logoutBtn:          document.getElementById('admin-logout-btn'),

  diceBtn:            document.getElementById('dice-btn'),
  orderStatusText:    document.getElementById('admin-order-status-text'),
  closeOrdersBtn:     document.getElementById('close-orders-btn'),
  reopenOrdersBtn:    document.getElementById('reopen-orders-btn'),
  viewOrdersBtn:      document.getElementById('view-orders-btn'),
  allOrdersModal:     document.getElementById('all-orders-modal'),
  allOrdersModalBody: document.getElementById('all-orders-modal-body'),
  closeAllOrdersBtn:  document.getElementById('close-all-orders-btn'),
  closeAllOrdersBtn2: document.getElementById('close-all-orders-btn2'),

  checkGrid:          document.getElementById('restaurant-check-grid'),
  saveTodayBtn:       document.getElementById('save-today-config-btn'),
  configMsg:          document.getElementById('admin-config-msg'),

  newRestaurant:      document.getElementById('new-restaurant'),
  newName:            document.getElementById('new-name'),
  newPrice:           document.getElementById('new-price'),
  newCategory:        document.getElementById('new-category'),
  addMenuBtn:         document.getElementById('add-menu-btn'),
  addMenuMsg:         document.getElementById('add-menu-msg'),

  menuTbody:          document.getElementById('admin-menu-tbody'),
  sheetLink:          document.getElementById('sheet-link'),
};

const adminState = {
  spreadsheetId:    null,
  user:             null,
  menuList:         [],
  todayRestaurants: [],
  orderStatus:      '開放',
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (!window.ENV?.GOOGLE_CLIENT_ID || !window.ENV?.GOOGLE_SHEET_ID) throw new Error('config.js 缺少設定');
    adminState.spreadsheetId = sheetAPI.extractSpreadsheetId(window.ENV.GOOGLE_SHEET_ID);
    ADOM.envStatus.textContent = '請以管理員 Google 帳號登入';
    ADOM.loginBtn.classList.remove('hidden');
    ADOM.sheetLink.href = `https://docs.google.com/spreadsheets/d/${adminState.spreadsheetId}/edit`;
  } catch (e) { ADOM.envStatus.textContent = '設定讀取失敗：' + e.message; }

  ADOM.loginBtn.addEventListener('click', adminLogin);
  ADOM.logoutBtn.addEventListener('click', adminLogout);
  ADOM.diceBtn.addEventListener('click', rollDice);
  ADOM.saveTodayBtn.addEventListener('click', saveTodayConfig);
  ADOM.addMenuBtn.addEventListener('click', addMenuItem);
  ADOM.closeOrdersBtn.addEventListener('click', () => setOrderStatus('截止'));
  ADOM.reopenOrdersBtn.addEventListener('click', () => setOrderStatus('開放'));
  ADOM.viewOrdersBtn.addEventListener('click', openAllOrdersModal);
  ADOM.closeAllOrdersBtn.addEventListener('click',  () => ADOM.allOrdersModal.classList.add('hidden'));
  ADOM.closeAllOrdersBtn2.addEventListener('click', () => ADOM.allOrdersModal.classList.add('hidden'));
});


// ── Auth ──────────────────────────────────────
function adminLogin() {
  try {
    authManager.init(window.ENV.GOOGLE_CLIENT_ID, onAdminLoginSuccess);
    authManager.requestAccessToken();
  } catch (e) {
    ADOM.loginError.textContent = e.message;
  }
}

async function onAdminLoginSuccess(email) {
  ADOM.loginError.textContent = '驗證身分中...';
  try {
    const usersData = await sheetAPI.getValues(adminState.spreadsheetId, 'Users!A:D');
    const [header, ...rows] = usersData;
    const emailIdx = header.indexOf('Email');
    const nameIdx  = header.indexOf('姓名');
    const roleIdx  = header.indexOf('權限');

    const userRow = rows.find(r => r[emailIdx] === email);
    if (!userRow || userRow[roleIdx] !== '管理員') {
      throw new Error('此帳號無管理員權限');
    }

    adminState.user = { email, name: userRow[nameIdx], role: userRow[roleIdx] };
    ADOM.userEmail.textContent = adminState.user.name;
    ADOM.loginGuard.classList.add('hidden');
    ADOM.adminMain.classList.remove('hidden');

    await loadAdminData();
  } catch (e) {
    ADOM.loginError.textContent = e.message;
  }
}

function adminLogout() {
  authManager.logout();
  ADOM.loginGuard.classList.remove('hidden');
  ADOM.adminMain.classList.add('hidden');
  ADOM.loginError.textContent = '';
  ADOM.userEmail.textContent = '';
}

async function loadAdminData() {
  try {
    // TodayConfig: A=餐廳名稱, B2=訂單狀態
    const todayData = await sheetAPI.getValues(adminState.spreadsheetId, 'TodayConfig!A:B');
    adminState.todayRestaurants = [...new Set(
      todayData.slice(1).map(r => (r[0] || '').trim()).filter(Boolean)
    )];
    // B2 = order status
    adminState.orderStatus = (todayData[1]?.[1] || '').trim() || '開放';
    updateAdminStatusUI();

    // Menu: A=餐廳名稱, B=品名, C=單價, D=特價, E=飲食種類, F=分類
    const menuData = await sheetAPI.getValues(adminState.spreadsheetId, 'menu!A:F');
    if (menuData.length > 1) {
      const [, ...rows] = menuData;
      adminState.menuList = rows
        .filter(r => r[0] && r[1])
        .map((r, i) => ({
          id:           `${(r[0]||'').trim()}-${(r[1]||'').trim()}`,
          restaurant:   (r[0] || '').trim(),
          name:         (r[1] || '').trim(),
          price:        (r[2] || '').trim(),
          specialPrice: (r[3] || '').trim(),
          type:         (r[4] || '').trim(),
          category:     (r[5] || '').trim(),
        }));
    }

    renderRestaurantCheckboxes();
    renderAdminMenuTable();
  } catch (e) {
    alert('載入失敗：' + e.message);
  }
}

function updateAdminStatusUI() {
  const isClosed = adminState.orderStatus === '截止';
  ADOM.orderStatusText.textContent = isClosed ? '🔒 訂單已截止' : '✅ 訂單開放中';
  ADOM.orderStatusText.style.color = isClosed ? 'var(--danger)' : 'var(--success)';
  ADOM.closeOrdersBtn.classList.toggle('hidden', isClosed);
  ADOM.reopenOrdersBtn.classList.toggle('hidden', !isClosed);
}

// ── Restaurant Checkboxes ─────────────────────
function renderRestaurantCheckboxes() {
  const allRestaurants = [...new Set(adminState.menuList.map(m => m.restaurant))];
  ADOM.checkGrid.innerHTML = '';

  if (allRestaurants.length === 0) {
    ADOM.checkGrid.innerHTML = '<span style="color:var(--text-muted);font-size:0.85rem;">尚無餐廳資料，請先新增餐點</span>';
    return;
  }

  allRestaurants.forEach(res => {
    const isChecked = adminState.todayRestaurants.includes(res);
    const label = document.createElement('label');
    label.className = 'rest-check-label' + (isChecked ? ' checked' : '');
    label.innerHTML = `
      <input type="checkbox" value="${res}" ${isChecked ? 'checked' : ''}>
      ${isChecked ? '✓ ' : ''}${res}
    `;
    label.querySelector('input').addEventListener('change', (e) => {
      const checked = e.target.checked;
      label.classList.toggle('checked', checked);
      label.childNodes[0].nextSibling.textContent = (checked ? '✓ ' : '') + res;
    });
    ADOM.checkGrid.appendChild(label);
  });
}

// ── Save Today Config ─────────────────────────
async function saveTodayConfig() {
  const selected = [...ADOM.checkGrid.querySelectorAll('input[type="checkbox"]:checked')]
    .map(cb => cb.value);

  ADOM.saveTodayBtn.disabled = true;
  try {
    // Save restaurants in A column AND preserve existing order status in B2
    const maxRows = Math.max(selected.length + 1, 2);
    const values = Array.from({ length: maxRows }, (_, i) => {
      const a = i === 0 ? '今日開放餐廳' : (selected[i - 1] || '');
      const b = i === 0 ? '訂單狀態' : (i === 1 ? adminState.orderStatus : '');
      return [a, b];
    });
    await sheetAPI.clearValues(adminState.spreadsheetId, 'TodayConfig!A:B');
    await sheetAPI.updateValues(adminState.spreadsheetId, `TodayConfig!A1:B${values.length}`, values);
    adminState.todayRestaurants = selected;
    showMsg(ADOM.configMsg, '✅ 今日設定已更新（' + (selected.join('、') || '無') + '）', 'success');
  } catch (e) {
    showMsg(ADOM.configMsg, '更新失敗：' + e.message, 'error');
  } finally {
    ADOM.saveTodayBtn.disabled = false;
  }
}

// ── Set Order Status ──────────────────────────
async function setOrderStatus(status) {
  try {
    await sheetAPI.updateValues(adminState.spreadsheetId, 'TodayConfig!B1:B2', [['訂單狀態'], [status]]);
    adminState.orderStatus = status;
    updateAdminStatusUI();
    showMsg(ADOM.configMsg, status === '截止' ? '🔒 訂單已截止' : '🔓 訂單重新開放', 'success');
  } catch (e) {
    alert('狀態更新失敗：' + e.message);
  }
}

// ── All Orders View ───────────────────────────
async function openAllOrdersModal() {
  ADOM.allOrdersModal.classList.remove('hidden');
  ADOM.allOrdersModalBody.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem;">讀取中...</p>';

  try {
    const data = await sheetAPI.getValues(adminState.spreadsheetId, 'Orders!A:G');
    const active = data.slice(1)
      .filter(r => (r[6] || 'active') === 'active' && r[1]);

    if (active.length === 0) {
      ADOM.allOrdersModalBody.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:2rem;">今日尚無訂單</p>';
      return;
    }

    const total = active.reduce((s, r) => s + parseInt(r[4] || '0', 10), 0);
    let html = `<table class="orders-table">
      <thead><tr><th>時間</th><th>Email</th><th>餐廳</th><th>餐點</th><th>金額</th><th>備註</th></tr></thead><tbody>`;
    active.forEach(r => {
      html += `<tr><td style="font-size:0.78rem">${r[0]}</td><td style="font-size:0.78rem">${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>$${r[4]}</td><td>${r[5]||'—'}</td></tr>`;
    });
    html += `</tbody></table><div style="text-align:right;margin-top:0.75rem;font-weight:700;color:var(--frieren-primary-dark);">訂單總金額：$${total}（${active.length} 筆）</div>`;
    ADOM.allOrdersModalBody.innerHTML = html;
  } catch (e) {
    ADOM.allOrdersModalBody.innerHTML = `<p style="color:var(--danger);padding:1rem;">讀取失敗：${e.message}</p>`;
  }
}

// ── Menu Table ────────────────────────────────
function renderAdminMenuTable() {
  ADOM.menuTbody.innerHTML = '';
  if (adminState.menuList.length === 0) {
    ADOM.menuTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">尚無菜單資料</td></tr>';
    return;
  }
  adminState.menuList.forEach((meal, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${meal.restaurant}</td>
      <td>${meal.name}</td>
      <td>$${meal.price}</td>
      <td><button class="btn danger small" data-idx="${idx}">刪除</button></td>
    `;
    tr.querySelector('.btn.danger').addEventListener('click', async () => {
      if (!confirm(`確定刪除「${meal.name}」？`)) return;
      adminState.menuList.splice(idx, 1);
      await saveMenuToSheet();
    });
    ADOM.menuTbody.appendChild(tr);
  });
}

// ── Add Menu Item ─────────────────────────────

/**
 * 依餐廳名稱縮寫 + 當前同餐廳流水號 自動產生 ID
 * 例如：梁社漢排骨 → LS001, LS002 ...
 */
function generateMenuId(restaurant) {
  // 取前兩個中文字或英數字的首字母大寫
  const chars = restaurant.replace(/\s/g, '');
  let prefix = '';
  for (let i = 0; i < chars.length && prefix.length < 2; i++) {
    const c = chars[i];
    // 若是 ASCII 字元直接取
    if (/[a-zA-Z0-9]/.test(c)) {
      prefix += c.toUpperCase();
    } else {
      // 中文字：取 Unicode 轉成兩位 hex 的最後兩碼做代碼，太複雜
      // 實作：取用餐廳名稱中每個漢字對應的注音首字 — 改用順序索引更簡單
      prefix += c; // 直接取中文字作前綴（比 hex 更直觀）
    }
  }
  if (!prefix) prefix = 'XX';

  // 找出同餐廳目前最大流水號
  const existing = adminState.menuList
    .filter(m => m.restaurant === restaurant)
    .map(m => {
      const match = m.id.match(/(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    });

  const maxNum = existing.length > 0 ? Math.max(...existing) : 0;
  return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
}

async function addMenuItem() {
  const restaurant = ADOM.newRestaurant.value.trim();
  const name       = ADOM.newName.value.trim();
  const price      = ADOM.newPrice.value.trim();
  const category   = ADOM.newCategory.value.trim();

  if (!restaurant || !name || !price) {
    showMsg(ADOM.addMenuMsg, '請填寫餐廳名稱、品名與單價', 'error');
    return;
  }

  const newId = generateMenuId(restaurant);
  adminState.menuList.push({
    id: newId,
    restaurant,
    name,
    price,
    specialPrice: '',
    type: '',
    category,
  });

  ADOM.addMenuBtn.disabled = true;
  try {
    await saveMenuToSheet();
    // 更新 Checkbox（若新增了新餐廳）
    renderRestaurantCheckboxes();
    ADOM.newRestaurant.value = '';
    ADOM.newName.value = '';
    ADOM.newPrice.value = '';
    ADOM.newCategory.value = '';
    showMsg(ADOM.addMenuMsg, `✅ 新增成功（ID：${newId}）`, 'success');
  } catch (e) {
    showMsg(ADOM.addMenuMsg, '新增失敗：' + e.message, 'error');
  } finally {
    ADOM.addMenuBtn.disabled = false;
  }
}

async function saveMenuToSheet() {
  // 試算表格式：A=餐廳名稱, B=品名, C=單價, D=特價, E=飲食種類, F=分類
  const header = ['餐廳名稱', '品名', '單價', '特價', '飲食種類', '分類'];
  const values = [header, ...adminState.menuList.map(m =>
    [m.restaurant, m.name, m.price, m.specialPrice, m.type, m.category]
  )];
  await sheetAPI.clearValues(adminState.spreadsheetId, 'menu!A:F');
  await sheetAPI.updateValues(adminState.spreadsheetId, `menu!A1:F${values.length}`, values);
  renderAdminMenuTable();
}

// ── Dice ──────────────────────────────────────
function rollDice() {
  const restaurants = [...new Set(adminState.menuList.map(m => m.restaurant))];
  if (restaurants.length === 0) { alert('菜單內沒有任何餐廳！'); return; }
  const pick = restaurants[Math.floor(Math.random() * restaurants.length)];
  alert(`🎲 今天就吃【${pick}】！`);
}

// ── Utils ─────────────────────────────────────
function showMsg(el, msg, type) {
  el.textContent = msg;
  el.className = 'msg ' + type;
  if (type === 'success') setTimeout(() => { el.textContent = ''; }, 4000);
}
