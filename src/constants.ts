export const TYPE_DATA = 0x01;
export const TYPE_ACK = 0x03;
export const TYPE_NACK = 0x07;

export const STREAM_CRITICAL = 0x00;
export const STREAM_REALTIME = 0x01;
export const STREAM_BATCH = 0x02;

export const HEADER_SIZE = 5;
export const CRC_SIZE = 4;
export const MAX_PACKET = 1500;

export type StreamType =
  | typeof STREAM_CRITICAL
  | typeof STREAM_REALTIME
  | typeof STREAM_BATCH;

export interface ARQConfig {
  noDelay?: boolean;
  fastResend?: number;
  mtu?: number;
  sendWnd?: number;
  recvWnd?: number;
}

export interface NetProfile {
  name: string;
  rttMs: number;
  jitterMs: number;
  loss: number;
}

export const NET_PROFILES: Record<string, NetProfile> = {
  lan: { name: "lan", rttMs: 2, jitterMs: 0.5, loss: 0 },
  wifi: { name: "wifi", rttMs: 20, jitterMs: 5, loss: 0.01 },
  "4g": { name: "4g", rttMs: 50, jitterMs: 10, loss: 0.02 },
  "3g": { name: "3g", rttMs: 150, jitterMs: 30, loss: 0.05 },
  congested: { name: "congested", rttMs: 100, jitterMs: 40, loss: 0.1 },
  extreme: { name: "extreme", rttMs: 300, jitterMs: 80, loss: 0.2 },
};
