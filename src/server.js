import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import taskRouters from "./routes/tasksRouter.js";
import { connectDB } from "./config/db.js";
// import { requireAuth } from "@clerk/express"; // tạm bỏ để test

dotenv.config();

const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

app.use(express.json());
app.use(cors({ origin: FRONTEND_URL }));

app.get("/", (req, res) => {
  res.send("API is running...");
});

app.use("/api/tasks", requireAuth(), taskRouters);
// app.use("/api/tasks", taskRouters);

connectDB().catch(err => console.error("DB error:", err));

export default app;   // 👈 export app trực tiếp, không serverless()
