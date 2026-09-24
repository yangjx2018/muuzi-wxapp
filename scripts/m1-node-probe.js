/**
 * 对照小程序链路探测 im.muuzi.co Field/Creator（凭据仅环境变量）
 */
const https = require('https');
const http = require('http');

const USER = process.env.MUUZI_WX_USER;
const PASS = process.env.MUUZI_WX_PASS;
const NODE = 'https://im.muuzi.co';
const PLATFORM = 'https://www.muuzi.co';

function request(url, method, data, headers) {
  return new Promise(function (resolve, reject) {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const body = data === undefined ? null : JSON.stringify(data);
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: method || 'GET',
        headers: Object.assign(
          {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          headers || {},
          body
            ? { 'Content-Length': Buffer.byteLength(body) }
            : {}
        ),
        timeout: 20000,
      },
      function (res) {
        const chunks = [];
        res.on('data', function (c) {
          chunks.push(c);
        });
        res.on('end', function () {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed = raw;
          try {
            parsed = JSON.parse(raw);
          } catch (e) {
            /* keep raw */
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', function () {
      req.destroy(new Error('timeout'));
    });
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const login = await request(NODE + '/cosmac/login/account', 'POST', {
    username: USER,
    password: PASS,
  });
  console.log('login', login.status, login.body && login.body.user_id);
  if (login.status !== 200 || !login.body.access_token) {
    console.log('login body', login.body);
    process.exit(1);
  }
  const token = login.body.access_token;
  const userId = login.body.user_id;

  const appCode = await request(
    NODE + '/cosmac/muuzi/app-code',
    'POST',
    {},
    { Authorization: 'Bearer ' + token }
  );
  console.log('app-code', appCode.status, typeof (appCode.body && appCode.body.app_code));

  const cfg = await request(PLATFORM + '/api/creator/config', 'GET');
  console.log('creator/config', cfg.status, cfg.body && cfg.body.available);

  const session = await request(PLATFORM + '/api/creator/session', 'POST', {
    node_domain: 'im.muuzi.co',
    app_code: appCode.body.app_code,
    client: 'app',
  });
  console.log(
    'creator/session',
    session.status,
    session.body && session.body.creator && session.body.creator.matrix_user_id
  );
  const st = session.body && session.body.session_token;
  if (!st) {
    console.log('session body', session.body);
    process.exit(1);
  }

  const caps = await request(
    PLATFORM + '/api/creator/field/v1/capabilities',
    'GET',
    undefined,
    { Authorization: 'Bearer ' + st }
  );
  console.log('field capabilities', caps.status, JSON.stringify(caps.body));

  const enc = await request(
    PLATFORM + '/api/creator/field/v1/encounters?limit=5',
    'GET',
    undefined,
    { Authorization: 'Bearer ' + st }
  );
  console.log('encounters', enc.status, JSON.stringify(enc.body).slice(0, 300));

  console.log('matrix_user', userId);
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
