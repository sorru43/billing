// Thin fetch wrapper. The session lives in an httpOnly cookie, so there is no
// token to store or attach here; the custom header satisfies the server's CSRF check.
export class ApiError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.status = status;
    this.errors = errors || {};
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

async function request(method, url, body, file) {
  const res = await fetch(`/api${url}`, {
    method,
    credentials: 'same-origin',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      ...(file ? { 'Content-Type': file.type || 'application/octet-stream' } : body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: file || (body !== undefined ? JSON.stringify(body) : undefined),
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (res.status === 401 && !url.startsWith('/auth/login')) onUnauthorized();
  if (!res.ok || json.success === false) {
    throw new ApiError(json.message || `Request failed (${res.status})`, res.status, json.errors);
  }
  return json;
}

export const api = {
  get: (url, params) => {
    const qs = params ? `?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))}` : '';
    return request('GET', url + qs);
  },
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  patch: (url, body = {}) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
  // Raw file body (e.g. logo upload).
  upload: (url, file) => request('PUT', url, undefined, file),
  send: (method, url, file) => request(method, url, undefined, file),
};
