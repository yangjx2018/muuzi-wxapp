/**
 * Build App-parity field-host-invite component + wire talk/host pages.
 * ASCII-only source; Chinese via \\u escapes.
 */
const fs = require('fs');
const path = require('path');

function u(s) {
  return s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

const root = path.join(__dirname, '..', 'miniprogram');
const compDir = path.join(root, 'components', 'field-host-invite');
fs.mkdirSync(compDir, { recursive: true });

// --- component json ---
fs.writeFileSync(
  path.join(compDir, 'index.json'),
  JSON.stringify({ component: true }, null, 2) + '\n',
  'utf8'
);

// --- component wxss ---
fs.writeFileSync(
  path.join(compDir, 'index.wxss'),
  [
    '.fhi { display: flex; flex-direction: column; gap: 24rpx; }',
    '.fhi-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20rpx; }',
    '.fhi-kicker { display: block; font-size: 18rpx; letter-spacing: 0.14em; color: var(--app-muted); }',
    '.fhi-title { margin-top: 8rpx; font-size: 40rpx; font-weight: 600; color: var(--app-ink); }',
    '.fhi-state { flex: none; padding: 10rpx 22rpx; border-radius: 999rpx; background: #eef2f9; color: #44506a; font-size: 22rpx; }',
    '.fhi-note { font-size: 24rpx; color: var(--app-muted); line-height: 1.5; }',
    '.fhi-card { display: flex; flex-direction: column; align-items: center; gap: 20rpx; padding: 40rpx 32rpx; border-radius: 36rpx; background: #fff; border: 1rpx solid var(--app-line); text-align: center; }',
    '.fhi-card-decide { align-items: stretch; text-align: left; }',
    '.fhi-card-text { margin: 0; color: #55607a; font-size: 26rpx; line-height: 1.5; }',
    '.fhi-hint { font-size: 28rpx; color: #1d2540; }',
    '.fhi-expiry { color: #8a93a6; font-size: 22rpx; }',
    '.fhi-placeholder { width: 60%; max-width: 360rpx; aspect-ratio: 1; border-radius: 28rpx; border: 4rpx dashed #d7dced; }',
    '.fhi-spinner { width: 48rpx; height: 48rpx; border-radius: 50%; border: 6rpx solid #dfe5f2; border-top-color: #4a6cf7; animation: fhi-spin 900ms linear infinite; }',
    '@keyframes fhi-spin { to { transform: rotate(360deg); } }',
    '.fhi-qr { width: 280px; height: 280px; display: block; margin: 0 auto; background: #fff; border-radius: 20rpx; }',
    '.fhi-canvas { position: fixed; left: -9999px; top: -9999px; width: 280px; height: 280px; }',
    '.fhi-actions { display: flex; flex-wrap: wrap; gap: 28rpx; justify-content: center; }',
    '.fhi-link { padding: 0; margin: 0; background: transparent; color: var(--app-accent); font-size: 26rpx; border: none; line-height: 1.5; }',
    '.fhi-link::after { border: none; }',
    '.fhi-link[disabled] { opacity: 0.45; }',
    '.fhi-primary { width: 100%; }',
    '.fhi-chat-form { display: flex; flex-direction: column; gap: 16rpx; }',
    '.fhi-draft { width: 100%; min-height: 160rpx; box-sizing: border-box; border: 1rpx solid var(--app-line); border-radius: 24rpx; padding: 20rpx; background: #fff; font-size: 28rpx; }',
    '',
  ].join('\n'),
  'utf8'
);

// --- component wxml ---
const wxml = u([
  '<view class="fhi">',
  '  <view class="fhi-head">',
  '    <view>',
  '      <text class="fhi-kicker">SCAN \\u00b7 JOIN</text>',
  '      <view class="fhi-title">\\u626b\\u7801\\u4ea4\\u6d41</view>',
  '    </view>',
  '    <text class="fhi-state">{{scanState}}</text>',
  '  </view>',
  '',
  '  <view class="fhi-note">{{saveNote}}</view>',
  '  <view wx:if="{{notice}}" class="fhi-note" role="status">{{notice}}</view>',
  '',
  '  <block wx:if="{{!roomId}}">',
  '    <view class="fhi-card">',
  '      <view class="fhi-spinner" aria-hidden="true"></view>',
  '      <view class="fhi-card-text" role="status">\\u6b63\\u5728\\u521b\\u5efa\\u672c\\u6b21\\u8bdd\\u9898\\u2026\\u4e8c\\u7ef4\\u7801\\u968f\\u540e\\u5c31\\u80fd\\u751f\\u6210\\u3002</view>',
  '    </view>',
  '  </block>',
  '',
  '  <block wx:elif="{{!inviteStatus && allowCreate}}">',
  '    <view class="fhi-card">',
  '      <block wx:if="{{busy}}">',
  '        <view class="fhi-spinner" aria-hidden="true"></view>',
  '        <view class="fhi-card-text" role="status">\\u6b63\\u5728\\u751f\\u6210\\u4e8c\\u7ef4\\u7801\\uff0c\\u8bf7\\u7a0d\\u5019\\u2026</view>',
  '      </block>',
  '      <block wx:else>',
  '        <view class="fhi-placeholder" aria-hidden="true"></view>',
  '        <view class="fhi-card-text">\\u751f\\u6210\\u540e\\u628a\\u5c4f\\u5e55\\u8f6c\\u5411\\u5ba2\\u6237\\uff0c\\u8ba9\\u5bf9\\u65b9\\u7528\\u76f8\\u673a\\u626b\\u7801\\u3002</view>',
  '        <button class="btn-primary fhi-primary" disabled="{{!enabled || busy}}" bindtap="onCreate">\\u751f\\u6210\\u672c\\u6b21\\u4ea4\\u6d41\\u4e8c\\u7ef4\\u7801</button>',
  '      </block>',
  '    </view>',
  '  </block>',
  '',
  '  <view wx:if="{{!inviteStatus && !allowCreate && !busy}}" class="fhi-note">\\u5c1a\\u672a\\u627e\\u5230\\u53ef\\u6062\\u590d\\u7684\\u626b\\u7801\\u4ea4\\u6d41\\uff0c\\u8bf7\\u5237\\u65b0\\u6838\\u5bf9\\uff1b\\u5df2\\u6709\\u6587\\u5b57\\u53ef\\u8fd4\\u56de\\u73b0\\u573a\\u5217\\u8868\\u67e5\\u770b\\u3002</view>',
  '',
  '  <view wx:if="{{url}}" class="fhi-card">',
  '    <image wx:if="{{qrPath}}" class="fhi-qr" src="{{qrPath}}" mode="aspectFit" />',
  '    <canvas canvas-id="hostQr" class="fhi-canvas" style="width:280px;height:280px;"></canvas>',
  '    <view class="fhi-hint">\\u8bf7\\u5ba2\\u6237\\u7528\\u76f8\\u673a\\u626b\\u7801\\u52a0\\u5165</view>',
  '    <text wx:if="{{expiresLabel}}" class="fhi-expiry">\\u9080\\u8bf7 {{expiresLabel}} \\u524d\\u6709\\u6548</text>',
  '    <button class="fhi-link" bindtap="copyUrl">\\u590d\\u5236\\u9080\\u8bf7\\u94fe\\u63a5</button>',
  '  </view>',
  '',
  '  <view wx:if="{{inviteStatus === \'open\' && !url}}" class="fhi-note">\\u9080\\u8bf7\\u51ed\\u636e\\u6682\\u4e0d\\u53ef\\u7528\\u3002\\u8bf7\\u64a4\\u9500\\u672c\\u6b21\\u9080\\u8bf7\\uff0c\\u907f\\u514d\\u91cd\\u590d\\u9080\\u8bf7\\u3002</view>',
  '',
  '  <view wx:if="{{inviteStatus === \'pending\'}}" class="fhi-card fhi-card-decide">',
  '    <view class="fhi-card-text">{{inviteGuestName || \'\\u8bbf\\u5ba2\'}} \\u7533\\u8bf7\\u52a0\\u5165\\u672c\\u6b21\\u4ea4\\u6d41\\u3002\\u8bf7\\u5f53\\u9762\\u786e\\u8ba4\\u662f\\u5f53\\u524d\\u5ba2\\u6237\\u3002</view>',
  '    <button class="btn-primary fhi-primary" disabled="{{busy}}" data-accept="1" bindtap="onDecide">\\u5141\\u8bb8\\u52a0\\u5165</button>',
  '    <button class="fhi-link" disabled="{{busy}}" data-accept="0" bindtap="onDecide">\\u62d2\\u7edd</button>',
  '  </view>',
  '',
  '  <block wx:if="{{inviteStatus === \'approved\' && inviteActive}}">',
  '    <view class="fhi-note">\\u5ba2\\u6237\\u9875\\u9762\\u5c31\\u7eea\\u540e\\u5373\\u53ef\\u6536\\u53d1\\u6587\\u5b57\\u3002</view>',
  '    <view class="fhi-chat-form">',
  '      <textarea class="fhi-draft" placeholder="\\u8f93\\u5165\\u6587\\u5b57\\u2026" value="{{draft}}" maxlength="1500" disabled="{{busy}}" bindinput="onDraft" />',
  '      <view wx:if="{{pendingText}}" class="fhi-note">\\u5f85\\u786e\\u8ba4\\u53d1\\u9001\\uff1a{{pendingText}}</view>',
  '      <button class="btn-primary fhi-primary" disabled="{{busy}}" bindtap="onSend">{{pendingText ? \'\\u91cd\\u8bd5\\u539f\\u6d88\\u606f\' : \'\\u53d1\\u9001\'}}</button>',
  '    </view>',
  '  </block>',
  '',
  '  <view wx:if="{{inviteStatus && !inviteActive}}" class="fhi-note">\\u672c\\u6b21\\u9080\\u8bf7\\u5df2\\u7ed3\\u675f\\u3002\\u5df2\\u6709\\u4ea4\\u6d41\\u4ecd\\u4fdd\\u7559\\u5728\\u73b0\\u573a\\u9891\\u9053\\u4e2d\\u3002</view>',
  '',
  '  <view class="fhi-actions">',
  '    <button wx:if="{{inviteActive}}" class="fhi-link" disabled="{{busy}}" bindtap="onRevoke">\\u64a4\\u9500\\u5ba2\\u6237\\u8bbf\\u95ee</button>',
  '    <button class="fhi-link" disabled="{{busy}}" bindtap="onRefresh">\\u5237\\u65b0\\u72b6\\u6001</button>',
  '    <button wx:if="{{inviteStatus === \'approved\'}}" class="fhi-link" bindtap="openChat">\\u67e5\\u770b\\u73b0\\u573a\\u9891\\u9053</button>',
  '  </view>',
  '</view>',
  '',
].join('\n'));
fs.writeFileSync(path.join(compDir, 'index.wxml'), wxml, 'utf8');

// --- component js: adapt from host/index.js ---
const hostJs = fs.readFileSync(path.join(root, 'pages', 'connect', 'host', 'index.js'), 'utf8');
// We'll write a tailored component JS based on host logic
const compJs = `/**
 * App-parity FieldHostInvite for mini program (embedded in Talk + Host page).
 */
var session = require('../../services/session');
var fieldNodeApi = require('../../services/fieldNodeApi');
var fieldCaps = require('../../services/fieldCapabilities');
var fieldHostDelivery = require('../../services/fieldHostDelivery');
var matrixRuntime = require('../../services/matrixRuntime');
var idempotency = require('../../utils/idempotency');
var qrcodeDraw = require('../../utils/qrcode-draw');
var store = require('../../adapters/secure-store');

function scanStateOf(roomId, inviteStatus, hasUrl, chatting) {
  if (!roomId) return '${u('\\u51c6\\u5907\\u8bdd\\u9898')}';
  if (inviteStatus === 'pending') return '${u('\\u5f85\\u4f60\\u786e\\u8ba4')}';
  if (chatting) return '${u('\\u4ea4\\u6d41\\u4e2d')}';
  if (hasUrl) return '${u('\\u7b49\\u5f85\\u626b\\u7801')}';
  return '${u('\\u672a\\u5f00\\u59cb')}';
}

function expiresLabelOf(expiresAt) {
  if (!expiresAt) return '';
  try {
    var d = new Date(expiresAt);
    var h = d.getHours();
    var m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  } catch (e) {
    return '';
  }
}

Component({
  properties: {
    roomId: { type: String, value: '' },
    allowCreate: { type: Boolean, value: true },
  },

  data: {
    enabled: false,
    busy: false,
    notice: '${u('\\u68c0\\u67e5\\u626b\\u7801\\u4ea4\\u6d41\\u670d\\u52a1\\u2026')}',
    inviteStatus: '',
    inviteGuestName: '',
    inviteActive: false,
    url: '',
    qrPath: '',
    draft: '',
    pendingText: '',
    mine: 'zh',
    saveNote: '',
    scanState: '${u('\\u51c6\\u5907\\u8bdd\\u9898')}',
    expiresLabel: '',
  },

  lifetimes: {
    attached: function () {
      this._alive = true;
      this._queue = Promise.resolve();
      this._actionQueued = false;
      this._invite = null;
      this._requestId = '';
      this._delivery = null;
      this._timer = null;
      this._call = null;
      this._node = null;
      this._bootSig = '';
    },
    ready: function () {
      if (!this._bootSig) this.rebootIfNeeded(true);
    },
    detached: function () {
      this._alive = false;
      if (this._timer) clearTimeout(this._timer);
    },
  },

  observers: {
    'roomId, allowCreate': function () {
      this.rebootIfNeeded(false);
    },
  },

  methods: {
    rebootIfNeeded: function (force) {
      if (!this._alive) return;
      var sig =
        String(this.data.roomId || '') +
        '|' +
        (this.data.allowCreate ? '1' : '0');
      if (!force && sig === this._bootSig) return;
      this._bootSig = sig;
      if (this._timer) clearTimeout(this._timer);
      this._timer = null;
      this._invite = null;
      this._delivery = null;
      this._requestId = '';
      this.setData({
        inviteStatus: '',
        inviteGuestName: '',
        inviteActive: false,
        url: '',
        qrPath: '',
        expiresLabel: '',
        scanState: scanStateOf(this.data.roomId, '', false, false),
      });
      this.bootstrap();
    },

    bootstrap: function () {
      var self = this;
      if (!session.isSignedIn()) {
        this.setData({ notice: '${u('\\u8bf7\\u5148\\u767b\\u5f55')}' });
        return;
      }
      var roomId = this.data.roomId || '';
      var snap = session.snapshot();
      var brand =
        (snap &&
          snap.node &&
          (snap.node.brandName || snap.node.company_name || snap.node.domain)) ||
        '${u('\\u5f53\\u524d\\u8282\\u70b9')}';
      this.setData({
        saveNote:
          '${u('\\u6587\\u5b57\\u4fdd\\u5b58\\u5230 ')}' +
          brand +
          '${u('\\uff0c\\u4e0d\\u4f1a\\u81ea\\u52a8\\u52a0\\u597d\\u53cb\\u3002\\u8bbf\\u5ba2\\u8bed\\u97f3\\u5c1a\\u672a\\u5f00\\u653e\\u3002')}',
        scanState: scanStateOf(roomId, '', false, false),
        notice: roomId
          ? '${u('\\u68c0\\u67e5\\u626b\\u7801\\u4ea4\\u6d41\\u670d\\u52a1\\u2026')}'
          : '${u('\\u68c0\\u67e5\\u626b\\u7801\\u4ea4\\u6d41\\u670d\\u52a1\\u2026')}',
      });
      if (!roomId || roomId.charAt(0) !== '!') {
        // App shows preparing spinner while room is empty — keep waiting.
        return;
      }
      this.bootWithRoom(roomId);
    },

    bootWithRoom: function (roomId) {
      var self = this;
      var snap = session.snapshot();
      var node = fieldNodeApi.approvedFieldNode(
        String(snap.instanceId),
        snap.nodeOrigin
      );
      if (!node) {
        this.setData({
          notice:
            '${u('\\u5f53\\u524d\\u8282\\u70b9\\u5c1a\\u672a\\u5b89\\u88c5\\u5e76\\u9a8c\\u6536\\u626b\\u7801\\u4ea4\\u6d41\\u670d\\u52a1\\u3002\\u542f\\u7528\\u540e\\uff0c\\u5ba2\\u6237\\u53ef\\u4ee5\\u7528\\u81ea\\u5df1\\u7684\\u624b\\u673a\\u7533\\u8bf7\\u52a0\\u5165\\u3002')}',
        });
        return;
      }
      this._node = node;
      try {
        this._call = fieldNodeApi.createFieldNodeApi(node, {
          origin: snap.nodeOrigin,
          token: function () {
            return session.snapshot().accessToken || '';
          },
        });
      } catch (e) {
        this.setData({ notice: (e && e.message) || '${u('\\u626b\\u7801\\u670d\\u52a1\\u4e0d\\u53ef\\u7528')}' });
        return;
      }

      var key =
        'muuzi.field.host:' +
        JSON.stringify([
          node.instanceId,
          node.origin,
          snap.matrixUserId,
          snap.deviceId || '',
          roomId,
        ]);
      var raw = store.get(key);
      if (raw) {
        try {
          var saved = JSON.parse(raw);
          if (/^[0-9a-f-]{36}$/.test(saved.requestId)) {
            this._requestId = saved.requestId;
            this._invite = saved.invite || null;
          }
        } catch (e) {
          /* ignore */
        }
      }
      if (!this._requestId) {
        this._requestId = idempotency.uuidV4();
        store.set(key, JSON.stringify({ requestId: this._requestId, invite: null }));
      }
      this._storeKey = key;

      this.run(function () {
        return self
          ._call('host/capabilities', {})
          .catch(function (error) {
            if (error && error.code === 'ACCESS_DENIED') return null;
            throw error;
          })
          .then(function (capabilities) {
            if (!self._alive) return;
            if (capabilities === null) {
              self.setData({
                notice:
                  '${u('\\u8fd9\\u4e2a\\u8d26\\u53f7\\u8fd8\\u6ca1\\u5f00\\u901a\\u626b\\u7801\\u4ea4\\u6d41\\uff0c\\u8bf7\\u8054\\u7cfb\\u8282\\u70b9\\u7ba1\\u7406\\u5458\\u5f00\\u901a\\u3002')}',
              });
              return;
            }
            var available = fieldCaps.fieldAvailability(
              capabilities,
              node.instanceId,
              node.protocol
            );
            self.setData({
              enabled: available.canStartText,
              notice: available.canStartText
                ? '${u('\\u5ba2\\u6237\\u626b\\u7801\\u7533\\u8bf7\\uff0c\\u4f60\\u786e\\u8ba4\\u540e\\u624d\\u80fd\\u8fdb\\u5165\\u6587\\u5b57\\u4ea4\\u6d41\\u3002')}'
                : '${u('\\u5f53\\u524d\\u8282\\u70b9\\u5c1a\\u672a\\u5f00\\u653e\\u626b\\u7801\\u4ea4\\u6d41\\u3002')}',
            });
            if (self._invite) {
              return self
                ._call('host/read', { invitationId: self._invite.id })
                .then(function (inv) {
                  return self.display(inv);
                });
            }
            if (available.canStartText) return self.discover();
          });
      }).then(function () {
        self.tick();
      });
    },

    tick: function () {
      var self = this;
      if (!this._alive) return;
      this.refresh(true).finally(function () {
        if (!self._alive) return;
        self._timer = setTimeout(function () {
          self.tick();
        }, 3000);
      });
    },

    run: function (work, background) {
      var self = this;
      if (!this._alive) return Promise.resolve();
      if (background && this._actionQueued) return Promise.resolve();
      if (!background) {
        this._actionQueued = true;
        this.setData({ busy: true });
      }
      var task = this._queue.then(function () {
        if (!self._alive) return;
        return Promise.resolve()
          .then(work)
          .catch(function () {
            if (self._alive) {
              self.setData({
                notice:
                  '${u('\\u6682\\u672a\\u5b8c\\u6210\\uff0c\\u8bf7\\u91cd\\u8bd5\\u539f\\u64cd\\u4f5c\\u3002\\u4e0d\\u4f1a\\u81ea\\u52a8\\u91cd\\u65b0\\u9080\\u8bf7\\u6216\\u91cd\\u590d\\u53d1\\u9001\\u3002')}',
              });
            }
          })
          .finally(function () {
            if (!background) {
              self._actionQueued = false;
              if (self._alive) self.setData({ busy: false });
            }
          });
      });
      this._queue = task.then(
        function () {},
        function () {}
      );
      return task;
    },

    persistInvite: function () {
      store.set(
        this._storeKey,
        JSON.stringify({
          requestId: this._requestId,
          invite: this._invite,
        })
      );
    },

    refreshScanUi: function (patch) {
      var status = patch.inviteStatus != null ? patch.inviteStatus : this.data.inviteStatus;
      var url = patch.url != null ? patch.url : this.data.url;
      var active = ['open', 'pending', 'approved'].indexOf(status) >= 0;
      var chatting = status === 'approved' && active;
      patch.inviteActive = active;
      patch.scanState = scanStateOf(this.data.roomId, status, Boolean(url), chatting);
      if (patch.expiresAt != null) {
        patch.expiresLabel = expiresLabelOf(patch.expiresAt);
      }
      this.setData(patch);
    },

    display: function (value) {
      var self = this;
      if (!this._alive) return Promise.resolve();
      if (
        !value ||
        !/^([0-9a-f]{8}-)([0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(value.id) ||
        ['open', 'pending', 'approved', 'rejected', 'revoked', 'expired'].indexOf(
          value.status
        ) < 0
      ) {
        return Promise.reject(new Error('INVALID_INVITE'));
      }
      if (
        this._invite &&
        (this._invite.id !== value.id ||
          this._invite.expiresAt !== value.expiresAt ||
          value.revision < this._invite.revision)
      ) {
        return Promise.reject(new Error('INVITE_CHANGED'));
      }
      this._invite = Object.assign({}, value, {
        joinProof:
          value.joinProof != null
            ? value.joinProof
            : this._invite && this._invite.joinProof,
      });
      this.persistInvite();
      var status = this._invite.status;
      var patch = {
        inviteStatus: status,
        inviteGuestName: this._invite.guestName || '',
        url: '',
        expiresAt: this._invite.expiresAt || 0,
      };
      if (
        status === 'open' &&
        this._invite.expiresAt > Date.now() &&
        this._invite.joinProof
      ) {
        try {
          patch.url = fieldNodeApi.fieldLink(this._node, this._invite);
        } catch (e) {
          patch.url = '';
        }
      }
      this.refreshScanUi(patch);
      if (patch.url) {
        return qrcodeDraw
          .drawUrlToTempFile(this, 'hostQr', patch.url)
          .then(function (p) {
            if (self._alive) self.setData({ qrPath: p });
          })
          .catch(function () {
            if (self._alive) self.setData({ qrPath: '' });
          })
          .then(function () {
            if (status === 'approved' && !self._delivery) {
              return self.bindDelivery(self._invite.id);
            }
          });
      }
      if (status !== 'open') {
        this.setData({ qrPath: '' });
      }
      if (status === 'approved' && !this._delivery) {
        return this.bindDelivery(this._invite.id);
      }
      return Promise.resolve();
    },

    bindDelivery: function (invitationId) {
      var self = this;
      var snap = session.snapshot();
      matrixRuntime.ensureStarted();
      var api = matrixRuntime.getApi();
      if (!api) {
        this.setData({ notice: '${u('\\u6d88\\u606f\\u670d\\u52a1\\u5c1a\\u672a\\u5c31\\u7eea')}' });
        return Promise.resolve();
      }
      try {
        this._delivery = fieldHostDelivery.createFieldHostDelivery({
          api: api,
          context: {
            instanceId: String(snap.instanceId),
            homeserver: snap.homeserver,
            roomId: this.data.roomId,
            invitationId: invitationId,
          },
          getUserId: function () {
            return session.snapshot().matrixUserId || '';
          },
          getDeviceId: function () {
            return session.snapshot().deviceId || '';
          },
          recipient: function () {
            return self._call('host/recipient', { invitationId: invitationId });
          },
          isCurrent: function () {
            return self._alive;
          },
        });
      } catch (e) {
        this.setData({ notice: (e && e.message) || '${u('\\u65e0\\u6cd5\\u5efa\\u7acb\\u53d1\\u9001\\u901a\\u9053')}' });
        return Promise.resolve();
      }
      return this._delivery.pending().then(function (pending) {
        if (self._alive && pending) {
          self.setData({ pendingText: pending.text || '' });
        }
      });
    },

    discover: function () {
      var self = this;
      return this._call('host/find', { room: this.data.roomId }).then(function (result) {
        if (!self._alive) throw new Error('CONTEXT_CHANGED');
        if (
          !result ||
          result.roomId !== self.data.roomId ||
          !Object.prototype.hasOwnProperty.call(result, 'invitation')
        ) {
          throw new Error('INVALID_RECOVERY');
        }
        if (result.invitation !== null) {
          return self.display(result.invitation).then(function () {
            return true;
          });
        }
        return false;
      });
    },

    refresh: function (background) {
      var self = this;
      return this.run(function () {
        if (self._invite) {
          return self
            ._call('host/read', { invitationId: self._invite.id })
            .then(function (inv) {
              return self.display(inv);
            });
        }
        if (self.data.enabled) return self.discover();
      }, background);
    },

    onCreate: function () {
      var self = this;
      if (!this.data.allowCreate || !this.data.enabled || !this.data.roomId) return;
      this.run(function () {
        return self.discover().then(function (found) {
          if (found) return;
          self.triggerEvent('prepared');
          return self
            ._call('host/prepare', { room: self.data.roomId })
            .then(function (prepared) {
              if (
                !prepared ||
                prepared.roomId !== self.data.roomId ||
                prepared.ready !== true
              ) {
                throw new Error('ROOM_NOT_READY');
              }
              return self._call('host/create', {
                room: self.data.roomId,
                requestId: self._requestId,
                ttlSeconds: 900,
              });
            })
            .then(function (inv) {
              return self.display(inv);
            });
        });
      });
    },

    onDecide: function (e) {
      var self = this;
      var accept = !!(
        e.currentTarget.dataset.accept === '1' ||
        e.currentTarget.dataset.accept === true
      );
      if (!this._invite || !this._invite.guestRequestId) return;
      this.run(function () {
        return self
          ._call('host/decide', {
            invitationId: self._invite.id,
            guestRequestId: self._invite.guestRequestId,
            expectedRevision: self._invite.revision,
            accept: accept,
          })
          .then(function (inv) {
            return self.display(inv);
          });
      });
    },

    onRevoke: function () {
      var self = this;
      if (!this._invite) return;
      this.run(function () {
        return self
          ._call('host/revoke', {
            invitationId: self._invite.id,
            expectedRevision: self._invite.revision,
          })
          .then(function (inv) {
            return self.display(inv);
          });
      });
    },

    onRefresh: function () {
      this.refresh(false);
    },

    onDraft: function (e) {
      this.setData({ draft: (e.detail && e.detail.value) || '' });
    },

    onSend: function () {
      var self = this;
      if (!this._delivery || !this._invite || this._invite.status !== 'approved') {
        return;
      }
      this.run(function () {
        var pending = null;
        return self._delivery.pending().then(function (p) {
          pending = p;
          var requestId = (pending && pending.requestId) || idempotency.uuidV4();
          var text = (pending && pending.text) || self.data.draft;
          var language = (pending && pending.language) || self.data.mine;
          if (!pending && (!text.trim() || text.indexOf('\\0') >= 0)) {
            throw new Error('INVALID_TEXT');
          }
          self.setData({ pendingText: text });
          return self._delivery.send(requestId, text, language).then(function () {
            if (self._alive) {
              self.setData({
                draft: '',
                pendingText: '',
                notice: '${u('\\u5df2\\u53d1\\u9001')}',
              });
            }
          });
        });
      });
    },

    copyUrl: function () {
      var url = this.data.url;
      if (!url) return;
      wx.setClipboardData({
        data: url,
        success: function () {
          wx.showToast({
            title: '${u('\\u5df2\\u590d\\u5236\\uff0c\\u8bf7\\u53ea\\u53d1\\u7ed9\\u672c\\u6b21\\u5ba2\\u6237')}',
            icon: 'none',
          });
        },
      });
    },

    openChat: function () {
      var room = this.data.roomId;
      if (!room) return;
      this.triggerEvent('openchat', { roomId: room });
      wx.navigateTo({
        url: '/pages/messages/room/index?room=' + encodeURIComponent(room),
      });
    },
  },
});
`;

fs.writeFileSync(path.join(compDir, 'index.js'), compJs, 'utf8');

// --- wire talk page: embed component (App FieldTalk parity) ---
const talkJsonPath = path.join(root, 'pages', 'connect', 'talk', 'index.json');
fs.writeFileSync(
  talkJsonPath,
  JSON.stringify(
    {
      navigationBarTitleText: u('\\u9762\\u5bf9\\u9762\\u4ea4\\u6d41'),
      usingComponents: {
        'field-host-invite': '/components/field-host-invite/index',
      },
    },
    null,
    2
  ) + '\n',
  'utf8'
);

const talkWxmlPath = path.join(root, 'pages', 'connect', 'talk', 'index.wxml');
let talkWxml = fs.readFileSync(talkWxmlPath, 'utf8');
const scanBlockRe =
  /  <block wx:if="\{\{scan\}\}">[\s\S]*?  <\/block>\n/;
const scanBlockNew = u([
  '  <block wx:if="{{scan}}">',
  '    <view wx:if="{{scanPrepared}}" class="fc-availability">',
  '      \\u672c\\u6b21\\u4f7f\\u7528\\u626b\\u7801\\u4ea4\\u6d41\\u3002\\u8981\\u5f00\\u59cb\\u5355\\u624b\\u673a\\u4ea4\\u6d41\\uff0c\\u8bf7\\u8fd4\\u56de\\u8fde\\u63a5\\u521b\\u5efa\\u65b0\\u8bdd\\u9898\\u3002',
  '    </view>',
  '    <field-host-invite',
  '      room-id="{{savedRoom}}"',
  '      allow-create="{{true}}"',
  '      bind:prepared="onScanPrepared"',
  '    />',
  '  </block>',
  '',
].join('\n'));
if (!scanBlockRe.test(talkWxml)) {
  console.error('talk scan block not found');
  process.exit(1);
}
talkWxml = talkWxml.replace(scanBlockRe, scanBlockNew);

// mode buttons: lock face mode after scan prepared (App parity)
talkWxml = talkWxml.replace(
  'disabled="{{busy || translating}}"\n      bindtap="setModeFace"',
  'disabled="{{busy || translating || scanPrepared}}"\n      bindtap="setModeFace"'
);
// add 查看现场频道 before 结束交流
if (!talkWxml.includes('openFieldRoom')) {
  talkWxml = talkWxml.replace(
    '  <button\n    class="fc-card-refresh"\n    disabled="{{busy || translating}}"\n    bindtap="openEndDialog"\n  >结束交流</button>',
    u([
      '  <button',
      '    wx:if="{{savedRoom}}"',
      '    class="fc-card-refresh"',
      '    bindtap="openFieldRoom"',
      '  >\\u67e5\\u770b\\u73b0\\u573a\\u9891\\u9053</button>',
      '',
      '  <button',
      '    class="fc-card-refresh"',
      '    disabled="{{busy || translating}}"',
      '    bindtap="openEndDialog"',
      '  >\\u7ed3\\u675f\\u4ea4\\u6d41</button>',
    ].join('\n'))
  );
}
fs.writeFileSync(talkWxmlPath, talkWxml, 'utf8');

const talkJsPath = path.join(root, 'pages', 'connect', 'talk', 'index.js');
let talkJs = fs.readFileSync(talkJsPath, 'utf8');
if (!talkJs.includes('scanPrepared:')) {
  talkJs = talkJs.replace(
    '    scan: false,\n',
    '    scan: false,\n    scanPrepared: false,\n'
  );
}
const setModeScanNew = `  setModeScan() {
    if (this.data.busy || this.data.translating || this.isHolding()) return;
    var turn = this.data.turn;
    if (
      turn &&
      turn.original &&
      turn.original.trim() &&
      this.data.savedTurnKey !== this.turnIdentity(turn)
    ) {
      this.setData({ note: '${u('\\u8bf7\\u5148\\u786e\\u8ba4\\u5f53\\u524d\\u6587\\u5b57\\uff0c\\u6216\\u6e05\\u7a7a\\u540e\\u518d\\u5207\\u6362\\u626b\\u7801\\u4ea4\\u6d41\\u3002')}' });
      return;
    }
    this.cancelVoice();
    // App embeds FieldHostInvite in Talk — do not navigate away.
    this.setData({ scan: true, note: '' });
  },

  onScanPrepared() {
    this.setData({ scanPrepared: true });
  },

  openFieldRoom() {
    var room = this.data.savedRoom;
    if (!room) return;
    wx.navigateTo({
      url: '/pages/messages/room/index?room=' + encodeURIComponent(room),
    });
  },

  goGuestJoin() {
    wx.navigateTo({ url: '/pages/connect/join/index' });
  },

  goHostInvite() {
    var room = this.data.savedRoom;
    if (!room) {
      wx.showToast({ title: '${u('\\u8bdd\\u9898\\u5c1a\\u672a\\u5c31\\u7eea')}', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url:
        '/pages/connect/host/index?room=' +
        encodeURIComponent(room) +
        '&create=1',
    });
  },`;

const setModeScanRe =
  /  setModeScan\(\) \{[\s\S]*?  goHostInvite\(\) \{[\s\S]*?\n  \},\n/;
if (!setModeScanRe.test(talkJs)) {
  console.error('talk setModeScan block not found');
  process.exit(1);
}
talkJs = talkJs.replace(setModeScanRe, setModeScanNew + '\n');
fs.writeFileSync(talkJsPath, talkJs, 'utf8');

// --- host page: thin wrapper around shared component ---
fs.writeFileSync(
  path.join(root, 'pages', 'connect', 'host', 'index.json'),
  JSON.stringify(
    {
      navigationBarTitleText: u('\\u626b\\u7801\\u4ea4\\u6d41'),
      usingComponents: {
        'field-host-invite': '/components/field-host-invite/index',
      },
    },
    null,
    2
  ) + '\n',
  'utf8'
);

fs.writeFileSync(
  path.join(root, 'pages', 'connect', 'host', 'index.wxml'),
  [
    '<view class="fc fc-host">',
    '  <field-host-invite',
    '    room-id="{{roomId}}"',
    '    allow-create="{{allowCreate}}"',
    '  />',
    '</view>',
    '',
  ].join('\n'),
  'utf8'
);

fs.writeFileSync(
  path.join(root, 'pages', 'connect', 'host', 'index.js'),
  `/**
 * Host invite page — thin wrapper (App FieldResume / deep-link entry).
 * Primary UX is embedded FieldHostInvite inside Talk.
 */
var session = require('../../../services/session');

Page({
  data: {
    roomId: '',
    allowCreate: true,
  },

  onLoad: function (query) {
    if (!session.requireSignedInOrRedirect()) return;
    var roomId = decodeURIComponent((query && query.room) || '');
    var allowCreate = !(query && query.create === '0');
    if (!roomId || roomId.charAt(0) !== '!') {
      wx.showToast({
        title: '${u('\\u65e0\\u6cd5\\u6062\\u590d\\u8bdd\\u9898')}',
        icon: 'none',
      });
      return;
    }
    this.setData({ roomId: roomId, allowCreate: allowCreate });
  },
});
`,
  'utf8'
);

// Verify Chinese in wxml
const wCheck = fs.readFileSync(path.join(compDir, 'index.wxml'), 'utf8');
if (!wCheck.includes(u('\\u626b\\u7801\\u4ea4\\u6d41')) || (wCheck.match(/\?\?/g) || []).length) {
  console.error('component wxml chinese fail');
  process.exit(1);
}
const talkCheck = fs.readFileSync(talkWxmlPath, 'utf8');
if (!talkCheck.includes('field-host-invite') || talkCheck.includes('打开宿主邀请')) {
  console.error('talk wire fail');
  process.exit(1);
}
console.log('component + talk/host wire ok');
