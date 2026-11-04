"use client";

import type { Currency } from "@/lib/money";
import {
  CellStyleModule,
  ClientSideRowModelModule,
  ModuleRegistry,
  RowApiModule,
  RowAutoHeightModule,
  RowStyleModule,
  ScrollApiModule,
  SelectEditorModule,
  TextEditorModule,
  ValidationModule,
  themeQuartz,
  type CellFocusedEvent,
  type CellKeyDownEvent,
  type ColDef,
  type ICellRendererParams,
  type ValueFormatterParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useEffect, useRef, useState } from "react";
import type { MenuItemDraft } from "@/domain/menu/types";

// The menu draft table (S24; Gate 3 grid rules): AG Grid Community, client-side display and editing
// only. It edits name, portion, price and availability in the editor's state; save and confirm still
// go through the existing draft routes, and every menu rule stays on the server. Keyboard: arrows
// move between cells, Enter or typing edits, Enter or Escape ends the edit, Tab leaves the table;
// on a Remove cell, Enter removes the row. Review aids (S30): Needs review filters to the rows that
// still need the merchant, Next problem moves focus to each in turn, and Shift+Tab returns to it.

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  TextEditorModule,
  SelectEditorModule,
  CellStyleModule,
  RowApiModule,
  RowAutoHeightModule,
  RowStyleModule,
  ScrollApiModule,
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
  // The page's own words for this row, in memory only until a reload (S30).
  excerpt?: string;
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

export type ReviewFilter = "needs" | "all";

// A row still needs the merchant while any of these holds; the note column says which.
export function needsMerchant(row: GridRow): boolean {
  return row.name.trim() === "" || row.priceInvalid || row.priceMissing || row.availability === "unknown";
}

// The cell Next problem lands on: the first thing the row needs, in the note column's order.
function problemColumn(row: GridRow): "name" | "price" | "availability" {
  if (row.name.trim() === "") return "name";
  return row.priceInvalid || row.priceMissing ? "price" : "availability";
}

// A row the merchant just fixed stays in view until they move on, so their focus is not pulled away.
export function visibleRows(rows: readonly GridRow[], filter: ReviewFilter, keptKey: string | null): GridRow[] {
  return filter === "all" ? [...rows] : rows.filter((row) => needsMerchant(row) || row.key === keptKey);
}

