/** 对齐 MuuziGit fieldCapabilities.ts */
var FIELD_JOIN_DRAFT_PROTOCOL = 'muuzi-field-connect/1-draft';

var textFeatures = ['invitation', 'guestText', 'history', 'hostRecipient'];
var futureFeatures = [
  'guestSpeech',
  'sessionRefresh',
  'accountJoin',
  'identityClaim',
  'homepageDelivery',
  'continuousRecording',
  'nfc',
];

function closed(reason) {
  return { canStartText: false, reason: reason };
}

function sortedKeys(obj) {
  return Object.keys(obj).sort().join(',');
}

/** 无网络。仅当协议与 pinned 一致且文字能力全开时 canStartText。 */
function fieldAvailability(raw, instanceId, pinnedProtocol) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return closed('invalid');
  }
  if (
    raw.protocol !== FIELD_JOIN_DRAFT_PROTOCOL ||
    pinnedProtocol !== FIELD_JOIN_DRAFT_PROTOCOL
  ) {
    return closed('unsupported');
  }
  if (
    !/^[1-9][0-9]*$/.test(instanceId) ||
    raw.instanceId !== instanceId ||
    typeof raw.enabled !== 'boolean'
  ) {
    return closed('invalid');
  }
  if (
    !raw.features ||
    typeof raw.features !== 'object' ||
    Array.isArray(raw.features) ||
    !raw.limits ||
    typeof raw.limits !== 'object' ||
    Array.isArray(raw.limits)
  ) {
    return closed('invalid');
  }
  var features = raw.features;
  var limits = raw.limits;
  var expectedFeatureKeys = textFeatures
    .concat(futureFeatures)
    .slice()
    .sort()
    .join(',');
  if (
    sortedKeys(raw) !== 'enabled,features,instanceId,limits,protocol' ||
    sortedKeys(features) !== expectedFeatureKeys ||
    sortedKeys(limits) !==
      'guestSessionMaxSeconds,historyPageEvents,textBytes' ||
    !textFeatures.every(function (key) {
      return typeof features[key] === 'boolean';
    }) ||
    !futureFeatures.every(function (key) {
      return features[key] === false;
    }) ||
    limits.textBytes !== 2000 ||
    limits.historyPageEvents !== 50 ||
    limits.guestSessionMaxSeconds !== 604800
  ) {
    return closed('invalid');
  }
  if (
    !raw.enabled ||
    !textFeatures.every(function (key) {
      return features[key] === true;
    })
  ) {
    return closed('unavailable');
  }
  return { canStartText: true, reason: 'ready' };
}

module.exports = {
  FIELD_JOIN_DRAFT_PROTOCOL: FIELD_JOIN_DRAFT_PROTOCOL,
  fieldAvailability: fieldAvailability,
};
