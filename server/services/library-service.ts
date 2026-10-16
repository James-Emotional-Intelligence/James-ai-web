import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import type { LibraryDocument } from '../../shared/types';

const libraryRoot = path.resolve(process.cwd(), env.LOCAL_STORAGE_ROOT, 'library');
const filesRoot = path.join(libraryRoot, 'files');
const catalogPath = path.join(libraryRoot, 'catalog.json');

function safeId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{8,80}$/.test(id);
}

async function readCatalog(): Promise<LibraryDocument[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const data = JSON.parse(await fs.promises.readFile(catalogPath, 'utf8'));
      return Array.isArray(data) ? data : [];
    } catch (error: any) {
      if (error.code === 'ENOENT') return [];
      if (!(error instanceof SyntaxError) || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  return [];
}

async function writeCatalog(documents: LibraryDocument[]): Promise<void> {
  await fs.promises.mkdir(libraryRoot, { recursive: true });
  const temporary = `${catalogPath}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(temporary, JSON.stringify(documents, null, 2), 'utf8');
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        await fs.promises.rename(temporary, catalogPath);
        return;
      } catch (error: any) {
        if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
        if (attempt === 7) {
          await fs.promises.copyFile(temporary, catalogPath);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
  } finally {
    await fs.promises.rm(temporary, { force: true }).catch(() => {});
  }
}

let mutationQueue: Promise<unknown> = Promise.resolve();
function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation);
  mutationQueue = result.catch(() => {});
  return result;
}

export const libraryService = {
  async list(): Promise<LibraryDocument[]> {
    const documents = await readCatalog();
    return documents.sort((a, b) => a.grade - b.grade || a.title.localeCompare(b.title, 'vi'));
  },

  async get(id: string): Promise<{ document: LibraryDocument; filePath: string } | null> {
    if (!safeId(id)) return null;
    const document = (await readCatalog()).find((item) => item.id === id);
    if (!document) return null;
    const filePath = path.join(filesRoot, `${id}.pdf`);
    try {
      const stat = await fs.promises.stat(filePath);
      return stat.isFile() ? { document, filePath } : null;
    } catch (error: any) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  },

  async addFromFile(
    sourcePath: string,
    input: { id?: string; title: string; grade: number; subject: string; kind: LibraryDocument['kind']; fileName: string },
  ): Promise<{ document: LibraryDocument; added: boolean }> {
    return serialize(async () => {
      const id = input.id || `lib_${crypto.randomUUID().replace(/-/g, '')}`;
      if (!safeId(id)) throw new Error('Mã tài liệu không hợp lệ.');
      if (!Number.isInteger(input.grade) || input.grade < 6 || input.grade > 12) throw new Error('Lớp học phải từ 6 đến 12.');
      const title = input.title.trim().slice(0, 200);
      const subject = input.subject.trim().slice(0, 100);
      if (!title || !subject) throw new Error('Cần nhập tên sách và môn học.');

      const current = await readCatalog();
      const existing = current.find((item) => item.id === id);
      if (existing) {
        const updated = { ...existing, title, grade: input.grade, subject, kind: input.kind };
        if (JSON.stringify(updated) !== JSON.stringify(existing)) {
          await writeCatalog(current.map((item) => item.id === id ? updated : item));
        }
        return { document: updated, added: false };
      }

      const header = Buffer.alloc(5);
      const handle = await fs.promises.open(sourcePath, 'r');
      try {
        if ((await handle.read(header, 0, 5, 0)).bytesRead !== 5 || header.toString('ascii') !== '%PDF-') {
          throw new Error('Tệp được chọn không phải PDF hợp lệ.');
        }
      } finally {
        await handle.close();
      }

      await fs.promises.mkdir(filesRoot, { recursive: true });
      const destination = path.join(filesRoot, `${id}.pdf`);
      const temporary = `${destination}.tmp`;
      try {
        await fs.promises.copyFile(sourcePath, temporary);
        const stat = await fs.promises.stat(temporary);
        if (stat.size === 0) throw new Error('Tệp PDF rỗng.');
        await fs.promises.rename(temporary, destination);
        const document: LibraryDocument = {
          id,
          title,
          grade: input.grade,
          subject,
          kind: input.kind,
          fileName: path.basename(input.fileName).slice(0, 255),
          sizeBytes: stat.size,
          createdAt: new Date().toISOString(),
        };
        await writeCatalog([...current, document]);
        return { document, added: true };
      } catch (error) {
        await fs.promises.rm(temporary, { force: true }).catch(() => {});
        await fs.promises.rm(destination, { force: true }).catch(() => {});
        throw error;
      }
    });
  },

  async delete(id: string): Promise<boolean> {
    return serialize(async () => {
      if (!safeId(id)) return false;
      const current = await readCatalog();
      if (!current.some((item) => item.id === id)) return false;
      await writeCatalog(current.filter((item) => item.id !== id));
      await fs.promises.rm(path.join(filesRoot, `${id}.pdf`), { force: true });
      return true;
    });
  },
};
