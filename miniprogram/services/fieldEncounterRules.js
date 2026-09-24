/** 对齐 MuuziGit fieldEncounterRules.ts */

function fieldErrorMessage(code) {
  if (code === 'STALE_REVISION' || code === 'ENCOUNTER_CLOSED') {
    return '话题状态已改变，请刷新列表后重试。';
  }
  if (code === 'FIELD_ACCESS_DENIED' || code === 'HISTORY_NOT_AVAILABLE') {
    return '当前节点尚未开放这项功能。';
  }
  if (code === 'AUTH_REQUIRED' || code === 'HUMAN_IDENTITY_REQUIRED') {
    return '请使用本人账号重新登录。';
  }
  if (code === 'RATE_LIMITED') {
    return '操作过于频繁，请稍后重试。';
  }
  if (code === 'ENCOUNTER_UNAVAILABLE') {
    return '话题不可用，请刷新列表。';
  }
  return '请求未能确认，请使用原请求重试；不要重复创建话题。';
}

function isFieldEncounter(value) {
  if (!value || typeof value !== 'object') return false;
  return (
    typeof value.encounterId === 'string' &&
    /^encounter_[a-z0-9-]+$/.test(value.encounterId) &&
    typeof value.participantId === 'string' &&
    Number.isInteger(value.revision) &&
    Number(value.revision) > 0 &&
    (value.lifecycle === 'open' || value.lifecycle === 'closed') &&
    value.saveHistory === false &&
    typeof value.eventName === 'string' &&
    typeof value.sourceLanguage === 'string' &&
    typeof value.targetLanguage === 'string' &&
    typeof value.createdAt === 'string' &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    (value.endedAt === null ||
      (typeof value.endedAt === 'string' &&
        Number.isFinite(Date.parse(value.endedAt))))
  );
}

function isDeletedEncounter(value, encounterId) {
  if (!value || typeof value !== 'object') return false;
  return (
    value.encounterId === encounterId &&
    value.lifecycle === 'deleted' &&
    Number.isInteger(value.revision) &&
    Number(value.revision) > 1
  );
}

module.exports = {
  fieldErrorMessage: fieldErrorMessage,
  isFieldEncounter: isFieldEncounter,
  isDeletedEncounter: isDeletedEncounter,
};
