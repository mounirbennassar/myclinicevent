import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

/**
 * Fetch from the backend during server rendering (for SEO and link previews).
 * Returns null on 404. Forwards the visitor's cookies so team members can preview draft events.
 * Wrapped in React's cache so generateMetadata and the page share one request.
 */
export const serverApi = cache(async <T,>(path: string): Promise<T | null> => {
  const cookie = (await cookies()).toString();
  const res = await fetch(`${BACKEND}/api${path}`, {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Backend responded ${res.status} for ${path}`);
  return (await res.json()) as T;
});
