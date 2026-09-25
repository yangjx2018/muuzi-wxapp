const config = require('../config');
const http = require('./http');
const store = require('../adapters/secure-store');

const CREATOR_KEY = 'creator_session_json';

function issueAppCode(session) {
  return http
    .request({
      url: session.nodeOrigin + config.APP_CODE_PATH,
      method: 'POST',
      header: { Authorization: 'Bearer ' + session.accessToken },
      data: {},
    })
    .then(function (payload) {
      const code = payload && typeof payload.app_code === 'string' ? payload.app_code : '';
      if (
        !code.startsWith(config.APP_CODE_PREFIX) ||
        code.length < 32 ||
        code.length > 96
      ) {
        throw new Error('节点返回的登录凭证无效，请重试');
      }
      return code;
    })
    .catch(function (err) {
      if (err && err.statusCode === 404) {
        throw Object.assign(
          new Error(
            '当前节点未开通 MuuZi 身份换票（缺少 /cosmac/muuzi/app-code）。本地 GuDuu 默认关闭 Connect；请改用 im.muuzi.co，或在本地启用 Connect + MuuZi 身份绑定后再试。不需要单独启动 MuuZi 客户端。'
          ),
          { code: 'APP_CODE_UNAVAILABLE', statusCode: 404 }
        );
      }
      throw err;
    });
}

function openCreatorSession(session) {
  return http
    .request({
      url: config.PLATFORM_API + '/api/creator/config',
      method: 'GET',
    })
    .then(function (cfg) {
      if (!cfg || cfg.available !== true) {
        throw Object.assign(new Error('平台身份服务暂未就绪；节点登录仍然有效'), {
          code: 'PLATFORM_IDENTITY_UNAVAILABLE',
          statusCode: 503,
        });
      }
      if (cfg.method !== 'guduu-connect-app-code') {
        throw new Error('平台登录方式暂不兼容，请稍后重试');
      }
      return issueAppCode(session);
    })
    .then(function (appCode) {
      return http.request({
        url: config.PLATFORM_API + '/api/creator/session',
        method: 'POST',
        data: {
          node_domain: session.nodeDomain,
          app_code: appCode,
          client: 'app',
        },
      });
    })
    .then(function (payload) {
      const token = payload && payload.session_token;
      const creator = payload && payload.creator;
      const expectedId =
        'guduu-node:' + session.instanceId + ':' + session.matrixUserId;
      if (typeof token !== 'string' || !token) {
        throw new Error('平台没有返回有效会话，请重试');
      }
      if (
        !creator ||
        creator.matrix_user_id !== session.matrixUserId ||
        creator.node_domain !== session.nodeDomain ||
        Number(creator.instance_id) !== Number(session.instanceId) ||
        creator.account_id !== expectedId
      ) {
        throw new Error('平台返回的账号与当前节点账号不一致，请重试');
      }
      const value = { token: token, creator: creator, platform_api: config.PLATFORM_API };
      store.set(CREATOR_KEY, JSON.stringify(value));
      return value;
    });
}

function loadCreatorSession(session) {
  const raw = store.get(CREATOR_KEY);
  if (raw) {
    try {
      const stored = JSON.parse(raw);
      if (
        stored &&
        stored.token &&
        stored.creator &&
        stored.creator.matrix_user_id === session.matrixUserId &&
        stored.creator.node_domain === session.nodeDomain &&
        (stored.platform_api || config.PLATFORM_API) === config.PLATFORM_API
      ) {
        return http
          .request({
            url: config.PLATFORM_API + '/api/creator/me',
            method: 'GET',
            header: { Authorization: 'Bearer ' + stored.token },
          })
          .then(function (me) {
            const value = {
              token: stored.token,
              creator: me.creator || stored.creator,
              platform_api: config.PLATFORM_API,
            };
            store.set(CREATOR_KEY, JSON.stringify(value));
            return value;
          })
          .catch(function (err) {
            if (err.statusCode === 401 || err.statusCode === 403) {
              store.remove(CREATOR_KEY);
              return openCreatorSession(session);
            }
            throw err;
          });
      }
    } catch (e) {
      store.remove(CREATOR_KEY);
    }
  }
  return openCreatorSession(session);
}

function clearCreatorSession() {
  store.remove(CREATOR_KEY);
}

