const express = require("express");
const admin = require("firebase-admin");

const app = express();
app.use(express.json());

// 🔐 Credenciales Firebase
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    console.log("Incoming:", body);

    if (!body.channel_post && !body.message) {
      return res.sendStatus(200);
    }

    const msg = body.channel_post || body.message;

    const data = {
      text: msg.text || msg.caption || "",
      createdAt: new Date(),
      chatId: msg.chat?.id,
      messageId: msg.message_id,
      type: msg.photo ? "photo" : msg.video ? "video" : "text"
    };

    await db.collection("news").add(data);

    console.log("Saved to Firestore");

    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.get("/", (req, res) => {
  res.send("Webhook running");
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});