/**
 * 将 ADTS AAC 复用为带 ftyp 的 M4A（ISO BMFF），以通过 Platform
 * `/speech/recognize` 的容器签名校验（bytes[4:8]==='ftyp'）。
 * 若输入已是 ftyp 容器则原样返回。
 */

var SAMPLE_RATES = [
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350,
];

function concat(chunks) {
  var total = 0;
  for (var i = 0; i < chunks.length; i++) total += chunks[i].length;
  var out = new Uint8Array(total);
  var o = 0;
  for (i = 0; i < chunks.length; i++) {
    out.set(chunks[i], o);
    o += chunks[i].length;
  }
  return out;
}

function u32(n) {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

function u16(n) {
  return new Uint8Array([(n >>> 8) & 255, n & 255]);
}

function box(type, content) {
  var typeBytes = new Uint8Array([
    type.charCodeAt(0),
    type.charCodeAt(1),
    type.charCodeAt(2),
    type.charCodeAt(3),
  ]);
  var size = 8 + content.length;
  return concat([u32(size), typeBytes, content]);
}

function fullBox(type, version, flags, content) {
  return box(
    type,
    concat([
      new Uint8Array([version, (flags >>> 16) & 255, (flags >>> 8) & 255, flags & 255]),
      content,
    ])
  );
}

function parseAdts(buffer) {
  var frames = [];
  var offset = 0;
  var sampleRateIndex = 4;
  var channelConfig = 1;
  // ADTS profile 0/1/2 → MPEG-4 Audio Object Type 1/2/3；默认 AAC-LC(2)
  var audioObjectType = 2;
  while (offset + 7 < buffer.length) {
    if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xf0) !== 0xf0) {
      offset++;
      continue;
    }
    var frameLength =
      ((buffer[offset + 3] & 0x03) << 11) |
      (buffer[offset + 4] << 3) |
      ((buffer[offset + 5] & 0xe0) >> 5);
    if (frameLength < 7 || offset + frameLength > buffer.length) break;
    var headerLen = buffer[offset + 1] & 0x01 ? 7 : 9;
    audioObjectType = ((buffer[offset + 2] & 0xc0) >> 6) + 1;
    sampleRateIndex = (buffer[offset + 2] & 0x3c) >> 2;
    channelConfig =
      ((buffer[offset + 2] & 0x01) << 2) | ((buffer[offset + 3] & 0xc0) >> 6);
    frames.push(buffer.subarray(offset + headerLen, offset + frameLength));
    offset += frameLength;
  }
  return {
    frames: frames,
    audioObjectType: audioObjectType || 2,
    sampleRateIndex: sampleRateIndex,
    channelConfig: channelConfig || 1,
    sampleRate: SAMPLE_RATES[sampleRateIndex] || 44100,
  };
}

function audioSpecificConfig(audioObjectType, sampleRateIndex, channelConfig) {
  var aot = audioObjectType >= 1 && audioObjectType <= 4 ? audioObjectType : 2;
  var bits = (aot << 11) | (sampleRateIndex << 7) | (channelConfig << 3);
  return new Uint8Array([(bits >> 8) & 255, bits & 255]);
}

/**
 * ISO 14496-1 描述符：短形式 size（length < 128）。
 * 旧实现混用「短形式长度声明 + 长形式内容」，DecoderSpecificInfo 溢出父描述符，
 * 安卓微信 ADTS remux 出的 M4A 仍带合法 ftyp，但解码配置损坏，识别链路会失败。
 */
function desc(tag, content) {
  if (content.length > 127) {
    throw new Error('录音格式无法识别，请重新按住说话。');
  }
  return concat([new Uint8Array([tag, content.length]), content]);
}

function esds(asc) {
  var decoderSpecific = desc(0x05, asc);
  // objectTypeIndication + streamType + bufferSizeDB(3) + max/avg bitrate(8) = 13
  var decoderConfig = desc(
    0x04,
    concat([
      new Uint8Array([
        0x40, 0x15, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00,
      ]),
      decoderSpecific,
    ])
  );
  var slConfig = desc(0x06, new Uint8Array([0x02]));
  var es = desc(
    0x03,
    concat([u16(1), new Uint8Array([0x00]), decoderConfig, slConfig])
  );
  return fullBox('esds', 0, 0, es);
}

/**
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {Uint8Array} m4a bytes
 */
