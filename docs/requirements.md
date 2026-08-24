# JAMI AI — Đặc Tả Yêu Cầu & Tính Năng

## 1. Định Vị Sản Phẩm
- **Tên**: JAMI AI
- **Tagline**: JAMI AI – TRỢ LÝ AI LẬP KẾ HOẠCH VÀ ĐỒNG HÀNH HỌC TẬP CÁ NHÂN HÓA
- **Đối tượng mục tiêu**: Học sinh trung học Việt Nam (Lớp 6 đến Lớp 12).
- **Ngôn ngữ**: Tiếng Việt chuẩn Unicode UTF-8.
- **Múi giờ**: `Asia/Ho_Chi_Minh`.

## 2. Danh Mục 8 Mô-đun Cốt Lõi (Theo đúng thứ tự giao diện)
1. **LỊCH HỌC THÔNG MINH**
   - Thời khóa biểu trường (T2–T7/CN)
   - Lịch học thêm & di chuyển
   - Tự động sắp xếp lại (Deterministic Scheduler với xem trước diff)
2. **CHI TIẾT CÔNG VIỆC**
   - Chuẩn bị & mục tiêu
   - Thực hiện từng bước (Step-by-step breakdown)
   - Minh chứng kết quả
   - Tiêu chí hoàn thành & hoàn thành xuất sắc
3. **HỌC TẬP HÔM NAY**
   - Lời chào từ Jami & việc cần làm tiếp theo
   - Hẹn giờ tập trung (25/5, 45/10, Custom - *tuyệt đối không dùng chữ Pomodoro*)
   - Theo dõi tiến độ học tập
4. **TRỢ LÝ AI**
   - Chat giải đáp bài học & hướng dẫn phương pháp
   - Nhắc lịch học & hạn chót
   - Gợi ý ưu tiên công việc dựa trên năng lượng & kỳ thi
5. **KIỂM TRA & ÔN TẬP**
   - Lịch kiểm tra & đếm ngược ngày thi
   - Đề luyện tập AI theo các mốc D-14, D-7, D-3, D-1
   - Chấm điểm tự động & giải thích chi tiết (Bảo vệ đáp án phía server)
6. **BÁO CÁO HỌC TẬP**
   - Thời gian học theo ngày / tuần / môn học
   - Dự kiến vs Thực tế (Planned vs Actual)
   - Đánh giá năng lực môn & Đánh giá tuần tích cực
7. **KHO TÀI LIỆU**
   - Lưu trữ PDF, hình ảnh đề bài
   - Gắn thẻ theo môn học / kỳ kiểm tra
   - Tạo câu hỏi luyện tập tự động từ tài liệu
8. **THÔNG BÁO**
   - Nhắc sắp đến giờ học, sắp đến kỳ kiểm tra
   - Cảnh báo nhiệm vụ chưa hoàn thành
   - Cài đặt giờ yên tĩnh (Quiet Hours)

## 3. Robot Đồng Hành Jami
- Thiết kế SVG + CSS biểu cảm tương tác cao.
- 11 trạng thái: `idle`, `listening`, `thinking`, `speaking`, `guiding`, `focus`, `reminding`, `celebrating`, `encouraging`, `sleeping`, `error`.
- Tính cách ấm áp, khích lệ nỗ lực, bảo đảm an toàn cho học sinh dưới 18 tuổi.
