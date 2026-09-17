"use client";

import clsx from "clsx";
import Link from "next/link";
import {
  useEffect,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n/dict";
import type { Locale } from "@/lib/types";

import { Icon, type IconName } from "./icons";

export const cn = clsx;

// ---------- buttons

type Variant = "primary" | "navy" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-action text-white hover:bg-action-hover shadow-sm",
  navy: "bg-navy text-white hover:bg-midnight shadow-sm",
  secondary: "bg-white text-navy border border-ink-200 hover:bg-tint",
  ghost: "text-navy hover:bg-tint",
  danger: "bg-danger text-white hover:bg-[#b3212b] shadow-sm",
  success: "bg-success text-white hover:bg-[#12662c] shadow-sm",
};
const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-[13px] gap-1.5",
  md: "h-11 px-4 text-[14px] gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
};
const BUTTON =
  "inline-flex items-center justify-center rounded-lg font-bold transition-colors duration-150 select-none whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none active:translate-y-px";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: IconName;
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(BUTTON, VARIANTS[variant], SIZES[size], className)}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : icon ? <Icon name={icon} size={size === "sm" ? 15 : 17} /> : null}
      {children}
    </button>
  );
}

export function LinkButton({
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: IconName }) {
  return (
    <Link className={cn(BUTTON, VARIANTS[variant], SIZES[size], className)} {...props}>
      {icon && <Icon name={icon} size={size === "sm" ? 15 : 17} />}
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("animate-spin", className ?? "size-5")} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------- form controls

export function Field({
  label,
  hint,
  error,
  optional,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-bold text-ink-900">
        {label}
        {optional && <span className="ms-1.5 font-normal text-ink-500">({t.common.optional})</span>}
      </label>
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-[12.5px] font-medium text-danger" role="alert">
          <Icon name="alert" size={14} className="mt-[3px] shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12.5px] text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "w-full rounded-lg border bg-white px-3.5 text-[15px] text-ink-900 placeholder:text-ink-300 outline-none transition-[border-color,box-shadow] duration-150 focus:border-action focus:ring-3 focus:ring-action/20 disabled:bg-ink-50 disabled:text-ink-500";

export function Input({ invalid, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, "h-11", invalid ? "border-danger" : "border-ink-200", className)}
      {...props}
    />
  );
}

export function Textarea({
  invalid,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, "min-h-24 py-2.5", invalid ? "border-danger" : "border-ink-200", className)}
      {...props}
    />
  );
}

export function Select({
  invalid,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        className={cn(CONTROL, "h-11 appearance-none pe-10", invalid ? "border-danger" : "border-ink-200", className)}
        {...props}
      >
        {children}
      </select>
      <Icon
        name="chevronDown"
        size={16}
        className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-ink-500"
      />
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  invalid,
  id,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  invalid?: boolean;
  id?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-[14px] leading-snug text-ink-700">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-invalid={invalid || undefined}
        className={cn(
          "mt-0.5 size-5 shrink-0 cursor-pointer rounded accent-[#004d99]",
          invalid && "outline-2 outline-offset-2 outline-danger",
        )}
      />
      <span>{label}</span>
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-[14px] font-bold text-ink-900">{label}</div>
        {hint && <div className="mt-0.5 text-[12.5px] text-ink-500">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === "string" ? label : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-150 disabled:opacity-50",
          checked ? "bg-action" : "bg-ink-200",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-[inset-inline-start] duration-150",
            checked ? "start-[22px]" : "start-0.5",
          )}
        />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" className={cn("inline-flex rounded-xl bg-ink-100 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-lg px-3 font-bold transition-colors duration-150",
            size === "sm" ? "h-8 text-[12.5px]" : "h-10 text-[14px]",
            value === o.value ? "bg-white text-navy shadow-card" : "text-ink-500 hover:text-navy",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- surfaces

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-hairline/80 bg-white shadow-card", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-5", className)}>
      <div className="min-w-0">
        <h3 className="text-[16px] font-extrabold leading-tight">{title}</h3>
        {subtitle && <p className="mt-1 text-[12.5px] text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export type Tone = "neutral" | "navy" | "teal" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700",
  navy: "bg-[#e3edf7] text-navy",
  teal: "bg-brand-teal-tint text-brand-teal",
  success: "bg-success-tint text-success",
  warning: "bg-warning-tint text-warning",
  danger: "bg-danger-tint text-danger",
  info: "bg-info-tint text-info",
};

export function Badge({
  tone = "neutral",
  dot,
  pulse,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-bold",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full bg-current", pulse && "animate-pulse-soft")} />}
      {children}
    </span>
  );
}

function useOverlay(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const { t } = useI18n();
  useOverlay(open, onClose);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-midnight/55 sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "flex max-h-[92vh] w-full animate-pop flex-col overflow-hidden rounded-t-2xl bg-white shadow-overlay sm:rounded-2xl",
          { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl" }[size],
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-hairline px-5 py-4">
          <h2 className="text-[17px] font-extrabold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100" aria-label={t.common.close}>
            <Icon name="x" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-hairline bg-ink-50 px-5 py-3.5">{footer}</div>
        )}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  useOverlay(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 bg-midnight/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        role="dialog"
        aria-modal="true"
        className="absolute inset-y-0 end-0 flex w-full max-w-[560px] animate-fade-up flex-col bg-white shadow-overlay"
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-5">
          <div className="min-w-0">
            <h2 className="truncate text-[19px] font-extrabold">{title}</h2>
            {subtitle && <div className="mt-1 text-[13px] text-ink-500">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100" aria-label={t.common.close}>
            <Icon name="x" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </aside>
    </div>
  );
}