/** Creator 平台鉴权请求；path 必须落在 /api/creator/ */
function platformRequest(token, path, method, data) {
  if (typeof path !== 'string' || !path.startsWith('/api/creator/')) {
    return Promise.reject(new Error('平台接口路径无效'));
  }
  const opts = {
    url: config.PLATFORM_API + path,
    method: method || 'GET',
    header: { Authorization: 'Bearer ' + token },
  };
  if (data !== undefined) opts.data = data;
  return http.request(opts);
}

var EMPTY_DRAFT = {
  display_name: '',
  headline: '',
  bio: '',
  portrait_url: '',
  cover_url: '',
  cover_position: 50,
  profile_metadata: {
    location: '',
    languages: [],
    offers: [],
    wants: [],
  },
  socials: [],
  muu_enabled: false,
  show_branding: true,
  sections: [],
};

function emptyMetadata() {
  return {
    location: '',
    languages: [],
    offers: [],
    wants: [],
  };
}

function mergeMetadata(raw) {
  var src = raw && typeof raw === 'object' ? raw : {};
  var languages = Array.isArray(src.languages)
    ? src.languages.filter(function (x) {
        return typeof x === 'string' && x;
      })
    : [];
  var offers = Array.isArray(src.offers)
    ? src.offers.map(function (o) {
        o = o || {};
        return {
          label: typeof o.label === 'string' ? o.label : '',
          price_minor:
            o.price_minor == null || o.price_minor === ''
              ? null
              : Number(o.price_minor),
          currency: o.currency === 'USD' ? 'USD' : 'CNY',
          lead_time_days:
            o.lead_time_days == null || o.lead_time_days === ''
              ? null
              : Number(o.lead_time_days),
        };
      })
    : [];
  var wants = Array.isArray(src.wants)
    ? src.wants.map(function (w) {
        return { label: typeof (w && w.label) === 'string' ? w.label : '' };
      })
    : [];
  return {
    location: typeof src.location === 'string' ? src.location : '',
    languages: languages,
    offers: offers,
    wants: wants,
  };
}

function mergeDraft(draft) {
  var next = Object.assign({}, EMPTY_DRAFT, draft || {});
  next.display_name = typeof next.display_name === 'string' ? next.display_name : '';
  next.headline = typeof next.headline === 'string' ? next.headline : '';
  next.bio = typeof next.bio === 'string' ? next.bio : '';
  next.portrait_url =
    typeof next.portrait_url === 'string' ? next.portrait_url : '';
  next.cover_url = typeof next.cover_url === 'string' ? next.cover_url : '';
  var pos = Number(next.cover_position);
  next.cover_position =
    Number.isFinite(pos) && pos >= 0 && pos <= 100 ? pos : 50;
  next.profile_metadata = mergeMetadata(next.profile_metadata);
  next.socials = Array.isArray(next.socials) ? next.socials : [];
  next.sections = Array.isArray(next.sections) ? next.sections : [];
  next.muu_enabled = !!next.muu_enabled;
  next.show_branding = next.show_branding !== false;
  return next;
}

/** 草稿预览 HTML（与 App fetchPreviewHtml 同路径）；orgId 走企业预览。 */
function fetchPreviewHtml(token, virtualId, orgId) {
  if (!token) return Promise.reject(new Error('未登录平台'));
  var path = 'preview';
  if (virtualId) {
    path = 'virtual-subjects/' + encodeURIComponent(virtualId) + '/preview';
  } else if (orgId) {
    path = 'orgs/' + encodeURIComponent(orgId) + '/preview';
  }
  return new Promise(function (resolve, reject) {
    wx.request({
      url: config.PLATFORM_API + '/api/creator/' + path,
      method: 'GET',
      header: {
        Authorization: 'Bearer ' + token,
        Accept: 'text/html,application/json',
      },
      timeout: 30000,
      success: function (res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(typeof res.data === 'string' ? res.data : String(res.data || ''));
          return;
        }
        var err = new Error('预览载入失败（' + res.statusCode + '）');
        err.statusCode = res.statusCode;
        reject(err);
      },
      fail: function () {
        var err = new Error('暂时无法连接，请检查网络后重试');
        err.code = 'NETWORK';
        reject(err);
      },
    });
  });
}

