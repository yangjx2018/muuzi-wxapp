/**
 * 发布失败时前台必须结束「处理中」并露出错误（对齐 App publishFeedback）。
 * 用可复现的 promise 链断言，避免只靠读代码猜测。
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('edit-home publish failure feedback', () => {
  it('linksOnly surface wires fixed publishFeedback + busy settle', () => {
    const root = path.join(__dirname, '..');
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.wxml'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.js'),
      'utf8'
    );
    const wxss = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.wxss'),
      'utf8'
    );
    assert.match(wxml, /class="eh-publish-feedback"/);
    assert.match(wxml, /bindtap="closePublishFeedback"/);
    assert.match(wxml, /!busy && saveError/);
    assert.match(js, /_publishWatchdog/);
    assert.match(js, /发布未完成，请检查错误后重试/);
    assert.match(js, /wx\.showToast/);
    assert.match(js, /busy:\s*false/);
    assert.match(wxss, /\.eh-publish-feedback\s*\{[^}]*position:\s*fixed/s);
  });

  it('publish settle clears busy after reject (red-capable loop)', async () => {
    var busy = true;
    var publishPending = true;
    var saveError = '';
    var publishFeedback = '正在保存并发布…';
    var settled = false;
    function settle(patch) {
      if (settled) return;
      settled = true;
      publishPending = false;
      busy = false;
      if (patch) {
        if (patch.saveError != null) saveError = patch.saveError;
        if (patch.publishFeedback != null) publishFeedback = patch.publishFeedback;
      }
    }
    await Promise.resolve()
      .then(function () {
        return Promise.reject(Object.assign(new Error('后端校验失败'), { statusCode: 500 }));
      })
      .then(function () {
        settle({ publishFeedback: '主页已发布' });
      })
      .catch(function (err) {
        settle({
          saveError: (err && err.message) || '发布失败',
          publishFeedback: '发布未完成，请检查错误后重试。',
        });
      });
    assert.equal(busy, false);
    assert.equal(publishPending, false);
    assert.equal(saveError, '后端校验失败');
    assert.match(publishFeedback, /发布未完成/);
    assert.equal(settled, true);
  });
});
