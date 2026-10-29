import { notFound } from "next/navigation";
import { assistantEnabled } from "@/integrations/ai/openai";
import { AskEnvoi } from "./ask-envoi";

export const dynamic = "force-dynamic";

// S25: Ask Envoi in the site. Off unless the key, the model and the assistant's agent token are all
// set; /buy links here only while it is on.
export default function AskPage() {
  if (!assistantEnabled()) notFound();
  return (
    <main className="ask">
      <p className="eyebrow">
        <a href="/buy">All shops</a>
      </p>
      <h1>
        Ask Envoi.
        <br />
        Approve it yourself.
      </h1>
      <p className="lead">
        Envoi&apos;s own assistant, inside the site. It reads shops and menus through Envoi&apos;s published API, asks when your words fit two items, and hands you a review. It
        never pays.
      </p>
      <AskEnvoi />
    </main>
  );
}