function fetchPage(token) {
  return platformRequest(token, '/api/creator/page').then(function (body) {
    if (!body || !body.page) throw new Error('主页数据无效');
    var page = body.page;
    return Object.assign({}, page, { draft: mergeDraft(page.draft) });
  });
}

function registerSlug(token, slug) {
  return platformRequest(token, '/api/creator/slug', 'POST', { slug: slug });
}

function savePage(token, draft, skin) {
  return platformRequest(token, '/api/creator/page', 'PUT', {
    draft: mergeDraft(draft),
    skin: skin || 'indigo',
  }).then(function (body) {
    return {
      draft: mergeDraft(body && body.draft),
      skin: (body && body.skin) || skin || 'indigo',
    };
  });
}

function publishPage(token) {
  return platformRequest(token, '/api/creator/page/publish', 'POST', {});
}

/**
 * 上传本地临时图片。filePath 为 wx.chooseMedia / chooseImage 返回路径。
 * purpose: profile | work
 * owner: 可选 virtual:… 主体归属
 */
function uploadImage(token, filePath, purpose, owner) {
  if (!filePath) {
    return Promise.reject(new Error('未选择图片'));
  }
  var usePurpose = purpose === 'profile' ? 'profile' : 'work';
  var url =
    config.PLATFORM_API +
    '/api/creator/uploads?purpose=' +
    encodeURIComponent(usePurpose);
  if (owner) {
    url += '&owner=' + encodeURIComponent(owner);
  }
  return new Promise(function (resolve, reject) {
    wx.uploadFile({
      url: url,
      filePath: filePath,
      name: 'image',
      header: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/json',
      },
      success: function (res) {
        var body = res.data;
        if (typeof body === 'string') {
          try {
            body = JSON.parse(body);
          } catch (e) {
            body = {};
          }
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && body && body.url) {
          resolve({
            url: String(body.url),
            work_id: body.work_id ? String(body.work_id) : '',
          });
          return;
        }
        var err = new Error(
          (body && (body.error || body.message)) ||
            '上传失败（' + res.statusCode + '）'
        );
        err.statusCode = res.statusCode;
        err.code = body && (body.code || body.errcode);
        reject(err);
      },
      fail: function () {
        var err = new Error('暂时无法上传，请检查网络后重试');
        err.code = 'NETWORK';
        reject(err);
      },
    });
  });
}

function fetchOrgs(token) {
  return platformRequest(token, '/api/creator/orgs').then(function (body) {
    return (body && Array.isArray(body.orgs) ? body.orgs : []) || [];
  });
}

function fetchBilling(token) {
  return platformRequest(token, '/api/creator/billing');
}

function fetchVerification(token) {
  return platformRequest(token, '/api/creator/verification');
}

function fetchStats(token) {
  return platformRequest(token, '/api/creator/stats').catch(function (err) {
    if (err && (err.statusCode === 404 || err.statusCode === 403)) return null;
    throw err;
  });
}

/* 企业主页与个人主页同一套草稿；企业接口只对所有者 / 管理员开放。 */
function orgOwner(orgId) {
  return 'org:' + String(orgId || '');
}

function orgPath(orgId) {
  return '/api/creator/orgs/' + encodeURIComponent(orgId);
}

function fetchOrgPage(token, orgId) {
  return platformRequest(token, orgPath(orgId) + '/page').then(function (body) {
    if (!body || !body.page) throw new Error('企业主页数据无效');
    var page = body.page;
    return {
      org: body.org || null,
      page: Object.assign({}, page, { draft: mergeDraft(page.draft) }),
    };
  });
}

function saveOrgPage(token, orgId, draft, skin) {
  return platformRequest(token, orgPath(orgId) + '/page', 'PUT', {
    draft: mergeDraft(draft),
    skin: skin || 'indigo',
  }).then(function (body) {
    return {
      draft: mergeDraft(body && body.draft),
      skin: (body && body.skin) || skin || 'indigo',
    };
  });
}

function publishOrgPage(token, orgId) {
  return platformRequest(token, orgPath(orgId) + '/page/publish', 'POST', {});
}

function fetchOrgMembers(token, orgId) {
  return platformRequest(token, orgPath(orgId) + '/members');
}

