import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import taskRouters from "./routes/tasksRouter.js";
import healthRouter from "./routes/health.js";
import { connectDB } from "./config/db.js";
import { requireAuth } from "@clerk/express";

dotenv.config();

const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

app.use(express.json());
app.use(cors({ origin: FRONTEND_URL }));

// Ensure MongoDB is connected before handling any request.
app.use(async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    next(err);
  }
});

app.get("/", (req, res) => {
  res.send("API is running...");
});

app.use("/health", healthRouter);
app.use("/api/tasks", requireAuth(), taskRouters);

if (!process.env.VERCEL) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`API listening on port ${port}`);
  });
}

export default app;
