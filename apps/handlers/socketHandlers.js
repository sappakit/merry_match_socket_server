import { Timestamp } from "firebase-admin/firestore";
import { db, adminSdk } from "../../utils/adminFirebase.js";

const userSocketMap = new Map();

export const handleSocketConnection = (io) => {
  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // Map to store user_id -> socket.id mapping
    socket.on("registerUser", (userId) => {
      console.log("server", userId);
      if (userId) {
        userSocketMap.set(userId, socket.id);
        console.log(`User ${userId} is registered with socket ${socket.id}`);
      }
    });

    // Join room event
    socket.on("joinRoom", (chatRoomId) => {
      socket.join(chatRoomId);
      console.log(`User ${socket.id} joined room ${chatRoomId}`);
    });

    // Send message event
    socket.on(
      "sendMessage",
      async ({ chatRoomId, inputMessage, imageUrls, userId, messageType }) => {
        if (
          !chatRoomId ||
          (!inputMessage && imageUrls.length === 0) ||
          !userId ||
          messageType.length === 0
        ) {
          console.error("Invalid data for sending message:", {
            chatRoomId,
            inputMessage,
            imageUrls,
            userId,
            messageType,
          });
          return;
        }

        const payload = {
          message_id: db.collection("dummy").doc().id,
          sender_id: userId,
          type: messageType,
          content: inputMessage || null,
          image_urls: imageUrls || [],
          timestamp: Timestamp.now(),
        };

        try {
          const chatRoomRef = db.collection("chat_rooms").doc(chatRoomId);
          await chatRoomRef.update({
            messages: adminSdk.firestore.FieldValue.arrayUnion(payload),
          });

          io.to(chatRoomId).emit("receiveMessage", payload);
        } catch (error) {
          console.error("Error updating messages array:", error);
        }
      }
    );

    // Disconnect event
    socket.on("disconnect", () => {
      console.log("A user disconnected:", socket.id);
      userSocketMap.forEach((value, key) => {
        if (value === socket.id) {
          userSocketMap.delete(key);
        }
      });
    });
  });
};
