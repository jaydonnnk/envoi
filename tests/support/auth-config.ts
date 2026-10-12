// Gate 2 approved in-app Better Auth (R11, Option A). Neon Managed Better Auth may be switched on
// only after a recorded Gate 2 amendment, written in 02-architecture.md as this exact line.
export const AMENDMENT_LINE = /^\*\*Gate 2 amendment, approved \d{4}-\d{2}-\d{2}: Neon Managed Better Auth replaces in-app Better Auth\.\*\*$/m;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export type AuthConfigVerdict = { ok: true } | { ok: false; reason: string };

export function checkAuthConfiguration(neonTs: string, architecture: string): AuthConfigVerdict {
  const values = [...stripComments(neonTs).matchAll(/\bauth\s*:\s*([A-Za-z]+)/g)].map((match) => match[1]);
  if (values.length !== 1) return { ok: false, reason: `neon.ts must set auth exactly once, found ${values.length}` };
  if (values[0] === "false") return { ok: true };
  if (values[0] === "true" && AMENDMENT_LINE.test(architecture)) return { ok: true };
  return { ok: false, reason: `neon.ts sets auth: ${values[0]} with no recorded Gate 2 amendment` };
}
