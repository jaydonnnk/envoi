"use client";

import {
  CellStyleModule,
  ClientSideRowModelModule,
  ModuleRegistry,
  RowAutoHeightModule,
  RowStyleModule,
  TextFilterModule,
  ValidationModule,
  themeQuartz,
  PinnedRowModule,
  type CellKeyDownEvent,
  type ColDef,
  type ICellRendererParams,
  type IRowNode,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useEffect, useMemo, useRef } from "react";
import type { OrderSort } from "@/domain/purchases/order-filter";
import type { MerchantOrder } from "@/domain/purchases/orders";
import type { SalesSummary } from "@/domain/purchases/sales-summary";
import { formatMoney, money } from "@/lib/money";
import { countryText, feeText, netMinor, netText, orderStatus, orderTotal, paidVia, paymentChips, refundCopy } from "./order-copy";

// The merchant's orders table (S35; Gate 3 file map): AG Grid Community, sorting and column filters in
// the browser only. It displays rows and edits nothing. Every word in the Payment column comes from
// orderStatus, so a row reads Paid only when the server's state is paid. Keyboard: arrows move between
// cells, Enter opens the order's record, and Enter on an Acknowledge cell acknowledges it.
// S46: PayPal's fee, the net and the PayPal account's country per order, and one pinned totals row
// per currency taken from the server's summary, never added up from the loaded rows.

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  TextFilterModule,
  CellStyleModule,
  RowAutoHeightModule,
  RowStyleModule,
  PinnedRowModule,
  ...(process.env.NODE_ENV === "production" ? [] : [ValidationModule]),
]);

const theme = themeQuartz.withParams({
  accentColor: "#145deb",
  foregroundColor: "#14293d",
  borderColor: "#c9d7e6",
  headerBackgroundColor: "#f1f6fc",
  fontFamily: "inherit",
  fontSize: 15,
});

