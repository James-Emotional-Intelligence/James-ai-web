# Hướng Dẫn Triển Khai JAMI AI (Cloudflare Frontend + Node.js Backend)

Tài liệu này cung cấp hướng dẫn toàn diện để triển khai ứng dụng JAMI AI với kiến trúc Hybrid: **Cloudflare Worker / Pages (Frontend & Static Assets & Cron Dispatcher)** và **Node.js Express + Persistent Disk Storage (Backend Server & AI Processor)**.

---

## 1. Kiến Trúc Triển Khai Tổng Quan

```
+-------------------------------------------------------------------------+
| Trình Duyệt Người Dùng (Web Browser)                                    |
+-------------------------------------------------------------------------+
       |                                          |
       | (1) Tải giao diện SPA & Assets           | (2) Gọi API /api/v1/*
       v                                          v
+------------------------------------+     +-------------------------------+
| Cloudflare Workers / Pages Assets  |     | Cloudflare Worker             |
| (Vite 6, React 19, Tailwind CSS 4) |     | (Reverse-Proxy API & Cron)    |
| - Giới hạn tệp: < 25 MiB/tệp       |     | - Route: /api/v1/*            |
| - SPA fallback: /index.html        |     | - Biến: BACKEND_API_ORIGIN    |
+------------------------------------+     +-------------------------------+
                                                          |
                                                          | Reverse-Proxy (Streaming HTTP/1.1 & HTTP/2)
                                                          v
                                           +-------------------------------+
                                           | Node.js Express Backend       |
                                           | (Render, VPS, Docker, Fly.io) |
                                           | - Driver: STORAGE_DRIVER=local|
                                           | - Thư mục: /data/jami/storage |
                                           +-------------------------------+
                                             |              |
                                             v              v
                                  +------------------+  +------------------+
                                  | Persistent Disk  |  | MySQL / Aiven DB |
                                  | (SSD Mount)      |  +------------------+
                                  +------------------+
```

---

## 2. Quy Định Lưu Trữ Tệp (Local Storage Driver)

1. **Backend Node.js Quản Lý Lưu Trữ**:
   - `STORAGE_DRIVER=local` (mặc định và khuyến nghị).
   - `LOCAL_STORAGE_ROOT=/data/jami/storage` (khi triển khai VPS/Docker) hoặc `./storage` (khi chạy local).
   - Tuyệt đối **không chạy `multer` hoặc lưu tệp cục bộ trên Cloudflare Worker** (Cloudflare Worker là môi trường V8 Isolate không có ổ đĩa cục bộ).
   - Toàn bộ tệp PDF, Sách mềm, Ảnh bìa, Kết quả OCR và Âm thanh lưu trữ an toàn trong ổ đĩa gắn kèm (Persistent Volume) của máy chủ Node.js.

2. **Giới Hạn Dung Lượng Tĩnh (Static Assets)**:
   - Cloudflare Pages / Workers quy định kích thước tệp tĩnh tối đa **25 MiB**.
   - Các hình ảnh động lớn được nén thành video MP4/WebM tối ưu (< 10 MiB) kèm WebP poster để đảm bảo không bị Cloudflare từ chối khi triển khai.
   - Kiểm tra dung lượng tài nguyên trước khi deploy:
     ```bash
     npm run build:cloudflare
     ```

---

## 3. Các Biến Môi Trường Cần Thiết

### A. Cấu Hình Trên Cloudflare Worker / Dashboard

| Tên Biến | Bắt Buộc | Ví Dụ | Giải Thích |
| :--- | :---: | :--- | :--- |
| `BACKEND_API_ORIGIN` | **Có** | `https://api.jami.vn` | URL gốc của máy chủ backend Node.js để Worker reverse-proxy `/api/v1/*`. |
| `INTERNAL_CRON_SECRET` | **Có** | `chuoi-bi-mat-cron-ngau-nhien-32-ky-tu` | Mã bí mật để Cloudflare Cron kích hoạt lịch thông báo học tập. |

### B. Cấu Hình Trên Backend Node.js Server (`.env`)

| Tên Biến | Mặc Định | Ví Dụ | Giải Thích |
| :--- | :---: | :--- | :--- |
| `PORT` | `3000` | `3000` | Cổng HTTP lắng nghe |
| `NODE_ENV` | `production` | `production` | Môi trường chạy |
| `STORAGE_DRIVER` | `local` | `local` | Trình điều khiển lưu trữ (`local` hoặc `r2`) |
| `LOCAL_STORAGE_ROOT` | `./storage` | `/data/jami/storage` | Đường dẫn thư mục lưu tệp trên ổ đĩa bền vững |
| `LOCAL_STORAGE_QUOTA_MB_PER_USER` | `1000` | `1000` | Dung lượng tối đa cho mỗi học sinh (1 GB) |
| `BOOK_STORAGE_QUOTA_MB` | `1000` | `1000` | Hạn mức riêng cho Sách mềm |
| `DATABASE_URL` | - | `mysql://user:pass@host:3306/db?ssl-mode=REQUIRED` | Chuỗi kết nối MySQL / Aiven |
| `OPENAI_API_KEY` | - | `sk-proj-...` | Khóa API OpenAI cho trợ lý Jami & OCR |
| `CORS_ALLOWED_ORIGINS` | - | `https://jami.vn,https://jami.pages.dev` | Danh sách domain frontend được phép gọi có Cookie |
| `INTERNAL_CRON_SECRET` | - | `chuoi-bi-mat-cron-ngau-nhien-32-ky-tu` | Khớp với biến trên Cloudflare |

---

## 4. Các Lệnh Build & Deploy

### A. Triển Khai Frontend Lên Cloudflare

```bash
# 1. Build client và kiểm tra dung lượng tài nguyên (< 25 MiB)
npm run build:cloudflare

# 2. Deploy lên Cloudflare Workers / Pages
npm run deploy:cloudflare
```

### B. Triển Khai Backend Node.js

```bash
# 1. Cài đặt dependencies
npm install --omit=dev

# 2. Chạy migration cơ sở dữ liệu
npm run db:migrate

# 3. Build máy chủ
npm run build:server

# 4. Khởi chạy máy chủ sản xuất
npm start
```

---

## 5. Kiểm Tra Tình Trạng Hoạt Động (Health Checks)

- **Kiểm tra phiên bản & Storage Driver**:
  ```bash
  curl -i https://your-domain.com/api/v1/meta/version
  ```
- **Kiểm tra sẵn sàng cơ sở dữ liệu & ổ đĩa**:
  ```bash
  curl -i https://your-domain.com/api/v1/health/ready
  ```
- **Kiểm tra route tải Sách mềm (Unauthenticated -> 401)**:
  ```bash
  curl -i -X POST https://your-domain.com/api/v1/materials/books/upload
  ```
  *(Kết quả trả về HTTP 401 UNAUTHORIZED chứng minh route upload tồn tại và hoạt động chính xác).*
