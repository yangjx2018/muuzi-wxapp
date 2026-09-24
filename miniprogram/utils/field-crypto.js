/**
 * 访客凭据/消息摘要用的本机密码学辅助（无 Node crypto / Web Crypto 依赖）。
 */

function randomBytes(n) {
  var a = new Uint8Array(n);
  if (typeof wx !== 'undefined' && typeof wx.getRandomValues === 'function') {
    wx.getRandomValues(a);
  } else if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  ) {
    crypto.getRandomValues(a);
  } else {
    for (var i = 0; i < n; i++) a[i] = (Math.random() * 256) | 0;
  }
  return a;
}

/** 43 字符 base64url（无 padding），对齐 App randomProof */
function randomProof() {
  var bytes = randomBytes(32);
  var bin = '';
  for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  var b64 =
    typeof btoa === 'function'
      ? btoa(bin)
      : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function encodeUtf8(str) {
  var out = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff) {
      var c2 = str.charCodeAt(++i);
      var u = 0x10000 + (((c & 0x3ff) << 10) | (c2 & 0x3ff));
      out.push(
        0xf0 | (u >> 18),
        0x80 | ((u >> 12) & 0x3f),
        0x80 | ((u >> 6) & 0x3f),
        0x80 | (u & 0x3f)
      );
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(out);
}

function utf8ByteLength(str) {
  return encodeUtf8(str).length;
}

/** 纯 JS SHA-256 → 小写 hex */
function sha256Hex(input) {
  var bytes =
    typeof input === 'string' ? encodeUtf8(input) : new Uint8Array(input);
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  var H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ];
  var l = bytes.length;
  var bitLenHi = Math.floor(l / 0x20000000);
  var bitLenLo = (l << 3) >>> 0;
  var withPad = new Uint8Array(((l + 9 + 63) & ~63));
  withPad.set(bytes);
  withPad[l] = 0x80;
  var view = new DataView(withPad.buffer);
  view.setUint32(withPad.length - 8, bitLenHi, false);
  view.setUint32(withPad.length - 4, bitLenLo, false);

  function rotr(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  for (var i = 0; i < withPad.length; i += 64) {
    var w = new Uint32Array(64);
    for (var j = 0; j < 16; j++) w[j] = view.getUint32(i + j * 4, false);
    for (var j2 = 16; j2 < 64; j2++) {
      var s0 =
        rotr(w[j2 - 15], 7) ^ rotr(w[j2 - 15], 18) ^ (w[j2 - 15] >>> 3);
      var s1 =
        rotr(w[j2 - 2], 17) ^ rotr(w[j2 - 2], 19) ^ (w[j2 - 2] >>> 10);
      w[j2] = (w[j2 - 16] + s0 + w[j2 - 7] + s1) >>> 0;
    }
    var a = H[0],
      b = H[1],
      c = H[2],
      d = H[3],
      e = H[4],
      f = H[5],
      g = H[6],
      h = H[7];
    for (var t = 0; t < 64; t++) {
      var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      var ch = (e & f) ^ (~e & g);
      var temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }
  var hex = '';
  for (var k = 0; k < 8; k++) {
    hex += ('00000000' + H[k].toString(16)).slice(-8);
  }
  return hex;
}

module.exports = {
  randomProof: randomProof,
  encodeUtf8: encodeUtf8,
  utf8ByteLength: utf8ByteLength,
  sha256Hex: sha256Hex,
};
