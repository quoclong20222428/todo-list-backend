# To-Do App Backend

Tài liệu này mô tả dịch vụ API cho ứng dụng To-Do. Backend được viết bằng Node.js/Express, xác thực bằng Clerk và lưu dữ liệu trên MongoDB. Mã nguồn đã được chuẩn hóa để triển khai dạng serverless trên Vercel nhưng vẫn có thể chạy cục bộ.

## Mục lục

- Giới thiệu tổng quan
- Tính năng chính
- Công nghệ sử dụng
- Cấu trúc thư mục
- Biến môi trường
- Hướng dẫn chạy cục bộ
- Tài liệu API
- Ghi chú phát triển
- Triển khai sản phẩm
- Dự án liên quan

## Giới thiệu tổng quan

Backend chịu trách nhiệm kiểm tra quyền truy cập với Clerk, xử lý logic nghiệp vụ cho tác vụ và trả về số liệu thống kê phục vụ giao diện React. Dự án sử dụng cú pháp ES Module và yêu cầu Node.js 18 trở lên.

## Tính năng chính

- Kiểm tra đăng nhập trên mọi tuyến `/api/tasks` bằng `requireAuth()` từ Clerk.
- Trả về danh sách tác vụ kèm số lượng theo trạng thái (pending, inprogress, completed).
- Bộ lọc thời gian linh hoạt: hôm nay, tuần này, tháng này hoặc toàn bộ lịch sử.
- CRUD bảo toàn quyền sở hữu: chỉ thao tác trên tác vụ của người dùng hiện tại.
- Cấu hình CORS dựa trên biến môi trường `FRONTEND_URL`.
- Điểm vào xuất khẩu `app` tương thích với Vercel serverless.

## Công nghệ sử dụng

- Node.js 18+
- Express 5
- MongoDB/Mongoose 8
- Clerk Express SDK
- Vercel (serverless)

## Cấu trúc thư mục

```
src/
  config/db.js          // Kết nối MongoDB
  controllers/tasksController.js  // Xử lý CRUD và thống kê
  middleware/clerkAuth.js         // Middleware hỗ trợ Clerk (tuỳ chọn)
  models/tasksModel.js            // Định nghĩa schema Task
  routes/tasksRouter.js           // Định tuyến API
  server.js                       // Khai báo Express app
vercel.json                       // Cấu hình build và route cho Vercel
```

## Biến môi trường

Tạo file `.env` trong thư mục gốc backend với các khóa sau:

| Tên biến | Bắt buộc | Mô tả |
| --- | --- | --- |
| `DB_URL` | Có | Chuỗi kết nối MongoDB cho Mongoose. |
| `CLERK_SECRET_KEY` | Có | Secret key do Clerk cấp để xác thực phía server. |
| `CLERK_PUBLISHABLE_KEY` | Có | Publishable key cung cấp cho frontend khởi tạo Clerk. |
| `FRONTEND_URL` | Có | URL frontend được phép gọi API (ví dụ `http://localhost:5173`). |
| `PORT` | Không | Dùng khi tự bootstrap server cục bộ, mặc định `3000`. |

>Lưu ý: Mã nguồn sử dụng `DB_URL`, không phải `MONGO_URI` như tài liệu cũ.

## Hướng dẫn chạy cục bộ

1. Cài đặt phụ thuộc:
   ```powershell
   cd todo-list-backend
   npm install
   ```
2. Khai báo biến môi trường theo bảng trên.
3. Chọn phương án chạy phù hợp:
   - **Giả lập Vercel (khuyến nghị)**
     ```powershell
     npx vercel dev
     ```
     Dịch vụ lắng nghe tại `http://localhost:3000`.
   - **Bootstrap thủ công**
     Tạo file `local-server.mjs` với nội dung:
     ```javascript
     import app from "./src/server.js";

     const port = process.env.PORT || 3000;
     app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
     ```
     Sau đó chạy `node local-server.mjs`.

Frontend cần trỏ `VITE_API_BASE_URL` tới URL của backend.

## Tài liệu API

Tất cả endpoint yêu cầu header `Authorization: Bearer <token>` từ Clerk.

| Phương thức | Endpoint | Tham số | Mô tả |
| --- | --- | --- | --- |
| `GET` | `/api/tasks` | `filter` = `today` \| `this_week` \| `this_month` \| `all_time` | Lấy danh sách tác vụ và thống kê theo trạng thái. |
| `POST` | `/api/tasks` | Body JSON: `title`, `description` | Tạo tác vụ mới. |
| `PUT` | `/api/tasks/:id` | Body JSON (partial): `title`, `description`, `status` | Cập nhật tác vụ, tự động ghi `completedAt` khi `status = completed`. |
| `DELETE` | `/api/tasks/:id` | Không | Xóa tác vụ thuộc về người dùng hiện tại. |

Phản hồi lỗi có dạng `{ "message": "..." }` với mã `401`, `404`, `400` hoặc `500` tùy trường hợp.

## Ghi chú phát triển

- Dự án dùng ES Module, sử dụng cú pháp `import`/`export`.
- Hàm kết nối Mongo gọi `process.exit(1)` nếu thất bại để tránh chạy API khi chưa có database.
- Middleware Clerk gắn thông tin người dùng vào `req.auth` để controller sử dụng `req.auth.userId`.
- Có thể viết script seed dữ liệu trực tiếp với model `Task` trong `src/models/tasksModel.js`.

## Triển khai sản phẩm

- Dùng file `vercel.json` kèm repo để triển khai nhanh qua Vercel CLI:
  ```powershell
  npx vercel --prod
  ```
- Đừng quên cấu hình biến môi trường `DB_URL`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `FRONTEND_URL` trên dashboard của Vercel.

## Dự án liên quan

- Frontend: [../todo-list-frontend/README.md](../todo-list-frontend/README.md)
- Tài liệu tiếng Anh: [README.md](README.md)
