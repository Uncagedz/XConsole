import { getLatestVinReport } from '../utils/vinReports.js';

export interface CarfaxSignals {
  owners?: number;
  accidents?: number;
  services?: number;
  brands?: string[];
}

export async function fetchCarfaxSignals(vin: string): Promise<CarfaxSignals> {
  const report = getLatestVinReport(vin) as
    | {
        results?: Array<{
          site?: string;
          data?: {
            highlights?: string[];
            accidents?: number;
            owners?: number;
            services?: number;
            brands?: string[];
          };
        }>;
      }
    | undefined;
  const carfaxResult = report?.results?.find((result) => result.site === 'carfax');
  const highlights = carfaxResult?.data?.highlights;
  const accidents = Array.isArray(highlights)
    ? highlights.filter((line: string) => /accident/i.test(line)).length
    : carfaxResult?.data?.accidents;
  const owners = carfaxResult?.data?.owners;
  const services = carfaxResult?.data?.services;
  const brands = carfaxResult?.data?.brands;
  return {
    owners,
    accidents,
    services,
    brands,
  };
}
