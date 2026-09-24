/** 对齐 MuuziGit fieldVisitorCopy.ts（zh/en 完整；其余语言用 en 回退键集合） */
var primary = {
  zh: {
    name: '你的称呼',
    consent:
      '同意将本次文字交流保存到所示节点，并由邀请人确认加入。不会自动加好友。',
    join: '申请加入',
    waiting: '等待邀请人确认…',
    refresh: '重新检查',
    send: '发送',
    retry: '重试原消息',
    older: '更早的交流',
    message: '输入消息',
    error: '暂未完成，请检查网络后重试。',
    closed: '这次交流已结束或授权已失效。',
    host: '邀请人',
    guest: '你 · 访客记录',
    language: '文字语言',
    exit: '离开交流',
    title: '文字交流',
    local:
      '为刷新后接续，本机会保存临时凭据与未确认文字。请勿在共用设备上使用。',
  },
  en: {
    name: 'Your name',
    consent:
      'Allow this text conversation to be saved on the displayed node. Your host must approve your request. This does not add a friend.',
    join: 'Request to join',
    waiting: 'Waiting for your host…',
    refresh: 'Check again',
    send: 'Send',
    retry: 'Retry original message',
    older: 'Earlier messages',
    message: 'Write a message',
    error: 'Could not complete this action. Check your connection and retry.',
    closed: 'This conversation has ended or access has expired.',
    host: 'Host',
    guest: 'You · guest record',
    language: 'Text language',
    exit: 'Leave conversation',
    title: 'Text conversation',
    local:
      'This device stores temporary credentials and unconfirmed text so you can resume. Avoid shared devices.',
  },
};

var fieldVisitorCopy = {
  zh: primary.zh,
  en: primary.en,
  ja: primary.en,
  ko: primary.en,
  fr: primary.en,
  de: primary.en,
  es: primary.en,
  pt: primary.en,
};

var fieldVisitorExitCopy = {
  zh: {
    end: '结束并清除此设备',
    explain:
      '关闭本次访客授权，并清除此设备的临时凭据和待发送文字。已保存的交流仍保留在节点；结果未确认的消息可能已送达。结束后不能用此邀请重新加入。',
    confirm: '确认结束',
    cancel: '取消',
    pause: '暂时离开',
    paused: '已暂停。可以返回接续，也可以结束并清除此设备。',
  },
  en: {
    end: 'End and clear this device',
    explain:
      'Close guest access and clear temporary credentials and unsent text from this device. Saved messages stay on the node; unconfirmed messages may already have arrived. This invitation cannot be used again.',
    confirm: 'Confirm end',
    cancel: 'Cancel',
    pause: 'Leave for now',
    paused: 'Paused. Resume here, or end and clear this device.',
  },
};

['ja', 'ko', 'fr', 'de', 'es', 'pt'].forEach(function (lang) {
  fieldVisitorExitCopy[lang] = fieldVisitorExitCopy.en;
});

function visitorCopy(language) {
  return fieldVisitorCopy[language] || fieldVisitorCopy.en;
}

function visitorExitCopy(language) {
  return fieldVisitorExitCopy[language] || fieldVisitorExitCopy.en;
}

module.exports = {
  fieldVisitorCopy: fieldVisitorCopy,
  fieldVisitorExitCopy: fieldVisitorExitCopy,
  visitorCopy: visitorCopy,
  visitorExitCopy: visitorExitCopy,
};
