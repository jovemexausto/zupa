import { describe, expect, it } from 'vitest';

import { FakeLLMProvider } from '../src/integrations/llm/fake';
import { FakeSTTProvider } from '../src/integrations/stt/fake';
import { FakeTTSProvider } from '../src/integrations/tts/fake';
import { FakeMessagingTransport } from '../src/integrations/transport/fake';
import { FakeDatabaseBackend } from '../src/integrations/database/fake';

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

    const sttResult = await stt.transcribe({ audioPath: '/tmp/in.ogg', language: 'pt' });
    const ttsResult = await tts.synthesize({ text: 'hello', voice: 'nova', outputPath: '/tmp/out.ogg', language: 'pt' });

    expect(sttResult.transcript).toBe('hello from stt');
    expect(stt.lastRequest?.language).toBe('pt');
    expect(ttsResult.audioPath).toBe('/tmp/out.ogg');
    expect(tts.lastRequest?.outputPath).toBe('/tmp/out.ogg');
  });

  it('records outbound transport events', async () => {
    const messaging = new FakeMessagingTransport();
    await messaging.sendText('u1', 'hello');
    await messaging.sendVoice('u1', '/tmp/out.ogg');

    expect(messaging.sentText).toEqual([{ to: 'u1', text: 'hello' }]);
    expect(messaging.sentVoice).toEqual([{ to: 'u1', audioPath: '/tmp/out.ogg' }]);
  });

  it('stores and retrieves users/messages/session kv in fake db', async () => {
    const db = new FakeDatabaseBackend();

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

    await db.updateSessionKV(session.id, { correctionCount: 1 });

    const found = await db.findUser('+15550000000');
    const recent = await db.getRecentMessages(session.id, 5);
    const kv = db.sessionKv.get(session.id);

    expect(found?.id).toBe(user.id);
    expect(recent).toHaveLength(1);
    expect(kv).toEqual({ correctionCount: 1 });
  });

  it('claims inbound events once and marks duplicates', async () => {
    const db = new FakeDatabaseBackend();

    const first = await db.claimInboundEvent('wa:msg:abc');
    const second = await db.claimInboundEvent('wa:msg:abc');

    expect(first).toBe('claimed');
    expect(second).toBe('duplicate');
  });
});
