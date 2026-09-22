import mysql from 'mysql2/promise';
import fs from 'fs';
import { env, isProduction } from '../config/env';

export class DatabaseError extends Error {
  public code?: string;
  public errno?: number;
  public sqlState?: string;

  constructor(message: string, originalError?: any) {
    super(message);
    this.name = 'DatabaseError';
    if (originalError) {
      this.code = originalError.code;
      this.errno = originalError.errno;
      this.sqlState = originalError.sqlState;
    }
  }
}

class MySQLClient {
  private static instance: MySQLClient;
  private pool: mysql.Pool | null = null;
  private isConnected = false;
  private isInitializing = false;
  private initError: string | null = null;

  private constructor() {}

  public static getInstance(): MySQLClient {
    if (!MySQLClient.instance) {
      MySQLClient.instance = new MySQLClient();
    }
    return MySQLClient.instance;
  }

  public getPool(): mysql.Pool | null {
    return this.pool;
  }

  public isHealthy(): boolean {
    return this.isConnected && this.pool !== null;
  }

  public getInitError(): string | null {
    return this.initError;
  }

  public async pingCheck(timeoutMs = 2000): Promise<boolean> {
    if (!this.pool || !this.isConnected) {
      return false;
    }

    try {
      const pingPromise = this.pool.query('SELECT UTC_TIMESTAMP() as pingTime');
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Ping timeout')), timeoutMs)
      );

      await Promise.race([pingPromise, timeoutPromise]);
      return true;
    } catch (err: any) {
      console.warn('[JAMI MySQL] Readiness ping check failed:', err.message);
      this.isConnected = false;
      return false;
    }
  }

  public async init(): Promise<boolean> {
    if (this.isConnected) return true;
    if (this.isInitializing) return false;

    // Check if host and credentials are provided
    if (!env.AIVEN_MYSQL_HOST || !env.AIVEN_APP_USER) {
      this.isConnected = false;
      this.initError = 'AIVEN_MYSQL_HOST or AIVEN_APP_USER not configured';
      if (isProduction) {
        throw new DatabaseError('[JAMI MySQL ERROR] Production mode requires valid AIVEN_MYSQL credentials.');
      } else {
        console.log('[JAMI MySQL] External MySQL credentials not configured. Running in Demo / Standalone Mode.');
      }
      return false;
    }

    this.isInitializing = true;
    this.initError = null;
    const maskedHost = env.AIVEN_MYSQL_HOST ? `${env.AIVEN_MYSQL_HOST.substring(0, 6)}...` : 'none';
    console.log(`[JAMI MySQL] Connecting to Aiven MySQL (${maskedHost}:${env.AIVEN_MYSQL_PORT}/${env.AIVEN_MYSQL_DATABASE})...`);

    try {
      let caCert: string | undefined = undefined;
      if (env.AIVEN_CA_CERT) {
        caCert = env.AIVEN_CA_CERT.replace(/\\n/g, '\n');
      } else if (env.AIVEN_CA_CERT_PATH && fs.existsSync(env.AIVEN_CA_CERT_PATH)) {
        caCert = fs.readFileSync(env.AIVEN_CA_CERT_PATH, 'utf-8');
      }

      if (!caCert && isProduction) {
        throw new DatabaseError('[JAMI MySQL ERROR: CONFIG_AIVEN_CA_MISSING] Production environment connecting to Aiven MySQL requires a valid AIVEN_CA_CERT or AIVEN_CA_CERT_PATH.');
      }

      const sslConfig: { rejectUnauthorized: boolean; ca?: string } = {
        rejectUnauthorized: Boolean(caCert),
      };

      if (caCert) {
        sslConfig.ca = caCert;
        sslConfig.rejectUnauthorized = true;
      } else {
        console.warn('[JAMI MySQL WARNING] Connecting without verified CA certificate chain (rejectUnauthorized: false). Not recommended for production.');
        sslConfig.rejectUnauthorized = false;
      }

      this.pool = mysql.createPool({
        host: env.AIVEN_MYSQL_HOST,
        port: env.AIVEN_MYSQL_PORT,
        user: env.AIVEN_APP_USER,
        password: env.AIVEN_APP_PASSWORD,
        database: env.AIVEN_MYSQL_DATABASE,
        ssl: sslConfig,
        waitForConnections: true,
        connectionLimit: 20,
        maxIdle: 10,
        idleTimeout: 120000,
        connectTimeout: 30000,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 5000,
        timezone: '+00:00',
      });

      // Verify connection
      const connection = await this.pool.getConnection();
      console.log('[JAMI MySQL] Connection established successfully via secure TLS!');
      connection.release();

      this.isConnected = true;
      return true;
    } catch (err: any) {
      this.isConnected = false;
      this.initError = err.message;
      console.error('[JAMI MySQL] Connection failed:', err.message);
      if (isProduction) {
        throw new DatabaseError(`Failed to connect to production MySQL: ${err.message}`, err);
      }
      return false;
    } finally {
      this.isInitializing = false;
    }
  }

  public async query<T = any>(sql: string, params?: any[], retryCount = 1): Promise<T[]> {
    if (!this.pool || !this.isConnected) {
      // Attempt auto-reconnect if pool is not ready
      if (!this.isInitializing && env.AIVEN_MYSQL_HOST) {
        try {
          await this.init();
        } catch (_) {}
      }
      if (!this.pool || !this.isConnected) {
        if (isProduction) {
          throw new DatabaseError('Database pool is not ready or connection was lost');
        }
        return [];
      }
    }

    try {
      const [rows] = await this.pool.query(sql, params);
      return rows as T[];
    } catch (err: any) {
      const isTransient =
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNRESET' ||
        err.code === 'PROTOCOL_CONNECTION_LOST' ||
        err.code === 'EPIPE' ||
        err.message?.includes('ETIMEDOUT') ||
        err.message?.includes('Connection lost');

      if (isTransient && retryCount > 0) {
        console.warn(`[JAMI MySQL] Transient error (${err.code || err.message}), retrying query in 500ms...`);
        await new Promise((r) => setTimeout(r, 500));
        return this.query<T>(sql, params, retryCount - 1);
      }
      throw new DatabaseError(`MySQL Query Error: ${err.message}`, err);
    }
  }

  public async execute(sql: string, params?: any[], retryCount = 1): Promise<any> {
    if (!this.pool || !this.isConnected) {
      if (!this.isInitializing && env.AIVEN_MYSQL_HOST) {
        try {
          await this.init();
        } catch (_) {}
      }
      if (!this.pool || !this.isConnected) {
        if (isProduction) {
          throw new DatabaseError('Database pool is not ready or connection was lost');
        }
        return null;
      }
    }

    try {
      const isPreparedUnsupported = !params || params.length === 0 ||
        /^\s*(PREPARE|EXECUTE|DEALLOCATE|SET|SIGNAL|CREATE|ALTER|DROP)\b/i.test(sql);
      const [result] = isPreparedUnsupported
        ? await this.pool.query(sql, params)
        : await this.pool.execute(sql, params);
      return result;
    } catch (err: any) {
      const isTransient =
        err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNRESET' ||
        err.code === 'PROTOCOL_CONNECTION_LOST' ||
        err.code === 'EPIPE' ||
        err.message?.includes('ETIMEDOUT') ||
        err.message?.includes('Connection lost');

      if (isTransient && retryCount > 0) {
        console.warn(`[JAMI MySQL] Transient error (${err.code || err.message}), retrying execute in 500ms...`);
        await new Promise((r) => setTimeout(r, 500));
        return this.execute(sql, params, retryCount - 1);
      }
      throw new DatabaseError(`MySQL Execute Error: ${err.message}`, err);
    }
  }

  public async getConnection(): Promise<mysql.PoolConnection> {
    if (!this.pool || !this.isConnected) {
      throw new DatabaseError('Database pool is not connected');
    }
    return await this.pool.getConnection();
  }

  public async withTransaction<T>(callback: (connection: mysql.PoolConnection) => Promise<T>): Promise<T> {
    const conn = await this.getConnection();
    try {
      await conn.beginTransaction();
      const result = await callback(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}

export const db = MySQLClient.getInstance();
