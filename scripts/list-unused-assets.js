/**
 * List unused miniprogram/assets — keep anything statically referenced
 * or reachable via known dynamic path builders.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'miniprogram');
const assetsDir = path.join(root, 'assets');

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const codeFiles = walk(root).filter(
  (f) =>
    /\.(js|wxml|wxss|json)$/.test(f) &&
    !f.includes(`${path.sep}assets${path.sep}`)
);
const blob = codeFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const assets = fs
  .readdirSync(assetsDir)
  .filter((n) => fs.statSync(path.join(assetsDir, n)).isFile());

const keep = new Set();

// Dynamic: edit-home socialIconSrc → social-{kind}.png / social-{kind}-on.png
const socialKinds = [
  'instagram',
  'youtube',
  'tiktok',
  'email',
  'website',
  'github',
  'bilibili',
  'xiaohongshu',
  'weibo',
  'wechat',
  'facebook',
  'facebook_page',
  'messenger',
  'threads',
  'spotify',
  'link',
  'x',
];
for (const k of socialKinds) {
  keep.add(`social-${k}.png`);
  keep.add(`social-${k}-on.png`);
}

// Dynamic: contentCatalog.catalogIconSrc
for (const k of [
  'instagram',
  'tiktok',
  'youtube',
  'spotify',
  'image',
  'download',
  'map',
  'link',
  'email',
]) {
  keep.add(`catalog-${k}.png`);
}

// tabBar + room tab pattern
for (const k of ['connect', 'messages', 'me']) {
  keep.add(`tab-${k}.png`);
  keep.add(`tab-${k}-active.png`);
}

const re = /(?:^|["'`/\s(=])(?:\/)?assets\/([A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|gif|webp|svg))/g;
let m;
while ((m = re.exec(blob))) keep.add(m[1]);

const unused = assets
  .filter((n) => !keep.has(n))
  .map((n) => {
    const size = fs.statSync(path.join(assetsDir, n)).size;
    return { n, size, kb: +(size / 1024).toFixed(1) };
  })
  .sort((a, b) => b.size - a.size);

const used = assets.filter((n) => keep.has(n));
const usedSum = used.reduce(
  (s, n) => s + fs.statSync(path.join(assetsDir, n)).size,
  0
);
const unusedSum = unused.reduce((s, x) => s + x.size, 0);

console.log(
  JSON.stringify(
    {
      total: assets.length,
      used: used.length,
      unused: unused.length,
      usedKB: +(usedSum / 1024).toFixed(1),
      unusedKB: +(unusedSum / 1024).toFixed(1),
      unusedFiles: unused.map((x) => x.n),
    },
    null,
    2
  )
);

// Sanity: known-used must stay
for (const must of [
  'logo-muu.png',
  'icon-share-out.png',
  'tool-thumbnail.svg',
  'icon-ui-eye-open.svg',
  'social-youtube-on.svg',
  'tab-me.png',
]) {
  if (!keep.has(must)) {
    console.error('SANITY FAIL missing keep:', must);
    process.exit(1);
  }
  if (unused.some((x) => x.n === must)) {
    console.error('SANITY FAIL would delete:', must);
    process.exit(1);
  }
}
console.error('sanity ok');
