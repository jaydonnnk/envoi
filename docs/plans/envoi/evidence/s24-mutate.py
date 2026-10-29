import subprocess, sys, json
ROOT="/Users/jayd0/Desktop/envoi"
U="tests/unit/web-import.test.ts"; I="tests/integration/menu-web-import.test.ts"; D="tests/integration/menu-web-import-disabled.test.ts"
M=[
 ("1a not_https","src/domain/imports/web-url.ts",'if (url.protocol !== "https:") return { ok: false, reason: "not_https" };','',[U,I]),
 ("1b has_credentials","src/domain/imports/web-url.ts",'if (url.username !== "" || url.password !== "") return { ok: false, reason: "has_credentials" };','',[U,I]),
 ("1c ip literal","src/domain/imports/web-url.ts",'if (host.startsWith("[") || IPV4.test(host)) return { ok: false, reason: "ip_or_local_host" };','',[U,I]),
 ("1d local/single-label","src/domain/imports/web-url.ts",'if (labels.length < 2 || host === "localhost"','if (false && labels.length < 2 || host === "localhost"',[U]),
 ("1e bad_port","src/domain/imports/web-url.ts",'if (url.port !== "") return { ok: false, reason: "bad_port" };','',[U,I]),
 ("1f too_long","src/domain/imports/web-url.ts",'if (text.length > MENU_PAGE_URL_MAX_CHARS) return { ok: false, reason: "too_long" };','',[U,I]),
 ("1g route skips link check","src/domain/imports/request.ts",'if (!link.ok) return httpErr(appError("validation_failed", PAGE_NOT_OPENED_COPY, { details: { reason: link.reason } }));','',[I]),
 ("2 switch ignored","src/domain/imports/request.ts",'if (!env.WEB_IMPORTS_ENABLED || !env.OPENAI_API_KEY || !env.AI_WEB_MENU_MODEL || !env.KERNEL_API_KEY) {\n    return httpErr','if (!env.OPENAI_API_KEY || !env.AI_WEB_MENU_MODEL || !env.KERNEL_API_KEY) {\n    return httpErr',[D]),
 ("3 consent ignored","src/domain/imports/request.ts",'if (body.consentVersion !== WEB_MENU_CONSENT_VERSION) {','if (false) {',[I]),
 ("4a daily cap per source","src/domain/imports/admission.ts",'.where(and(today, eq(menuImports.outletId, input.outletId)));','.where(and(today, eq(menuImports.outletId, input.outletId), eq(menuImports.source, input.web ? "web_page" : "photo")));',[I]),
 ("4b spend per source","src/domain/imports/admission.ts",'.where(and(today, or(isNotNull(menuImports.modelDispatchedAt), live)));','.where(and(today, eq(menuImports.source, input.web ? "web_page" : "photo"), or(isNotNull(menuImports.modelDispatchedAt), live)));',[I]),
 ("5 no delete","src/integrations/browser/kernel.ts",'if (sessionId !== null) {','if (false) {',[U]),
 ("5b delete only on ok","src/integrations/browser/kernel.ts",'if (sessionId !== null) {','if (sessionId !== null && false) {',[U]),
 ("6a stealth on","src/integrations/browser/kernel.ts",'  stealth: false,','  stealth: true,',[U]),
 ("6b proxy default","src/integrations/browser/kernel.ts",'proxy: { mode: "direct" },','',[U]),
 ("6c profile","src/integrations/browser/kernel.ts",'  timeout_seconds: 30,','  timeout_seconds: 30,\n  profile: { name: "envoi" },',[U]),
 ("7 no price check","src/domain/imports/request.ts",'if (!hasPrintedPrice(page.text)) {','if (false) {',[I]),
 ("7b price check too loose","src/domain/imports/verbatim.ts",'if (match[1] !== undefined || match[3]?.length === 2) return true;','return true;',[U]),
 ("8a no blanking","src/domain/imports/verbatim.ts",'if (item.priceSgdCents !== null && !tokens.has(item.priceSgdCents))','if (false)',[U,I]),
 ("8b 49 matches 4.90","src/domain/imports/verbatim.ts",'for (const match of text.matchAll(PRICE_TOKEN)) tokens.add(cents(match[2]!, match[3]));','for (const match of text.matchAll(PRICE_TOKEN)) { tokens.add(cents(match[2]!, match[3])); tokens.add(Number(match[2]) * 10); }',[U]),
 ("8c route skips verbatim","src/domain/imports/request.ts",'const kept = validated.ok ? keepPrintedOnly(validated, page.text) : null;','const kept = validated.ok ? { draft: validated, droppedNames: 0 } : null;',[I]),
 ("9 no name drop","src/domain/imports/verbatim.ts",'if (name === "" || !page.includes(name)) {','if (false) {',[U,I]),
 ("10 import writes published","src/domain/imports/lifecycle.ts",'    if (fromPublished) {\n      targetId','    if (false) {\n      targetId',[I]),
 ("11a URL logged","src/domain/imports/request.ts",'  const link = checkMenuPageUrl(body.url);','  const link = checkMenuPageUrl(body.url);\n  log("info", "menu_web_link", { link: body.url });',[I]),
 ("11b full URL stored as host","src/domain/imports/request.ts",'web: { promptVersion: MENU_WEB_PROMPT_VERSION, host: link.host },','web: { promptVersion: MENU_WEB_PROMPT_VERSION, host: link.url.href.slice(0, 250) },',[I]),
 ("11c text in error response","src/domain/imports/request.ts",'return refused(importId, "provider_unreachable", "Drafting failed, so no item was added. Try again or enter the menu by hand.", "model_failed", undefined, true);','return refused(importId, "provider_unreachable", page.text.slice(-60), "model_failed", undefined, true);',[I]),
 ("12 planted SDK import","src/domain/imports/request.ts",'import { admitMenuImport } from "@/domain/imports/admission";','import "@onkernel/sdk";\nimport { admitMenuImport } from "@/domain/imports/admission";',[U]),
]
results=[]
for name,path,old,new,tests in M:
    p=f"{ROOT}/{path}"; orig=open(p).read()
    if orig.count(old)!=1: results.append((name,"MUTATION NOT APPLIED",0)); continue
    open(p,"w").write(orig.replace(old,new))
    try:
        r=subprocess.run(["npx","vitest","run","--config","config/vitest.config.ts",*tests],cwd=ROOT,capture_output=True,text=True,timeout=300)
        out=r.stdout+r.stderr
        line=[l for l in out.splitlines() if l.strip().startswith("Tests")]
        fails=[l.strip() for l in out.splitlines() if l.strip().startswith(("×","FAIL"))][:3]
        results.append((name,"FAILED (caught)" if r.returncode!=0 else "PASSED (NOT CAUGHT)", (line[-1].strip() if line else "?")+" | "+" ; ".join(fails)))
    finally:
        open(p,"w").write(orig)
for r in results: print(" | ".join(str(x) for x in r))
