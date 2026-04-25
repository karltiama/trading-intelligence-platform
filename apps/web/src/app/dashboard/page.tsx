import type { Metadata } from "next";

import { ChartCard } from "@/components/dashboard/chart-card";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { InsightsPanel } from "@/components/dashboard/insights-panel";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { TodaysSetups } from "@/components/dashboard/todays-setups";
import { WatchlistTable } from "@/components/dashboard/watchlist-table";

export const metadata: Metadata = {
  title: "Dashboard · TradeIQ",
  description: "Phase 1 paper-trading dashboard for TradeIQ.",
};

export default function DashboardPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <DashboardHeader />

      <div className="flex flex-col gap-6 p-4 md:p-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Snapshot of your paper account, watchlist, and active setups.
          </p>
        </div>

        <KpiCards />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartCard />
          </div>
          <InsightsPanel />
        </div>

        <WatchlistTable />

        <TodaysSetups />
      </div>
    </div>
  );
}
