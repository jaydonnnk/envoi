import { describe, expect, it } from "vitest";
import { PYUSD_DEVNET } from "@/domain/pyusd/constants";
import { checkPyusdIdentity } from "@/domain/pyusd/identity";
import { assessMintForTransfer, type DecodedMint, type MintExtension } from "@/domain/pyusd/mint";
import { formatPyusdPerSgd, parsePyusdPerSgd, pyusdAtomicFor } from "@/domain/pyusd/rate";
import { canTransitionPyusdAttempt } from "@/domain/pyusd/state";
import { computeCheckoutKey, type CheckoutKeyInput } from "@/domain/purchases/checkout-key";
import { webEnv } from "@/env";
import { sgdFromCents } from "@/lib/money";
import { createFakeChain, fakeSolanaClient, MAINNET_GENESIS, mintData, setMintOwnedByOriginalProgram } from "../support/fake-solana";
import { webEnvFor } from "../support/session";

// S16: Gate 3's pure PYUSD rules. Groups "PYUSD identity check" (3 cases, over a FIXTURE devnet RPC),
// "rate parsing, bounds and conversion" (4) and "mint eligibility for a transfer" (5), and the
// standalone tests "only two settings configure the PYUSD rail", "a changed PYUSD rate is a new
// checkout" and "a PYUSD mismatch can close only unpaid". No database.

describe("PYUSD identity check", () => {
  it("the fixture devnet passes (fixture self-check)", async () => {
    expect(await checkPyusdIdentity(fakeSolanaClient(createFakeChain()))).toEqual({ ok: true, epoch: 700n });
  });

  it("wrong genesis hash disables PYUSD", async () => {
    const chain = createFakeChain();
    chain.genesis = MAINNET_GENESIS;
    expect(await checkPyusdIdentity(fakeSolanaClient(chain))).toEqual({ ok: false, reason: "genesis_mismatch" });
  });

  it("mint under another token program disables PYUSD", async () => {
    const chain = createFakeChain();
    setMintOwnedByOriginalProgram(chain);
    expect(await checkPyusdIdentity(fakeSolanaClient(chain))).toEqual({ ok: false, reason: "mint_program_mismatch" });
  });

  it("mint with other decimals disables PYUSD", async () => {
    const chain = createFakeChain();
    chain.accounts.set(PYUSD_DEVNET.mint, { owner: PYUSD_DEVNET.tokenProgram, data: mintData({ decimals: 9 }) });
    expect(await checkPyusdIdentity(fakeSolanaClient(chain))).toEqual({ ok: false, reason: "mint_decimals_mismatch" });
  });
});

describe("rate parsing, bounds and conversion", () => {
  it("PYUSD amount rounds up to the next atomic unit", () => {
    // 350 cents at an illustrative 742,115 atomic units per S$1: 2,597,402.5 rounds up.
    expect(pyusdAtomicFor(sgdFromCents(350), 742_115n)).toBe(2_597_403n);
  });

  it("rate arithmetic is exact at its bounds", () => {
    // The largest amount pyusdAtomicFor accepts (a safe integer of cents, here the largest multiple of
    // 100, so the exact product is divisible by 100 and rounding cannot decide it) at the maximum rate.
    const cents = Number.MAX_SAFE_INTEGER - (Number.MAX_SAFE_INTEGER % 100);
    expect(pyusdAtomicFor(sgdFromCents(cents), 10_000_000n)).toBe((BigInt(cents) * 10_000_000n) / 100n);
    // The smallest rate on a total whose product is also divisible by 100.
    expect(pyusdAtomicFor(sgdFromCents(100), 1n)).toBe(1n);
  });

  it("rate text must be a plain decimal with at most six places", () => {
    for (const text of ["-1", "1e3", " 0.7", "0.7421151"]) expect(parsePyusdPerSgd(text), text).toEqual({ ok: false, reason: "not_plain_six_place_decimal" });
    expect(parsePyusdPerSgd("0.742115")).toEqual({ ok: true, atomicPerSgd: 742_115n });
    expect(formatPyusdPerSgd(742_115n)).toBe("0.742115");
  });

  it("rate outside its bounds is refused", () => {
    for (const text of ["0", "0.000000", "10.000001"]) expect(parsePyusdPerSgd(text), text).toEqual({ ok: false, reason: "out_of_bounds" });
    expect(parsePyusdPerSgd("10")).toEqual({ ok: true, atomicPerSgd: 10_000_000n });
    expect(parsePyusdPerSgd("0.000001")).toEqual({ ok: true, atomicPerSgd: 1n });
  });
});

