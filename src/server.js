import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import taskRouters from "./routes/tasksRouter.js"
import cors from "cors"
import { requireAuth } from "@clerk/express";

dotenv.config();

const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.send("API is running...");
});

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cors({origin: FRONTEND_URL}));

app.use("/api/tasks", requireAuth(), taskRouters);

app.listen(PORT, () => {
  connectDB();
  console.log(`Server is running on ${PORT}`);
});
