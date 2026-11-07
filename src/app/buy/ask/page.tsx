import { notFound } from "next/navigation";
import { getPublishedMenu } from "@/domain/outlets/search";
import { assistantEnabled } from "@/integrations/ai/openai";
import { webDb } from "@/lib/db/web";
import { AskEnvoi } from "./ask-envoi";

export const dynamic = "force-dynamic";

// S25: Ask Envoi in the site. Off unless the key, the model and the assistant's agent token are all
// set; /buy links here only while it is on. S33: ?outlet=<id> scopes it to that published shop.
export default async function AskPage({ searchParams }: { searchParams: Promise<{ outlet?: string | string[] }> }) {
  if (!assistantEnabled()) notFound();
  const { outlet } = await searchParams;
  if (outlet === undefined) return <GeneralAsk />;
  const menu = typeof outlet === "string" ? await getPublishedMenu(webDb(), outlet) : null;
  if (!menu) {
    return (
      <main>
        <h1>Not on Envoi</h1>
        <p className="lead">That shop is not on Envoi.</p>
        <a className="button secondary" href="/buy">
          See all shops
        </a>
      </main>
    );
  }
  const example = menu.items.find((item) => item.available === true)?.name;
  return (
    <main className="ask">
      <p className="eyebrow">
        <a href={`/buy?${new URLSearchParams({ outlet: menu.outlet.id }).toString()}`}>This shop&apos;s menu</a>
      </p>
      <h1>Ask about {menu.outlet.name}</h1>
      <p className="lead">
        The assistant is already at this shop. It reads this shop&apos;s menu, asks when your words fit two items, and hands you a review. It never pays.{" "}
        {menu.outlet.isDemoFixture && <span className="chip warn">Demo fixture</span>}
      </p>
      <AskEnvoi shop={{ id: menu.outlet.id, name: menu.outlet.name, example }} />
    </main>
  );
}

function GeneralAsk() {
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
        Ask what a dish is, or what to order. Envoi hands you a review, and you approve the payment yourself.
      </p>
      <AskEnvoi />
    </main>
  );
}
