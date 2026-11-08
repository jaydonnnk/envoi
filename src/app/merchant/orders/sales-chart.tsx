"use client";

import { BarSeriesModule, CategoryAxisModule, LegendModule, ModuleRegistry as ChartModules, NumberAxisModule, type AgCartesianChartOptions } from "ag-charts-community";
import { AgCharts } from "ag-charts-react";
import { ClientSideRowModelModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo } from "react";
import type { RailTotal, SalesSummary } from "@/domain/purchases/sales-summary";
import { formatMoney, money, type Currency } from "@/lib/money";
import { methodRows, type MethodRow } from "./order-copy";

// The sales desk's second grid and chart (S46; Gate 3 file map): sales by payment method, read only
// from the server's summary. AG Grid and AG Charts Community; nothing here is added up in the browser.

ModuleRegistry.registerModules([ClientSideRowModelModule]);
ChartModules.registerModules([BarSeriesModule, CategoryAxisModule, NumberAxisModule, LegendModule]);

const theme = themeQuartz.withParams({ accentColor: "#145deb", foregroundColor: "#14293d", borderColor: "#c9d7e6", headerBackgroundColor: "#f1f6fc", fontFamily: "inherit", fontSize: 15 });

const columns: ColDef<MethodRow>[] = [
  { colId: "method", headerName: "Method", field: "method", flex: 2, minWidth: 160 },
  { colId: "paid", headerName: "Paid", field: "paid", flex: 1, minWidth: 100, cellClass: "money" },
  { colId: "fees", headerName: "Fees", field: "fees", flex: 1, minWidth: 130, cellClass: "money" },
];

// Bars in the currency's major unit, as the axis reads them. Only known fees are drawn.
function chartOptions(currency: Currency, byRail: readonly RailTotal[]): AgCartesianChartOptions {
  const data = byRail.map((total) => ({
    method: total.rail === "paypal" ? "PayPal" : "PYUSD (devnet)",
    paid: total.paidMinor / 100,
    fee: total.rail === "paypal" ? total.knownFeeMinor / 100 : 0,
  }));
  return {
    data,
    height: 240,
    background: { visible: false },
    series: [
      { type: "bar", xKey: "method", yKey: "paid", yName: `Paid (${currency})`, fill: "#145deb" },
      { type: "bar", xKey: "method", yKey: "fee", yName: `Known PayPal fees (${currency})`, fill: "#90500c" },
    ],
    axes: { x: { type: "category", position: "bottom" }, y: { type: "number", position: "left", label: { formatter: ({ value }) => formatMoney(money(currency, Math.round(Number(value) * 100))) } } },
    legend: { position: "bottom" },
  };
}

export function SalesByMethod({ summaries }: { summaries: readonly SalesSummary[] }) {
  const rows = useMemo(() => summaries.flatMap(methodRows), [summaries]);
  if (summaries.length === 0) return null;
  return (
    <div className="card orders-card">
      <h3>By payment method</h3>
      <div className="orders-grid">
        <AgGridReact<MethodRow> theme={theme} rowData={rows} columnDefs={columns} getRowId={(p) => p.data.id} domLayout="autoHeight" suppressMovableColumns defaultColDef={{ sortable: false, resizable: true }} />
      </div>
      {summaries.map((summary) => (
        <figure className="sales-chart" key={summary.currency} aria-label={`Paid and known PayPal fees by payment method, ${summary.currency}`}>
          <AgCharts options={chartOptions(summary.currency, summary.byRail)} />
        </figure>
      ))}
      <p className="muted fine">The chart shows the same figures as the table. Sandbox test money and devnet test tokens.</p>
    </div>
  );
}
