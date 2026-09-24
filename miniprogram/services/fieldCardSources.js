/** 对齐 MuuziGit fieldCardSources.ts */

var PERSONAL_CARD = {
  key: 'person',
  kind: 'person',
  id: '',
  label: '个人主页',
};

function allowedCompanyCard(org) {
  if (!org || typeof org !== 'object') return false;
  return (
    /^org_[a-z0-9]+$/.test(org.id) &&
    org.status === 'active' &&
    (org.role === 'owner' || org.role === 'admin')
  );
}

function allowedVirtualCard(subject) {
  if (!subject || typeof subject !== 'object') return false;
  return (
    /^vs_[a-z0-9]+$/.test(subject.id) &&
    subject.form === 'org' &&
    subject.status === 'active' &&
    !subject.restriction &&
    !subject.suspended_at &&
    !subject.quota_blocked
  );
}

function companyCardSources(orgs, subjects) {
  var list = [PERSONAL_CARD];
  (orgs || []).filter(allowedCompanyCard).forEach(function (org) {
    list.push({
      key: 'org:' + org.id,
      kind: 'org',
      id: org.id,
      label: (org.name || org.slug) + ' · 企业',
    });
  });
  (subjects || []).filter(allowedVirtualCard).forEach(function (subject) {
    list.push({
      key: 'virtual:' + subject.id,
      kind: 'virtual',
      id: subject.id,
      label: (subject.name || subject.slug) + ' · 虚拟企业',
    });
  });
  return list;
}

module.exports = {
  PERSONAL_CARD: PERSONAL_CARD,
  allowedCompanyCard: allowedCompanyCard,
  allowedVirtualCard: allowedVirtualCard,
  companyCardSources: companyCardSources,
};
