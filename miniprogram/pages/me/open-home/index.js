/**
 * 打开已发布主页 · 对齐 App ProfileShareSheet「打开主页」(target=_blank)
 * 小程序：仅当 WEBVIEW_BUSINESS_HOSTS 含该主机时才挂 web-view；
 * 否则（体验版业务域名留空）直接复制回退，避免微信「无法打开该页面」系统页。
 */
const creator = require('../../../services/creator');
const pageAddress = require('../../../services/pageAddress');
const profileShare = require('../../../services/profileShare');

Page({
  data: {
    loading: true,
    homeUrl: '',
    fallbackUrl: '',
    fallbackDisplay: '',
    error: '',
    title: '成品主页',
    hint: '',
  },

  onLoad(query) {
    var self = this;
    var rawUrl = query && query.url ? decodeURIComponent(String(query.url)) : '';
    var slug = query && query.slug ? String(query.slug).trim() : '';

    function applyUrl(href) {
      try {
        var plan = profileShare.homeOpenPlan(href);
        var display = pageAddress.displayHost(plan.fallbackUrl);
        if (plan.mode === 'embed') {
          self.setData({
            loading: false,
            homeUrl: plan.homeUrl,
            fallbackUrl: plan.fallbackUrl,
            fallbackDisplay: display,
            error: '',
            title: '成品主页',
            hint: '',
          });
          return;
        }
        self.setData({
          loading: false,
          homeUrl: '',
          fallbackUrl: plan.fallbackUrl,
          fallbackDisplay: display,
          error: '',
          title: '在浏览器打开成品',
          hint:
            '小程序内暂未开通网页内嵌。复制链接后在手机浏览器打开，效果与 App「看成品」一致。',
        });
      } catch (e) {
        self.setData({
          loading: false,
          homeUrl: '',
          fallbackUrl: href || '',
          fallbackDisplay: pageAddress.displayHost(href || ''),
          error: '主页地址无效',
          title: '无法打开主页',
          hint: '请返回编辑页确认已发布，或稍后重试。',
        });
      }
    }

    if (rawUrl) {
      applyUrl(rawUrl);
      return;
    }

    if (!slug) {
      this.setData({
        loading: false,
        error: '缺少主页地址',
        title: '无法打开主页',
        hint: '请从编辑主页重新打开「看成品」。',
      });
      return;
    }

    var candidate = creator.pageUrlFor(slug);
    pageAddress
      .resolveShareAddress(candidate)
      .then(function (resolved) {
        applyUrl(resolved);
      })
      .catch(function () {
        try {
          applyUrl(candidate);
        } catch (e) {
          self.setData({
            loading: false,
            fallbackUrl: candidate,
            fallbackDisplay: pageAddress.displayHost(candidate),
            error: '暂时无法打开主页',
            title: '无法打开主页',
            hint: '请稍后重试，或复制下方地址到浏览器打开。',
          });
        }
      });
  },

  onWebViewError() {
    var url = this.data.homeUrl || this.data.fallbackUrl;
    if (!url) {
      this.setData({
        homeUrl: '',
        loading: false,
        error: '暂时无法打开主页',
        title: '无法打开主页',
        hint: '请返回后重试。',
      });
      return;
    }
    this.setData({
      loading: false,
      homeUrl: '',
      fallbackUrl: url,
      fallbackDisplay: pageAddress.displayHost(url),
      error: '',
      title: '在浏览器打开成品',
      hint:
        '网页未能在小程序内打开。复制链接后在手机浏览器查看成品主页。',
    });
  },

  copyFallback() {
    var url = this.data.fallbackUrl || this.data.homeUrl;
    if (!url) return;
    profileShare
      .copyShareUrlFallback(url, '链接已复制，请在浏览器打开')
      .then(function (note) {
        wx.showToast({ title: note, icon: 'none' });
      })
      .catch(function () {
        wx.showToast({ title: '复制失败，请重试', icon: 'none' });
      });
  },
});
