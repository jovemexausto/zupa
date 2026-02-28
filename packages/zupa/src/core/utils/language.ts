import { type AgentLanguage, SUPPORTED_AGENT_LANGUAGES } from '../domain';

export function resolveLanguage(languageInput?: string): AgentLanguage {
  const normalized = (languageInput ?? 'en').trim().toLowerCase().replaceAll('_', '-');
  const canonical = normalized.includes('-') ? normalized.split('-')[0] ?? normalized : normalized;

  if (canonical === 'auto') {
    throw new Error("Invalid runtime config: language 'auto' is reserved but not supported yet.");
  }

  if (!SUPPORTED_AGENT_LANGUAGES.includes(canonical as AgentLanguage)) {
    throw new Error(`Invalid runtime config: unsupported language "${canonical}". Supported languages: ${SUPPORTED_AGENT_LANGUAGES.join(', ')}.`);
  }

  return canonical as AgentLanguage;
}