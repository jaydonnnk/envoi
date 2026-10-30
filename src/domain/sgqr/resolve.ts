import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { PublishedOutletSummary } from "@/domain/outlets/search";
import { outletIdentifiers, outlets } from "@/lib/db/schema";
import type { Db } from "@/lib/db/web";
import { CURRENCY_BY_COUNTRY } from "@/lib/money";
import type { SgqrDecode } from "./decode";
import { isMappable, mappableIdentifier } from "./validate";

// Buyer scan resolution (Gate 3 "SGQR", "Buyer scan"). A resolution is identity only: it names
// published outlets and what tells them apart, never a payee, destination, rail or enrollment, and
// resolving never writes. It lives apart from validate.ts so the merchant's browser bundle, which
// imports validate.ts, never pulls in the database schema.

// What a buyer needs to choose between outlets that share a business identifier, and nothing more.
export type OutletDistinguisher = PublishedOutletSummary & { distinguisher: string };

export type SgqrResolution =
  | { kind: "no_match" }
  | { kind: "single"; outlet: PublishedOutletSummary }
  | { kind: "ambiguous"; candidates: OutletDistinguisher[] }
  | { kind: "unsupported_payload"; unrecognizedCount: number };

// More outlets than this sharing one business identifier is not a shape any approved mapping has
// produced; the list stays bounded either way.
const MAX_CANDIDATES = 20;

export async function resolveSgqr(db: Db, decoded: SgqrDecode): Promise<SgqrResolution> {
  if (decoded.kind === "not_emvco") return { kind: "unsupported_payload", unrecognizedCount: 0 };
  // A checksum mismatch means the code may be damaged or misread, so an identifier read from it
  // could name another shop. Nothing is resolved from it: the buyer pastes again or searches.
  if (!decoded.checksumValid) return { kind: "unsupported_payload", unrecognizedCount: decoded.unrecognized.length };
  // Only business UENs identify a shop. A personal PayNow proxy never does, even when its value
  // looks like a UEN.
  const identifiers = [...new Set(decoded.recognized.map(mappableIdentifier).filter(isMappable).map((field) => field.identifier))];
  if (identifiers.length === 0) return { kind: "unsupported_payload", unrecognizedCount: decoded.unrecognized.length };

  // Only an operator-approved mapping on an outlet that is published right now counts. Candidates
  // are ordered by name, never by any notion of distance. An SGQR sticker is a Singapore code, so a US
  // outlet is never a candidate (S27), whatever identifier it holds.
  const rows = await db
    .selectDistinctOn([outlets.name, outlets.id], {
      id: outlets.id,
      name: outlets.name,
      area: outlets.area,
      isDemoFixture: outlets.isDemoFixture,
      country: outlets.country,
      distinguisher: outletIdentifiers.distinguisher,
    })
    .from(outletIdentifiers)
    .innerJoin(outlets, eq(outlets.id, outletIdentifiers.outletId))
    .where(
      and(
        eq(outletIdentifiers.scheme, "paynow_uen"),
        inArray(outletIdentifiers.identifier, identifiers),
        isNotNull(outletIdentifiers.approvedAt),
        isNotNull(outlets.publishedMenuRevisionId),
        eq(outlets.country, "SG"),
      ),
    )
    .orderBy(asc(outlets.name), asc(outlets.id), asc(outletIdentifiers.distinguisher))
    .limit(MAX_CANDIDATES);

  const candidates = rows.map((row) => ({ ...row, currency: CURRENCY_BY_COUNTRY[row.country] }));
  const [first] = candidates;
  if (!first) return { kind: "no_match" };
  if (candidates.length === 1) return { kind: "single", outlet: { id: first.id, name: first.name, area: first.area, isDemoFixture: first.isDemoFixture, country: first.country, currency: first.currency } };
  return { kind: "ambiguous", candidates };
}
