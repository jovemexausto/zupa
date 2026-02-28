export function normalizeExternalUserId(rawFrom: string): string {
    const withoutSuffix = rawFrom.replace(/@.+$/, '');
    const digits = withoutSuffix.replace(/\D/g, '');
    return `+${digits}`;
}

export function resolveReplyTarget(from: string, normalizedExternalUserId: string): string {
    return from.includes('@') ? from : normalizedExternalUserId;
}
