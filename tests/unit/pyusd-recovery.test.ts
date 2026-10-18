import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PyusdExtraTransfers, pyusdReceiptStatus } from "@/app/receipt/[purchaseId]/pyusd-receipt";
import { classifyScanCandidate } from "@/domain/pyusd/recovery";
import type { PyusdAttempt } from "@/domain/pyusd/state";
import { verifyPyusdTransfer } from "@/domain/pyusd/verify";
import { decodeLandedTransaction } from "@/integrations/solana/decode";
import { fixtureKey } from "../support/fake-solana";
import { fixtureSignature, landedTransactionJson } from "../support/pyusd";

// S17, Gate 3 standalone tests "a second reference landing is an extra transfer" and "PYUSD receipt
// shows a detected extra transfer". Every attempt, signature and landed transaction is a FIXTURE built
// with the same decoder the read client uses; none is a real devnet read.

const AMOUNT = 1_335_807n;
const BOUND_SIGNATURE = fixtureSignature(61);

const ATTEMPT: PyusdAttempt = {
  id: "att_fixture",
  purchaseId: "pur_fixture",
  state: "confirmed",
  buyerWallet: fixtureKey(1),
  sourceTokenAccount: fixtureKey(2),
  destinationTokenAccount: fixtureKey(3),
  atomicAmount: AMOUNT,
  rateVersionId: "rat_fixture",
  reference: "FXTRref7Jq2kVwH8ZpYbQm3s",
  messageFingerprint: "0".repeat(64),
  blockhash: fixtureKey(42),
  lastValidBlockHeight: 280_000_150n,
  preparationSlot: 300_000_000n,
  fee: { preparedEpoch: 700n, older: { epoch: 0n, basisPoints: 0, maximumFee: 0n }, newer: { epoch: 0n, basisPoints: 0, maximumFee: 0n } },
  hints: [],
  finalizedSignature: BOUND_SIGNATURE,
  mismatchSignature: null,
  scan: null,
};
const NOW = new Date("2026-10-27T03:00:00.000Z");
const ZERO_FEE = { epoch: 694n, basisPoints: 0, maximumFee: 0n };

function classify(signature: string, options: Parameters<typeof landedTransactionJson>[2] = {}) {
  const tx = decodeLandedTransaction(signature, landedTransactionJson(ATTEMPT, signature, options));
  if (!tx) throw new Error("FIXTURE transaction did not decode");
  return classifyScanCandidate(ATTEMPT, tx, verifyPyusdTransfer(tx, ATTEMPT, ZERO_FEE, NOW), NOW);
}

describe("PYUSD recovery standalone tests", () => {
  it("a second reference landing is an extra transfer", () => {
    const copy = fixtureSignature(62);
    expect(classify(copy)).toEqual({
      kind: "extra",
      transfer: { signature: copy, slot: 300_000_040n, destinationDelta: AMOUNT, verification: "verified", foundAt: NOW, refundReference: null },
    });
    const different = fixtureSignature(63);
    expect(classify(different, { amount: AMOUNT + 5n })).toEqual({
      kind: "extra",
      transfer: { signature: different, slot: 300_000_040n, destinationDelta: AMOUNT + 5n, verification: "amount_mismatch", foundAt: NOW, refundReference: null },
    });
    expect(classify(BOUND_SIGNATURE)).toEqual({ kind: "skip" });
  });

  it("PYUSD receipt shows a detected extra transfer", () => {
    const signature = fixtureSignature(64);
    const status = pyusdReceiptStatus("paid", "11:05");
    const extra = renderToStaticMarkup(PyusdExtraTransfers({ transfers: [{ signature, amount: "1.335807" }] }) ?? "");
    const copy = `${status.title} ${status.body} ${extra}`;
    expect(status.title).toBe("Paid");
    expect(extra).toContain("Extra transfer detected");
    expect(extra).toContain("An extra transfer of 1.335807 PYUSD carrying this purchase&#x27;s reference was detected on Solana devnet.");
    expect(extra).toContain("Any refund is arranged with the shop outside Envoi.");
    expect(extra).toContain(signature);
    expect(copy).not.toMatch(/refunded|will refund|refunds you|refund (was|has been) (issued|made|sent)/i);
  });
});
