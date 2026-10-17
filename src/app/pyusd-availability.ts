import { outletRails } from "@/domain/outlets/destination";
import { pyusdAvailability, type PyusdAvailability } from "@/domain/pyusd/identity";
import { isRateExpired, latestPyusdRate, type PyusdRate } from "@/domain/pyusd/rate";
import { webEnv } from "@/env";
import { webSolanaClient } from "@/integrations/solana/rpc";
import { webDb } from "@/lib/db/web";

// Whether a buyer can pay this outlet with PYUSD now, with the shop's current rate (S16). Server
// only: it reads the enable flag, the outlet's destination and rate, and, when those pass, the
// devnet identity through the shared RPC limiter. Callers render it inside Suspense, so an
// unreachable RPC never delays the rest of the page.
export async function outletPyusdAvailability(outletId: string): Promise<{ availability: PyusdAvailability; rate: PyusdRate | null }> {
  const db = webDb();
  const rails = await outletRails(db, outletId);
  const rate = await latestPyusdRate(db, outletId);
  const availability = await pyusdAvailability(
    { enabled: webEnv().PYUSD_ENABLED, hasWallet: rails.pyusd, rate: rate ? { expired: isRateExpired(rate, new Date()) } : null },
    webSolanaClient,
  );
  return { availability, rate };
}
