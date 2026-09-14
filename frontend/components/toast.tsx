"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

import { Icon } from "./icons";
import { cn } from "./ui";

type Tone = "success" | "error" | "info";
type ToastItem = { id: number; message: string; tone: Tone };

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, tone: Tone = "success") => {
    const id = nextId.current++;
    setItems((list) => [...list.slice(-2), { id, message, tone }]);
    setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 3600);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
        data-noprint
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "flex max-w-[92vw] animate-fade-up items-center gap-2.5 rounded-full px-5 py-3 text-[14px] font-bold text-white shadow-overlay",
              item.tone === "error" ? "bg-danger" : "bg-midnight",
            )}
          >
            <Icon name={item.tone === "error" ? "alert" : item.tone === "info" ? "info" : "check"} size={17} />
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
