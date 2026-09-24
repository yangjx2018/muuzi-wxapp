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
  };
});

describe('M2.4 me subpages read/write paths', () => {
  it('creator exports interests storefront contacts subjects helpers', () => {
    const creator = require('../miniprogram/services/creator');
    [
      'fetchInterests',
      'saveInterests',
      'fetchSlugPolicy',
      'fetchStorefront',
      'saveStorefront',
      'fetchContacts',
      'patchContact',
      'deleteContact',
      'fetchContactSettings',
      'saveContactSettings',
      'listSubjects',
      'createSubject',
      'setSubjectActive',
      'fetchSaved',
      'reactToPost',
      'fetchAgentTokens',
      'createAgentToken',
      'revokeAgentToken',
      'fetchPersona',
      'savePersona',
      'fetchAgents',
      'createAgent',
      'updateAgent',
      'publishAgent',
      'disableAgent',
      'agentCardUrl',
      'fetchInvitation',
      'createInvitation',
      'deleteInvitation',
      'fetchEnterpriseInvitations',
      'acceptEnterpriseInvitation',
      'updateEnterpriseDisplay',
      'createShortLink',
    ].forEach(function (name) {
      assert.equal(typeof creator[name], 'function', name);
    });
  });

  it('accountSecurity probes Matrix password change', () => {
    const sec = require('../miniprogram/services/accountSecurity');
    assert.equal(typeof sec.canChangePassword, 'function');
    assert.equal(typeof sec.changePassword, 'function');
    assert.match(sec.authErrorMessage({ code: 'M_WEAK_PASSWORD' }), /强度不足/);
  });

  it('subpages leave stubs and wire main paths', () => {
    const pages = [
      ['interests', /saveInterests|fetchInterests/],
      ['address', /fetchSlugPolicy|registerSlug/],
      ['shop', /fetchStorefront|saveStorefront/],
      ['spaces', /fetchOrgs/],
      ['contacts', /fetchContacts|saveContactSettings/],
      ['subjects', /listSubjects|createSubject/],
      ['security', /accountSecurity|changePassword/],
      ['saved', /fetchSaved|reactToPost/],
      ['agent-access', /fetchAgentTokens|createAgentToken|savePersona/],
      ['sharing', /fetchAgents|createInvitation|agentCardUrl/],
      [
        'enterprise-invitations',
        /fetchEnterpriseInvitations|acceptEnterpriseInvitation|updateEnterpriseDisplay/,
      ],
    ];
    pages.forEach(function (pair) {
      const js = fs.readFileSync(
        path.join(root, 'miniprogram/pages/me', pair[0], 'index.js'),
        'utf8'
      );
      assert.doesNotMatch(js, /createStubPage/, pair[0] + ' still stub');
      assert.match(js, pair[1], pair[0] + ' missing API');
      assert.match(js, /loadCreatorSession|requireSignedInOrRedirect/, pair[0]);
    });

    const contacts = fs.readFileSync(
      path.join(root, 'miniprogram/pages/me/contacts/index.wxml'),
      'utf8'
    );
    assert.match(contacts, /打开留言频道|openInboxChannel|等待消息同步/);
    assert.match(contacts, /开启公开留言|toggleEnabled/);

    ['saved', 'agent-access', 'sharing', 'enterprise-invitations'].forEach(
      function (name) {
        const wxml = fs.readFileSync(
          path.join(root, 'miniprogram/pages/me', name, 'index.wxml'),
          'utf8'
        );
        const wxss = fs.readFileSync(
          path.join(root, 'miniprogram/pages/me', name, 'index.wxss'),
          'utf8'
        );
        assert.match(wxml, /class="mp"/, name + ' missing mp shell');
        assert.doesNotMatch(wxml, /me-stub/, name + ' still stub markup');
        assert.match(wxss, /_page\.wxss/, name + ' missing shared styles');
      }
    );
  });
});
