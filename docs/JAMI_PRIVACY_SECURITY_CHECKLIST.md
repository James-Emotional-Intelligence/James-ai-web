# Bảo vệ dữ liệu học sinh và khóa truy cập

## Trạng thái P0

Tại commit gốc `e6bbbd0eefea3918be1579649e785a98c6cef641`, Git vẫn theo dõi đường dẫn `.env`. Lịch sử nhánh `main` cũng có commit chứa đường dẫn đó. Giá trị trong tệp không được in hoặc chép vào tài liệu này. Commit `45b0749f` đã bỏ `.env` cùng `storage/materials`, `dist`, `release-artifacts`, `test-results` khỏi Git index mà giữ nguyên tệp cục bộ. `.gitignore` và `check:tracked-secrets` ngăn thêm lại. `.env.example` được thay các trường khóa bằng placeholder và vẫn được quét nội dung.

Chủ sở hữu cần kiểm tra và xoay vòng các khóa có khả năng từng lộ: Aiven/MySQL, OpenAI, session, cron, admin, R2 và email. Thay khóa qua bảng điều khiển nhà cung cấp rồi cập nhật bí mật trên môi trường vận hành. Việc thay `SESSION_SECRET` sẽ làm hết hiệu lực phiên đang dùng; chọn thời điểm phù hợp. Xem thêm `MANUAL_SECRET_ROTATION_REQUIRED.md`. Không dán khóa vào chat hoặc issue.

Không viết lại lịch sử Git hay force push khi chưa có kế hoạch phối hợp với chủ repo và người triển khai. Bỏ theo dõi ở commit mới không xóa bản cũ trong lịch sử.

## Cổng cần kiểm tra trước triển khai

- `npm run check:tracked-secrets` phải qua trên Git index mới.
- Các route dữ liệu học sinh phải truy vấn theo `userId` từ session; kiểm tra user A/B và admin với ID đoán được.
- Yêu cầu ghi dữ liệu qua cookie phải kiểm tra Origin/CSRF; cookie cần HttpOnly, Secure trên HTTPS và SameSite phù hợp.
- Không gửi hồ sơ học sinh đầy đủ tới AI khi chỉ cần môn, lớp, chủ đề; không ghi prompt chứa tài liệu riêng vào log công khai.
- Migration production cần backup, chạy có kiểm soát và có hướng dẫn khôi phục; không dùng dữ liệu học sinh thật trong CI.

Các mục route, CSRF và migration mới chưa được kiểm định trọn vẹn trong đợt thay đổi này; không coi tài liệu này là chứng nhận bảo mật toàn hệ thống.
