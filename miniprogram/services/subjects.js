const creator = require('./creator');

const BASE = '/api/creator/virtual-subjects';

function listSubjects(token) {
  return creator.platformRequest(token, BASE).then(function (body) {
    return {
      limit: body && body.limit,
      subjects: (body && Array.isArray(body.subjects) ? body.subjects : []) || [],
    };
  });
}

function fetchVirtualPage(token, id) {
  return creator.platformRequest(
    token,
    BASE + '/' + encodeURIComponent(id) + '/page'
  );
}

module.exports = {
  listSubjects: listSubjects,
  fetchVirtualPage: fetchVirtualPage,
};
