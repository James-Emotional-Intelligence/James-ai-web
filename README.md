# JAMI AI — Trợ Lý AI Lập Kế Hoạch & Đồng Hành Học Tập Cá Nhân Hóa

JAMI AI là ứng dụng trợ lý học tập thông minh dành cho học sinh Việt Nam (Lớp 6 đến 12), tuân thủ chương trình GDPT 2018 với 8 mô-đun chuẩn cốt lõi:
1. **LỊCH HỌC THÔNG MINH** (`/timetable`) — Thời khóa biểu trường, lịch học thêm & thuật toán xếp lịch tự động không xung đột
2. **HỌC TẬP HÔM NAY** (`/today`) — Bảng điều khiển tiến độ hôm nay, hẹn giờ tập trung và nhiệm vụ ưu tiên
3. **CHI TIẾT CÔNG VIỆC** (`/tasks`) — Danh sách nhiệm vụ, chia nhỏ từng bước có hướng dẫn AI chi tiết
4. **TRỢ LÝ AI JAMI** (`/jami`) — Trợ lý AI đồng hành hỏi đáp bài học, giải thích gợi ý và giao tiếp giọng nói
5. **KIỂM TRA & ÔN TẬP** (`/exams`) — Lộ trình ôn tập theo mốc D-14/D-7/D-3/D-1 và đề luyện tập AI chấm điểm an toàn
6. **KHO TÀI LIỆU** (`/materials`) — Quản lý tài liệu học tập, trích xuất đề cương và tự tạo đề ôn tập
7. **BÁO CÁO HỌC TẬP** (`/reports`) — Thống kê tổng phút tập trung, hoàn thành nhiệm vụ và phân tích xu hướng
8. **THÔNG BÁO** (`/notifications`) — Nhắc nhở thông minh sắp đến giờ học và các mốc kiểm tra quan trọng

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
