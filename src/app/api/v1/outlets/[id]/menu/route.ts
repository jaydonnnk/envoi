import { getPublishedMenu } from "@/domain/outlets/search";
import { webDb } from "@/lib/db/web";
import { appError } from "@/lib/errors";
import { httpErr, httpOk } from "@/lib/http/respond";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const menu = await getPublishedMenu(webDb(), id);
  if (!menu) return httpErr(appError("not_found", "That shop is not on Envoi."));
  return httpOk(menu, { cache: "public-short" });
}
