"use client";

import { useState } from "react";
import type { Country } from "@/lib/money";
import { AreaPicker } from "./area-picker";

export function ShopLocation({ prefix, saved }: { prefix: string; saved?: { country: Country; area: string } }) {
  const [newCountry, setNewCountry] = useState<Country>("SG");
  const country = saved?.country ?? newCountry;
  const areaId = `${prefix}-area`;

  return (
    <>
      {!saved && (
        <>
          <label htmlFor={`${prefix}-country`}>Country</label>
          <select id={`${prefix}-country`} name="country" value={newCountry} onChange={(event) => setNewCountry(event.target.value === "US" ? "US" : "SG")}>
            <option value="SG">Singapore</option>
            <option value="US">United States</option>
          </select>
        </>
      )}
      {country === "SG" ? <AreaPicker id={areaId} savedArea={saved?.area} /> : (
        <>
          <label htmlFor={areaId}>Area</label>
          <input id={areaId} name="area" defaultValue={saved?.area} maxLength={80} placeholder="For example SoHo" required />
        </>
      )}
    </>
  );
}
