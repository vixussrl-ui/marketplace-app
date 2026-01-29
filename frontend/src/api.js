import axios from 'axios';

// Use environment variable or fallback to localhost for development
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001';
export const API_BASE_URL = API_BASE;

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  }
});

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
};

export const platformsAPI = {
  list: () => api.get('/platforms'),
  get: (id) => api.get(`/platforms/${id}`),
};

export const credentialsAPI = {
  list: (userId) => api.get('/credentials', { params: { user_id: userId } }),
  create: (userId, data) => api.post('/credentials', { ...data, user_id: userId }),
  update: (id, userId, data) => api.put(`/credentials/${id}`, { ...data, user_id: userId }),
  delete: (id, userId) => api.delete(`/credentials/${id}`, { params: { user_id: userId } }),
};

export const ordersAPI = {
  list: (userId, filters = {}) => api.get('/orders', { params: { user_id: userId, ...filters } }),
  get: (id, userId) => api.get(`/orders/${id}`, { params: { user_id: userId } }),
  refresh: (userId, credentialId) => api.post('/orders/refresh', { user_id: userId, credential_id: credentialId }),
};

export const emagAPI = {
  getProductPrice: (sku, credentialId) => api.post('/emag/product/price', { sku, credential_id: credentialId }),
};

export const calculatorAPI = {
  getProducts: () => api.get('/calculator/products'),
  saveProducts: (products, electricitySettings) => api.put('/calculator/products', { products, electricity_settings: electricitySettings }),
};
