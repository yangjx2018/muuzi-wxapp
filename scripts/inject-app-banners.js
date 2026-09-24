/**
 * One-shot: inject app-banner / status-pad into signed-in pages.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'miniprogram');

const BANNER = [
  ['pages/connect', '连接', false, null],
  ['pages/connect/card', '我的名片', true, '/pages/connect/index'],
  ['pages/connect/continue', '现场交流', true, '/pages/connect/index'],
  ['pages/connect/host', '扫码交流', true, '/pages/connect/index'],
  ['pages/connect/join', '', false, null],
  ['pages/me/compose', '发布', true, '/pages/me/index'],
  ['pages/me/saved', '我的收藏', true, '/pages/me/index'],
  ['pages/me/membership', '主理人订阅', true, '/pages/me/index'],
  ['pages/me/edit-home', '编辑主页', true, '/pages/me/index'],
  ['pages/me/profile', '个人资料', true, '/pages/me/index'],
  ['pages/me/interests', 'Muu 的筛选规则', true, '/pages/me/index'],
  ['pages/me/muu', '主 AI', true, '/pages/me/index'],
  ['pages/me/open-home', '主页', true, '/pages/me/index'],
  ['pages/me/shop', '我的店铺', true, '/pages/me/index'],
  ['pages/me/address', '主页地址', true, '/pages/me/index'],
  ['pages/me/subjects', '管理主体', true, '/pages/me/index'],
  ['pages/me/spaces', '切换空间', true, '/pages/me/index'],
  ['pages/me/contacts', '留言收件箱', true, '/pages/messages/index'],
  ['pages/me/agent-access', '代理权限与人设', true, '/pages/me/index'],
  ['pages/me/sharing', 'Agent 卡与邀请', true, '/pages/me/index'],
];

const STATUS = [
  'pages/messages',
  'pages/messages/room',
  'pages/me',
  'pages/me/settings',
  'pages/me/security',
  'pages/me/enterprise-invitations',
];

const TAB = new Set([
  '/pages/connect/index',
  '/pages/messages/index',
  '/pages/me/index',
]);

function readJson(pageDir) {
  const jp = path.join(root, pageDir, 'index.json');
  return { jp, j: JSON.parse(fs.readFileSync(jp, 'utf8')) };
}

function writeJson(jp, j) {
  fs.writeFileSync(jp, JSON.stringify(j, null, 2) + '\n');
}

function ensureComp(j, name, ref) {
  j.usingComponents = j.usingComponents || {};
  j.usingComponents[name] = ref;
  j.navigationStyle = 'custom';
}

for (const [dir, section, showBack, fallback] of BANNER) {
  const { jp, j } = readJson(dir);
  ensureComp(j, 'app-banner', '/components/app-banner/index');
  writeJson(jp, j);
  const wp = path.join(root, dir, 'index.wxml');
  let w = fs.readFileSync(wp, 'utf8');
  if (!w.includes('<app-banner')) {
    let tag = '<app-banner';
    if (section) tag += ` section="${section}"`;
    if (showBack) {
      tag += ' show-back';
      if (fallback) {
        tag += ` fallback-url="${fallback}"`;
        tag += ` fallback-tab="{{${TAB.has(fallback)}}}"`;
      }
    }
    tag += ' />\n';
    fs.writeFileSync(wp, tag + w);
  }
  console.log('banner', dir);
}

for (const dir of STATUS) {
  const { jp, j } = readJson(dir);
  ensureComp(j, 'status-pad', '/components/status-pad/index');
  writeJson(jp, j);
  const wp = path.join(root, dir, 'index.wxml');
  let w = fs.readFileSync(wp, 'utf8');
  if (!w.includes('<status-pad') && !w.includes('<app-banner')) {
    fs.writeFileSync(wp, '<status-pad />\n' + w);
  }
  console.log('status', dir);
}

console.log('ok');
