const fs = require('fs');
const path = require('path');

const wxml = fs.readFileSync(
  'miniprogram/components/field-host-invite/index.wxml',
  'utf8'
);
const js = fs.readFileSync(
  'miniprogram/components/field-host-invite/index.js',
  'utf8'
);
const re =
  /\b(?:bind|catch)(?:tap|input|change|confirm|longpress|touchstart|touchend)="([^"]+)"/g;
const handlers = new Set();
let m;
while ((m = re.exec(wxml))) {
  if (m[1] && m[1] !== 'true') handlers.add(m[1]);
}
const missing = [...handlers].filter((h) => {
  return !(
    new RegExp(h + '\\s*:\\s*function|' + h + '\\s*\\(').test(js) ||
    new RegExp('(^|\\n)\\s*' + h + '\\s*\\(').test(js)
  );
});
console.log(JSON.stringify({ handlers: [...handlers].sort(), missing }, null, 2));

// Check app-banner and other components briefly
function checkComp(rel) {
  const dir = path.join('miniprogram', rel);
  const w = path.join(dir, 'index.wxml');
  const j = path.join(dir, 'index.js');
  if (!fs.existsSync(w) || !fs.existsSync(j)) return null;
  const wt = fs.readFileSync(w, 'utf8');
  const jt = fs.readFileSync(j, 'utf8');
  const hs = new Set();
  let mm;
  const rr =
    /\b(?:bind|catch)(?:tap|input|change|confirm|longpress|touchstart|touchend)="([^"]+)"/g;
  while ((mm = rr.exec(wt))) {
    if (mm[1] && mm[1] !== 'true') hs.add(mm[1]);
  }
  const miss = [...hs].filter(
    (h) =>
      !new RegExp(h + '\\s*:\\s*function|' + h + '\\s*\\(').test(jt) &&
      !new RegExp('(^|\\n)\\s*(async\\s+)?' + h + '\\s*\\(').test(jt)
  );
  return miss.length ? { rel, miss } : null;
}

const comps = [];
function walk(d, rel) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    const r = rel ? rel + '/' + f.name : f.name;
    if (f.isDirectory()) walk(p, r);
  }
}
walk('miniprogram/components', '');
const dirs = [];
function collect(d, rel) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    const r = rel ? rel + '/' + f.name : f.name;
    if (f.isDirectory()) {
      if (fs.existsSync(path.join(p, 'index.wxml'))) dirs.push('components/' + r);
      collect(p, r);
    }
  }
}
collect('miniprogram/components', '');
const bad = dirs.map(checkComp).filter(Boolean);
console.log(JSON.stringify({ componentIssues: bad }, null, 2));