function searchOrgCandidates(token, orgId, query) {
  return platformRequest(
    token,
    '/api/creator/node-organizations/' +
      encodeURIComponent(orgId) +
      '/candidates?q=' +
      encodeURIComponent(query || '')
  ).then(function (body) {
    return (body && Array.isArray(body.candidates) && body.candidates) || [];
  });
}

function inviteOrgMember(token, orgId, targetUserId) {
  return platformRequest(
    token,
    '/api/creator/node-organizations/' +
      encodeURIComponent(orgId) +
      '/invitations',
    'POST',
    { target_user_id: targetUserId }
  );
}

function releaseOrgSeat(token, orgId, seatId) {
  return platformRequest(
    token,
    '/api/creator/node-organizations/' +
      encodeURIComponent(orgId) +
      '/invitations/' +
      encodeURIComponent(seatId),
    'DELETE'
  );
}

function createOrgInviteCode(token, orgId) {
  return platformRequest(token, orgPath(orgId) + '/invites', 'POST', {
    role: 'member',
    max_uses: 1,
    days: 7,
  });
}

function deleteOrgInviteCode(token, orgId, code) {
  return platformRequest(
    token,
    orgPath(orgId) + '/invites/' + encodeURIComponent(code),
    'DELETE'
  );
}

function removeOrgMember(token, orgId, accountId) {
  return platformRequest(
    token,
    orgPath(orgId) + '/members/' + encodeURIComponent(accountId),
    'DELETE'
  );
}

function seatLinkUrl(linkToken) {
  return (
    config.PLATFORM_API +
    '/app/enterprise/join/' +
    encodeURIComponent(linkToken)
  );
}

function createOrgSeatLink(token, orgId, days) {
  var body = days === undefined ? {} : { days: days };
  return platformRequest(
    token,
    '/api/creator/node-organizations/' +
      encodeURIComponent(orgId) +
      '/seat-links',
    'POST',
    body
  );
}

function revokeOrgSeatLink(token, orgId, linkId) {
  return platformRequest(
    token,
    '/api/creator/node-organizations/' +
      encodeURIComponent(orgId) +
      '/seat-links/' +
      encodeURIComponent(linkId),
    'DELETE'
  );
}

function nodeOrganizationsReadiness(token) {
  return platformRequest(token, '/api/creator/node-organizations/readiness');
}

function linkNodeOrganization(token, orgId, slug) {
  return platformRequest(
    token,
    '/api/creator/node-organizations/link',
    'POST',
    { org_id: String(orgId), slug: slug }
  );
}

function fetchPublicPage(slug) {
  return http.request({
    url:
      config.PLATFORM_API +
      '/api/public/pages/' +
      encodeURIComponent(slug),
    method: 'GET',
  });
}

function pageUrlFor(slug) {
  return config.PLATFORM_API + '/' + encodeURIComponent(slug);
}

function fetchInterests(token) {
  return platformRequest(token, '/api/creator/interests').then(function (body) {
    return (
      (body && body.interests) || {
        offers: [],
        wants: [],
        excludes: [],
        price_min_minor: null,
        price_max_minor: null,
        notes: '',
      }
    );
  });
}

function saveInterests(token, interests) {
  return platformRequest(token, '/api/creator/interests', 'PUT', interests);
}

function fetchSlugPolicy(token) {
  return platformRequest(token, '/api/creator/slug-policy');
}

function fetchStorefront(token) {
  return platformRequest(token, '/api/creator/storefront');
}

function saveStorefront(token, settings) {
  return platformRequest(token, '/api/creator/storefront', 'PUT', settings);
}

function fetchFeaturedDraft(token) {
  return platformRequest(token, '/api/creator/storefront/featured-draft');
}

function saveFeaturedDraft(token, draft) {
  return platformRequest(
    token,
    '/api/creator/storefront/featured-draft',
    'PUT',
    draft
  );
}

function fetchStorefrontPublication(token) {
  return platformRequest(token, '/api/creator/storefront/publication');
}

function publishStorefront(token, draft) {
  return platformRequest(
    token,
    '/api/creator/storefront/publication',
    'POST',
    draft
  );
}

function unpublishStorefront(token) {
  return platformRequest(
    token,
    '/api/creator/storefront/publication',
    'DELETE'
  );
}

