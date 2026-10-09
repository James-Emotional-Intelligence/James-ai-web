# JAMI text-to-speech

## Runtime modes

The client has one playback controller (`src/lib/jami-tts.ts`). In `auto` mode it
tries providers in this order:

1. A matching browser voice with `localService=true`.
2. The pinned Vietnamese Piper voice in a dedicated Web Worker.
3. The authenticated cloud route, only when both client and server explicitly
   allow cloud fallback.

Vietnamese is never sent to an English browser voice. Playback state starts on
`SpeechSynthesisUtterance.onstart` or `HTMLAudioElement.onplaying`, not while the
model is downloading or generating audio.

## Offline Piper package

The implementation pins these packages and assets:

- `@mintplex-labs/piper-tts-web@1.0.5`
- `@diffusionstudio/piper-wasm@1.0.0`
- `onnxruntime-web@1.18.0`
- `vi_VN-vais1000-medium` (22,050 Hz, one speaker)

`scripts/copy-tts-runtime.mjs` copies the pinned WASM files from `node_modules`
to `public/tts-assets/runtime` before development or client builds. The model and
its config are self-hosted under `public/tts-assets/model`. Exact sizes and
SHA-256 checksums are in `src/lib/tts-offline-manifest.ts`.

The first download is about 98 MiB. The model is verified and stored in OPFS;
the runtime files are verified and stored in Cache Storage. The Worker is not
created and no model is loaded until the user downloads the voice or speech
falls through to the offline provider. A cache marker is written only after all
files pass size and SHA-256 checks. Synthesis returns a WAV to the main thread;
only the main thread owns playback.

The TTS assets remain usable after reload without another `/tts-assets/`
request. Full page reload while completely offline additionally depends on the
deployment/browser retaining the application shell; JAMI does not cache API,
authentication, chat, or student data in a service worker.

## Configuration

Server runtime keys are documented in `.env.example`. `VITE_JAMI_TTS_*` keys are
public build-time settings and require rebuilding the client. Never put API keys
in a `VITE_` variable.

Cloud is off by default. To enable it deliberately, set both
`JAMI_TTS_ALLOW_CLOUD_FALLBACK=true` on the server and
`VITE_JAMI_TTS_ALLOW_CLOUD_FALLBACK=true` for the client build. Authentication,
the existing AI rate limiter, input limits, MIME validation and a finite timeout
remain in the request path.

## Sources and licenses

- Piper Web wrapper and Piper phonemizer WASM packages declare MIT licenses.
- ONNX Runtime Web is MIT licensed.
- The Piper voices repository declares MIT. The bundled model card says the
  VAIS-1000 dataset is CC BY 4.0 and is shipped beside the model.
- The phonemizer contains eSpeak NG data. Preserve the upstream notices and
  review GPL-3.0 obligations before redistributing a release outside this
  project; package metadata alone does not replace that review.

References and notices are included in `public/tts-assets/THIRD_PARTY_NOTICES.md`.
