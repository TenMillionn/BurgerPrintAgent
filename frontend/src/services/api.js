const API_BASE = 'http://localhost:3001'; // Assuming standard NestJS port, adjust if needed. Usually we might use a proxy, but we can hardcode for MVP.

export const fetchProducts = async (query = {}) => {
  const params = new URLSearchParams(query).toString();
  const res = await fetch(`${API_BASE}/orders/products?${params}`);
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json();
};

export const fetchFactories = async (shortCode) => {
  const res = await fetch(`${API_BASE}/orders/products/${shortCode}/factories`);
  if (!res.ok) throw new Error('Failed to fetch factories');
  return res.json();
};

export const fetchVariants = async (shortCode, factory) => {
  const url = factory
    ? `${API_BASE}/orders/products/${shortCode}/variants?factory=${encodeURIComponent(factory)}`
    : `${API_BASE}/orders/products/${shortCode}/variants`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch variants');
  return res.json();
};

export const fetchProductDetail = async (shortCode) => {
  const res = await fetch(`${API_BASE}/orders/products/${shortCode}/detail`);
  if (!res.ok) throw new Error('Failed to fetch product details');
  return res.json();
};
