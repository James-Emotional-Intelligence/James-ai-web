# JAMI AI — Trợ Lý AI Lập Kế Hoạch & Đồng Hành Học Tập Cá Nhân Hóa

JAMI AI là ứng dụng trợ lý học tập thông minh dành cho học sinh Việt Nam (Lớp 6 đến 12), tuân thủ chương trình GDPT 2018 với 8 mô-đun cốt lõi:
1. **LỊCH HỌC THÔNG MINH** — Thời khóa biểu trường, lịch học thêm & thuật toán xếp lịch tự động không xung đột
2. **CHI TIẾT CÔNG VIỆC** — Chia nhỏ nhiệm vụ học tập thành từng bước có hướng dẫn chi tiết
3. **HỌC TẬP HÔM NAY** — Bảng điều khiển việc cần làm, tiến độ tải học và việc ưu tiên tiếp theo
4. **TRỢ LÝ AI** — Robot Jami đồng hành hỏi đáp bài học, giải thích gợi ý và nhắc lịch
5. **KIỂM TRA & ÔN TẬP** — Các mốc D-14/D-7/D-3/D-1 và hệ thống trắc nghiệm/tự luận chấm điểm bảo mật
6. **BÁO CÁO HỌC TẬP** — Phân tích thời gian học, môn mạnh/yếu và độ thành thạo kiến thức
7. **KHO TÀI LIỆU** — Quản lý tài liệu học tập, tóm tắt và tự tạo câu hỏi ôn tập
8. **THÔNG BÁO** — Nhắc nhở thông minh sắp đến giờ học và mốc kiểm tra

---

## Cấu Hình Môi Trường

JAMI AI sử dụng OpenAI API trên server-side cho các tính năng AI. Hãy cấu hình các biến môi trường trong file `.env` hoặc Settings của AI Studio:

```env
# Môi trường ứng dụng (demo hoặc production)
APP_MODE=demo
APP_BASE_URL=http://localhost:3000

# OpenAI API Configuration (Server-Side)
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_TEXT_MODEL=gpt-4o-mini
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview
OPENAI_TRANSCRIBE_MODEL=gpt-transcribe

# Aiven MySQL Database (Tùy chọn cho chế độ production)
AIVEN_MYSQL_HOST=
AIVEN_MYSQL_PORT=
AIVEN_MYSQL_DATABASE=
AIVEN_APP_USER=
AIVEN_APP_PASSWORD=

# Session & Bảo Mật
JWT_SIGNING_SECRET=your_jwt_signing_secret_here
```

## Chế Độ Demo Mode (Mặc định)
Nếu chưa cấu hình `OPENAI_API_KEY` hoặc `AIVEN_MYSQL_*`, ứng dụng tự động chạy ở **Chế Độ Demo** đầy đủ tính năng với tài khoản mẫu học sinh **Nguyễn Quang Minh (Lớp 9)**, dữ liệu mẫu chuẩn chương trình GDPT 2018 và thuật toán xếp lịch tự động.

## Khởi Chạy Ứng Dụng

```bash
# Cài đặt dependencies
npm install

# Chạy môi trường phát triển
npm run dev

# Build cho production
npm run build
npm start
```
