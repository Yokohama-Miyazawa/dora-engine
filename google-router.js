const express = require('express');
const router = express.Router();
const config = require('./config');
const { spawn } = require('child_process');
const fs = require('fs');
const client = (() => {
  if ('synthesizeSpeech' in config && 'credentialPath' in config.synthesizeSpeech) {
    try {
      const textToSpeech = require('@google-cloud/text-to-speech');
      const ret = new textToSpeech.TextToSpeechClient();
      console.log('google text-to-speech initialized.');
      return ret;
    } catch(err) {
      console.error(err);
    }
  }
  console.log('google text-to-speech is disabled.');
  return null;
})();
const crypto = require('crypto');
const path = require('path');
const readline = require('readline');
const {google} = require('googleapis');

const cacheDBPath = ('synthesizeSpeech' in config && 'cacheDBPath' in config.synthesizeSpeech)?config.synthesizeSpeech.cacheDBPath:null;

const cacheDB = (() => {
  if (cacheDBPath) {
    try {
      const data = fs.readFileSync(cacheDBPath);
      const json = JSON.parse(data);
      Object.keys(json).forEach( key => {
        if ('atime' in json[key]) json[key].atime = new Date(json[key].atime);
        if ('ctime' in json[key]) json[key].ctime = new Date(json[key].ctime);
      })
      return json;
    } catch(err) {
      console.error(err);
    }
  }
  return {};
})();

const saveCacheDB = (() => {
  let counter = 0;
  let writing = false;
  let lastCacheDB = null;
  const write = () => {
    if (cacheDBPath) {
      if (!writing) {
        writing = true;
        counter = 0;
        const t = JSON.stringify(cacheDB);
        const nextWrite = () => {
          if (counter > 0) {
            setTimeout(() => {
              writing = false;
              write();
            }, 1000);
          } else {
            writing = false;
          }
        }
        if (lastCacheDB !== t) {
          lastCacheDB = t;
          fs.writeFile(cacheDBPath, lastCacheDB, (err) => {
            nextWrite();
          });
        } else {
          nextWrite();
        }
      } else {
        counter ++;
      }
    }
  }
  return write;
})();

router.get('/health', (req, res) => {
  res.send('OK\n');
})

