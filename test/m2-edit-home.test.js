const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

before(() => {
  const mem = Object.create(null);
  global.wx = {
    getStorageSync(key) {
      return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : '';
    },
    setStorageSync(key, value) {
      mem[key] = value == null ? '' : value;
    },
    removeStorageSync(key) {
      delete mem[key];
    },
    uploadFile(opts) {
      if (opts && opts.success) {
        opts.success({
          statusCode: 200,
          data: JSON.stringify({ url: 'https://cdn.example/p.png', work_id: 'w1' }),
        });
      }
    },
  };
});

describe('M2.3 edit-home / avatar / publish', () => {
  it('creator exposes save publish slug upload helpers', async () => {
    const creator = require('../miniprogram/services/creator');
    assert.equal(typeof creator.mergeDraft, 'function');
    assert.equal(typeof creator.savePage, 'function');
    assert.equal(typeof creator.publishPage, 'function');
    assert.equal(typeof creator.registerSlug, 'function');
    assert.equal(typeof creator.uploadImage, 'function');
    const draft = creator.mergeDraft({ display_name: 'Ada' });
    assert.equal(draft.display_name, 'Ada');
    assert.deepEqual(draft.socials, []);
    assert.deepEqual(draft.sections, []);
    assert.equal(draft.portrait_url, '');

    const uploaded = await creator.uploadImage('tok', '/tmp/a.png', 'profile');
    assert.equal(uploaded.url, 'https://cdn.example/p.png');
    assert.equal(uploaded.work_id, 'w1');
  });

  it('edit-home wires profile fields avatar autosave publish', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.wxml'),
      'utf8'
    );
    assert.match(js, /loadCreatorSession/);
    assert.match(js, /fetchPage/);
    assert.match(js, /registerSlug/);
    assert.match(js, /savePage/);
    assert.match(js, /publishPage/);
    assert.match(js, /uploadImage/);
    assert.match(js, /pickPortrait|chooseMedia|chooseImage/);
    assert.match(js, /updateDraft/);
    assert.match(js, /persist/);
    assert.match(js, /mode === 'profile'|profileOnly/);
    assert.match(js, /section === 'links'|linksOnly/);
    assert.match(js, /主页内容/);
    assert.match(js, /linksPanel|toggleLinksProfile|openPreview|toggleBranding/);
    assert.match(js, /fetchPreviewHtml/);
    assert.match(js, /getMenuButtonBoundingClientRect|readCapsuleNav|navPadTop/);
    assert.match(js, /contentCatalog|loadContentCatalog|pickCatalogEntry/);
    assert.match(js, /saveNewContent/);
    assert.match(js, /copyStudio|studio/);
    assert.match(js, /shareHome|sharePageLink|shareShortLink|openFinishedProduct/);
    assert.match(js, /shareChoicesFor|sharePickerOpen|confirmSharePicker/);
    assert.match(js, /refreshPageAddress|addressDisplay|publishLabel/);
    assert.doesNotMatch(js, /createStubPage/);
    assert.doesNotMatch(js, /编辑链接/);

    assert.match(wxml, /主页内容/);
    assert.match(wxml, /让世界认识你/);
    assert.match(wxml, /显示 MuuZi 品牌/);
    assert.match(wxml, /eh-links-toolbar|添加内容/);
    assert.match(wxml, /eh-links-share-bar|icon-ui-share-ink\.png/);
    assert.match(wxml, /eh-social-icon|social-instagram\.png|iconSrc/);
    assert.match(js, /socialIconSrc|social-instagram/);
    assert.match(wxml, /navPadTop|navHeight/);
    assert.match(wxml, /eh-acs|粘贴或搜索链接|catalogVisible/);
    assert.match(wxml, /eh-acs-ico-img|item\.iconSrc|catalog-/);
    assert.match(js, /catalogIconSrc|brandClass/);
    assert.doesNotMatch(wxml, /eh-acs-ico-instagram|eh-acs-ico-\{\{item\.icon\}\}/);
    assert.match(wxml, /icon-ui-list-accent|icon-ui-expand-accent|icon-ui-person-accent/);
    assert.match(wxml, /icon-ui-share-accent|icon-ui-link-accent|icon-ui-arrow-right/);
    assert.doesNotMatch(wxml, /eh-share-ico-link|eh-share-ico-plane|eh-tb-plus/);
    assert.match(wxml, /icon-ui-plus-ink|icon-ui-eye-ink|icon-ui-list-ink/);
    assert.match(wxml, /eh-preview-full|DRAFT · 仅你可见|closePreview/);
    assert.match(wxml, /eh-preview-nav|eh-ico-back-img|icon-ui-back-ink/);
    assert.doesNotMatch(wxml, /‹ 返回|eh-header eh-header-safe/);
    assert.match(wxml, /icon-ui-share-accent\.png/);
    assert.doesNotMatch(wxml, /eh-preview-back-pill/);
    assert.doesNotMatch(wxml, /eh-plane/);
    assert.match(wxml, /在 MuuZi 上加入/);
    assert.match(wxml, /eh-preview-footer|eh-preview-join/);
    assert.match(wxml, /eh-preview-cover|eh-preview-page|eh-preview-brand/);
    assert.doesNotMatch(wxml, /eh-preview-cta/);
    assert.match(wxml, /reloadCatalog|重新加载|addFormFields/);
    assert.match(wxml, /分享我的 MuuZi|添加到社交简介|主页二维码|数字名片|分享到/);
    assert.match(wxml, /eh-share-card|保存联系人名片/);
    assert.doesNotMatch(wxml, /复制联系人名片/);
    assert.match(wxml, /open-type="\{\{shareUrl \? 'share' : ''\}\}"/);
    assert.match(wxml, /topLevelSectionCount|isCollectionChild|typeLabel|fieldRows/);
    assert.doesNotMatch(wxml, /wx:if="\{\{section\.type === 'links'\}\}"/);
    assert.match(js, /topLevelSectionCount|emptyItemForType|SECTION_LABELS/);
    assert.match(js, /openLinksShare|toggleShareQr|qrcodeDraw|ehShareQr/);
    assert.match(js, /profileShare|openHomePage|friendShareMessage/);
    assert.doesNotMatch(js, /链接已复制；也可点右上角/);
    assert.doesNotMatch(js, /链接已复制，请在浏览器中打开主页/);
    assert.doesNotMatch(wxml, /预览已就绪/);
    assert.doesNotMatch(wxml, /bindtap="addContentLink"/);
    assert.match(js, /contentFields|buildFormFields|prepareItem/);
    assert.match(wxml, /bindtap="pickPortrait"/);
    assert.match(wxml, /bindinput="onNameInput"/);
    assert.match(wxml, /bindinput="onBioInput"/);
    assert.match(wxml, /bindtap="publish"/);
    assert.match(wxml, /SHARE · 预览与分享|看成品|分享短链接|要一个短链接/);
    assert.match(wxml, /bindtap="openFinishedProduct"|bindtap="sharePageLink"|bindtap="shareShortLink"/);
    assert.match(wxml, /eh-btn-publish|发布到|eh-share-picker|分享此地址/);
    assert.match(wxml, /模板、自定义域名、作品库在网页版 Studio 里/);
    assert.doesNotMatch(wxml, /复制 Studio 链接|复制链接|刷新短链接|生成主页短链接|发布主页/);
    assert.match(wxml, /添加链接区块|新建区块|addLinksSection|pickCatalogEntry|submitAddForm/);
    assert.match(wxml, /社交账号|LINKS · 社交链接|eh-social-row/);
  });

  it('full-editor EditHome matches App scroll order and shared preview', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.js'),
      'utf8'
    );
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.wxml'),
      'utf8'
    );
    assert.match(wxml, /主页封面/);
    assert.match(wxml, /让合适的合作找到你/);
    assert.match(wxml, /PROFILE · 资料|PROFILE/);
    assert.match(wxml, /LINKS · 社交链接/);
    assert.match(wxml, /SECTIONS · 区块/);
    assert.match(wxml, /随机换一个/);
    assert.match(wxml, /添加一张代表你的封面/);
    assert.match(wxml, /上下取景|cover_position|onCoverPosition/);
    assert.match(wxml, /eh-swatch|主页配色/);
    assert.match(wxml, /eh-editor|eh-portrait-box|eh-ghost|eh-control/);
    assert.match(wxml, /ehAvatarCanvas/);
    const wxss = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/edit-home/index.wxss'),
      'utf8'
    );
    assert.match(wxss, /aspect-ratio:\s*3\s*\/\s*1/);
    assert.match(wxss, /width:\s*68rpx/);
    assert.match(wxss, /border-radius:\s*40rpx/);
    assert.match(wxss, /\.eh-ghost[\s\S]*var\(--app-ink\)/);
    assert.match(wxss, /\.eh-control[\s\S]*var\(--app-bg\)/);
    const linksOnlyIdx = wxml.indexOf("phase === 'editing' && linksOnly");
    const fullEditorIdx = wxml.indexOf('完整编辑 / 个人资料');
    const previewIdx = wxml.indexOf('wx:if="{{previewOpen}}"');
    assert.ok(linksOnlyIdx >= 0, 'linksOnly branch present');
    assert.ok(fullEditorIdx > linksOnlyIdx, 'full editor after linksOnly');
    assert.ok(
      previewIdx > fullEditorIdx,
      'previewOpen after full-editor block (page root)'
    );
    assert.equal((wxml.match(/wx:if="\{\{previewOpen\}\}"/g) || []).length, 1);
    assert.match(js, /STATUS_COPY[\s\S]*未保存/);
    assert.match(js, /保存中…/);
    assert.match(js, /pickCover|removeCover|onCoverPosition|randomPortrait/);
    assert.match(js, /patchMetadata|syncLanguageOptions|publishedMetaText/);
    assert.match(js, /avatarStyleOptions|languageOptions|publishedMetaCopy/);
  });

  it('contentCatalog normalizes and filters like App', () => {
    const catalog = require('../miniprogram/services/contentCatalog');
    assert.equal(typeof catalog.loadContentCatalog, 'function');
    assert.equal(typeof catalog.filterCatalog, 'function');
    const items = catalog.normalizeCatalog({
      items: catalog.FALLBACK_ITEMS,
    });
    assert.ok(items.length >= 7);
    assert.ok(items.some((i) => i.title.indexOf('TikTok') >= 0));
    assert.ok(items.some((i) => i.title.indexOf('YouTube') >= 0));
    const recommended = catalog.filterCatalog(items, 'recommended', '');
    assert.ok(recommended.length >= 5);
    assert.equal(catalog.catalogUrl('https://www.muuzi.co/x'), 'https://www.muuzi.co/x');
    assert.equal(catalog.catalogUrl('http://bad.example'), null);
    assert.equal(catalog.catalogIconSrc('instagram'), '/assets/catalog-instagram.png');
    assert.equal(catalog.catalogIconSrc('download'), '/assets/catalog-download.png');
    assert.equal(catalog.catalogIconSrc('unknown'), '/assets/catalog-link.png');
    assert.equal(catalog.brandClass('instagram'), 'brand-ig');
    assert.equal(catalog.brandClass('black'), 'brand-tk');
    assert.equal(catalog.brandClass('sky'), 'brand-sky');
    const assets = path.join(root, 'miniprogram/assets');
    for (const name of [
      'instagram',
      'tiktok',
      'youtube',
      'spotify',
      'image',
      'download',
      'map',
      'link',
    ]) {
      assert.ok(
        fs.existsSync(path.join(assets, `catalog-${name}.png`)),
        `missing catalog-${name}.png`
      );
    }
  });

  it('profile page redirects into edit-home profile mode', () => {
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/profile/index.js'),
      'utf8'
    );
    assert.match(js, /edit-home\/index\?mode=profile/);
    assert.match(js, /redirectTo|navigateTo/);
    assert.doesNotMatch(js, /createStubPage/);
  });
});
