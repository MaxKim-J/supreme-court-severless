const functions = require('firebase-functions');

const admin = require('firebase-admin');
admin.initializeApp();

exports.helloWorld = functions.https.onRequest((req, res) => {
  functions.logger.info("Hello logs!", {structuredData: true});
  res.send("Hello from Firebase!");
});
