/**
 * 已审核 Field 节点登记（对齐 MuuziGit fieldNodes.json）。
 * 访客加入只解析登记表内的 origin，不信任邀请 URL 里的任意主机。
 */
module.exports = [
  {
    instanceId: '7',
    name: 'MuuZi',
    origin: 'https://im.muuzi.co',
    entryOrigin: 'https://www.muuzi.co',
    apiPath: '/extensions/muuzi-field',
    protocol: 'muuzi-field-connect/1-draft',
    artifactSha256:
      '6bf33954c5046402532aa29c2abf3d592a43bbce5efb6fbb1aab62bf989b1145',
  },
];
