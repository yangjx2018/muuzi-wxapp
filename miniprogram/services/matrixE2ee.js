/**
 * E2EE 策略 · 决策 4b（补强：加密房允许明文文字，与 App 同好友可互通）
 *
 * - 对方发来的加密事件：不假装已读正文，显示等待/失败文案
 * - 本机文字：可发明文 m.room.message（Synapse 接受；App 可读）
 * - 本机图片/视频/文件：仍禁发（需 encryptAttachment + Megolm，后续切片）
 * - 完整跨端密钥恢复与加密发送仍后续
 */

var ATTACH_BLOCKED =
  '加密房间暂不支持从本机发送图片与文件。请先发文字，或在 App 发送附件。';

/** @deprecated 兼容旧测试与调用；语义同 ATTACH_BLOCKED */
var SEND_BLOCKED = ATTACH_BLOCKED;

var OPAQUE_WAITING = '加密消息正在等待解密。';

var OPAQUE_FAILED =
  '这条消息暂时无法解密，请检查设备密钥。';

var BANNER =
  '此对话在 App 启用了端到端加密。小程序可发送文字（明文，对方 App 可读）；对方加密消息本机暂无法解密。图片与文件请在 App 发送。';

function isOpaqueEvent(event) {
  if (!event) return false;
  return (
    event.type === 'm.room.encrypted' ||
    event.type === 'm.room.message.encrypted' ||
    !!event._decryptFailed
  );
}

function opaqueBody(event) {
  if (event && event._decryptFailed) return OPAQUE_FAILED;
  return OPAQUE_WAITING;
}

/**
 * 对齐 App：明文文本用公开已读；加密/附件占位只用私有回执，不宣称读过正文。
 */
function receiptTypeForMessage(message) {
  if (!message) return 'm.read.private';
  if (message.encrypted || message.attachment) return 'm.read.private';
  if (message.delivery && message.delivery !== 'sent') return '';
  return 'm.read';
}

function canMarkNotification(message) {
  return !!(message && message.eventId && message.delivery === 'sent');
}

module.exports = {
  SEND_BLOCKED: SEND_BLOCKED,
  ATTACH_BLOCKED: ATTACH_BLOCKED,
  OPAQUE_WAITING: OPAQUE_WAITING,
  OPAQUE_FAILED: OPAQUE_FAILED,
  BANNER: BANNER,
  isOpaqueEvent: isOpaqueEvent,
  opaqueBody: opaqueBody,
  receiptTypeForMessage: receiptTypeForMessage,
  canMarkNotification: canMarkNotification,
};
