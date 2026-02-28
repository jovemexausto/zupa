import { InboundMessage, STTProvider, MessagingTransport, TTSProvider } from "../ports";
import { AgentLanguage } from "../entities/agent";
import { retryIdempotent, withTimeout } from "./async";

interface ResolveInboundContentInput {
    message: InboundMessage;
    sttProvider: Pick<STTProvider, 'transcribe'>;
    config: {
        agentLanguage: AgentLanguage;
        sttTimeoutMs?: number;
        maxIdempotentRetries?: number;
        retryBaseDelayMs?: number;
        retryJitterMs?: number;
    };
}

export async function resolveInboundContent(input: ResolveInboundContentInput): Promise<{
    contentText: string;
    inputModality: 'text' | 'voice';
}> {
    if (!input.message.hasMedia || (input.message.type !== 'ptt' && input.message.type !== 'audio') || !input.message.downloadMedia) {
        return { contentText: input.message.body, inputModality: 'text' };
    }

    try {
        const media = await input.message.downloadMedia();
        if (!media) {
            return { contentText: input.message.body, inputModality: 'text' };
        }

        const synthesized = await withTimeout({
            timeoutMs: input.config.sttTimeoutMs ?? 15_000,
            label: 'STT transcription',
            run: async () => retryIdempotent({
                maxRetries: input.config.maxIdempotentRetries ?? 2,
                baseDelayMs: input.config.retryBaseDelayMs ?? 75,
                jitterMs: input.config.retryJitterMs ?? 25,
                run: async () => {
                    return input.sttProvider.transcribe({
                        audio: media.data,
                        format: media.mimetype,
                        language: input.config.agentLanguage
                    });
                }
            })
        });

        return {
            contentText: synthesized.transcript,
            inputModality: 'voice'
        };
    } catch {
        return { contentText: input.message.body, inputModality: 'text' };
    }
}

interface FinalizeResponseInput {
    input: {
        replyTarget: string;
        replyText: string;
        preferredVoiceReply: boolean;
        userId: string;
        sessionId: string;
    };
    ttsProvider: Pick<TTSProvider, 'synthesize'>;
    messaging: MessagingTransport;
    config: {
        ttsVoice: string;
        agentLanguage: AgentLanguage;
        ttsTimeoutMs?: number;
        maxIdempotentRetries?: number;
        retryBaseDelayMs?: number;
        retryJitterMs?: number;
    };
}

export async function finalizeResponse(input: FinalizeResponseInput): Promise<{
    outputModality: 'text' | 'voice';
    contentAudioUrl: string | null;
}> {
    const textReply = async () => {
        await input.messaging.sendText(input.input.replyTarget, input.input.replyText);
        return { outputModality: 'text' as const, contentAudioUrl: null };
    };

    if (!input.input.preferredVoiceReply) {
        return textReply();
    }

    try {
        const synthesized = await withTimeout({
            timeoutMs: input.config.ttsTimeoutMs ?? 15_000,
            label: 'TTS synthesis',
            run: async () => retryIdempotent({
                maxRetries: input.config.maxIdempotentRetries ?? 2,
                baseDelayMs: input.config.retryBaseDelayMs ?? 75,
                jitterMs: input.config.retryJitterMs ?? 25,
                run: async () => {
                    return input.ttsProvider.synthesize({
                        text: input.input.replyText,
                        voice: input.config.ttsVoice,
                        language: input.config.agentLanguage
                    });
                }
            })
        });

        await input.messaging.sendVoice(input.input.replyTarget, {
            buffer: synthesized.audio,
            mimetype: synthesized.format
        });

        return {
            outputModality: 'voice',
            contentAudioUrl: 'transient-audio-buffer'
        };
    } catch {
        return textReply();
    }
}
