/**
 * 结构门禁：登录态小程序允许 wx.login。
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const MINI = path.join(ROOT, 'miniprogram');

const REQUIRED = [
  'project.config.json',
  'package.json',
  'check.js',
  'miniprogram/app.js',
  'miniprogram/app.json',
  'miniprogram/app.wxss',
  'miniprogram/config.js',
  'miniprogram/adapters/secure-store.js',
  'miniprogram/services/session.js',
  'miniprogram/services/http.js',
  'miniprogram/services/rules.js',
  'miniprogram/services/node.js',
  'miniprogram/services/guduu-auth.js',
  'miniprogram/services/creator.js',
  'miniprogram/services/subjects.js',
  'miniprogram/services/fieldCardSources.js',
  'miniprogram/services/fieldNamecard.js',
  'miniprogram/services/pageAddress.js',
  'miniprogram/services/fieldEncounterRules.js',
  'miniprogram/services/fieldEncounters.js',
  'miniprogram/services/fieldTranslation.js',
  'miniprogram/services/fieldSpeech.js',
  'miniprogram/services/fieldOutbox.js',
  'miniprogram/services/fieldAudioCapture.js',
  'miniprogram/config/fieldNodes.js',
  'miniprogram/utils/field-crypto.js',
  'miniprogram/services/fieldCapabilities.js',
  'miniprogram/services/fieldNodeApi.js',
  'miniprogram/services/fieldJoinLanguage.js',
  'miniprogram/services/fieldVisitorCopy.js',
  'miniprogram/services/fieldGuestPersistence.js',
  'miniprogram/services/fieldVisitorSession.js',
  'miniprogram/services/fieldVisitorJoin.js',
  'miniprogram/services/fieldVisitorDelivery.js',
  'miniprogram/services/fieldVisitorHistory.js',
  'miniprogram/services/fieldVisitorEntry.js',
  'miniprogram/services/fieldSavedTalks.js',
  'miniprogram/services/matrixRooms.js',
  'miniprogram/services/matrixClient.js',
  'miniprogram/services/matrixApi.js',
  'miniprogram/services/matrixWorkspaces.js',
  'miniprogram/services/matrixInbox.js',
  'miniprogram/services/matrixDirect.js',
  'miniprogram/services/matrixChat.js',
  'miniprogram/services/matrixMedia.js',
  'miniprogram/services/matrixE2ee.js',
  'miniprogram/services/messageDeepLink.js',
  'miniprogram/services/tabUnread.js',
  'miniprogram/services/matrixRuntime.js',
  'miniprogram/pages/messages/index.js',
  'miniprogram/pages/messages/room/index.js',
  'miniprogram/utils/adts-to-m4a.js',
  'miniprogram/utils/uqrcode.js',
  'miniprogram/services/wechat-login.js',
  'miniprogram/services/auth-flow.js',
  'miniprogram/pages/auth/login/index.js',
  'miniprogram/pages/auth/join/index.js',
  'miniprogram/pages/auth/join/verify/index.js',
  'miniprogram/pages/auth/join/password/index.js',
  'miniprogram/pages/auth/recover/index.js',
  'miniprogram/pages/auth/recover/verify/index.js',
  'miniprogram/pages/auth/recover/password/index.js',
  'miniprogram/pages/auth/bind/index.js',
  'miniprogram/pages/connect/index.js',
  'miniprogram/pages/connect/talk/index.js',
  'miniprogram/pages/connect/card/index.js',
  'miniprogram/pages/connect/join/index.js',
  'miniprogram/pages/connect/continue/index.js',
  'miniprogram/pages/messages/index.js',
  'miniprogram/pages/me/index.js',
  'miniprogram/pages/me/settings/index.js',
  'miniprogram/services/pageSkins.js',
  'miniprogram/services/meSettings.js',
  'miniprogram/pages/me/edit-home/index.js',
  'miniprogram/pages/me/shop/index.js',
  'miniprogram/pages/me/agent-access/index.js',
  'docs/P0_微信合法域名清单.md',
];

const FORBIDDEN_PATTERNS = [
  { re: /-----BEGIN (?:RSA )?PRIVATE KEY-----/, label: 'private key pem' },
  { re: /GuDuuOS-Team/, label: 'retired team path' },
  { re: /services\/muuzi_identity/, label: 'retired identity path' },
];

const errors = [];

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === '.git') continue;
      walk(p, out);
    } else if (/\.(js|json|wxml|wxss)$/i.test(name)) {
      out.push(p);
    }
  }
}

for (const rel of REQUIRED) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    errors.push('missing: ' + rel);
  }
}

const appJson = JSON.parse(fs.readFileSync(path.join(MINI, 'app.json'), 'utf8'));
const tabs = (appJson.tabBar && appJson.tabBar.list) || [];
const tabTexts = tabs.map((t) => t.text);
if (tabTexts.join(',') !== '连接,消息,我') {
  errors.push('tabBar must be 连接/消息/我, got: ' + tabTexts.join('/'));
}

const loginJs = fs.readFileSync(path.join(MINI, 'pages/auth/login/index.js'), 'utf8');
if (!/onWeChatLogin/.test(loginJs)) errors.push('login page missing WeChat login handler');
if (/Apple|Google/.test(loginJs) && /SocialSignIn/.test(loginJs)) {
  errors.push('login must not keep Apple/Google social options');
}

const loginWxml = fs.readFileSync(path.join(MINI, 'pages/auth/login/index.wxml'), 'utf8');
if (!/微信登录/.test(loginWxml)) errors.push('login wxml missing 微信登录');
if (/Apple|Google/.test(loginWxml)) errors.push('login wxml must not show Apple/Google');

const nodeJs = fs.readFileSync(path.join(MINI, 'services/node.js'), 'utf8');
if (!/NODE_NOT_WHITELISTED|白名单/.test(nodeJs)) {
  errors.push('node service must enforce whitelist');
}

const configSrc = fs.readFileSync(path.join(MINI, 'config.js'), 'utf8');
if (!/PLATFORM_API/.test(configSrc) || !/im\.muuzi\.co/.test(configSrc)) {
  errors.push('config.js must export PLATFORM_API and im.muuzi.co whitelist');
}

const files = [];
walk(MINI, files);
walk(path.join(ROOT, 'test'), files);
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.re.test(text)) {
      errors.push(path.relative(ROOT, file) + ': forbidden ' + rule.label);
    }
  }
}

if (errors.length) {
  console.error('check failed:');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}

console.log('check ok: P0+M0 structure, whitelist, WeChat-only social');
