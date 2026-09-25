/**
 * 密码框键盘兼容（微信小程序）— 历史工具，页面已停止使用。
 *
 * 华为 / 部分安卓：原生 password / type=safe-password 会拉起系统「安全键盘」。
 *
 * 现行约定：
 * 1. 禁止 password 属性、禁止 type="safe-password"
 * 2. 仅用 type="text" + CSS -webkit-text-security（is-masked）
 * 3. 输入回调一次 setData 合并 value + ready（禁止再调 refreshReady）
 * 4. 禁止 focus="{{passwordFocus}}" / pulseFocus：focus=false 在部分机型会锁死输入框
 *
 * 本文件保留仅为文档与防止误引用；auth 页不得再 require。
 */

function pulseFocus() {
  // no-op：禁止用 focus 绑定抢焦
}

function clearFocus() {
  // no-op
}

module.exports = {
  pulseFocus: pulseFocus,
  clearFocus: clearFocus,
};
