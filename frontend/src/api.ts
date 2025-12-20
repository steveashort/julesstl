import axios from 'axios';

const API_BASE = '/api';

export interface TrafficLightState {
  class: string;
  tl: string;
  colour: string;
  timestamp: string;
  expires_at?: string;
  description?: string;
  tags: string[];
}

export interface MetricRecord {
  class: string;
  tl: string;
  timestamp: string;
  key: string;
  value: number;
  value_str?: string;
  metric_type: string;
  unit?: string;
}

export const getTrafficLights = async () => {
  const response = await axios.get<TrafficLightState[]>(`${API_BASE}/traffic-lights`);
  return response.data;
};

export const getHistory = async (cls: string, tl: string) => {
  const response = await axios.get<TrafficLightState[]>(`${API_BASE}/traffic-lights/${cls}/${tl}/history`);
  return response.data;
};

export const getMetrics = async (cls: string, tl: string) => {
  const response = await axios.get<MetricRecord[]>(`${API_BASE}/traffic-lights/${cls}/${tl}/metrics`);
  return response.data;
};