// The next row after afterKey that needs the merchant, wrapping round; null when none does.
export function nextProblem(rows: readonly GridRow[], afterKey: string | null): { key: string; column: "name" | "price" | "availability" } | null {
  const start = rows.findIndex((row) => row.key === afterKey);
  for (let step = 1; step <= rows.length; step += 1) {
    const row = rows[(start + step + rows.length) % rows.length]!;
    if (needsMerchant(row)) return { key: row.key, column: problemColumn(row) };
  }
  return null;
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
  currency,
  rows,
  filter,
  onFilter,
  onEdit,
  onRemove,
}: {
  currency: Currency;
  rows: GridRow[];
  filter: ReviewFilter;
  onFilter: (filter: ReviewFilter) => void;
  onEdit: (key: string, patch: Partial<Pick<GridRow, "name" | "portion" | "price" | "availability">>) => void;
  onRemove: (key: string) => void;
}) {
  const gridRef = useRef<AgGridReact<GridRow>>(null);
  // The last row focus reached, so Next problem carries on from there.
  const reached = useRef<string | null>(null);
  const [keptKey, setKeptKey] = useState<string | null>(null);
  const [target, setTarget] = useState<NonNullable<ReturnType<typeof nextProblem>> | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // Runs after the filtered rows reach the grid, so the row index belongs to the rows on screen.
  useEffect(() => {
    if (!target) return;
    const api = gridRef.current?.api;
    const rowIndex = api?.getRowNode(target.key)?.rowIndex;
    if (!api || rowIndex === null || rowIndex === undefined) return;
    api.ensureColumnVisible(target.column);
    api.setFocusedCell(rowIndex, target.column);
    setTarget(null);
  }, [target]);

  function chooseFilter(next: ReviewFilter) {
    setKeptKey(null);
    setAnnouncement("");
    onFilter(next);
  }

  function goToNextProblem() {
    const next = nextProblem(rows, reached.current);
    setAnnouncement(next ? "" : "No row needs you right now. Check every row under All rows, then save and confirm.");
    if (!next) return;
    setKeptKey(null);
    setTarget(next);
  }

  const hasExcerpts = rows.some((row) => row.excerpt !== undefined);
  const needing = rows.filter(needsMerchant).length;
  const shown = visibleRows(rows, filter, keptKey);
  // Seven columns need tighter minimums to fit the desktop card without a sideways scroll.
  const min = hasExcerpts ? { name: 124, portion: 96, price: 100, availability: 104, note: 170, remove: 96 } : { name: 160, portion: 110, price: 104, availability: 112, note: 200, remove: 104 };
  const columns: ColDef<GridRow>[] = [
    { field: "name", headerName: "Item", editable: true, minWidth: min.name, flex: 2, cellEditorParams: { maxLength: 120 }, cellClassRules: { "cell-needs": (p) => (p.value ?? "").trim() === "" } },
    { field: "portion", headerName: "Portion", editable: true, minWidth: min.portion, flex: 1, cellEditorParams: { maxLength: 120 } },
    {
      field: "price",
      headerName: `Price (${currency === "USD" ? "US$" : "S$"})`,
      editable: true,
      minWidth: min.price,
      flex: 1,
      cellClassRules: { "cell-needs": (p) => p.data?.priceInvalid === true || p.data?.priceMissing === true },
      valueFormatter: (p: ValueFormatterParams<GridRow, string>) => (p.value === "" ? "Fill in" : (p.value ?? "")),
    },
    {
      field: "availability",
      headerName: "Available",
      editable: true,
      minWidth: min.availability,
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
    ...(hasExcerpts
      ? [{ colId: "excerpt", headerName: "From your page", minWidth: 170, flex: 2, wrapText: true, autoHeight: true, valueGetter: (p) => (p.data?.excerpt ? `"${p.data.excerpt}"` : ""), cellClass: "cell-excerpt" } satisfies ColDef<GridRow>]
      : []),
    { colId: "note", headerName: "Note", minWidth: min.note, flex: 2, wrapText: true, autoHeight: true, valueGetter: (p) => (p.data ? noteOf(p.data) : ""), cellClass: "cell-note" },
    { colId: "remove", headerName: "", minWidth: min.remove, width: min.remove, sortable: false, cellClass: "cell-remove", cellRenderer: RemoveCell, cellRendererParams: { onRemove } },
  ];

  if (rows.length === 0) return <p className="muted">No items yet.</p>;
  return (
    <div className="menu-grid" role="region" aria-label="Menu items">
      <div className="actions grid-review" role="group" aria-label="Review the draft">
        <button className={`button ${filter === "needs" ? "" : "secondary"}`} type="button" aria-pressed={filter === "needs"} onClick={() => chooseFilter("needs")}>
          Needs review ({needing})
        </button>
        <button className={`button ${filter === "all" ? "" : "secondary"}`} type="button" aria-pressed={filter === "all"} onClick={() => chooseFilter("all")}>
          All rows ({rows.length})
        </button>
        <button className="button secondary" type="button" onClick={goToNextProblem}>
          Next problem ↓
        </button>
      </div>
      <p className="fine grid-announce" aria-live="polite">
        {announcement}
      </p>
      {shown.length === 0 ? (
        <p className="muted">No row needs you right now. Check every row under All rows, then save and confirm.</p>
      ) : (
        <>
          <p className="fine grid-swipe">Swipe the table sideways to see availability{hasExcerpts ? ", your page's words" : ""} and notes.</p>
          <AgGridReact<GridRow>
            ref={gridRef}
            theme={theme}
            rowData={shown}
            columnDefs={columns}
            getRowId={(p) => p.data.key}
            domLayout="autoHeight"
            singleClickEdit
            stopEditingWhenCellsLoseFocus
            // Tab leaves the table instead of walking every cell; the arrow keys move between cells.
            tabToNextCell={() => false}
            suppressMovableColumns
            // A handful of columns only: rendering them all keeps every row's height right while the note wraps.
            suppressColumnVirtualisation
            defaultColDef={{ sortable: false, resizable: true, suppressHeaderMenuButton: true }}
            rowClassRules={{ "row-flagged": (p) => p.data?.flagged === true }}
            onCellFocused={(event: CellFocusedEvent<GridRow>) => {
              if (typeof event.rowIndex === "number") reached.current = event.api.getDisplayedRowAtIndex(event.rowIndex)?.data?.key ?? reached.current;
            }}
            onCellValueChanged={(event) => {
              if (!event.data || !event.colDef.field) return;
              const field = event.colDef.field as "name" | "portion" | "price" | "availability";
              setKeptKey(event.data.key);
              onEdit(event.data.key, { [field]: field === "availability" ? event.data.availability : String(event.newValue ?? "") });
            }}
            onCellKeyDown={(event: CellKeyDownEvent<GridRow>) => {
              const key = (event.event as KeyboardEvent | null)?.key;
              if (event.column.getColId() === "remove" && key === "Enter" && event.data) onRemove(event.data.key);
            }}
          />
          {hasExcerpts && <p className="fine">The excerpt is the text Envoi found on your page for that row. Check that the price belongs to the right item: a number on the page does not prove which dish it is for.</p>}
        </>
      )}
    </div>
  );
}
