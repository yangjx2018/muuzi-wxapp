/**
 * 对齐 MuuziGit fieldSpeech.ts（M1.4 只用 translate；recognize/synthesize 留给 M1.5）
 */
const config = require('../config');
const http = require('./http');
const idempotency = require('../utils/idempotency');

var speechLanguages = {
  zh: '中文（普通话）',
  en: 'English · 英语',
  ja: '日本語 · 日语',
  fr: 'Français · 法语',
  de: 'Deutsch · 德语',
  es: 'Español · 西班牙语',
  ko: '한국어 · 韩语',
  pt: 'Português (Brasil) · 葡萄牙语（巴西）',
  it: 'Italiano · 意大利语',
  ru: 'Русский · 俄语',
  vi: 'Tiếng Việt · 越南语',
  tr: 'Türkçe · 土耳其语',
  hi: 'हिन्दी · 印地语',
  nl: 'Nederlands · 荷兰语',
  pl: 'Polski · 波兰语',
  uk: 'Українська · 乌克兰语',
  sv: 'Svenska · 瑞典语',
  da: 'Dansk · 丹麦语',
  fi: 'Suomi · 芬兰语',
  el: 'Ελληνικά · 希腊语',
  ro: 'Română · 罗马尼亚语',
  hr: 'Hrvatski · 克罗地亚语',
};

var errors = {
  SPEECH_NOT_HEARD: '没有听清这次发言，请重新说话。',
  SPEECH_DAILY_LIMIT: '今日语音用量已达到上限。',
  SPEECH_NOT_CONFIGURED: '语音服务尚未就绪。',
  FIELD_ACCESS_DENIED: '当前节点尚未开放语音服务。',
  SPEECH_REQUEST_USED: '这次请求已经提交，未再次调用。请确认后重新操作。',
  SPEECH_PROVIDER_BUSY: '翻译服务繁忙，请稍后重试。',
  SPEECH_TIMEOUT: '本次处理超时，请重试。',
  SPEECH_LANGUAGE_UNSUPPORTED: '暂不支持所选语言。',
  SPEECH_TEXT_INVALID: '文字为空或过长，请缩短后重试。',
  SPEECH_AUDIO_INVALID: '录音格式无效，请重新按住说话。',
};

function speechErrorMessage(code) {
  return errors[code] || '本次处理未完成，请稍后重试。';
}

function speechLanguageOptions() {
  return Object.keys(speechLanguages).map(function (key) {
    return { value: key, label: speechLanguages[key] };
  });
}

/**
 * @param {'recognize'|'translate'|'synthesize'} operation
 */
function speechRequest(token, operation, body) {
  return http
    .request({
      url:
        config.PLATFORM_API +
        '/api/creator/field/v1/speech/' +
        operation,
      method: 'POST',
      header: {
        Authorization: 'Bearer ' + token,
        'Idempotency-Key': idempotency.uuidV4(),
      },
      data: Object.assign({}, body, { consent: 'google-processing-v1' }),
      timeout: 30000,
    })
    .then(function (data) {
      if (operation === 'synthesize') {
        if (
          !data ||
          data.mimeType !== 'audio/mpeg' ||
          typeof data.audioBase64 !== 'string' ||
          !data.audioBase64.length
        ) {
          throw new Error('朗读结果格式不正确。');
        }
        return data;
      }
      if (
        !data ||
        typeof data.text !== 'string' ||
        !data.text.trim() ||
        data.text.length > 4500
      ) {
        throw new Error('文字结果格式不正确。');
      }
      return data;
    })
    .catch(function (err) {
      var code =
        (err && err.body && err.body.code) || (err && err.code) || '';
      if (errors[code]) {
        throw Object.assign(new Error(speechErrorMessage(code)), {
          code: code,
          statusCode: err && err.statusCode,
        });
      }
      throw err;
    });
}

module.exports = {
  speechLanguages: speechLanguages,
  speechLanguageOptions: speechLanguageOptions,
  speechErrorMessage: speechErrorMessage,
  speechRequest: speechRequest,
};
