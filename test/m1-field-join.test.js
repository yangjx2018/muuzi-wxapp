const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
    getSystemInfoSync() {
      return { language: 'zh_CN' };
    },
  };
  global.btoa = (bin) => Buffer.from(bin, 'binary').toString('base64');
});

describe('M1.6 Join visitor text path', () => {
  it('field-crypto proof and sha256 match Node', () => {
    const fieldCrypto = require('../miniprogram/utils/field-crypto');
    const proof = fieldCrypto.randomProof();
    assert.match(proof, /^[A-Za-z0-9_-]{43}$/);
    const sample = 'hello-field';
    assert.equal(
      fieldCrypto.sha256Hex(sample),
      crypto.createHash('sha256').update(sample, 'utf8').digest('hex')
    );
    assert.equal(fieldCrypto.utf8ByteLength('你好'), 6);
  });

  it('parseFieldLink and query only accept registry shape', () => {
    const api = require('../miniprogram/services/fieldNodeApi');
    const proof = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
    assert.equal(proof.length, 43);
    const id = '11111111-1111-4111-8111-111111111111';
    const url =
      'https://www.muuzi.co/connect/join/' +
      id +
      '#n=7&p=' +
      proof +
      '&e=1893456000000';
    const link = api.parseFieldLink(url);
    assert.equal(link.instanceId, '7');
    assert.equal(link.invitationId, id);
    assert.equal(link.joinProof, proof);

    const q = api.parseFieldQuery({
      id: id,
      n: '7',
      p: proof,
      e: '1893456000000',
    });
    assert.equal(q.joinProof, proof);

    assert.throws(() => api.parseFieldLink('not-a-url'), /FIELD_LINK_INVALID/);
    const node = api.approvedFieldNode('7');
    assert.equal(node.origin, 'https://im.muuzi.co');
    assert.equal(api.approvedFieldNode('999'), null);
  });

  it('fieldAvailability requires draft protocol features', () => {
    const caps = require('../miniprogram/services/fieldCapabilities');
    const ready = {
      protocol: 'muuzi-field-connect/1-draft',
      instanceId: '7',
      enabled: true,
      features: {
        invitation: true,
        guestText: true,
        history: true,
        hostRecipient: true,
        guestSpeech: false,
        sessionRefresh: false,
        accountJoin: false,
        identityClaim: false,
        homepageDelivery: false,
        continuousRecording: false,
        nfc: false,
      },
      limits: {
        textBytes: 2000,
        historyPageEvents: 50,
        guestSessionMaxSeconds: 604800,
      },
    };
    assert.equal(
      caps.fieldAvailability(ready, '7', 'muuzi-field-connect/1-draft')
        .canStartText,
      true
    );
    assert.equal(
      caps.fieldAvailability(ready, '7', null).canStartText,
      false
    );
  });

  it('visitorEntry resolves App invite URL against registry', () => {
    const entry = require('../miniprogram/services/fieldVisitorEntry');
    const p = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
    assert.equal(p.length, 43);
    const id = '22222222-2222-4222-8222-222222222222';
    const url =
      'https://www.muuzi.co/connect/join/' +
      id +
      '#n=7&p=' +
      p +
      '&e=1893456000000';
    const resolved = entry.visitorEntryFromUrl(url);
    assert.ok(resolved);
    assert.equal(resolved.node.instanceId, '7');
    assert.equal(resolved.link.joinProof, p);
    assert.equal(
      entry.visitorEntryFromUrl(
        'https://evil.example/connect/join/' + id + '#n=7&p=' + p + '&e=1893456000000'
      ),
      null
    );
  });

  it('visitor session prepare/bind and join waiting phase', async () => {
    const guest = require('../miniprogram/services/fieldGuestPersistence');
    const sessionStore = require('../miniprogram/services/fieldVisitorSession');
    const joinMod = require('../miniprogram/services/fieldVisitorJoin');
    const fieldCrypto = require('../miniprogram/utils/field-crypto');

    const persistence = guest.wxGuestPersistence();
    const invitationId = '33333333-3333-4333-8333-333333333333';
    const expiresAt = Date.now() + 3600_000;
    const store = sessionStore.createVisitorSessionStore(
      {
        instanceId: '7',
        nodeOrigin: 'https://im.muuzi.co',
        invitationId: invitationId,
        invitationExpiresAt: expiresAt,
      },
      persistence
    );
    const joinProof = fieldCrypto.randomProof();
    let requested = false;
    const join = joinMod.createVisitorJoin(
      store,
      {
        request: async (body) => {
          requested = true;
          assert.equal(body.joinProof, joinProof);
          assert.equal(body.consent, 'field-join-v1');
          return {
            id: invitationId,
            status: 'pending',
            revision: 1,
            expiresAt: expiresAt,
          };
        },
        poll: async () => ({
          id: invitationId,
          status: 'pending',
          revision: 1,
          expiresAt: expiresAt,
        }),
        exchange: async () => {
          throw new Error('should not exchange while pending');
        },
        status: async () => {
          throw new Error('no session yet');
        },
        leave: async () => ({
          id: invitationId,
          status: 'revoked',
          revision: 2,
          expiresAt: expiresAt,
        }),
      },
      () => true
    );

    const view = await join.submit('访客甲', joinProof, 'field-join-v1');
    assert.equal(view.phase, 'waiting');
    assert.equal(requested, true);
    const again = await join.resume();
    assert.equal(again.phase, 'waiting');
  });

  it('join page wires guest flow without login require', () => {
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/join/index.wxml'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/join/index.js'),
      'utf8'
    );
    const appJs = fs.readFileSync(
      path.join(root, 'miniprogram/app.js'),
      'utf8'
    );
    assert.match(wxml, /加入现场交流|copy\.title/);
    assert.match(wxml, /粘贴邀请链接|copy\.paste/);
    assert.match(wxml, /copy\.speech|说话语言会另外选择/);
    assert.match(wxml, /申请加入|vCopy\.join/);
    assert.match(wxml, /等待邀请人确认|vCopy\.waiting/);
    assert.match(wxml, /结束并清除此设备|eCopy\.end/);
    assert.match(js, /resolveVisitorEntry|visitorEntryFromUrl/);
    assert.match(js, /guest\/capabilities/);
    assert.match(js, /createVisitorJoin/);
    assert.match(js, /createVisitorDelivery/);
    assert.match(js, /field-join-v1/);
    assert.match(appJs, /pages\/connect\/join/);
    assert.match(appJs, /guestOk/);
  });
});
