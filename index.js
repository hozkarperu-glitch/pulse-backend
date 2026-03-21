const express = require("express");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const FIREBASE_BUCKET = process.env.FIREBASE_BUCKET;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: FIREBASE_BUCKET,
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

async function getTelegramFileUrl(fileId) {
  const fileRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`
  );

  const fileData = await fileRes.json();
  console.log("getFile response:", JSON.stringify(fileData));

  if (!fileRes.ok || !fileData.ok || !fileData.result?.file_path) {
    throw new Error(
      `Telegram getFile failed: status=${fileRes.status} body=${JSON.stringify(fileData)}`
    );
  }

  return `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileData.result.file_path}`;
}

async function uploadPhotoFromTelegram(photo, chatId, messageId) {
  if (!Array.isArray(photo) || photo.length === 0) {
    throw new Error("Photo payload is empty");
  }

  const fileId = photo[photo.length - 1].file_id;
  const downloadUrl = await getTelegramFileUrl(fileId);

  const imageRes = await fetch(downloadUrl);
  if (!imageRes.ok) {
    throw new Error(`Image download failed: status=${imageRes.status}`);
  }

  const buffer = await imageRes.buffer();
  const fileName = `news/${chatId || "unknown"}_${messageId || Date.now()}.jpg`;
  const file = bucket.file(fileName);

  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType: "image/jpeg",
    },
  });

  const [signedUrl] = await file.getSignedUrl({
    action: "read",
    expires: "03-01-2500",
  });

  return signedUrl;
}

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    console.log("Incoming:", JSON.stringify(body));

    if (!body.channel_post && !body.message) {
      return res.sendStatus(200);
    }

    const msg = body.channel_post || body.message;

    const data = {
      text: msg.text || msg.caption || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      chatId: msg.chat?.id || null,
      messageId: msg.message_id || null,
      telegramDate: msg.date ? new Date(msg.date * 1000) : null,
      type: msg.photo ? "photo" : msg.video ? "video" : "text",
      mediaUrl: null,
      imageUrl: null,
      source: "telegram",
    };

    if (msg.photo) {
      try {
        const uploadedUrl = await uploadPhotoFromTelegram(
          msg.photo,
          msg.chat?.id,
          msg.message_id
        );
        data.mediaUrl = uploadedUrl;
        data.imageUrl = uploadedUrl;
        console.log("Imagen subida:", uploadedUrl);
      } catch (imageError) {
        console.error("Error subiendo imagen:", imageError);
      }
    }

    await db.collection("news").add(data);
    console.log("Saved to Firestore:", data);

    return res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error);
    return res.sendStatus(500);
  }
});

app.get("/", (req, res) => {
  res.send("Webhook running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


