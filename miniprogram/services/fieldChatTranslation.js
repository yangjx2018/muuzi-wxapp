/**
 * 扫码交流翻译决策 · 对齐 MuuziGit fieldChatTranslation.ts
 *
 * 自己发出的文字不送翻译；同语种不送；节点/平台未开翻译时显示未开放；
 * 主人未开启自动翻译时同样不送。
 */

/**
 * @param {{ own: boolean, source: string, target: string, available: boolean, enabled: boolean }} input
 * @returns {'own'|'same'|'closed'|'off'|'translate'}
 */
function translationDecision(input) {
  if (input.own) return 'own';
  if (!input.source || !input.target || input.source === input.target) {
    return 'same';
  }
  if (!input.available) return 'closed';
  if (!input.enabled) return 'off';
  return 'translate';
}

/**
 * @param {'own'|'same'|'closed'|'off'|'translate'} decision
 * @param {'pending'|'failed'|'done'|undefined} state
 */
function translationLabel(decision, state) {
  if (decision === 'closed') return '翻译服务未开放，以下为原文';
  if (decision === 'off') return '未开启自动翻译，以下为原文';
  if (decision !== 'translate') return '';
  if (state === 'pending') return '翻译中…';
  if (state === 'failed') return '这条暂未翻译成功，可重试';
  return '自动翻译';
}

/**
 * 扫码交流气泡只显示访客/宿主文字往来。
 * 面对面 saveFieldRecord 写入同一现场房间（co.muuzi.field.record /「现场交流 · …」正文），
 * 不得串进扫码聊天气泡；可在「查看现场频道」查看完整记录。
 * @param {{ body?: string, fieldKind?: string }|null|undefined} message
 */
function isScanChatMessage(message) {
  if (!message) return false;
  var body = String(message.body || '').trim();
  if (!body) return false;
  if (message.fieldKind === 'record') return false;
  // 兼容未带回 fieldKind 的回显 / 旧快照 / 编辑前缀 / 多种间隔号
  if (/^(\*\s*)?现场交流\s*[·•・‧]/.test(body)) return false;
  if (/现场交流\s*[·•・‧]/.test(body) && /的设备记录/.test(body)) {
    return false;
  }
  if (
    /(本人发言|对方发言)/.test(body) &&
    /的设备记录/.test(body) &&
    /原文[（(]/.test(body)
  ) {
    return false;
  }
  return true;
}

module.exports = {
  translationDecision: translationDecision,
  translationLabel: translationLabel,
  isScanChatMessage: isScanChatMessage,
};
