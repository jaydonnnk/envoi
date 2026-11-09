import type { MailSettings } from "@/env";

export type ConfirmationMail = { to: string; confirmationUrl: string };

export async function sendConfirmationMail(settings: MailSettings, mail: ConfirmationMail, send: typeof fetch = fetch): Promise<"accepted" | "failed"> {
  try {
    const response = await send("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${settings.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: settings.from,
        to: [mail.to],
        subject: "Confirm your Envoi email",
        text: `Confirm your email to create an Envoi test shop.\n\n${mail.confirmationUrl}\n\nIf you didn't create an Envoi account, you can ignore this email.`,
      }),
      signal: AbortSignal.timeout(3_000),
      redirect: "error",
    });
    void response.body?.cancel().catch(() => {});
    return response.ok ? "accepted" : "failed";
  } catch {
    return "failed";
  }
}
