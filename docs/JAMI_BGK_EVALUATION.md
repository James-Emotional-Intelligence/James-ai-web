# Kiểm định JAMI cho ban giám khảo

Điểm xuất phát: `main` tại `e6bbbd0eefea3918be1579649e785a98c6cef641`.

| Góp ý | Thay đổi cụ thể | Nơi kiểm tra | Cách demo / bằng chứng |
| --- | --- | --- | --- |
| 10 + 5 + 20 | Bộ đo offline ghi JSON/CSV; 10 câu Toán 7 chờ giáo viên; 20 câu live chưa chạy | `scripts/jami-quality.ts`, `tests/fixtures/` | `npm run test:jami-quality`: 5/5 lịch đạt, kiến thức/AI thật `NOT_RUN` |
| Câu hỏi chính xác | Đề đúng lớp, kiểm tra cấu trúc, chặn placeholder và chấm tự luận không chắc chắn | `ai-adapter.ts`, `quiz-quality-validator.ts`, `material-processor.ts` | Unit và integration; AI offline trả lỗi rõ |
| Câu này sai | Học sinh phản ánh, admin xem xét, câu tranh chấp không tính điểm/năng lực | `045_quiz_question_reports.sql`, `quiz-question-report-repository.ts`, trang Đề thi và Quản trị | Integration kiểm tra quyền A/B/admin; cần MySQL thật để xác minh migration |
| Ôn tập theo năng lực | Chủ đề yếu tạo bản xem trước vào khoảng trống thật rồi học sinh xác nhận | `exam-study-plan-service.ts`, `scheduler.ts`, trang Báo cáo | 5 fixture lịch và 8 E2E giao diện; vòng tăng/giảm ưu tiên chưa có benchmark đầy đủ |
| Bảo mật | Bỏ theo dõi `.env` và dữ liệu sinh; tăng kiểm tra secret | `.gitignore`, `check-tracked-secrets.mjs`, checklist bảo mật | `npm run check:tracked-secrets` đạt; chủ tài khoản cần xoay khóa |

## Đã có / thiếu / cần sửa

| Phần | Hiện trạng | Việc còn cần |
| --- | --- | --- |
| Sinh đề | Có gateway AI, quiz và chấm bài; đã chặn placeholder và kiểm tra cấu trúc | Giáo viên xác minh nội dung và sửa đáp án theo phiên bản |
| Lập lịch | Kế hoạch ôn thi và dời lịch dùng `DeterministicScheduler` | Kiểm thử thêm lịch ngoại lệ và tải lớn trên MySQL |
| Sổ lỗi sai | Có lưu lỗi và năng lực theo chủ đề; câu bị phản ánh được tạm loại khỏi mastery | Đồng bộ các câu tương tự trong Sổ lỗi sai |
| Bảo mật | Có kiểm tra tệp Git | Xoay vòng khóa có nguy cơ đã lộ, kiểm tra IDOR toàn diện |

## Bộ đo có thể chạy lại

Chạy `npm run test:jami-quality`. Báo cáo JSON/CSV được ghi vào `test-results/jami-quality/`, thư mục này không đưa lên Git. Lệnh `npm run report:jami-quality` chạy lại cùng bộ đo. CI chạy chế độ offline qua `test:ci`.

Chế độ offline dùng năm lịch giả tại múi giờ `Asia/Ho_Chi_Minh`, bắt đầu thứ Hai 19/10/2026. Nó kiểm tra xung đột, nhiệm vụ bị quên, trùng nhiệm vụ, hạn chót và lý do chưa xếp được. Dữ liệu không phải của học sinh thật. Kết quả này **chỉ chứng minh thuật toán trên fixture**, không đo chất lượng ngôn ngữ của AI.

Mười câu Toán 7 nằm tại `tests/fixtures/jami-quality-knowledge-7.json`. Đáp án do đề bài cung cấp, nhãn hiện là `pending_teacher_review`. Đây chưa là bộ chuẩn vàng được giáo viên duyệt. Báo cáo ghi `NOT_RUN` cho độ chính xác AI cho tới khi có một lần gọi model thật và chấm đối chiếu có lưu provenance.

