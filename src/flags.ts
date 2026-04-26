const DEFAULT_FLAGS: Record<string, boolean> = {
  salesAssistantV2: true,
};

export function isOn(flagName: string): boolean {
  const envFlag = import.meta.env[`VITE_FLAG_${flagName.toUpperCase()}`];
  if (typeof envFlag === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(envFlag.toLowerCase());
  }
  return DEFAULT_FLAGS[flagName] ?? false;
}
