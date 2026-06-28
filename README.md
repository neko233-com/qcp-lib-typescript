# qcp-lib-typescript

**QCP 官方 TypeScript 库** — 新时代 UDP 可靠协议 · 游戏 / IoT · 0-GC 热路径

Go（`qcp-lib-go`）为规范参考实现；本库与其 API 对齐，TypedArray 缓冲池实现热路径零分配。

## Install

```bash
npm install @neko233/qcp
```

## Quick Start

```typescript
import { QCPConn, STREAM_REALTIME } from "@neko233/qcp";

const ln = await QCPConn.listen(9000);
const conn = await ln.accept();
conn.setStream(STREAM_REALTIME);

const client = await QCPConn.dial("127.0.0.1", 9000);
client.setStream(STREAM_REALTIME);
client.send(new TextEncoder().encode("ping"));
const resp = await client.recvWait(2000);
```

## Verify (QCP vs KCP all scenarios)

```bash
npm test
```

## License

MIT
