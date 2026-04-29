import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/api/v1",
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
