import { z } from 'zod';

export const serviceUrlSchema = z.string().url().transform((value) => value.replace(/\/+$/, ''));
export const nonSecretPublicConfigSchema = z.object({
  gatewayUrl: serviceUrlSchema,
  aiApiUrl: serviceUrlSchema.optional(),
});
