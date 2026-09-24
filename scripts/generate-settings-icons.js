/**
 * Settings row icons · path-aligned with MuuziGit Icon.tsx (accent stroke).
 * Run: node scripts/generate-settings-icons.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'miniprogram', 'assets');
const ACCENT = '#2f6df4';

function svgIcon(body, stroke) {
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none">' +
      '<g stroke="' +
      ACCENT +
      '" stroke-width="' +
      (stroke || 1.7) +
      '" stroke-linecap="round" stroke-linejoin="round">' +
      body +
      '</g></svg>'
  );
}

async function writePng(name, body, stroke) {
  const out = path.join(OUT, name);
  await sharp(svgIcon(body, stroke)).png().toFile(out);
  console.log('wrote', name, fs.statSync(out).size);
}

(async function () {
  await writePng(
    'icon-ui-shield-accent.png',
    '<path d="M12 3.2l7 2.9v5.4c0 4.2-2.9 7.5-7 8.3-4.1-.8-7-4.1-7-8.3V6.1l7-2.9z"/><path d="M9 12.1l2.2 2.2 4.1-4.5"/>',
    1.7
  );
  await writePng(
    'icon-ui-mail-accent.png',
    '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    1.7
  );
  await writePng(
    'icon-ui-bookmark-accent.png',
    '<path d="M18.5 20.8L12 16.6l-6.5 4.2V5.6c0-.9.7-1.6 1.6-1.6h9.8c.9 0 1.6.7 1.6 1.6v15.2z"/>',
    1.8
  );
  await writePng(
    'icon-ui-calendar-accent.png',
    '<rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
    1.8
  );
  await writePng(
    'icon-ui-menu-accent.png',
    '<path d="M4 7h16M4 12h16M4 17h10"/>',
    1.8
  );
  await writePng(
    'icon-ui-x-social.png',
    '<path d="M5 5l14 14M19 5L5 19"/>',
    1.8
  );
  console.log('done');
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
