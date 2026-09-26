import React, { useState } from 'react';
import { Printer, FileDown, Loader2 } from 'lucide-react';

export interface PrintPdfButtonProps {
  onClick?: () => void | Promise<void>;
  onExport?: () => void | Promise<void>;
  label?: string;
  tooltip?: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  iconOnly?: boolean;
  documentTitle?: string;
  disabled?: boolean;
}

export const PrintPdfButton: React.FC<PrintPdfButtonProps> = ({
  onClick,
  onExport,
  label = 'In PDF',
  tooltip = 'In hoặc Lưu thành file PDF',
  className = '',
  variant = 'outline',
  size = 'md',
  iconOnly = false,
  documentTitle,
  disabled = false,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled || isLoading) return;

    setIsLoading(true);
    try {
      const exportFn = onExport || onClick;
      if (exportFn) {
        await exportFn();
      } else {
        const prevTitle = document.title;
        if (documentTitle) {
          document.title = documentTitle;
        }
        window.print();
        setTimeout(() => {
          if (documentTitle) {
            document.title = prevTitle;
          }
        }, 1000);
      }
    } catch (err) {
      console.error('[PrintPdfButton] Error printing/exporting PDF:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const baseStyles = 'inline-flex items-center justify-center font-bold transition-all duration-200 focus:outline-none cursor-pointer select-none no-print';

  const sizeStyles = {
    sm: iconOnly ? 'p-1.5 rounded-lg text-xs' : 'px-2.5 py-1.5 rounded-lg text-xs gap-1.5',
    md: iconOnly ? 'p-2 rounded-xl text-sm' : 'px-3.5 py-2 rounded-xl text-sm gap-2',
    lg: iconOnly ? 'p-2.5 rounded-xl text-base' : 'px-4 py-2.5 rounded-xl text-base gap-2.5',
  };

  const variantStyles = {
    primary: 'bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] shadow-md shadow-[#16A34A]/20 hover:shadow-[#16A34A]/40 active:scale-95',
    secondary: 'bg-[#1B3524] hover:bg-[#275236] text-[#86EFAC] border border-[#22C55E]/30 active:scale-95',
    outline: 'bg-[#0B120D]/80 hover:bg-[#142219] text-[#A9B8AE] hover:text-[#F3FAF5] border border-[#22C55E]/20 hover:border-[#22C55E]/40 active:scale-95',
    ghost: 'bg-transparent hover:bg-[#142219] text-[#A9B8AE] hover:text-[#F3FAF5] active:scale-95',
    icon: 'bg-[#0B120D]/80 hover:bg-[#142219] text-[#86EFAC] border border-[#22C55E]/20 hover:border-[#22C55E]/40 active:scale-95',
  };

  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isLoading}
      title={tooltip}
      aria-label={label}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {isLoading ? (
        <Loader2 size={iconSize} className="animate-spin text-[#22C55E]" />
      ) : (
        <Printer size={iconSize} className="shrink-0 text-[#22C55E]" />
      )}
      {!iconOnly && <span>{isLoading ? 'Đang tạo PDF...' : label}</span>}
    </button>
  );
};