describe("mint eligibility for a transfer", () => {
  const schedule = (epoch: bigint, basisPoints = 0, maximumFee = 0n) => ({ epoch, basisPoints, maximumFee });
  const mint = (extensions: MintExtension[]): DecodedMint => ({ decimals: 6, extensions });
  const fee = (older: ReturnType<typeof schedule>, newer: ReturnType<typeof schedule>): MintExtension => ({ kind: "TransferFeeConfig", older, newer });
  const reviewed: MintExtension[] = [{ kind: "PermanentDelegate" }, { kind: "TransferHook", programId: null }, { kind: "MetadataPointer" }];

  it("the reviewed devnet mint is eligible (fixture self-check)", () => {
    expect(assessMintForTransfer(mint([...reviewed, fee(schedule(0n), schedule(0n))]), 700n)).toMatchObject({ ok: true });
  });

  it("non-zero transfer fee rate refuses preparation", () => {
    expect(assessMintForTransfer(mint([...reviewed, fee(schedule(0n), schedule(690n, 50))]), 700n)).toEqual({ ok: false, reason: "fee_rate_nonzero" });
  });

  it("non-zero maximum fee refuses preparation", () => {
    expect(assessMintForTransfer(mint([...reviewed, fee(schedule(0n), schedule(690n, 0, 1n))]), 700n)).toEqual({ ok: false, reason: "max_fee_nonzero" });
  });

  it("non-zero fee in the next epoch refuses preparation", () => {
    expect(assessMintForTransfer(mint([...reviewed, fee(schedule(0n), schedule(701n, 50))]), 700n)).toEqual({ ok: false, reason: "fee_next_epoch_nonzero" });
  });

  it("active transfer hook refuses preparation", () => {
    const hooked: MintExtension[] = [{ kind: "PermanentDelegate" }, { kind: "TransferHook", programId: "FXTRhookProgram" }, fee(schedule(0n), schedule(0n))];
    expect(assessMintForTransfer(mint(hooked), 700n)).toEqual({ ok: false, reason: "transfer_hook_active" });
  });

  it("unreviewed mint extension refuses preparation", () => {
    expect(assessMintForTransfer(mint([...reviewed, fee(schedule(0n), schedule(0n)), { kind: "PausableConfig" }]), 700n)).toEqual({ ok: false, reason: "unreviewed_extension" });
  });
});

describe("PYUSD standalone rules", () => {
  it("only two settings configure the PYUSD rail", () => {
    const base = webEnvFor("postgres://envoi_web@127.0.0.1:5432/envoi_fixture");
    const env = (extra: Record<string, string>) => ({ ...base, ...extra }) as NodeJS.ProcessEnv;
    const parsed = webEnv(env({ SOLANA_RPC_URL: "https://fixture-devnet-rpc.invalid/", PYUSD_ENABLED: "true" }));
    expect(parsed.SOLANA_RPC_URL).toBe("https://fixture-devnet-rpc.invalid/");
    expect(parsed.PYUSD_ENABLED).toBe(true);
    expect(webEnv(env({})).PYUSD_ENABLED).toBe(false);
    expect(() => webEnv(env({ PYUSD_MINT: "So11111111111111111111111111111111111111112" }))).toThrow(/PYUSD_MINT: not a setting/);
    expect(() => webEnv(env({ SOLANA_CLUSTER: "mainnet-beta" }))).toThrow(/SOLANA_CLUSTER: not a setting/);
  });

  it("a changed PYUSD rate is a new checkout", () => {
    const input: CheckoutKeyInput = {
      buyerUserId: "usr_fixture",
      outletId: "out_fixture",
      menuRevisionId: "mrv_fixture",
      destinationId: "dst_fixture",
      rail: "pyusd",
      currency: "SGD",
      lines: [{ menuItemId: "itm_fixture", quantity: 2 }],
      pyusdRateVersionId: "rat_first",
    };
    expect(computeCheckoutKey(input)).not.toBe(computeCheckoutKey({ ...input, pyusdRateVersionId: "rat_second" }));
    expect(computeCheckoutKey(input)).toBe(computeCheckoutKey({ ...input }));
  });

  it("a PYUSD mismatch can close only unpaid", () => {
    expect(canTransitionPyusdAttempt("mismatch", "closed_unpaid")).toBe(true);
    expect(canTransitionPyusdAttempt("mismatch", "confirmed")).toBe(false);
  });
});
