// Runs once when the server boots. The check lives in a Node-only module so the Edge build of
// this file never includes it.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./boot").then((boot) => boot.checkBootConfiguration());
}
