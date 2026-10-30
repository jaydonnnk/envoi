import hashlib, json, os, subprocess, sys
ROOT = "/Users/jayd0/Desktop/envoi"
U = "tests/integration/us-shops.test.ts"
M = [
 ("m10a","src/lib/money.ts","    if (value.currency !== currency) throw new CurrencyMismatchError(currency, value.currency);\n","","tests/unit/money.test.ts","money of two currencies"),
 ("m10b","src/lib/money.ts","  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);\n","","tests/unit/money.test.ts","money of two currencies"),
 ("m10c","src/lib/money.ts",'  if (value.currency !== "SGD") throw new CurrencyMismatchError("SGD", value.currency);\n',"","tests/unit/money.test.ts","money of two currencies"),
 ("m11a","src/domain/outlets/merchant.ts","      if (current.publishedMenuRevisionId !== null) {\n        return appError(\"country_locked\"","      if (false) {\n        return appError(\"country_locked\"",U,"merchant route answers country_locked"),
 ("m11b","drizzle/0027_currency_and_country.sql","    RAISE EXCEPTION 'outlet % has published, so its country cannot change', OLD.id USING ERRCODE = 'check_violation';","    NULL;",U,"database refuses the change itself"),
 ("m12a","src/integrations/paypal/orders.ts","({ currency_code: currency,","({ currency_code: \"SGD\" as Currency,",U,"creates a USD PayPal order"),
 ("m12b","src/domain/purchases/price.ts","  const currency = CURRENCY_BY_COUNTRY[menu.outlet.country];\n","  const currency: Currency = \"SGD\";\n",U,"creates a USD PayPal order"),
 ("m13a","src/domain/purchases/reconcile.ts"," || capture.amount?.currency !== expected.currency) return { decision: \"uncertain\", reason: \"currency_mismatch\" };",") return { decision: \"uncertain\", reason: \"currency_mismatch\" };",U,"capture in another currency"),
 ("m13b","src/domain/purchases/reconcile.ts","item.unit?.currency === expected.currency &&","item.unit?.currency === \"SGD\" &&",U,"capture in another currency"),
 ("m14a","src/domain/pyusd/attempts.ts","  if (purchase.currency !== \"SGD\") return notEligible","  if (false) return notEligible",U,"PYUSD preparation refuses"),
 ("m14b","src/domain/purchases/price.ts","  if (input.rail === \"pyusd\" && currency !== \"SGD\") return refuse","  if (false) return refuse",U,"PYUSD preparation refuses"),
 ("m14c","src/domain/pyusd/identity.ts","  if (input.currency !== \"SGD\") return { available: false, reason: NOT_SGD_SHOP","  if (false) return { available: false, reason: NOT_SGD_SHOP",U,"PYUSD preparation refuses"),
 ("m15","src/domain/sgqr/resolve.ts","        eq(outlets.country, \"SG\"),\n","",U,"SGQR resolution never returns"),
 ("m16","src/domain/outlets/search.ts","    currency: outlet.currency,\n","",U,"public menu answers carry"),
 ("m18a","drizzle/0027_currency_and_country.sql","'lineMinor', l.value->'lineSgdCents'","'lineMinor', l.value->'unitSgdCents'","tests/integration/currency-migration.test.ts","keeps every amount"),
 ("m18b","drizzle/0027_currency_and_country.sql","ADD COLUMN \"country\" text DEFAULT 'SG' NOT NULL","ADD COLUMN \"country\" text DEFAULT 'US' NOT NULL","tests/integration/currency-migration.test.ts","keeps every amount"),
 ("m19","src/app/mcp/route.ts","unitMinor: item.unitMinor, currency: menu.currency,","unitMinor: item.unitMinor,",U,"MCP tools answer with the currency"),
]
only = set(sys.argv[1:])
env = {k:v for k,v in os.environ.items() if k not in ("DATABASE_URL","MIGRATION_DATABASE_URL","MAINTENANCE_DATABASE_URL")}
env["TEST_DATABASE_URL"]="postgres://postgres@127.0.0.1:5432/envoi_test"
env["PATH"]=os.path.expanduser("~/.local/node/bin")+":"+env["PATH"]
def run(f,t):
    p=subprocess.run(["npx","vitest","run","--config","config/vitest.config.ts",f,"-t",t],cwd=ROOT,env=env,capture_output=True,text=True)
    o=p.stdout+p.stderr
    return p.returncode, ("AssertionError" in o), o
res=[]
for mid,path,old,new,f,t in M:
    if only and mid not in only: continue
    fp=os.path.join(ROOT,path); orig=open(fp,"rb").read(); h=hashlib.sha256(orig).hexdigest()
    s=orig.decode()
    if s.count(old)!=1: res.append((mid,"ANCHOR_COUNT_%d"%s.count(old))); continue
    open(fp,"w").write(s.replace(old,new))
    try: rc,ae,o=run(f,t)
    finally: open(fp,"wb").write(orig)
    same=hashlib.sha256(open(fp,"rb").read()).hexdigest()==h
    rc2,_,o2=run(f,t)
    line=[l for l in o.splitlines() if "AssertionError" in l][:1]
    res.append((mid,"mut_rc=%d assertion=%s restored=%s rerun_rc=%d %s"%(rc,ae,same,rc2,line[0][:110] if line else "")))
    print(res[-1],flush=True)
json.dump(res,open(os.path.join(os.path.dirname(__file__),"mutations.json"),"w"),indent=1)
