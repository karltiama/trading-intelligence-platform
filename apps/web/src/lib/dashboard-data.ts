import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  LayoutDashboard,
  ListOrdered,
  PlayCircle,
  Radar,
  Shield,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Signals", href: "/dashboard/signals", icon: Radar },
  { title: "Orders", href: "/dashboard/orders", icon: ListOrdered },
  { title: "Automation", href: "/dashboard/automation", icon: PlayCircle },
  { title: "Guardrails", href: "/dashboard/guardrails", icon: Shield },
  { title: "Portfolio", href: "/dashboard/portfolio", icon: Briefcase },
];

export type Direction = "up" | "down" | "flat";

export type KpiCard = {
  id: string;
  label: string;
  value: string;
  delta: string;
  direction: Direction;
  hint?: string;
};

/** @deprecated Use live portfolio data from GET /portfolio instead. */
export const kpiCards: KpiCard[] = [
  {
    id: "portfolio-value",
    label: "Portfolio Value",
    value: "$128,430.52",
    delta: "+2.14%",
    direction: "up",
    hint: "vs. yesterday",
  },
  {
    id: "daily-pnl",
    label: "Daily Gain / Loss",
    value: "+$2,684.12",
    delta: "+0.82%",
    direction: "up",
    hint: "today",
  },
  {
    id: "active-signals",
    label: "Active Signals",
    value: "7",
    delta: "+2",
    direction: "up",
    hint: "new today",
  },
  {
    id: "win-rate",
    label: "Win Rate",
    value: "62.4%",
    delta: "-1.1%",
    direction: "down",
    hint: "last 30 days",
  },
];

export type WatchlistRow = {
  symbol: string;
  price: string;
  changePct: number;
  volume: string;
  trend: Direction;
  signal: "Buy" | "Hold" | "Sell" | "Watch";
};

export const watchlistRows: WatchlistRow[] = [
  { symbol: "AAPL", price: "$192.84", changePct: 1.24, volume: "48.2M", trend: "up", signal: "Buy" },
  { symbol: "MSFT", price: "$412.50", changePct: 0.42, volume: "22.7M", trend: "up", signal: "Hold" },
  { symbol: "SPY", price: "$548.19", changePct: -0.31, volume: "61.4M", trend: "flat", signal: "Hold" },
  { symbol: "NVDA", price: "$124.77", changePct: 3.18, volume: "214.6M", trend: "up", signal: "Buy" },
  { symbol: "META", price: "$498.12", changePct: -1.05, volume: "18.3M", trend: "down", signal: "Watch" },
];

export type Timeframe = "1D" | "1W" | "1M" | "3M" | "1Y";

export const timeframes: Timeframe[] = ["1D", "1W", "1M", "3M", "1Y"];

export type Insight = {
  id: string;
  symbol: string;
  title: string;
  body: string;
  tone: "positive" | "neutral" | "negative";
};

export const insights: Insight[] = [
  {
    id: "aapl-20ma",
    symbol: "AAPL",
    title: "AAPL pulling back near 20-day MA",
    body: "Price is testing the 20-day moving average with declining volume — watch for a bounce or breakdown.",
    tone: "neutral",
  },
  {
    id: "nvda-rvol",
    symbol: "NVDA",
    title: "NVDA showing strong relative volume",
    body: "Session volume is tracking 2.1x the 30-day average with price holding above VWAP.",
    tone: "positive",
  },
  {
    id: "spy-neutral",
    symbol: "SPY",
    title: "SPY trend remains neutral",
    body: "Index is consolidating inside the prior week's range; no directional edge until a breakout.",
    tone: "neutral",
  },
];

