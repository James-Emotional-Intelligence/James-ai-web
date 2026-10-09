/// <reference lib="webworker" />

import { HF_BASE, PATH_MAP, TtsSession } from '@mintplex-labs/piper-tts-web';
import {
  OFFLINE_TTS_ASSETS,
  OFFLINE_TTS_TOTAL_BYTES,
  OFFLINE_TTS_VERSION,
  OFFLINE_TTS_VOICE_ID,
} from './tts-offline-manifest';

declare const self: DedicatedWorkerGlobalScope;

type RequestMessage =
  | { type: 'status'; jobId: number }
  | { type: 'prepare'; jobId: number }
  | { type: 'synthesize'; jobId: number; text: string }
  | { type: 'remove'; jobId: number };

const CACHE_NAME = `jami-tts-${OFFLINE_TTS_VERSION}`;
const MARKER_NAME = `${OFFLINE_TTS_VERSION}.json`;
let sessionPromise: Promise<TtsSession> | null = null;
const nativeFetch = self.fetch.bind(self);

const post = (message: Record<string, unknown>, transfer?: Transferable[]) => {
  self.postMessage(message, transfer || []);
};

const sha256 = async (buffer: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const getPiperDirectory = async () => {
  if (!navigator.storage?.getDirectory) throw new Error('Trình duyệt không hỗ trợ kho giọng ngoại tuyến OPFS.');
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('piper', { create: true });
};

const hasValidMarker = async (): Promise<boolean> => {
  try {
    const dir = await getPiperDirectory();
    const marker = await (await dir.getFileHandle(MARKER_NAME)).getFile();
    const value = JSON.parse(await marker.text()) as { version?: string };
    if (value.version !== OFFLINE_TTS_VERSION) return false;
    for (const asset of OFFLINE_TTS_ASSETS.filter((item) => item.storage === 'opfs')) {
      const file = await (await dir.getFileHandle(asset.url.split('/').pop()!)).getFile();
      if (file.size !== asset.size) return false;
    }
    const cache = await caches.open(CACHE_NAME);
    for (const asset of OFFLINE_TTS_ASSETS.filter((item) => item.storage === 'cache')) {
      const response = await cache.match(new URL(asset.url, self.location.origin).href);
      if (!response || Number(response.headers.get('content-length') || asset.size) !== asset.size) return false;
    }
    return true;
  } catch {
    return false;
  }
};

const writeOpfs = async (name: string, buffer: ArrayBuffer) => {
  const dir = await getPiperDirectory();
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(buffer);
  await writable.close();
};

const fetchVerified = async (
  url: string,
  size: number,
  expectedHash: string,
  onChunk: (bytes: number) => void,
): Promise<ArrayBuffer> => {
  const response = await nativeFetch(new URL(url, self.location.origin).href, { cache: 'no-store' });
  if (!response.ok || !response.body) throw new Error(`Không tải được tài nguyên giọng (${response.status}).`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      onChunk(value.byteLength);
    }
  }
  if (received !== size) throw new Error(`Tài nguyên giọng thiếu dữ liệu (${received}/${size} byte).`);
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (await sha256(merged.buffer) !== expectedHash) throw new Error('Checksum gói giọng không hợp lệ.');
  return merged.buffer;
};

const prepareAssets = async (jobId: number): Promise<void> => {
  if (await hasValidMarker()) {
    post({ type: 'progress', jobId, loaded: OFFLINE_TTS_TOTAL_BYTES, total: OFFLINE_TTS_TOTAL_BYTES });
    return;
  }
  let loaded = 0;
  const cache = await caches.open(CACHE_NAME);
  for (const asset of OFFLINE_TTS_ASSETS) {
    const buffer = await fetchVerified(asset.url, asset.size, asset.sha256, (bytes) => {
      loaded += bytes;
      post({ type: 'progress', jobId, loaded, total: OFFLINE_TTS_TOTAL_BYTES });
    });
    if (asset.storage === 'opfs') {
      await writeOpfs(asset.url.split('/').pop()!, buffer);
    } else {
      const absoluteUrl = new URL(asset.url, self.location.origin).href;
      await cache.put(absoluteUrl, new Response(buffer, {
        headers: { 'content-type': 'application/wasm', 'content-length': String(asset.size) },
      }));
    }
  }
  await writeOpfs(MARKER_NAME, new TextEncoder().encode(JSON.stringify({ version: OFFLINE_TTS_VERSION })).buffer);
};

const installCachedFetch = () => {
  self.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const cached = await caches.match(request.url);
    return cached || nativeFetch(input, init);
  }) as typeof fetch;
};

const getSession = async (jobId: number): Promise<TtsSession> => {
  await prepareAssets(jobId);
  installCachedFetch();
  if (!sessionPromise) {
    try {
      Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 1 });
    } catch {
      // ONNX Runtime also falls back to one thread when SharedArrayBuffer is unavailable.
    }
    const base = new URL('/tts-assets/runtime/', self.location.origin).href;
    const runtimeCache = await caches.open(CACHE_NAME);
    const piperData = await runtimeCache.match(`${base}piper_phonemize.data`);
    const piperWasm = await runtimeCache.match(`${base}piper_phonemize.wasm`);
    if (!piperData || !piperWasm) throw new Error('Cache runtime giọng ngoại tuyến không đầy đủ.');
    sessionPromise = TtsSession.create({
      voiceId: OFFLINE_TTS_VOICE_ID,
      wasmPaths: {
        onnxWasm: base,
        // Emscripten loads the data package through XHR, so blob URLs are used
        // here to make reloads work without any network request.
        piperData: URL.createObjectURL(await piperData.blob()),
        piperWasm: URL.createObjectURL(await piperWasm.blob()),
      },
    });
  }
  return sessionPromise;
};

const removeAssets = async () => {
  sessionPromise = null;
  TtsSession._instance = null;
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('piper', { recursive: true });
  } catch {
    // Missing cache is already the desired state.
  }
  await caches.delete(CACHE_NAME);
};

self.onmessage = async (event: MessageEvent<RequestMessage>) => {
  const message = event.data;
  try {
    if (message.type === 'status') {
      post({ type: 'status', jobId: message.jobId, ready: await hasValidMarker() });
      return;
    }
    if (message.type === 'remove') {
      await removeAssets();
      post({ type: 'removed', jobId: message.jobId });
      return;
    }
    const session = await getSession(message.jobId);
    if (message.type === 'prepare') {
      post({ type: 'ready', jobId: message.jobId });
      return;
    }
    const blob = await session.predict(message.text);
    const buffer = await blob.arrayBuffer();
    post({ type: 'audio', jobId: message.jobId, buffer, mime: blob.type || 'audio/wav' }, [buffer]);
  } catch (error) {
    post({ type: 'error', jobId: message.jobId, message: error instanceof Error ? error.message : String(error) });
  }
};

// These URLs are intentionally referenced so bundlers retain the package's expected model mapping.
void HF_BASE;
void PATH_MAP;
