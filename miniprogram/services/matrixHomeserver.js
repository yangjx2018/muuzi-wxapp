/**
 * Resolve Matrix Client-Server base URL · align App connectNode well-known.
 * Falls back to nodeOrigin / whitelist homeserverUrl when well-known is missing.
 */
var http = require('./http');

function normalize(url) {
  return String(url || '').replace(/\/$/, '');
}

function isAllowedHomeserver(url, develop) {
  var value = normalize(url);
  if (!value) return false;
  if (value.indexOf('https://') === 0) return true;
  if (develop && value.indexOf('http://') === 0) return true;
  return false;
}

/**
 * @param {string} nodeOrigin
 * @param {{ fallback?: string, develop?: boolean, request?: function }} [opts]
 * @returns {Promise<string>}
 */
function resolveHomeserver(nodeOrigin, opts) {
  opts = opts || {};
  var origin = normalize(nodeOrigin);
  var fallback = normalize(opts.fallback || origin);
  var develop = !!opts.develop;
  var requestFn = opts.request || http.request;

  if (!origin) {
    return Promise.resolve(fallback);
  }

  return Promise.resolve(
    requestFn({
      url: origin + '/.well-known/matrix/client',
      method: 'GET',
      timeout: 10000,
    })
  )
    .then(function (body) {
      var base =
        body &&
        body['m.homeserver'] &&
        body['m.homeserver'].base_url;
      var url = normalize(base);
      if (!isAllowedHomeserver(url, develop)) {
        throw Object.assign(new Error('homeserver missing'), {
          code: 'BAD_HOMESERVER',
        });
      }
      return url;
    })
    .catch(function () {
      if (isAllowedHomeserver(fallback, develop)) return fallback;
      if (isAllowedHomeserver(origin, develop)) return origin;
      return fallback || origin;
    });
}

module.exports = {
  normalize: normalize,
  isAllowedHomeserver: isAllowedHomeserver,
  resolveHomeserver: resolveHomeserver,
};
