// sync to $host/_users/_design/_auth

var ddoc = {_id:"_design/_auth", language:"javascript"}

module.exports = ddoc

ddoc.lists = {
  index: function (head,req) {
    var row
      , out = {}
      , id, data
    while (row = getRow()) {
      id = row.id.replace(/^org\.couchdb\.user:/, '')
      data = row.value
      delete data._id
      delete data._rev
      delete data.salt
      delete data.password_sha
      delete data.type
      delete data.roles
      delete data._deleted_conflicts
      out[id] = data
    }
    send(toJSON(out))
  },
  email:function (head, req) {
    var row
      , data
      , id
      , email = req.query.email || undefined
      , out = []
    while (row = getRow()) {
      id = row.id.replace(/^org\.couchdb\.user:/, '')
      data = row.value
      var dm = data.email || undefined
      if (data.email !== email) continue
      out.push(row.value.name)
    }
    send(toJSON(out))
  }

}


ddoc.validate_doc_update = function (newDoc, oldDoc, userCtx, secObj) {
  if (newDoc._deleted === true) {
    // allow deletes by admins
    if ((userCtx.roles.indexOf('_admin') !== -1)) {
      return;
    } else {
      throw({forbidden: 'Only admins may delete user docs.'});
    }
  }

  if ((oldDoc && oldDoc.type !== 'user') || newDoc.type !== 'user') {
    throw({forbidden : 'doc.type must be user'});
  } // we only allow user docs for now

  if (!newDoc.name) {
    throw({forbidden: 'doc.name is required'});
  }

  if (newDoc.roles && !isArray(newDoc.roles)) {
    throw({forbidden: 'doc.roles must be an array'});
  }

  if (newDoc._id !== ('org.couchdb.user:' + newDoc.name)) {
    throw({
      forbidden: 'Doc ID must be of the form org.couchdb.user:name'
    });
  }

  if (newDoc.name !== newDoc.name.toLowerCase()) {
    throw({
      forbidden: 'Name must be lower-case'
    })
  }

  if (newDoc.name !== encodeURIComponent(newDoc.name)) {
    throw({
      forbidden: 'Name cannot contain non-url-safe characters'
    })
  }

  if (newDoc.name.charAt(0) === '.') {
    throw({
      forbidden: 'Name cannot start with .'
    })
  }

  if (!(newDoc.email && newDoc.email.match(/^.+@.+\..+$/))) {
    throw({forbidden: 'Email must be an email address'})
  }

  if (oldDoc) { // validate all updates
    if (oldDoc.name !== newDoc.name) {
      throw({forbidden: 'Usernames can not be changed.'});
    }
  }

  if (newDoc.password_sha && !newDoc.salt) {
    throw({
      forbidden: 'Users with password_sha must have a salt.'
    });
  }

  var is_server_or_database_admin = function(userCtx, secObj) {
    // see if the user is a server admin
    if(userCtx.roles.indexOf('_admin') !== -1) {
      return true; // a server admin
    }

    // see if the user a database admin specified by name
    if(secObj && secObj.admins && secObj.admins.names) {
      if(secObj.admins.names.indexOf(userCtx.name) !== -1) {
        return true; // database admin
      }
    }

    // see if the user a database admin specified by role
    if(secObj && secObj.admins && secObj.admins.roles) {
      var db_roles = secObj.admins.roles;
      for(var idx = 0; idx < userCtx.roles.length; idx++) {
        var user_role = userCtx.roles[idx];
        if(db_roles.indexOf(user_role) !== -1) {
          return true; // role matches!
        }
      }
    }

    return false; // default to no admin
  }

  if (!is_server_or_database_admin(userCtx, secObj)) {
    if (oldDoc) { // validate non-admin updates
      if (userCtx.name !== newDoc.name) {
        throw({
          forbidden: 'You may only update your own user document.'
        });
      }
      if (oldDoc.email !== newDoc.email) {
        throw({
          forbidden: 'You may not change your email address\n' +
            'Please visit https://npmjs.org/email-edit to do so.'
        })
      }
      // validate role updates
      var oldRoles = oldDoc.roles.sort();
      var newRoles = newDoc.roles.sort();

      if (oldRoles.length !== newRoles.length) {
        throw({forbidden: 'Only _admin may edit roles'});
      }

      for (var i = 0; i < oldRoles.length; i++) {
        if (oldRoles[i] !== newRoles[i]) {
          throw({forbidden: 'Only _admin may edit roles'});
        }
      }
    } else if (newDoc.roles.length > 0) {
      throw({forbidden: 'Only _admin may set roles'});
    }
  }

  // no system roles in users db
  for (var i = 0; i < newDoc.roles.length; i++) {
    if (newDoc.roles[i][0] === '_') {
      throw({
        forbidden: 'No system roles (starting with underscore) in users db.'
      });
    }
  }

  // no system names as names
  if (newDoc.name[0] === '_') {
    throw({forbidden: 'Username may not start with underscore.'});
  }

  var badUserNameChars = [':'];

  for (var i = 0; i < badUserNameChars.length; i++) {
    if (newDoc.name.indexOf(badUserNameChars[i]) >= 0) {
      throw({forbidden: 'Character `' + badUserNameChars[i] +
          '` is not allowed in usernames.'});
    }
  }
}

