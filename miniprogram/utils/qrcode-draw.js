/**
 * 基于 vendored uQRCode（见 uqrcode.LICENSE.md）在旧版 canvas 上绘制并导出临时图。
 */
const UQRCode = require('./uqrcode.js');

var QR_SIZE = 280;

function drawUrlToTempFile(page, canvasId, url) {
  if (!url) return Promise.reject(new Error('缺少地址'));
  var qr = new UQRCode();
  qr.data = url;
  qr.size = QR_SIZE;
  qr.margin = 10;
  qr.errorCorrectLevel = UQRCode.errorCorrectLevel.M;
  qr.foregroundColor = '#15171e';
  qr.backgroundColor = '#ffffff';
  qr.make();
  var ctx = wx.createCanvasContext(canvasId, page);
  qr.canvasContext = ctx;
  return qr.drawCanvas().then(function () {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        wx.canvasToTempFilePath(
          {
            canvasId: canvasId,
            width: QR_SIZE,
            height: QR_SIZE,
            destWidth: QR_SIZE * 2,
            destHeight: QR_SIZE * 2,
            fileType: 'png',
            success: function (res) {
              resolve(res.tempFilePath);
            },
            fail: function () {
              reject(new Error('二维码导出失败'));
            },
          },
          page
        );
      }, 80);
    });
  });
}

module.exports = {
  QR_SIZE: QR_SIZE,
  drawUrlToTempFile: drawUrlToTempFile,
};
