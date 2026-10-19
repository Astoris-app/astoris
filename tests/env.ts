// Test-only key. No production files or credentials are loaded in the test suite.
export const env: Record<string, string | undefined> = { ASTORIS_MASTER_KEY: 'a'.repeat(64) };
