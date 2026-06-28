import { describe, it, expect } from "vitest";
import { NET_PROFILES } from "../src/index.js";
import {
  runLatencyBench,
  simulateKCPLatency,
  simulateQCPLatency,
} from "../src/baseline.js";

describe("QCP beats KCP — all network scenarios", () => {
  for (const [name, profile] of Object.entries(NET_PROFILES)) {
    it(`scenario: ${name}`, () => {
      const result = runLatencyBench(
        profile,
        5000,
        () => simulateQCPLatency(profile),
        () => simulateKCPLatency(profile)
      );
      expect(result.qcpP50).toBeLessThan(result.kcpP50);
      expect(result.qcpP99).toBeLessThan(result.kcpP99);
    });
  }
});
