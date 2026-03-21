const express = require("express");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const cloudinary = require("cloudinary").v2;

const app = express();
app.use(express.json());

// Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;

// 🖼️ Descarga foto de Telegram y la sube a Cloudinary
async function uploadPhotoFromTelegram(photo) {
  const fileId = photo[photo.length - 1].file_id;

  // 1. Obtener URL de descarga de Telegram
  const fileRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`
  );
  const fileData = await fileRes.json();
  const filePath = fileData.result.file_path;
  const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;

  // 2. Subir directo a Cloudinary desde la URL
  const result = await cloudinary.uploader.upload(downloadUrl, {
    folder: "news",
  });

  return result.secure_url;
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
      createdAt: new Date(),
      chatId: msg.chat?.id,
      messageId: msg.message_id,
      type: msg.photo ? "photo" : msg.video ? "video" : "text",
      imageUrl: null,
    };

    if (msg.photo) {
      console.log("📸 Subiendo foto a Cloudinary...");
      data.imageUrl = await uploadPhotoFromTelegram(msg.photo);
      console.log("✅ Imagen subida:", data.imageUrl);
    }

    await db.collection("news").add(data);
    console.log("✅ Guardado en Firestore");
    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error:", error);
    res.sendStatus(500);
  }
});

app.get("/", (req, res) => res.send("Webhook running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔥 Server running on port ${PORT}`));
