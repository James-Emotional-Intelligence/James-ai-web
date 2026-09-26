import type { TimetableEntry, BusyEvent } from '../../shared/types';
import { formatDateVN, formatDateShortVN } from './utils';
import { getISOWeekInfo } from './week-utils';

export interface TimetablePdfExportOptions {
  timetableName?: string;
  weekDays: Array<{
    dayOfWeek: number; // 1 (Mon) - 7 (Sun)
    date: Date;
    dateStr: string;
    label: string;
    isToday?: boolean;
  }>;
  timetableEntries: TimetableEntry[];
  busyEvents?: BusyEvent[];
  studentName?: string;
  className?: string;
}

const busyTypeLabels: Record<string, string> = {
  extra_class: 'Học thêm',
  club: 'Câu lạc bộ',
  personal: 'Việc cá nhân',
  commute: 'Di chuyển',
  meal: 'Bữa ăn',
  sleep: 'Nghỉ ngơi',
};

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
 * Generates an A4 Landscape print-ready HTML string for the School Timetable.
 */
export function generateTimetableHtml(options: TimetablePdfExportOptions): string {
  const {
    timetableName = 'Thời khóa biểu chính khóa',
    weekDays,
    timetableEntries = [],
    busyEvents = [],
    studentName,
    className,
  } = options;

  const firstDay = weekDays[0]?.date || new Date();
  const lastDay = weekDays[weekDays.length - 1]?.date || new Date();
  const weekInfo = getISOWeekInfo(firstDay);
  const printDateStr = formatDateVN(new Date());

  const dayHeaders = weekDays.map((d) => {
    return {
      dayOfWeek: d.dayOfWeek,
      label: d.label,
      dateShort: formatDateShortVN(d.date),
      isToday: d.isToday,
    };
  });

  const weekStartMs = new Date(firstDay).setHours(0, 0, 0, 0);
  const weekEndMs = new Date(lastDay).setHours(23, 59, 59, 999);

  const relevantBusyEvents = busyEvents.filter((b) => {
    if (!b.startsAt) return false;
    const eventStart = new Date(b.startsAt).getTime();
    return eventStart >= weekStartMs && eventStart <= weekEndMs;
  });

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(timetableName)} - JAMI AI</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 8mm 8mm 8mm 8mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Be Vietnam Pro", sans-serif;
      font-size: 11px;
      line-height: 1.35;
      color: #0f172a;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-container {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #16a34a;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .brand-section {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand-badge {
      background: #16a34a;
      color: #ffffff;
      font-weight: 900;
      font-size: 12px;
      padding: 3px 8px;
      border-radius: 6px;
      letter-spacing: 0.5px;
    }
    .brand-sub {
      font-size: 9px;
      font-weight: 700;
      color: #15803d;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .doc-title {
      font-size: 18px;
      font-weight: 900;
      color: #0f172a;
      margin: 2px 0 0 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .meta-section {
      text-align: right;
      font-size: 10px;
      color: #475569;
    }
    .meta-row {
      margin-bottom: 2px;
    }
    .meta-highlight {
      font-weight: 700;
      color: #0f172a;
    }
    .meta-tag {
      display: inline-block;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 9px;
      margin-left: 4px;
    }
    .section-heading {
      font-size: 12px;
      font-weight: 800;
      color: #166534;
      background: #f0fdf4;
      border-left: 4px solid #16a34a;
      padding: 4px 8px;
      margin: 10px 0 6px 0;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .timetable-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 6px;
      margin-bottom: 12px;
    }
    .day-column {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #f8fafc;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .day-column.today {
      border-color: #16a34a;
      box-shadow: 0 0 0 1px #16a34a;
    }
    .day-header {
      background: #e2e8f0;
      padding: 5px 6px;
      text-align: center;
      border-bottom: 1px solid #cbd5e1;
    }
    .day-column.today .day-header {
      background: #16a34a;
      color: #ffffff;
    }
    .day-title {
      font-weight: 800;
      font-size: 11px;
    }
    .day-date {
      font-size: 9px;
      opacity: 0.85;
      font-weight: 600;
    }
    .entries-container {
      padding: 6px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-height: 180px;
      flex-grow: 1;
    }
    .entry-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-left: 3px solid #16a34a;
      border-radius: 6px;
      padding: 5px 6px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .entry-card.skipped {
      border-left-color: #f59e0b;
      background: #fffbeb;
      opacity: 0.75;
    }
    .entry-time {
      font-size: 9px;
      font-weight: 700;
      color: #166534;
      background: #f0fdf4;
      display: inline-block;
      padding: 1px 4px;
      border-radius: 3px;
      margin-bottom: 3px;
    }
    .entry-title {
      font-weight: 800;
      font-size: 11px;
      color: #0f172a;
      margin-bottom: 2px;
      line-height: 1.25;
    }
    .entry-meta {
      font-size: 9px;
      color: #64748b;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .entry-teacher {
      color: #047857;
      font-weight: 600;
    }
    .entry-skipped-badge {
      font-size: 8px;
      font-weight: 700;
      color: #b45309;
      background: #fef3c7;
      border: 1px solid #fde68a;
      padding: 1px 3px;
      border-radius: 3px;
      display: inline-block;
      margin-top: 2px;
    }
    .empty-day {
      text-align: center;
      color: #94a3b8;
      font-size: 10px;
      padding: 30px 4px;
      font-style: italic;
    }
    .busy-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      margin-top: 6px;
      page-break-inside: avoid;
    }
    .busy-table th, .busy-table td {
      border: 1px solid #cbd5e1;
      padding: 5px 8px;
      text-align: left;
    }
    .busy-table th {
      background: #f1f5f9;
      font-weight: 800;
      color: #334155;
    }
    .busy-table tr:nth-child(even) {
      background: #f8fafc;
    }
    .footer {
      margin-top: 14px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9px;
      color: #64748b;
    }
    .footer-slogan {
      font-style: italic;
      font-weight: 600;
      color: #166534;
    }
  </style>
