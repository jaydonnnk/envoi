"use client";

import { useState } from "react";
import { isSingaporeArea, searchSingaporeAreas, singaporeAreaSource } from "@/domain/outlets/sg-areas";

export function AreaPicker({ id, savedArea }: { id: string; savedArea?: string }) {
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState(savedArea ?? "");
  const matches = searchSingaporeAreas(query);
  const selectedOutsideResults = (selection !== "" || savedArea === "") && !matches.some(({ label }) => label === selection);
  const source = singaporeAreaSource;

  return (
    <>
      <label htmlFor={`${id}-search`}>Search Singapore areas</label>
      <input
        id={`${id}-search`}
        type="search"
        placeholder="For example Bedok"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) event.preventDefault();
        }}
      />
      <label htmlFor={id}>Area</label>
      <select id={id} name="area" required={savedArea !== ""} value={selection} onChange={(event) => setSelection(event.target.value)} aria-describedby={`${id}-matches`}>
        {savedArea === undefined && <option value="" disabled>Choose an area</option>}
        {selectedOutsideResults && (
          <option value={selection}>{isSingaporeArea(selection) ? selection : `${selection || "Blank"} (saved area)`}</option>
        )}
        {matches.map(({ label }) => <option key={label} value={label}>{label}</option>)}
      </select>
      <small id={`${id}-matches`} role="status">
        {matches.length === 0 ? (selection || savedArea === "" ? "No other areas match. Your selection is kept." : "No areas match. Try a different search.") : null}
      </small>
      <small className="field-hint area-attribution">
        Contains information from <a href={source.url}>{source.dataset}</a> by {source.agency}, accessed 9 November 2026, under the <a href={source.licence}>Singapore Open Data Licence</a>.
      </small>
    </>
  );
}