export function EmptyState({
  icon = "search",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-tint text-navy">
        <Icon name={icon} size={24} />
      </div>
      <h3 className="mt-4 text-[16px] font-extrabold">{title}</h3>
      {children && <p className="mt-1.5 max-w-sm text-[14px] text-ink-500">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const TILE_TONES = {
  navy: "bg-[#e3edf7] text-navy",
  teal: "bg-brand-teal-tint text-brand-teal",
  success: "bg-success-tint text-success",
  warning: "bg-warning-tint text-warning",
  info: "bg-info-tint text-info",
  fuchsia: "bg-[#fcecf4] text-[#9f1853]",
} as const;

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "navy",
  live,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon: IconName;
  tone?: keyof typeof TILE_TONES;
  live?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-bold text-ink-500">
            {live && <span className="size-2 animate-pulse-soft rounded-full bg-brand-teal-mid" />}
            {label}
          </div>
          <div className="num mt-2 text-[32px] font-extrabold leading-none text-navy">{value}</div>
        </div>
        <div className={cn("grid size-11 shrink-0 place-items-center rounded-xl", TILE_TONES[tone])}>
          <Icon name={icon} size={20} />
        </div>
      </div>
      {sub && <div className="mt-3 text-[12.5px] font-bold text-ink-500">{sub}</div>}
    </Card>
  );
}

/** Horizontal bar with an optional threshold marker (e.g. the 80% CME line). */
export function Progress({ value, threshold, className }: { value: number; threshold?: number; className?: string }) {
  const color =
    threshold == null
      ? "bg-brand-teal"
      : value >= threshold
        ? "bg-success"
        : value >= threshold * 0.6
          ? "bg-warning-strong"
          : "bg-ink-300";
  return (
    <div className={cn("relative h-2 w-full rounded-full bg-ink-100", className)}>
      <div
        className={cn("absolute inset-y-0 start-0 rounded-full transition-[width] duration-500", color)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
      {threshold != null && (
        <div className="absolute -inset-y-1 w-0.5 rounded bg-navy/70" style={{ insetInlineStart: `${threshold}%` }} />
      )}
    </div>
  );
}

/** Circular progress with a tick at the threshold. */
export function Ring({
  value,
  threshold,
  size = 156,
  stroke = 12,
  children,
}: {
  value: number;
  threshold?: number;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  const met = threshold != null && value >= threshold;
  const mid = size / 2;
  const rad = (((threshold ?? 0) / 100) * 360 - 90) * (Math.PI / 180);
  const inner = r - stroke / 2 - 3;
  const outer = r + stroke / 2 + 3;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="block" aria-hidden="true">
        <circle cx={mid} cy={mid} r={r} fill="none" stroke="#edeef0" strokeWidth={stroke} />
        <circle
          cx={mid}
          cy={mid}
          r={r}
          fill="none"
          stroke={met ? "#178038" : "#004d99"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          transform={`rotate(-90 ${mid} ${mid})`}
          style={{ transition: "stroke-dasharray .6s cubic-bezier(.2,.7,.3,1)" }}
        />
        {threshold != null && (
          <line
            x1={mid + inner * Math.cos(rad)}
            y1={mid + inner * Math.sin(rad)}
            x2={mid + outer * Math.cos(rad)}
            y2={mid + outer * Math.sin(rad)}
            stroke="#003868"
            strokeWidth={3}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const letter = name.replace(/^(dr\.?|د\.?)\s+/i, "").trim().charAt(0).toUpperCase();
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full bg-brand-teal-tint text-[15px] font-extrabold text-brand-teal",
        className,
      )}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[12px] font-bold text-ink-500">{eyebrow}</div>}
        <h1 className="text-[24px] font-extrabold leading-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-ink-100", className)} />;
}

export function errorMessage(error: unknown, t: Dict, locale: Locale): string {
  if (!(error instanceof ApiError)) return t.common.error;
  if (error.code === "network") return t.common.network;
  if (error.code.startsWith("registration_")) {
    return t.public.states[error.code.slice("registration_".length)] ?? t.common.error;
  }
  const known = t.auth.codes[error.code] ?? t.member.codes[error.code] ?? t.fieldErrors[error.code];
  if (known) return known;
  if (error.status === 403) return t.common.forbidden;
  if (error.status === 404) return t.common.notFound;
  // Backend messages are written in English, so only show them in the English UI.
  return locale === "en" && error.message ? error.message : t.common.error;
}

export function ErrorBox({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const { t, locale } = useI18n();
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-danger/20 bg-danger-tint p-4 text-[14px] font-medium text-danger",
        className,
      )}
    >
      <Icon name="alert" className="mt-0.5 shrink-0" />
      <div className="flex-1">{errorMessage(error, t, locale)}</div>
      {onRetry && (
        <button onClick={onRetry} className="font-bold underline underline-offset-2">
          {t.common.retry}
        </button>
      )}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3 text-[13px] text-ink-500">
      <span className="num">{t.common.showing(from, to, total)}</span>
      <div className="flex gap-1.5">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          {t.common.previous}
        </Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          {t.common.next}
        </Button>
      </div>
    </div>
  );
}
