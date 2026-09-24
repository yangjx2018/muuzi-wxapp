const session = require('../../../services/session');
const creator = require('../../../services/creator');

var SCOPE_CHOICES = [
  { value: 'feed:read', label: '读取公开动态' },
  { value: 'post:write', label: '发布公开动态' },
  { value: 'contact:read', label: '读取留言正文' },
];

function scopeLabels(scopes) {
  return (scopes || [])
    .map(function (s) {
      for (var i = 0; i < SCOPE_CHOICES.length; i++) {
        if (SCOPE_CHOICES[i].value === s) return SCOPE_CHOICES[i].label;
      }
      return s;
    })
    .join(' / ');
}

function mapTokens(tokens) {
  var now = Date.now();
  return (tokens || []).map(function (r) {
    var status = '有效';
    if (r.revoked_at) status = '已撤销';
    else if (r.expires_at && new Date(r.expires_at).getTime() <= now) {
      status = '已过期';
    } else if (r.expires_at) {
      try {
        status = '有效至 ' + new Date(r.expires_at).toLocaleString();
      } catch (e) {
        status = '有效';
      }
    }
    return {
      id: r.id,
      prefix: r.prefix,
      subjectLine:
        (r.subject_type || '') + ':' + (r.subject_id || ''),
      scopesLabel: scopeLabels(r.scopes),
      status: status,
      canRevoke: !r.revoked_at,
    };
  });
}

function mapSources(sources, persona) {
  var works =
    (persona &&
      persona.knowledge_scope &&
      persona.knowledge_scope.works) ||
    [];
  var posts =
    (persona &&
      persona.knowledge_scope &&
      persona.knowledge_scope.posts) ||
    [];
  var selectedCount = works.length + posts.length;
  return (sources || []).map(function (s) {
    var selected =
      s.kind === 'works'
        ? works.indexOf(s.id) >= 0
        : posts.indexOf(s.id) >= 0;
    return {
      id: s.id,
      title: s.title,
      kind: s.kind,
      kindLabel: s.kind === 'works' ? '作品' : '动态',
      checked: selected,
      disabled: !selected && selectedCount >= 100,
    };
  });
}

