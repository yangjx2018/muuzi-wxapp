/**
 * 从 App Icon.tsx 同源 path 生成 tab / Hub PNG（对齐 MuuziGit BottomNav）。
 * 运行：node scripts/generate-icons-from-app.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'miniprogram', 'assets');
fs.mkdirSync(OUT, { recursive: true });

const MUTED = '#8a8f9c';
const ACTIVE = '#15171e';
const ACCENT = '#2f6df4';
const ACCENT_WASH = '#eaf1ff';

function svgIcon({ body, size = 81, color = MUTED, stroke = 1.8, pad = 4 }) {
  const vb = 24;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${vb} ${vb}" fill="none">
  <g transform="translate(0 0)" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
    ${body}
  </g>
</svg>`
  );
}

function svgFilledIcon({ body, size = 81, color = ACTIVE }) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" stroke="none">
  ${body}
</svg>`
  );
}

/** 对齐 Icon.tsx navPeople */
const NAV_PEOPLE = `
  <circle cx="9" cy="9" r="3.2" fill="none"/>
  <path d="M3.5 19.5a5.8 5.8 0 0111 0" fill="none"/>
  <circle cx="17.5" cy="7.5" r="2.4" fill="none"/>
  <path d="M15.5 14.2a4.6 4.6 0 015 4.6" fill="none"/>
`;

/** 对齐 Icon.tsx navChat */
const NAV_CHAT = `
  <path d="M20.8 11.4a8.4 8.4 0 0 1-12.2 7.5L3.4 20.6l1.7-5.1A8.4 8.4 0 1 1 20.8 11.4z" fill="none"/>
`;

/** 对齐 Icon.tsx navProfile */
const NAV_PROFILE = `
  <circle cx="12" cy="8.2" r="3.7" fill="none"/>
  <path d="M4.9 20.6a7.1 7.1 0 0 1 14.2 0" fill="none"/>
`;

const NAV_CHAT_FILLED = `
  <path d="M20.8 11.4a8.4 8.4 0 0 1-12.2 7.5L3.4 20.6l1.7-5.1A8.4 8.4 0 1 1 20.8 11.4z"/>
`;

const NAV_PROFILE_FILLED = `
  <circle cx="12" cy="8.2" r="3.7"/>
  <path d="M4.9 20.6a7.1 7.1 0 0 1 14.2 0"/>
`;

/** Hub: mic（圆角方底上的麦） */
const MIC = `
  <rect x="9" y="3" width="6" height="11" rx="3" fill="none"/>
  <path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3" fill="none"/>
`;

const PERSON = `
  <circle cx="9" cy="9" r="3.2" fill="none"/>
  <path d="M3.5 19.5a5.8 5.8 0 0111 0" fill="none"/>
`;

const LINK = `
  <path d="M10.5 13.5a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" fill="none"/>
  <path d="M13.5 10.5a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" fill="none"/>
`;

const CHEVRON = `<path d="M10 6l6 6-6 6" fill="none"/>`;
const ARROW = `<path d="M5 12h13M12 5l7 7-7 7" fill="none"/>`;

async function writePng(name, svgBuf) {
  const out = path.join(OUT, name);
  await sharp(svgBuf).png().toFile(out);
  console.log('wrote', name, fs.statSync(out).size);
}

/** Hub mic 放在浅色圆角方上（对齐 App fc-mic） */
async function writeMicBadge() {
  const size = 100;
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 50 50">
  <rect x="0" y="0" width="50" height="50" rx="17" fill="${ACCENT_WASH}"/>
  <g transform="translate(13 13)" stroke="${ACCENT}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <rect x="9" y="3" width="6" height="11" rx="3"/>
    <path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3"/>
  </g>
</svg>`);
  await writePng('icon-mic-badge.png', svg);
}

(async () => {
  // Tab：连接 = App 底栏第 2（navPeople）
  await writePng('tab-connect.png', svgIcon({ body: NAV_PEOPLE, color: MUTED }));
  await writePng('tab-connect-active.png', svgIcon({ body: NAV_PEOPLE, color: ACTIVE, stroke: 2 }));

  // Tab：消息 = App 底栏第 4（navChat）
  await writePng('tab-messages.png', svgIcon({ body: NAV_CHAT, color: MUTED }));
  await writePng(
    'tab-messages-active.png',
    svgFilledIcon({ body: NAV_CHAT_FILLED, color: ACTIVE })
  );

  // Tab：我 = App 底栏第 5（navProfile）
  await writePng('tab-me.png', svgIcon({ body: NAV_PROFILE, color: MUTED }));
  await writePng(
    'tab-me-active.png',
    svgFilledIcon({ body: NAV_PROFILE_FILLED, color: ACTIVE })
  );

  // Hub 内图标
  await writeMicBadge();
  await writePng(
    'icon-person.png',
    svgIcon({ body: PERSON, size: 46, color: '#33374a', stroke: 1.8 })
  );
  await writePng(
    'icon-link.png',
    svgIcon({ body: LINK, size: 46, color: '#33374a', stroke: 1.8 })
  );
  await writePng(
    'icon-chevron.png',
    svgIcon({ body: CHEVRON, size: 28, color: '#9ea3b4', stroke: 2 })
  );
  await writePng(
    'icon-arrow-right.png',
    svgIcon({ body: ARROW, size: 40, color: '#ffffff', stroke: 2 })
  );

  console.log('done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