function fetchStorefrontLinks(token, after) {
  var q = after ? '?after=' + encodeURIComponent(after) : '';
  return platformRequest(token, '/api/creator/storefront/links' + q);
}

function saveStorefrontLink(token, body, id) {
  if (id) {
    return platformRequest(
      token,
      '/api/creator/storefront/links/' + encodeURIComponent(id),
      'PUT',
      body
    );
  }
  return platformRequest(token, '/api/creator/storefront/links', 'POST', body);
}

function deleteStorefrontLink(token, id) {
  return platformRequest(
    token,
    '/api/creator/storefront/links/' + encodeURIComponent(id),
    'DELETE'
  );
}

function fetchInstagramMedia(token) {
  return platformRequest(token, '/api/creator/instagram-media').catch(
    function () {
      return null;
    }
  );
}

function fetchTikTokMedia(token) {
  return platformRequest(token, '/api/creator/tiktok-media').catch(function () {
    return null;
  });
}

function fetchShortLinks(token, owner) {
  return platformRequest(
    token,
    '/api/creator/short-links' + ownerQuery(owner)
  );
}

function ownerQuery(owner) {
  if (!owner) return '';
  return '?owner=' + encodeURIComponent(owner);
}

function fetchContacts(token, owner, after) {
  var q = ownerQuery(owner);
  if (after) q += (q ? '&' : '?') + 'after=' + encodeURIComponent(after);
  return platformRequest(token, '/api/creator/contacts' + q);
}

function patchContact(token, id, owner, body) {
  return platformRequest(
    token,
    '/api/creator/contacts/' + encodeURIComponent(id) + ownerQuery(owner),
    'PATCH',
    body
  );
}

function deleteContact(token, id, owner) {
  return platformRequest(
    token,
    '/api/creator/contacts/' + encodeURIComponent(id) + ownerQuery(owner),
    'DELETE'
  );
}

function fetchContactSettings(token, owner) {
  return platformRequest(
    token,
    '/api/creator/contact-settings' + ownerQuery(owner)
  );
}

function saveContactSettings(token, owner, body) {
  return platformRequest(
    token,
    '/api/creator/contact-settings' + ownerQuery(owner),
    'PUT',
    body
  );
}

function fetchContactNotifications(token) {
  return platformRequest(token, '/api/creator/contact-notifications');
}

function saveContactNotifications(token, body) {
  return platformRequest(
    token,
    '/api/creator/contact-notifications',
    'PUT',
    body
  );
}

function requestContactNotifyVerify(token, email) {
  return platformRequest(
    token,
    '/api/creator/contact-notifications/verify-request',
    'POST',
    { email: email }
  );
}

function verifyContactNotify(token, code) {
  return platformRequest(
    token,
    '/api/creator/contact-notifications/verify',
    'POST',
    { code: code }
  );
}

function deleteContactNotifications(token) {
  return platformRequest(
    token,
    '/api/creator/contact-notifications',
    'DELETE'
  );
}

function listSubjects(token) {
  return platformRequest(token, '/api/creator/virtual-subjects').then(function (
    body
  ) {
    return {
      limit: (body && body.limit) || 0,
      subjects: (body && Array.isArray(body.subjects) && body.subjects) || [],
    };
  });
}

function createSubject(token, input) {
  return platformRequest(token, '/api/creator/virtual-subjects', 'POST', input);
}

function setSubjectActive(token, id, active) {
  var path =
    '/api/creator/virtual-subjects/' +
    encodeURIComponent(id) +
    (active ? '/restore' : '');
  return platformRequest(token, path, active ? 'POST' : 'DELETE', {});
}

function subjectOwner(id) {
  return 'virtual:' + id;
}

function fetchWorks(token, kind, owner) {
  var q = [];
  if (kind) q.push('kind=' + encodeURIComponent(kind));
  if (owner) q.push('owner=' + encodeURIComponent(owner));
  return platformRequest(
    token,
    '/api/creator/works' + (q.length ? '?' + q.join('&') : '')
  );
}

function addWork(token, input) {
  return platformRequest(token, '/api/creator/works', 'POST', input);
}

function updateWork(token, workId, input) {
  return platformRequest(
    token,
    '/api/creator/works/' + encodeURIComponent(workId),
    'PATCH',
    input
  );
}

