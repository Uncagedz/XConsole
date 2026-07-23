export interface Lead {
  id: number;
  lead_id?: string | null;
  full_name?: string | null;
  messenger_handle?: string | null;
  phone?: string | null;
  email?: string | null;
  vehicle_interest?: string | null;
  status?: string | null;
  appointment_time?: string | null;
  opt_out: boolean;
  last_touch?: string | null;
  source_surface?: string | null;
  source_group?: string | null;
  post_id?: string | null;
}

export interface LeadsResponse {
  items: Lead[];
}
