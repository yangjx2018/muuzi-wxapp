const fs = require('fs');
const path = require('path');

function handlers(wxml) {
  const s = new Set();
  const re =
    /\b(?:bind|catch)(?:tap|input|change|confirm|longpress|touchstart|touchend|blur|focus|submit)="([^"]+)"/g;
  let m;
  while ((m = re.exec(wxml))) {
    if (m[1] && m[1] !== 'true' && m[1] !== '') s.add(m[1]);
  }
  return [...s].sort();
}

function hasMethod(js, name) {
  return new RegExp('(^|\\n)\\s*(async\\s+)?' + name + '\\s*\\(').test(js);
}

function walkPages(dir, prefix) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!f.isDirectory()) continue;
    const page = prefix + '/' + f.name;
    const base = path.join('miniprogram', page);
    if (fs.existsSync(path.join(base, 'index.wxml'))) out.push(page);
    out.push(...walkPages(path.join(dir, f.name), page));
  }
  return out;
}

const pages = [
  ...walkPages('miniprogram/pages/auth', 'pages/auth'),
  ...walkPages('miniprogram/pages/me', 'pages/me'),
  ...walkPages('miniprogram/pages/connect', 'pages/connect'),
];

const issues = [];
for (const page of pages) {
  const wxml = path.join('miniprogram', page, 'index.wxml');
  const js = path.join('miniprogram', page, 'index.js');
  if (!fs.existsSync(js)) {
    issues.push({ page, missing: ['NO_JS'] });
    continue;
  }
  const w = fs.readFileSync(wxml, 'utf8');
  const j = fs.readFileSync(js, 'utf8');
  const missing = handlers(w).filter((h) => !hasMethod(j, h));
  if (missing.length) issues.push({ page, missing });
}

// components
function walkComp(d, rel) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    const r = rel + '/' + f.name;
    if (f.isDirectory()) walkComp(p, r);
    else if (f.name === 'index.wxml') {
      const jsPath = path.join(d, 'index.js');
      if (!fs.existsSync(jsPath)) {
        issues.push({ page: r, missing: ['NO_JS'] });
        continue;
      }
      const w = fs.readFileSync(p, 'utf8');
      const j = fs.readFileSync(jsPath, 'utf8');
      // component methods may be inside methods: { }
      const missing = handlers(w).filter((h) => {
        if (hasMethod(j, h)) return false;
        return !new RegExp(h + '\\s*:\\s*function|' + h + '\\s*\\(').test(j);
      });
      if (missing.length) issues.push({ page: r, missing });
    }
  }
}
if (fs.existsSync('miniprogram/components')) {
  walkComp('miniprogram/components', 'components');
}

console.log(JSON.stringify({ pageCount: pages.length, issues }, null, 2));