function deleteWork(token, workId, owner) {
  return platformRequest(
    token,
    '/api/creator/works/' +
      encodeURIComponent(workId) +
      ownerQuery(owner),
    'DELETE'
  );
}

function fetchManagedPosts(token, owner) {
  return platformRequest(
    token,
    '/api/creator/posts?owner=' + encodeURIComponent(owner || '')
  );
}

function closePost(token, id, owner) {
  return platformRequest(
    token,
    '/api/creator/posts/' +
      encodeURIComponent(id) +
      '/close' +
      ownerQuery(owner),
    'POST',
    {}
  );
}

function createPost(token, input) {
  return platformRequest(token, '/api/creator/posts', 'POST', input);
}

function deletePost(token, id, owner) {
  return platformRequest(
    token,
    '/api/creator/posts/' + encodeURIComponent(id) + ownerQuery(owner),
    'DELETE'
  );
}

function fetchSubjectVerification(token, id) {
  return platformRequest(
    token,
    '/api/creator/virtual-subjects/' +
      encodeURIComponent(id) +
      '/verification'
  );
}

function applySubjectVerification(token, id, input) {
  return platformRequest(
    token,
    '/api/creator/virtual-subjects/' +
      encodeURIComponent(id) +
      '/verification',
    'POST',
    input
  );
}

function fetchMe(token) {
  return platformRequest(token, '/api/creator/me');
}

function fetchSaved(token, before) {
  var path = '/api/creator/saved';
  if (before) path += '?before=' + encodeURIComponent(before);
  return platformRequest(token, path).then(function (body) {
    return {
      items: (body && Array.isArray(body.items) && body.items) || [],
      next_before: (body && body.next_before) || null,
    };
  });
}

function reactToPost(token, id, kind, on) {
  return platformRequest(
    token,
    '/api/creator/posts/' + encodeURIComponent(id) + '/reactions',
    'POST',
    { kind: kind, on: !!on }
  );
}

function fetchAgentTokens(token, owner) {
  return platformRequest(
    token,
    '/api/creator/agent-tokens' + ownerQuery(owner)
  ).then(function (body) {
    return (body && Array.isArray(body.tokens) && body.tokens) || [];
  });
}

function createAgentToken(token, owner, input) {
  return platformRequest(
    token,
    '/api/creator/agent-tokens' + ownerQuery(owner),
    'POST',
    input || {}
  );
}

function revokeAgentToken(token, id) {
  return platformRequest(
    token,
    '/api/creator/agent-tokens/' + encodeURIComponent(id),
    'DELETE'
  );
}

function fetchPersona(token, owner) {
  return platformRequest(
    token,
    '/api/creator/persona' + ownerQuery(owner)
  ).then(function (body) {
    return {
      persona: (body && body.persona) || null,
      sources: (body && Array.isArray(body.sources) && body.sources) || [],
    };
  });
}

function savePersona(token, owner, persona) {
  return platformRequest(
    token,
    '/api/creator/persona' + ownerQuery(owner),
    'PUT',
    persona
  );
}

function fetchAgents(token, owner) {
  return platformRequest(
    token,
    '/api/creator/agents' + ownerQuery(owner)
  ).then(function (body) {
    return {
      cards: (body && Array.isArray(body.cards) && body.cards) || [],
      sources: (body && Array.isArray(body.sources) && body.sources) || [],
    };
  });
}

function createAgent(token, owner, input) {
  return platformRequest(
    token,
    '/api/creator/agents' + ownerQuery(owner),
    'POST',
    input || {}
  );
}

function updateAgent(token, code, owner, body) {
  return platformRequest(
    token,
    '/api/creator/agents/' + encodeURIComponent(code) + ownerQuery(owner),
    'PUT',
    body
  );
}

function publishAgent(token, code, owner, revision) {
  return platformRequest(
    token,
    '/api/creator/agents/' +
      encodeURIComponent(code) +
      '/publish' +
      ownerQuery(owner),
    'POST',
    { revision: revision }
  );
}

function disableAgent(token, code, owner) {
  return platformRequest(
    token,
    '/api/creator/agents/' + encodeURIComponent(code) + ownerQuery(owner),
    'DELETE'
  );
}

function agentCardUrl(code) {
  return config.PLATFORM_API + '/a/' + encodeURIComponent(code);
}

