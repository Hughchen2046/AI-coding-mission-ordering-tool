/**
 * 封裝 Google Sheets API 的操作
 * 依賴：全域的 access_token
 */

class SheetAPI {
  constructor() {
    this.baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
  }

  // 從 URL 提取 Spreadsheet ID
  extractSpreadsheetId(urlOrId) {
    if (!urlOrId) return null;
    if (!urlOrId.includes('http')) return urlOrId; // 假設直接傳入 ID
    const match = urlOrId.match(/\/d\/(.*?)(\/|$)/);
    return match ? match[1] : null;
  }

  // 共用 Fetch 函式
  async fetchAPI(spreadsheetId, range, method = 'GET', body = null) {
    const token = window.gAccessToken;
    if (!token) throw new Error('尚未登入或遺失 Access Token');
    if (!spreadsheetId) throw new Error('缺少 Spreadsheet ID');

    const url = `${this.baseUrl}/${spreadsheetId}/values/${range}${
      method === 'POST' ? ':append?valueInputOption=USER_ENTERED' : ''
    }${method === 'PUT' ? '?valueInputOption=USER_ENTERED' : ''}`;

    const options = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Google Sheets API 請求失敗');
    }

    return data;
  }

  // 讀取範圍資料
  async getValues(spreadsheetId, range) {
    const data = await this.fetchAPI(spreadsheetId, range);
    return data.values || [];
  }

  // 新增資料 (Append)
  async appendValues(spreadsheetId, range, values) {
    const body = {
      values: [values],
    };
    return await this.fetchAPI(spreadsheetId, range, 'POST', body);
  }

  // 更新資料 (Update)
  async updateValues(spreadsheetId, range, values) {
    const body = {
      values: values, // 二維陣列
    };
    return await this.fetchAPI(spreadsheetId, range, 'PUT', body);
  }

  // 清空資料 (Clear)
  async clearValues(spreadsheetId, range) {
    const token = window.gAccessToken;
    const url = `${this.baseUrl}/${spreadsheetId}/values/${range}:clear`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Clear API failed');
    return await response.json();
  }
}

window.sheetAPI = new SheetAPI();
