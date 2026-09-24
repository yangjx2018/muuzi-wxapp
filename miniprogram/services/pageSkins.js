/**
 * 公开主页配色 · 对齐 MuuziGit skins.ts
 * 仅影响公开主页，不改 App/小程序壳色。
 */
var SKINS = {
  rose: { id: 'rose', label: '玫瑰粉', swatch: '#ff97a8' },
  indigo: { id: 'indigo', label: '蓝紫', swatch: '#9a9ef8' },
  mint: { id: 'mint', label: '薄荷绿', swatch: '#86ccb4' },
  sand: { id: 'sand', label: '暖沙橙', swatch: '#fdae7c' },
};

var SKIN_ORDER = ['rose', 'indigo', 'mint', 'sand'];
var STORE_KEY = 'public_page_skin_id';

var store = require('../adapters/secure-store');

function isSkinId(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SKINS, value);
}

function getSkinId() {
  var stored = store.get(STORE_KEY);
  return isSkinId(stored) ? stored : 'indigo';
}

function getSkin() {
  return SKINS[getSkinId()];
}

function setSkinId(id) {
  if (!isSkinId(id)) throw new Error('未知主页配色');
  store.set(STORE_KEY, id);
  return SKINS[id];
}

function skinOptions(selectedId) {
  selectedId = selectedId || getSkinId();
  return SKIN_ORDER.map(function (id) {
    return {
      id: id,
      label: SKINS[id].label,
      swatch: SKINS[id].swatch,
      selected: id === selectedId,
    };
  });
}

module.exports = {
  SKINS: SKINS,
  SKIN_ORDER: SKIN_ORDER,
  getSkinId: getSkinId,
  getSkin: getSkin,
  setSkinId: setSkinId,
  skinOptions: skinOptions,
  isSkinId: isSkinId,
};
