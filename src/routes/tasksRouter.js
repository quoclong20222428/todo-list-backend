import express from "express";
import { createTask, deleteTask, getAllTasks, updateTask } from "../controllers/tasksController.js";

const router = express.Router();

// Get all tasks
router.get("/", getAllTasks);

// Create a new task
  router.post("/", createTask);


// Update a task (mark as completed or update description)
router.put("/:id", updateTask);

// Delete a task
router.delete("/:id", deleteTask);

export default router;