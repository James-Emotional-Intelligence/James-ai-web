# JAMI AI — Kiến Trúc Hệ Thống

## 1. Kiến Trúc Phân Lớp (Layered Architecture)
```
[ Client: React 19 + TypeScript + Tailwind CSS ]
                  │
                  ▼
[ Shared Contracts: Zod Schemas & TypeScript Types ]
                  │
                  ▼
[ Server Routing: REST API /api/v1 (Express / Hono) ]
                  │
                  ▼
[ Application Services: Scheduler / AI Adapter / Exam Engine / Focus Engine ]
                  │
                  ▼
[ Repository Layer: In-Memory Demo Store / Aiven MySQL / Cloudflare Hyperdrive ]
```

## 2. Các Thành Phần Chính
- **Frontend SPA**: React 19, TypeScript strict, Tailwind CSS, Motion/CSS animation, Lucide Icons.
- **Deterministic Scheduler**: Thuật toán xếp lịch không overlap, bảo toàn thời gian bận (trường học, học thêm, ăn, ngủ, di chuyển), ưu tiên theo kỳ kiểm tra và mức năng lượng.
- **OpenAI AI Integration (Server-Side)**:
  - Text: Responses API + Structured Outputs (Zod)
  - Transcription: Audio Transcriptions
  - Voice: Realtime Session negotiation
  - Demo Fallback: Hoạt động offline mượt mà không cần API key.
- **Security & Safety**:
  - Không lộ secret hoặc đáp án đề kiểm tra ra client.
  - Phân quyền user_id nghiêm ngặt.
  - An toàn học sinh: Không lưu audio thô, cho phép xem/xóa bộ nhớ Jami.
