import mysql from 'mysql2/promise';
import { env } from '../config/env';

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

  public async init(): Promise<boolean> {
    if (this.isConnected) return true;
    if (this.isInitializing) return false;

    // Check if host and credentials are provided
    if (!env.AIVEN_MYSQL_HOST || !env.AIVEN_APP_USER) {
      this.isConnected = false;
      this.initError = 'AIVEN_MYSQL_HOST or AIVEN_APP_USER not configured';
      if (env.APP_MODE === 'production') {
        console.error('[JAMI MySQL ERROR] Production mode requires valid AIVEN_MYSQL credentials.');
      } else {
        console.log('[JAMI MySQL] External MySQL credentials not configured. Running in Demo / Standalone Mode.');
      }
      return false;
    }

    this.isInitializing = true;
    this.initError = null;
    const maskedHost = env.AIVEN_MYSQL_HOST ? `${env.AIVEN_MYSQL_HOST.substring(0, 8)}...` : 'none';
    console.log(`[JAMI MySQL] Connecting to Aiven MySQL (${maskedHost}:${env.AIVEN_MYSQL_PORT}/${env.AIVEN_MYSQL_DATABASE})...`);

    try {
      const sslConfig: { rejectUnauthorized: boolean; ca?: string } = {
        rejectUnauthorized: Boolean(env.AIVEN_CA_CERT),
      };

      if (env.AIVEN_CA_CERT) {
        sslConfig.ca = env.AIVEN_CA_CERT.replace(/\\n/g, '\n');
      }

      this.pool = mysql.createPool({
        host: env.AIVEN_MYSQL_HOST,
        port: env.AIVEN_MYSQL_PORT,
        user: env.AIVEN_APP_USER,
        password: env.AIVEN_APP_PASSWORD,
        database: env.AIVEN_MYSQL_DATABASE,
        ssl: sslConfig,
        waitForConnections: true,
        connectionLimit: 10,
        maxIdle: 5,
        idleTimeout: 60000,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
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
      if (env.APP_MODE === 'production') {
        throw new DatabaseError(`Failed to connect to production MySQL: ${err.message}`, err);
      }
      return false;
    } finally {
      this.isInitializing = false;
    }
  }

  public async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    if (!this.pool || !this.isConnected) {
      if (env.APP_MODE === 'production') {
        throw new DatabaseError('Database pool is not ready or connection was lost');
      }
      return [];
    }

    try {
      const [rows] = await this.pool.query(sql, params);
      return rows as T[];
    } catch (err: any) {
      throw new DatabaseError(`MySQL Query Error: ${err.message}`, err);
    }
  }

  public async execute(sql: string, params?: any[]): Promise<any> {
    if (!this.pool || !this.isConnected) {
      if (env.APP_MODE === 'production') {
        throw new DatabaseError('Database pool is not ready or connection was lost');
      }
      return null;
    }

    try {
      const [result] = await this.pool.execute(sql, params);
      return result;
    } catch (err: any) {
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
