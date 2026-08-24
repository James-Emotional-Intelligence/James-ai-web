# Yêu Cầu Từ Presentation1.pptx — Nguồn Yêu Cầu Bắt Buộc

Tài liệu này ghi lại thông tin mapping chính xác từ hai slide trong `Presentation1.pptx` sang các thành phần kỹ thuật cần triển khai trong dự án JAMI AI.

---

## 1. Bản Đồ Mapping Thành Phần PowerPoint -> Code Base

| Thành phần PowerPoint | Yêu cầu bố cục & Chức năng | Thành phần cần triển khai | Path / Component |
|---|---|---|---|
| **Nút 1–4 trên thanh trên** | Thanh công cụ nằm trên cùng (không nằm bên trái). Hiển thị trực tiếp 4 module ưu tiên cao. | `PrimaryModuleNav` - Top navbar render 4 module đầu tiên | `src/components/layout/TopModuleNav.tsx` |
| **"5 đến mục thứ 8"** | Nút "Thêm" / "Mục 5–8" mở dropdown/overflow menu chứa module 5, 6, 7, 8. Hỗ trợ phím Escape, click outside, keyboard navigation. | `MoreModulesDropdown` thuộc `TopModuleNav` | `src/components/layout/TopModuleNav.tsx` |
| **Khung hội thoại trung tâm** | Vùng trung tâm hiển thị "Lời nói của robot Jami và lịch sử chat của người dùng". Lấy dữ liệu thật từ MySQL (`jami_messages`), hiển thị timestamp `Asia/Ho_Chi_Minh`, có input chat & nút giọng nói thật. | `JamiCommandCenter` / `JamiConversationPanel` | `src/components/jami/JamiCommandCenter.tsx` |
| **8 ô chức năng** | Lưới 8 thẻ chức năng theo thứ tự 1-8 bên dưới trung tâm hội thoại. Hiển thị chỉ số thật từ API `GET /api/v1/dashboard/overview`, link điều hướng thật. Responsive 4x2 (Desktop), 2x4 (Tablet), 1x8 (Mobile). | `ModuleGrid` & `ModuleCard` | `src/features/today/TodayDashboard.tsx` & `src/config/modules.ts` |
| **Robot bên phải** | Robot Jami xuất hiện ở cột bên phải trung tâm hội thoại, tương tác với vùng chat. Hiển thị trạng thái thật (idle, listening, thinking, speaking, error) và speech bubble. | `RobotJami` responsive panel | `src/components/jami/RobotJami.tsx` |

---

## 2. Thứ Tự & Đường Dẫn 8 Module Bắt Buộc

1. **LỊCH HỌC THÔNG MINH** — `/timetable`
2. **CHI TIẾT CÔNG VIỆC** — `/tasks`
3. **HỌC TẬP HÔM NAY** — `/today` (Route mặc định sau đăng nhập)
4. **TRỢ LÝ AI JAMI** — `/jami`
5. **KIỂM TRA & ÔN TẬP** — `/exams`
6. **BÁO CÁO HỌC TẬP** — `/reports`
7. **KHO TÀI LIỆU** — `/materials`
8. **THÔNG BÁO** — `/notifications`

---

## 3. Quy Chuẩn Nhận Diện & Thiết Kế

- **Tên sản phẩm**: `JAMI AI`
- **Tagline**: `TRỢ LÝ AI LẬP KẾ HOẠCH VÀ ĐỒNG HÀNH HỌC TẬP CÁ NHÂN HÓA`
- **Tông màu chủ đạo**:
  - Nền tối: `#050806`, `#080D09`, `#0B120D`, `#101A13`
  - Xanh lá chính: `#16A34A`, `#22C55E`, `#14532D`
  - Chữ sáng: `#F3FAF5`
  - Chữ phụ & Accent: `#A9B8AE`, `#86EFAC`
- **Typography**: `Be Vietnam Pro` (đầy đủ bộ gõ tiếng Việt, không vỡ layout).
