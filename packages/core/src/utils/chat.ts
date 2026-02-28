import { InboundMessage, STTProvider, MessagingTransport, TTSProvider } from "../ports";
import { AgentLanguage } from "../entities/agent";
import { retryIdempotent, withTimeout } from "./async";

interface ResolveInboundContentInput {
    message: InboundMessage;
    sttProvider: Pick<STTProvider, 'transcribe'>;
    config: {
        audioStoragePath: string; // Ideally this should be removed and use storage port
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
    if (!input.message.hasMedia || (input.message.type !== 'ptt' && input.message.type !== 'audio')) {
        return { contentText: input.message.body, inputModality: 'text' };
    }

    try {
        const synthesized = await withTimeout({
            timeoutMs: input.config.sttTimeoutMs ?? 15_000,
            label: 'STT transcription',
            run: async () => retryIdempotent({
                maxRetries: input.config.maxIdempotentRetries ?? 2,
                baseDelayMs: input.config.retryBaseDelayMs ?? 75,
                jitterMs: input.config.retryJitterMs ?? 25,
                run: async () => {
                    return input.sttProvider.transcribe({
                        audioPath: input.message.audioPath || 'TODO_STUB',
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
        audioStoragePath: string;
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
                        outputPath: 'TODO_STUB',
                        language: input.config.agentLanguage
                    });
                }
            })
        });

        await input.messaging.sendVoice(input.input.replyTarget, synthesized.audioPath);

        const contentAudioUrl = synthesized.audioPath.split('/').pop() || 'outbound.ogg';

        return {
            outputModality: 'voice',
            contentAudioUrl
        };
    } catch {
        return textReply();
    }
}
