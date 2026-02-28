// TODO: this is a concept we need to solidify

export interface PreferencePatch {
    reply_in_voice?: boolean;
    max_reply_length?: 'short' | 'normal' | 'long';
}

function includesAny(input: string, patterns: RegExp[]): boolean {
    return patterns.some((pattern) => pattern.test(input));
}

export function parsePreferencePatch(text: string): PreferencePatch | null {
    const normalized = text.trim().toLowerCase();
    if (!normalized) {
        return null;
    }

    const patch: PreferencePatch = {};

    if (
        includesAny(normalized, [
            /reply to me in voice/,
            /reply in voice/,
            /voice replies/,
            /send voice replies/,
            /respond with voice/
        ])
    ) {
        patch.reply_in_voice = true;
    }

    if (
        includesAny(normalized, [
            /reply in text/,
            /text replies/,
            /text only/,
            /don't reply in voice/,
            /do not reply in voice/
        ])
    ) {
        patch.reply_in_voice = false;
    }

    if (includesAny(normalized, [/keep it short/, /short replies/, /be brief/])) {
        patch.max_reply_length = 'short';
    }

    if (includesAny(normalized, [/keep it normal/, /normal length/])) {
        patch.max_reply_length = 'normal';
    }

    if (includesAny(normalized, [/keep it long/, /more detail/, /longer replies/])) {
        patch.max_reply_length = 'long';
    }

    return Object.keys(patch).length > 0 ? patch : null;
}

export function applyLengthPreference(systemPrompt: string, preference: unknown): string {
    if (preference === 'short') {
        return `${systemPrompt}\n\nKeep replies concise (1-3 short sentences) unless the user asks for more detail.`;
    }

    if (preference === 'long') {
        return `${systemPrompt}\n\nWhen helpful, include richer explanations and examples.`;
    }

    return systemPrompt;
}
