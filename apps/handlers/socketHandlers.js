import { Timestamp } from "firebase-admin/firestore";
import { db, adminSdk } from "../../utils/adminFirebase.js";

export const handleSocketConnection = (io, socket) => {
  // Join room event
  socket.on("joinRoom", (chatRoomId) => {
    socket.join(chatRoomId);
    console.log(`User ${socket.id} joined room ${chatRoomId}`);
  });

  // Leave room event
  socket.on("leaveRoom", (chatRoomId) => {
    socket.leave(chatRoomId);
    console.log(`User ${socket.id} left room ${chatRoomId}`);
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
          lastMessage: payload,
        });

        io.to(chatRoomId).emit("receiveMessage", payload);
      } catch (error) {
        console.error("Error updating messages array:", error);
      }
    }
  );
};