Bộ 20 câu do AI sinh thật cũng đang `NOT_RUN`. Không dùng câu viết sẵn hoặc placeholder để điền chỉ số 20/20. Trước khi chạy live cần thêm bộ chạy có giới hạn chi phí, token, thời gian; lưu model, phiên bản prompt, commit, output đã khử dữ liệu riêng tư; sau đó giáo viên bộ môn chấm `approved`, `needs_fix` hoặc `rejected`. Không tự tạo chữ ký duyệt.

So sánh baseline và lần mới chỉ có ý nghĩa khi cùng fixture, cùng model và cùng cách chấm. Chưa có baseline live nên không điền tỷ lệ hoặc delta. Báo cáo offline và live phải trình bày riêng.

## Kết quả chạy tại workspace

| Lệnh | Kết quả |
| --- | --- |
| `npm run release:verify` | PASS: secret check, typecheck, mojibake, lint, 337 unit, 110 integration, client/server build và gói phát hành |
| `npm run test:jami-quality` | PASS offline 5/5 lịch; 10 câu AI, 20 câu AI và live `NOT_RUN` |
| `npm run test:e2e` | PASS 8/8 trên Chromium ở chế độ demo khi server demo đã chạy sẵn trên cổng 3000; Playwright tự khởi động server trên Windows chạy xong test nhưng không đóng tiến trình sạch trong lần thử trước |

Kết quả E2E trên là smoke test cho các luồng hiện có, chưa bao phủ thao tác phản ánh câu sai trên trình duyệt. Integration test dùng mock và demo, chưa chứng minh giao dịch MySQL thật hay migration production. Không dùng những kết quả này để suy ra độ chính xác AI.

## Demo 60–90 giây

1. Dùng tài khoản giả: cho thấy lịch học và bài tập đã có.
2. Chạy fixture lập lịch P01–P05; chỉ vào số xung đột và nhiệm vụ chưa xếp được có lý do.
3. Mở đề Toán 7 đã được kiểm tra cấu trúc; khi AI không sẵn sàng, ứng dụng báo lỗi rõ thay vì đưa câu placeholder.
4. Mở báo cáo và nói rõ `PASS` của lịch là kiểm thử offline; kiến thức AI, 20 câu và giáo viên duyệt hiện `NOT_RUN`.

Trang Báo cáo nay có khối “JAMI đề xuất ôn gì tiếp?” dùng năng lực theo chủ đề và câu đúng/sai chưa bị tranh chấp. Nút “Xem lịch ôn đề xuất” tính giờ trống thật; “Áp dụng” xác nhận kế hoạch. Với dữ liệu demo không có MySQL, khối này báo chưa đủ bằng chứng. Chưa có demo seed đầy đủ làm sai 3 câu → ôn lại đúng → giảm ưu tiên, nên không tuyên bố đã kiểm chứng vòng đó.

## Phản ánh câu sai và giới hạn

Migration `045_quiz_question_reports.sql` thêm phản ánh và audit duyệt. Học sinh được gửi một phản ánh cho mỗi câu mình có quyền xem. Admin xem hàng đợi ẩn danh, quyết định đang xem xét / xác nhận sai / bác bỏ. Câu đang tranh chấp tạm không tính vào điểm và `topic_mastery` trong MySQL; thao tác admin tính lại trong giao dịch. Chưa có công cụ sửa đáp án theo phiên bản và tự chấm lại bằng đáp án mới, vì vậy trạng thái `fixed` chưa được cho chọn trong UI. Không dùng hàng đợi admin thay cho chữ ký giáo viên bộ môn.

Test cũ `exams-quizzes` và `materials` được cập nhật vì hợp đồng mới từ chối tạo câu placeholder khi AI offline. Test route dùng đề mock có kiểm soát để đo quyền, API và chống rò đáp án; nó không được tính là chất lượng AI.

## Migration và rollback

Sao lưu MySQL trước khi chạy `npm run db:migrate` trên môi trường vận hành. Migration 045 chỉ tạo bảng mới, có thể chạy lại bằng `CREATE TABLE IF NOT EXISTS`. Không xóa bảng để rollback khi đã có phản ánh; trước tiên khôi phục ứng dụng về commit trước và giữ bảng để bảo toàn lịch sử, sau đó quyết định di chuyển dữ liệu với quản trị viên DB.
