import { describe, expect, it } from "vitest";
import { ARQEngine } from "../src/arq.ts";
import {
  STREAM_BATCH,
  STREAM_CRITICAL,
  STREAM_REALTIME,
  shouldAcceptRealtimeUpdate,
} from "../src/conn.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function text(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

describe("QCP game business scenarios", () => {
  it("keeps movement sync latest-wins on REALTIME", () => {
    const previous = 1;
    expect(shouldAcceptRealtimeUpdate(previous, 2)).toBe(true);
    expect(shouldAcceptRealtimeUpdate(2, 1)).toBe(false);
    expect(STREAM_REALTIME).toBe(1);
  });

  it("keeps AOI snapshots latest-wins on REALTIME", () => {
    const previous = 7;
    expect(shouldAcceptRealtimeUpdate(previous, 8)).toBe(true);
    expect(shouldAcceptRealtimeUpdate(8, 7)).toBe(false);
    expect(STREAM_REALTIME).toBe(1);
  });

  it("keeps hit resolution ordered and reliable on CRITICAL", () => {
    const arq = new ARQEngine();

    expect(arq.onRecv(1, encoder.encode("hit:late"))).toEqual({
      ordered: [],
      nacks: [0],
    });

    expect(arq.onRecv(0, encoder.encode("hit:early"))).toEqual({
      ordered: [encoder.encode("hit:early"), encoder.encode("hit:late")],
      nacks: [],
    });
    expect(STREAM_CRITICAL).toBe(0);
  });

  it("keeps skill casts ordered and reliable on CRITICAL", () => {
    const arq = new ARQEngine();

    arq.onRecv(1, encoder.encode("skill:release"));
    const result = arq.onRecv(0, encoder.encode("skill:warmup"));

    expect(result.ordered.map(text)).toEqual(["skill:warmup", "skill:release"]);
    expect(result.nacks).toEqual([]);
    expect(STREAM_CRITICAL).toBe(0);
  });

  it("keeps chat delivery ordered and reliable on BATCH", () => {
    const arq = new ARQEngine();

    arq.onRecv(1, encoder.encode("chat:later"));
    const result = arq.onRecv(0, encoder.encode("chat:earlier"));

    expect(result.ordered.map(text)).toEqual(["chat:earlier", "chat:later"]);
    expect(result.nacks).toEqual([]);
    expect(STREAM_BATCH).toBe(2);
  });
});
