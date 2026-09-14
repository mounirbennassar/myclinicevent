"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { cn } from "./ui";

export function useQrDataUrl(value: string | null | undefined, width = 640, dark = "#003868"): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!value) return;
    let alive = true;
    QRCode.toDataURL(value, { errorCorrectionLevel: "M", margin: 1, width, color: { dark, light: "#ffffff" } }).then(
      (u) => alive && setUrl(u),
    );
    return () => {
      alive = false;
    };
  }, [value, width, dark]);
  return url;
}

export function QrImage({
  value,
  alt,
  className,
  width,
  dark,
}: {
  value: string | null | undefined;
  alt: string;
  className?: string;
  width?: number;
  dark?: string;
}) {
  const url = useQrDataUrl(value, width, dark);
  if (!url) return <div className={cn("animate-pulse rounded-lg bg-ink-100", className)} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={cn("[image-rendering:pixelated]", className)} />;
}

export async function qrSvg(value: string, dark = "#003868"): Promise<string> {
  return QRCode.toString(value, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark, light: "#ffffff" } });
}

export function downloadUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
