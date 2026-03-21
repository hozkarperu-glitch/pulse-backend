const express = require("express");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const serviceAccount = JSON.parse(process.env.FIREBASE_KEY);
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN; // ← agregar esta variable en Railway

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_BUCKET // ← ej: "tu-proyecto.appspot.com"
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

// 🖼️ Descarga la foto de Telegram y la sube a Firebase Storage
async function uploadPhotoFromTelegram(photo) {
  // Telegram manda un array de tamaños, el último es el mayor
  const fileId = photo[photo.length - 1].file_id;

  // 1. Pedirle a Telegram la URL de descarga
  const fileRes = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`
  );
  const fileData = await fileRes.json();
  const filePath = fileData.result.file_path;
  const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;

  // 2. Descargar la imagen
  const imageRes = await fetch(downloadUrl);
  const buffer = await imageRes.buffer();

  // 3. Subirla a Firebase Storage
  const fileName = `news/${Date.now()}.jpg`;
  const file = bucket.file(fileName);
  await file.save(buffer, { contentType: "image/jpeg" });

  // 4. Obtener URL pública
  await file.makePublic();
  return `https://storage.googleapis.com/${bucket.name}/${fileName}`;
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
      imageUrl: null
    };

    // ⬇️ Si tiene foto, descargarla y subirla
    if (msg.photo) {
      data.imageUrl = await uploadPhotoFromTelegram(msg.photo);
      console.log("📸 Imagen subida:", data.imageUrl);
    }

    await db.collection("news").add(data);
    console.log("✅ Saved to Firestore");
    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error:", error);
    res.sendStatus(500);
  }
});

app.get("/", (req, res) => res.send("Webhook running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔥 Server running on port ${PORT}`));
