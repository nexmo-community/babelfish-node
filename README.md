# Babelfish

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)


This repository contains the Nexmo Babelfish demo, inspired by
[Naomi Pentrel](https://github.com/npentrel/babelfish) and her tutorial on the
[how to build a babelfish](https://www.nexmo.com/blog/2018/03/14/speech-voice-translation-microsoft-dr/)
on the Nexmo blog.

It takes the original idea and reimplements it in node to provide an alternative
implementation to the Python original. In addition, it adds a UI for demos at
events

## Installation

* You'll need a [Nexmo account](https://dashboard.nexmo.com/sign-up)
* You'll also need a [Cognitive Services Speech Translation service](https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechTranslation) account
* Clone this repository
* Run `npm install` to fetch all dependencies
* Rent a Nexmo number
* Create a new Nexmo Application, setting the `answer_url` to `http://<ngrok_url>/webhooks/answer`
* Link your Nexmo number to your application
* Edit `.env` with the relevant values
  * `NEXMO_NUMBER`, `NEXMO_APPLICATION_ID` and `NEXMO_PRIVATE_KEY_PATH` use the details you just created
  * `MICROSOFT_KEY` and `MICROSOFT_SERVICE_REGION` are your Cognitive Services credentials
  * `PORT` is the port to run the application on (we recommend `3000`)
* Run `ngrok http 3000`
* Run `node index.js`

## Usage

* Visit `http://<ngrok_url>`
* Call the number at the top of the screen and speak english. You should see it translated to Spanish
