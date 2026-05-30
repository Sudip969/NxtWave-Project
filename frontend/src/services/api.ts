const API_BASE_URL = 'http://localhost:5000/api';

// Helper to get headers
const getHeaders = (isAuth = true) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (isAuth) {
    const token = localStorage.getItem('accessToken');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
};

// Handle response errors
const handleResponse = async (response: Response) => {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'Something went wrong');
    (error as any).status = response.status;
    (error as any).code = data.code || 'UNKNOWN_ERROR';
    throw error;
  }
  return data;
};

// Safe request wrapper that handles silent token refreshing
export const request = async (url: string, options: RequestInit = {}, isAuth = true): Promise<any> => {
  const fullUrl = `${API_BASE_URL}${url}`;
  const config = {
    ...options,
    headers: {
      ...getHeaders(isAuth),
      ...(options.headers || {}),
    },
  };

  try {
    const res = await fetch(fullUrl, config);
    
    // Auto-refresh token rotation if access token has expired (HTTP 401)
    if (res.status === 401 && isAuth) {
      console.log('Access token expired. Executing silent token refresh rotation...');
      const success = await rotateTokens();
      if (success) {
        // Retry the original request with the fresh token
        const newHeaders = {
          ...getHeaders(true),
          ...(options.headers || {}),
        };
        const retryRes = await fetch(fullUrl, { ...config, headers: newHeaders });
        return await handleResponse(retryRes);
      } else {
        // Clear session and force log out
        localStorage.clear();
        window.dispatchEvent(new Event('auth-expired'));
        throw new Error('Session expired. Please log in again.');
      }
    }

    return await handleResponse(res);
  } catch (err) {
    throw err;
  }
};

// Silent refresh token rotation execution
const rotateTokens = async (): Promise<boolean> => {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (res.ok) {
      const payload = await res.json();
      localStorage.setItem('accessToken', payload.data.accessToken);
      localStorage.setItem('refreshToken', payload.data.refreshToken);
      console.log('Silent token refresh rotation completed successfully.');
      return true;
    }
  } catch (e) {
    console.error('Silent token rotation failed:', e);
  }
  return false;
};

// Typed endpoints services
export const api = {
  auth: {
    register: (body: any) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }, false),
    login: (body: any) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }, false),
    logout: (refreshToken: string) => request('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }, false),
  },
  projects: {
    list: () => request('/projects'),
    create: (body: any) => request('/projects', { method: 'POST', body: JSON.stringify(body) }),
  },
  tasks: {
    list: (params: Record<string, any> = {}) => {
      const qs = new URLSearchParams();
      Object.keys(params).forEach(k => {
        if (params[k] !== undefined && params[k] !== '') {
          qs.append(k, params[k]);
        }
      });
      const queryStr = qs.toString();
      return request(`/tasks${queryStr ? `?${queryStr}` : ''}`);
    },
    getById: (id: string) => request(`/tasks/${id}`),
    create: (body: any) => request('/tasks', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: any) => request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => request(`/tasks/${id}`, { method: 'DELETE' }),
  },
  analytics: {
    get: () => request('/auth/users'),
  }
};
