const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const contentFields = require('../miniprogram/services/contentFields');

describe('edit-home section parity with App', () => {
  it('contentFields exposes custom and non-links section labels', () => {
    assert.equal(contentFields.SECTION_LABELS.custom, '自定义');
    assert.equal(contentFields.SECTION_LABELS.video, '影像');
    assert.ok(contentFields.fieldsForType('custom').some((f) => f.key === 'title'));
    assert.ok(contentFields.fieldsForType('custom').some((f) => f.key === 'body'));
  });

  it('links-only list no longer filters to links-only cards', () => {
    const wxml = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/me/edit-home/index.wxml'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(__dirname, '../miniprogram/pages/me/edit-home/index.js'),
      'utf8'
    );
    assert.doesNotMatch(wxml, /wx:if="\{\{section\.type === 'links'\}\}"/);
    assert.match(wxml, /!section\.isCollectionChild/);
    assert.match(wxml, /section\.typeLabel/);
    assert.match(wxml, /item\.fieldRows/);
    assert.match(js, /topLevelSectionCount/);
    assert.match(js, /isCollectionChild/);
    assert.match(js, /emptyItemForType/);
  });
});
