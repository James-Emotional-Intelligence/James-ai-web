export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;

  constructor(message: string, statusCode: number, code: string, details?: any) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Dữ liệu yêu cầu không hợp lệ', details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(message = 'Email hoặc mật khẩu không chính xác') {
    super(message, 401, 'INVALID_CREDENTIALS');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Chưa xác thực đăng nhập') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class SessionExpiredError extends AppError {
  constructor(message = 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ') {
    super(message, 401, 'SESSION_EXPIRED');
  }
}

export class AccountInactiveError extends AppError {
  constructor(message = 'Tài khoản của bạn đã bị khóa hoặc chưa kích hoạt') {
    super(message, 403, 'ACCOUNT_INACTIVE');
  }
}

export class EmailAlreadyExistsError extends AppError {
  constructor(message = 'Email này đã được đăng ký. Vui lòng chuyển sang trang Đăng nhập.') {
    super(message, 409, 'EMAIL_ALREADY_EXISTS');
  }
}

export class RateLimitedError extends AppError {
  public retryAfterSeconds: number;
  constructor(retryAfterSeconds: number, message?: string) {
    super(
      message || `Thao tác quá nhiều lần. Vui lòng thử lại sau ${retryAfterSeconds} giây.`,
      429,
      'RATE_LIMITED'
    );
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class DatabaseUnavailableError extends AppError {
  constructor(message = 'Cơ sở dữ liệu đang tạm gián đoạn. Vui lòng thử lại sau.') {
    super(message, 503, 'DATABASE_UNAVAILABLE');
  }
}

export class DbSchemaIncompatibleError extends AppError {
  constructor(message = 'Cơ sở dữ liệu chưa đồng bộ lược đồ phiên bản mới nhất.') {
    super(message, 503, 'DB_SCHEMA_INCOMPATIBLE');
  }
}
