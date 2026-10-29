# S24 review additions, 2026-10-29: each guard the review added a test for, mutated alone.
# The browser-side PDF check (document.contentType) runs in Kernel's VM, which the fake cannot run; a
# real Kernel read of the R3 PDF proves it instead, recorded in 00-status.md.
# Run from anywhere: python3 docs/plans/envoi/evidence/s24-review-mutate.py
import subprocess, os
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),"..","..","..",".."))
U="tests/unit/web-import.test.ts"; I="tests/integration/menu-web-import.test.ts"
K="src/integrations/browser/kernel.ts"
M=[
 ("R1 delete tied to the request signal",K,'await client.browsers.deleteByID(id).then(','await client.browsers.deleteByID(id, { signal }).then(',[U,I]),
 ("R2 SDK retries on",K,'maxRetries: 0, timeout','maxRetries: 2, timeout',[U,I]),
 ("R3 URL quoted by hand",K,'page.goto(${JSON.stringify(url)},','page.goto(\'${url}\',',[U,I]),
 ("R4 final host not checked",K,'if (signIn || !isSameShopHost(host, url.hostname)) return','if (signIn) return',[U,I]),
 ("R4b www not allowed",K,'.replace(/\\.$/, "").replace(/^www\\./, "")','.replace(/\\.$/, "")',[U,I]),
 ("R4c suffix match",K,'return bare(finalHost) === bare(requestedHost);','return bare(finalHost).startsWith(bare(requestedHost));',[U,I]),
 ("R5 sign-in check removed",K,'if (signIn || !isSameShopHost','if (false || !isSameShopHost',[U,I]),
 ("R6 status check removed",K,'if (status !== null && status >= 400) return { kind: "refused", error: record("Error", status) };','',[U,I]),
 ("R7 SDK logger from env",K,'logLevel: "off", ','',[U,I]),
 ("R9 PDF check removed from the route","src/domain/imports/request.ts",'    if (page.pdf) {','    if (false) {',[U,I]),
 ("R9b PDF text passed on",K,'if (pdf === true) return { kind: "ok", text: "", finalHost: host, pdf: true };','if (pdf === true) return { kind: "ok", text: cutToBytes(text, PAGE_READ_BOUNDS.maxTextBytes), finalHost: host, pdf: true };',[U,I]),
 ("R8 delete failure thrown",K,'''        (err: unknown) => {
          const status''','''        (err: unknown) => { throw err;
          const status''',[U,I]),
]
for name,path,old,new,tests in M:
    p=f"{ROOT}/{path}"; orig=open(p).read()
    if orig.count(old)!=1: print(name,"| MUTATION NOT APPLIED"); continue
    open(p,"w").write(orig.replace(old,new))
    try:
        r=subprocess.run(["npx","vitest","run","--config","config/vitest.config.ts",*tests],cwd=ROOT,capture_output=True,text=True,timeout=300)
        out=r.stdout+r.stderr
        line=[l for l in out.splitlines() if l.strip().startswith("Tests")]
        fails=[l.strip() for l in out.splitlines() if l.strip().startswith("×")][:2]
        print(name,"|","FAILED (caught)" if r.returncode!=0 else "PASSED (NOT CAUGHT)","|",(line[-1].strip() if line else "?"),"|"," ; ".join(fails))
    finally:
        open(p,"w").write(orig)
