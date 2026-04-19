/**
 * 處理 Google Identity Services (GSI) OAuth2 登入與 Token 取得
 */
class AuthManager {
  constructor() {
    this.tokenClient = null;
    this.onLoginSuccess = null;
  }

  init(clientId, callback) {
    this.onLoginSuccess = callback;
    try {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email',
        callback: (tokenResponse) => {
          if (tokenResponse && tokenResponse.access_token) {
            window.gAccessToken = tokenResponse.access_token;
            this.fetchUserEmail();
          }
        },
      });
    } catch (e) {
      console.error("GSI Initialization Error", e);
      throw new Error("無法初始化 Google 登入，請確認 Client ID 是否正確。");
    }
  }

  requestAccessToken() {
    if (!this.tokenClient) {
      throw new Error("Google Token Client 尚未初始化！");
    }
    this.tokenClient.requestAccessToken();
  }

  async fetchUserEmail() {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${window.gAccessToken}` }
      });
      const data = await response.json();
      if (data && data.email) {
        window.gUserEmail = data.email;
        if (this.onLoginSuccess) this.onLoginSuccess(data.email);
      }
    } catch (error) {
      console.error('Failed to fetch user email:', error);
      alert('無法取得使用者 Email，請重新登入');
    }
  }

  logout() {
    window.gAccessToken = null;
    window.gUserEmail = null;
  }
}

window.authManager = new AuthManager();
