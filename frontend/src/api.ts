import axios from 'axios';

const API_BASE = '/api';

export interface TrafficLightState {
  class: string;
  group: string;
  tl: string;
  colour: string;
  timestamp: string;
  expires_at?: string;
  description?: string;
  tags: string[];
}

export interface MetricRecord {
  class: string;
  group: string;
  tl: string;
  timestamp: string;
  key: string;
  value: number;
  value_str?: string;
  metric_type: string;
  unit?: string;
  green_if?: string[];
  yellow_if?: string[];
}

export interface IncidentRecord {
  class: string;
  group: string;
  tl: string;
  colour: string;
  start_time: string;
  duration_seconds: number;
  description?: string;
}

export type TopOffender = [string, string, string, number];

export interface AppSettings {
  history_purge_max_records: number;
  history_purge_max_days: number;
  default_expiration_minutes: number;
  purple_to_yellow_minutes: number;
  purple_to_red_minutes: number;
}

export const getTrafficLights = async () => {
  const response = await axios.get<TrafficLightState[]>(`${API_BASE}/traffic-lights`);
  return response.data;
};

export const getHistory = async (cls: string, grp: string, tl: string) => {
  const response = await axios.get<TrafficLightState[]>(`${API_BASE}/traffic-lights/${cls}/${grp}/${tl}/history`);
  return response.data;
};

export const getMetrics = async (cls: string, grp: string, tl: string) => {
  const response = await axios.get<MetricRecord[]>(`${API_BASE}/traffic-lights/${cls}/${grp}/${tl}/metrics`);
  return response.data;
};

export const getIncidents = async (hours: number = 24) => {
  const response = await axios.get<IncidentRecord[]>(`${API_BASE}/reports/incidents?hours=${hours}`);
  return response.data;
};

export const getTopOffenders = async (hours: number = 24) => {
  const response = await axios.get<TopOffender[]>(`${API_BASE}/reports/top-offenders?hours=${hours}`);
  return response.data;
};

export const overrideColour = async (cls: string, grp: string, tl: string, colour: string, message: string) => {
  const payload = {
    class: cls,
    group: grp,
    tl: tl,
    colour: colour,
    description: `MANUAL OVERRIDE: ${message}`,
    timestamp: new Date().toISOString(),
    expires_at: null, 
  };
  const ingestUrl = `${window.location.protocol}//${window.location.hostname}:9000/`;
  const response = await fetch(ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
  });
  if (!response.ok && response.status !== 202) {
      throw new Error(`Failed to override colour: ${response.statusText}`);
  }
};

export const getSettings = async () => {
    const response = await axios.get<AppSettings>(`${API_BASE}/settings`);
    return response.data;
};

export const updateSettings = async (settings: AppSettings) => {
    const response = await axios.post<AppSettings>(`${API_BASE}/settings`, settings);
    return response.data;
};
