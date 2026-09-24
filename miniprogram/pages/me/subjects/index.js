const session = require('../../../services/session');
const creator = require('../../../services/creator');
const studioLinks = require('../../../services/studioLinks');

var WORK_KIND_LABELS = ['链接', '影片', '声音'];
var WORK_KIND_IDS = ['link', 'video', 'audio'];

function verificationCopy(data) {
  if (!data) return '尚未申请';
  if (data.verified) return '运营者已核验';
  var status = data.request && data.request.status;
  return (
    ({
      pending: '审核中',
      approved: '审核通过',
      rejected: '未通过',
      withdrawn: '已撤回',
    }[status] || '尚未申请')
  );
}

function pickImagePath() {
  return new Promise(function (resolve, reject) {
    function fail(err) {
      reject(err || new Error('未选择图片'));
    }
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: function (res) {
          var file =
            res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath;
          if (file) resolve(file);
          else fail();
        },
        fail: fail,
      });
      return;
    }
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var file = res.tempFilePaths && res.tempFilePaths[0];
        if (file) resolve(file);
        else fail();
      },
      fail: fail,
    });
  });
}

Page({
  data: {
    loading: true,
    busy: false,
    opsBusy: false,
    error: '',
    note: '',
    opsNote: '',
    limit: 0,
    names: ['本人'],
    selectedIndex: 0,
    subjects: [],
    current: null,
    blocked: false,
    name: '',
    slug: '',
    formIndex: 0,
    formLabels: ['虚拟人', '虚拟企业'],
    activeCount: 0,
    works: [],
    posts: [],
    verification: '尚未申请',
    shortUrl: '',
    workTitle: '',
    workUrl: '',
    workKindIndex: 0,
    workKindLabels: WORK_KIND_LABELS,
    legalName: '',
    evidence: '',
    statement: '',
  },
  _alive: true,
  _token: '',
  _subjects: [],

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
    self.setData({ loading: true, error: '' });
    creator
      .loadCreatorSession(session.snapshot())
      .then(function (opened) {
        self._token = opened.token;
        return creator.listSubjects(opened.token);
      })
      .then(function (data) {
        if (!self._alive) return;
        self.applyList(data.subjects || [], data.limit || 0, self.data.selectedIndex || 0);
        self.setData({ loading: false });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          loading: false,
          error: (err && err.message) || '读取失败',
        });
      });
  },

  applyList(subjects, limit, selectedIndex) {
    this._subjects = subjects;
    var names = ['本人'].concat(
      subjects.map(function (s) {
        return (
          (s.name || s.slug) +
          ' · ' +
          (s.form === 'org' ? '虚拟企业' : '虚拟人') +
          (s.restriction ? ' · 受限' : '')
        );
      })
    );
    var idx = Math.min(selectedIndex || 0, names.length - 1);
    var current = idx > 0 ? subjects[idx - 1] : null;
    var activeCount = subjects.filter(function (s) {
      return s.status === 'active';
    }).length;
    var blocked = !!(
      current &&
      (current.restriction ||
        current.status !== 'active' ||
        current.suspended_at ||
        current.quota_blocked)
    );
    this.setData({
      subjects: subjects,
      names: names,
      selectedIndex: idx,
      current: current,
      blocked: blocked,
      limit: limit,
      activeCount: activeCount,
      works: [],
      posts: [],
      verification: '尚未申请',
      shortUrl: '',
      opsNote: '',
    });
    if (current) this.reloadOps(current);
  },

  reloadOps(subject) {
    var self = this;
    if (!this._token || !subject) return Promise.resolve();
    var owner = creator.subjectOwner(subject.id);
    this.setData({ opsBusy: true, opsNote: '' });
    return Promise.all([
      creator.fetchWorks(this._token, '', owner).catch(function () {
        return { works: [] };
      }),
      creator.fetchManagedPosts(this._token, owner).catch(function () {
        return { posts: [] };
      }),
      creator.fetchSubjectVerification(this._token, subject.id).catch(function () {
        return null;
      }),
    ]).then(function (bundle) {
      if (!self._alive) return;
      self.setData({
        opsBusy: false,
        works: (bundle[0] && bundle[0].works) || [],
        posts: (bundle[1] && bundle[1].posts) || [],
        verification: verificationCopy(bundle[2]),
      });
    });
  },

  act(work) {
    var self = this;
    if (this.data.opsBusy || !this._token) return Promise.resolve();
    this.setData({ opsBusy: true, opsNote: '', error: '' });
    return Promise.resolve()
      .then(work)
      .then(function () {
        if (!self._alive) return null;
        return creator.listSubjects(self._token).then(function (data) {
          self.applyList(
            data.subjects || [],
            data.limit || 0,
            self.data.selectedIndex
          );
          self.setData({ opsNote: '操作已保存' });
        });
      })
      .catch(function (err) {
        if (!self._alive) return;
        self.setData({
          opsBusy: false,
          opsNote: (err && err.message) || '操作失败',
        });
      });
  },

  onPick(e) {
    var index = Number(e.detail.value);
    this.applyList(this._subjects, this.data.limit, index);
  },

  onName(e) {
    this.setData({ name: e.detail.value });
  },
  onSlug(e) {
    this.setData({ slug: e.detail.value });
  },
  onForm(e) {
    this.setData({ formIndex: Number(e.detail.value) });
  },
  onWorkTitle(e) {
    this.setData({ workTitle: e.detail.value });
  },
  onWorkUrl(e) {
    this.setData({ workUrl: e.detail.value });
  },
  onWorkKind(e) {
    this.setData({ workKindIndex: Number(e.detail.value) });
  },
  onLegalName(e) {
    this.setData({ legalName: e.detail.value });
  },
  onEvidence(e) {
    this.setData({ evidence: e.detail.value });
  },
  onStatement(e) {
    this.setData({ statement: e.detail.value });
  },

  create() {
    var self = this;
    if (!this._token || this.data.busy) return;
    var name = String(this.data.name || '').trim();
    var slug = String(this.data.slug || '')
      .trim()
      .toLowerCase();
    if (!name || !slug) {
      this.setData({ error: '请填写名称与主页地址' });
      return;
    }
    this.setData({ busy: true, error: '', note: '' });
    creator
      .createSubject(this._token, {
        name: name,
        slug: slug,
        form: this.data.formIndex === 1 ? 'org' : 'person',
      })
      .then(function (result) {
        return creator.listSubjects(self._token).then(function (data) {
          return { data: data, created: result && result.subject };
        });
      })
      .then(function (bundle) {
        if (!self._alive) return;
        var subjects = bundle.data.subjects || [];
        var idx = 0;
        if (bundle.created) {
          for (var i = 0; i < subjects.length; i++) {
            if (subjects[i].id === bundle.created.id) {
              idx = i + 1;
              break;
            }
          }
        }
        self.applyList(subjects, bundle.data.limit || 0, idx);
        self.setData({
          busy: false,
          name: '',
          slug: '',
          note: '主体已创建',
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

  toggleActive() {
    var self = this;
    var current = this.data.current;
    if (!current) return;
    if (
      current.status === 'disabled' &&
      current.disabled_by_type === 'platform'
    ) {
      wx.showToast({ title: '平台停用，无法恢复', icon: 'none' });
      return;
    }
    var active = current.status !== 'active';
    this.act(function () {
      return creator.setSubjectActive(self._token, current.id, active);
    });
  },

  makeShortLink() {
    var self = this;
    var current = this.data.current;
    if (!current || this.data.blocked) return;
    var owner = creator.subjectOwner(current.id);
    this.act(function () {
      return creator
        .createShortLink(self._token, { kind: 'page' }, owner)
        .then(function (result) {
          if (self._alive) {
            self.setData({
              shortUrl: (result && result.link && result.link.url) || '',
            });
          }
        });
    });
  },

  copyShort() {
    var url = this.data.shortUrl;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: function () {
        wx.showToast({ title: '已复制短链', icon: 'success' });
      },
    });
  },

  addWork() {
    var self = this;
    var current = this.data.current;
    if (!current || this.data.blocked) return;
    var title = String(this.data.workTitle || '').trim();
    var url = String(this.data.workUrl || '').trim();
    if (!title || !url) {
      wx.showToast({ title: '请填写标题和地址', icon: 'none' });
      return;
    }
    var kind = WORK_KIND_IDS[this.data.workKindIndex] || 'link';
    var owner = creator.subjectOwner(current.id);
    this.act(function () {
      return creator
        .addWork(self._token, {
          kind: kind,
          title: title,
          url: url,
          description: '',
          visibility: 'private',
          owner: owner,
        })
        .then(function () {
          if (self._alive) {
            self.setData({ workTitle: '', workUrl: '' });
          }
        });
    });
  },

  uploadWorkImage() {
    var self = this;
    var current = this.data.current;
    if (!current || this.data.blocked) return;
    var owner = creator.subjectOwner(current.id);
    this.act(function () {
      return pickImagePath().then(function (filePath) {
        return creator.uploadImage(self._token, filePath, 'work', owner);
      });
    }).catch(function () {});
  },

  toggleWorkVisibility(e) {
    var self = this;
    var current = this.data.current;
    var id = e.currentTarget.dataset.id;
    var visibility = e.currentTarget.dataset.visibility;
    if (!current || !id || this.data.blocked) return;
    var owner = creator.subjectOwner(current.id);
    this.act(function () {
      return creator.updateWork(self._token, id, {
        visibility: visibility === 'public' ? 'private' : 'public',
        owner: owner,
      });
    });
  },

  removeWork(e) {
    var self = this;
    var current = this.data.current;
    var id = e.currentTarget.dataset.id;
    if (!current || !id || this.data.blocked) return;
    var owner = creator.subjectOwner(current.id);
    wx.showModal({
      title: '删除作品',
      content: '删除后不可恢复，确认删除？',
      success: function (res) {
        if (!res.confirm) return;
        self.act(function () {
          return creator.deleteWork(self._token, id, owner);
        });
      },
    });
  },

  closeManagedPost(e) {
    var self = this;
    var current = this.data.current;
    var id = e.currentTarget.dataset.id;
    if (!current || !id || this.data.blocked) return;
    var owner = creator.subjectOwner(current.id);
    this.act(function () {
      return creator.closePost(self._token, id, owner);
    });
  },

  removeManagedPost(e) {
    var self = this;
    var current = this.data.current;
    var id = e.currentTarget.dataset.id;
    if (!current || !id || this.data.blocked) return;
    var owner = creator.subjectOwner(current.id);
    wx.showModal({
      title: '删除动态',
      content: '删除后不可恢复，确认删除？',
      success: function (res) {
        if (!res.confirm) return;
        self.act(function () {
          return creator.deletePost(self._token, id, owner);
        });
      },
    });
  },

  applyVerification() {
    var self = this;
    var current = this.data.current;
    if (!current || this.data.blocked) return;
    var legalName = String(this.data.legalName || '').trim();
    var evidence = String(this.data.evidence || '').trim();
    var statement = String(this.data.statement || '').trim();
    if (!legalName || !evidence || !statement) {
      wx.showToast({ title: '请填写认证材料', icon: 'none' });
      return;
    }
    this.act(function () {
      return creator
        .applySubjectVerification(self._token, current.id, {
          legal_name: legalName,
          links: [evidence],
          statement: statement,
          category: 'other',
        })
        .then(function () {
          if (self._alive) {
            self.setData({ legalName: '', evidence: '', statement: '' });
          }
        });
    });
  },

  goEditHome() {
    wx.navigateTo({ url: '/pages/me/edit-home/index' });
  },

  goMembership() {
    wx.navigateTo({ url: '/pages/me/membership/index' });
  },

  copyPublic() {
    var current = this.data.current;
    if (!current || !current.slug) return;
    var url = creator.pageUrlFor(current.slug);
    wx.setClipboardData({
      data: url,
      success: function () {
        wx.showToast({ title: '已复制公开页', icon: 'success' });
      },
    });
  },

  copyStudio() {
    studioLinks.copyLink('studio').then(
      function () {
        wx.showToast({ title: '已复制 Studio', icon: 'success' });
      },
      function (err) {
        wx.showToast({
          title: (err && err.message) || '复制失败',
          icon: 'none',
        });
      }
    );
  },

  goContacts() {
    var current = this.data.current;
    if (!current) {
      wx.navigateTo({ url: '/pages/me/contacts/index' });
      return;
    }
    wx.navigateTo({
      url:
        '/pages/me/contacts/index?owner=' +
        encodeURIComponent(creator.subjectOwner(current.id)),
    });
  },

  goSharing() {
    var current = this.data.current;
    if (!current) return;
    wx.navigateTo({
      url:
        '/pages/me/sharing/index?owner=' +
        encodeURIComponent(creator.subjectOwner(current.id)),
    });
  },

  goCompose() {
    var current = this.data.current;
    if (!current || this.data.blocked) return;
    wx.navigateTo({
      url:
        '/pages/me/compose/index?owner=' +
        encodeURIComponent(creator.subjectOwner(current.id)),
    });
  },

  goAgentAccess() {
    var current = this.data.current;
    if (!current) return;
    wx.navigateTo({
      url:
        '/pages/me/agent-access/index?owner=' +
        encodeURIComponent(creator.subjectOwner(current.id)),
    });
  },
});