router.post('/text-to-speech', (req, res) => {
  let text = 'こんにちは';

  let voice = {};
  let audioConfig = {};

  if ('languageCode' in req.body) {
    voice.languageCode = req.body.languageCode;
  } else {
    voice.languageCode = 'ja-JP';
  }

  if ('ssmlGender' in req.body) {
    voice.ssmlGender = req.body.ssmlGender;
  } else {
    voice.ssmlGender = 'NEUTRAL';
  }

  if ('audioEncoding' in req.body) {
    audioConfig.audioEncoding = req.body.audioEncoding;
  } else {
    audioConfig.audioEncoding = 'LINEAR16';
  }

  if ('speakingRate' in req.body) {
    audioConfig.speakingRate = req.body.speakingRate;
  }

  if ('pitch' in req.body) {
    audioConfig.pitch = req.body.pitch;
  }

  if ('name' in req.body) {
    voice.name = req.body.name;
  }

  if ('text' in req.body) {
    text = req.body.text;
  }

  // Construct the request
  const request = {
    input: { text },
    // Select the language and SSML Voice Gender (optional)
    voice,
    // Select the type of audio encoding
    audioConfig,
  };

  if (!client) {
    console.error('ERROR:', 'TextToSpeechClient is disabled.');
    res.send('NG');
    return;
  }

  const cacheFilePath = (filename) => {
    return path.join(config.synthesizeSpeech.tempdir, filename);
  }

  const playone = (sndfilepath, callback) => {
    const cmd = (process.platform === 'darwin') ? 'afplay' : 'aplay';
    const opt = (process.platform === 'darwin') ? [sndfilepath] : ['-Dplug:softvol', sndfilepath];
    console.log(`/usr/bin/${cmd} ${sndfilepath}`);
    const playone = spawn(`/usr/bin/${cmd}`, opt);
    playone.on('close', function(code) {
      callback(null, code);
    });
  }

  const limitCacheFile = (cacheDB, maxsize, callback) => {
    if (maxsize) {
      const maxsizebyte = 1024*1024*maxsize;
      let totalsize = 0;
      for (key in cacheDB) totalsize += cacheDB[key].size;
      const sortedCache = (() => {
        const t = [];
        for (key in cacheDB) {
          t.push(cacheDB[key]);
        }
        return t.sort( (a,b) => {
          if (a.counter > b.counter) return -1;
          if (a.counter < b.counter) return  1;
          if (a.atime.getTime() > b.atime.getTime()) return -1;
          if (a.atime.getTime() < b.atime.getTime()) return  1;
          return 0;
        })
      })();
      if (totalsize > maxsizebyte) {
        let sizesum = 0;
        sortedCache.forEach( v => {
          sizesum += v.size;
          if (sizesum > maxsizebyte) {
            if (v.filename) {
              fs.unlink(cacheFilePath(v.filename), (err) => {
              });
              delete cacheDB[v.filename];
              saveCacheDB();
            }
          }
        })
      }
    }
    callback();
  }

  const requestSynthesizeSpeech = (request, sndfilepath, callback) => {
    limitCacheFile(cacheDB, config.synthesizeSpeech.maxCacheSize, () => {
      client.synthesizeSpeech(request, (err, response) => {
        if (err) {
          callback(err);
          return;
        }
        fs.writeFile(sndfilepath, response.audioContent, 'binary', err => {
          if (err) {
            callback(err);
            return;
          }
          callback(null, sndfilepath);
        });
      });
    });
  }

  const filename = `robot-snd-${crypto.createHash('md5').update(JSON.stringify(request)).digest("hex")}.${(audioConfig.audioEncoding==='LINEAR16')?'wav':'mp3'}`;
  const sndfilepath = cacheFilePath(filename);
  fs.access(sndfilepath, fs.constants.R_OK, (err) => {
    if (err || !(filename in cacheDB) || cacheDB[filename].text !== text) {
      //ファイルがないので作成
      requestSynthesizeSpeech(request, sndfilepath, (err) => {
        if (err) {
          console.error('ERROR:', err);
          res.send('NG\n');
          return;
        }
        fs.stat(sndfilepath, (err, stats) => {
          if (err) {
            console.error('ERROR:', err);
            res.send('NG\n');
            return;
          }
          playone(sndfilepath, (err, code) => {
            if (err) {
              console.error('ERROR:', err);
              res.send('NG\n');
              return;
            }
            console.log('close', code);
            cacheDB[filename] = {
              text,
              filename,
              ctime: new Date(),
              atime: new Date(),
              counter: 0,
              size: (stats.size/512*512)+(((stats.size%512)===0)?0:512),
            };
            saveCacheDB();
            res.send('OK\n');
          })
        })
      })
    } else {
      //ファイルがあるので再生
      playone(sndfilepath, (err, code) => {
        if (err) {
          console.error('ERROR:', err);
          res.send('NG\n');
          return;
        }
        console.log('close', code);
        cacheDB[filename].counter ++;
        cacheDB[filename].atime = new Date();
        saveCacheDB();
        res.send('OK\n');
      })
    }
  });
  
})

let google_sheet = {
  credentials: null,
  token: null,
  cache: [],
  writing: false,
}
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const loadCredential = (callback) => {
  if (google_sheet.credentials === null) {
    fs.readFile(config.googleSheet.credentialPath, (err, content) => {
      if (err) return callback(err);
      google_sheet.credentials = JSON.parse(content);
      callback(null, google_sheet.credentials);
    })
    return;
  }
  callback(null, google_sheet.credentials);
}

const getNewToken = (oAuth2Client, callback) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) {
        console.error('Error while trying to retrieve access token', err);
        return callback(err);
      }
      fs.writeFile(config.googleSheet.tokenPath, JSON.stringify(token), (err) => {
        if (err) {
          console.error(err);
          return callback(err);
        }
        callback(err, token);
      })
    })
  });
}