const DAY_AND_MONTH = new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" });
const CLOCK = new Intl.DateTimeFormat("en-SG", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Singapore" });

// "4 Nov 10:12", Singapore time.
export function orderTime(createdAt: string): string {
  const at = new Date(createdAt);
  return `${DAY_AND_MONTH.format(at)} ${CLOCK.format(at)}`;
}

const itemsOf = (order: MerchantOrder): string => order.lines.map((line) => `${line.quantity} × ${line.name}`).join(", ");
// Sorted by amount, shown and filtered as money.
const totalKey = (order: MerchantOrder): number => (order.state === "paid" ? (order.payment?.captureGrossMinor ?? order.totalMinor) : order.totalMinor);

// The pinned row: the server's totals of paid orders in one currency.
export type TotalsRow = { kind: "totals"; summary: SalesSummary };
type GridRow = MerchantOrder | TotalsRow;
const isTotals = (row: GridRow | undefined): row is TotalsRow => row !== undefined && "kind" in row && row.kind === "totals";
const orderOf = (row: GridRow | undefined): MerchantOrder | null => (row && !isTotals(row) ? row : null);

export const TOTALS_LABEL = "Totals, paid only";
const known = (summary: SalesSummary, minor: number) => `${formatMoney(money(summary.currency, minor))} known`;

// Text for the totals row's cell in each column; empty where a total means nothing.
export function totalsCell(summary: SalesSummary, colId: string): string {
  if (colId === "time") return TOTALS_LABEL;
  if (colId === "total") return formatMoney(money(summary.currency, summary.paidMinor));
  if (colId === "fee") return known(summary, summary.knownFeeMinor);
  if (colId === "net") return known(summary, summary.knownNetMinor);
  if (colId === "payment") return `${summary.paidCount} paid`;
  return "";
}

// Unknown fees and nets sort after every known one, whichever way the column is sorted.
function byMinor(pick: (order: MerchantOrder) => number | null) {
  return (_a: unknown, _b: unknown, nodeA: IRowNode<GridRow>, nodeB: IRowNode<GridRow>, descending: boolean): number => {
    const a = orderOf(nodeA.data);
    const b = orderOf(nodeB.data);
    const left = a ? pick(a) : null;
    const right = b ? pick(b) : null;
    if (left === null && right === null) return 0;
    if (left === null) return descending ? -1 : 1;
    if (right === null) return descending ? 1 : -1;
    return left - right;
  };
}

// Each column's value is its display text, so a cell re-renders whenever its words change.
const shown = (colId: string, text: (order: MerchantOrder) => string) => (p: { data?: GridRow }) =>
  isTotals(p.data) ? totalsCell(p.data.summary, colId) : p.data ? text(p.data) : "";

function PaymentCell({ data: row }: ICellRendererParams<GridRow>) {
  if (isTotals(row)) return <strong>{totalsCell(row.summary, "payment")}</strong>;
  const data = orderOf(row);
  if (!data) return null;
  const status = orderStatus(data);
  return (
    <span className="chips">
      <span className={`chip${status.tone === "plain" ? "" : ` ${status.tone}`}`}>{status.chip}</span>
      {data.pyusd && data.pyusd.extraTransfers.length > 0 && <span className="chip warn">Extra transfer</span>}
      {data.refund && <span className={`chip${refundCopy(data.refund).tone === "plain" ? "" : " warn"}`}>{refundCopy(data.refund).chip}</span>}
    </span>
  );
}

type AcknowledgeProps = { busyId: string | null; onAcknowledge: (order: MerchantOrder) => void };

function AcknowledgedCell({ data: row, busyId, onAcknowledge }: ICellRendererParams<GridRow> & AcknowledgeProps) {
  const data = orderOf(row);
  if (!data) return null;
  if (data.acknowledgedAt) return <>Yes</>;
  if (!data.canAcknowledge) return <span className="muted">No</span>;
  return (
    <button className="grid-remove" type="button" tabIndex={-1} disabled={busyId === data.id} onClick={() => onAcknowledge(data)}>
      {busyId === data.id ? "Acknowledging" : "Acknowledge"}
    </button>
  );
}

export function OrdersGrid({
  orders,
  totals,
  sort,
  selectedId,
  busyId,
  onSelect,
  onAcknowledge,
}: {
  orders: readonly MerchantOrder[];
  totals: readonly SalesSummary[];
  sort: OrderSort | null;
  selectedId: string | null;
  busyId: string | null;
  onSelect: (order: MerchantOrder) => void;
  onAcknowledge: (order: MerchantOrder) => void;
}) {
  const columns = useMemo<ColDef<GridRow>[]>(
    () => [
      {
        colId: "time",
        headerName: "Time",
        valueGetter: (p) => (isTotals(p.data) ? TOTALS_LABEL : orderOf(p.data)?.createdAt),
        valueFormatter: (p) => (isTotals(p.data) ? TOTALS_LABEL : orderTime(p.value as string)),
        filterValueGetter: (p) => (orderOf(p.data) ? orderTime(orderOf(p.data)!.createdAt) : ""),
        sort: "desc",
        minWidth: 120,
        width: 120,
      },
      { colId: "items", headerName: "Items", valueGetter: shown("items", itemsOf), minWidth: 170, flex: 2, wrapText: true, autoHeight: true, cellClass: "cell-wrapped" },
      {
        colId: "total",
        headerName: "Total",
        valueGetter: (p) => (isTotals(p.data) ? p.data.summary.paidMinor : orderOf(p.data) ? totalKey(orderOf(p.data)!) : 0),
        valueFormatter: (p) => (isTotals(p.data) ? totalsCell(p.data.summary, "total") : orderOf(p.data) ? orderTotal(orderOf(p.data)!) : ""),
        filterValueGetter: (p) => (orderOf(p.data) ? orderTotal(orderOf(p.data)!) : ""),
        minWidth: 90,
        width: 90,
        cellClass: ["cell-middle", "money"],
      },
      { colId: "fee", headerName: "PayPal fee", valueGetter: shown("fee", feeText), comparator: byMinor((order) => (order.state === "paid" && order.rail !== "pyusd" ? (order.payment?.captureFeeMinor ?? null) : null)), minWidth: 120, width: 120, cellClass: ["cell-middle", "money"] },
      { colId: "net", headerName: "Net", valueGetter: shown("net", netText), comparator: byMinor(netMinor), minWidth: 120, width: 120, cellClass: ["cell-middle", "money"] },
      { colId: "country", headerName: "PayPal account from", valueGetter: shown("country", countryText), minWidth: 150, flex: 1 },
      { colId: "payment", headerName: "Payment", valueGetter: shown("payment", paymentChips), cellRenderer: PaymentCell, minWidth: 150, flex: 1 },
      { colId: "paidVia", headerName: "Paid via", valueGetter: shown("paidVia", paidVia), minWidth: 130, flex: 1 },
      {
        colId: "acknowledged",
        headerName: "Acknowledged",
        valueGetter: (p) => (isTotals(p.data) ? "" : orderOf(p.data)?.acknowledgedAt ? "Yes" : "No"),
        cellRenderer: AcknowledgedCell,
        cellRendererParams: { busyId, onAcknowledge } satisfies AcknowledgeProps,
        minWidth: 170,
        width: 170,
      },
    ],
    [busyId, onAcknowledge],
  );

  // The sort "ask your orders" chose, applied with Community's column state; none keeps the newest first.
  const grid = useRef<AgGridReact<GridRow>>(null);
  useEffect(() => {
    grid.current?.api?.applyColumnState({ state: [{ colId: sort?.column ?? "time", sort: sort?.direction ?? "desc" }], defaultState: { sort: null } });
  }, [sort]);
  const pinned = useMemo<TotalsRow[]>(() => totals.map((summary) => ({ kind: "totals", summary })), [totals]);

  return (
    <div className="orders-grid">
      <p className="fine grid-swipe">Swipe the table sideways to see every column.</p>
      <AgGridReact<GridRow>
        ref={grid}
        theme={theme}
        rowData={orders as MerchantOrder[]}
        pinnedBottomRowData={pinned}
        columnDefs={columns}
        getRowId={(p) => (isTotals(p.data) ? `totals-${p.data.summary.currency}` : p.data.id)}
        domLayout="autoHeight"
        animateRows={false}
        suppressMovableColumns
        suppressColumnVirtualisation
        // Tab leaves the table instead of walking every cell; the arrow keys move between cells.
        tabToNextCell={() => false}
        defaultColDef={{ sortable: true, resizable: true, filter: "agTextColumnFilter", cellClass: "cell-middle" }}
        overlayNoRowsTemplate='<span class="muted">No orders match. Clear the filters to see all loaded orders.</span>'
        rowClassRules={{ "row-chosen": (p) => orderOf(p.data)?.id === selectedId, "row-totals": (p) => isTotals(p.data) }}
        onRowClicked={(event) => {
          // The Acknowledge button acts by itself and does not open the record.
          if ((event.event?.target as Element | null)?.closest("button")) return;
          const order = orderOf(event.data);
          if (order) onSelect(order);
        }}
        onCellKeyDown={(event: CellKeyDownEvent<GridRow>) => {
          const order = orderOf(event.data);
          if ((event.event as KeyboardEvent | null)?.key !== "Enter" || !order) return;
          if (event.column.getColId() === "acknowledged" && order.canAcknowledge && !order.acknowledgedAt) onAcknowledge(order);
          else onSelect(order);
        }}
      />
    </div>
  );
}
