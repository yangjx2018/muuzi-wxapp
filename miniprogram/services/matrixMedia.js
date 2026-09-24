/**
 * Matrix 媒体上传/下载 · 对齐 App sendAttachment / fetchMedia（明文）
 * 聊天附件走节点 homeserver，不得复用 Creator Platform uploads。
 */

var MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

function basename(filePath, fallback) {
  var raw = String(filePath || '');
  var slash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
  var name = slash >= 0 ? raw.slice(slash + 1) : raw;
  name = name.split('?')[0];
  if (!name || name === 'tmp' || name.length > 120) {
    return fallback || 'file';
  }
  return name;
}

/** 对齐 App chatAttachmentMime：优先显式 MIME，缺省时从扩展名推断 */
function attachmentMime(type, name) {
  var mime = String(type || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (mime && mime !== 'application/octet-stream') return mime;
  var extension = String(name || '')
    .split('.')
    .pop()
    .toLowerCase();
  var videos = {
    mp4: 'video/mp4',
    m4v: 'video/x-m4v',
    mov: 'video/quicktime',
    webm: 'video/webm',
  };
  if (videos[extension]) return videos[extension];
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'pdf') return 'application/pdf';
  return mime || 'application/octet-stream';
}

function guessMime(filePath, hint) {
  if (typeof hint === 'string' && hint) {
    return attachmentMime(hint, filePath);
  }
  return attachmentMime('', filePath);
}

function msgtypeForMime(mimetype) {
  var mime = String(mimetype || '').toLowerCase();
  if (mime.indexOf('image/') === 0) return 'm.image';
  if (mime.indexOf('video/') === 0) return 'm.video';
  if (mime.indexOf('audio/') === 0) return 'm.audio';
  return 'm.file';
}

function oversizeMessage(msgtype) {
  if (msgtype === 'm.image') return '图片超过 20MB，请压缩后再发';
  if (msgtype === 'm.video') return '视频超过 20MB，请压缩后再发';
  return '附件不能超过 20MB';
}

function parseMxc(mxc) {
  var value = String(mxc || '');
  if (!value.startsWith('mxc://')) return null;
  var rest = value.slice('mxc://'.length);
  var slash = rest.indexOf('/');
  if (slash <= 0) return null;
  var server = rest.slice(0, slash);
  var mediaId = rest.slice(slash + 1);
  if (!server || !mediaId) return null;
  return { server: server, mediaId: mediaId };
}

function downloadPath(homeserver, mxc) {
  var parts = parseMxc(mxc);
  if (!parts) return '';
  var base = String(homeserver || '').replace(/\/$/, '');
  return (
    base +
    '/_matrix/media/v3/download/' +
    encodeURIComponent(parts.server) +
    '/' +
    encodeURIComponent(parts.mediaId)
  );
}

function readFileAsArrayBuffer(filePath) {
  return new Promise(function (resolve, reject) {
    if (typeof wx === 'undefined' || !wx.getFileSystemManager) {
      reject(new Error('当前环境无法读取本地文件'));
      return;
    }
    wx.getFileSystemManager().readFile({
      filePath: filePath,
      success: function (res) {
        if (!res || !res.data) {
          reject(new Error('无法读取所选文件'));
          return;
        }
        resolve(res.data);
      },
      fail: function () {
        reject(new Error('无法读取所选文件'));
      },
    });
  });
}

function getFileSize(filePath) {
  return new Promise(function (resolve, reject) {
    if (typeof wx === 'undefined' || !wx.getFileSystemManager) {
      resolve(0);
      return;
    }
    wx.getFileSystemManager().getFileInfo({
      filePath: filePath,
      success: function (res) {
        resolve(Number(res && res.size) || 0);
      },
      fail: function () {
        reject(new Error('无法读取文件大小'));
      },
    });
  });
}

/**
 * POST /_matrix/media/v3/upload · raw body（非 multipart）
 * @returns {Promise<string>} content_uri mxc
 */
