# PROGREE PULSEHUB — REAL-TIME MESSAGING BACKEND

**Project Codeword:** `PULSEHUB-REDIS-ADAPTER`  
**Project:** Progree PulseHub Realtime Server  
**Type:** High-Concurrency Real-Time Communication System  
**Current Status:** Production Verified & Submission Ready  
**Language:** TypeScript (Node.js ES Modules)  
**Runtime:** Node.js v20+

---

## 1. System Overview

PulseHub is an enterprise-grade real-time messaging backend engineered for high concurrency, horizontal scalability, and low-latency bidirectional communication using **Socket.IO** and **Redis**.

The server implements JWT-authenticated WebSocket handshakes, channel-based message isolation, Redis Streams message persistence, active presence tracking via Redis Sets, connection-level rate limiting, and multi-instance synchronization using the **Socket.IO Redis Adapter**.

---

## 2. Architecture & Design

```
                     +---------------------------------------+
                     |         Clients / WebSockets          |
                     +-------------------+-------------------+
                                         |
                       +-----------------+-----------------+
                       |                                   |
                       v                                   v
             +--------------------+              +--------------------+
             | PulseHub Server #1 |              | PulseHub Server #2 |
             |   (Port: 3000)     |              |   (Port: 3001)     |
             +---------+----------+              +---------+----------+
                       |                                   |
                       +-----------------+-----------------+
                                         |
               +-------------------------v-------------------------+
               |                  REDIS CLUSTER                    |
               |                                                   |
               |  - Redis Pub/Sub: Cross-instance broadcast adapter|
               |  - Redis Streams: Channel message persistence     |
               |  - Redis Sets: Active presence & socket tracking  |
               +---------------------------------------------------+
```

### Core Architecture Highlights
- **Horizontal Scalability:** Multi-instance event synchronization using Redis Pub/Sub via `@socket.io/redis-adapter`.
- **Message Persistence & History:** Messages are written to Redis Streams (`XADD`) with millisecond timestamps and unique IDs, enabling chronological retrieval (`XREVRANGE`).
- **Presence Tracking:** Redis Sets maintain active users (`pulsehub:active-users`) and individual socket mappings (`pulsehub:user:{id}:connections`).
- **Graceful Lifecycle Management:** Traps `SIGINT`/`SIGTERM` to drain active sockets and safely terminate Redis client connections.
- **Structured Observability:** Dual-stream Pino logging (simultaneous console stdout and persistent log files at `logs/pulsehub.log`).

---

## 3. Technology Stack

| Technology | Purpose |
|---|---|
| **Node.js (v20+)** | Server Runtime |
| **TypeScript (v5+)** | Strict Type Safety |
| **Express.js (v5)** | HTTP Server & Health APIs |
| **Socket.IO (v4)** | Real-time WebSocket Layer |
| **Redis (v7+)** | Distributed State, Streams & Pub/Sub |
| **@socket.io/redis-adapter** | Cross-Instance Event Synchronization |
| **JSONWebToken** | Cryptographic Authentication |
| **Zod** | Runtime Schema Validation |
| **Pino** | High-performance Structured Logging |
| **Vitest** | Automated Test Framework |
| **tsx** | TypeScript Execution Engine |

---

## 4. Implemented Features Matrix

### Authentication & Authorization
- [x] JWT token verification during Socket.IO handshake (`io.use`).
- [x] Missing or invalid token rejection with explicit error messages.
- [x] Extraction and binding of authenticated `userId` to socket instance.

### Channel Management
- [x] Dynamic room joining (`channel:join`) with Zod payload validation.
- [x] Room leaving (`channel:leave`) with acknowledgement callbacks.
- [x] Rejection of messages sent to channels the client has not joined.

### Messaging & Persistence
- [x] Real-time message exchange (`message:send` -> `message:receive`).
- [x] Redis Streams persistence (`pulsehub:channel:{channel}:messages`).
- [x] Historical message retrieval with chronological order (`channel:history`).
- [x] Auto-generated message IDs and ISO-8601 timestamps.

### Horizontal Scaling & High Availability
- [x] Integration of `@socket.io/redis-adapter` with dedicated Redis Publisher and Subscriber connections.
- [x] Multi-instance verified: Clients connected to different server instances exchange messages seamlessly.

