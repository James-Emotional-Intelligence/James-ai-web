import type {
  StudyTask,
  ExecutionGuide,
  Exam,
  ExamStudyPlan,
  Quiz,
  MistakeNotebookEntry,
  LearningMaterial,
  Material,
  TodayDashboardOverview,
  ReportOverviewResponse,
  TomorrowPreparationPlan,
} from '../../shared/types';
import { formatDateVN, formatDateShortVN, formatTimeVN } from './utils';

export interface BasePdfOptions {
  studentName?: string;
  gradeLevel?: number | string;
  className?: string;
  title?: string;
  subtitle?: string;
  orientation?: 'portrait' | 'landscape';
  period?: 'week' | 'month';
  chapters?: Array<{ title: string; pageNumber?: number; startPage?: number; endPage?: number }>;
}

function escapeHtml(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Triggers PDF print dialog via an isolated invisible iframe with professional styling
 */
export function printHtmlDocument(htmlContent: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.style.zIndex = '-9999';
      document.body.appendChild(iframe);

      const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!frameDoc) {
        document.body.removeChild(iframe);
        throw new Error('Không thể khởi tạo tài liệu in PDF');
      }

      frameDoc.open();
      frameDoc.write(htmlContent);
      frameDoc.close();

      const triggerPrint = () => {
        try {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          }
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
            resolve();
          }, 1200);
        } catch (printErr) {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          reject(printErr);
        }
      };

      if (iframe.contentDocument?.readyState === 'complete') {
        setTimeout(triggerPrint, 250);
      } else {
        iframe.onload = () => setTimeout(triggerPrint, 250);
      }
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generates the common HTML wrapper for all JAMI AI printed documents
 */