ddoc.views = {
  listAll: { map : function (doc) { return emit(doc._id, doc) } },

  invalidUser: { map: function (doc) {
    var errors = []
    if (doc.type !== 'user') {
      errors.push('doc.type must be user')
    }

    if (!doc.name) {
      errors.push('doc.name is required')
    }

    if (doc.roles && !isArray(doc.roles)) {
      errors.push('doc.roles must be an array')
    }

    if (doc._id !== ('org.couchdb.user:' + doc.name)) {
      errors.push('Doc ID must be of the form org.couchdb.user:name')
    }

    if (doc.name !== doc.name.toLowerCase()) {
      errors.push('Name must be lower-case')
    }

    if (doc.name !== encodeURIComponent(doc.name)) {
      errors.push('Name cannot contain non-url-safe characters')
    }

    if (doc.name.charAt(0) === '.') {
      errors.push('Name cannot start with .')
    }

    if (!(doc.email && doc.email.match(/^.+@.+\..+$/))) {
      errors.push('Email must be an email address')
    }

    if (doc.password_sha && !doc.salt) {
      errors.push('Users with password_sha must have a salt.')
    }
    if (!errors.length) return
    emit([doc.name, doc.email], errors)
  }},

  invalid: { map: function (doc) {
    if (doc.type !== 'user') {
      return emit(['doc.type must be user', doc.email, doc.name], 1)
    }

    if (!doc.name) {
      return emit(['doc.name is required', doc.email, doc.name], 1)
    }

    if (doc.roles && !isArray(doc.roles)) {
      return emit(['doc.roles must be an array', doc.email, doc.name], 1)
    }

    if (doc._id !== ('org.couchdb.user:' + doc.name)) {
      return emit(['Doc ID must be of the form org.couchdb.user:name', doc.email, doc.name], 1)
    }

    if (doc.name !== doc.name.toLowerCase()) {
      return emit(['Name must be lower-case', doc.email, doc.name], 1)
    }

    if (doc.name !== encodeURIComponent(doc.name)) {
      return emit(['Name cannot contain non-url-safe characters', doc.email, doc.name], 1)
    }

    if (doc.name.charAt(0) === '.') {
      return emit(['Name cannot start with .', doc.email, doc.name], 1)
    }

    if (!(doc.email && doc.email.match(/^.+@.+\..+$/))) {
      return emit(['Email must be an email address', doc.email, doc.name], 1)
    }

    if (doc.password_sha && !doc.salt) {
      return emit(['Users with password_sha must have a salt.', doc.email, doc.name], 1)
    }
  }, reduce: '_sum'}
}

if (require.main === module) {
  console.log(JSON.stringify(ddoc, function (k, v) {
    if (typeof v !== 'function') return v;
    return v.toString()
  }))
}
