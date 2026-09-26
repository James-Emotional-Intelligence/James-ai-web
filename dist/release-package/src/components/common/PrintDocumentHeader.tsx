import React from 'react';
import { formatDateVN } from '../../lib/utils';
import { useAuth } from '../../features/auth/AuthProvider';

export interface PrintDocumentHeaderProps {
  title: string;
  subtitle?: string;
  documentType?: string;
  className?: string;
}

export const PrintDocumentHeader: React.FC<PrintDocumentHeaderProps> = ({
  title,
  subtitle,
  documentType = 'Tài liệu học tập',
  className = '',
}) => {
  const { user, profile } = useAuth();
  const studentName = user?.preferredName || user?.displayName || 'Học sinh';
  const gradeLevel = profile?.gradeLevel || 9;
  const printDate = formatDateVN(new Date());

  return (
    <div className={`hidden print:block mb-6 pb-4 border-b-2 border-[#059669] text-[#0f172a] ${className}`}>
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-extrabold text-[#059669] tracking-tight">JAMI AI</span>
            <span className="text-[10px] font-bold bg-[#ecfdf5] text-[#047857] px-2 py-0.5 rounded border border-[#a7f3d0]">
              GDPT 2018
            </span>
          </div>
          <div className="text-xs text-[#64748b] mt-0.5">Nền tảng trợ lý học tập &amp; đồng hành số thông minh</div>
        </div>
        <div className="text-right text-xs text-[#475569]">
          <div><strong>Loại:</strong> {documentType}</div>
          <div><strong>Học sinh:</strong> {studentName} (Lớp {gradeLevel})</div>
          <div><strong>Ngày in:</strong> {printDate}</div>
        </div>
      </div>

      <div className="text-center my-3">
        <h1 className="text-lg font-extrabold text-[#065f46] uppercase tracking-wide m-0">{title}</h1>
        {subtitle && <p className="text-xs text-[#475569] mt-1 m-0">{subtitle}</p>}
      </div>
    </div>
  );
};
