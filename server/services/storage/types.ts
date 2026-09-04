import { Readable } from 'stream';

export interface SaveFileInput {
  key: string;
  body?: Buffer | Readable;
  filePath?: string;
  contentType: string;
  originalFilename?: string;
}

export interface StoredFile {
  key: string;
  size: number;
  sha256: string;
  contentType: string;
  etag?: string;
}

export interface StoredFileStat {
  key: string;
  size: number;
  sha256?: string;
  contentType?: string;
  updatedAt?: Date;
  exists: boolean;
}

export interface ReadRangeOptions {
  start?: number;
  end?: number;
}

export interface StorageAdapter {
  driverName: 'local' | 'r2';
  save(input: SaveFileInput): Promise<StoredFile>;
  createReadStream(key: string, options?: ReadRangeOptions): Promise<Readable>;
  readBuffer(key: string): Promise<Buffer>;
  stat(key: string): Promise<StoredFileStat>;
  delete(key: string): Promise<void>;
  deleteDirectory?(relativeDir: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  move?(sourceKey: string, destinationKey: string): Promise<void>;
  checkHealth?(): Promise<{ ready: boolean; reason?: string; freeBytes?: number }>;
}
