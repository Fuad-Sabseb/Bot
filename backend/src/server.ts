import { createApp } from "./app";
import { env } from "./config/env";
import { initTelegramBot } from "./modules/telegram/bot";
import { ReminderService } from "./services/reminder.service";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`✅ Campus Super App Backend running on http://localhost:${env.PORT}`);
  console.log(`📡 Environment: ${env.NODE_ENV} | API Version: ${env.API_PREFIX}`);

  // Initialize Telegram Bot service if configured
  initTelegramBot();

  // Start background deadline reminder worker (runs every 60s)
  ReminderService.startBackgroundReminderWorker(60000);
});

// Graceful Shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  ReminderService.stopBackgroundReminderWorker();
  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received. Shutting down gracefully...");
  ReminderService.stopBackgroundReminderWorker();
  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
});

export default server;
