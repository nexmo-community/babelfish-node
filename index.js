const fs = require("fs");
const Nexmo = require("nexmo");
const request = require("request");
const express = require("express");
const app = express();
const expressWs = require("express-ws")(app);
const bodyParser = require("body-parser");

const winston = require("winston");

require("dotenv").config();

const nexmo = new Nexmo({
  apiKey: "a", // Not used, but required by the lib
  apiSecret: "b",
  applicationId: process.env.NEXMO_APPLICATION_ID,
  privateKey: process.env.NEXMO_PRIVATE_KEY
});

const logger = winston.createLogger({
  levels: winston.config.syslog.levels,
  level: "debug",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

logger.info("Bootstrapped");

const LanguageTracker = require("./languageTracker.js");
const Translator = require("./translator");
const LanguageToVoice = require("./languageToVoice.json");

const connectedCalls = {};
const languages = {};
const connectionMap = {};

const langTracker = new LanguageTracker();

app.use(bodyParser.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
  // Initial users
  const initial_data = [];

  for (num in langTracker.languages) {
    let l = langTracker.get(num);
    let connected = Object.values(connectionMap).filter((v) => v.user == num).length ? true : false;
    initial_data.push([num, l.from, l.to, connected]);
  }

  fs.readFile("views/index.html", function(err, html) {
    html = html.toString(); // Convert from buffer to string
    html = html.replace("{{number}}", process.env.NEXMO_NUMBER); // Replace the number
    html = html.replace("{{initial_data}}", JSON.stringify(initial_data));
    html = html.replace("{{default_number}}", process.env.YOUR_NUMBER || "");
    return res.send(html);
  });
});

app.post("/call", (req, res) => {
  nexmo.calls.create(
    {
      to: [
        {
          type: "phone",
          number: req.body.number
        }
      ],
      from: {
        type: "phone",
        number: process.env.NEXMO_NUMBER
      },
      answer_url: ["http://" + req.headers.host + "/webhooks/answer"]
    },
    function(err, data) {
      if (err) {
        logger.error("Unable to make call to " + req.body.number);
        console.log(err);
        return res.send("", err.body.type);
      }
      logger.info("Call placed to " + req.body.number);
      return res.send("");
    }
  );
});

app.post("/webhooks/event", (req, res) => {
  if (process.env.SHOW_EVENTS) {
    logger.debug("Webhook Event", req.body);
  }
  return res.json({ success: true });
});

app.get("/webhooks/answer", (req, res) => {
  let number =
    req.query.from == process.env.NEXMO_NUMBER ? req.query.to : req.query.from;
  return res.json([
    {
      action: "connect",
      eventUrl: ["http://" + req.headers.host + "/webhooks/event"],
      endpoint: [
        {
          type: "websocket",
          uri: "ws://" + req.headers.host + "/nexmo_call",
          "content-type": "audio/l16;rate=16000",
          headers: {
            user: number,
            uuid: req.query.uuid
          }
        }
      ]
    }
  ]);
});

app.ws("/nexmo_call", function(ws, req) {
  let socketId = ws._ultron.id;
  ws.on("message", async function(message) {
    if (!Buffer.isBuffer(message)) {
      const call = JSON.parse(message);
      connectionMap[socketId] = call;

      let chosen = langTracker.get(call.user);
      logger.info(`Connecting ${call.user} as ${chosen.from} -> ${chosen.to}`);

      connectClient(call.user, chosen.from, chosen.to);

      connectedCalls[call.user] = await Translator(chosen.from, chosen.to, ws);

      connectedCalls[call.user].translator.on("translation", function(
        originalText,
        translatedText
      ) {
        sendTranslation(
          originalText,
          translatedText,
          chosen.from,
          chosen.to,
          call.user
        );

        // Play audio in to all connected calls
        Object.keys(connectionMap).forEach(k => {
          playTextToSpeech(
            connectionMap[k].uuid,
            translatedText,
            getVoice(chosen.to)
          );
        });
      });
    }
  });

  ws.on("close", function(a) {
    let user = connectionMap[socketId].user;
    disconnectClient(user);
    connectedCalls[user].stopRecognizer(() =>
      logger.info("Stopping Recognizer", { user })
    );
    delete connectionMap[socketId];
  });
});

app.ws("/page", function(ws, req) {
  ws.on("message", function(message) {
    const m = JSON.parse(message);
    logger.debug("Received message from page:", m);

    switch (m.action) {
      case "add-language":
        langTracker.add(m.user, m.from, m.to);
        addClient(m.user, m.from, m.to);
        break;
      case "remove-language":
        langTracker.remove(m.user);
        removeClient(m.user);
        break;
      case "get-language":
        sendToPage(langTracker.get(m.user));
        break;
      default:
        logger.error("Unknown message:", m);
    }
  });
});

app.listen(process.env.PORT, () =>
  logger.info(`Babelfish listening on port ${process.env.PORT}!`)
);

function addClient(user, fromLang, toLang) {
  logger.info("Adding Client", { fromLang, toLang, user });
  sendToPage({ action: "add", fromLang, toLang, user });
}
function connectClient(user, fromLang, toLang) {
  logger.info("Connecting Client", { fromLang, toLang, user });
  sendToPage({ action: "connect", fromLang, toLang, user });
}
function disconnectClient(user) {
  logger.info("Disconnecting Client", { user });
  sendToPage({ action: "disconnect", user });
}
function removeClient(user) {
  logger.info("Removing Client", { user });
  sendToPage({ action: "remove", user });
}
function sendToPage(data) {
  var pageWs = expressWs.getWss("/page");
  pageWs.clients.forEach(function(c) {
    c.send(JSON.stringify(data));
  });
}
function sendTranslation(text, translated, fromLang, toLang, user) {
  logger.debug(text + " -> " + translated, { fromLang, toLang, user });
  sendToPage({ text, translated, fromLang, toLang, user });
}

function playTextToSpeech(leg, text, voice) {
  try {
      const jwt = Nexmo.generateJwt(Buffer.from(process.env.NEXMO_PRIVATE_KEY), {
          application_id: process.env.NEXMO_APPLICATION_ID
      });

      request.put(
          {
              url: `https://api.nexmo.com/v1/calls/${leg}/talk`,
              headers: {
                  Authorization: `Bearer ${jwt}`
              },
              json: { text, voice_name: voice }
          },
          function(err, data) {
              if (err) {
                  logger.error(err);
                  return;
              }
          }
      );
      logger.debug(`Playing '${text}' to ${leg} as ${voice}`);
  } catch (e) {
      logger.error(`Error generating JWT`);
  }
}

function getVoice(language) {
  // Did we get a short language code?
  if (language.indexOf("-") === -1) {
    language = language + "-" + language.toUpperCase();
  }

  let v = LanguageToVoice[language];
  if (v) {
    return v;
  }

  return "Russell";
}
