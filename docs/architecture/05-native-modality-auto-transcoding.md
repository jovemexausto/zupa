# ADR 05: Native Modality (Auto-Transcoding)

## Status
Accepted

## Context
Conversational AI is increasingly multi-modal (Text, Voice, Images). Traditionally, developers have to manually handle Audio-to-Text (STT) on input and Text-to-Audio (TTS) on output, often leading to complex, imperative "if/else" blocks in their application logic.

Zupa aims to offer a "Magical" developer experience where the agent seamlessly adapts to the user's communication style.

## Decision
We have implemented **Native Modality** with an `auto` (transparent) strategy.

### 1. Input Transcoding
When a transport (e.g., WhatsApp) emits a `voice` message, the `AgentRuntime` automatically:
1. Detects the media type.
2. Invokes the `STTProvider` to transcribe it.
3. Populates `state.resolvedContent` with the text.
4. Sets `state.inputModality = 'voice'`.

The Graph Engine only sees the text, keeping the reasoning logic pure.

### 2. Output Heuristics (`modality: 'auto'`)
The engine decides the output format based on three layers of logic (in order):
1. **Explicit Enforcer**: If the `AgentRuntime` is configured with `modality: 'voice'`, it always speaks.
2. **User Preference**: If the user has a `preferredReplyFormat` (e.g., 'always text').
3. **Dynamic Mirroring**: If set to `mirror`, the agent replies in the same format it received (Voice -> Voice, Text -> Text).
4. **Heuristic AI**: Using Regex or LLM classification to detect if the user *asked* for a specific format (e.g., "Mande um áudio").

### 3. Transparent Execution
If the decision is `voice`, the `finalizeResponse` utility automatically converts the LLM's text output into audio via the `TTSProvider` and sends the media through the transport.

## Consequences

### Positive
- **Reduced Complexity**: Developers don't write STT/TTS logic; they just write prompts.
- **Improved UX**: The agent feels more "human" by naturally matching the user's modality.
- **Portability**: Changing the TTS vendor (e.g., OpenAI to ElevenLabs) requires zero changes to the agent logic or graph.

### Negative
- **Latency**: Voice-to-Voice loops are naturally slower due to two transcoding steps.
- **Cost**: `auto` modality can accidentally trigger expensive TTS if the heuristics are too aggressive.
