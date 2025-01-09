import connectionPool from "../../utils/db.js";
import supabase from "../../utils/supabaseClient.js";

// Emit new notifications when triggered
const emitNotification = async (io, userId, userSocketMap) => {
  const socketId = userSocketMap.get(userId);

  if (socketId) {
    try {
      const query = `
          SELECT
              notification_matching.is_read,
              notification_matching.user_master_id,
              notification_matching.user_other_id,
              user_profiles.name, user_profiles.image_profile[1],
              notification_matching.created_at
          FROM notification_matching
          LEFT JOIN user_profiles
          ON notification_matching.user_other_id = user_profiles.user_id
          WHERE user_master_id = $1
          ORDER BY notification_matching.created_at DESC
        `;
      const result = await connectionPool.query(query, [userId]);

      console.log("NotifServer:", result.rows);
      io.to(socketId).emit("newNotifications", result.rows);
    } catch (error) {
      console.error("Error emitting notifications:", error);
    }
  }
};

export const handleNotificationSocket = (io, socket, userSocketMap) => {
  // Realtime listener for new notifications from Supabase
  supabase
    .channel("realtime:notification_matching")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notification_matching" },
      async (payload) => {
        console.log("(Supabase) New notification detected:", payload.new);

        const { new: newNotification } = payload;
        const userId = newNotification.user_master_id;

        // Trigger emitNotification for the affected user
        await emitNotification(io, userId, userSocketMap);
      }
    )
    .subscribe();

  // Handle notifications
  socket.on("fetchNotifications", async (userId) => {
    try {
      const query = `
        SELECT
            notification_matching.is_read,
            notification_matching.user_master_id,
            notification_matching.user_other_id,
            user_profiles.name, user_profiles.image_profile[1],
            notification_matching.created_at
        FROM notification_matching
        LEFT JOIN user_profiles
        ON notification_matching.user_other_id = user_profiles.user_id
        WHERE user_master_id = $1
        ORDER BY notification_matching.created_at DESC
      `;
      const result = await connectionPool.query(query, [userId]);
      socket.emit("newNotifications", result.rows);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  });

  // Mark notifications as read
  socket.on("markNotificationsAsRead", async (userId) => {
    try {
      console.log(`markNotificationsAsRead Trigger for user: ${userId}`);

      const query = `
        UPDATE notification_matching
        SET is_read = TRUE
        WHERE user_master_id = $1 AND is_read = FALSE;
      `;
      await connectionPool.query(query, [userId]);

      console.log(`Notifications marked as read for user: ${userId}`);
    } catch (error) {
      console.error("Error marking notifications as read:", error);
    }
  });
};
