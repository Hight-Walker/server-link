/**
 * Safe API request helpers that guarantee robust JSON parsing
 * and prevent "Unexpected token '<' is not valid JSON" errors
 */

export async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}: ${res.statusText}` };
      }
      // If server returned HTML (e.g. during startup or index.html fallback)
      return { ok: false, error: 'Resposta não é um JSON válido' };
    }

    const json = await res.json();
    if (!res.ok) {
      return { ok: false, data: json, error: json.error || `HTTP ${res.status}` };
    }

    return { ok: true, data: json };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Erro de conexão de rede' };
  }
}