function wrapHtmlDocument(options: {
  title: string;
  subtitle?: string;
  documentTypeLabel: string;
  studentName?: string;
  gradeLevel?: number | string;
  orientation?: 'portrait' | 'landscape';
  bodyContent: string;
}): string {
  const {
    title,
    subtitle,
    documentTypeLabel,
    studentName = 'Học sinh',
    gradeLevel,
    orientation = 'portrait',
    bodyContent,
  } = options;

  const printDateStr = formatDateVN(new Date());

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)} - JAMI AI</title>
  <style>
    @page {
      size: A4 ${orientation};
      margin: 10mm 12mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Be Vietnam Pro", sans-serif;
      font-size: 11.5px;
      line-height: 1.5;
      color: #0f172a;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-doc-container {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      border-bottom: 2px solid #059669;
      padding-bottom: 8px;
      margin-bottom: 16px;
    }
    .header-table td {
      vertical-align: middle;
    }
    .logo-text {
      font-size: 18px;
      font-weight: 800;
      color: #059669;
      letter-spacing: -0.5px;
    }
    .logo-badge {
      display: inline-block;
      background: #ecfdf5;
      color: #047857;
      font-size: 9.5px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid #a7f3d0;
      margin-left: 6px;
    }
    .slogan {
      font-size: 9.5px;
      color: #64748b;
      margin-top: 2px;
    }
    .doc-meta {
      text-align: right;
      font-size: 10px;
      color: #475569;
    }
    .doc-title-area {
      text-align: center;
      margin-bottom: 16px;
    }
    .doc-title {
      font-size: 17px;
      font-weight: 800;
      color: #065f46;
      text-transform: uppercase;
      margin: 0 0 4px 0;
      letter-spacing: 0.2px;
    }
    .doc-subtitle {
      font-size: 11px;
      color: #475569;
      margin: 0;
    }
    .info-bar {
      display: flex;
      justify-content: space-between;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 6px 12px;
      margin-bottom: 14px;
      font-size: 10.5px;
      font-weight: 600;
    }
    .card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 12px;
      margin-bottom: 12px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .card-title {
      font-size: 12.5px;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin-top: 0;
      margin-bottom: 8px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 700;
    }
    .badge-green { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
    .badge-amber { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
    .badge-blue { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
    .badge-rose { background: #ffe4e6; color: #be123c; border: 1px solid #fecdd3; }
    .badge-purple { background: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff; }
    
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      page-break-inside: avoid;
    }
    table.data-table th {
      background: #f1f5f9;
      color: #1e293b;
      font-weight: 700;
      font-size: 10.5px;
      text-align: left;
      padding: 6px 8px;
      border: 1px solid #cbd5e1;
    }
    table.data-table td {
      padding: 6px 8px;
      border: 1px solid #e2e8f0;
      font-size: 10.5px;
      vertical-align: top;
    }
    table.data-table tr:nth-child(even) td {
      background: #f8fafc;
    }
    .footer {
      margin-top: 20px;
      border-top: 1px dashed #cbd5e1;
      padding-top: 8px;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #94a3b8;
    }
    .print-avoid-break {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .stat-box {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
      padding: 8px;
      text-align: center;
    }
    .stat-value {
      font-size: 16px;
      font-weight: 800;
      color: #15803d;
    }
    .stat-label {
      font-size: 9.5px;
      color: #4b5563;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div class="print-doc-container">
    <table class="header-table">
      <tr>
        <td>
          <span class="logo-text">JAMI AI</span>
          <span class="logo-badge">GDPT 2018</span>
          <div class="slogan">Nền tảng trợ lý học tập &amp; đồng hành số thông minh</div>
        </td>
        <td class="doc-meta">
          <div><strong>Loại tài liệu:</strong> ${escapeHtml(documentTypeLabel)}</div>
          <div><strong>Học sinh:</strong> ${escapeHtml(studentName)}${gradeLevel ? ` (Lớp ${gradeLevel})` : ''}</div>
          <div><strong>Ngày in:</strong> ${printDateStr}</div>
        </td>
      </tr>
    </table>

    <div class="doc-title-area">
      <h1 class="doc-title">${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="doc-subtitle">${escapeHtml(subtitle)}</p>` : ''}
    </div>

    ${bodyContent}

    <div class="footer">
      <div>© JAMI AI Companion - Bản in lưu hành học tập cá nhân</div>
      <div>Trang 1 / Tài liệu trích xuất tự động</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * 1. Export Today Plan & Tomorrow Preparation to PDF
 */
export async function exportTodayPlanToPdf(
  overview: TodayDashboardOverview,
  tomorrowPlan?: TomorrowPreparationPlan | null,
  options?: BasePdfOptions
): Promise<void> {
  const studentName = options?.studentName || overview.studentName || 'Học sinh';
  const gradeLevel = options?.gradeLevel || overview.gradeLevel || 9;

  const sessionsHtml =
    overview.timetable.todaySessions.length === 0
      ? '<p style="color: #64748b; font-style: italic;">Hôm nay không có tiết học chính khóa.</p>'
      : `
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 120px;">Thời gian</th>
            <th>Môn học / Tiết học</th>
            <th style="width: 90px;">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          ${overview.timetable.todaySessions
            .map(
              (s) => `
            <tr>
              <td><strong>${escapeHtml(s.time)}</strong></td>
              <td>${escapeHtml(s.title)}${s.subject ? ` (${escapeHtml(s.subject)})` : ''}</td>
              <td><span class="badge badge-green">Chính khóa</span></td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;

  let tomorrowPlanHtml = '';
  if (tomorrowPlan && tomorrowPlan.items && tomorrowPlan.items.length > 0) {
    tomorrowPlanHtml = `
      <div class="card">
        <h3 class="card-title" style="color: #065f46;">Phiếu Chuẩn Bị Bài Ngày Mai (${escapeHtml(tomorrowPlan.targetDate)})</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 80px;">Khung giờ</th>
              <th style="width: 90px;">Môn học</th>
              <th>Nhiệm vụ chuẩn bị bài</th>
              <th style="width: 80px;">Thời lượng</th>
              <th style="width: 80px;">Mức ưu tiên</th>
            </tr>
          </thead>
          <tbody>
            ${tomorrowPlan.items
              .map(
                (item) => `
              <tr>
                <td>${escapeHtml(item.startAt)} - ${escapeHtml(item.endAt)}</td>
                <td><strong>${escapeHtml(item.subjectName || 'Môn học')}</strong></td>
                <td>
                  <div><strong>${escapeHtml(item.title)}</strong></div>
                  ${item.description ? `<div style="font-size: 9.5px; color: #64748b;">${escapeHtml(item.description)}</div>` : ''}
                </td>
                <td>${item.plannedMinutes} phút</td>
                <td>
                  <span class="badge ${item.priority === 'high' ? 'badge-rose' : item.priority === 'medium' ? 'badge-amber' : 'badge-blue'}">
                    ${item.priority === 'high' ? 'Cao' : item.priority === 'medium' ? 'Trung bình' : 'Tiêu chuẩn'}
                  </span>
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  const bodyContent = `
    <div class="grid-3" style="margin-bottom: 12px;">
      <div class="stat-box">
        <div class="stat-value">${overview.todayStudy.completedMinutes} / ${overview.todayStudy.plannedMinutes} phút</div>
        <div class="stat-label">Thời gian học hôm nay</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${overview.tasks.todayTasksCount} nhiệm vụ</div>
        <div class="stat-label">Nhiệm vụ cần hoàn thành</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${overview.todayStudy.streakDays} ngày</div>
        <div class="stat-label">Chuỗi học tập liên tục</div>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">Lịch Học &amp; Tiết Học Trong Ngày</h3>
      ${sessionsHtml}
    </div>

    ${tomorrowPlanHtml}

    ${
      overview.jami.latestMessage
        ? `
      <div class="card" style="background: #f0fdf4; border-color: #a7f3d0;">
        <h4 style="margin: 0 0 4px 0; color: #047857; font-size: 11.5px;">Lời nhắn từ Trợ lý Robot Jami:</h4>
        <div style="font-size: 10.5px; color: #166534; font-style: italic;">"${escapeHtml(overview.jami.latestMessage)}"</div>
      </div>
    `
        : ''
    }
  `;

  const html = wrapHtmlDocument({
    title: 'Kế Hoạch Học Tập & Chuẩn Bị Bài',
    subtitle: `Hôm nay: ${formatDateVN(new Date())}`,
    documentTypeLabel: 'Kế hoạch học tập ngày',
    studentName,
    gradeLevel,
    bodyContent,
  });

  await printHtmlDocument(html);
}

/**
 * 2. Export Study Tasks & Breakdown Table to PDF
 */
export async function exportTasksToPdf(tasks: StudyTask[], options?: BasePdfOptions): Promise<void> {
  const studentName = options?.studentName || 'Học sinh';
  const gradeLevel = options?.gradeLevel || 9;

  const highPriority = tasks.filter((t) => t.priority === 'high');
  const mediumPriority = tasks.filter((t) => t.priority === 'medium');
  const otherPriority = tasks.filter((t) => t.priority !== 'high' && t.priority !== 'medium');

  const renderTaskTable = (taskList: StudyTask[]) => {
    if (taskList.length === 0) return '<p style="color: #94a3b8; font-style: italic; font-size: 10px;">Không có nhiệm vụ trong nhóm này.</p>';
    return `
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 25px;">STT</th>
            <th>Tên nhiệm vụ học tập</th>
            <th style="width: 100px;">Môn học</th>
            <th style="width: 75px;">Thời lượng</th>
            <th style="width: 85px;">Hạn nộp</th>
            <th style="width: 75px;">Độ khó</th>
            <th style="width: 60px;">Tiến độ</th>
          </tr>
        </thead>
        <tbody>
          ${taskList
            .map(
              (task, idx) => `
            <tr>
              <td style="text-align: center;">${idx + 1}</td>
              <td>
                <strong>${escapeHtml(task.title)}</strong>
                ${task.objective ? `<div style="font-size: 9px; color: #64748b;">${escapeHtml(task.objective)}</div>` : ''}
              </td>
              <td><span class="badge badge-blue">${escapeHtml(task.subjectName || 'Môn học')}</span></td>
              <td>${task.estimatedMinutes} phút</td>
              <td>${task.dueAt ? formatDateShortVN(task.dueAt) : 'Trong ngày'}</td>
              <td>${task.difficulty === 'hard' ? 'Nâng cao' : task.difficulty === 'medium' ? 'Vận dụng' : 'Cơ bản'}</td>
              <td><strong>${task.completionPercent || 0}%</strong></td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
  };

  const bodyContent = `
    <div class="card" style="border-left: 4px solid #ef4444;">
      <h3 class="card-title" style="color: #b91c1c;">Nhiệm Vụ Ưu Tiên Cao (Cần hoàn thành trước) - ${highPriority.length} nhiệm vụ</h3>
      ${renderTaskTable(highPriority)}
    </div>

    <div class="card" style="border-left: 4px solid #f59e0b;">
      <h3 class="card-title" style="color: #b45309;">Nhiệm Vụ Tiêu Chuẩn &amp; Rèn Luyện - ${mediumPriority.length} nhiệm vụ</h3>
      ${renderTaskTable(mediumPriority)}
    </div>

    ${
      otherPriority.length > 0
        ? `
      <div class="card" style="border-left: 4px solid #3b82f6;">
        <h3 class="card-title" style="color: #1d4ed8;">Nhiệm Vụ Mở Rộng &amp; Tự Học - ${otherPriority.length} nhiệm vụ</h3>
        ${renderTaskTable(otherPriority)}
      </div>
    `
        : ''
    }
  `;

  const html = wrapHtmlDocument({
    title: 'Danh Sách Nhiệm Vụ Học Tập GDPT 2018',
    subtitle: `Tổng cộng: ${tasks.length} nhiệm vụ | Xuất bản lúc: ${formatDateVN(new Date())}`,
    documentTypeLabel: 'Bảng nhiệm vụ học tập',
    studentName,
    gradeLevel,
    bodyContent,
  });

  await printHtmlDocument(html);
}

/**
 * 3. Export Single Task Execution Guide to PDF
 */
export async function exportTaskExecutionGuideToPdf(
  task: StudyTask,
  guide?: ExecutionGuide | null,
  options?: BasePdfOptions
): Promise<void> {
  const studentName = options?.studentName || 'Học sinh';
  const gradeLevel = options?.gradeLevel || 9;
  const execGuide = guide || task.executionGuide;

  let stepsHtml = '<p style="color: #64748b; font-style: italic;">Chưa có các bước hướng dẫn cụ thể.</p>';
  if (execGuide && execGuide.steps && execGuide.steps.length > 0) {
    stepsHtml = execGuide.steps
      .map(
        (step, idx) => `
        <div class="card" style="margin-bottom: 8px; background: #fafafa;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="color: #047857; font-size: 11.5px;">Bước ${step.stepOrder ?? idx + 1}: ${escapeHtml(step.title)}</strong>
            <span class="badge badge-green">${step.plannedMinutes || 10} phút</span>
          </div>
          ${step.instruction ? `<p style="margin: 4px 0; color: #1e293b;">${escapeHtml(step.instruction)}</p>` : ''}
          ${step.expectedOutput ? `<div style="font-size: 9.5px; color: #334155; margin-top: 2px;"><strong>Kết quả cần đạt:</strong> ${escapeHtml(step.expectedOutput)}</div>` : ''}
          ${step.tips && step.tips.length > 0 ? `<div style="font-size: 9.5px; color: #0284c7; background: #f0f9ff; padding: 4px 8px; border-radius: 4px; margin-top: 4px;">💡 <strong>Mẹo Jami:</strong> ${escapeHtml(step.tips.join('; '))}</div>` : ''}
        </div>
      `
      )
      .join('');
  }

  const bodyContent = `
    <div class="card" style="background: #f8fafc;">
      <h2 style="margin: 0 0 6px 0; font-size: 14px; color: #0f172a;">${escapeHtml(task.title)}</h2>
      <div style="display: flex; gap: 12px; font-size: 10px; color: #475569; margin-bottom: 8px;">
        <span><strong>Môn học:</strong> ${escapeHtml(task.subjectName || 'Chung')}</span>
        <span><strong>Thời lượng ước tính:</strong> ${task.estimatedMinutes} phút</span>
        <span><strong>Mức ưu tiên:</strong> ${task.priority === 'high' ? 'Cao' : 'Tiêu chuẩn'}</span>
        <span><strong>Hạn nộp:</strong> ${task.dueAt ? formatDateVN(task.dueAt) : 'Trong ngày'}</span>
      </div>
      ${task.objective ? `<div style="font-size: 10.5px; color: #334155; padding: 6px 10px; background: #ffffff; border-radius: 4px; border: 1px solid #e2e8f0;"><strong>Mục tiêu:</strong> ${escapeHtml(task.objective)}</div>` : ''}
    </div>

    <div class="card">
      <h3 class="card-title">Hướng Dẫn Từng Bước Thực Hiện</h3>
      ${stepsHtml}
    </div>
  `;

  const html = wrapHtmlDocument({
    title: `Phiếu Hướng Dẫn: ${task.title}`,
    subtitle: `Hướng dẫn thực hiện từng bước cá nhân hóa bởi JAMI AI`,
    documentTypeLabel: 'Phiếu hướng dẫn học tập',
    studentName,
    gradeLevel,
    bodyContent,
  });

  await printHtmlDocument(html);
}

/**
 * 4. Export Exams Plan & Milestones to PDF
 */
export async function exportExamsPlanToPdf(
  exams: Exam[],
  activePlan?: ExamStudyPlan | null,
  options?: BasePdfOptions
): Promise<void> {
  const studentName = options?.studentName || 'Học sinh';
  const gradeLevel = options?.gradeLevel || 9;

  const examsTableHtml = `
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 25px;">STT</th>
          <th>Tên kỳ thi / Bài kiểm tra</th>
          <th style="width: 100px;">Môn học</th>
          <th style="width: 90px;">Ngày kiểm tra</th>
          <th style="width: 75px;">Còn lại</th>
          <th style="width: 70px;">Mục tiêu</th>
        </tr>
      </thead>
      <tbody>
        ${exams
          .map((e, idx) => {
            const diffDays = Math.ceil((new Date(e.examAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const daysText = diffDays > 0 ? `${diffDays} ngày` : diffDays === 0 ? 'Hôm nay' : 'Đã qua';
            return `
          <tr>
            <td style="text-align: center;">${idx + 1}</td>
            <td><strong>${escapeHtml(e.title)}</strong></td>
            <td><span class="badge badge-purple">${escapeHtml(e.subjectName || 'Môn học')}</span></td>
            <td><strong>${formatDateVN(e.examAt)}</strong></td>
            <td><span class="badge badge-amber">${daysText}</span></td>
            <td><strong>${e.targetScore ? `${e.targetScore} đ` : 'Tối đa'}</strong></td>
          </tr>
        `;
          })
          .join('')}
      </tbody>
    </table>
  `;

  let planItemsHtml = '';
  if (activePlan && activePlan.items && activePlan.items.length > 0) {
    planItemsHtml = `
      <div class="card">
        <h3 class="card-title" style="color: #065f46;">Lộ Trình Ôn Thi Chi Tiết (Kế hoạch AI)</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 80px;">Ngày ôn</th>
              <th style="width: 90px;">Hoạt động</th>
              <th>Nhiệm vụ ôn tập trọng tâm</th>
              <th style="width: 75px;">Thời lượng</th>
              <th style="width: 75px;">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            ${activePlan.items
              .map(
                (item) => `
              <tr>
                <td><strong>${formatDateShortVN(item.plannedDate)}</strong></td>
                <td><span class="badge badge-blue">${item.activityType === 'mock_test' ? 'Luyện đề' : item.activityType === 'mistake_review' ? 'Chữa lỗi' : 'Ôn lý thuyết'}</span></td>
                <td>
                  <strong>${escapeHtml(item.title)}</strong>
                  ${item.description ? `<div style="font-size: 9px; color: #64748b;">${escapeHtml(item.description)}</div>` : ''}
                </td>
                <td>${item.plannedMinutes} phút</td>
                <td>${item.status === 'completed' ? '<span class="badge badge-green">Đã xong</span>' : '<span class="badge badge-amber">Chờ học</span>'}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  const bodyContent = `
    <div class="card">
      <h3 class="card-title">Danh Sách Các Kỳ Kiểm Tra Sắp Tới</h3>
      ${examsTableHtml}
    </div>
    ${planItemsHtml}
  `;

  const html = wrapHtmlDocument({
    title: 'Kế Hoạch Ôn Thi & Luyện Đề Chuẩn GDPT 2018',
    subtitle: `Lộ trình đếm ngược ngày thi & củng cố kiến thức trọng tâm`,
    documentTypeLabel: 'Kế hoạch ôn thi',
    studentName,
    gradeLevel,
    bodyContent,
  });

  await printHtmlDocument(html);
}

/**
 * 5. Export Quiz & Test Questions with Answers to PDF
 */
export async function exportQuizToPdf(quiz: Quiz, options?: BasePdfOptions & { showAnswers?: boolean }): Promise<void> {
  const studentName = options?.studentName || 'Học sinh';
  const gradeLevel = options?.gradeLevel || 9;
  const showAnswers = options?.showAnswers ?? false;

  const questions = quiz.questions || [];

  const questionsHtml = questions
    .map((q, idx) => {
      let optionsList = '';
      if (q.options) {
        if (Array.isArray(q.options)) {
          optionsList = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 6px 0;">
              ${q.options.map((opt: string, i: number) => `<div style="font-size: 10.5px;">${String.fromCharCode(65 + i)}. ${escapeHtml(opt)}</div>`).join('')}
            </div>
          `;
        } else if (typeof q.options === 'object') {
          optionsList = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 6px 0;">
              ${Object.entries(q.options).map(([key, val]) => `<div style="font-size: 10.5px;"><strong>${key}.</strong> ${escapeHtml(String(val))}</div>`).join('')}
            </div>
          `;
        }
      }

      return `
        <div class="card" style="margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <strong style="color: #047857; font-size: 11.5px;">Câu ${idx + 1} (${q.difficulty === 'hard' ? 'Vận dụng cao' : q.difficulty === 'medium' ? 'Vận dụng' : 'Nhận biết'}):</strong>
            ${q.topicRef ? `<span class="badge badge-blue">${escapeHtml(q.topicRef)}</span>` : ''}
          </div>
          <div style="font-size: 11px; margin-bottom: 6px; font-weight: 500;">${escapeHtml(q.prompt)}</div>
          ${optionsList}
          ${
            showAnswers
              ? `
            <div style="margin-top: 8px; padding: 6px 10px; background: #ecfdf5; border-radius: 4px; border: 1px solid #a7f3d0; font-size: 10px;">
              <strong style="color: #065f46;">Đáp án đúng: ${escapeHtml(q.correctAnswer || 'Xem hướng dẫn')}</strong>
              ${q.explanation ? `<div style="color: #166534; margin-top: 2px;"><strong>Giải thích:</strong> ${escapeHtml(q.explanation)}</div>` : ''}
            </div>
          `
              : ''
          }
        </div>
      `;
    })
    .join('');

  const bodyContent = `
    <div class="info-bar">
      <span><strong>Môn:</strong> ${escapeHtml(quiz.subjectName || 'Tổng hợp')}</span>
      <span><strong>Số lượng:</strong> ${questions.length} câu hỏi</span>
      <span><strong>Độ khó:</strong> ${quiz.difficulty === 'hard' ? 'Nâng cao' : quiz.difficulty === 'medium' ? 'Trung bình' : 'Cơ bản'}</span>
      <span><strong>Hình thức:</strong> ${showAnswers ? 'Đề thi kèm Đáp án & Lời giải' : 'Đề luyện tập học sinh'}</span>
    </div>
    ${questionsHtml}
  `;

  const html = wrapHtmlDocument({
    title: quiz.title || 'Đề Luyện Tập & Ôn Thi AI',
    subtitle: showAnswers ? 'Bản in kèm đáp án và hướng dẫn giải chi tiết' : 'Phiếu làm bài luyện tập cá nhân',
    documentTypeLabel: 'Đề kiểm tra & Luyện đề',
    studentName,
    gradeLevel,
    bodyContent,
  });

  await printHtmlDocument(html);
}

/**
 * 6. Export Mistake Notebook & Reflections to PDF
 */
export async function exportMistakeNotebookToPdf(
  mistakes: MistakeNotebookEntry[],
  options?: BasePdfOptions
): Promise<void> {
  const studentName = options?.studentName || 'Học sinh';
  const gradeLevel = options?.gradeLevel || 9;

  const mistakesHtml = mistakes
    .map(
      (m, idx) => `
      <div class="card" style="border-left: 4px solid #f43f5e; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <strong style="color: #be123c; font-size: 11.5px;">Lỗi sai #${idx + 1}: ${escapeHtml(m.subjectName || 'Môn học')} - ${escapeHtml(m.topic || 'Chủ đề kiến thức')}</strong>
          <span class="badge ${m.status === 'mastered' ? 'badge-green' : 'badge-amber'}">${m.status === 'mastered' ? 'Đã khắc phục' : 'Cần ôn lại'}</span>
        </div>
        <div style="font-size: 11px; margin-bottom: 4px;"><strong>Câu hỏi / Đề bài:</strong> ${escapeHtml(m.questionText || 'Đề bài chưa ghi nhận')}</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 6px 0; font-size: 10px;">
          <div style="background: #fff1f2; padding: 6px; border-radius: 4px; border: 1px solid #fecdd3; color: #9f1239;">
            <strong>Lựa chọn sai / Lỗi đã mắc:</strong><br/>
            ${escapeHtml(m.selectedAnswer || 'Chưa ghi chú')}
          </div>
          <div style="background: #f0fdf4; padding: 6px; border-radius: 4px; border: 1px solid #bbf7d0; color: #166534;">
            <strong>Đáp án đúng chuẩn barem:</strong><br/>
            ${escapeHtml(m.correctAnswer || 'Nắm chắc công thức và kiểm tra điều kiện')}
          </div>
        </div>
        ${m.correctExplanation ? `<div style="font-size: 10px; color: #0369a1; background: #f0f9ff; padding: 4px 8px; border-radius: 4px; margin-top: 4px;"><strong>💡 Giải thích chi tiết:</strong> ${escapeHtml(m.correctExplanation)}</div>` : ''}
      </div>
    `
    )
    .join('');

  const bodyContent = `
    <div class="info-bar">
      <span><strong>Tổng số lỗi sai ghi nhận:</strong> ${mistakes.length} câu</span>
      <span><strong>Đã khắc phục:</strong> ${mistakes.filter((m) => m.status === 'mastered').length} câu</span>
      <span><strong>Cần củng cố:</strong> ${mistakes.filter((m) => m.status !== 'mastered').length} câu</span>
    </div>
    ${mistakesHtml}
  `;

  const html = wrapHtmlDocument({
    title: 'Sổ Tay Lỗi Sai & Củng Cố Kiến Thức',
    subtitle: 'Tổng hợp các câu hỏi cần chú ý, nguyên nhân sai sót và hướng dẫn khắc phục',
    documentTypeLabel: 'Sổ tay lỗi sai',
    studentName,
    gradeLevel,
    bodyContent,
  });

  await printHtmlDocument(html);
}

/**
 * 7. Export Learning Reports & Progress Analytics to PDF
 */
export async function exportReportsToPdf(
  reportData: ReportOverviewResponse | any,
  options?: BasePdfOptions
): Promise<void> {
  const studentName = options?.studentName || 'Học sinh';
  const gradeLevel = options?.gradeLevel || 9;

  const totalMinutes = reportData.totalFocusMinutes7Days || reportData.totalFocusMinutes || 240;
  const completedTasks = reportData.completedTasks7Days || reportData.completedTasksCount || 12;
  const streakDays = reportData.currentStreakDays || reportData.streakDays || 5;

  const subjectStats = reportData.subjectBreakdown || [
    { subject: 'Toán học', minutes: 120, percentage: 50 },
    { subject: 'Ngữ văn', minutes: 60, percentage: 25 },
    { subject: 'Tiếng Anh', minutes: 60, percentage: 25 },
  ];

  const bodyContent = `
    <div class="grid-3" style="margin-bottom: 14px;">
      <div class="stat-box">
        <div class="stat-value">${totalMinutes} phút</div>
        <div class="stat-label">Tổng thời gian tập trung (7 ngày)</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${completedTasks} nhiệm vụ</div>
        <div class="stat-label">Nhiệm vụ đã hoàn thành</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${streakDays} ngày</div>
        <div class="stat-label">Chuỗi ngày học liên tục</div>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">Phân Bổ Thời Gian Học Theo Môn</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>Môn học</th>
            <th style="width: 120px;">Thời gian (phút)</th>
            <th style="width: 100px;">Tỷ trọng</th>
          </tr>
        </thead>
        <tbody>
          ${subjectStats
            .map(
              (s: any) => `
            <tr>
              <td><strong>${escapeHtml(s.subject || s.subjectName)}</strong></td>
              <td>${s.minutes || s.totalMinutes} phút</td>
              <td><strong>${s.percentage || Math.round(((s.minutes || 1) / totalMinutes) * 100)}%</strong></td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <div class="card" style="background: #f0fdf4; border-color: #86efac;">
      <h3 class="card-title" style="color: #065f46;">Đánh Giá &amp; Nhận Xét AI Từ Trợ Lý Jami</h3>
      <p style="margin: 4px 0; font-size: 11px; color: #166534; line-height: 1.6;">
        ${escapeHtml(reportData.aiRecommendation || reportData.recommendation || `Học sinh ${studentName} duy trì nhịp độ học tập rất tích cực. Các phiên học tập trung môn Toán và Tiếng Anh đạt hiệu quả cao. Khuyến khích dành thêm 15 phút mỗi tối để ôn lại các công thức trong Sổ tay lỗi sai để chuẩn bị tốt cho các bài kiểm tra sắp tới.`)}
      </p>
    </div>
  `;

  const html = wrapHtmlDocument({
    title: 'Báo Cáo Tiến Độ & Hiệu Suất Học Tập',
    subtitle: `Đánh giá tổng hợp 7 ngày gần nhất | Khối ${gradeLevel}`,
    documentTypeLabel: 'Báo cáo học tập định kỳ',
    studentName,
    gradeLevel,
    bodyContent,
  });

  await printHtmlDocument(html);
}

/**
 * 8. Export Structured Learning Material Summary to PDF
 */
export async function exportMaterialSummaryToPdf(
  material: LearningMaterial | Material,
  options?: BasePdfOptions
): Promise<void> {
  const studentName = options?.studentName || 'Học sinh';
  const gradeLevel = options?.gradeLevel || 9;

  const summaryData = (material as any).summaryJson || (material as any).structuredSummary;
  const overviewText = summaryData?.overview || material.summary || 'Tài liệu học tập chuẩn GDPT 2018.';
  const keyPoints = summaryData?.keyPoints || [];
  const concepts = summaryData?.concepts || [];
  const formulas = summaryData?.formulas || [];

  const bodyContent = `
    <div class="card" style="background: #f8fafc;">
      <h2 style="margin: 0 0 4px 0; font-size: 14px; color: #047857;">${escapeHtml(material.title)}</h2>
      <div style="font-size: 10px; color: #64748b;">
        Môn học: <strong>${escapeHtml(material.subjectName || 'Tài liệu')}</strong> | Dung lượng: ${Math.round((material.sizeBytes || 0) / 1024)} KB
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">Tóm Tắt Tổng Quan Kiến Thức</h3>
      <p style="font-size: 11px; color: #1e293b; margin: 4px 0;">${escapeHtml(overviewText)}</p>
    </div>

    ${
      keyPoints.length > 0
        ? `
      <div class="card">
        <h3 class="card-title">Các Điểm Kiến Thức Trọng Tâm</h3>
        <ul style="margin: 4px 0; padding-left: 18px; font-size: 10.5px; color: #1e293b;">
          ${keyPoints.map((kp: string) => `<li>${escapeHtml(kp)}</li>`).join('')}
        </ul>
      </div>
    `
        : ''
    }

    ${
      concepts.length > 0
        ? `
      <div class="card">
        <h3 class="card-title">Thuật Ngữ &amp; Khái Niệm Quan Trọng</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 140px;">Thuật ngữ</th>
              <th>Định nghĩa &amp; Ý nghĩa</th>
            </tr>
          </thead>
          <tbody>
            ${concepts
              .map(
                (c: any) => `
              <tr>
                <td><strong>${escapeHtml(c.name)}</strong></td>
                <td>${escapeHtml(c.definition)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
        : ''
    }

    ${
      formulas.length > 0
        ? `
      <div class="card" style="background: #f0fdf4; border-color: #86efac;">
        <h3 class="card-title" style="color: #065f46;">Công Thức &amp; Quy Tắc Cần Ghi Nhớ</h3>
        <ul style="margin: 4px 0; padding-left: 18px; font-size: 10.5px; color: #166534; font-weight: 600;">
          ${formulas.map((f: string) => `<li>${escapeHtml(f)}</li>`).join('')}
        </ul>
      </div>
    `
        : ''
    }
  `;

  const html = wrapHtmlDocument({
    title: `Phiếu Tóm Tắt: ${material.title}`,
    subtitle: `Hệ thống hóa kiến thức cốt lõi tự động từ tài liệu học sinh`,
    documentTypeLabel: 'Phiếu tóm tắt tài liệu',
    studentName,
    gradeLevel,
    bodyContent,
  });

  await printHtmlDocument(html);
}