### Connection & Presence Tracking
- [x] Global active users set (`pulsehub:active-users`).
- [x] Per-user connection set (`pulsehub:user:{id}:connections`) for multi-device tracking.
- [x] Automatic cleanup on socket disconnection.

### Rate Limiting & Reliability
- [x] In-memory sliding token window per user (10 messages per 10-second window).
- [x] Immediate rate-limit exceeded response to prevent socket flooding.
- [x] Graceful shutdown handling for HTTP, Socket.IO, and all Redis connections.

---

## 5. Verification & Test Results

All verification suites have been executed and passed with 100% compliance:

### 1. Automated Unit & Integration Tests (Vitest)
```bash
npm test
```
- `scripts/rate-limit.test.ts` (4/4 passed)
- `scripts/auth.test.ts` (4/4 passed)
- `scripts/server.test.ts` (7/7 passed)
- **Total: 15 / 15 Tests Passed (100%)**

### 2. TypeScript Static Typecheck
```bash
npm run typecheck
```
- Strict mode compilation: **0 Errors**.

### 3. Production Build
```bash
npm run build
```
- Compiled successfully into `./dist`.

### 4. Single-Instance End-to-End Verification
```bash
npx tsx scripts/test-socket.ts
```
- Authenticated connection, channel joining, message broadcasting, and Redis stream writes verified.

### 5. Multi-Instance Cross-Node Cluster Verification
```bash
# Terminal 1: Instance 1 (Port 3000)
npm run dev

# Terminal 2: Instance 2 (Port 3001)
$env:PORT="3001"; npx tsx src/server.ts

# Terminal 3: Verification Runner
npx tsx scripts/verify-multi-instance.ts
```
- Client 1 on Instance 1 and Client 2 on Instance 2 successfully established bidirectional messaging via Redis Pub/Sub adapter.

### 6. Rate Limiting Integration Verification
```bash
npx tsx scripts/test-rate-limit.ts
```
- 10 messages accepted within window; 11th and 12th requests immediately blocked with rate limit error.

---

## 6. Getting Started

### Prerequisites
- Node.js v20.x or higher
- Redis Server (local or Docker container)

### Step 1: Start Redis
Using Docker Desktop:
```powershell
docker run -d --name pulsehub-redis -p 6379:6379 redis:alpine
```
Or start an existing container:
```powershell
docker start pulsehub-redis
```

### Step 2: Environment Configuration
Create or verify `.env` file in the project root:
```env
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
REDIS_URL=redis://127.0.0.1:6379
LOG_LEVEL=info
JWT_SECRET=sjdkgibmklopswerfjgkymnvbxsdhfky
```

### Step 3: Run in Development Mode
```powershell
npm run dev
```

### Step 4: Health Check
```powershell
curl http://127.0.0.1:3000/health
```
Response:
```json
{"status":"ok","service":"PulseHub"}
```

---

## 7. Project Structure

```
Progree_PulseHub-realtime-server/
├── dist/                      # Compiled production JavaScript
├── logs/                      # Application log files (pulsehub.log)
├── scripts/                   # Test and verification scripts
│   ├── auth.test.ts           # Authentication unit tests
│   ├── rate-limit.test.ts     # Rate limiting unit tests
│   ├── server.test.ts         # Socket.IO & Redis integration tests
│   ├── test-socket.ts         # Single-instance E2E runner
│   ├── verify-multi-instance.ts # Multi-instance Redis adapter runner
│   └── test-rate-limit.ts     # Rate limit integration runner
├── src/
│   ├── config/
│   │   └── env.ts             # Zod environment variable parsing
│   ├── infrastructure/
│   │   ├── logging/
│   │   │   └── logger.ts      # Pino multi-stream logger (stdout + file)
│   │   └── redis/
│   │       └── redis.ts       # Redis client configuration & error handler
│   ├── realtime/
│   │   ├── auth.ts            # JWT token verification
│   │   ├── rate-limit.ts      # Sliding token window rate limiter
│   │   └── schemas.ts         # Zod schemas for socket payloads
│   └── server.ts              # Express & Socket.IO server with Redis adapter
├── package.json
├── tsconfig.json
└── README.md
```

---

## 8. License

ISC License. Built for Progree PulseHub Realtime System.
