import Task from "../models/tasksModel.js";

export const getAllTasks = async (req, res) => {
  const { filter = "today" } = req.query;
  const now = new Date();
  let startDate;

  switch (filter) {
    case "today": {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // 2025-08-24 00:00
      break;
    }
    case "this_week": {
      const mondayDate =
        now.getDate() - (now.getDay() - 1) - (now.getDay() === 0 ? 7 : 0);
      startDate = new Date(now.getFullYear(), now.getMonth(), mondayDate);
      break;
    }
    case "this_month": {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    }
    case "all_time":
    default: {
      startDate = null;
    }
  }

  const query = startDate
    ? { userId: req.auth.userId, createdAt: { $gte: startDate } }
    : { userId: req.auth.userId };

  try {
    const result = await Task.aggregate([
      { $match: query },
      {
        $facet: {
          tasks: [{ $sort: { createdAt: -1 } }],
          pendingCount: [
            { $match: { ...query, status: "pending" } },
            { $count: "count" },
          ],
          inProgressCount: [
            { $match: { ...query, status: "inprogress" } },
            { $count: "count" },
          ],
          completedCount: [
            { $match: { ...query, status: "completed" } },
            { $count: "count" },
          ],
        },
      },
    ]);

    const tasks = result[0].tasks;
    const pendingCount =
      result[0].pendingCount.length > 0 ? result[0].pendingCount[0].count : 0;
    const inProgressCount =
      result[0].inProgressCount.length > 0
        ? result[0].inProgressCount[0].count
        : 0;
    const completedCount =
      result[0].completedCount.length > 0
        ? result[0].completedCount[0].count
        : 0;

    res
      .status(200)
      .json({ tasks, pendingCount, inProgressCount, completedCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
    console.error("Error at get all tasks function: ", error);
  }
};

export const createTask = async (req, res) => {
  const task = new Task({
    title: req.body.title,
    description: req.body.description,
    userId: req.auth.userId,
  });
  try {
    const newTask = await task.save();
    res.status(201).json(newTask);
  } catch (error) {
    res.status(400).json({ message: error.message });
    console.error("Error at create tasks function: ", error);
  }
};

export const updateTask = async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      userId: req.auth.userId,
    });
    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }
    if (req.body.title != undefined) {
      task.title = req.body.title;
    }
    if (req.body.description != undefined) {
      task.description = req.body.description;
    }
    if (req.body.status != undefined) {
      task.status = req.body.status;
    }
    if (req.body.status === "completed") {
      task.completedAt = new Date();
    }

    const updatedTask = await task.save();
    res.json(updatedTask);
  } catch (error) {
    res.status(400).json({ message: error.message });
    console.error("Error at update tasks function: ", error);
  }
};

export const deleteTask = async (req, res) => {
  try {
    await Task.findOneAndDelete({
      _id: req.params.id,
      userId: req.auth.userId,
    });
    res.json({ message: "Task deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
    console.error("Error at delete tasks function: ", error);
  }
};