function adtsToM4a(input) {
  var bytes =
    input instanceof Uint8Array
      ? input
      : new Uint8Array(input);
  if (bytes.length >= 8) {
    var tag = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (tag === 'ftyp') return bytes;
  }
  var parsed = parseAdts(bytes);
  if (!parsed.frames.length) {
    throw new Error('录音格式无法识别，请重新按住说话。');
  }
  var samples = concat(parsed.frames);
  var frameCount = parsed.frames.length;
  var timescale = parsed.sampleRate;
  var duration = frameCount * 1024;
  var asc = audioSpecificConfig(
    parsed.audioObjectType,
    parsed.sampleRateIndex,
    parsed.channelConfig
  );

  var stsd = fullBox(
    'stsd',
    0,
    0,
    concat([
      u32(1),
      box(
        'mp4a',
        concat([
          new Uint8Array(6),
          u16(1),
          u16(0),
          u16(0),
          new Uint8Array(4),
          u16(parsed.channelConfig),
          u16(16),
          u16(0),
          u16(0),
          u16(parsed.sampleRate),
          u16(0),
          esds(asc),
        ])
      ),
    ])
  );

  var stts = fullBox(
    'stts',
    0,
    0,
    concat([u32(1), u32(frameCount), u32(1024)])
  );
  var stsc = fullBox('stsc', 0, 0, concat([u32(1), u32(1), u32(frameCount), u32(1)]));
  var stsz = fullBox(
    'stsz',
    0,
    0,
    concat([
      u32(0),
      u32(frameCount),
      concat(
        parsed.frames.map(function (f) {
          return u32(f.length);
        })
      ),
    ])
  );

  // stco offset filled after we know mdat position — build twice
  var mdat = box('mdat', samples);

  var stblContent = function (chunkOffset) {
    var stco = fullBox('stco', 0, 0, concat([u32(1), u32(chunkOffset)]));
    return box('stbl', concat([stsd, stts, stsc, stsz, stco]));
  };

  var minfContent = function (chunkOffset) {
    var smhd = fullBox('smhd', 0, 0, concat([u16(0), u16(0)]));
    var dref = fullBox(
      'dref',
      0,
      0,
      concat([u32(1), fullBox('url ', 0, 1, new Uint8Array(0))])
    );
    var dinf = box('dinf', dref);
    return box('minf', concat([smhd, dinf, stblContent(chunkOffset)]));
  };

  var mdiaContent = function (chunkOffset) {
    var mdhd = fullBox(
      'mdhd',
      0,
      0,
      concat([
        u32(0),
        u32(0),
        u32(timescale),
        u32(duration),
        u16(0x55c4),
        u16(0),
      ])
    );
    var hdlr = fullBox(
      'hdlr',
      0,
      0,
      concat([
        new Uint8Array(4),
        new Uint8Array([0x73, 0x6f, 0x75, 0x6e]), // soun
        new Uint8Array(12),
        new Uint8Array([0x53, 0x6f, 0x75, 0x6e, 0x64, 0x48, 0x61, 0x6e, 0x64, 0x6c, 0x65, 0x72, 0x00]),
      ])
    );
    return box('mdia', concat([mdhd, hdlr, minfContent(chunkOffset)]));
  };

  var trakContent = function (chunkOffset) {
    var tkhd = fullBox(
      'tkhd',
      0,
      3,
      concat([
        u32(0),
        u32(0),
        u32(1),
        u32(0),
        u32(duration),
        new Uint8Array(8),
        u16(0),
        u16(0),
        u16(0x0100),
        u16(0),
        new Uint8Array([
          0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
          0x00, 0x00, 0x40, 0x00, 0x00, 0x00,
        ]),
        u32(0),
        u32(0),
      ])
    );
    return box('trak', concat([tkhd, mdiaContent(chunkOffset)]));
  };

  var mvhd = fullBox(
    'mvhd',
    0,
    0,
    concat([
      u32(0),
      u32(0),
      u32(timescale),
      u32(duration),
      u32(0x00010000),
      u16(0x0100),
      u16(0),
      new Uint8Array(8),
      new Uint8Array([
        0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x40, 0x00, 0x00, 0x00,
      ]),
      new Uint8Array(24),
      u32(2),
    ])
  );

  var ftyp = box(
    'ftyp',
    concat([
      new Uint8Array([0x4d, 0x34, 0x41, 0x20]), // M4A
      u32(0),
      new Uint8Array([0x4d, 0x34, 0x41, 0x20, 0x6d, 0x70, 0x34, 0x32]), // M4A mp42
    ])
  );

  // Estimate moov size: build with placeholder offset, then rebuild with real offset
  var guessOffset = ftyp.length + 8 + 2000;
  var moov = box('moov', concat([mvhd, trakContent(guessOffset)]));
  var mdatOffset = ftyp.length + moov.length + 8;
  moov = box('moov', concat([mvhd, trakContent(mdatOffset)]));
  mdatOffset = ftyp.length + moov.length + 8;
  moov = box('moov', concat([mvhd, trakContent(mdatOffset)]));

  return concat([ftyp, moov, mdat]);
}

function uint8ToBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  if (typeof btoa === 'function') {
    var chunk = 0x8000;
    var str = '';
    for (var i = 0; i < bytes.length; i += chunk) {
      str += String.fromCharCode.apply(
        null,
        bytes.subarray(i, Math.min(i + chunk, bytes.length))
      );
    }
    return btoa(str);
  }
  throw new Error('无法编码音频');
}

module.exports = {
  adtsToM4a: adtsToM4a,
  uint8ToBase64: uint8ToBase64,
  parseAdts: parseAdts,
};
