function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function validCode(value) {
  return /^[0-9]{6}$/.test(String(value || ''));
}

function validUsername(value) {
  return /^[a-z0-9._=+-]{1,64}$/.test(String(value || ''));
}

/** 8–512，字母/数字/符号至少两类（对齐 App rules.ts） */
function validNewPassword(value) {
  const s = String(value || '');
  const length = Array.from(s).length;
  if (length < 8 || length > 512) return false;
  const classes = [
    /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF\u4E00-\u9FFF]/,
    /\d/,
    /[^A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF\u4E00-\u9FFF]/,
  ].filter(function (re) {
    return re.test(s);
  });
  return classes.length >= 2;
}

function validLogin(identifier, password) {
  const value = String(identifier || '').trim();
  return Boolean(value && password);
}

function resolvedLoginMethod(identifier) {
  return validEmail(identifier) ? 'email' : 'account';
}

module.exports = {
  normalizeEmail: normalizeEmail,
  validEmail: validEmail,
  validCode: validCode,
  validUsername: validUsername,
  validNewPassword: validNewPassword,
  validLogin: validLogin,
  resolvedLoginMethod: resolvedLoginMethod,
};
