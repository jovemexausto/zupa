import { describe, expect, it } from 'vitest';
import {
  FakeLLMProvider,
  FakeSTTProvider,
  FakeTTSProvider,
  FakeMessagingTransport,
  FakeDatabaseBackend,
  FakeStateProvider
} from '../src/index';

describe('fake adapters', () => {
  it('uses queued LLM responses in order', async () => {
    const llm = new FakeLLMProvider([
      {
        content: 'a',
        structured: null,
        toolCalls: [],
        tokensUsed: { promptTokens: 1, completionTokens: 1 },
        model: 'fake',
        latencyMs: 1
      },
      {
        content: 'b',
        structured: null,
        toolCalls: [],
        tokensUsed: { promptTokens: 1, completionTokens: 1 },
        model: 'fake',
        latencyMs: 1
      }
    ]);

    const first = await llm.complete({ messages: [], systemPrompt: 'x' });
    const second = await llm.complete({ messages: [], systemPrompt: 'x' });

    expect(first.content).toBe('a');
    expect(second.content).toBe('b');
  });

  it('captures language in STT and output path in TTS', async () => {
    const stt = new FakeSTTProvider('hello from stt');
    const tts = new FakeTTSProvider();

    const sttResult = await stt.transcribe({ audio: Buffer.from('123'), format: 'audio/ogg', language: 'pt' as any });
    const ttsResult = await tts.synthesize({ text: 'hello', voice: 'nova', language: 'pt' as any });

    expect(sttResult.transcript).toBe('hello from stt');
    expect(stt.lastRequest?.language).toBe('pt');
    expect(ttsResult.audio.toString()).toBe('fake-audio-bytes');
    expect(tts.lastRequest?.voice).toBe('nova');
  });

  it('records outbound transport events', async () => {
    const messaging = new FakeMessagingTransport();
    await messaging.sendText('u1', 'hello');
    await messaging.sendVoice('u1', { buffer: Buffer.from('fake'), mimetype: 'audio/ogg' });

    expect(messaging.sentText).toEqual([{ to: 'u1', text: 'hello' }]);
    expect(messaging.sentVoice[0].to).toBe('u1');
    expect(messaging.sentVoice[0].media.mimetype).toBe('audio/ogg');
  });

  it('stores and retrieves users/messages in fake db and kv in state provider', async () => {
    const db = new FakeDatabaseBackend();
    const state = new FakeStateProvider();

    const user = await db.createUser({ externalUserId: '+15550000000', displayName: 'Test User' });
    const session = await db.createSession(user.id);

    await db.createMessage({
      sessionId: session.id,
      userId: user.id,
      role: 'user',
      contentText: 'hello',
      inputModality: 'text',
      outputModality: 'text',
      tokensUsed: { promptTokens: 0, completionTokens: 0 },
      latencyMs: 0
    });

    const kv = state.attach(session.id);
    await kv.set('correctionCount', 1);

    const found = await db.findUser('+15550000000');
    const recent = await db.getRecentMessages(session.id, 5);
    const kvAll = await kv.all();

    expect(found?.id).toBe(user.id);
    expect(recent).toHaveLength(1);
    expect(kvAll).toEqual({ correctionCount: 1 });
  });

  it('claims inbound events once and marks duplicates', async () => {
    const db = new FakeDatabaseBackend();

    const first = await db.claimInboundEvent('wa:msg:abc');
    const second = await db.claimInboundEvent('wa:msg:abc');

    expect(first).toBe('claimed');
    expect(second).toBe('duplicate');
  });
});
