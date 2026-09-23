/**
 * Attendance Management System - Central API Client & Utilities
 */

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

  clearStoredUser() {
    localStorage.removeItem("ams_user");
  },

  async request(url, options = {}) {
    options.headers = options.headers || {};
    
    // Attach user role & uid to query if GET or body if POST/PUT
    const user = API.getStoredUser();
    
    if (!(options.body instanceof FormData) && options.method && options.method !== 'GET') {
      options.headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await fetch(url, options);

      // Handle file download
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("spreadsheetml.sheet")) {
        if (!response.ok) {
          throw new Error("Failed to download Excel file.");
        }
        const blob = await response.blob();
        return { blob, filename: response.headers.get("content-disposition") };
      }

      const data = await response.json();
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
    const user = API.getStoredUser();
    const queryParams = new URLSearchParams(params);
    if (user) {
      if (!queryParams.has("uid")) queryParams.append("uid", user.uid);
      if (!queryParams.has("role")) queryParams.append("role", user.role);
    }
    const queryString = queryParams.toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;
    return API.request(fullUrl, { method: 'GET' });
  },

  async post(url, body = {}) {
    const user = API.getStoredUser();
    if (user && typeof body === 'object' && !(body instanceof FormData)) {
      body.performedBy = body.performedBy || user.uid;
      body.role = body.role || user.role;
      body.uid = body.uid || user.uid;
    }
    return API.request(url, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  async put(url, body = {}) {
    const user = API.getStoredUser();
    if (user && typeof body === 'object') {
      body.performedBy = body.performedBy || user.uid;
      body.role = body.role || user.role;
    }
    return API.request(url, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  async patch(url, body = {}) {
    const user = API.getStoredUser();
    if (user && typeof body === 'object') {
      body.performedBy = body.performedBy || user.uid;
      body.role = body.role || user.role;
    }
    return API.request(url, {
      method: 'PATCH',
      body: JSON.stringify(body)
    });
  },

  async delete(url, params = {}) {
    const user = API.getStoredUser();
    const queryParams = new URLSearchParams(params);
    if (user) {
      queryParams.append("performedBy", user.uid);
      queryParams.append("role", user.role);
    }
    const fullUrl = `${url}?${queryParams.toString()}`;
    return API.request(fullUrl, { method: 'DELETE' });
  }
};

/**
 * Toast Notification System
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
    toast.innerHTML = `
      <span>${message}</span>
      <button style="background:none;border:none;color:#fff;cursor:pointer;font-size:1.1rem;padding:0 0 0 8px;">&times;</button>
    `;

    toast.querySelector("button").addEventListener("click", () => {
      toast.remove();
    });

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
