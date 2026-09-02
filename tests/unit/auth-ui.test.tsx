import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../../src/features/auth/AuthProvider';
import { GuestOnlyRoute } from '../../src/features/auth/GuestOnlyRoute';
import { SignupPage } from '../../src/features/auth/SignupPage';
import { LoginPage } from '../../src/features/auth/LoginPage';
import { api, ApiError } from '../../src/lib/api-client';

vi.mock('../../src/lib/api-client', () => ({
  api: {
    getSession: vi.fn(),
    login: vi.fn(),
    loginDemo: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    public status: number;
    public code?: string;
    public data: any;
    constructor(message: string, status: number, data?: any, code?: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.data = data;
      this.code = code;
    }
  },
}));

describe('Auth UI Component & Regression Tests (Video Reproduction Suite)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default bootstrap response: unauthenticated user, demo enabled
    vi.mocked(api.getSession).mockResolvedValue({
      authenticated: false,
      demoLoginEnabled: true,
    });
  });

  it('renders /signup, fills form, keeps form mounted during pending submission, and displays 409 conflict alert without resetting form', async () => {
    const user = userEvent.setup();

    // Create a pending promise for registration
    let resolveRegister!: (val: any) => void;
    let rejectRegister!: (err: any) => void;
    const registerPromise = new Promise((resolve, reject) => {
      resolveRegister = resolve;
      rejectRegister = reject;
    });
    vi.mocked(api.register).mockImplementation(() => registerPromise as any);

    render(
      <MemoryRouter initialEntries={['/signup']}>
        <AuthProvider>
          <Routes>
            <Route element={<GuestOnlyRoute />}>
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/login" element={<LoginPage />} />
            </Route>
            <Route path="/today" element={<div>Dashboard Today</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    // Wait for bootstrap checking to finish
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Tạo tài khoản học sinh/i })).toBeInTheDocument();
    });

    const nameInput = screen.getByLabelText(/Họ và tên/i) as HTMLInputElement;
    const emailInput = screen.getByLabelText(/Email học sinh/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/^Mật khẩu/i) as HTMLInputElement;
    const confirmInput = screen.getByLabelText(/Xác nhận mật khẩu/i) as HTMLInputElement;
    const termsCheckbox = screen.getByRole('checkbox') as HTMLInputElement;
    const submitBtn = screen.getByRole('button', { name: /Hoàn tất đăng ký/i });

    // Fill form
    await user.type(nameInput, 'Nguyễn Văn Minh');
    await user.type(emailInput, 'minh.test@example.test');
    await user.type(passwordInput, 'Password123!');
    await user.type(confirmInput, 'Password123!');
    await user.click(termsCheckbox);

    expect(nameInput.value).toBe('Nguyễn Văn Minh');
    expect(emailInput.value).toBe('minh.test@example.test');
    expect(termsCheckbox.checked).toBe(true);

    // Submit form
    await user.click(submitBtn);

    // Verification 1: While pending, form is STILL in the DOM (NO full-screen "Đang tải JAMI AI..." unmount)
    expect(screen.queryByText(/Đang tải JAMI AI.../i)).not.toBeInTheDocument();
    expect(nameInput).toBeInTheDocument();
    expect(nameInput.value).toBe('Nguyễn Văn Minh');
    expect(emailInput.value).toBe('minh.test@example.test');

    // Verification 2: Reject with 409 EMAIL_ALREADY_EXISTS (as seen in video)
    await act(async () => {
      rejectRegister(
        new ApiError('Email này đã được đăng ký. Vui lòng chuyển sang trang Đăng nhập.', 409, { error: { code: 'EMAIL_ALREADY_EXISTS' } }, 'EMAIL_ALREADY_EXISTS')
      );
    });

    // Verification 3: Form is NOT unmounted or blanked out!
    // Alert banner is visible
    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Email này đã được đăng ký/i);

    // Non-sensitive fields are preserved
    expect(nameInput.value).toBe('Nguyễn Văn Minh');
    expect(emailInput.value).toBe('minh.test@example.test');
    expect(termsCheckbox.checked).toBe(true);

    // Passwords are reset for security
    expect(passwordInput.value).toBe('');
    expect(confirmInput.value).toBe('');

    // "Đi đến Đăng nhập" button is available
    const toLoginBtn = screen.getByRole('button', { name: /Đi đến Đăng nhập/i });
    expect(toLoginBtn).toBeInTheDocument();

    // Clicking "Đi đến Đăng nhập" transitions to LoginPage with prefilled email
    await user.click(toLoginBtn);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Đăng nhập/i })).toBeInTheDocument();
    });
    const loginEmailInput = screen.getByLabelText(/Email học sinh/i) as HTMLInputElement;
    expect(loginEmailInput.value).toBe('minh.test@example.test');
  }, 15000);

  it('keeps form intact and displays 503 system interruption error upon database failure', async () => {
    const user = userEvent.setup();

    vi.mocked(api.register).mockRejectedValueOnce(
      new ApiError('Hệ thống đăng ký đang tạm gián đoạn. Vui lòng thử lại sau.', 503, { error: { code: 'DATABASE_UNAVAILABLE', requestId: 'req_test123' } }, 'DATABASE_UNAVAILABLE')
    );

    render(
      <MemoryRouter initialEntries={['/signup']}>
        <AuthProvider>
          <Routes>
            <Route element={<GuestOnlyRoute />}>
              <Route path="/signup" element={<SignupPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Tạo tài khoản học sinh/i })).toBeInTheDocument();
    });

    const emailInput = screen.getByLabelText(/Email học sinh/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/^Mật khẩu/i) as HTMLInputElement;
    const confirmInput = screen.getByLabelText(/Xác nhận mật khẩu/i) as HTMLInputElement;
    const nameInput = screen.getByLabelText(/Họ và tên/i) as HTMLInputElement;
    const termsCheckbox = screen.getByRole('checkbox') as HTMLInputElement;

    await user.type(nameInput, 'Trần Minh');
    await user.type(emailInput, 'minh.tran@example.test');
    await user.type(passwordInput, 'Password123!');
    await user.type(confirmInput, 'Password123!');
    await user.click(termsCheckbox);

    await user.click(screen.getByRole('button', { name: /Hoàn tất đăng ký/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Hệ thống đăng nhập đang tạm gián đoạn/i);
    expect(emailInput.value).toBe('minh.tran@example.test');
  });

  it('handles 401 login error gracefully, retains email in input, and shows invalid credentials message', async () => {
    const user = userEvent.setup();

    vi.mocked(api.login).mockRejectedValueOnce(
      new ApiError('Email hoặc mật khẩu không chính xác.', 401, { error: { code: 'INVALID_CREDENTIALS' } }, 'INVALID_CREDENTIALS')
    );

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route element={<GuestOnlyRoute />}>
              <Route path="/login" element={<LoginPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Đăng nhập/i })).toBeInTheDocument();
    });

    const emailInput = screen.getByLabelText(/Email học sinh/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/^Mật khẩu/i) as HTMLInputElement;

    await user.type(emailInput, 'student@example.test');
    await user.type(passwordInput, 'WrongPassword123!');

    await user.click(screen.getByRole('button', { name: /Đăng nhập vào Jami/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(/Email hoặc mật khẩu không chính xác/i);

    // Email remains typed in the input box
    expect(emailInput.value).toBe('student@example.test');
  });
});
