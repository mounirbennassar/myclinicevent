/** Thin client for the FastAPI backend, reached through the /api rewrite in next.config.ts. */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

type Json = Record<string, unknown> | unknown[];

export async function api<T>(
  path: string,
  { method = "GET", body, signal }: { method?: string; body?: Json; signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "network", "Network error");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw toApiError(res.status, data);
  return data as T;
}

function toApiError(status: number, data: unknown): ApiError {
  const detail = (data as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const d = detail as { code?: string; message?: string; fields?: Record<string, string> };
    return new ApiError(status, d.code ?? "error", d.message ?? "Error", d.fields ?? {});
  }
  if (Array.isArray(detail)) {
    // FastAPI's own request validation errors: [{loc: ["body", "field"], msg}]
    const fields: Record<string, string> = {};
    for (const item of detail as { loc?: (string | number)[] }[]) {
      const field = item.loc?.filter((p) => typeof p === "string" && p !== "body").pop();
      if (typeof field === "string") fields[field] = "invalid";
    }
    return new ApiError(status, "validation", "Validation error", fields);
  }
  return new ApiError(status, status === 404 ? "not_found" : "error", typeof detail === "string" ? detail : "Error");
}

/** SWR fetcher: the key is the API path. */
export const fetcher = <T>(path: string) => api<T>(path);
