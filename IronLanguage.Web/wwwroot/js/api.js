window.AdamApi = async (path, options = {}) => {
  const token = document.querySelector('#api-antiforgery input[name="__RequestVerificationToken"]')?.value;
  const response = await fetch(`/api/v1${path}`, {
    credentials: "same-origin",
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(token ? { RequestVerificationToken: token } : {}), ...options.headers }
  });
  if (response.status === 401) throw new Error("Войдите в аккаунт, чтобы сохранить результат.");
  if (!response.ok) {
    let detail = "Не удалось выполнить действие.";
    try { detail = (await response.json()).error || detail; } catch { /* empty response */ }
    throw new Error(detail);
  }
  return response.status === 204 ? null : response.json();
};
