/**
 * 消息附件「文件」选取引擎 · 对齐 App MessagesScreen file accept，
 * 并诚实面对微信能力：只能 wx.chooseMessageFile（从客户端会话选文件），
 * 没有系统文件管理器 API；web-view H5 方案本期不启用（业务域名空）。
 */

/** 对齐 App：application/pdf,.zip,.txt,.md + 常见办公/音频 */
var DOCUMENT_EXTENSIONS = [
  'pdf',
  'zip',
  'txt',
  'md',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'mp3',
  'm4a',
  'aac',
  'wav',
  'ogg',
];

/** ActionSheet 备用文案（页内面板为主路径） */
var FILE_SHEET_ITEMS = ['从微信聊天记录选择'];

var ATTACH_FILE_HINT =
  '照片与视频：相册或拍摄；文件：从微信聊天记录选文档（可先发到「文件传输助手」）。';

var FILE_PICK_TITLE = '选择文件';
var FILE_PICK_CONFIRM = '从聊天记录选择';

function chooseMessageFileOptions() {
  return {
    count: 1,
    type: 'file',
    extension: DOCUMENT_EXTENSIONS.slice(),
  };
}

/**
 * 把 chooseMessageFile 的 tempFile 归一成 sendPicked 入参。
 * @param {object} file
 * @param {{ attachmentMime: Function, basename: Function }} media
 */
function normalizeMessageFile(file, media) {
  if (!file || !file.path) return null;
  var name = file.name || media.basename(file.path, 'file');
  return {
    filePath: file.path,
    name: name,
    size: file.size,
    mimetype: media.attachmentMime('', name || file.path),
  };
}

module.exports = {
  DOCUMENT_EXTENSIONS: DOCUMENT_EXTENSIONS,
  FILE_SHEET_ITEMS: FILE_SHEET_ITEMS,
  ATTACH_FILE_HINT: ATTACH_FILE_HINT,
  FILE_PICK_TITLE: FILE_PICK_TITLE,
  FILE_PICK_CONFIRM: FILE_PICK_CONFIRM,
  chooseMessageFileOptions: chooseMessageFileOptions,
  normalizeMessageFile: normalizeMessageFile,
};
