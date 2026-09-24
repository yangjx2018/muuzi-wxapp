const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const rules = require(path.join(__dirname, '../miniprogram/services/rules.js'));
const nodeService = require(path.join(__dirname, '../miniprogram/services/node.js'));

describe('M0 rules', () => {
  it('validates login / email / password like App', () => {
    assert.equal(rules.validLogin('alice', 'x'), true);
    assert.equal(rules.validLogin('', 'x'), false);
    assert.equal(rules.resolvedLoginMethod('a@b.co'), 'email');
    assert.equal(rules.resolvedLoginMethod('alice'), 'account');
    assert.equal(rules.validNewPassword('abcdefg1'), true);
    assert.equal(rules.validNewPassword('abcdefgh'), false);
    assert.equal(rules.validCode('123456'), true);
    assert.equal(rules.validUsername('alice_01'), true);
  });
});

describe('M0 node whitelist', () => {
  it('resolves im.muuzi.co and rejects others', () => {
    const node = nodeService.resolveNode('im.muuzi.co');
    assert.equal(node.domain, 'im.muuzi.co');
    assert.equal(node.nodeOrigin, 'https://im.muuzi.co');
    assert.throws(() => nodeService.resolveNode('evil.example'), /白名单/);
  });
});
