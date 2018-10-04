const EventEmitter = require('events');
const speech = require('@google-cloud/speech');
const mic = require('mic');
const config = require('./config');

const PRELOAD_COUNT = 3;

function Speech() {
  var t = new EventEmitter();
  t.recording = true;
  t.writing = true;
  t.recordingTime = 0;

  const defaultRequestOpts = {
    config: {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'ja-JP',
      maxAlternatives: 3,
    },
    interimResults: false,
  };

  if (config.voiceHat == true && config.usbUSBMIC == false) {
    var device = 'plug:micboost';
  } else {
    var device = config.usbUSBMICDevice;  //e.g. 'plughw:1,0';
  }
  var micInstance = mic({
    'device': device,
    'rate': '16000',
    'channels': '1',
    'debug': false,
    'exitOnSilence': 6,
  });
  var micInputStream = micInstance.getAudioStream();

  var recognizeStream = null;
  var recognizeStreams = null;
  var requestOpts = [{ ...defaultRequestOpts }];
  var startTime = 0;
  var writingStep = 0;
  var speechClients = [];
  var streamQue = [];

  speechClients[0] = new speech.SpeechClient();

  // マイクの音声認識の閾値を変更
  t.on('mic_threshold', function (threshold) {
      micInputStream.changeSilentThreshold(threshold);
  });

  // 音声解析開始
  t.on('startRecording', function (params) {
    if ('threshold' in params) {
      micInputStream.changeSilentThreshold(params.threshold);
    }
    requestOpts = [];
    if ('languageCode' in params) {
      if (typeof params.languageCode === 'string') {
        const opts = { ...defaultRequestOpts, };
        opts.languageCode = params.languageCode.trim();
        requestOpts.push(opts);
      } else {
        params.languageCode.forEach( (code, i) => {
          const opts = { ...defaultRequestOpts, };
          opts.config = { ...defaultRequestOpts.config };
          opts.config.languageCode = code.trim();
          requestOpts.push(opts);
        })
      }
    } else {
      requestOpts.push({ ...defaultRequestOpts, });
    }
    console.log('startRecording');
    console.log(JSON.stringify(requestOpts,null,'  '));
  });

  // 音声解析終了
  t.on('stopRecording', function () {
    console.log('stopRecording');
  });

  micInputStream.on('data', function (data) {
    if (micInputStream.incrConsecSilenceCount() > micInputStream.getNumSilenceFramesExitThresh()) {
      streamQue.push(data);
      streamQue = streamQue.slice(-PRELOAD_COUNT);
      if (writingStep == 1) {
        console.log('end writing');
        writingStep = 0;
      }
      if (recognizeStreams) {
        console.log('endStream A');
        recognizeStreams.forEach( stream => stream.end() );
        recognizeStreams = null;
        if (startTime > 0) {
          t.recordingTime += (new Date()).getTime() - startTime;
          startTime = 0;
        }
      }
    } else {
      if (recognizeStreams == null && t.recording) {
        console.log('startStream');
        startTime = (new Date()).getTime();
        recognizeStreams = [];
        const rec_length = requestOpts.length;
        const results = [];
        requestOpts.forEach( (opts, i) => {
          const client = ((i) => {
            if (speechClients[i] == null) {
              speechClients[i] = new speech.SpeechClient();
            }
            return speechClients[i];
          })(i);
          console.log('createStream');
          recognizeStreams.push(client.streamingRecognize(opts)
            .on('error', (err) => {
              console.log('error' , JSON.stringify(opts));
              console.error(err);
            })
            .on('data', (data) => {
              if (data.results[0] && data.results[0].alternatives[0]) {
                const alternatives = data.results[0].alternatives.map(v => v);
                const sentence = alternatives.shift();
                console.log(JSON.stringify(data));
                if (!t.recording) return;
                const result = {
                  languageCode: opts.config.languageCode,
                  transcript: sentence.transcript,
                  confidence: sentence.confidence,
                }
                const emitResult = (result) => {
                  console.log(`result ${JSON.stringify(result,null,'  ')}`);
                  t.emit('data', result);
                  if (!t.writing) {
                    t.recording = false;
                  }
                }
                if (rec_length > 1) {
                  results.push(result);
                  if (results.length == 1) {
                    setTimeout(() => {
                      let candidate = results[0];
                      for (var i=0;i<results.length;i++) {
                        if (candidate.confidence < results[i].confidence) {
                          candidate = results[i];
                        }
                      }
                      emitResult(candidate);
                    }, 1000)
                    return;
                  }
                  return;
                }
                emitResult(result);
              }
            })
          )
        });
      }
      if (t.recording && t.writing) {
        if (writingStep == 0) {
          console.log('start writing');
          writingStep = 1;
        }
        if (streamQue.length > 0) {
          streamQue.forEach( data => {
            recognizeStreams.forEach( stream => stream.write(data) );
          })
          streamQue = [];
        }
        recognizeStreams.forEach( stream => stream.write(data) );
      } else {
        streamQue.push(data);
        streamQue = streamQue.slice(-PRELOAD_COUNT);
        if (writingStep == 1) {
          console.log('end writing');
          writingStep = 0;
        }
        if (recognizeStreams) {
          console.log('endStream B');
          recognizeStreams.forEach( stream => stream.end() );
          recognizeStreams = null;
          if (startTime > 0) {
            t.recordingTime += (new Date()).getTime() - startTime;
            startTime = 0;
          }
        }
      }
    }
    if (writingStep == 1 && !t.recording) {
      console.log('end writing');
      writingStep = 0;
    }
  })

  micInputStream.on('error', function (err) {
    console.log("Error in Input Stream: " + err);
  });

  micInputStream.on('startComplete', function () {
    console.log("Got SIGNAL startComplete");
    t.status = 'start';
  });

  micInputStream.on('stopComplete', function () {
    console.log("Got SIGNAL stopComplete");
    t.status = 'stop';
  });

  micInputStream.on('pauseComplete', function () {
    console.log("Got SIGNAL pauseComplete");
    t.status = 'pause';
  });

  micInputStream.on('resumeComplete', function () {
    console.log("Got SIGNAL resumeComplete");
    t.status = 'start';
  });

  micInputStream.on('silence', function () {
    console.log("Got SIGNAL silence");
  });

  micInputStream.on('processExitComplete', function () {
    console.log("Got SIGNAL processExitComplete");
  });

  micInstance.start();

  return t;
}

const sp = Speech();
module.exports = sp;

if (require.main === module) {
  sp.emit('startRecording', { languageCode: [ 'ja-JP', ] });
  // sp.emit('startRecording', { languageCode: [ 'ja-JP', 'en-US' ] });
  sp.on('data', function (data) {
    //console.log(data);
  });
}
