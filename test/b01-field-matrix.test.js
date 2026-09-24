/**
 * matrix-field / FieldTalk 保存路径冒烟
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('B-01 field matrix save wiring', () => {
  it('matrixField service exists with open/save/close', () => {
    const src = fs.readFileSync(
      path.join(root, 'miniprogram/services/matrixField.js'),
      'utf8'
    );
    assert.match(src, /createFieldActions/);
    assert.match(src, /function open/);
    assert.match(src, /function save/);
    assert.match(src, /muuzi-field-/);
    assert.match(src, /co\.muuzi\.field/);
  });

  it('matrixRuntime exports field topic APIs', () => {
    const src = fs.readFileSync(
      path.join(root, 'miniprogram/services/matrixRuntime.js'),
      'utf8'
    );
    assert.match(src, /openFieldTopic/);
    assert.match(src, /saveFieldRecord/);
    assert.match(src, /closeFieldTopic/);
  });

  it('talk page writes Matrix via persistConfirmed', () => {
    const src = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/talk/index.js'),
      'utf8'
    );
    assert.match(src, /saveFieldRecord/);
    assert.match(src, /openFieldTopic/);
    assert.match(src, /_outbox\.write/);
    assert.doesNotMatch(src, /写入节点现场频道将在消息模块接通后同步/);
  });

  it('host invite page registered', () => {
    const app = JSON.parse(
      fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8')
    );
    assert.ok(app.pages.indexOf('pages/connect/host/index') >= 0);
    const hostPage = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/host/index.js'),
      'utf8'
    );
    const hostWxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/host/index.wxml'),
      'utf8'
    );
    const invite = fs.readFileSync(
      path.join(root, 'miniprogram/components/field-host-invite/index.js'),
      'utf8'
    );
    assert.match(hostWxml, /field-host-invite/);
    assert.match(hostPage, /allowCreate/);
    assert.match(invite, /host\/create/);
    assert.match(invite, /host\/prepare/);
  });

  it('DM reuse looks up existing rooms', () => {
    const src = fs.readFileSync(
      path.join(root, 'miniprogram/services/matrixDirect.js'),
      'utf8'
    );
    assert.match(src, /findExisting/);
    assert.match(src, /isHumanDirect/);
  });

  it('room list sets mentioned from highlight', () => {
    const src = fs.readFileSync(
      path.join(root, 'miniprogram/services/matrixRooms.js'),
      'utf8'
    );
    assert.match(src, /mentioned:\s*Number\(room\.highlight\)\s*>\s*0/);
  });
});
