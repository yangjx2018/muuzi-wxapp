/**
 * 对齐 App fieldInvitationPreview.checkFieldInvitation
 * 仅精确核验过的 open 邀请才允许展示访客加入表单。
 */

function checkFieldInvitation(link, request, nowMs) {
  var now = typeof nowMs === 'function' ? nowMs : Date.now;
  return Promise.resolve()
    .then(function () {
      return request({
        invitationId: link.invitationId,
        joinProof: link.joinProof,
      });
    })
    .then(function (result) {
      if (
        !result ||
        result.id !== link.invitationId ||
        (result.status !== 'open' && result.status !== 'closed') ||
        !Number.isSafeInteger(result.expiresAt) ||
        result.expiresAt !== link.expiresAt
      ) {
        throw Object.assign(new Error('INVITATION_PREVIEW_INVALID'), {
          code: 'INVITATION_PREVIEW_INVALID',
        });
      }
      return result.status === 'open' && result.expiresAt > now();
    })
    .catch(function (error) {
      var code = (error && error.code) || '';
      if (code === 'INVITATION_CLOSED' || code === 'INVITATION_UNAVAILABLE') {
        return false;
      }
      throw error;
    });
}

module.exports = {
  checkFieldInvitation: checkFieldInvitation,
};
