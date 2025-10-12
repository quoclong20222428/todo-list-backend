# To-Do App Backend

This folder contains the serverless-ready Express API that powers the To-Do App. It exposes authenticated CRUD endpoints for task management, persists data in MongoDB, and is designed to deploy on Vercel or any Node.js runtime.

The matching frontend lives in `../todo-list-frontend`.

![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white&style=flat-square)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white&style=flat-square)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white&style=flat-square)
![Clerk](https://img.shields.io/badge/Clerk-6B33A8?logo=clerk&logoColor=white&style=flat-square)
![Vercel](https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white&style=flat-square)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black&style=flat-square)

## Table of contents

- Overview
- Features
- Tech stack
- Project structure
- Environment variables
- Getting started
- API reference
- Development notes
- Deployment
- Related projects

## Overview

The backend is a thin Express service that verifies requests with Clerk, applies task-specific business rules, and returns pre-aggregated statistics required by the React client (counts per status alongside task listings). The codebase is written with native ES modules and targets Node 18+.

## Features

- Clerk-based authentication guard on every `/api/tasks` route via `requireAuth()`.
- Aggregated task responses that include status counters alongside the task list.
- Granular time filtering (today, this week, this month, all time) implemented with MongoDB aggregation.
- RESTful CRUD endpoints with ownership enforcement (`userId` matched to the authenticated user).
- CORS configuration that scopes access to the configured frontend origin.
- Serverless-friendly entry point that can be exported to Vercel while still runnable locally.

## Tech stack

- Node.js 18+
- Express 5
- MongoDB with Mongoose 8
- Clerk Express SDK
- Vercel serverless adapter (via default export)

## Project structure

```
src/
  config/
    db.js           // MongoDB connection helper
  controllers/
    tasksController.js  // Aggregation and CRUD handlers
  middleware/
    clerkAuth.js    // Optional Clerk middleware wrapper
  models/
    tasksModel.js   // Task schema definition
  routes/
    tasksRouter.js  // Task-related routes
  server.js         // Express app definition exported for Vercel
vercel.json         // Vercel build and routing configuration
```

## Environment variables

Create a `.env` file at the repository root with the following keys:

| Name | Required | Description |
| --- | --- | --- |
| `DB_URL` | Yes | MongoDB connection string used by Mongoose. |
| `CLERK_SECRET_KEY` | Yes | Backend secret issued by Clerk for server-side token verification. |
| `CLERK_PUBLISHABLE_KEY` | Yes | Publishable key shared with the frontend to initialise Clerk. |
| `FRONTEND_URL` | Yes | Allowed CORS origin, e.g. `http://localhost:5173` for local development. |
| `PORT` | Optional | Only needed if you provide a custom local bootstrap (defaults to `3000`). |

> The previous version of this README referenced `MONGO_URI`; the code uses `DB_URL`. Update existing `.env` files accordingly.

## Getting started

1. Install dependencies:
   ```powershell
   cd todo-list-backend
   npm install
   ```
2. Configure Clerk and MongoDB credentials in `.env` as shown above.
3. Choose one of the local run modes:
   - **Vercel emulation (recommended)**
     ```powershell
     npx vercel dev
     ```
     The CLI watches source changes and exposes the server at `http://localhost:3000` by default.
   - **Custom bootstrap**: if you prefer running plain Node.js, create a tiny launcher (for example `local-server.mjs`) with
     ```javascript
     import app from "./src/server.js";

     const port = process.env.PORT || 3000;
     app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
     ```
     and start it with `node local-server.mjs`.

When the backend is running, the frontend can target it via `VITE_API_BASE_URL`.

## API reference

All routes live under `/api/tasks` and require a valid Clerk session (Bearer token in the `Authorization` header).

| Method | Endpoint | Query/body parameters | Description |
| --- | --- | --- | --- |
| `GET` | `/api/tasks` | `filter` query: `today` \| `this_week` \| `this_month` \| `all_time` (default) | Returns the authenticated user's tasks and status counters. |
| `POST` | `/api/tasks` | JSON body: `title`, `description` | Creates a new task for the current user. |
| `PUT` | `/api/tasks/:id` | JSON body (partial): `title`, `description`, `status` (`pending` \| `inprogress` \| `completed`) | Updates an existing task and stamps `completedAt` when status changes to `completed`. |
| `DELETE` | `/api/tasks/:id` | none | Deletes a task owned by the current user. |

Sample success payload for `GET /api/tasks`:

```json
{
  "tasks": [
    {
      "_id": "6732c...",
      "title": "Finish documentation",
      "description": "Update README files",
      "status": "inprogress",
      "userId": "user_123",
      "createdAt": "2025-10-10T09:12:34.123Z",
      "updatedAt": "2025-10-11T08:00:00.000Z",
      "completedAt": null
    }
  ],
  "pendingCount": 2,
  "inProgressCount": 1,
  "completedCount": 4
}
```

Errors are returned as JSON `{ "message": string }` with appropriate HTTP codes (`401`, `404`, `400`, `500`).

## Development notes

- All source files are ES modules (`type: module` in `package.json`). Use `import`/`export` syntax throughout.
- The Mongo connection helper calls `process.exit(1)` on failure to avoid running the API without a database.
- If you need to seed data, interact with the `Task` model in `src/models/tasksModel.js`.
- `requireAuth()` injects the Clerk user context on `req.auth`; controllers rely on `req.auth.userId` when filtering documents.

## Deployment

The repository includes `vercel.json`. Deploy by connecting the project in the Vercel dashboard or via CLI:

```powershell
npx vercel --prod
```

Ensure the production environment variables (`DB_URL`, Clerk keys, `FRONTEND_URL`) are configured in Vercel before promoting.

## Related projects

- Frontend: [todo-list-frontend](../todo-list-frontend/README.md)
- Vietnamese docs: [README.vi.md](README.vi.md)