function uploadContent(opts) {
  opts = opts || {};
  var homeserver = String(opts.homeserver || '').replace(/\/$/, '');
  var accessToken = opts.accessToken || '';
  var buffer = opts.buffer;
  var filename = opts.filename || 'file';
  var mimetype = opts.mimetype || 'application/octet-stream';
  var requestFn = opts.request;
  var msgtype = msgtypeForMime(mimetype);
  if (!homeserver || !accessToken) {
    return Promise.reject(new Error('消息服务尚未就绪'));
  }
  if (!buffer) {
    return Promise.reject(new Error('文件内容为空'));
  }
  var size =
    typeof opts.size === 'number'
      ? opts.size
      : buffer.byteLength || buffer.length || 0;
  if (size > MAX_ATTACHMENT_BYTES) {
    return Promise.reject(new Error(oversizeMessage(msgtype)));
  }
  var url =
    homeserver +
    '/_matrix/media/v3/upload?filename=' +
    encodeURIComponent(filename);

  if (typeof requestFn === 'function') {
    return requestFn({
      url: url,
      method: 'POST',
      data: buffer,
      header: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': mimetype,
        Accept: 'application/json',
      },
      timeout: opts.timeout || 120000,
    }).then(function (body) {
      if (!body || typeof body.content_uri !== 'string' || !body.content_uri) {
        throw new Error('节点未返回媒体地址');
      }
      return body.content_uri;
    });
  }

  return new Promise(function (resolve, reject) {
    wx.request({
      url: url,
      method: 'POST',
      data: buffer,
      header: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': mimetype,
        Accept: 'application/json',
      },
      timeout: opts.timeout || 120000,
      success: function (res) {
        var body = res.data;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (
            body &&
            typeof body.content_uri === 'string' &&
            body.content_uri
          ) {
            resolve(body.content_uri);
            return;
          }
          reject(new Error('节点未返回媒体地址'));
          return;
        }
        var msg =
          (body && (body.error || body.message)) ||
          '上传失败（' + res.statusCode + '）';
        reject(new Error(msg));
      },
      fail: function () {
        reject(new Error('暂时无法连接，请检查网络后重试'));
      },
    });
  });
}

/**
 * 将 mxc 下载为本地临时路径，供 image / video / openDocument 使用
 */
function downloadToTemp(opts) {
  opts = opts || {};
  var homeserver = opts.homeserver;
  var accessToken = opts.accessToken || '';
  var mxc = opts.mxc;
  var url = downloadPath(homeserver, mxc);
  if (!url) {
    return Promise.reject(new Error('附件地址无效'));
  }
  if (typeof opts.downloadFile === 'function') {
    return opts.downloadFile({
      url: url,
      header: { Authorization: 'Bearer ' + accessToken },
    });
  }
  return new Promise(function (resolve, reject) {
    wx.downloadFile({
      url: url,
      header: { Authorization: 'Bearer ' + accessToken },
      success: function (res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          resolve(res.tempFilePath);
          return;
        }
        reject(new Error('附件载入失败'));
      },
      fail: function () {
        reject(new Error('附件载入失败'));
      },
    });
  });
}

function uploadFilePath(opts) {
  opts = opts || {};
  var filePath = opts.filePath;
  if (!filePath) {
    return Promise.reject(new Error('未选择文件'));
  }
  var filename = opts.filename || basename(filePath, 'file');
  var mimetype = guessMime(filePath, opts.mimetype);
  var msgtype = msgtypeForMime(mimetype);
  return getFileSize(filePath).then(function (size) {
    if (size > MAX_ATTACHMENT_BYTES) {
      return Promise.reject(new Error(oversizeMessage(msgtype)));
    }
    return readFileAsArrayBuffer(filePath).then(function (buffer) {
      return uploadContent({
        homeserver: opts.homeserver,
        accessToken: opts.accessToken,
        buffer: buffer,
        filename: filename,
        mimetype: mimetype,
        size: size || undefined,
        request: opts.request,
        timeout: opts.timeout,
      }).then(function (contentUri) {
        return {
          contentUri: contentUri,
          filename: filename,
          mimetype: mimetype,
          size: size,
          msgtype: msgtype,
        };
      });
    });
  });
}

module.exports = {
  MAX_ATTACHMENT_BYTES: MAX_ATTACHMENT_BYTES,
  guessMime: guessMime,
  attachmentMime: attachmentMime,
  msgtypeForMime: msgtypeForMime,
  oversizeMessage: oversizeMessage,
  basename: basename,
  parseMxc: parseMxc,
  downloadPath: downloadPath,
  uploadContent: uploadContent,
  uploadFilePath: uploadFilePath,
  downloadToTemp: downloadToTemp,
  readFileAsArrayBuffer: readFileAsArrayBuffer,
  getFileSize: getFileSize,
};
