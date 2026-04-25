import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Briefcase,
  LayoutDashboard,
  Settings,
  Signal,
  Star,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Watchlist", href: "/watchlist", icon: Star },
  { title: "Signals", href: "/signals", icon: Signal },
  { title: "Backtests", href: "/backtests", icon: BarChart3 },
  { title: "Portfolio", href: "/portfolio", icon: Briefcase },
  { title: "Settings", href: "/settings", icon: Settings },
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

export type Setup = {
  id: string;
  symbol: string;
  confidencePct: number;
  entry: string;
  stop: string;
  riskReward: string;
};

export const todaysSetups: Setup[] = [
  { id: "setup-aapl", symbol: "AAPL", confidencePct: 78, entry: "$193.20", stop: "$190.40", riskReward: "1:2.4" },
  { id: "setup-nvda", symbol: "NVDA", confidencePct: 84, entry: "$125.10", stop: "$121.90", riskReward: "1:3.1" },
  { id: "setup-msft", symbol: "MSFT", confidencePct: 66, entry: "$413.00", stop: "$408.50", riskReward: "1:1.8" },
];
