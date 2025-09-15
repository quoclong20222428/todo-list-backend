# To-Do App – FullStack Project

## 💻 Project Introduction

A modern, full-stack To-Do List web application built to help users manage tasks efficiently with a sleek interface and secure authentication.

![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black&style=flat-square)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white&style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white&style=flat-square)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black&style=flat-square)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white&style=flat-square)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white&style=flat-square)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white&style=flat-square)
![Clerk](https://img.shields.io/badge/Clerk-6B33A8?logo=clerk&logoColor=white&style=flat-square)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white&style=flat-square)

### Overview
This project is a To-Do List web application designed to streamline task management. It features a modern frontend built with **React Vite** and **TypeScript**, paired with a **Node.js Express** backend written in **JavaScript**. The backend handles RESTful APIs, CRUD operations, and database management with **MongoDB**.  

For authentication, the app integrates **Clerk**, allowing secure signup, login, logout, and user profile management. On the frontend, **Tailwind CSS** provides a clean and responsive UI design.


![Main Screen Preview](./src/img/img1.png)

### Key Features
- **Authentication**: Register, log in, log out, and update profiles using Clerk.
- **CRUD Operations**: Create, read, update, and delete tasks seamlessly.
- **Task Display**: View tasks with titles, descriptions, creation dates, and completion dates.
- **Time Filters**: Filter tasks by today, this week, this month, or all time.
- **Pagination**: Navigate through tasks with pagination controls.
- **Task Status**: Filter tasks by pending, in-progress, or completed statuses, with respective counts.

### Unique Features
- **Motivational Footer**: Dynamically updates with encouraging messages based on the number of completed tasks.
- **Time-Based Filters & Pagination**: Enhances user experience by allowing flexible task filtering and smooth navigation.
- **Clerk Integration**: Provides secure and seamless user authentication.

### Technology Stack
- **Frontend**: React Vite with TypeScript for a robust, type-safe development environment.
- **Backend**: Node.js with Express.js for efficient API request handling and task management.
- **Authentication**: Clerk for secure user authentication and profile management.
- **Styling**: Tailwind CSS for responsive, modern, and customizable design.
- **Database**: MongoDB for storing task data.

### Service Architecture
The app follows a **client-server architecture**:
- The **frontend** communicates with the backend via **RESTful APIs**.
- The **backend** uses **MongoDB** to store task data with a schema including:
  - `userId`: Links tasks to specific users.
  - `title`: Task title.
  - `description`: Task details.
  - `status`: Pending, in-progress, or completed.
  - `createdAt`: Task creation date.
  - `completedAt`: Task completion date (if applicable).
- **Deployment**:
  - Frontend: Hosted on **Vercel**.
  - Backend: Deployed on a separate Node.js server.

---

## 🚀 Usage Instructions

### For Demo Users
1. **Access the App**: Visit the deployed application at [https://todo-list-frontend-iota-eight.vercel.app/](https://todo-list-frontend-iota-eight.vercel.app/).
2. **Sign Up/Log In**: Use the Clerk authentication system to create an account or log in.
3. **Manage Tasks**:
   - Add new tasks with a title and description.
   - Update or delete existing tasks.
   - Filter tasks by time (today, this week, this month, or all) or by status (pending, in-progress, completed).
   - Navigate through tasks using pagination controls.
4. **Enjoy Motivation**: Check the footer for encouraging messages based on your completed tasks!

### For Developers
To set up and run the project locally, follow these steps:

1. **Clone the Repositories**:
   ```bash
   git clone https://github.com/quoclong20222428/todo-list-frontend.git
   git clone https://github.com/quoclong20222428/todo-list-backend.git
   ```

2. **Install Dependencies**:
   - Navigate to the `todo-list-frontend` folder and run:
     ```bash
     cd todo-list-frontend
     npm install
     ```
   - Navigate to the `todo-list-backend` folder and run:
     ```bash
     cd todo-list-backend
     npm install
     ```

3. **Set Up Environment Variables**:
   - **Backend**:
     - Create a `.env` file in the `todo-list-backend` folder.
     - Add the following configurations:
       ```
       MONGO_URI=<Your MongoDB connection string>
       CLERK_SECRET_KEY=<Your Clerk secret key>
       CLERK_PUBLISHABLE_KEY=<Your Clerk publishable key>
       FRONTEND_URL=http://localhost:5173
       ```
   - **Frontend**:
     - Create a `.env` file in the `todo-list-frontend` folder.
     - Add the following configurations:
       ```
       VITE_API_BASE=<Your backend API URL, e.g., http://localhost:3000>
       VITE_CLERK_PUBLISHABLE_KEY=<Your Clerk publishable key>
       ```

4. **Run the Backend**:
   - In the `todo-list-backend` folder, run:
     ```bash
     npm run dev
     ```

5. **Run the Frontend**:
   - In the `todo-list-frontend` folder, run:
     ```bash
     npm run dev
     ```

6. **Access the Application**:
   - Open your browser and navigate to [http://localhost:5173](http://localhost:5173).

---

## 📝 Notes
- Ensure your MongoDB instance is running and accessible for the backend to connect.
- Clerk keys can be obtained by creating a project in the [Clerk Dashboard](https://clerk.dev/).
- For production deployment, update the `.env` files with the appropriate URLs for your backend and frontend.