export const SUPPORTED_AGENT_LANGUAGES = [
    "auto", "de", "en", "es", "fr", "hi", "id", "it", "ja", "ko", "nl", "pl", "pt", "ru", "uk", "vi", "zh"
] as const;

export type AgentLanguage = typeof SUPPORTED_AGENT_LANGUAGES[number];

export function resolveLanguage(lang?: string): AgentLanguage {
    if (!lang) return "en";
    const normalized = lang.toLowerCase().trim();
    if (SUPPORTED_AGENT_LANGUAGES.includes(normalized as AgentLanguage)) {
        return normalized as AgentLanguage;
    }
    return "en";
}
