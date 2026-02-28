# RFC: Media Storage Abstraction & Transients Buffer

## Background & Objective
Currently, Zupa's core abstractions (`STTProvider`, `TTSProvider`, `MessagingTransport`, `InboundMessage`) rely on physical filesystem paths (e.g., `audioPath`, `mediaPath`, `outputPath`). This creates a tight coupling to the local disk, preventing horizontal scalability, serverless deployments, and clean decoupling formatting.

The objective of this RFC is to eliminate physical paths (`audioPath`, `mediaPath`, `outputPath`) from the core contracts and rely strictly on the `storage` abstraction (`FileStorage`) or raw `Buffer`/Streams.

## Proposed Changes

### 1. Update `TTSProvider` Contract
Instead of the runtime providing an `outputPath` and the TTS adapter writing to the disk, the adapter should return the raw audio bytes.
- **Current**: `synthesize(options: { text: string, outputPath: string, voice, language }): Promise<{ audioPath: string }>`
- **Proposed**: `synthesize(options: { text: string, voice, language }): Promise<{ audio: Buffer, format: string, ... }>`
- **Workflow**: The `response_finalize` node calls `synthesize()`, gets the `Buffer`, and then uses `resources.storage.put(mediaKey, audio)` to persist it if needed.

### 2. Update `STTProvider` Contract
Instead of receiving an `audioPath` and reading from the disk, the adapter should accept a `Buffer` or a `storageKey`. 
- **Current**: `transcribe(options: { audioPath: string, language: string }): Promise<{ transcript: string }>`
- **Proposed**: `transcribe(options: { audio: Buffer, format: string, language: string }): Promise<{ transcript: string }>`
- **Workflow**: The `content_resolution` node fetches the audio bytes (via the transport's `downloadMedia` or from `resources.storage.get(key)`) and passes the `Buffer` directly to STT.

### 3. Update `MessagingTransport` outbound methods
Outbound methods should accept a `Buffer` + `mimeType` or a `mediaUrl` rather than an absolute filesystem path.
- **Current**: `sendVoice(to: string, audioPath: string)` and `sendMedia(to: string, mediaPath: string, caption?: string)`
- **Proposed**: `sendVoice(to: string, media: { buffer: Buffer, mimetype: string })` and `sendMedia(to: string, media: { buffer: Buffer, mimetype: string, filename?: string }, caption?: string)`

### 4. Update `InboundMessage` Contract
`InboundMessage` currently uses an `audioPath?` and a `downloadMedia` function returning base64.
- **Proposed**: Remove `audioPath`. If an incoming message is voice/audio, the transport should immediately buffer it or expose a `downloadMedia(): Promise<{ buffer: Buffer, mimetype: string }>` so the orchestrator can pull it into RAM without touching the disk.

### 5. Transients & `FileStorage` Usage
- **Persistence vs. Transients**: If audio/media needs to be kept for history/auditing, the runtime nodes will call `resources.storage.put('sessions/xyz/...', buffer)`. 
- If the agent just needs to process it ephemerally (e.g., voice-to-text), it is kept in memory as a `Buffer`, transcribed, and garbage collected, completely skipping `FileStorage` unless required by config.

## Execution Plan

1. **Modify Core Ports**: Update `TTSProvider`, `STTProvider`, `MessagingTransport`, `InboundMessage` interfaces in `@zupa/core`.
2. **Update Handlers & Utilities**: Modify `chat.ts` (`resolveInboundContent`, `finalizeResponse`), `contentResolutionNode`, and `responseFinalizeNode` to coordinate the `Buffer` moving between components instead of paths.
3. **Refactor Adapters**:
    - Update `OpenAIWhisperSTTProvider` to accept `Buffer` and convert it to a `File` object for OpenAI API.
    - Update `OpenAITTSProvider` to return a `Buffer` instead of calling `fs.writeFile`.
    - Update `WWebJSMessagingTransport` to use the `Buffer` directly to construct `MessageMedia` objects.
    - Update `FakeMessagingTransport`, `FakeSTTProvider`, `FakeTTSProvider`.
4. **Testing**: Run the test suite and verify `Vitest` passes entirely without writing transient audio to the local developer disk.

## Actions Required
- Review and approve RFC.
- Move implementation into our execution tracking (`TODO.md` / `task.md`).
