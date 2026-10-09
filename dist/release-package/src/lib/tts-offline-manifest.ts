export const OFFLINE_TTS_VERSION = 'piper-vi-vais1000-medium-1';
export const OFFLINE_TTS_VOICE_ID = 'vi_VN-vais1000-medium';

export type OfflineTtsAsset = {
  url: string;
  size: number;
  sha256: string;
  storage: 'opfs' | 'cache';
};

export const OFFLINE_TTS_ASSETS: readonly OfflineTtsAsset[] = [
  {
    url: '/tts-assets/model/vi_VN-vais1000-medium.onnx',
    size: 63_201_294,
    sha256: 'ec7c89e2c85f4d1edc24b6120c18aaf1bda614f06b511567eb9c7c0de15e2dab',
    storage: 'opfs',
  },
  {
    url: '/tts-assets/model/vi_VN-vais1000-medium.onnx.json',
    size: 4_860,
    sha256: 'fafb9da1354ed4b77c31af228ed41fb41cd825c14cffa105454b25e6ae751ee0',
    storage: 'opfs',
  },
  {
    url: '/tts-assets/runtime/piper_phonemize.data',
    size: 18_077_249,
    sha256: '29f1025eb23a5b5c192cd14a6efbce4509402ff265405072ee6f7d1a09b78f8c',
    storage: 'cache',
  },
  {
    url: '/tts-assets/runtime/piper_phonemize.wasm',
    size: 635_212,
    sha256: 'b777cd107a91d2bcc6a1ea46f2c26a662a7407394fe84589198aeaa83dd7a9d6',
    storage: 'cache',
  },
  {
    url: '/tts-assets/runtime/ort-wasm-simd.wasm',
    size: 10_595_041,
    sha256: 'f533b5f21790563d7556c611c3835ac65848ee326da2689aac54ed7d9cc8c6a4',
    storage: 'cache',
  },
  {
    url: '/tts-assets/runtime/ort-wasm.wasm',
    size: 9_758_086,
    sha256: 'ebe7ec327f83aabc07e3b58487522481ccff10941f24182ab0428d0123652ff2',
    storage: 'cache',
  },
] as const;

export const OFFLINE_TTS_TOTAL_BYTES = OFFLINE_TTS_ASSETS.reduce((sum, asset) => sum + asset.size, 0);
