export interface VehicleSignals {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  price: number;
  marketValue?: number;
  mileage?: number;
  reconStage?: string;
  keyLocation?: string;
  carfax?: {
    owners?: number;
    accidents?: number;
    services?: number;
    brands?: string[];
    mileage?: number;
  };
  photoCount?: number;
}

export interface CustomerSignals {
  creditScore: number;
  incomeMonthly: number;
  dti?: number;
  state?: string;
  downPaymentDesired?: number;
  termDesired?: number;
  aprDesired?: number;
  usage?: 'personal' | 'commercial';
  riskScore?: number;
  watchlistHits?: number;
}
