# JAMI AI Deployment Architecture (Cloudflare & Aiven MySQL)

Tài liệu quy định kiến trúc vận hành Production của dự án JAMI AI.

---

## 1. Mẫu Kiến Trúc Sản Phẩm Lựa Chọn

Dự án JAMI AI sử dụng kiến trúc **Cloudflare Workers Edge + Cloudflare Hyperdrive + Aiven MySQL**:

```
[Trình Duyệt Người Dùng] 
       │
       ▼
[Cloudflare Edge Worker / Static Assets]
       │
       ├────► GET /* (Static SPA Bundle: React + Tailwind + Vite)
       │
       └────► ALL /api/v1/* (Router API Worker / Origin Reverse Proxy)
                  │
                  ├──► [Aiven MySQL Database] (Via Cloudflare Hyperdrive TLS)
                  │      ├─ users
                  │      ├─ auth_sessions
                  │      ├─ student_profiles
                  │      ├─ study_tasks / timetables / exams
                  │      └─ jami_conversations / jami_messages
                  │
                  └──► [OpenAI API] (Server-Side Key Secrets Only)
```

---

## 2. Quy Định Cấu Hình Môi Trường (Secrets & Bindings)

### Client Side (Vite Build)
- `VITE_API_BASE_URL`: URL public của API server/worker (Ví dụ: `https://jami.ai/api/v1` hoặc `/api/v1` nếu cùng origin). Không đặt bất kỳ Secret nào vào biến `VITE_*`.

### Server / Worker Side Secrets
- `NODE_ENV`: `production` hoặc `development`
- `APP_MODE`: `production` hoặc `demo`
- `PORT`: Cổng dịch vụ Node.js (Mặc định: 3000)
- `SESSION_SECRET`: Chuỗi ngẫu nhiên tối thiểu 32 ký tự dùng tạo HMAC hash token session & cookie.
- `ADMIN_SECRET_KEY`: Khóa bảo mật riêng biệt cho các tác vụ quản trị DB/migration.
- `COOKIE_SECURE`: `true` trên HTTPS Production, `false` trên HTTP Localhost.
- `COOKIE_SAME_SITE`: `lax` (Cùng origin) hoặc `none` (Cross-origin HTTPS).
- `AIVEN_MYSQL_HOST`, `AIVEN_MYSQL_PORT`, `AIVEN_MYSQL_DATABASE`, `AIVEN_APP_USER`, `AIVEN_APP_PASSWORD`, `AIVEN_CA_CERT`: Thông tin kết nối Aiven MySQL qua TLS.
- `HYPERDRIVE_BINDING`: Cloudflare Hyperdrive connection binding.
- `OPENAI_API_KEY`, `OPENAI_MODEL`: Khóa API và model AI dùng phía server.
- `DEMO_LOGIN_ENABLED`: `false` trên Production.

---

## 3. Cơ Chế Xử Lý Session & Cookies

- Token gốc chỉ lưu trong Cookie `HttpOnly`.
- Cơ sở dữ liệu MySQL `auth_sessions` chỉ lưu `token_hash = HMAC-SHA256(rawToken, SESSION_SECRET)`.
- Khi người dùng `Logout`, hệ thống lập tức ghi nhận `revoked_at = NOW(3)` và xóa cookie phía client.
- `/api/v1/health/ready` thực thi query `SELECT 1` và kiểm tra bảng `auth_sessions` trên MySQL thật; nếu DB lỗi sẽ trả `503 Service Unavailable`.
