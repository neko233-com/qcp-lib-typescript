# qcp-lib-typescript

QCP typescript binding - 2026 reliable UDP protocol

## Features

- FEC-First reliability (Forward Error Correction)
- Zero-Copy Ring Buffer
- Lock-Free queues
- 3-channel priority system
- 10-byte header (vs KCP 24 bytes)

## Installation

See README in each language directory.

## Protocol

QCP uses FEC instead of ARQ for reliability:
- FEC provides instant recovery (no retransmission delay)
- ARQ only as fallback (rare cases)
- More reliable than KCP

## License

MIT License
