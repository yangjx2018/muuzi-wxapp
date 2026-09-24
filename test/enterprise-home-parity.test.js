const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('enterprise homepage Wx parity with App', () => {
  it('creator.js exports org page save/publish and members APIs', () => {
    const js = read('miniprogram/services/creator.js');
    [
      'orgOwner',
      'saveOrgPage',
      'publishOrgPage',
      'fetchOrgMembers',
      'searchOrgCandidates',
      'inviteOrgMember',
      'releaseOrgSeat',
      'createOrgSeatLink',
      'revokeOrgSeatLink',
      'seatLinkUrl',
      'nodeOrganizationsReadiness',
      'linkNodeOrganization',
      'createOrgInviteCode',
      'removeOrgMember',
    ].forEach(function (name) {
      assert.match(js, new RegExp('function ' + name + '\\b'));
      assert.match(js, new RegExp(name + ':\\s*' + name));
    });
    assert.match(js, /orgPath\(orgId\) \+ '\/page\/publish'/);
    assert.match(js, /seat-links/);
  });

  it('enterpriseOrganization service hits node org entries and self-service', () => {
    const js = read('miniprogram/services/enterpriseOrganization.js');
    assert.match(js, /\/cosmac\/org\/entries/);
    assert.match(js, /\/cosmac\/tenants\/self-service/);
    assert.match(js, /createEnterpriseOrganization/);
    assert.match(js, /tenant_type:\s*'enterprise'/);
  });

  it('edit-home supports org query and org save/publish path', () => {
    const js = read('miniprogram/pages/me/edit-home/index.js');
    assert.match(js, /query\.org/);
    assert.match(js, /isOrg/);
    assert.match(js, /fetchOrgPage/);
    assert.match(js, /saveOrgPage/);
    assert.match(js, /publishOrgPage/);
    assert.match(js, /编辑企业主页/);
    assert.match(js, /orgOwner/);
    // personal slug phase skipped when org
    assert.match(js, /if\s*\(orgId\)/);
  });

  it('spaces exposes edit org home, members, and create enterprise', () => {
    const js = read('miniprogram/pages/me/spaces/index.js');
    const wxml = read('miniprogram/pages/me/spaces/index.wxml');
    assert.match(js, /goOrgEditHome/);
    assert.match(js, /goOrgMembers/);
    assert.match(js, /goEnterpriseCreate/);
    assert.match(wxml, /编辑企业主页/);
    assert.match(wxml, /成员与邀请/);
    assert.match(wxml, /开通企业版/);
    assert.match(wxml, /goOrgEditHome/);
    assert.match(wxml, /goEnterpriseCreate/);
  });

  it('org-members page mirrors OrgMembersScreen capabilities', () => {
    const js = read('miniprogram/pages/me/org-members/index.js');
    const wxml = read('miniprogram/pages/me/org-members/index.wxml');
    assert.match(js, /createOrgSeatLink/);
    assert.match(js, /searchOrgCandidates/);
    assert.match(js, /inviteOrgMember/);
    assert.match(js, /releaseOrgSeat/);
    assert.match(js, /createOrgInviteCode/);
    assert.match(wxml, /员工邀请链接/);
    assert.match(wxml, /按账号邀请/);
    assert.match(wxml, /生成邀请链接/);
  });

  it('enterprise-create page mirrors EnterpriseCreateScreen from=app', () => {
    const js = read('miniprogram/pages/me/enterprise-create/index.js');
    const wxml = read('miniprogram/pages/me/enterprise-create/index.wxml');
    assert.match(js, /createEnterpriseOrganization/);
    assert.match(js, /linkNodeOrganization/);
    assert.match(js, /nodeOrganizationsReadiness/);
    assert.match(js, /edit-home\/index\?org=/);
    assert.match(js, /org-members\/index\?org=/);
    assert.match(wxml, /创建企业账号/);
    assert.match(wxml, /在当前节点建立企业组织/);
    assert.match(wxml, /核验组织并创建企业主页/);
  });

  it('enterprise-join page mirrors EnterpriseJoinScreen', () => {
    const js = read('miniprogram/pages/me/enterprise-join/index.js');
    const wxml = read('miniprogram/pages/me/enterprise-join/index.wxml');
    const creator = read('miniprogram/services/creator.js');
    assert.match(creator, /function fetchEnterpriseLink\b/);
    assert.match(creator, /function joinEnterpriseLink\b/);
    assert.match(js, /fetchEnterpriseLink/);
    assert.match(js, /joinEnterpriseLink/);
    assert.match(js, /acceptEnterpriseInvitation/);
    assert.match(wxml, /确认加入企业/);
    assert.match(wxml, /企业与邀请/);
  });

  it('app.json registers org-members and enterprise-create', () => {
    const appJson = JSON.parse(read('miniprogram/app.json'));
    assert.ok(appJson.pages.includes('pages/me/org-members/index'));
    assert.ok(appJson.pages.includes('pages/me/enterprise-create/index'));
    assert.ok(appJson.pages.includes('pages/me/enterprise-join/index'));
  });

  it('org-members only lets owner remove admins in legacy mode', () => {
    const js = read('miniprogram/pages/me/org-members/index.js');
    assert.match(js, /mapMembers\(list, nodeManaged, viewerRole\)/);
    assert.match(
      js,
      /m\.role !== 'admin' \|\| viewerRole === 'owner'/
    );
    assert.match(js, /mapMembers\(data\.members, nodeManaged, this\._orgRole\)/);
  });

  it('edit-home banner uses goBack for org save-before-leave', () => {
    const wxml = read('miniprogram/pages/me/edit-home/index.wxml');
    const js = read('miniprogram/pages/me/edit-home/index.js');
    assert.match(wxml, /auto-back="\{\{false\}\}"/);
    assert.match(wxml, /bind:back="goBack"/);
    assert.match(wxml, /编辑企业主页/);
    assert.match(wxml, /bannerFallbackUrl/);
    assert.match(js, /spaces\/index\?org=/);
    assert.match(js, /me_space_org_id/);
  });

  it('spaces prefers query.org over stored selection', () => {
    const js = read('miniprogram/pages/me/spaces/index.js');
    assert.match(js, /onLoad\(query\)/);
    assert.match(js, /_pendingOrgId/);
    assert.match(js, /preferred = self\._pendingOrgId \|\| store\.get\(SPACE_KEY\)/);
  });

  it('org-members returns to spaces with org selected', () => {
    const js = read('miniprogram/pages/me/org-members/index.js');
    const wxml = read('miniprogram/pages/me/org-members/index.wxml');
    assert.match(js, /spacesUrl/);
    assert.match(js, /spaces\/index\?org=/);
    assert.match(wxml, /bind:back="goBack"/);
    assert.match(wxml, /fallback-url="\{\{spacesUrl\}\}"/);
  });

  it('connect card org edit goes to edit-home?org=', () => {
    const js = read('miniprogram/pages/connect/card/index.js');
    assert.match(js, /edit-home\/index\?org=/);
    assert.doesNotMatch(js, /kind === 'org'[\s\S]*spaces\/index/);
  });
});
