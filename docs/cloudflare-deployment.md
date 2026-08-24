# JAMI AI — Hướng Dẫn Triển Khai Cloudflare Workers & Aiven MySQL

## 1. Các Bước Triển Khai
1. **Xuất Mã Nguồn**: Tải file ZIP hoặc đồng bộ Repository sang GitHub.
2. **Xoay Vòng Thông Tin Bí Mật (Rotate Secrets)**:
   - Đổi mật khẩu/credential cơ sở dữ liệu Aiven.
   - Tạo App User riêng biệt với quyền tối thiểu (SELECT, INSERT, UPDATE, DELETE).
3. **Cấu Hình Cloudflare Hyperdrive**:
   ```bash
   npx wrangler hyperdrive create jami-mysql --connection-string="mysql://user:pass@host:port/database"
   ```
4. **Cấu Hình Cloudflare R2**:
   ```bash
   npx wrangler r2 bucket create jami-materials
   ```
5. **Thiết Lập Bí Mật trên Cloudflare Secrets**:
   ```bash
   npx wrangler secret put OPENAI_API_KEY
   npx wrangler secret put JWT_SIGNING_SECRET
   npx wrangler secret put AIVEN_APP_PASSWORD
   ```
6. **Chạy Migration Database**:
   - Sử dụng file `server/db/schema.sql` để khởi tạo các bảng trên Aiven MySQL.
7. **Deploy Staging / Production**:
   ```bash
   npm run build
   npx wrangler deploy
   ```
