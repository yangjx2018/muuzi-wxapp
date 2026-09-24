const session = require('../../../services/session');

/** 子页诚实占位：标明后续切片，禁止假装已实现 */
function createStubPage(options) {
  return {
    data: {
      title: options.title,
      lead: options.lead,
      slice: options.slice || 'M2.x',
    },
    onShow: function () {
      if (!session.requireSignedInOrRedirect()) return;
    },
    goBack: function () {
      wx.navigateBack({
        fail: function () {
          wx.switchTab({ url: '/pages/me/index' });
        },
      });
    },
  };
}

module.exports = { createStubPage: createStubPage };
