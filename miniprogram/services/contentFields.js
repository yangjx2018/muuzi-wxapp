/**
 * 内容表单字段 · 对齐 MuuziGit contentFields.ts ITEM_FIELDS
 * 小程序首版：文本 / URL / 多行 / 配色；图片走选图上传。
 */
var SECTION_LABELS = {
  links: '链接',
  video: '影像',
  audio: '声音',
  agents: 'Agents',
  skills: '技能',
  shop: '店铺',
  custom: '自定义',
};

var ITEM_FIELDS = {
  links: [
    { key: 'label', label: '标题', placeholder: '我的作品集' },
    { key: 'url', label: '网址', kind: 'url', placeholder: 'https://' },
    { key: 'note', label: '说明（可空）', placeholder: '一句话' },
    { key: 'color', label: '卡片配色', kind: 'color' },
  ],
  custom: [
    { key: 'title', label: '标题', placeholder: '怎么和我合作' },
    {
      key: 'body',
      label: '正文（可空）',
      kind: 'multiline',
      placeholder: '先说清楚交付物，再谈价…',
    },
    { key: 'url', label: '链接（可空）', kind: 'url', placeholder: 'https://' },
    { key: 'link_label', label: '按钮文字（可空）', placeholder: '看流程' },
    { key: 'color', label: '卡片配色', kind: 'color' },
  ],
  video: [
    { key: 'title', label: '标题' },
    {
      key: 'url',
      label: '链接',
      kind: 'url',
      placeholder: 'https://youtu.be/…',
    },
    { key: 'duration', label: '时长（可空）', placeholder: '3:08' },
  ],
  audio: [
    { key: 'title', label: '标题' },
    {
      key: 'url',
      label: 'MP3 / M4A 音频直链或试听页',
      kind: 'url',
      placeholder: 'https://…/voice.mp3',
    },
    { key: 'duration', label: '时长（可空）', placeholder: '3:08' },
  ],
  agents: [
    { key: 'name', label: '名称' },
    { key: 'desc', label: '说明（可空）' },
    { key: 'url', label: '试用链接（可空）', kind: 'url', placeholder: 'https://' },
  ],
  skills: [{ key: 'label', label: '技能' }],
  shop: [
    { key: 'title', label: '商品名' },
    { key: 'url', label: '购买链接', kind: 'url', placeholder: 'https://' },
    {
      key: 'price_minor',
      label: '价格（元，可空）',
      kind: 'price',
      placeholder: '29',
    },
    { key: 'note', label: '说明（可空）', placeholder: '一句话' },
  ],
};

var COLOR_OPTIONS = [
  { value: '', label: '默认' },
  { value: 'rose', label: '玫瑰' },
  { value: 'amber', label: '琥珀' },
  { value: 'mint', label: '薄荷' },
  { value: 'sky', label: '天蓝' },
  { value: 'lilac', label: '紫丁' },
  { value: 'sand', label: '沙' },
  { value: 'ink', label: '墨' },
];

function fieldsForType(type) {
  return (ITEM_FIELDS[type] || ITEM_FIELDS.links).slice();
}

function buildFormFields(type, values) {
  var vals = values || {};
  return fieldsForType(type).map(function (field) {
    var kind = field.kind || 'text';
    var value = vals[field.key] || '';
    var colorLabel = '默认';
    if (kind === 'color') {
      for (var i = 0; i < COLOR_OPTIONS.length; i++) {
        if (COLOR_OPTIONS[i].value === value) {
          colorLabel = COLOR_OPTIONS[i].label;
          break;
        }
      }
    }
    return {
      key: field.key,
      label: field.label,
      kind: kind,
      placeholder: field.placeholder || '',
      value: value,
      colorLabel: colorLabel,
      isUrl: kind === 'url',
      isMultiline: kind === 'multiline',
      isColor: kind === 'color',
      isPrice: kind === 'price',
      isText: kind === 'text' || kind === 'url' || kind === 'price',
    };
  });
}

function prepareItem(type, values) {
  var vals = Object.assign({}, values || {});
  var item = {};
  fieldsForType(type).forEach(function (field) {
    var raw = vals[field.key];
    if (raw == null) return;
    var text = String(raw).trim();
    if (!text && field.kind !== 'color') return;
    if (field.kind === 'price' && text) {
      var yuan = Number(text);
      if (!Number.isFinite(yuan) || yuan < 0) return;
      item[field.key] = String(Math.round(yuan * 100));
      return;
    }
    item[field.key] = text;
  });
  if (type === 'links' || type === 'skills') {
    if (!item.label && item.title) item.label = item.title;
  }
  if (type === 'video' || type === 'audio' || type === 'shop' || type === 'custom') {
    if (!item.title && item.label) item.title = item.label;
    if (!item.label && item.title) item.label = item.title;
  }
  if (type === 'agents') {
    if (!item.name && item.title) item.name = item.title;
    if (!item.label && item.name) item.label = item.name;
  }
  return item;
}

function requiredOk(type, values) {
  var vals = values || {};
  if (type === 'skills') {
    if (!String(vals.label || '').trim()) return '请填写技能';
    return '';
  }
  if (type === 'agents') {
    if (!String(vals.name || '').trim()) return '请填写名称';
    return '';
  }
  if (type === 'custom') {
    if (!String(vals.title || '').trim()) return '请填写标题';
    return '';
  }
  if (type === 'shop') {
    if (!String(vals.title || '').trim()) return '请填写商品名';
    if (!String(vals.url || '').trim()) return '请填写购买链接';
  } else if (type === 'video' || type === 'audio') {
    if (!String(vals.title || '').trim()) return '请填写标题';
    if (!String(vals.url || '').trim()) return '请填写链接';
  } else {
    if (!String(vals.label || vals.title || '').trim()) return '请填写标题';
    if (!String(vals.url || '').trim()) return '请填写链接';
  }
  var url = String(vals.url || '').trim();
  if (url && !/^https:\/\//i.test(url)) return '链接须以 https:// 开头';
  return '';
}

module.exports = {
  SECTION_LABELS: SECTION_LABELS,
  ITEM_FIELDS: ITEM_FIELDS,
  COLOR_OPTIONS: COLOR_OPTIONS,
  fieldsForType: fieldsForType,
  buildFormFields: buildFormFields,
  prepareItem: prepareItem,
  requiredOk: requiredOk,
};
