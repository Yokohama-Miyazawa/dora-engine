const crypto = require('crypto');
const fs = require('fs');
const jws = require('jws');
const config = require('./config');
const bcrypt = (() => {
  try { return require('bcrypt'); }
  catch(e) { return equire('bcryptjs'); }
})();

function getCredential(path) {
  if (path) {
    return fs.readFileSync(path);
  }
  return null;
}

const privateKey = getCredential(config.robot_private_key);
const publicKey = getCredential(config.robot_public_key);

/*
//使い方
const allowAddresses = [ '::1', ];
app.use( checkIPs(allowAddresses, 'allow') );
*/
function checkIPs(ips, mode='allow') {
  function getClientIp(req) {
    var ipAddress;
    var forwardedIpsStr = req.headers['x-forwarded-for'];
    if (forwardedIpsStr) {
      var forwardedIps = forwardedIpsStr.split(',');
      ipAddress = forwardedIps[0];
    }
    if (!ipAddress) {
      ipAddress = req.connection.remoteAddress;
    }
    return ipAddress;
  }
  return (req, res, next) => {
    const ipaddress = getClientIp(req);
    if (mode === 'allow') {
      if (ips.indexOf(ipaddress) !== -1) return next();
    } else {
      if (ips.indexOf(ipaddress) === -1) return next();
    }
    console.log(`deny ipaddress ${ipaddress}`);
    res.statusCode = 401;
    res.end('Unauthorized');
  }
}

function createSignature(secretKey, callback) {
  if (privateKey) {
    jws.createSign({
      header: { alg: 'HS256' },
      privateKey,
      payload: { secretKey, },
    }).on('done', function(signature) {
      callback(signature);
    })
  } else {
    callback(bcrypt.hashSync(secretKey, 8));
  }
}


function verifySignature(secretKey, signature, callback) {
  if (publicKey) {
    jws.createVerify({
      algorithm: 'HS256',
      publicKey,
      signature,
    }).on('done', function(verified, obj) {
      if (verified) {
        callback(obj.secretKey === secretKey);
        return;
      }
      callback(false);
    });
  } else {
    callback(bcrypt.compareSync(secretKey, signature));
  }
}

let locahostTokenCache = null;
function localhostToken() {
  if (locahostTokenCache) return locahostTokenCache;
  const token = (length) => {
    const c = "ABCDEFGHIJKLMNOPQRSTUZWXYZabcdefghijklmnopqrstuvwxyz1234567890";
    const token = [];
    for (var i=0;i<length;i++) {
        token.push(c[Math.floor(Math.random()*c.length)]);
    }
    return token.join("");
  }
  locahostTokenCache = token(53);
  return locahostTokenCache;
}

function testPermission(scope, permission) {
  if (permission === '') return true;
  if (Array.isArray(permission)) {
    if (permission.some( p => !testPermission(scope, p) )) return false;
    return true;
  }
  if (Array.isArray(scope)) {
    if (scope.length === 0) return false;
    if (scope.some( s => testPermission(s, permission) )) return true;
    return false;
  }
  if (scope === '*' || scope === permission) return true;
  if (scope === 'read' || scope === '*.read') return /^((.+)\.)?read$/.test(permission);
  if (scope === 'write' || scope === '*.write') return /^((.+)\.)?write$/.test(permission);
  return false;
}

function hasPermission(permission) {
  return (req, res, next ) => {
    const hasLocalhostToken = (req) => {
      if ('body' in req && 'localhostToken' in req.body) {
        return (req.body.localhostToken === localhostToken());
      }
      return false;
    }
    const unauthorized = () => {
      res.statusCode = 401;
      res.end('Unauthorized');
    }
    if (req.isAuthenticated()) {
      //ログインしていれば
      if (req.user.authInfo) {
        if (testPermission(req.user.authInfo.scope, permission)) {
          return next();
        }
      }
      console.log('not login');
      unauthorized();
    } else {
      //ログインしていなければ
      if (hasLocalhostToken(req)) {
        //localhostは許可
        if (testPermission(config.localhostPermissions, permission)) {
          return next();
        }
        console.log('not localhost');
        unauthorized();
      } else {
        //publicKeyで検証
        if ('body' in req && 'signature' in req.body) {
          verifySignature(config.robot_secret_key, req.body.signature, (verified) => {
            if (verified) {
              if (testPermission('*', permission)) {
                return next();
              }
            }
            console.log('invalid signature');
            unauthorized();
          })
        } else {
          console.log('not has signature');
          unauthorized();
        }
      }
    }
  }
}

function checkPermission(payload, permission, callback) {
  const { user_id, signature, } = payload;
  const hasLocalhostToken = (payload) => {
    if ('localhostToken' in payload) {
      return (payload.localhostToken === localhostToken());
    }
    return false;
  }
  const authSuccess = () => {
    let user = null;
    if (user_id && config.adminAuth.some( n => {
      user = n;
      return n.username === user_id;
    })) {
      callback(testPermission(user.permissions, permission));
    } else {
      callback(testPermission(config.defualtUserPermissions, permission));
    }
  }
  if (hasLocalhostToken(payload)) {
    if (testPermission('*', permission)) {
     callback(true);
      return;
    }
  }
  try {
    verifySignature(user_id, signature, (verified) => {
      if (verified) {
        return authSuccess();
      }
      callback(false);
    });
    return;
  } catch(err) {
  }
  callback(false);
}

module.exports = {
  checkIPs,
  createSignature,
  verifySignature,
  localhostToken,
  testPermission,
  hasPermission,
  checkPermission,
}

if (require.main === module) {
}
