"use client";

import useSWR from "swr";

import { fetcher } from "./api";
import type { User } from "./types";

export function useMe() {
  return useSWR<User>("/auth/me", fetcher, { revalidateOnFocus: false, shouldRetryOnError: false });
}

export const isAdminRole = (user: User | undefined | null) => user?.role === "super_admin" || user?.role === "admin";
