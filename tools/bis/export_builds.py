import json, sys, runpy, io, contextlib
sys.argv=['gen.py','template.html','/dev/null']
with contextlib.redirect_stderr(io.StringIO()):
    g=runpy.run_path('gen.py')
out=[]
for b in g['B']:
    out.append(dict(id=b['id'],name=b['name'],han=b['han'],fam=b['name'].split('(')[0],slots=b['slots'],
      maxrows=[g['expand'](r) for r in b['maxrows']], minrows=[g['expand'](r) for r in b['minrows']] if b['minrows'] else None,
      sets=b['sets'], role=b['role']))
json.dump(out,open('builds.json','w'),ensure_ascii=False)
names=set()
for b in out:
    for rows in (b['maxrows'],b['minrows'] or []):
        for r in rows:
            for c in r: names.add(c.rstrip('*'))
print(sorted(names))
print({b['id']:b['slots'] for b in out})
