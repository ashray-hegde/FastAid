import axios from "axios";

const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";
const api = axios.create({ baseURL: `${API_BASE_URL}/api` });

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRedirectingToLogin = false;
let refreshInProgress = false;
let pendingRequests = [];

const triggerLoginRedirect = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
  if (!isRedirectingToLogin) {
    isRedirectingToLogin = true;
    window.location.replace("/login");
  }
};

const refreshToken = async () => {
  const storedRefreshToken = localStorage.getItem("refreshToken");
  if (!storedRefreshToken) {
    throw new Error("No refresh token available");
  }

  const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
    refreshToken: storedRefreshToken
  });

  if (response.data?.token) {
    localStorage.setItem("token", response.data.token);
    if (response.data.refreshToken) {
      localStorage.setItem("refreshToken", response.data.refreshToken);
    }
  }

  return response.data;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest || originalRequest._retry) {
      if (error.response?.status === 401) {
        triggerLoginRedirect();
      }
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !refreshInProgress) {
      originalRequest._retry = true;
      refreshInProgress = true;

      try {
        const data = await refreshToken();
        pendingRequests.forEach((cb) => cb(null, data.token));
        pendingRequests = [];
        return api(originalRequest);
      } catch (refreshError) {
        pendingRequests.forEach((cb) => cb(refreshError));
        pendingRequests = [];
        triggerLoginRedirect();
        return Promise.reject(refreshError);
      } finally {
        refreshInProgress = false;
      }
    }

    if (error.response?.status === 401 && refreshInProgress) {
      return new Promise((resolve, reject) => {
        pendingRequests.push((refreshError, token) => {
          if (refreshError) {
            reject(refreshError);
          } else {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          }
        });
      });
    }

    return Promise.reject(error);
  }
);

export default api;
