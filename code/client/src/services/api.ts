import axios from "axios";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
export const SERVICE_HEALTH_URL = `${API_BASE_URL.replace(/\/api\/v1\/?$/, "")}/health/services`;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("medmemory_token");
  const hasExplicitAuthHeader =
    Boolean(config.headers?.Authorization) || Boolean(config.headers?.authorization);

  if (token && !hasExplicitAuthHeader) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
