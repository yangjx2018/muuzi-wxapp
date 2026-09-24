const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const rules = require('../miniprogram/services/fieldEncounterRules');
const idempotency = require('../miniprogram/utils/idempotency');

describe('M1.3 Field Encounters', () => {
  it('validates encounter shape and error messages like App', () => {
    assert.equal(rules.isFieldEncounter(null), false);
    assert.equal(
      rules.isFieldEncounter({
        encounterId: 'encounter_abc',
        participantId: 'p1',
        revision: 1,
        appliedRevision: null,
        lifecycle: 'open',
        eventName: '上海展会',
        sourceLanguage: 'zh',
        targetLanguage: 'en',
        saveHistory: false,
        createdAt: '2026-09-21T12:00:00.000Z',
        endedAt: null,
      }),
      true
    );
    assert.equal(
      rules.isDeletedEncounter(
        { encounterId: 'encounter_abc', lifecycle: 'deleted', revision: 2 },
        'encounter_abc'
      ),
      true
    );
    assert.match(rules.fieldErrorMessage('STALE_REVISION'), /刷新列表/);
    assert.match(rules.fieldErrorMessage('RATE_LIMITED'), /过于频繁/);
  });

  it('idempotency keys look like uuid v4', () => {
    const key = idempotency.uuidV4();
    assert.match(
      key,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('hub wires encounter CRUD UI and field services', () => {
    const root = path.join(__dirname, '..');
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/index.wxml'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/index.js'),
      'utf8'
    );
    const svc = fs.readFileSync(
      path.join(root, 'miniprogram/services/fieldEncounters.js'),
      'utf8'
    );
    assert.match(wxml, /现场话题/);
    assert.match(wxml, /新建独立话题/);
    assert.match(wxml, /结束话题/);
    assert.match(wxml, /删除话题/);
    assert.match(wxml, /更多话题/);
    assert.match(wxml, /话题服务仅保存名称、语言和状态/);
    assert.match(js, /createFieldEncounter/);
    assert.match(js, /closeFieldEncounter/);
    assert.match(js, /deleteFieldEncounter/);
    assert.match(js, /listFieldEncounters/);
    assert.match(js, /fieldCapabilities/);
    assert.match(js, /Idempotency|uuidV4|idempotency/);
    assert.match(svc, /Idempotency-Key/);
    assert.match(svc, /\/api\/creator\/field\/v1/);
    assert.match(svc, /available: false/);
  });
});
