const sdk = require("microsoft-cognitiveservices-speech-sdk");
const header = require("waveheader");
const events = require("events");

let translator = async function(fromLanguage, toLanguage, connection) {
  const translationEmitter = new events.EventEmitter();

  let audioStream = createAudioStream(connection);

  // Generate the configuration for the translation
  let audioConfig = sdk.AudioConfig.fromStreamInput(audioStream);
  let translationConfig = sdk.SpeechTranslationConfig.fromSubscription(
    process.env.MICROSOFT_KEY,
    process.env.MICROSOFT_SERVICE_REGION
  );
  translationConfig.speechRecognitionLanguage = fromLanguage;
  translationConfig.addTargetLanguage(toLanguage);

  // Create a new instance with our configs
  var recognizer = new sdk.TranslationRecognizer(
    translationConfig,
    audioConfig
  );

  // When we get a new translated item, emit it to all listeners
  recognizer.recognized = function(s, e) {
    translationEmitter.emit(
      "translation",
      e.result.text,
      e.result.translations.privMap.privValues[0]
    );
  };

  // Return a promise so that we can `await` it in the caller
  return new Promise((resolve, reject) => {
    recognizer.startContinuousRecognitionAsync(() => {
      return resolve({
        translator: translationEmitter,
        stopRecognizer: cb => {
          recognizer.stopContinuousRecognitionAsync(
            d => cb(null, d),
            e => cb(e)
          );
        }
      });
    }, reject);
  });
};

function createAudioStream(connection) {
  // The audioStream is the source of all audio for the translation
  var audioStream = sdk.AudioInputStream.createPushStream();
  // Start by writing a wav header
  audioStream.write(header(0, { sampleRate: "16000" })); // 16000 khz
  // Then any time we get a chunk of data on the websocket, write it to
  // the audioStream
  connection.on("message", function(message) {
    if (Buffer.isBuffer(message)) {
      audioStream.write(message);
    }
  });

  return audioStream;
}

module.exports = translator;
