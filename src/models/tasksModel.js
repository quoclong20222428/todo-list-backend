import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "inprogress", "completed"],
      default: "pending",
    },
    userId: {
      type: String,
      required: true,
    },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true } // Automatically manage createdAt and updatedAt fields
);

const Task = mongoose.model("Task", taskSchema);

export default Task;
