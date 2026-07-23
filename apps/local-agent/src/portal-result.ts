import type { PortalConnectorId } from './config.js';

function listValue(value: string | undefined) {
  if (!value) return [];
  return value.split(/\r?\n|;/).map((item) => item.replace(/^[•\-–]\s*/, '').trim()).filter(Boolean);
}

export function normalizePortalFields(
  connectorId: PortalConnectorId,
  values: Record<string, string | undefined>,
) {
  if (connectorId === 'reconvision') {
    const readyText = values.frontlineReady?.trim() ?? '';
    const explicitlyNotReady = /\b(?:no|not|false|incomplete|pending)\b/i.test(readyText);
    return {
      stage: values.stage?.trim() || null,
      openWork: listValue(values.openWork),
      frontlineReady: readyText ? !explicitlyNotReady && /\b(?:yes|true|ready|complete|completed)\b/i.test(readyText) : null,
    };
  }
  return {
    location: values.location?.trim() || null,
    holder: values.holder?.trim() || null,
  };
}
