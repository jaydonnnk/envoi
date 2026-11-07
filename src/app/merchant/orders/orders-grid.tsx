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
  type CellKeyDownEvent,
  type ColDef,
  type ICellRendererParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo } from "react";
import type { MerchantOrder } from "@/domain/purchases/orders";
import { orderStatus, orderTotal, paidVia, refundCopy } from "./order-copy";

// The merchant's orders table (S35; Gate 3 file map): AG Grid Community, sorting and column filters in
// the browser only. It displays rows and edits nothing. Every word in the Payment column comes from
// orderStatus, so a row reads Paid only when the server's state is paid. Keyboard: arrows move between
// cells, Enter opens the order's record, and Enter on an Acknowledge cell acknowledges it.

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  TextFilterModule,
  CellStyleModule,
  RowAutoHeightModule,
  RowStyleModule,
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

function PaymentCell({ data }: ICellRendererParams<MerchantOrder>) {
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

function AcknowledgedCell({ data, busyId, onAcknowledge }: ICellRendererParams<MerchantOrder> & AcknowledgeProps) {
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
  selectedId,
  busyId,
  onSelect,
  onAcknowledge,
}: {
  orders: readonly MerchantOrder[];
  selectedId: string | null;
  busyId: string | null;
  onSelect: (order: MerchantOrder) => void;
  onAcknowledge: (order: MerchantOrder) => void;
}) {
  const columns = useMemo<ColDef<MerchantOrder>[]>(
    () => [
      { colId: "time", headerName: "Time", valueGetter: (p) => p.data?.createdAt, valueFormatter: (p) => orderTime(p.value as string), filterValueGetter: (p) => (p.data ? orderTime(p.data.createdAt) : ""), sort: "desc", minWidth: 120, width: 120 },
      { colId: "items", headerName: "Items", valueGetter: (p) => (p.data ? itemsOf(p.data) : ""), minWidth: 170, flex: 2, wrapText: true, autoHeight: true, cellClass: "cell-wrapped" },
      {
        colId: "total",
        headerName: "Total",
        valueGetter: (p) => (p.data ? totalKey(p.data) : 0),
        valueFormatter: (p) => (p.data ? orderTotal(p.data) : ""),
        filterValueGetter: (p) => (p.data ? orderTotal(p.data) : ""),
        minWidth: 90,
        width: 90,
        cellClass: ["cell-middle", "money"],
      },
      { colId: "payment", headerName: "Payment", valueGetter: (p) => (p.data ? orderStatus(p.data).chip : ""), cellRenderer: PaymentCell, minWidth: 150, flex: 1 },
      { colId: "paidVia", headerName: "Paid via", valueGetter: (p) => (p.data ? paidVia(p.data) : ""), minWidth: 130, flex: 1 },
      {
        colId: "acknowledged",
        headerName: "Acknowledged",
        valueGetter: (p) => (p.data?.acknowledgedAt ? "Yes" : "No"),
        cellRenderer: AcknowledgedCell,
        cellRendererParams: { busyId, onAcknowledge } satisfies AcknowledgeProps,
        minWidth: 170,
        width: 170,
      },
    ],
    [busyId, onAcknowledge],
  );

  return (
    <div className="orders-grid">
      <p className="fine grid-swipe">Swipe the table sideways to see every column.</p>
      <AgGridReact<MerchantOrder>
        theme={theme}
        rowData={orders as MerchantOrder[]}
        columnDefs={columns}
        getRowId={(p) => p.data.id}
        domLayout="autoHeight"
        animateRows={false}
        suppressMovableColumns
        suppressColumnVirtualisation
        // Tab leaves the table instead of walking every cell; the arrow keys move between cells.
        tabToNextCell={() => false}
        defaultColDef={{ sortable: true, resizable: true, filter: "agTextColumnFilter", cellClass: "cell-middle" }}
        overlayNoRowsTemplate='<span class="muted">No orders match. Clear the filters to see all loaded orders.</span>'
        rowClassRules={{ "row-chosen": (p) => p.data?.id === selectedId }}
        onRowClicked={(event) => {
          // The Acknowledge button acts by itself and does not open the record.
          if ((event.event?.target as Element | null)?.closest("button")) return;
          if (event.data) onSelect(event.data);
        }}
        onCellKeyDown={(event: CellKeyDownEvent<MerchantOrder>) => {
          if ((event.event as KeyboardEvent | null)?.key !== "Enter" || !event.data) return;
          if (event.column.getColId() === "acknowledged" && event.data.canAcknowledge && !event.data.acknowledgedAt) onAcknowledge(event.data);
          else onSelect(event.data);
        }}
      />
    </div>
  );
}
