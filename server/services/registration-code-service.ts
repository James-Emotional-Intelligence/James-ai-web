import crypto from 'crypto';
import { db } from '../db/mysql';
import { env } from '../config/env';
import {
  RegistrationCode,
  CreatedRegistrationCode,
  RegistrationCodeRewardType,
  RegistrationCodeStatus,
} from '../../shared/types';
import { milliVndToVnd, vndToMilliVnd } from '../ai/model-pricing';

export class InvalidRegistrationCodeError extends Error {
  public status = 400;
  public code = 'INVALID_REGISTRATION_CODE';
  constructor() {
    super('Mã không hợp lệ hoặc không còn khả dụng. Bạn có thể xóa mã để đăng ký với ngân sách mặc định 25.000đ.');
    this.name = 'InvalidRegistrationCodeError';
  }
}

export interface StoredRegistrationCode {
  id: string;
  codeHash: string;
  codePrefix: string;
  rewardType: RegistrationCodeRewardType;
  creditMilliVnd?: bigint | null;
  unlimitedForever: boolean;
  unlimitedUntil?: Date | null;
  maxRedemptions: number;
  redemptionCount: number;
  perUserLimit: number;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  status: RegistrationCodeStatus;
  createdByAdminId?: string | null;
  note?: string | null;
  createdAt: Date;
  updatedAt: Date;
  revokedAt?: Date | null;
}

export class RegistrationCodeService {
  private static instance: RegistrationCodeService;
  private demoCodes: Map<string, StoredRegistrationCode> = new Map(); // key: codeHash

  private constructor() {}

  public static getInstance(): RegistrationCodeService {
    if (!RegistrationCodeService.instance) {
      RegistrationCodeService.instance = new RegistrationCodeService();
    }
    return RegistrationCodeService.instance;
  }

  /**
   * Resets demo in-memory storage (for unit tests)
   */
  public resetDemoData() {
    this.demoCodes.clear();
  }

  /**
   * Creates a deep copy snapshot of demo in-memory state for atomic rollback
   */
  public createDemoSnapshot(): Map<string, StoredRegistrationCode> {
    const snapshot = new Map<string, StoredRegistrationCode>();
    for (const [key, val] of this.demoCodes.entries()) {
      snapshot.set(key, { ...val });
    }
    return snapshot;
  }

  /**
   * Restores demo in-memory state from a previous snapshot upon transaction failure
   */
  public restoreDemoSnapshot(snapshot: Map<string, StoredRegistrationCode>) {
    this.demoCodes.clear();
    for (const [key, val] of snapshot.entries()) {
      this.demoCodes.set(key, { ...val });
    }
  }

  /**
   * Generates a high-entropy registration code (128-bit entropy, 32 hex characters) formatted as JAMI-XXXX-XXXX-...
   */
  public generatePlainCode(): string {
    const bytes = crypto.randomBytes(16).toString('hex').toUpperCase(); // 32 hex chars (128-bit)
    return `JAMI-${bytes.slice(0, 4)}-${bytes.slice(4, 8)}-${bytes.slice(8, 12)}-${bytes.slice(12, 16)}-${bytes.slice(16, 20)}-${bytes.slice(20, 24)}-${bytes.slice(24, 28)}-${bytes.slice(28, 32)}`;
  }

  /**
   * Computes HMAC-SHA256 hash using server-side pepper
   */
  public hashCode(plainCode: string): string {
    const normalized = plainCode.trim().toUpperCase();
    const pepper = env.REGISTRATION_CODE_PEPPER || 'jami-registration-code-pepper-secret-32-chars';
    return crypto.createHmac('sha256', pepper).update(normalized).digest('hex');
  }

