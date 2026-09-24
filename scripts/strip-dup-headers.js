/**
 * Strip duplicate mp-header titles now covered by app-banner.
 * Switch settings/security/enterprise to app-banner.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'miniprogram');

const STRIP_HEADER = [
  'pages/me/compose',
  'pages/me/saved',
  'pages/me/membership',
  'pages/me/interests',
  'pages/me/shop',
  'pages/me/address',
  'pages/me/subjects',
  'pages/me/spaces',
  'pages/me/contacts',
  'pages/me/agent-access',
  'pages/me/sharing',
];

const headerRe =
  /\n?<view class="mp-header">[\s\S]*?<\/view>\n?/;

for (const dir of STRIP_HEADER) {
  const wp = path.join(root, dir, 'index.wxml');
  let w = fs.readFileSync(wp, 'utf8');
  if (!headerRe.test(w)) {
    console.log('no header', dir);
    continue;
  }
  w = w.replace(headerRe, '\n');
  fs.writeFileSync(wp, w);
  console.log('stripped', dir);
}

function toBanner(dir, section, fallback) {
  const jp = path.join(root, dir, 'index.json');
  const j = JSON.parse(fs.readFileSync(jp, 'utf8'));
  j.usingComponents = j.usingComponents || {};
  delete j.usingComponents['status-pad'];
  j.usingComponents['app-banner'] = '/components/app-banner/index';
  j.navigationStyle = 'custom';
  fs.writeFileSync(jp, JSON.stringify(j, null, 2) + '\n');

  const wp = path.join(root, dir, 'index.wxml');
  let w = fs.readFileSync(wp, 'utf8');
  w = w.replace(/<status-pad\s*\/>\n?/, '');
  w = w.replace(headerRe, '\n');
  if (!w.includes('<app-banner')) {
    const isTab = fallback === '/pages/me/index';
    w =
      `<app-banner section="${section}" show-back fallback-url="${fallback}" fallback-tab="{{${isTab}}}" />\n` +
      w;
  }
  fs.writeFileSync(wp, w);
  console.log('toBanner', dir);
}

toBanner('pages/me/settings', '设置', '/pages/me/index');
toBanner('pages/me/security', '账号安全', '/pages/me/index');
toBanner('pages/me/enterprise-invitations', '企业与邀请', '/pages/me/index');

console.log('ok');
