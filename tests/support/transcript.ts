import type { FakeCall } from "./fake-paypal";

// FIXTURE transcript of a fault-injection run. Printed only when ENVOI_TRANSCRIPT is set, which is
// how the S3 evidence file is produced; ordinary test runs stay quiet.
export function transcript(title: string) {
  const lines: string[] = [`[FIXTURE fault injection] ${title}`];
  return {
    step(text: string) {
      lines.push(`  - ${text}`);
    },
    calls(label: string, calls: readonly FakeCall[]) {
      for (const call of calls) lines.push(`  - ${label}: fake PayPal ${call.op}(order=${call.orderId ?? "-"}, PayPal-Request-Id=${call.requestId ?? "-"})`);
    },
    print() {
      if (process.env.ENVOI_TRANSCRIPT) console.log(lines.join("\n"));
    },
  };
}