Page({
  data: {
    loading: true,
    busy: false,
    error: '',
    note: '',
    owner: '',
    ownerLabel: '本人',
    scopeChoices: SCOPE_CHOICES.map(function (c) {
      return Object.assign({}, c, { checked: c.value === 'feed:read' });
    }),
    days: '7',
    plain: '',
    tokens: [],
    personaName: '',
    personaBrief: '',
    sources: [],
    hasPersona: false,
  },
  _alive: true,
  _token: '',
  _owner: '',
  _scopes: ['feed:read'],
  _persona: null,
  _revision: 0,
  _sources: [],

  onLoad(query) {
    var owner =
      query && query.owner ? decodeURIComponent(String(query.owner)) : '';
    this._owner = owner;
    this.setData({
      owner: owner,
      ownerLabel: owner || '本人',
    });
  },

  onShow() {
    this._alive = true;
    if (!session.requireSignedInOrRedirect()) return;
    this.load();
  },
  onUnload() {
    this._alive = false;
  },

  goBack() {
    wx.navigateBack({
      fail: function () {
        wx.switchTab({ url: '/pages/me/index' });
      },
    });
  },

  load() {
    var self = this;
    self.setData({ loading: true, error: '', note: '' });
    creator
      .loadCreatorSession(session.snapshot())
      .then(function (opened) {
        self._token = opened.token;
        return Promise.all([
          creator.fetchAgentTokens(opened.token, self._owner),
          creator.fetchPersona(opened.token, self._owner),
        ]);
      })
      .then(function (bundle) {
        if (!self._alive) return;
        var persona = bundle[1].persona;
        self._persona = persona;
        self._revision = (persona && persona.revision) || 0;
        self._sources = bundle[1].sources || [];
        self.setData({
          loading: false,
          tokens: mapTokens(bundle[0]),
          hasPersona: !!persona,
          personaName: (persona && persona.display_name) || '',
          personaBrief: (persona && persona.persona_brief) || '',
          sources: mapSources(self._sources, persona),
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          loading: false,
          error: (err && err.message) || '读取失败',
        });
      });
  },

  reloadQuiet() {
    var self = this;
    return Promise.all([
      creator.fetchAgentTokens(this._token, this._owner),
      creator.fetchPersona(this._token, this._owner),
    ]).then(function (bundle) {
      if (!self._alive) return;
      var persona = bundle[1].persona;
      self._persona = persona;
      self._revision = (persona && persona.revision) || 0;
      self._sources = bundle[1].sources || [];
      self.setData({
        tokens: mapTokens(bundle[0]),
        hasPersona: !!persona,
        personaName: (persona && persona.display_name) || '',
        personaBrief: (persona && persona.persona_brief) || '',
        sources: mapSources(self._sources, persona),
      });
    });
  },

  onScopes(e) {
    var values = (e.detail && e.detail.value) || [];
    this._scopes = values;
    this.setData({
      scopeChoices: SCOPE_CHOICES.map(function (c) {
        return Object.assign({}, c, {
          checked: values.indexOf(c.value) >= 0,
        });
      }),
    });
  },

  onDays(e) {
    this.setData({ days: e.detail.value });
  },

  onPersonaName(e) {
    this.setData({ personaName: e.detail.value });
  },

  onPersonaBrief(e) {
    this.setData({ personaBrief: e.detail.value });
  },

  onSourceToggle(e) {
    var id = e.currentTarget.dataset.id;
    var kind = e.currentTarget.dataset.kind;
    if (!this._persona) return;
    var scope = Object.assign(
      { works: [], posts: [] },
      this._persona.knowledge_scope || {}
    );
    var list = (scope[kind] || []).slice();
    var idx = list.indexOf(id);
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      if (
        (scope.works || []).length + (scope.posts || []).length >= 100
      ) {
        return;
      }
      list.push(id);
    }
    scope[kind] = list;
    this._persona = Object.assign({}, this._persona, {
      knowledge_scope: scope,
    });
    this.setData({ sources: mapSources(this._sources, this._persona) });
  },

  createToken() {
    var self = this;
    if (!this._token || this.data.busy || this.data.plain) return;
    if (!this._scopes.length) {
      this.setData({ error: '请至少选择一个用途' });
      return;
    }
    var days = Math.min(30, Math.max(1, Number(this.data.days) || 7));
    this.setData({ busy: true, error: '', note: '' });
    creator
      .createAgentToken(this._token, this._owner, {
        scopes: this._scopes.slice(),
        days: days,
      })
      .then(function (result) {
        return self.reloadQuiet().then(function () {
          return result;
        });
      })
      .then(function (result) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          plain: (result && result.token) || '',
          note: '令牌已创建，仅本次显示',
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          error: (err && err.message) || '创建失败',
        });
      });
  },

  hidePlain() {
    this.setData({ plain: '' });
  },

  copyPlain() {
    var plain = this.data.plain;
    if (!plain) return;
    wx.setClipboardData({
      data: plain,
      success: function () {
        wx.showToast({ title: '已复制令牌', icon: 'success' });
      },
    });
  },

  revoke(e) {
    var self = this;
    var id = e.currentTarget.dataset.id;
    if (!this._token || !id || this.data.busy) return;
    this.setData({ busy: true, error: '', note: '' });
    creator
      .revokeAgentToken(this._token, id)
      .then(function () {
        return self.reloadQuiet();
      })
      .then(function () {
        if (!self._alive) return;
        self.setData({
          busy: false,
          plain: '',
          note: '已撤销',
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          error: (err && err.message) || '撤销失败',
        });
      });
  },

  savePersona() {
    var self = this;
    if (!this._token || !this._persona || this.data.busy) return;
    var scope = Object.assign(
      { works: [], posts: [] },
      this._persona.knowledge_scope || {}
    );
    var payload = {
      display_name: String(this.data.personaName || '').trim(),
      persona_brief: String(this.data.personaBrief || '').trim(),
      knowledge_scope: {
        works: (scope.works || [])
          .map(function (x) {
            return String(x).trim();
          })
          .filter(Boolean),
        posts: (scope.posts || [])
          .map(function (x) {
            return String(x).trim();
          })
          .filter(Boolean),
      },
      visitor_enabled: false,
      revision: this._revision,
    };
    this.setData({ busy: true, error: '', note: '' });
    creator
      .savePersona(this._token, this._owner, payload)
      .then(function () {
        return self.reloadQuiet();
      })
      .then(function () {
        if (!self._alive) return;
        self.setData({ busy: false, note: '人设配置已保存' });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          busy: false,
          error: (err && err.message) || '保存失败',
        });
      });
  },
});
