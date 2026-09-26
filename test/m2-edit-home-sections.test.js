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
    assert.ok(
      contentFields.fieldsForType('video').some(
        (f) => f.key === 'cover_url' && f.kind === 'image'
      ),
      'video must include cover_url image field like App'
    );
    assert.ok(
      contentFields.fieldsForType('links').some(
        (f) => f.key === 'image_url' && f.kind === 'image'
      )
    );
    assert.ok(
      contentFields.fieldsForType('custom').some(
        (f) => f.key === 'image_url' && f.kind === 'image'
      )
    );
    assert.ok(
      contentFields.fieldsForType('shop').some(
        (f) => f.key === 'image_url' && f.kind === 'image'
      )
    );
  });

  it('compact card expanded body matches App field layout and tools', () => {
    const root = path.join(__dirname, '..');
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.wxml'),
      'utf8'
    );
    const wxss = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.wxss'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.js'),
      'utf8'
    );
    const tools = require('../miniprogram/services/studioCardTools');
    assert.doesNotMatch(wxml, /field\.key !== item\.titleKey/);
    assert.doesNotMatch(wxml, /class="eh-item-tools"/);
    assert.match(wxml, /eh-scc-item-tools/);
    assert.match(wxml, /aria-label="上移"/);
    assert.match(wxml, /aria-label="下移"/);
    assert.match(wxml, /aria-label="删除这一条"/);
    assert.match(wxml, />↑</);
    assert.match(wxml, />↓</);
    assert.match(wxml, /eh-scc-item-tool-remove"[^>]*>×</);
    assert.match(wxml, /eh-scc-layout-select/);
    assert.match(wxml, /tool-thumbnail\.svg|tool-highlight\.svg|tool-rules\.svg/);
    assert.match(wxml, /tool-schedule\.svg|tool-access\.svg|tool-stats\.svg|tool-copy\.svg/);
    assert.match(wxml, /从素材库选择|使用图片链接|eh-scc-panel-input|openThumbSource/);
    assert.match(wxml, /选择缩略图来源|上传自己的图片|Tabler/);
    assert.match(wxml, /eh-scc-unavail-radio|eh-scc-unavail-detail|当前：不重点展示|unavailableCurrent/);
    assert.match(wxml, /openRulesDialog|国家／地区规则|应用（未开通）|rulesDialogOpen/);
    assert.match(wxml, /eh-scc-datetime|mode="date"|mode="time"|开始展示|结束展示|disabled="\{\{true\}\}"/);
    assert.match(wxml, /eh-scc-datetime-off/);
    assert.doesNotMatch(
      wxml,
      /unavailableControl === 'schedule'[\s\S]*?eh-scc-panel-select-off">未开通</
    );
    assert.doesNotMatch(wxml, /onScheduleStartDate|bindchange="onSchedule/);
    assert.match(wxml, /eh-scc-insight-tabs|流量来源（未开通）|国家／地区（未开通）|toolStatsBlocked/);
    assert.match(js, /fetchWorks|onThumbUrlInput|onThumbWorkPick|thumbWorks/);
    assert.match(js, /unavailableControl|unavailableCurrent/);
    assert.match(js, /openRulesDialog|closeRulesDialog|rulesDialogOpen/);
    assert.doesNotMatch(js, /onScheduleStartDate|scheduleStartDate/);
    assert.match(js, /toolStatsBlocked|blocked:\s*true/);
    assert.match(wxss, /\.eh-scc-datetime/);
    assert.match(wxss, /\.eh-scc-datetime-off/);
    assert.match(wxss, /\.eh-scc-insight-tabs/);
    const toolsSrc = fs.readFileSync(
      path.join(root, 'miniprogram/services/studioCardTools.js'),
      'utf8'
    );
    assert.match(toolsSrc, /用轻微动画吸引访客注意|当前：不重点展示|control:\s*'radio'/);
    assert.doesNotMatch(wxml, /eh-ico-thumb|eh-ico-star|eh-ico-rules|eh-ico-schedule|eh-ico-lock/);
    assert.match(wxss, /\.eh-scc-item-tools/);
    assert.match(wxss, /\.eh-scc-layout-select/);
    assert.match(wxss, /\.eh-scc-field-input[\s\S]*?height:\s*88rpx/);
    assert.match(wxss, /\.eh-scc-field-input[\s\S]*?padding:\s*0\s+20rpx/);
    assert.doesNotMatch(
      wxss,
      /\.eh-scc-field-input\s*\{[^}]*padding:\s*16rpx/
    );
    assert.equal(tools.brandIconSrc('youtube'), '/assets/social-youtube-on.svg');
    const assets = path.join(root, 'miniprogram/assets');
    for (const name of [
      'tool-thumbnail',
      'tool-highlight',
      'tool-rules',
      'tool-schedule',
      'tool-access',
      'tool-stats',
      'tool-copy',
    ]) {
      assert.ok(
        fs.existsSync(path.join(assets, `${name}.svg`)),
        `missing ${name}.svg`
      );
    }
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
