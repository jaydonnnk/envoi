"use client";

import {
  CellStyleModule,
  ClientSideRowModelModule,
  ModuleRegistry,
  RowAutoHeightModule,
  SelectEditorModule,
  TextEditorModule,
  ValidationModule,
  themeQuartz,
  type CellKeyDownEvent,
  type ColDef,
  type ICellRendererParams,
  type ValueFormatterParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import type { MenuItemDraft } from "@/domain/menu/types";

// The menu draft table (S24; Gate 3 grid rules): AG Grid Community, client-side display and editing
// only. It edits name, portion, price and availability in the editor's state; save and confirm still
// go through the existing draft routes, and every menu rule stays on the server. Keyboard: arrows
// move between cells, Enter or typing edits, Enter or Escape ends the edit, Tab leaves the table;
// on a Remove cell, Enter removes the row.

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  TextEditorModule,
  SelectEditorModule,
  CellStyleModule,
  RowAutoHeightModule,
  ...(process.env.NODE_ENV === "production" ? [] : [ValidationModule]),
]);

export type GridRow = {
  key: string;
  id?: string;
  name: string;
  portion: string;
  price: string;
  availability: MenuItemDraft["availability"];
  // Why a blank price is blank, in words, when an import said so.
  blankReason?: string;
  // Where an unedited import suggestion came from, in words.
  origin?: string;
  priceInvalid: boolean;
  priceMissing: boolean;
  flagged: boolean;
};

const AVAILABILITY_WORDS: Record<GridRow["availability"], string> = { unknown: "Choose", available: "Yes", unavailable: "No" };
const AVAILABILITY_BY_WORD = Object.fromEntries(Object.entries(AVAILABILITY_WORDS).map(([value, word]) => [word, value])) as Record<string, GridRow["availability"]>;

// The note column says what a row still needs, in the order the merchant fixes it.
export function noteOf(row: GridRow): string {
  if (row.name.trim() === "") return "Name needed";
  if (row.priceInvalid) return "Use a price like 4.50";
  if (row.priceMissing) return row.blankReason ?? "Price needed";
  if (row.availability === "unknown") return "Choose Yes or No under Available";
  return row.origin ?? "";
}

// Envoi's palette from globals.css, so the table reads as part of the page.
const theme = themeQuartz.withParams({
  accentColor: "#145deb",
  foregroundColor: "#14293d",
  borderColor: "#c9d7e6",
  headerBackgroundColor: "#f1f6fc",
  fontFamily: "inherit",
  fontSize: 15,
  rowHeight: 48,
  headerHeight: 44,
  wrapperBorderRadius: 10,
  cellHorizontalPadding: 10,
});

function RemoveCell(params: ICellRendererParams<GridRow> & { onRemove: (key: string) => void }) {
  const row = params.data;
  if (!row) return null;
  // The portion is part of the name, so two variants of one item never share a button name.
  const label = [row.name.trim() || "this item", row.portion.trim()].filter(Boolean).join(", ");
  return (
    <button className="grid-remove" type="button" tabIndex={-1} onClick={() => params.onRemove(row.key)} aria-label={`Remove ${label}`}>
      Remove
    </button>
  );
}

export function MenuGrid({
  rows,
  onEdit,
  onRemove,
}: {
  rows: GridRow[];
  onEdit: (key: string, patch: Partial<Pick<GridRow, "name" | "portion" | "price" | "availability">>) => void;
  onRemove: (key: string) => void;
}) {
  const columns: ColDef<GridRow>[] = [
    { field: "name", headerName: "Item", editable: true, minWidth: 160, flex: 2, cellEditorParams: { maxLength: 120 }, cellClassRules: { "cell-needs": (p) => (p.value ?? "").trim() === "" } },
    { field: "portion", headerName: "Portion", editable: true, minWidth: 110, flex: 1, cellEditorParams: { maxLength: 120 } },
    {
      field: "price",
      headerName: "Price (S$)",
      editable: true,
      minWidth: 104,
      flex: 1,
      cellClassRules: { "cell-needs": (p) => p.data?.priceInvalid === true || p.data?.priceMissing === true },
      valueFormatter: (p: ValueFormatterParams<GridRow, string>) => (p.value === "" ? "Fill in" : (p.value ?? "")),
    },
    {
      field: "availability",
      headerName: "Available",
      editable: true,
      minWidth: 112,
      flex: 1,
      cellEditor: "agSelectCellEditor",
      cellEditorParams: { values: ["Choose", "Yes", "No"] },
      valueGetter: (p) => (p.data ? AVAILABILITY_WORDS[p.data.availability] : ""),
      valueSetter: (p) => {
        const value = AVAILABILITY_BY_WORD[String(p.newValue)];
        if (!value || !p.data) return false;
        p.data.availability = value;
        return true;
      },
      cellClassRules: { "cell-needs": (p) => p.data?.availability === "unknown" },
    },
    { colId: "note", headerName: "Note", minWidth: 200, flex: 2, wrapText: true, autoHeight: true, valueGetter: (p) => (p.data ? noteOf(p.data) : ""), cellClass: "cell-note" },
    { colId: "remove", headerName: "", minWidth: 104, width: 104, sortable: false, cellClass: "cell-remove", cellRenderer: RemoveCell, cellRendererParams: { onRemove } },
  ];

  if (rows.length === 0) return <p className="muted">No items yet.</p>;
  return (
    <div className="menu-grid" role="region" aria-label="Menu items">
      <p className="fine grid-swipe">Swipe the table sideways to see availability and notes.</p>
      <AgGridReact<GridRow>
        theme={theme}
        rowData={rows}
        columnDefs={columns}
        getRowId={(p) => p.data.key}
        domLayout="autoHeight"
        singleClickEdit
        stopEditingWhenCellsLoseFocus
        // Tab leaves the table instead of walking every cell; the arrow keys move between cells.
        tabToNextCell={() => false}
        suppressMovableColumns
        // Six columns only: rendering them all keeps every row's height right while the note wraps.
        suppressColumnVirtualisation
        defaultColDef={{ sortable: false, resizable: true, suppressHeaderMenuButton: true }}
        rowClassRules={{ "row-flagged": (p) => p.data?.flagged === true }}
        onCellValueChanged={(event) => {
          if (!event.data || !event.colDef.field) return;
          const field = event.colDef.field as "name" | "portion" | "price" | "availability";
          onEdit(event.data.key, { [field]: field === "availability" ? event.data.availability : String(event.newValue ?? "") });
        }}
        onCellKeyDown={(event: CellKeyDownEvent<GridRow>) => {
          const key = (event.event as KeyboardEvent | null)?.key;
          if (event.column.getColId() === "remove" && key === "Enter" && event.data) onRemove(event.data.key);
        }}
      />
    </div>
  );
}
