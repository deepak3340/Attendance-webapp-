/**
 * Attendance Management System - Central API Client & Utilities
 */

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.escapeHtml = escapeHtml;

const API = {
  getStoredUser() {
    try {
      const userStr = localStorage.getItem("ams_user");
      return userStr ? JSON.parse(userStr) : null;
    } catch (e) {
      return null;
    }
  },

  setStoredUser(user) {
    localStorage.setItem("ams_user", JSON.stringify(user));
  },

  getStoredToken() {
    return localStorage.getItem("ams_token") || null;
  },

  setStoredToken(token) {
    if (token) {
      localStorage.setItem("ams_token", token);
    } else {
      localStorage.removeItem("ams_token");
    }
  },

  clearStoredUser() {
    localStorage.removeItem("ams_user");
    localStorage.removeItem("ams_token");
  },

  escapeHtml,

  async request(url, options = {}) {
    options.headers = options.headers || {};
    
    // Attach cryptographically verified session token in Authorization header
    const token = API.getStoredToken();
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const user = API.getStoredUser();
    if (user && user.uid) {
      options.headers['X-User-UID'] = String(user.uid);
      options.headers['X-User-Role'] = String(user.role || 'teacher');
    }
    
    if (!(options.body instanceof FormData) && options.method && options.method !== 'GET') {
      options.headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(url, options);

      // Handle session expiration
      if (response.status === 401) {
        const isAuthRoute = url.includes('/api/auth/login') || url.includes('/api/auth/reset-password') || url.includes('/api/auth/verify');
        if (!isAuthRoute && (window.location.pathname.startsWith('/principal') || window.location.pathname.startsWith('/teacher'))) {
          API.clearStoredUser();
          window.location.replace('/login');
          throw new Error('Your session has expired. Please sign in again.');
        }
      }

      // Handle file download (e.g. Excel spreadsheet)
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("spreadsheetml.sheet")) {
        if (!response.ok) {
          throw new Error("Failed to download Excel file.");
        }
        const blob = await response.blob();
        return { blob, filename: response.headers.get("content-disposition") };
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || `Request failed with status ${response.status}`);
      }
      return data;
    } catch (error) {
      console.error(`API Error on ${url}:`, error);
      throw error;
    }
  },

  async get(url, params = {}) {
    const queryParams = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && val !== '') {
        queryParams.append(key, String(val));
      }
    }
    const queryString = queryParams.toString();
    if (!queryString) return API.request(url, { method: 'GET' });
    const separator = url.includes('?') ? '&' : '?';
    const fullUrl = `${url}${separator}${queryString}`;
    return API.request(fullUrl, { method: 'GET' });
  },

  async post(url, body = {}) {
    return API.request(url, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  async put(url, body = {}) {
    return API.request(url, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  async patch(url, body = {}) {
    return API.request(url, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
  },

  async delete(url, params = {}) {
    const queryParams = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && val !== '') {
        queryParams.append(key, String(val));
      }
    }
    const queryString = queryParams.toString();
    if (!queryString) return API.request(url, { method: 'DELETE' });
    const separator = url.includes('?') ? '&' : '?';
    const fullUrl = `${url}${separator}${queryString}`;
    return API.request(fullUrl, { method: 'DELETE' });
  }
};

/**
 * XSS-Safe Toast Notification System
 */
const Toast = {
  container: null,

  init() {
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "toast-container";
      document.body.appendChild(this.container);
    }
  },

  show(message, type = "info", duration = 4000) {
    this.init();
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    // Safely insert content using textContent to prevent reflected XSS
    const textSpan = document.createElement("span");
    textSpan.textContent = String(message || '');
    
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.style.background = "none";
    closeBtn.style.border = "none";
    closeBtn.style.color = "#fff";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.fontSize = "1.2rem";
    closeBtn.style.padding = "0 0 0 8px";
    closeBtn.style.lineHeight = "1";

    closeBtn.addEventListener("click", () => {
      toast.remove();
    });

    toast.appendChild(textSpan);
    toast.appendChild(closeBtn);
    this.container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(10px)";
      toast.style.transition = "all 0.25s ease";
      setTimeout(() => toast.remove(), 250);
    }, duration);
  },

  success(msg) { this.show(msg, "success"); },
  error(msg) { this.show(msg, "error", 5000); },
  warning(msg) { this.show(msg, "warning"); },
  info(msg) { this.show(msg, "info"); }
};

/**
 * Global Modal Helpers
 */
const Modal = {
  open(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add("active");
  },
  close(modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove("active");
  }
};
