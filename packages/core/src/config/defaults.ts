/**
 * Default constants for Zupa agent configuration
 */

/**
 * UI Server Configuration
 */
export const UI_DEFAULTS = {
  /** Default host for UI server */
  HOST: "127.0.0.1" as const,

  /** Default SSE heartbeat interval in milliseconds */
  SSE_HEARTBEAT_MS: 15_000 as const,

  /** Whether UI is enabled by default */
  ENABLED: true as const,

  /** get-port-please configuration for finding available ports */
  PORT_CONFIG: {
    port: 5557,
    alternativePortRange: [4200, 4300] as [number, number],
  },
};

/**
 * Logging Configuration
 */
export const LOGGING_DEFAULTS = {
  /** Default log level */
  LEVEL: "info" as const,

  /** Whether to pretty-print logs (enabled in non-production) */
  PRETTY_PRINT: process.env.NODE_ENV !== "production",
} as const;

/**
 * Agent Runtime Defaults (if needed here for reference)
 * Note: Most runtime defaults are in @zupa/core/src/config/types.ts
 * These are kept for UI/server-specific configuration
 */
export const AGENT_UI_DEFAULTS = {
  ...UI_DEFAULTS,
  ...LOGGING_DEFAULTS,
} as const;
