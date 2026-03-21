const data = {
  text: msg.text || msg.caption || "",
  type: msg.photo ? "photo" : msg.video ? "video" : "text",
  mediaUrl: uploadedUrl,
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
  chatId: msg.chat?.id || null,
  messageId: msg.message_id || null,
  telegramDate: msg.date ? new Date(msg.date * 1000) : null,
  source: "telegram",
};

