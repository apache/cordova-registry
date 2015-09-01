var updates = exports

updates.package = function (doc, req) {
  return error('The plugin reigstry has switcehd to read-only!, please publish your plugins to npm. Learn more at http://plugins.cordova.io/npm/authors.html.');
  function error (reason) {
    return [{_id: "error: forbidden", forbidden:reason}, JSON.stringify({forbidden:reason})]
  }
}
