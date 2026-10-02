# JAMI text-to-speech

## Runtime modes

The client has one playback controller (`src/lib/jami-tts.ts`). `auto` tries an
installed browser voice whose `localService` flag is true. It does not accept an
online browser voice and does not silently use an English voice for Vietnamese.
The cloud route is used only when both client build configuration and server
runtime configuration explicitly allow it.

The current repository does **not** contain a verified sherpa-onnx WASM bundle.
Consequently the UI and controller do not claim that the WASM voice is ready.
Offline reading currently means an installed operating-system voice plus an app
shell that the deployment makes available offline; this repository does not yet
contain a service worker for the app shell.

## Configuration

Server runtime keys are documented in `.env.example`. `VITE_JAMI_TTS_*` keys are
public build-time settings and require rebuilding the client. Never put API keys
in a `VITE_` variable.

Cloud is off by default. To enable it deliberately, set both
`JAMI_TTS_ALLOW_CLOUD_FALLBACK=true` on the server and
`VITE_JAMI_TTS_ALLOW_CLOUD_FALLBACK=true` for the client build. Authentication,
the existing AI rate limiter, input limits, MIME validation and a finite timeout
remain in the request path.

## WASM integration gate

The proposed bundle is pinned to sherpa-onnx `v1.13.8` and
`vits-piper-vi_VN-vais1000-medium`. Before enabling `wasm-local`, produce and
self-host all of the official build outputs (JavaScript loader, WASM and data),
then record exact byte sizes and SHA-256 checksums in a versioned manifest. The
bundle must include the matching model, `tokens.txt`, and `espeak-ng-data`; an
ONNX file alone is not a working Piper pipeline. Initialization and synthesis
must be tested in a Worker before the cache is marked ready.

No unverified download script or mock runtime is included. The official WASM
build currently combines runtime and voice resources into a large data artifact,
so the exact produced files—not estimates—must drive download progress and the
storage check.

## Sources and licenses to preserve with a future bundle

- sherpa-onnx `v1.13.8`: Apache-2.0. Preserve its LICENSE and NOTICE obligations.
- `vi_VN-vais1000-medium`: Piper voices repository is MIT; its model card states
  that the VAIS-1000 training dataset is CC BY 4.0. Preserve the model card and
  attribution.
- espeak-ng and its data: GPL-3.0. Distribution of a built bundle needs a license
  review and corresponding-source compliance; do not label it Apache-2.0 merely
  because sherpa-onnx is Apache-2.0.
- ONNX Runtime and any Emscripten runtime files must retain their own notices from
  the exact pinned build.

References:

- https://k2-fsa.github.io/sherpa/onnx/tts/wasm/build.html
- https://k2-fsa.github.io/sherpa/onnx/tts/all/Vietnamese/vits-piper-vi_VN-vais1000-medium.html
- https://github.com/k2-fsa/sherpa-onnx/tree/v1.13.8
- https://huggingface.co/rhasspy/piper-voices/blob/main/vi/vi_VN/vais1000/medium/MODEL_CARD
- https://github.com/espeak-ng/espeak-ng/blob/master/COPYING
