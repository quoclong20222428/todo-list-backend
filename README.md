# To-Do App – FullStack Project

## 🚀 Project Setup & Usage
**How to install and run your project:**  
- Clone the repository  
  - Frontend: [https://github.com/quoclong20222428/todo-list-frontend.git](https://github.com/quoclong20222428/todo-list-frontend.git)  
  - Backend: [https://github.com/quoclong20222428/todo-list-backend.git](https://github.com/quoclong20222428/todo-list-backend.git)  
- `npm install` for both **frontend** and **backend**  
- In the backend folder: create a `.env` file containing MongoDB configuration, Clerk keys (`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `FRONTEND_URL`)  
- Run backend: `npm run dev`  
- In the frontend folder: create a `.env` file containing `VITE_API_BASE` pointing to the backend and `VITE_CLERK_PUBLISHABLE_KEY` for Clerk keys
- Run frontend: `npm run dev`  
- Access the application at `http://localhost:5173`

## 🔗 Deployed Web URL
[https://todo-list-frontend-iota-eight.vercel.app/](https://todo-list-frontend-iota-eight.vercel.app/)


## 🎥 Demo Video
**Demo video link (≤ 2 minutes):**  
📌 **Video Upload Guideline:** when uploading your demo video to YouTube, please set the visibility to **Unlisted**.  
- “Unlisted” videos can only be viewed by users who have the link.  
- The video will not appear in search results or on your channel.  
- Share the link in your README so mentors can access it.  

- Link video: [https://youtu.be/z2NiwjrZwxs](https://youtu.be/z2NiwjrZwxs)


## 💻 Project Introduction

### a. Overview

This project is a To-Do List web application designed to help users manage their tasks efficiently. It features a modern interface built with React Vite and TypeScript for the frontend, and a Node.js Express backend. The app integrates Clerk for authentication, allowing users to sign up, log in, log out, and edit their profiles seamlessly.

### b. Key Features & Function Manual

- **Authentication:** Users can register, log in, log out, and update their profiles using Clerk.  
- **CRUD Operations:** Create, read, update, and delete tasks with ease.  
- **Task Display:** View tasks with titles, descriptions, creation dates, and completion dates.  
- **Time Filters:** Filter tasks by today, this week, this month, or all time.  
- **Pagination:** Navigate through tasks using pagination controls.  
- **Task Status:** Filter and view tasks by pending, in-progress, or completed statuses with respective counts.

### c. Unique Features (What’s special about this app?) 

The app stands out with its motivational footer that dynamically updates with encouraging messages based on the number of completed tasks. Additionally, the integration of Clerk for authentication and the use of time-based filters with pagination provide a unique and user-friendly experience.

### d. Technology Stack and Implementation Methods

- **Frontend:** React Vite with TypeScript for a robust and type-safe development environment.  
- **Backend:** Node.js with Express.js for handling API requests and task management.  
- **Authentication:** Clerk for secure user authentication and profile management.  
- **Styling:** Tailwind CSS for responsive and modern design.  

### e. Service Architecture & Database structure (when used)

The app follows a client-server architecture. The frontend communicates with the backend via RESTful APIs. The backend uses MongoDB to store task data, with a schema including fields like userId, title, description, status, createdAt, and completedAt. The service is deployed on Vercel for the frontend and a separate Node.js server for the backend.

## 🧠 Reflection

### a. If you had more time, what would you expand?

I would add task categorization or tags, implement notifications for upcoming deadlines, and enhance the UI with animations and a dark mode option to improve user experience.

### b. If you integrate AI APIs more for your app, what would you do?

I would integrate AI to suggest task priorities based on deadlines and user habits, provide smart task recommendations, and use natural language processing to allow voice input for creating tasks.

## ✅ Checklist
- [x] Code runs without errors  
- [x] All required features implemented (add/edit/delete/complete tasks)  
- [x] All ✍️ sections are filled