  /**
   * Admin creates a new registration code. Plaintext code is returned ONLY once.
   */
  public async createCode(
    adminUserId: string,
    params: {
      rewardType: RegistrationCodeRewardType;
      creditVnd?: number | null;
      unlimitedForever?: boolean;
      unlimitedUntil?: string | null;
      maxRedemptions?: number;
      startsAt?: string | null;
      expiresAt?: string | null;
      note?: string | null;
    }
  ): Promise<CreatedRegistrationCode> {
    // 1. Conditional validation
    if (params.rewardType === 'credit') {
      if (!params.creditVnd || params.creditVnd <= 0) {
        throw new Error('Mã loại nạp tiền bắt buộc phải có số tiền creditVnd > 0');
      }
      if (params.unlimitedForever || params.unlimitedUntil) {
        throw new Error('Mã loại credit không được chứa thiết lập vô hạn (unlimited)');
      }
    } else if (params.rewardType === 'unlimited') {
      if (params.creditVnd && params.creditVnd > 0) {
        throw new Error('Mã loại unlimited không được chứa số tiền creditVnd');
      }
      if (!params.unlimitedForever && !params.unlimitedUntil) {
        throw new Error('Mã loại unlimited phải chọn vĩnh viễn (unlimitedForever) hoặc có ngày hết hạn (unlimitedUntil)');
      }
      if (params.unlimitedUntil && new Date(params.unlimitedUntil).getTime() <= Date.now()) {
        throw new Error('Thời hạn vô hạn (unlimitedUntil) phải là ngày trong tương lai');
      }
    }

    if (params.startsAt && params.expiresAt) {
      if (new Date(params.startsAt).getTime() >= new Date(params.expiresAt).getTime()) {
        throw new Error('Ngày kết thúc (expiresAt) phải sau ngày bắt đầu (startsAt)');
      }
    }

    const maxRedemptions = Math.min(100000, Math.max(1, Number(params.maxRedemptions) || 1));
    const plainCode = this.generatePlainCode();
    const codeHash = this.hashCode(plainCode);
    const codePrefix = plainCode.substring(0, 9); // e.g. "JAMI-ABCD"
    const id = 'rc_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
    const creditMilliVnd = params.creditVnd ? vndToMilliVnd(params.creditVnd) : null;
    const now = new Date();
    const startsAt = params.startsAt ? new Date(params.startsAt) : null;
    const expiresAt = params.expiresAt ? new Date(params.expiresAt) : null;
    const unlimitedUntil = params.unlimitedUntil ? new Date(params.unlimitedUntil) : null;

    const record: StoredRegistrationCode = {
      id,
      codeHash,
      codePrefix,
      rewardType: params.rewardType,
      creditMilliVnd,
      unlimitedForever: Boolean(params.unlimitedForever),
      unlimitedUntil,
      maxRedemptions,
      redemptionCount: 0,
      perUserLimit: 1,
      startsAt,
      expiresAt,
      status: 'active',
      createdByAdminId: adminUserId,
      note: params.note || null,
      createdAt: now,
      updatedAt: now,
    };

    if (db.isHealthy()) {
      await db.execute(
        `INSERT INTO registration_codes
         (id, code_hash, code_prefix, reward_type, credit_milli_vnd, unlimited_forever, unlimited_until, max_redemptions, redemption_count, per_user_limit, starts_at, expires_at, status, created_by_admin_id, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, 'active', ?, ?, NOW(3), NOW(3))`,
        [
          id,
          codeHash,
          codePrefix,
          params.rewardType,
          creditMilliVnd ? creditMilliVnd.toString() : null,
          params.unlimitedForever ? 1 : 0,
          unlimitedUntil,
          maxRedemptions,
          startsAt,
          expiresAt,
          adminUserId,
          params.note || null,
        ]
      );

      // Audit log
      await db.execute(
        `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, result, safe_metadata_json, created_at)
         VALUES (?, ?, 'registration_code_create', 'registration_code', ?, 'success', ?, NOW(3))`,
        [
          'audit_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          adminUserId,
          id,
          JSON.stringify({ codePrefix, rewardType: params.rewardType, creditVnd: params.creditVnd, maxRedemptions }),
        ]
      );
    }

    // Always maintain demoCodes cache for testing and fast lookup fallback
    this.demoCodes.set(codeHash, record);

    return {
      id,
      codePrefix,
      plainCode,
      rewardType: params.rewardType,
      creditMilliVnd: creditMilliVnd ? creditMilliVnd.toString() : null,
      creditVnd: params.creditVnd || null,
      unlimitedForever: Boolean(params.unlimitedForever),
      unlimitedUntil: unlimitedUntil?.toISOString() || null,
      maxRedemptions,
      redemptionCount: 0,
      perUserLimit: 1,
      startsAt: startsAt?.toISOString() || null,
      expiresAt: expiresAt?.toISOString() || null,
      status: 'active',
      createdByAdminId: adminUserId,
      note: params.note || null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  /**
   * Atomically redeems a registration code inside a MySQL transaction.
   * If valid, updates redemption_count and inserts registration_code_redemptions record.
   */
  public async redeemInTransaction(
    conn: any | null,
    arg2: string,
    arg3: string
  ): Promise<{
    rewardType: RegistrationCodeRewardType;
    creditMilliVnd: bigint;
    unlimitedForever: boolean;
    unlimitedUntil: Date | null;
    codeId: string;
  }> {
    // Gracefully handle both (conn, userId, codeOrHash) and (conn, codeOrHash, userId)
    let userId = arg2;
    let rawCodeOrHash = arg3;
    if (arg2.startsWith('JAMI-') || (arg2.length === 64 && /^[0-9a-fA-F]+$/.test(arg2))) {
      rawCodeOrHash = arg2;
      userId = arg3;
    }

    const codeHash = (rawCodeOrHash.length === 64 && /^[0-9a-fA-F]+$/.test(rawCodeOrHash))
      ? rawCodeOrHash.toLowerCase()
      : this.hashCode(rawCodeOrHash);

    if (conn) {
      const [rows]: any = await conn.query(
        'SELECT * FROM registration_codes WHERE code_hash = ? FOR UPDATE',
        [codeHash]
      );

      if (!rows || rows.length === 0) {
        throw new InvalidRegistrationCodeError();
      }

      const c = rows[0];
      const now = new Date();

      if (c.status !== 'active') {
        throw new InvalidRegistrationCodeError();
      }
      if (c.starts_at && new Date(c.starts_at) > now) {
        throw new InvalidRegistrationCodeError();
      }
      if (c.expires_at && new Date(c.expires_at) <= now) {
        throw new InvalidRegistrationCodeError();
      }
      if (c.redemption_count >= c.max_redemptions) {
        throw new InvalidRegistrationCodeError();
      }

      const newCount = c.redemption_count + 1;
      const newStatus = newCount >= c.max_redemptions ? 'exhausted' : 'active';

      await conn.execute(
        'UPDATE registration_codes SET redemption_count = ?, status = ?, updated_at = NOW(3) WHERE id = ?',
        [newCount, newStatus, c.id]
      );

      const redemptionId = 'rcr_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24);
      await conn.execute(
        `INSERT INTO registration_code_redemptions
         (id, code_id, user_id, reward_type, credit_milli_vnd, redeemed_at)
         VALUES (?, ?, ?, ?, ?, NOW(3))`,
        [
          redemptionId,
          c.id,
          userId,
          c.reward_type,
          c.credit_milli_vnd ? String(c.credit_milli_vnd) : null,
        ]
      );

      return {
        rewardType: c.reward_type,
        creditMilliVnd: c.credit_milli_vnd ? BigInt(c.credit_milli_vnd) : 0n,
        unlimitedForever: Boolean(c.unlimited_forever),
        unlimitedUntil: c.unlimited_until ? new Date(c.unlimited_until) : null,
        codeId: c.id,
      };
    } else if (db.isHealthy()) {
      return await db.withTransaction(async (trx) => this.redeemInTransaction(trx, codeHash, userId));
    }

    // Demo in-memory fallback
    const code = this.demoCodes.get(codeHash);
    if (!code || code.status !== 'active') {
      throw new InvalidRegistrationCodeError();
    }
    const now = new Date();
    if (code.startsAt && code.startsAt > now) throw new InvalidRegistrationCodeError();
    if (code.expiresAt && code.expiresAt <= now) throw new InvalidRegistrationCodeError();
    if (code.redemptionCount >= code.maxRedemptions) throw new InvalidRegistrationCodeError();

    code.redemptionCount += 1;
    if (code.redemptionCount >= code.maxRedemptions) code.status = 'exhausted';
    code.updatedAt = now;

    return {
      rewardType: code.rewardType,
      creditMilliVnd: code.creditMilliVnd || 0n,
      unlimitedForever: code.unlimitedForever,
      unlimitedUntil: code.unlimitedUntil || null,
      codeId: code.id,
    };
  }

  /**
   * Admin lists all created registration codes (only prefixes, no plain text)
   */
  public async listCodes(): Promise<RegistrationCode[]> {
    if (db.isHealthy()) {
      try {
        const rows = await db.query<any>(
          `SELECT rc.*, u.email as created_by_email
           FROM registration_codes rc
           LEFT JOIN users u ON rc.created_by_admin_id = u.id
           ORDER BY rc.created_at DESC`
        );

        return rows.map((r) => {
          const creditMilli = r.credit_milli_vnd ? BigInt(r.credit_milli_vnd) : null;
          return {
            id: r.id,
            codePrefix: r.code_prefix,
            rewardType: r.reward_type,
            creditMilliVnd: creditMilli ? creditMilli.toString() : null,
            creditVnd: creditMilli ? milliVndToVnd(creditMilli) : null,
            unlimitedForever: Boolean(r.unlimited_forever),
            unlimitedUntil: r.unlimited_until ? new Date(r.unlimited_until).toISOString() : null,
            maxRedemptions: r.max_redemptions,
            redemptionCount: r.redemption_count,
            perUserLimit: r.per_user_limit || 1,
            startsAt: r.starts_at ? new Date(r.starts_at).toISOString() : null,
            expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
            status: r.status,
            createdByAdminId: r.created_by_admin_id || null,
            createdByEmail: r.created_by_email || null,
            note: r.note || null,
            createdAt: new Date(r.created_at).toISOString(),
            updatedAt: new Date(r.updated_at).toISOString(),
            revokedAt: r.revoked_at ? new Date(r.revoked_at).toISOString() : null,
          };
        });
      } catch (err: any) {
        console.error('[RegistrationCodeService] Error listing codes:', err.message);
        throw new Error(`Không thể tải danh sách mã ưu đãi từ cơ sở dữ liệu: ${err.message}`, { cause: err });
      }
    }

    return Array.from(this.demoCodes.values()).map((c) => ({
      id: c.id,
      codePrefix: c.codePrefix,
      rewardType: c.rewardType,
      creditMilliVnd: c.creditMilliVnd ? c.creditMilliVnd.toString() : null,
      creditVnd: c.creditMilliVnd ? milliVndToVnd(c.creditMilliVnd) : null,
      unlimitedForever: c.unlimitedForever,
      unlimitedUntil: c.unlimitedUntil?.toISOString() || null,
      maxRedemptions: c.maxRedemptions,
      redemptionCount: c.redemptionCount,
      perUserLimit: c.perUserLimit,
      startsAt: c.startsAt?.toISOString() || null,
      expiresAt: c.expiresAt?.toISOString() || null,
      status: c.status,
      createdByAdminId: c.createdByAdminId || null,
      note: c.note || null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      revokedAt: c.revokedAt?.toISOString() || null,
    }));
  }

  /**
   * Admin revokes an active registration code
   */
  public async revokeCode(adminUserId: string, codeId: string, reason: string): Promise<void> {
    if (db.isHealthy()) {
      await db.execute(
        'UPDATE registration_codes SET status = \'revoked\', revoked_at = NOW(3), updated_at = NOW(3) WHERE id = ?',
        [codeId]
      );

      await db.execute(
        `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, result, safe_metadata_json, created_at)
         VALUES (?, ?, 'registration_code_revoke', 'registration_code', ?, 'success', ?, NOW(3))`,
        [
          'audit_' + crypto.randomUUID().replace(/-/g, '').substring(0, 24),
          adminUserId,
          codeId,
          JSON.stringify({ reason }),
        ]
      );
      return;
    }

    for (const code of this.demoCodes.values()) {
      if (code.id === codeId) {
        code.status = 'revoked';
        code.revokedAt = new Date();
        code.updatedAt = new Date();
      }
    }
  }
}

export const registrationCodeService = RegistrationCodeService.getInstance();