function fetchInvitation(token, owner) {
  return platformRequest(
    token,
    '/api/creator/invitations' + ownerQuery(owner)
  ).then(function (body) {
    return (body && body.invitation) || null;
  });
}

function createInvitation(token, owner) {
  return platformRequest(
    token,
    '/api/creator/invitations' + ownerQuery(owner),
    'POST',
    {}
  );
}

function deleteInvitation(token, owner) {
  return platformRequest(
    token,
    '/api/creator/invitations' + ownerQuery(owner),
    'DELETE'
  );
}

function fetchEnterpriseInvitations(token) {
  return platformRequest(token, '/api/creator/enterprise-invitations').then(
    function (body) {
      return (
        (body && Array.isArray(body.invitations) && body.invitations) || []
      );
    }
  );
}

function acceptEnterpriseInvitation(token, id) {
  return platformRequest(
    token,
    '/api/creator/enterprise-invitations/' +
      encodeURIComponent(id) +
      '/accept',
    'POST',
    {}
  );
}

function fetchEnterpriseLink(token, linkToken) {
  return platformRequest(
    token,
    '/api/creator/enterprise-invitations/link/' +
      encodeURIComponent(linkToken)
  );
}

function joinEnterpriseLink(token, linkToken) {
  return platformRequest(
    token,
    '/api/creator/enterprise-invitations/link/' +
      encodeURIComponent(linkToken) +
      '/join',
    'POST',
    {}
  );
}

function updateEnterpriseDisplay(token, id, body) {
  return platformRequest(
    token,
    '/api/creator/enterprise-invitations/' +
      encodeURIComponent(id) +
      '/display',
    'PUT',
    body
  );
}

function createShortLink(token, target, owner) {
  return platformRequest(token, '/api/creator/short-links', 'POST', {
    owner: owner || '',
    target_kind: target && target.kind,
    target_ref: (target && target.ref) || '',
  });
}

function fetchMembership(token) {
  return platformRequest(token, '/api/creator/billing');
}

function startTrial(token) {
  return platformRequest(token, '/api/creator/trial', 'POST', {});
}

function createOrder(token, input) {
  return platformRequest(token, '/api/creator/orders', 'POST', input);
}

function recheckoutOrder(token, orderId, channel) {
  return platformRequest(
    token,
    '/api/creator/orders/' + encodeURIComponent(orderId) + '/checkout',
    'POST',
    { channel: channel }
  );
}

function cancelOrder(token, orderId) {
  return platformRequest(
    token,
    '/api/creator/orders/' + encodeURIComponent(orderId) + '/cancel',
    'POST',
    {}
  );
}

function fetchOrderQr(token, orderId) {
  return new Promise(function (resolve, reject) {
    wx.request({
      url:
        config.PLATFORM_API +
        '/api/creator/orders/' +
        encodeURIComponent(orderId) +
        '/qr.svg',
      method: 'GET',
      header: {
        Authorization: 'Bearer ' + token,
        Accept: 'image/svg+xml',
      },
      responseType: 'text',
      success: function (res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data) {
          resolve(String(res.data));
          return;
        }
        reject(new Error('无法加载付款码（' + res.statusCode + '）'));
      },
      fail: function () {
        var err = new Error('暂时无法加载付款码');
        err.code = 'NETWORK';
        reject(err);
      },
    });
  });
}

function closeCreatorSession(token) {
  if (!token) return Promise.resolve({ ok: true });
  return platformRequest(token, '/api/creator/logout', 'POST', {}).catch(
    function () {
      return { ok: false };
    }
  );
}

