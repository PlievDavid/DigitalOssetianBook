window.AdamAuthenticated = document.body.dataset.authenticated === 'true';
window.AdamApi = async (path, options = {}) => {
  const token = document.querySelector('#api-antiforgery input[name="__RequestVerificationToken"]')?.value;
  const response = await fetch(`/api/v1${path}`, {
    credentials: "same-origin",
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(token ? { RequestVerificationToken: token } : {}), ...options.headers }
  });
  if (response.status === 401) throw Object.assign(new Error("Войдите в аккаунт, чтобы сохранить результат."), { status: 401 });
  if (!response.ok) {
    let detail = "Не удалось выполнить действие.";
    try { detail = (await response.json()).error || detail; } catch { /* empty response */ }
    throw Object.assign(new Error(detail), { status: response.status });
  }
  const body = await response.text();
  return body.trim() ? JSON.parse(body) : null;
};
