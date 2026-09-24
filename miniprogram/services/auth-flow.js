/**
 * 注册 / 找回跨页状态（对齐 App auth-flow）。
 * 仅存本机内存 + 短时 storage；不含密码明文长期落盘。
 */
const store = require('../adapters/secure-store');

const FLOW_KEY = 'auth_flow_json';

let memory = {
  email: '',
  code: '',
  notice: '',
  nodeDomain: '',
  bindToken: '',
  purpose: '',
  prefillAccount: '',
};

function load() {
  try {
    const raw = store.get(FLOW_KEY);
    if (raw) memory = Object.assign(memory, JSON.parse(raw));
  } catch (e) {
    /* ignore */
  }
  return memory;
}

function save() {
  store.set(
    FLOW_KEY,
    JSON.stringify({
      email: memory.email,
      code: memory.code,
      notice: memory.notice,
      nodeDomain: memory.nodeDomain,
      bindToken: memory.bindToken,
      purpose: memory.purpose,
      prefillAccount: memory.prefillAccount,
    })
  );
}

function get() {
  return load();
}

function setEmail(email) {
  memory.email = email || '';
  save();
}

function setCode(code) {
  memory.code = code || '';
  save();
}

function setNotice(notice) {
  memory.notice = notice || '';
  save();
}

function takeNotice() {
  load();
  const n = memory.notice;
  memory.notice = '';
  save();
  return n;
}

function setNodeDomain(domain) {
  memory.nodeDomain = domain || '';
  save();
}

function setBindToken(token) {
  memory.bindToken = token || '';
  save();
}

function setPrefillAccount(value) {
  memory.prefillAccount = value || '';
  save();
}

function setPurpose(purpose) {
  memory.purpose = purpose || '';
  save();
}

function reset() {
  memory = {
    email: '',
    code: '',
    notice: '',
    nodeDomain: memory.nodeDomain,
    bindToken: '',
    purpose: '',
    prefillAccount: '',
  };
  save();
}

module.exports = {
  get: get,
  setEmail: setEmail,
  setCode: setCode,
  setNotice: setNotice,
  takeNotice: takeNotice,
  setNodeDomain: setNodeDomain,
  setBindToken: setBindToken,
  setPrefillAccount: setPrefillAccount,
  setPurpose: setPurpose,
  reset: reset,
};
