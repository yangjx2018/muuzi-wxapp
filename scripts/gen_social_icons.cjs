/**
 * Rasterize App/SSR social brand paths → miniprogram/assets/social-*.png (+ SVG twin).
 *
 * Source of truth (do not invent paths):
 *   MuuziGit/muuzi/src/components/social-brand-paths.json  (Simple Icons 16.31.0)
 *   StudioSocialShortcuts BrandIcon / module.css colors
 *   server/api/lib/render-page.js ICONS (website globe, email, link)
 *
 * Run:
 *   cd scripts && npm i @resvg/resvg-js@2.6.2 && node gen_social_icons.cjs
 */
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const OUT = path.join(__dirname, '..', 'miniprogram', 'assets');
const BRAND_PATHS = path.join(
  __dirname,
  '..',
  '..',
  'MuuziGit',
  'muuzi',
  'src',
  'components',
  'social-brand-paths.json'
);

const OFF = '#969997';
const ON_DEFAULT = '#2878ec';

/** Configured (on) colors — match StudioSocialShortcuts.module.css */
const ON_COLOR = {
  bilibili: '#00a1d6',
  xiaohongshu: '#e93246',
  weibo: '#e93246',
  wechat: '#07b75b',
  github: '#171717',
  threads: '#171717',
  x: '#171717',
  facebook: ON_DEFAULT,
  facebook_page: ON_DEFAULT,
  messenger: ON_DEFAULT,
  spotify: '#159d52',
  website: ON_DEFAULT,
  link: ON_DEFAULT,
  email: ON_DEFAULT,
};

const STROKE = {
  website:
    '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.8 2.8 2.8 14.2 0 17M12 3.5c-2.8 2.8-2.8 14.2 0 17"/>',
  link: '<path d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 0 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
  email:
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
};

function writeSvgAndPng(name, svg) {
  const svgPath = path.join(OUT, `social-${name}.svg`);
  const pngPath = path.join(OUT, `social-${name}.png`);
  fs.writeFileSync(svgPath, svg + '\n', 'utf8');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 96 },
    background: 'rgba(0,0,0,0)',
  });
  const png = resvg.render().asPng();
  fs.writeFileSync(pngPath, png);
  console.log('wrote', name, png.length);
}

function filledBrand(d, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="${color}" d="${d}"/></svg>`;
}

function strokeIcon(inner, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

if (!fs.existsSync(BRAND_PATHS)) {
  console.error('missing brand paths:', BRAND_PATHS);
  process.exit(1);
}

const brand = JSON.parse(fs.readFileSync(BRAND_PATHS, 'utf8'));

/** Brands to ship for Wx shortcuts + preview (parity with App SOCIAL_ICON / Studio fallback). */
const BRAND_KINDS = [
  'bilibili',
  'xiaohongshu',
  'weibo',
  'wechat',
  'github',
  'x',
  'facebook',
  'facebook_page',
  'messenger',
  'threads',
  'spotify',
];

for (const kind of BRAND_KINDS) {
  const d = brand[kind];
  if (!d) {
    console.warn('skip missing path', kind);
    continue;
  }
  writeSvgAndPng(kind, filledBrand(d, OFF));
  writeSvgAndPng(kind + '-on', filledBrand(d, ON_COLOR[kind] || ON_DEFAULT));
}

for (const [kind, inner] of Object.entries(STROKE)) {
  writeSvgAndPng(kind, strokeIcon(inner, OFF));
  writeSvgAndPng(kind + '-on', strokeIcon(inner, ON_COLOR[kind] || ON_DEFAULT));
}

console.log('done');
