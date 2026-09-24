/**
 * Rasterize MuuziGit Icon.tsx glyphs → miniprogram/assets/icon-ui-*.png
 * App uses inline SVG (Icon.tsx), not PNG — we bake the same paths to PNG for WeChat.
 *
 * Run:
 *   cd scripts && npm i @resvg/resvg-js@2.6.2 && node gen_ui_icons.cjs && rm -rf node_modules package*.json
 */
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const OUT = path.join(__dirname, '..', 'miniprogram', 'assets');
const ACCENT = '#2f6df4';
const INK = '#15171e';
const MUTED = '#c3c7d3';

function write(name, svg) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 96 },
    background: 'rgba(0,0,0,0)',
  });
  const png = resvg.render().asPng();
  fs.writeFileSync(path.join(OUT, name), png);
  console.log('wrote', name, png.length);
}

function stroke(inner, color, sw) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

const items = [
  ['icon-ui-link-accent.png', ACCENT, 1.8, '<path d="M10.5 13.5a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M13.5 10.5a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>'],
  ['icon-ui-list-accent.png', ACCENT, 1.8, '<path d="M5 6h14M5 12h14M5 18h9"/>'],
  ['icon-ui-expand-accent.png', ACCENT, 1.8, '<path d="M14.5 4.5H19.5V9.5"/><path d="M19.5 4.5L13.8 10.2"/><path d="M9.5 19.5H4.5V14.5"/><path d="M4.5 19.5L10.2 13.8"/>'],
  ['icon-ui-person-accent.png', ACCENT, 1.8, '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19.5a5.8 5.8 0 0111 0"/>'],
  ['icon-ui-share-accent.png', ACCENT, 1.8, '<path d="M21.4 3.1L3 10.2l7.3 2.6 2.6 7.3 8.5-17zM21.4 3.1l-11.1 9.7"/>'],
  ['icon-ui-chevron-muted.png', MUTED, 2, '<path d="M10 6l6 6-6 6"/>'],
  ['icon-ui-arrow-right-accent.png', ACCENT, 2, '<path d="M5 12h13M12 5l7 7-7 7"/>'],
  ['icon-ui-nav-people-ink.png', INK, 1.8, '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19.5a5.8 5.8 0 0111 0"/><circle cx="17.5" cy="7.5" r="2.4"/><path d="M15.5 14.2a4.6 4.6 0 015 4.6"/>'],
  ['icon-ui-list-ink.png', INK, 1.8, '<path d="M5 6h14M5 12h14M5 18h9"/>'],
  ['icon-ui-gear-ink.png', INK, 1.9, '<circle cx="12" cy="12" r="3"/><path d="M9.5 3h5l.5 2.3 1.7 1 2.2-.7 2.5 4.3-1.7 1.6v2l1.7 1.6-2.5 4.3-2.2-.7-1.7 1-.5 2.3h-5L9 19.7l-1.7-1-2.2.7-2.5-4.3 1.7-1.6v-2L2.6 9.9l2.5-4.3 2.2.7 1.7-1z"/>'],
  ['icon-ui-share-ink.png', INK, 1.8, '<path d="M21.4 3.1L3 10.2l7.3 2.6 2.6 7.3 8.5-17zM21.4 3.1l-11.1 9.7"/>'],
  ['icon-ui-back-ink.png', INK, 2, '<path d="M14 6l-6 6 6 6"/>'],
  ['icon-ui-chevron-ink.png', INK, 2, '<path d="M10 6l6 6-6 6"/>'],
  ['icon-ui-link-ink.png', INK, 1.8, '<path d="M10.5 13.5a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M13.5 10.5a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>'],
  ['icon-ui-plus-ink.png', INK, 1.9, '<path d="M12 5v14M5 12h14"/>'],
  ['icon-ui-eye-ink.png', INK, 1.7, '<path d="M2.6 12S6 5.9 12 5.9 21.4 12 21.4 12 18 18.1 12 18.1 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="2.9"/>'],
  ['icon-ui-pencil-ink.png', INK, 1.8, '<path d="m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14z"/>'],
  ['icon-ui-search-ink.png', INK, 1.8, '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>'],
  ['icon-ui-menu-ink.png', INK, 1.8, '<path d="M4 7h16M4 12h16M4 17h10"/>'],
  ['icon-ui-more-ink.png', INK, 0, 'FILLED_MORE'],
];

for (const [file, color, sw, body] of items) {
  if (body === 'FILLED_MORE') {
    write(
      file,
      `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="${color}" stroke="none"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>`
    );
    continue;
  }
  write(file, stroke(body, color, sw));
}

// Shop bag: App uses 64×64 viewBox inline SVG
write(
  'icon-ui-bag-ink.png',
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 64 64" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"><path d="M14 21h36l4 34H10z"/><path d="M23 24V16a9 9 0 0 1 18 0v8" stroke-linecap="round"/></svg>`
);

console.log('done');
