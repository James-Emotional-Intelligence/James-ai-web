import{r as j,c as y}from"./vendor-react-n4BKtHzQ.js";import{az as k,J as L}from"./vendor-icons-BD1a0xSg.js";import{e as f,d as T}from"./index-EULQylDo.js";const H=({onClick:e,onExport:s,label:c="In PDF",tooltip:p="In hoặc Lưu thành file PDF",className:o="",variant:i="outline",size:d="md",iconOnly:a=!1,documentTitle:h,disabled:t=!1})=>{const[r,l]=j.useState(!1),g=async $=>{if($.preventDefault(),$.stopPropagation(),!(t||r)){l(!0);try{const x=s||e;if(x)await x();else{const N=document.title;h&&(document.title=h),window.print(),setTimeout(()=>{h&&(document.title=N)},1e3)}}catch(x){console.error("[PrintPdfButton] Error printing/exporting PDF:",x)}finally{l(!1)}}},m="inline-flex items-center justify-center font-bold transition-all duration-200 focus:outline-none cursor-pointer select-none no-print",w={sm:a?"p-1.5 rounded-lg text-xs":"px-2.5 py-1.5 rounded-lg text-xs gap-1.5",md:a?"p-2 rounded-xl text-sm":"px-3.5 py-2 rounded-xl text-sm gap-2",lg:a?"p-2.5 rounded-xl text-base":"px-4 py-2.5 rounded-xl text-base gap-2.5"},C={primary:"bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] shadow-md shadow-[#16A34A]/20 hover:shadow-[#16A34A]/40 active:scale-95",secondary:"bg-[#1B3524] hover:bg-[#275236] text-[#86EFAC] border border-[#22C55E]/30 active:scale-95",outline:"bg-[#0B120D]/80 hover:bg-[#142219] text-[#A9B8AE] hover:text-[#F3FAF5] border border-[#22C55E]/20 hover:border-[#22C55E]/40 active:scale-95",ghost:"bg-transparent hover:bg-[#142219] text-[#A9B8AE] hover:text-[#F3FAF5] active:scale-95",icon:"bg-[#0B120D]/80 hover:bg-[#142219] text-[#86EFAC] border border-[#22C55E]/20 hover:border-[#22C55E]/40 active:scale-95"},v=d==="sm"?14:d==="lg"?18:16;return y.jsxDEV("button",{type:"button",onClick:g,disabled:t||r,title:p,"aria-label":c,className:`${m} ${w[d]} ${C[i]} ${t?"opacity-50 cursor-not-allowed":""} ${o}`,children:[r?y.jsxDEV(k,{size:v,className:"animate-spin text-[#22C55E]"},void 0,!1,{fileName:"D:/website/jami ai/src/components/common/PrintPdfButton.tsx",lineNumber:88,columnNumber:9},void 0):y.jsxDEV(L,{size:v,className:"shrink-0 text-[#22C55E]"},void 0,!1,{fileName:"D:/website/jami ai/src/components/common/PrintPdfButton.tsx",lineNumber:90,columnNumber:9},void 0),!a&&y.jsxDEV("span",{children:r?"Đang tạo PDF...":c},void 0,!1,{fileName:"D:/website/jami ai/src/components/common/PrintPdfButton.tsx",lineNumber:92,columnNumber:21},void 0)]},void 0,!0,{fileName:"D:/website/jami ai/src/components/common/PrintPdfButton.tsx",lineNumber:79,columnNumber:5},void 0)};function n(e){return e?String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"):""}function b(e){return new Promise((s,c)=>{var p,o;try{const i=document.createElement("iframe");i.style.position="fixed",i.style.right="0",i.style.bottom="0",i.style.width="0",i.style.height="0",i.style.border="none",i.style.zIndex="-9999",document.body.appendChild(i);const d=i.contentDocument||((p=i.contentWindow)==null?void 0:p.document);if(!d)throw document.body.removeChild(i),new Error("Không thể khởi tạo tài liệu in PDF");d.open(),d.write(e),d.close();const a=()=>{try{i.contentWindow&&(i.contentWindow.focus(),i.contentWindow.print()),setTimeout(()=>{document.body.contains(i)&&document.body.removeChild(i),s()},1200)}catch(h){document.body.contains(i)&&document.body.removeChild(i),c(h)}};((o=i.contentDocument)==null?void 0:o.readyState)==="complete"?setTimeout(a,250):i.onload=()=>setTimeout(a,250)}catch(i){c(i)}})}function u(e){const{title:s,subtitle:c,documentTypeLabel:p,studentName:o="Học sinh",gradeLevel:i,orientation:d="portrait",bodyContent:a}=e,h=f(new Date);return`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>${n(s)} - JAMI AI</title>
  <style>
    @page {
      size: A4 ${d};
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
          <div><strong>Loại tài liệu:</strong> ${n(p)}</div>
          <div><strong>Học sinh:</strong> ${n(o)}${i?` (Lớp ${i})`:""}</div>
          <div><strong>Ngày in:</strong> ${h}</div>
        </td>
      </tr>
    </table>

    <div class="doc-title-area">
      <h1 class="doc-title">${n(s)}</h1>
      ${c?`<p class="doc-subtitle">${n(c)}</p>`:""}
    </div>

    ${a}

    <div class="footer">
      <div>© JAMI AI Companion - Bản in lưu hành học tập cá nhân</div>
      <div>Trang 1 / Tài liệu trích xuất tự động</div>
    </div>
  </div>
</body>
</html>`}async function M(e,s,c){const p=(c==null?void 0:c.studentName)||e.studentName||"Học sinh",o=(c==null?void 0:c.gradeLevel)||e.gradeLevel||9,i=e.timetable.todaySessions.length===0?'<p style="color: #64748b; font-style: italic;">Hôm nay không có tiết học chính khóa.</p>':`
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 120px;">Thời gian</th>
            <th>Môn học / Tiết học</th>
            <th style="width: 90px;">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          ${e.timetable.todaySessions.map(t=>`
            <tr>
              <td><strong>${n(t.time)}</strong></td>
              <td>${n(t.title)}${t.subject?` (${n(t.subject)})`:""}</td>
              <td><span class="badge badge-green">Chính khóa</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;let d="";s&&s.items&&s.items.length>0&&(d=`
      <div class="card">
        <h3 class="card-title" style="color: #065f46;">Phiếu Chuẩn Bị Bài Ngày Mai (${n(s.targetDate)})</h3>
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
            ${s.items.map(t=>`
              <tr>
                <td>${n(t.startAt)} - ${n(t.endAt)}</td>
                <td><strong>${n(t.subjectName||"Môn học")}</strong></td>
                <td>
                  <div><strong>${n(t.title)}</strong></div>
                  ${t.description?`<div style="font-size: 9.5px; color: #64748b;">${n(t.description)}</div>`:""}
                </td>
                <td>${t.plannedMinutes} phút</td>
                <td>
                  <span class="badge ${t.priority==="high"?"badge-rose":t.priority==="medium"?"badge-amber":"badge-blue"}">
                    ${t.priority==="high"?"Cao":t.priority==="medium"?"Trung bình":"Tiêu chuẩn"}
                  </span>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `);const a=`
    <div class="grid-3" style="margin-bottom: 12px;">
      <div class="stat-box">
        <div class="stat-value">${e.todayStudy.completedMinutes} / ${e.todayStudy.plannedMinutes} phút</div>
        <div class="stat-label">Thời gian học hôm nay</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${e.tasks.todayTasksCount} nhiệm vụ</div>
        <div class="stat-label">Nhiệm vụ cần hoàn thành</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${e.todayStudy.streakDays} ngày</div>
        <div class="stat-label">Chuỗi học tập liên tục</div>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">Lịch Học &amp; Tiết Học Trong Ngày</h3>
      ${i}
    </div>

    ${d}

    ${e.jami.latestMessage?`
      <div class="card" style="background: #f0fdf4; border-color: #a7f3d0;">
        <h4 style="margin: 0 0 4px 0; color: #047857; font-size: 11.5px;">Lời nhắn từ Trợ lý Robot Jami:</h4>
        <div style="font-size: 10.5px; color: #166534; font-style: italic;">"${n(e.jami.latestMessage)}"</div>
      </div>
    `:""}
  `,h=u({title:"Kế Hoạch Học Tập & Chuẩn Bị Bài",subtitle:`Hôm nay: ${f(new Date)}`,documentTypeLabel:"Kế hoạch học tập ngày",studentName:p,gradeLevel:o,bodyContent:a});await b(h)}async function S(e,s){const c="Học sinh",o=e.filter(r=>r.priority==="high"),i=e.filter(r=>r.priority==="medium"),d=e.filter(r=>r.priority!=="high"&&r.priority!=="medium"),a=r=>r.length===0?'<p style="color: #94a3b8; font-style: italic; font-size: 10px;">Không có nhiệm vụ trong nhóm này.</p>':`
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
          ${r.map((l,g)=>`
            <tr>
              <td style="text-align: center;">${g+1}</td>
              <td>
                <strong>${n(l.title)}</strong>
                ${l.objective?`<div style="font-size: 9px; color: #64748b;">${n(l.objective)}</div>`:""}
              </td>
              <td><span class="badge badge-blue">${n(l.subjectName||"Môn học")}</span></td>
              <td>${l.estimatedMinutes} phút</td>
              <td>${l.dueAt?T(l.dueAt):"Trong ngày"}</td>
              <td>${l.difficulty==="hard"?"Nâng cao":l.difficulty==="medium"?"Vận dụng":"Cơ bản"}</td>
              <td><strong>${l.completionPercent||0}%</strong></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `,h=`
    <div class="card" style="border-left: 4px solid #ef4444;">
      <h3 class="card-title" style="color: #b91c1c;">Nhiệm Vụ Ưu Tiên Cao (Cần hoàn thành trước) - ${o.length} nhiệm vụ</h3>
      ${a(o)}
    </div>

    <div class="card" style="border-left: 4px solid #f59e0b;">
      <h3 class="card-title" style="color: #b45309;">Nhiệm Vụ Tiêu Chuẩn &amp; Rèn Luyện - ${i.length} nhiệm vụ</h3>
      ${a(i)}
    </div>

    ${d.length>0?`
      <div class="card" style="border-left: 4px solid #3b82f6;">
        <h3 class="card-title" style="color: #1d4ed8;">Nhiệm Vụ Mở Rộng &amp; Tự Học - ${d.length} nhiệm vụ</h3>
        ${a(d)}
      </div>
    `:""}
  `,t=u({title:"Danh Sách Nhiệm Vụ Học Tập GDPT 2018",subtitle:`Tổng cộng: ${e.length} nhiệm vụ | Xuất bản lúc: ${f(new Date)}`,documentTypeLabel:"Bảng nhiệm vụ học tập",studentName:c,gradeLevel:9,bodyContent:h});await b(t)}async function D(e,s,c){const p="Học sinh",i=s||e.executionGuide;let d='<p style="color: #64748b; font-style: italic;">Chưa có các bước hướng dẫn cụ thể.</p>';i&&i.steps&&i.steps.length>0&&(d=i.steps.map((t,r)=>`
        <div class="card" style="margin-bottom: 8px; background: #fafafa;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="color: #047857; font-size: 11.5px;">Bước ${t.stepOrder??r+1}: ${n(t.title)}</strong>
            <span class="badge badge-green">${t.plannedMinutes||10} phút</span>
          </div>
          ${t.instruction?`<p style="margin: 4px 0; color: #1e293b;">${n(t.instruction)}</p>`:""}
          ${t.expectedOutput?`<div style="font-size: 9.5px; color: #334155; margin-top: 2px;"><strong>Kết quả cần đạt:</strong> ${n(t.expectedOutput)}</div>`:""}
          ${t.tips&&t.tips.length>0?`<div style="font-size: 9.5px; color: #0284c7; background: #f0f9ff; padding: 4px 8px; border-radius: 4px; margin-top: 4px;">💡 <strong>Mẹo Jami:</strong> ${n(t.tips.join("; "))}</div>`:""}
        </div>
      `).join(""));const a=`
    <div class="card" style="background: #f8fafc;">
      <h2 style="margin: 0 0 6px 0; font-size: 14px; color: #0f172a;">${n(e.title)}</h2>
      <div style="display: flex; gap: 12px; font-size: 10px; color: #475569; margin-bottom: 8px;">
        <span><strong>Môn học:</strong> ${n(e.subjectName||"Chung")}</span>
        <span><strong>Thời lượng ước tính:</strong> ${e.estimatedMinutes} phút</span>
        <span><strong>Mức ưu tiên:</strong> ${e.priority==="high"?"Cao":"Tiêu chuẩn"}</span>
        <span><strong>Hạn nộp:</strong> ${e.dueAt?f(e.dueAt):"Trong ngày"}</span>
      </div>
      ${e.objective?`<div style="font-size: 10.5px; color: #334155; padding: 6px 10px; background: #ffffff; border-radius: 4px; border: 1px solid #e2e8f0;"><strong>Mục tiêu:</strong> ${n(e.objective)}</div>`:""}
    </div>

    <div class="card">
      <h3 class="card-title">Hướng Dẫn Từng Bước Thực Hiện</h3>
      ${d}
    </div>
  `,h=u({title:`Phiếu Hướng Dẫn: ${e.title}`,subtitle:"Hướng dẫn thực hiện từng bước cá nhân hóa bởi JAMI AI",documentTypeLabel:"Phiếu hướng dẫn học tập",studentName:p,gradeLevel:9,bodyContent:a});await b(h)}async function B(e,s,c){const p="Học sinh",i=`
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
        ${e.map((t,r)=>{const l=Math.ceil((new Date(t.examAt).getTime()-Date.now())/864e5),g=l>0?`${l} ngày`:l===0?"Hôm nay":"Đã qua";return`
          <tr>
            <td style="text-align: center;">${r+1}</td>
            <td><strong>${n(t.title)}</strong></td>
            <td><span class="badge badge-purple">${n(t.subjectName||"Môn học")}</span></td>
            <td><strong>${f(t.examAt)}</strong></td>
            <td><span class="badge badge-amber">${g}</span></td>
            <td><strong>${t.targetScore?`${t.targetScore} đ`:"Tối đa"}</strong></td>
          </tr>
        `}).join("")}
      </tbody>
    </table>
  `;let d="";s&&s.items&&s.items.length>0&&(d=`
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
            ${s.items.map(t=>`
              <tr>
                <td><strong>${T(t.plannedDate)}</strong></td>
                <td><span class="badge badge-blue">${t.activityType==="mock_test"?"Luyện đề":t.activityType==="mistake_review"?"Chữa lỗi":"Ôn lý thuyết"}</span></td>
                <td>
                  <strong>${n(t.title)}</strong>
                  ${t.description?`<div style="font-size: 9px; color: #64748b;">${n(t.description)}</div>`:""}
                </td>
                <td>${t.plannedMinutes} phút</td>
                <td>${t.status==="completed"?'<span class="badge badge-green">Đã xong</span>':'<span class="badge badge-amber">Chờ học</span>'}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `);const a=`
    <div class="card">
      <h3 class="card-title">Danh Sách Các Kỳ Kiểm Tra Sắp Tới</h3>
      ${i}
    </div>
    ${d}
  `,h=u({title:"Kế Hoạch Ôn Thi & Luyện Đề Chuẩn GDPT 2018",subtitle:"Lộ trình đếm ngược ngày thi & củng cố kiến thức trọng tâm",documentTypeLabel:"Kế hoạch ôn thi",studentName:p,gradeLevel:9,bodyContent:a});await b(h)}async function E(e,s){const c=(s==null?void 0:s.studentName)||"Học sinh",p=(s==null?void 0:s.gradeLevel)||9,o=(s==null?void 0:s.showAnswers)??!1,i=e.questions||[],d=i.map((t,r)=>{let l="";return t.options&&(Array.isArray(t.options)?l=`
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 6px 0;">
              ${t.options.map((g,m)=>`<div style="font-size: 10.5px;">${String.fromCharCode(65+m)}. ${n(g)}</div>`).join("")}
            </div>
          `:typeof t.options=="object"&&(l=`
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 6px 0;">
              ${Object.entries(t.options).map(([g,m])=>`<div style="font-size: 10.5px;"><strong>${g}.</strong> ${n(String(m))}</div>`).join("")}
            </div>
          `)),`
        <div class="card" style="margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <strong style="color: #047857; font-size: 11.5px;">Câu ${r+1} (${t.difficulty==="hard"?"Vận dụng cao":t.difficulty==="medium"?"Vận dụng":"Nhận biết"}):</strong>
            ${t.topicRef?`<span class="badge badge-blue">${n(t.topicRef)}</span>`:""}
          </div>
          <div style="font-size: 11px; margin-bottom: 6px; font-weight: 500;">${n(t.prompt)}</div>
          ${l}
          ${o?`
            <div style="margin-top: 8px; padding: 6px 10px; background: #ecfdf5; border-radius: 4px; border: 1px solid #a7f3d0; font-size: 10px;">
              <strong style="color: #065f46;">Đáp án đúng: ${n(t.correctAnswer||"Xem hướng dẫn")}</strong>
              ${t.explanation?`<div style="color: #166534; margin-top: 2px;"><strong>Giải thích:</strong> ${n(t.explanation)}</div>`:""}
            </div>
          `:""}
        </div>
      `}).join(""),a=`
    <div class="info-bar">
      <span><strong>Môn:</strong> ${n(e.subjectName||"Tổng hợp")}</span>
      <span><strong>Số lượng:</strong> ${i.length} câu hỏi</span>
      <span><strong>Độ khó:</strong> ${e.difficulty==="hard"?"Nâng cao":e.difficulty==="medium"?"Trung bình":"Cơ bản"}</span>
      <span><strong>Hình thức:</strong> ${o?"Đề thi kèm Đáp án & Lời giải":"Đề luyện tập học sinh"}</span>
    </div>
    ${d}
  `,h=u({title:e.title||"Đề Luyện Tập & Ôn Thi AI",subtitle:o?"Bản in kèm đáp án và hướng dẫn giải chi tiết":"Phiếu làm bài luyện tập cá nhân",documentTypeLabel:"Đề kiểm tra & Luyện đề",studentName:c,gradeLevel:p,bodyContent:a});await b(h)}async function F(e,s){const c="Học sinh",o=e.map((a,h)=>`
      <div class="card" style="border-left: 4px solid #f43f5e; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <strong style="color: #be123c; font-size: 11.5px;">Lỗi sai #${h+1}: ${n(a.subjectName||"Môn học")} - ${n(a.topic||"Chủ đề kiến thức")}</strong>
          <span class="badge ${a.status==="mastered"?"badge-green":"badge-amber"}">${a.status==="mastered"?"Đã khắc phục":"Cần ôn lại"}</span>
        </div>
        <div style="font-size: 11px; margin-bottom: 4px;"><strong>Câu hỏi / Đề bài:</strong> ${n(a.questionText||"Đề bài chưa ghi nhận")}</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 6px 0; font-size: 10px;">
          <div style="background: #fff1f2; padding: 6px; border-radius: 4px; border: 1px solid #fecdd3; color: #9f1239;">
            <strong>Lựa chọn sai / Lỗi đã mắc:</strong><br/>
            ${n(a.selectedAnswer||"Chưa ghi chú")}
          </div>
          <div style="background: #f0fdf4; padding: 6px; border-radius: 4px; border: 1px solid #bbf7d0; color: #166534;">
            <strong>Đáp án đúng chuẩn barem:</strong><br/>
            ${n(a.correctAnswer||"Nắm chắc công thức và kiểm tra điều kiện")}
          </div>
        </div>
        ${a.correctExplanation?`<div style="font-size: 10px; color: #0369a1; background: #f0f9ff; padding: 4px 8px; border-radius: 4px; margin-top: 4px;"><strong>💡 Giải thích chi tiết:</strong> ${n(a.correctExplanation)}</div>`:""}
      </div>
    `).join(""),i=`
    <div class="info-bar">
      <span><strong>Tổng số lỗi sai ghi nhận:</strong> ${e.length} câu</span>
      <span><strong>Đã khắc phục:</strong> ${e.filter(a=>a.status==="mastered").length} câu</span>
      <span><strong>Cần củng cố:</strong> ${e.filter(a=>a.status!=="mastered").length} câu</span>
    </div>
    ${o}
  `,d=u({title:"Sổ Tay Lỗi Sai & Củng Cố Kiến Thức",subtitle:"Tổng hợp các câu hỏi cần chú ý, nguyên nhân sai sót và hướng dẫn khắc phục",documentTypeLabel:"Sổ tay lỗi sai",studentName:c,gradeLevel:9,bodyContent:i});await b(d)}async function K(e,s){const c=(s==null?void 0:s.studentName)||"Học sinh",p=(s==null?void 0:s.gradeLevel)||9,o=e.totalFocusMinutes7Days||e.totalFocusMinutes||240,i=e.completedTasks7Days||e.completedTasksCount||12,d=e.currentStreakDays||e.streakDays||5,a=e.subjectBreakdown||[{subject:"Toán học",minutes:120,percentage:50},{subject:"Ngữ văn",minutes:60,percentage:25},{subject:"Tiếng Anh",minutes:60,percentage:25}],h=`
    <div class="grid-3" style="margin-bottom: 14px;">
      <div class="stat-box">
        <div class="stat-value">${o} phút</div>
        <div class="stat-label">Tổng thời gian tập trung (7 ngày)</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${i} nhiệm vụ</div>
        <div class="stat-label">Nhiệm vụ đã hoàn thành</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${d} ngày</div>
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
          ${a.map(r=>`
            <tr>
              <td><strong>${n(r.subject||r.subjectName)}</strong></td>
              <td>${r.minutes||r.totalMinutes} phút</td>
              <td><strong>${r.percentage||Math.round((r.minutes||1)/o*100)}%</strong></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <div class="card" style="background: #f0fdf4; border-color: #86efac;">
      <h3 class="card-title" style="color: #065f46;">Đánh Giá &amp; Nhận Xét AI Từ Trợ Lý Jami</h3>
      <p style="margin: 4px 0; font-size: 11px; color: #166534; line-height: 1.6;">
        ${n(e.aiRecommendation||e.recommendation||`Học sinh ${c} duy trì nhịp độ học tập rất tích cực. Các phiên học tập trung môn Toán và Tiếng Anh đạt hiệu quả cao. Khuyến khích dành thêm 15 phút mỗi tối để ôn lại các công thức trong Sổ tay lỗi sai để chuẩn bị tốt cho các bài kiểm tra sắp tới.`)}
      </p>
    </div>
  `,t=u({title:"Báo Cáo Tiến Độ & Hiệu Suất Học Tập",subtitle:`Đánh giá tổng hợp 7 ngày gần nhất | Khối ${p}`,documentTypeLabel:"Báo cáo học tập định kỳ",studentName:c,gradeLevel:p,bodyContent:h});await b(t)}async function I(e,s){const c=(s==null?void 0:s.studentName)||"Học sinh",p=(s==null?void 0:s.gradeLevel)||9,o=e.summaryJson||e.structuredSummary,i=(o==null?void 0:o.overview)||e.summary||"Tài liệu học tập chuẩn GDPT 2018.",d=(o==null?void 0:o.keyPoints)||[],a=(o==null?void 0:o.concepts)||[],h=(o==null?void 0:o.formulas)||[],t=`
    <div class="card" style="background: #f8fafc;">
      <h2 style="margin: 0 0 4px 0; font-size: 14px; color: #047857;">${n(e.title)}</h2>
      <div style="font-size: 10px; color: #64748b;">
        Môn học: <strong>${n(e.subjectName||"Tài liệu")}</strong> | Dung lượng: ${Math.round((e.sizeBytes||0)/1024)} KB
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">Tóm Tắt Tổng Quan Kiến Thức</h3>
      <p style="font-size: 11px; color: #1e293b; margin: 4px 0;">${n(i)}</p>
    </div>

    ${d.length>0?`
      <div class="card">
        <h3 class="card-title">Các Điểm Kiến Thức Trọng Tâm</h3>
        <ul style="margin: 4px 0; padding-left: 18px; font-size: 10.5px; color: #1e293b;">
          ${d.map(l=>`<li>${n(l)}</li>`).join("")}
        </ul>
      </div>
    `:""}

    ${a.length>0?`
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
            ${a.map(l=>`
              <tr>
                <td><strong>${n(l.name)}</strong></td>
                <td>${n(l.definition)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `:""}

    ${h.length>0?`
      <div class="card" style="background: #f0fdf4; border-color: #86efac;">
        <h3 class="card-title" style="color: #065f46;">Công Thức &amp; Quy Tắc Cần Ghi Nhớ</h3>
        <ul style="margin: 4px 0; padding-left: 18px; font-size: 10.5px; color: #166534; font-weight: 600;">
          ${h.map(l=>`<li>${n(l)}</li>`).join("")}
        </ul>
      </div>
    `:""}
  `,r=u({title:`Phiếu Tóm Tắt: ${e.title}`,subtitle:"Hệ thống hóa kiến thức cốt lõi tự động từ tài liệu học sinh",documentTypeLabel:"Phiếu tóm tắt tài liệu",studentName:c,gradeLevel:p,bodyContent:t});await b(r)}export{H as P,S as a,D as b,B as c,E as d,M as e,F as f,K as g,I as h};
