"use client";

import { useId, type ReactElement, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const CHART = {
  navy: "#003868",
  action: "#004d99",
  grid: "#edeef0",
  axis: "#797c82",
  gray: "#d6d8dc",
  amber: "#f8b037",
  green: "#1b883c",
};

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid #e3e6ea",
  boxShadow: "0 6px 20px rgba(0,56,104,.14)",
  fontSize: 12,
  fontFamily: "inherit",
};
const axis = { stroke: CHART.axis, fontSize: 11, tickLine: false, axisLine: false } as const;
const legendStyle = { fontSize: 12, paddingTop: 8 };

// Charts stay left-to-right in the Arabic UI, like time axes in most Arabic dashboards.
function Frame({ height, children }: { height: number; children: ReactElement }) {
  return (
    <div dir="ltr" className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function useSvgId() {
  return useId().replace(/[^a-zA-Z0-9]/g, "");
}

export function RegistrationsChart({
  data,
  color,
  totalLabel,
  dailyLabel,
  formatDate,
}: {
  data: { date: string; count: number; cumulative: number }[];
  color: string;
  totalLabel: string;
  dailyLabel: string;
  formatDate: (date: string) => string;
}) {
  const id = useSvgId();
  return (
    <Frame height={260}>
      <ComposedChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="date" {...axis} tickFormatter={formatDate} minTickGap={28} />
        <YAxis yAxisId="total" {...axis} allowDecimals={false} />
        <YAxis yAxisId="daily" orientation="right" hide />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(d) => formatDate(String(d))} />
        <Bar isAnimationActive={false}
          yAxisId="daily"
          dataKey="count"
          name={dailyLabel}
          fill={CHART.navy}
          fillOpacity={0.16}
          radius={[3, 3, 0, 0]}
          maxBarSize={16}
        />
        <Area isAnimationActive={false}
          yAxisId="total"
          type="monotone"
          dataKey="cumulative"
          name={totalLabel}
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#${id})`}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </Frame>
  );
}

export function OccupancyChart({
  data,
  color,
  label,
}: {
  data: { time: string; inside: number }[];
  color: string;
  label: string;
}) {
  const id = useSvgId();
  return (
    <Frame height={230}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="time" {...axis} minTickGap={24} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area isAnimationActive={false}
          type="monotone"
          dataKey="inside"
          name={label}
          stroke={color}
          strokeWidth={2.5}
          fill={`url(#${id})`}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </Frame>
  );
}

export function HourlyChart({
  data,
  color,
  inLabel,
  outLabel,
}: {
  data: { hour: string; in: number; out: number }[];
  color: string;
  inLabel: string;
  outLabel: string;
}) {
  return (
    <Frame height={230}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="hour" {...axis} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f2f6fa" }} />
        <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
        <Bar isAnimationActive={false} dataKey="in" name={inLabel} fill={color} radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar isAnimationActive={false} dataKey="out" name={outLabel} fill={CHART.navy} fillOpacity={0.35} radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </Frame>
  );
}

export function Donut({
  segments,
  children,
  size = 190,
}: {
  segments: { key: string; label: string; value: number; color: string }[];
  children?: ReactNode;
  size?: number;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const data = total ? segments.filter((s) => s.value > 0) : [{ key: "empty", label: "", value: 1, color: CHART.grid }];
  return (
    <div dir="ltr" className="relative mx-auto" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie isAnimationActive={false}
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius={size * 0.34}
            outerRadius={size * 0.47}
            startAngle={90}
            endAngle={-270}
            stroke="none"
            paddingAngle={total ? 1.5 : 0}
          >
            {data.map((s) => (
              <Cell key={s.key} fill={s.color} />
            ))}
          </Pie>
          {total > 0 && <Tooltip contentStyle={tooltipStyle} />}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function DistributionChart({
  data,
  threshold,
  label,
}: {
  data: { from: number; to: number; count: number }[];
  threshold: number;
  label: string;
}) {
  return (
    <Frame height={230}>
      <BarChart data={data} margin={{ top: 18, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="from" {...axis} tickFormatter={(v) => `${v}%`} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "#f2f6fa" }}
          labelFormatter={(v) => `${v}–${Number(v) + 10}%`}
        />
        <Bar isAnimationActive={false} dataKey="count" name={label} radius={[4, 4, 0, 0]} maxBarSize={38}>
          {data.map((b) => (
            <Cell
              key={b.from}
              fill={b.from >= threshold ? CHART.green : b.to <= threshold * 0.6 ? CHART.gray : CHART.amber}
            />
          ))}
        </Bar>
        {data.some((b) => b.from === threshold) && (
          <ReferenceLine
            x={threshold}
            stroke={CHART.navy}
            strokeDasharray="4 3"
            label={{ value: `CME ${threshold}%`, position: "top", fill: CHART.navy, fontSize: 11, fontWeight: 700 }}
          />
        )}
      </BarChart>
    </Frame>
  );
}

export function HBarChart({ data, color, label }: { data: { name: string; count: number }[]; color: string; label: string }) {
  const height = Math.max(150, data.length * 34 + 16);
  return (
    <Frame height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, left: 4, bottom: 4 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="name" {...axis} width={130} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f2f6fa" }} />
        <Bar isAnimationActive={false}
          dataKey="count"
          name={label}
          fill={color}
          radius={[0, 4, 4, 0]}
          maxBarSize={18}
          label={{ position: "right", fill: CHART.axis, fontSize: 11 }}
        />
      </BarChart>
    </Frame>
  );
}

export function EventsBarChart({
  data,
  labels,
}: {
  data: { name: string; registered: number; arrived: number; eligible: number }[];
  labels: { registered: string; arrived: string; eligible: string };
}) {
  return (
    <Frame height={280}>
      <BarChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }} barGap={3}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="name" {...axis} interval={0} tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f2f6fa" }} />
        <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
        <Bar isAnimationActive={false} dataKey="registered" name={labels.registered} fill={CHART.navy} fillOpacity={0.22} radius={[4, 4, 0, 0]} maxBarSize={26} />
        <Bar isAnimationActive={false} dataKey="arrived" name={labels.arrived} fill={CHART.action} radius={[4, 4, 0, 0]} maxBarSize={26} />
        <Bar isAnimationActive={false} dataKey="eligible" name={labels.eligible} fill={CHART.green} radius={[4, 4, 0, 0]} maxBarSize={26} />
      </BarChart>
    </Frame>
  );
}
