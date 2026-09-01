import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught application error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/today';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-[#050806] text-[#F3FAF5] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#0B120D] border border-rose-900/60 rounded-3xl p-8 shadow-2xl text-center space-y-5 jami-modal-animate">
            <div className="w-16 h-16 rounded-2xl bg-rose-950/60 border border-rose-800/60 flex items-center justify-center mx-auto text-rose-400">
              <AlertCircle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h1 className="text-lg font-black text-[#F3FAF5]">Đã xảy ra lỗi không mong muốn</h1>
              <p className="text-xs text-[#A9B8AE] leading-relaxed">
                JAMI AI gặp trục trặc tạm thời khi hiển thị trang. Vui lòng bấm thử lại để tiếp tục học tập.
              </p>
              {this.state.error?.message && (
                <div className="mt-2 p-3 rounded-xl bg-[#101A13] border border-[rgba(34,197,94,0.15)] text-[11px] font-mono text-rose-300 truncate">
                  {this.state.error.message}
                </div>
              )}
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#16A34A] hover:bg-[#22C55E] text-[#050806] font-bold text-xs rounded-xl shadow-lg transition-all cursor-pointer jami-btn-glow"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Tải lại trang</span>
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#101A13] hover:bg-[#142219] text-[#A9B8AE] hover:text-[#F3FAF5] border border-[rgba(34,197,94,0.2)] font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>Về trang chính</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
