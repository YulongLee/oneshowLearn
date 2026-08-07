const TOKEN_KEY = "oneshowlearn_token";

export function getToken() { return window.localStorage.getItem(TOKEN_KEY) || ""; }
export function setToken(token) { token ? window.localStorage.setItem(TOKEN_KEY, token) : window.localStorage.removeItem(TOKEN_KEY); }

export async function api(path, options = {}) {
  const headers = { ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`/api${path}`, { ...options, headers });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "请求失败，请稍后重试");
  return data;
}

export const money = (cents = 0) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
