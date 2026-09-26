/**
 * Fail if any statically/dynamically referenced asset is missing.
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
const refs = new Set();

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
  refs.add(`social-${k}.png`);
  refs.add(`social-${k}-on.png`);
}
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
  refs.add(`catalog-${k}.png`);
}
for (const k of ['connect', 'messages', 'me']) {
  refs.add(`tab-${k}.png`);
  refs.add(`tab-${k}-active.png`);
}

const re =
  /(?:^|["'`/\s(=])(?:\/)?assets\/([A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|gif|webp|svg))/g;
let m;
while ((m = re.exec(blob))) refs.add(m[1]);

const missing = [...refs]
  .filter((n) => !fs.existsSync(path.join(assetsDir, n)))
  .sort();

const media = fs
  .readdirSync(assetsDir)
  .filter((n) => /\.(png|jpe?g|gif|webp|svg|mp3|m4a)$/i.test(n));
const sum = media.reduce(
  (s, n) => s + fs.statSync(path.join(assetsDir, n)).size,
  0
);

console.log(
  JSON.stringify(
    {
      refs: refs.size,
      missing: missing.length,
      missingFiles: missing,
      mediaCount: media.length,
      mediaKB: +(sum / 1024).toFixed(1),
    },
    null,
    2
  )
);

if (missing.length) process.exit(1);
