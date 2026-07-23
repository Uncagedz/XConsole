export interface ProviderOptions {
  vin: string;
  mileage?: number;
  trace?: boolean;
  force?: boolean;
}

export interface ProviderResult<T = Record<string, unknown>> {
  site: string;
  ok: boolean;
  data: T;
  errors: string[];
  artifacts: Record<string, string>;
}