module.exports = {
  PLATFORM_API: config.PLATFORM_API,
  EMPTY_DRAFT: EMPTY_DRAFT,
  mergeDraft: mergeDraft,
  issueAppCode: issueAppCode,
  openCreatorSession: openCreatorSession,
  loadCreatorSession: loadCreatorSession,
  clearCreatorSession: clearCreatorSession,
  platformRequest: platformRequest,
  fetchPage: fetchPage,
  registerSlug: registerSlug,
  savePage: savePage,
  publishPage: publishPage,
  fetchPreviewHtml: fetchPreviewHtml,
  uploadImage: uploadImage,
  fetchOrgs: fetchOrgs,
  fetchBilling: fetchBilling,
  fetchMembership: fetchMembership,
  startTrial: startTrial,
  createOrder: createOrder,
  recheckoutOrder: recheckoutOrder,
  cancelOrder: cancelOrder,
  fetchOrderQr: fetchOrderQr,
  closeCreatorSession: closeCreatorSession,
  fetchVerification: fetchVerification,
  fetchStats: fetchStats,
  orgOwner: orgOwner,
  fetchOrgPage: fetchOrgPage,
  saveOrgPage: saveOrgPage,
  publishOrgPage: publishOrgPage,
  fetchOrgMembers: fetchOrgMembers,
  searchOrgCandidates: searchOrgCandidates,
  inviteOrgMember: inviteOrgMember,
  releaseOrgSeat: releaseOrgSeat,
  createOrgInviteCode: createOrgInviteCode,
  deleteOrgInviteCode: deleteOrgInviteCode,
  removeOrgMember: removeOrgMember,
  seatLinkUrl: seatLinkUrl,
  createOrgSeatLink: createOrgSeatLink,
  revokeOrgSeatLink: revokeOrgSeatLink,
  nodeOrganizationsReadiness: nodeOrganizationsReadiness,
  linkNodeOrganization: linkNodeOrganization,
  fetchPublicPage: fetchPublicPage,
  pageUrlFor: pageUrlFor,
  fetchInterests: fetchInterests,
  saveInterests: saveInterests,
  fetchSlugPolicy: fetchSlugPolicy,
  fetchStorefront: fetchStorefront,
  saveStorefront: saveStorefront,
  fetchFeaturedDraft: fetchFeaturedDraft,
  saveFeaturedDraft: saveFeaturedDraft,
  fetchStorefrontPublication: fetchStorefrontPublication,
  publishStorefront: publishStorefront,
  unpublishStorefront: unpublishStorefront,
  fetchStorefrontLinks: fetchStorefrontLinks,
  saveStorefrontLink: saveStorefrontLink,
  deleteStorefrontLink: deleteStorefrontLink,
  fetchInstagramMedia: fetchInstagramMedia,
  fetchTikTokMedia: fetchTikTokMedia,
  fetchShortLinks: fetchShortLinks,
  fetchContacts: fetchContacts,
  patchContact: patchContact,
  deleteContact: deleteContact,
  fetchContactSettings: fetchContactSettings,
  saveContactSettings: saveContactSettings,
  fetchContactNotifications: fetchContactNotifications,
  saveContactNotifications: saveContactNotifications,
  requestContactNotifyVerify: requestContactNotifyVerify,
  verifyContactNotify: verifyContactNotify,
  deleteContactNotifications: deleteContactNotifications,
  listSubjects: listSubjects,
  createSubject: createSubject,
  setSubjectActive: setSubjectActive,
  subjectOwner: subjectOwner,
  fetchWorks: fetchWorks,
  addWork: addWork,
  updateWork: updateWork,
  deleteWork: deleteWork,
  fetchManagedPosts: fetchManagedPosts,
  createPost: createPost,
  closePost: closePost,
  deletePost: deletePost,
  fetchSubjectVerification: fetchSubjectVerification,
  applySubjectVerification: applySubjectVerification,
  fetchMe: fetchMe,
  fetchSaved: fetchSaved,
  reactToPost: reactToPost,
  fetchAgentTokens: fetchAgentTokens,
  createAgentToken: createAgentToken,
  revokeAgentToken: revokeAgentToken,
  fetchPersona: fetchPersona,
  savePersona: savePersona,
  fetchAgents: fetchAgents,
  createAgent: createAgent,
  updateAgent: updateAgent,
  publishAgent: publishAgent,
  disableAgent: disableAgent,
  agentCardUrl: agentCardUrl,
  fetchInvitation: fetchInvitation,
  createInvitation: createInvitation,
  deleteInvitation: deleteInvitation,
  fetchEnterpriseInvitations: fetchEnterpriseInvitations,
  acceptEnterpriseInvitation: acceptEnterpriseInvitation,
  fetchEnterpriseLink: fetchEnterpriseLink,
  joinEnterpriseLink: joinEnterpriseLink,
  updateEnterpriseDisplay: updateEnterpriseDisplay,
  createShortLink: createShortLink,
};