const getToken = (oAuth2Client, callback) => {
  if (google_sheet.token === null) {
    fs.readFile(config.googleSheet.tokenPath, (err, content) => {
      if (err) {
        return callback(err);
      }
      google_sheet.token = JSON.parse(content);
      callback(null, google_sheet.token);
    })
    return;
  }
  callback(null, google_sheet.token);
}

function apeendToSheet({ sheetId, payload, }, callback) {
  const appendData = (auth, values, callback) => {
    console.log(`append-to-sheet ${sheetId}, ${JSON.stringify(values)}`);
    const sheets = google.sheets({version: 'v4', auth});
    sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values,
      },
    }, callback)
  }
  loadCredential((err, credentials) => {
    if (err) {
      return callback(err);
    }
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    getToken(oAuth2Client, (err, token) => {
      if (err) {
        return callback(err);
      }
      oAuth2Client.setCredentials(token);
      appendData(oAuth2Client, payload, (err, result) => {
        callback(err, result);
      });
    })
  })
}

router.post('/append-to-sheet', (req, res) => {
  if (config.googleSheet.credentialPath !== null && config.googleSheet.tokenPath !== null) {
    const { sheetId, payload } = req.body;
    const delayTime = 1000;

    if (google_sheet.cache.length >= 100) {
      res.send('NG overflow\n');
      return;
    }
    google_sheet.cache.push({ sheetId, payload });

    const makeValues = (payload) => {
      if (typeof payload === 'undefined') return [];
      if (typeof payload === 'string') return [payload];
      if (Array.isArray(payload)) {
        return payload;
      }
      if (typeof payload === 'object') {
        return [Object.keys.sort().map( key => payload[key] )];
      }
      return [payload.toString()];
    }

    const append = (sheetId, payload) => {
      if (google_sheet.cache.length <= 0) {
        if (payload.length > 0) {
          apeendToSheet({ sheetId, payload }, (err) => {
            if (err) {
              console.error(err);
            }
            setTimeout(() => {
              append(null, []);
            }, delayTime);
          })
        } else {
          google_sheet.writing = false;
        }
        return;
      }
      google_sheet.writing = true;
      const p = google_sheet.cache.shift();
      const data = [ (new Date()).toLocaleString(), ...makeValues(p.payload) ];
      if (sheetId === null || sheetId === p.sheetId) {
        sheetId = p.sheetId;
        payload.push(data);
        append(sheetId, payload);
        return;
      }
      if (sheetId !== null && payload.length > 0) {
        apeendToSheet({ sheetId, payload }, (err) => {
          if (err) {
            console.error(err);
          }
          sheetId = p.sheetId;
          payload = [ data ];
          setTimeout(() => {
            append(sheetId, payload);
          }, delayTime);
        })
      } else {
        sheetId = p.sheetId;
        payload = [ data ];
        append(sheetId, payload);
      }
    }
    if (!google_sheet.writing) {
      setTimeout(() => {
        append(null, []);
      }, delayTime);
    }

    res.send('OK\n');
    return;
  }
  res.send('OK\n');
})

module.exports = router;

if (require.main === module) {
  const PORT = process.env.PORT || 5000
  const bodyParser = require('body-parser');
  const app = express();
  app.use(bodyParser.json({ type: 'application/json' }))
  app.use(router);
  const server = require('http').Server(app);
  server.listen(PORT, () => console.log(`server listening on port ${PORT}!`))

  if (config.googleSheet.credentialPath !== null && config.googleSheet.tokenPath !== null) {
    loadCredential((err, credentials) => {
      if (err) {
        console.error(err);
        return;
      }
      const {client_secret, client_id, redirect_uris} = credentials.installed;
      const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
      getToken(oAuth2Client, (err, token) => {
        if (err) {
          getNewToken(oAuth2Client, (err, token) => {
            if (err) {
              console.error(err);
              return;
            }
            console.log('token saved');
          });
        } else {
          console.log('already exist token.');
        }
      })
    })
  }
}