</head>
<body>
  <div class="print-container">
    <!-- Header -->
    <div class="header">
      <div>
        <div class="brand-section">
          <span class="brand-badge">JAMI AI</span>
          <span class="brand-sub">Trợ lý học tập thông minh</span>
        </div>
        <h1 class="doc-title">${escapeHtml(timetableName)}</h1>
      </div>
      <div class="meta-section">
        <div class="meta-row">
          <span>Tuần học:</span>
          <span class="meta-highlight">Tuần ${weekInfo.weekNumber}/${weekInfo.weekYear}</span>
          <span class="meta-tag">${formatDateVN(firstDay)} – ${formatDateVN(lastDay)}</span>
        </div>
        ${studentName || className ? `
          <div class="meta-row">
            ${studentName ? `<span>Học sinh: <strong class="meta-highlight">${escapeHtml(studentName)}</strong></span> ` : ''}
            ${className ? `<span>• Lớp: <strong class="meta-highlight">${escapeHtml(className)}</strong></span>` : ''}
          </div>
        ` : ''}
        <div class="meta-row">
          <span>Ngày xuất: ${printDateStr}</span>
        </div>
      </div>
    </div>

    <!-- Main Grid: School Timetable -->
    <div class="section-heading">I. Lịch Chính Khóa (Trường Học)</div>
    <div class="timetable-grid">
      ${dayHeaders.map((dh) => {
        const dayEntries = timetableEntries
          .filter((e) => e.dayOfWeek === dh.dayOfWeek)
          .sort((a, b) => a.startLocalTime.localeCompare(b.startLocalTime));

        return `
          <div class="day-column ${dh.isToday ? 'today' : ''}">
            <div class="day-header">
              <div class="day-title">${dh.label}</div>
              <div class="day-date">${dh.dateShort}</div>
            </div>
            <div class="entries-container">
              ${dayEntries.length > 0 ? dayEntries.map((e) => {
                const isSkipped = !!e.isSkippedThisWeek;
                return `
                  <div class="entry-card ${isSkipped ? 'skipped' : ''}">
                    <div class="entry-time">${escapeHtml(e.startLocalTime)} – ${escapeHtml(e.endLocalTime)}</div>
                    <div class="entry-title">${escapeHtml(e.title)}</div>
                    <div class="entry-meta">
                      ${e.teacher ? `<div class="entry-teacher">GV: ${escapeHtml(e.teacher)}</div>` : ''}
                      ${e.location || e.room ? `<div>P: ${escapeHtml(e.location || e.room)}</div>` : ''}
                      ${isSkipped ? `<div class="entry-skipped-badge">Nghỉ tuần này</div>` : ''}
                    </div>
                  </div>
                `;
              }).join('') : `
                <div class="empty-day">— Nghỉ —</div>
              `}
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <!-- Extra Activities (if any) -->
    ${relevantBusyEvents.length > 0 ? `
      <div class="section-heading">II. Lịch Học Thêm, Bồi Dưỡng & Hoạt Động Khác</div>
      <table class="busy-table">
        <thead>
          <tr>
            <th style="width: 35px; text-align: center;">STT</th>
            <th>Hoạt động / Môn học</th>
            <th style="width: 120px;">Phân loại</th>
            <th style="width: 170px;">Thời gian</th>
            <th>Địa điểm</th>
          </tr>
        </thead>
        <tbody>
          ${relevantBusyEvents.map((b, idx) => {
            const startD = b.startsAt ? new Date(b.startsAt) : null;
            const endD = b.endsAt ? new Date(b.endsAt) : null;
            const timeStr = startD && endD
              ? `${formatDateVN(startD)} (${startD.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${endD.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})`
              : (b.startsAt || '—');
            return `
              <tr>
                <td style="text-align: center; font-weight: 700;">${idx + 1}</td>
                <td style="font-weight: 700; color: #0f172a;">${escapeHtml(b.title)}</td>
                <td>${escapeHtml(busyTypeLabels[b.type || b.eventType || ''] || b.type || 'Học thêm')}</td>
                <td>${escapeHtml(timeStr)}</td>
                <td>${escapeHtml(b.location || '—')}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    ` : ''}

    <!-- Footer -->
    <div class="footer">
      <div class="footer-slogan">Jami AI — Tối ưu hóa thời gian tự học & Nâng cao hiệu quả học tập</div>
      <div>Thời khóa biểu được tạo tự động bởi Jami AI • In / Xuất tệp PDF</div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Triggers the browser's native Print to PDF dialog using a hidden iframe.
 */
export async function exportTimetableToPdf(options: TimetablePdfExportOptions): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const htmlContent = generateTimetableHtml(options);

  return new Promise((resolve, reject) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.opacity = '0';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('title', 'Timetable Print View');

      document.body.appendChild(iframe);

      const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!frameDoc) {
        document.body.removeChild(iframe);
        throw new Error('Không thể khởi tạo tài liệu in thời khóa biểu');
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
          }, 1000);
        } catch (printErr) {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          reject(printErr);
        }
      };

      // Ensure content is loaded
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
