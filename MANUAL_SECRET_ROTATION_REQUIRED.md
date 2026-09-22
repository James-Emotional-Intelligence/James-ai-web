# YÊU CẦU XOAY VÒNG KHÓA BẢO MẬT BẮT BUỘC (MANUAL SECRET ROTATION REQUIRED)

> **MỨC ĐỘ ƯU TIÊN: P0 — KHẨN CẤP TRƯỚC KHI TRIỂN KHAI PRODUCTION**

Do các bản lưu trữ mã nguồn thử nghiệm trước đây có thể từng chứa tệp cấu hình môi trường, toàn bộ các khóa bí mật (secrets) và chứng chỉ kết nối phải được **xoay vòng (rotate)** ngay lập tức trước khi đưa hệ thống lên máy chủ chính thức.

Tuyệt đối **không** sử dụng lại bất kỳ mật khẩu hoặc khóa bí mật cũ nào đã từng xuất hiện trong môi trường phát triển cục bộ.

---

## 1. Danh sách các khóa bí mật bắt buộc phải xoay vòng

| Dịch vụ / Khóa bí mật | Tên biến môi trường | Hướng dẫn xoay vòng | Tác động hệ thống |
| :--- | :--- | :--- | :--- |
| **Aiven MySQL Database** | `AIVEN_APP_PASSWORD` / `MYSQL_PASSWORD` | Đăng nhập bảng điều khiển Aiven Console > Service defaultdb > Users & Privileges > Reset Password cho tài khoản ứng dụng. | Cập nhật chuỗi kết nối an toàn trên host/VPS. |
| **Session Secret** | `SESSION_SECRET` | Sinh chuỗi ngẫu nhiên mới có độ dài tối thiểu 64 ký tự hex (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). | **Vô hiệu hóa toàn bộ phiên đăng nhập cũ**, bảo đảm người dùng bắt buộc phải đăng nhập lại với chữ ký phiên mới. |
| **Internal Cron Secret** | `INTERNAL_CRON_SECRET` | Sinh khóa ngẫu nhiên mới tối thiểu 32 ký tự cho Cloudflare Worker Scheduled Cron trigger. | Cập nhật đồng bộ trên backend và Cloudflare Worker secrets. |
| **Registration Code Pepper** | `REGISTRATION_CODE_PEPPER` | Sinh khóa HMAC pepper mới tối thiểu 32 ký tự. | Bảo vệ mã nạp ưu đãi chống tấn công rainbow table. |
| **Admin Secret Key** | `ADMIN_SECRET_KEY` | Sinh khóa bí mật quản trị viên nội bộ mới tối thiểu 32 ký tự. | Ngăn chặn truy cập API quản trị trái phép. |
| **Cloudflare R2 Storage** | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Đăng nhập Cloudflare Dashboard > R2 > Manage R2 API Tokens > Tạo API Token mới và xóa Token cũ. | Ngăn chặn truy xuất trái phép kho tài liệu học tập S3/R2. |
| **OpenAI API Key** | `OPENAI_API_KEY` | Đăng nhập OpenAI Platform > API Keys > Revoke (thu hồi) khóa cũ và tạo Secret Key mới với hạn mức chi tiêu (Usage Limit) rõ ràng. | Bảo vệ ngân sách tài khoản OpenAI API, ngăn chặn thất thoát tiền. |
| **SMTP / Email Credentials** | `SMTP_PASS`, `RESEND_API_KEY` | Đổi mật khẩu ứng dụng SMTP (Gmail App Password / SendGrid / Resend) và cập nhật lại biến môi trường. | Bảo vệ luồng gửi email khôi phục mật khẩu. |

---

## 2. Quy trình thiết lập an toàn trên máy chủ Production

1. **Không tạo tệp `.env` trong Git**: Tệp `.env` đã được đưa vào `.gitignore`. Mọi biến môi trường trên máy chủ sản xuất phải được thiết lập qua:
   - System Environment Variables (systemd / Docker Secrets / Cloudflare Worker Secrets).
   - Tệp `.env` được tạo thủ công trực tiếp trên máy chủ với quyền đọc nghiêm ngặt (`chmod 600 .env`).
2. **Kiểm tra tệp mẫu `.env.example`**:
   - Sử dụng tệp `.env.example` làm tài liệu tham khảo cấu hình chuẩn. Tệp này chỉ chứa giá trị giả lập (placeholder) và chú thích.
3. **Chạy kiểm tra an toàn trước khi build**:
   ```bash
   npm run check:packaging
   npm run package:safe
   ```

---

## 3. Lịch sử Git và Lưu ý Vận hành

- Sau khi xoay vòng tất cả các khóa trên nhà cung cấp bên thứ ba (Aiven, OpenAI, Cloudflare), các khóa cũ sẽ **mất hiệu lực hoàn toàn**, vô hiệu hóa mọi rủi ro rò rỉ trước đây.
- Sau khi cập nhật `SESSION_SECRET`, cơ chế ký cookie `jami_session` sẽ tự động từ chối mọi token trước đó, buộc người dùng và quản trị viên phải xác thực lại danh tính.
