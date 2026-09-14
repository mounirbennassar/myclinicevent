"use client";

import type QrScannerType from "qr-scanner";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useI18n } from "@/lib/i18n";

import { Icon } from "./icons";
import { Button, cn } from "./ui";

/** Phone-camera QR reader used by the gate scanner and the sponsor lead scanner. */
export function CameraView({
  onCode,
  onRunningChange,
  onBeforeStart,
  overlay,
}: {
  onCode: (code: string) => void;
  onRunningChange?: (running: boolean) => void;
  onBeforeStart?: () => void;
  overlay?: ReactNode;
}) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScannerType | null>(null);
  const onCodeRef = useRef(onCode);
  const [state, setState] = useState<"idle" | "starting" | "running" | "error">("idle");
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [cameraIndex, setCameraIndex] = useState(0);
  const [hasFlash, setHasFlash] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);
  useEffect(() => {
    onRunningChange?.(state === "running");
  }, [state, onRunningChange]);
  useEffect(
    () => () => {
      scannerRef.current?.destroy();
      scannerRef.current = null;
    },
    [],
  );

  async function start() {
    onBeforeStart?.();
    if (!videoRef.current) return;
    setState("starting");
    try {
      const { default: QrScanner } = await import("qr-scanner");
      const scanner = new QrScanner(videoRef.current, (result) => onCodeRef.current(result.data), {
        preferredCamera: "environment",
        maxScansPerSecond: 8,
        returnDetailedScanResult: true,
        highlightScanRegion: false,
        highlightCodeOutline: false,
      });
      scannerRef.current = scanner;
      await scanner.start();
      setState("running");
      setHasFlash(await scanner.hasFlash().catch(() => false));
      setCameras(await QrScanner.listCameras(true).catch(() => []));
    } catch {
      scannerRef.current?.destroy();
      scannerRef.current = null;
      setState("error");
    }
  }

  function stop() {
    scannerRef.current?.destroy();
    scannerRef.current = null;
    setFlashOn(false);
    setState("idle");
  }

  async function switchCamera() {
    const scanner = scannerRef.current;
    if (!scanner || cameras.length < 2) return;
    const next = (cameraIndex + 1) % cameras.length;
    setCameraIndex(next);
    await scanner.setCamera(cameras[next].id);
    setFlashOn(false);
    setHasFlash(await scanner.hasFlash().catch(() => false));
  }

  async function toggleFlash() {
    const scanner = scannerRef.current;
    if (!scanner) return;
    await scanner.toggleFlash().catch(() => {});
    setFlashOn(scanner.isFlashOn());
  }

  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-[520px] overflow-hidden rounded-2xl bg-midnight">
        <video ref={videoRef} className={cn("size-full object-cover", state !== "running" && "opacity-0")} playsInline muted />
        {state === "running" && (
          <div className="pointer-events-none absolute inset-[14%]">
            {[
              "start-0 top-0 rounded-ss-2xl border-s-4 border-t-4",
              "end-0 top-0 rounded-se-2xl border-e-4 border-t-4",
              "bottom-0 start-0 rounded-es-2xl border-b-4 border-s-4",
              "bottom-0 end-0 rounded-ee-2xl border-b-4 border-e-4",
            ].map((c) => (
              <span key={c} className={cn("absolute size-12 border-brand-teal-soft", c)} />
            ))}
            <span className="absolute inset-x-3 h-0.5 animate-scan-line rounded-full bg-brand-teal-soft shadow-[0_0_14px_#56dbdb]" />
          </div>
        )}
        {state !== "running" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center text-white">
            <span className="grid size-16 place-items-center rounded-2xl bg-white/10">
              <Icon name="camera" size={30} />
            </span>
            {state === "error" && (
              <div className="max-w-xs">
                <p className="font-bold">{t.scanner.cameraError}</p>
                <p className="mt-1 text-[13px] text-white/70">{t.scanner.cameraHelp}</p>
              </div>
            )}
            <Button size="lg" onClick={start} loading={state === "starting"} icon="camera">
              {t.scanner.startCamera}
            </Button>
          </div>
        )}
        {overlay && <div className="absolute inset-0 flex p-4">{overlay}</div>}
      </div>
      {state === "running" && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" size="sm" icon="x" onClick={stop}>
            {t.scanner.stopCamera}
          </Button>
          {cameras.length > 1 && (
            <Button variant="secondary" size="sm" icon="refresh" onClick={switchCamera}>
              {t.scanner.switchCamera}
            </Button>
          )}
          {hasFlash && (
            <Button variant={flashOn ? "navy" : "secondary"} size="sm" icon="flash" onClick={toggleFlash}>
              {t.scanner.torch}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
