import { listPublishedOutlets } from "@/domain/outlets/search";
import { webDb } from "@/lib/db/web";
import { httpOk } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const outlets = await listPublishedOutlets(webDb());
  return httpOk({ outlets }, { cache: "public-short" });
}
