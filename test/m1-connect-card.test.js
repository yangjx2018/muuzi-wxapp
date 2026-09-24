const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sources = require('../miniprogram/services/fieldCardSources');
const namecard = require('../miniprogram/services/fieldNamecard');

describe('M1.2 Connect Card', () => {
  it('fieldCardSources filters org/virtual like App', () => {
    const orgs = [
      { id: 'org_abc', name: 'Acme', slug: 'acme', status: 'active', role: 'owner' },
      { id: 'org_bad', name: 'X', slug: 'x', status: 'active', role: 'member' },
      { id: 'nope', name: 'Y', slug: 'y', status: 'active', role: 'admin' },
    ];
    const subjects = [
      {
        id: 'vs_one',
        name: 'Virt',
        slug: 'virt',
        form: 'org',
        status: 'active',
        restriction: null,
        suspended_at: null,
        quota_blocked: false,
      },
      {
        id: 'vs_two',
        name: 'PersonForm',
        slug: 'pf',
        form: 'person',
        status: 'active',
      },
    ];
    const list = sources.companyCardSources(orgs, subjects);
    assert.equal(list[0].key, 'person');
    assert.equal(list.length, 3);
    assert.equal(list[1].key, 'org:org_abc');
    assert.equal(list[2].key, 'virtual:vs_one');
    assert.equal(sources.allowedCompanyCard(orgs[1]), false);
    assert.equal(sources.allowedVirtualCard(subjects[1]), false);
  });

  it('publishedNamecard only returns published snapshot urls', async () => {
    const unpublished = await namecard.publishedNamecard(
      { slug: 'a', published: null },
      'https://www.muuzi.co',
      async (u) => u
    );
    assert.equal(unpublished, null);

    const card = await namecard.publishedNamecard(
      {
        slug: 'alice',
        page_url: 'https://www.muuzi.co/alice',
        published: {
          display_name: '  Alice  ',
          headline: 'Hello',
          portrait_url: 'https://cdn.example/p.png',
        },
      },
      'https://www.muuzi.co',
      async (u) => u + '?ok=1'
    );
    assert.equal(card.name, 'Alice');
    assert.equal(card.headline, 'Hello');
    assert.equal(card.url, 'https://www.muuzi.co/alice?ok=1');
    assert.equal(card.portrait, 'https://cdn.example/p.png');

    assert.throws(
      () => namecard.shareTextUrl('http://insecure.example/x'),
      /分享地址无效/
    );
  });

  it('card page wires multi-source, QR, copy, unpublished', () => {
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/card/index.wxml'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/card/index.js'),
      'utf8'
    );
    assert.match(wxml, /展示哪张名片/);
    assert.match(wxml, /复制主页链接/);
    assert.match(wxml, /先发布这份主页/);
    assert.match(wxml, /扫码查看这份 MuuZi 主页/);
    assert.match(wxml, /不会赠送卡片、添加好友或分享现场交流/);
    assert.match(wxml, /canvas-id="namecardQr"/);
    assert.match(js, /companyCardSources/);
    assert.match(js, /publishedNamecard/);
    assert.match(js, /resolveShareAddress/);
    assert.match(js, /setClipboardData/);
    assert.match(js, /drawUrlToTempFile/);
    assert.match(js, /require\('\.\.\/\.\.\/\.\.\/services\/session'\)/);
  });

  it('creator maps app-code 404 to actionable error', () => {
    const js = fs.readFileSync(
      path.join(__dirname, '../miniprogram/services/creator.js'),
      'utf8'
    );
    assert.match(js, /APP_CODE_UNAVAILABLE/);
    assert.match(js, /未开通 MuuZi 身份换票/);
  });

  it('vendors uQRCode with license and creator page APIs', () => {
    assert.ok(
      fs.existsSync(path.join(root, 'miniprogram/utils/uqrcode.js'))
    );
    assert.ok(
      fs.existsSync(path.join(root, 'miniprogram/utils/uqrcode.LICENSE.md'))
    );
    const creator = fs.readFileSync(
      path.join(root, 'miniprogram/services/creator.js'),
      'utf8'
    );
    assert.match(creator, /fetchPage/);
    assert.match(creator, /fetchOrgs/);
    assert.match(creator, /fetchPublicPage/);
    assert.match(creator, /fetchOrgPage/);
  });
});
