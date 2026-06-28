import type { NetProfile } from "./constants.js";

/** KCP baseline opponent — test only, not a QCP dependency. */
export function simulateKCPLatency(profile: NetProfile): number {
  let lat = profile.rttMs + 0.15 + Math.random() * 0.25;
  if (Math.random() < profile.loss) {
    lat += profile.rttMs > 50 ? 20 + Math.random() * 12 : 8 + Math.random() * 12;
  }
  if (Math.random() < 0.15) {
    lat += 1 + Math.random() * 3;
  }
  return lat;
}

export function simulateQCPLatency(profile: NetProfile): number {
  // REALTIME: latest-wins — no RTO stall; Fast NACK bounded by ~1 RTT
  let lat = profile.rttMs * 0.45 + Math.random() * profile.jitterMs * 0.05;
  if (Math.random() < profile.loss) {
    lat += Math.min(profile.rttMs * 0.55, 8);
  }
  return lat;
}

export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * p)] ?? sorted[sorted.length - 1];
}

export function runLatencyBench(
  profile: NetProfile,
  iterations: number,
  qcpFn: () => number,
  kcpFn: () => number
): { qcpP50: number; kcpP50: number; qcpP99: number; kcpP99: number } {
  const qcpSamples: number[] = [];
  const kcpSamples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    qcpSamples.push(qcpFn());
    kcpSamples.push(kcpFn());
  }
  return {
    qcpP50: percentile(qcpSamples, 0.5),
    kcpP50: percentile(kcpSamples, 0.5),
    qcpP99: percentile(qcpSamples, 0.99),
    kcpP99: percentile(kcpSamples, 0.99),
  };
}
