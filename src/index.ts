export { QCPConn, STREAM_REALTIME, STREAM_BATCH, STREAM_CRITICAL } from "./conn.js";
export type { ARQConfig, NetProfile } from "./constants.js";
export { NET_PROFILES } from "./constants.js";
export {
  simulateKCPLatency,
  simulateQCPLatency,
  runLatencyBench,
  percentile,
} from "./baseline.js";
