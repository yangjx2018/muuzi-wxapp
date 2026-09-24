const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const translation = require('../miniprogram/services/fieldChatTranslation');

describe('M1 FieldHostInvite scan chat parity', () => {
  it('translationDecision mirrors App fieldChatTranslation', () => {
    assert.equal(
      translation.translationDecision({
        own: true,
        source: 'en',
        target: 'zh',
        available: true,
        enabled: true,
      }),
      'own'
    );
    assert.equal(
      translation.translationDecision({
        own: false,
        source: 'zh',
        target: 'zh',
        available: true,
        enabled: true,
      }),
      'same'
    );
    assert.equal(
      translation.translationDecision({
        own: false,
        source: 'en',
        target: 'zh',
        available: false,
        enabled: true,
      }),
      'closed'
    );
    assert.equal(
      translation.translationDecision({
        own: false,
        source: 'en',
        target: 'zh',
        available: true,
        enabled: false,
      }),
      'off'
    );
    assert.equal(
      translation.translationDecision({
        own: false,
        source: 'en',
        target: 'zh',
        available: true,
        enabled: true,
      }),
      'translate'
    );
  });

  it('translationLabel covers pending / failed / off', () => {
    assert.match(translation.translationLabel('closed'), /翻译服务未开放/);
    assert.match(translation.translationLabel('off'), /未开启自动翻译/);
    assert.equal(translation.translationLabel('translate', 'pending'), '翻译中…');
    assert.match(translation.translationLabel('translate', 'failed'), /暂未翻译成功/);
    assert.equal(translation.translationLabel('translate', 'done'), '自动翻译');
    assert.equal(translation.translationLabel('own'), '');
  });

  it('isScanChatMessage excludes face-to-face field.record from scan bubbles', () => {
    assert.equal(
      translation.isScanChatMessage({
        body: '现场交流 · 本人发言\n由 @a:im.muuzi.co 的设备记录\n原文（zh）：你好',
        fieldKind: 'record',
      }),
      false
    );
    assert.equal(
      translation.isScanChatMessage({
        body: '* 现场交流 · 对方发言（身份未关联）\n原文（en）：hi',
      }),
      false
    );
    assert.equal(
      translation.isScanChatMessage({
        body: 'Yes, thank you.',
        fieldKind: 'audience',
      }),
      true
    );
    assert.equal(
      translation.isScanChatMessage({ body: '客户页面就绪后即可收发文字。' }),
      true
    );
    assert.equal(translation.isScanChatMessage({ body: '  ' }), false);
  });

  it('field-host-invite surfaces chat bubbles + language controls', () => {
    const root = path.join(__dirname, '..');
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/components/field-host-invite/index.wxml'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/components/field-host-invite/index.js'),
      'utf8'
    );
    const wxss = fs.readFileSync(
      path.join(root, 'miniprogram/components/field-host-invite/index.wxss'),
      'utf8'
    );

    assert.match(wxml, /我读/);
    assert.match(wxml, /对方/);
    assert.match(wxml, /开启自动翻译|自动翻译已开/);
    assert.match(wxml, /chatMessages/);
    assert.match(wxml, /fc-bubble/);
    assert.match(wxml, /输入文字/);
    assert.match(wxml, /客户页面就绪后即可收发文字/);
    assert.match(wxml, /langHint/);
    assert.match(wxml, /fc-primary/);
    assert.match(wxml, /fc-scan-langs/);
    assert.match(wxml, /wx:if="\{\{chatting\}\}"/);
    assert.match(wxml, /chipDisabled/);
    assert.match(wxml, /domId/);
    // App FieldHostInvite 底部只有撤销 + 刷新；查看现场频道在 Talk 页
    assert.doesNotMatch(wxml, /查看现场频道/);
    assert.match(js, /isScanChatMessage/);
    assert.match(js, /syncChatMessages/);

    assert.match(js, /syncChatMessages/);
    assert.match(js, /queueGuestTranslations/);
    assert.match(js, /toggleTranslate/);
    assert.match(js, /onMineLang/);
    assert.match(js, /onGuestLang/);
    assert.match(js, /fieldChatTranslation/);
    assert.match(js, /noteSentEcho/);
    assert.match(js, /_localEchoes/);
    assert.match(js, /safeDomId/);
    assert.match(js, /matrixRuntime\.getRoomDetail/);
    assert.match(js, /客户扫码申请，你确认后才能进入文字交流/);
    assert.match(js, /访客语音尚未开放/);

    assert.match(wxss, /\.fc-scan-langs/);
    assert.match(wxss, /min-height:\s*72rpx/);
    assert.match(wxss, /\.fc-chat/);
    assert.match(wxss, /height:\s*42vh/);
    assert.match(wxss, /\.fc-bubble-own/);
    assert.match(wxss, /\.fc-chip-on/);
    assert.match(wxss, /\.fc-primary/);
    assert.match(wxss, /#eaf0ff/);
    // App .fc-primary：实心蓝胶囊；必须压过微信原生 button 灰底
    assert.match(wxss, /#2f6df4/);
    assert.match(wxss, /border-radius:\s*999rpx\s*!important/);
    assert.match(wxss, /background(?:-color)?:\s*#2f6df4\s*!important/);
    assert.match(wxss, /color:\s*#ffffff\s*!important/);
    assert.match(wxml, /允许加入/);
    assert.match(wxml, />\{\{pendingText \? '重试原消息' : '发送'\}\}<\/button>/);
  });

  it('talk embeds field-host-invite for scan mode', () => {
    const root = path.join(__dirname, '..');
    const wxml = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/talk/index.wxml'),
      'utf8'
    );
    const json = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/talk/index.json'),
      'utf8'
    );
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/pages/connect/talk/index.js'),
      'utf8'
    );
    assert.match(wxml, /field-host-invite/);
    assert.match(wxml, /扫码交流/);
    assert.match(json, /field-host-invite/);
    assert.match(js, /话题已创建 · 自动保存/);
  });

  it('matrixChat noteSentEcho creates missing join room', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../miniprogram/services/matrixChat.js'),
      'utf8'
    );
    assert.match(src, /function noteSentEcho/);
    assert.match(src, /noteSentEcho:\s*noteSentEcho/);
    assert.match(src, /emptyRoom\(roomId,\s*'join'\)/);
    assert.match(src, /room\.membership = 'join'/);
  });

  it('roomDetail returns messages even when toListItem is null', () => {
    const rooms = require('../miniprogram/services/matrixRooms');
    const roomId = '!field:ex';
    const me = '@me:ex';
    const store = Object.create(null);
    store[roomId] = rooms.emptyRoom(roomId, 'join');
    store[roomId].state[
      rooms.FIELD_STATE + '\0'
    ] = {
      type: rooms.FIELD_STATE,
      state_key: '',
      content: { kind: 'topic' },
    };
    // 伪装成 space，使 toListItem 因 shouldOmitFromInbox 返回 null
    store[roomId].state['m.room.create\0'] = {
      type: 'm.room.create',
      state_key: '',
      content: { type: 'm.space' },
    };
    rooms.upsertLocalEvent(store[roomId], {
      type: 'm.room.message',
      event_id: '$echo1',
      sender: me,
      content: { msgtype: 'm.text', body: '你好' },
      origin_server_ts: 1000,
    });
    assert.equal(rooms.toListItem(store[roomId], me, Object.create(null), {}), null);
    const detail = rooms.roomDetail(store, roomId, me, {});
    assert.ok(detail);
    assert.equal(detail.messages.length, 1);
    assert.equal(detail.messages[0].body, '你好');
    assert.equal(detail.messages[0].own, true);
  });

  it('field-host-invite clears stale invite and maps ACCESS_DENIED', () => {
    const root = path.join(__dirname, '..');
    const js = fs.readFileSync(
      path.join(root, 'miniprogram/components/field-host-invite/index.js'),
      'utf8'
    );
    assert.match(js, /explainFieldError/);
    assert.match(js, /ACCESS_DENIED/);
    assert.match(js, /后台轮询失败不得盖住/);
    assert.match(js, /这个账号还没开通扫码交流/);
    assert.match(js, /INVITE_CHANGED/);
    assert.match(js, /self\._invite = null/);
    assert.match(js, /_working/);
    assert.match(js, /现场话题尚未就绪/);
    // tick 仅轮询有效邀请，避免残留 invite 的 host\/read 盖成「暂未完成」
    assert.match(js, /\['open', 'pending', 'approved'\]/);
    // discover 空结果与 create 成功前都清本地残留，避免 INVITE_CHANGED
    assert.match(js, /无可恢复邀请：丢掉本地残留/);
    assert.match(js, /create 返回的是新邀请真值/);
  });
});

