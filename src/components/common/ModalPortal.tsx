import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ModalPortalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClass?: string; // e.g. "max-w-2xl", "max-w-[780px]"
  className?: string;
  ariaLabelledBy?: string;
}

export const ModalPortal: React.FC<ModalPortalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  maxWidthClass = 'max-w-2xl',
  className = '',
  ariaLabelledBy = 'modal-portal-title',
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Save previous focus element
    previousActiveElementRef.current = document.activeElement as HTMLElement | null;

    // Lock body scroll and compensate for scrollbar shift
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyPaddingRight = document.body.style.paddingRight;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.body.setAttribute('data-modal-open', 'true');

    // Handle Escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Auto-focus panel
    if (panelRef.current) {
      panelRef.current.focus();
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.paddingRight = prevBodyPaddingRight;
      document.body.removeAttribute('data-modal-open');

      // Restore focus
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
    >
      {/* Light Backdrop (55-65% black, 3px blur) */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-[3px] transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Card Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`relative z-[1001] w-full ${maxWidthClass} my-4 sm:my-8 bg-[#0B120D] [data-theme=hai-ba-trung]:bg-[#0B2118] border border-[rgba(34,197,94,0.3)] [data-theme=hai-ba-trung]:border-[rgba(210,168,74,0.35)] rounded-3xl shadow-2xl shadow-black/80 flex flex-col max-h-[calc(100dvh-32px)] overflow-hidden jami-modal-animate focus:outline-none ${className}`}
      >
        {/* Sticky Header */}
        {(title || subtitle || icon) && (
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[rgba(34,197,94,0.18)] [data-theme=hai-ba-trung]:border-[rgba(210,168,74,0.2)] bg-[#0B120D]/95 [data-theme=hai-ba-trung]:bg-[#0B2118]/95 backdrop-blur-md shrink-0">
            <div className="flex items-center gap-3 pr-2">
              {icon && (
                <div className="w-10 h-10 rounded-2xl bg-[#064E3B] [data-theme=hai-ba-trung]:bg-[#102B20] border border-[#10B981]/40 [data-theme=hai-ba-trung]:border-[#D2A84A]/40 flex items-center justify-center text-[#6EE7B7] [data-theme=hai-ba-trung]:text-[#E8C66A] shrink-0">
                  {icon}
                </div>
              )}
              <div>
                {subtitle && (
                  <div className="text-[10px] font-black text-[#6EE7B7] [data-theme=hai-ba-trung]:text-[#D2A84A] uppercase tracking-wider">
                    {subtitle}
                  </div>
                )}
                {title && (
                  <h3 id={ariaLabelledBy} className="text-base sm:text-lg font-black text-[#F3FAF5] [data-theme=hai-ba-trung]:text-[#F5F4EF]">
                    {title}
                  </h3>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng cửa sổ"
              className="w-11 h-11 flex items-center justify-center rounded-xl text-[#A9B8AE] [data-theme=hai-ba-trung]:text-[#B9C8BE] hover:text-[#F3FAF5] hover:bg-[#101A13] [data-theme=hai-ba-trung]:hover:bg-[#102B20] transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Scrollable Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {children}
        </div>

        {/* Optional Sticky Footer */}
        {footer && (
          <div className="p-4 sm:p-5 border-t border-[rgba(34,197,94,0.18)] [data-theme=hai-ba-trung]:border-[rgba(210,168,74,0.2)] bg-[#0B120D]/95 [data-theme=hai-ba-trung]:bg-[#0B2118]/95 backdrop-blur-md shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
