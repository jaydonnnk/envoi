import { outletRails } from "@/domain/outlets/destination";
import { pyusdAvailability, type PyusdAvailability } from "@/domain/pyusd/identity";
import { isRateExpired, latestPyusdRate, type PyusdRate } from "@/domain/pyusd/rate";
import { webEnv } from "@/env";
import { webSolanaClient } from "@/integrations/solana/rpc";
import { eq } from "drizzle-orm";
import { outlets } from "@/lib/db/schema";
import { webDb } from "@/lib/db/web";
import { CURRENCY_BY_COUNTRY } from "@/lib/money";

// Whether a buyer can pay this outlet with PYUSD now, with the shop's current rate (S16). Server
// only: it reads the enable flag, the outlet's destination and rate, and, when those pass, the
// devnet identity through the shared RPC limiter. Callers render it inside Suspense, so an
// unreachable RPC never delays the rest of the page.
export async function outletPyusdAvailability(outletId: string): Promise<{ availability: PyusdAvailability; rate: PyusdRate | null }> {
  const db = webDb();
  const rails = await outletRails(db, outletId);
  const rate = await latestPyusdRate(db, outletId);
  const [outlet] = await db.select({ country: outlets.country }).from(outlets).where(eq(outlets.id, outletId)).limit(1);
  const availability = await pyusdAvailability(
    { currency: CURRENCY_BY_COUNTRY[outlet?.country ?? "SG"], enabled: webEnv().PYUSD_ENABLED, hasWallet: rails.pyusd, rate: rate ? { expired: isRateExpired(rate, new Date()) } : null },
    webSolanaClient,
  );
  return { availability, rate };
}
