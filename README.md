# Mastra Firestore Storage Plugin

[![npm version](https://badge.fury.io/js/@askelephant%2Fmastra-firestore.svg)](https://www.npmjs.com/package/@askelephant/mastra-firestore)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Firestore storage adapter for the [Mastra AI framework](https://mastra.ai), providing persistent storage for agents, workflows, memory, and observability.

## Features

- 🔥 **Firebase/Firestore Integration** - Leverage Google Cloud Firestore for scalable, real-time storage
- 🧠 **Memory Management** - Persistent storage for threads, messages, and agent memory
- 🔄 **Workflow State** - Save and restore workflow execution states
- 📊 **Observability** - Store and query AI traces and spans for monitoring
- 📈 **Scoring & Evals** - Track evaluation results and scores
- 🔍 **Advanced Queries** - Paginated queries with filtering and sorting
- ⚡ **Batch Operations** - Efficient batch inserts and updates

## Installation

```bash
npm install @askelephant/mastra-firestore firebase-admin
```

## Usage

### Basic Setup

```typescript
import { FirestoreStore } from "@askelephant/mastra-firestore";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Mastra } from "@mastra/core";

// Initialize Firebase Admin
const app = initializeApp();

const db = getFirestore(app);

// Create the Firestore storage instance
const storage = new FirestoreStore({ db });

// Use with Mastra
const mastra = new Mastra({
  storage,
  // ... other configuration
});
```

## Supported Features

The Firestore storage plugin supports all major Mastra storage features:

```typescript
storage.supports = {
  selectByIncludeResourceScope: true,
  resourceWorkingMemory: true,
  hasColumn: true,
  createTable: true,
  deleteMessages: true,
  aiTracing: true,
  getScoresBySpan: true,
};
```

## API Overview

### Memory & Threads

```typescript
// Save and retrieve threads
const thread = await storage.saveThread({
  thread: {
    id: "thread-123",
    resourceId: "user-456",
    title: "Customer Support Chat",
    metadata: { channel: "web" },
  },
});

// Get threads by resource with pagination
const { threads, ...pagination } =
  await storage.getThreadsByResourceIdPaginated({
    resourceId: "user-456",
    page: 1,
    perPage: 10,
  });

// Save messages to a thread
await storage.saveMessages({
  messages: [
    {
      id: "msg-1",
      threadId: "thread-123",
      role: "user",
      content: { content: "Hello!", metadata: {} },
      createdAt: new Date(),
    },
  ],
  format: "v2",
});

// Get messages with pagination
const { messages, ...paginationInfo } = await storage.getMessagesPaginated({
  threadId: "thread-123",
  pagination: { page: 1, perPage: 20 },
});
```

### Workflows

```typescript
// Persist workflow state
await storage.persistWorkflowSnapshot({
  workflowName: "customer-onboarding",
  runId: "run-123",
  resourceId: "user-456",
  snapshot: {
    status: "running",
    results: {},
    error: null,
    // ... workflow state
  },
});

// Load workflow state
const state = await storage.loadWorkflowSnapshot({
  workflowName: "customer-onboarding",
  runId: "run-123",
});

// Query workflow runs
const runs = await storage.getWorkflowRuns({
  workflowName: "customer-onboarding",
  fromDate: new Date("2024-01-01"),
  limit: 10,
});
```

### Observability & Tracing

```typescript
// Create AI span for observability
await storage.createAISpan({
  spanId: "span-123",
  traceId: "trace-456",
  name: "llm.completion",
  startTime: Date.now(),
  attributes: {
    model: "gpt-4",
    tokens: 150,
  },
});

// Get traces with pagination
const { spans, pagination } = await storage.getAITracesPaginated({
  filters: { model: "gpt-4" },
  pagination: { page: 1, perPage: 50 },
});

// Get specific trace
const trace = await storage.getAITrace("trace-456");
```

### Scoring & Evaluation

```typescript
// Save evaluation score
const { score } = await storage.saveScore({
  scorerId: "quality-scorer",
  runId: "run-123",
  entityType: "message",
  entityId: "msg-456",
  value: 0.95,
  metadata: { criteria: "helpfulness" },
});

// Get scores by scorer
const { scores, pagination } = await storage.getScoresByScorerId({
  scorerId: "quality-scorer",
  pagination: { page: 1, perPage: 10 },
});

// Get scores for specific span
const spanScores = await storage.getScoresBySpan({
  traceId: "trace-456",
  spanId: "span-123",
  pagination: { page: 1, perPage: 10 },
});
```

### Generic Operations

```typescript
// Create table/collection
await storage.createTable({
  tableName: "custom_data",
  schema: {
    id: { type: "string", primaryKey: true },
    data: { type: "json" },
  },
});

// Insert record
await storage.insert({
  tableName: "custom_data",
  record: { id: "123", data: { key: "value" } },
});

// Batch insert
await storage.batchInsert({
  tableName: "custom_data",
  records: [
    { id: "1", data: { foo: "bar" } },
    { id: "2", data: { baz: "qux" } },
  ],
});

// Load record
const record = await storage.load({
  tableName: "custom_data",
  keys: { id: "123" },
});
```

## Firestore Collections

The plugin uses the following Firestore collections:

- `threads` - Conversation threads
- `messages` - Thread messages
- `resources` - Resource metadata and working memory
- `workflows` - Workflow execution states
- `traces` - OpenTelemetry traces
- `ai_spans` - AI operation spans for observability
- `scores` - Evaluation scores
- `evals` - Legacy evaluation results

## Development

### Prerequisites

- Node.js >= 22
- Firebase Admin SDK credentials
- npm

### Setup

```bash
# Clone the repository
git clone https://github.com/AskElephant/mastra-firestore.git
cd mastra-firestore

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

### Running Tests

Tests use Vitest and require a Firebase project configured:

```bash
# Create .env.test with your test Firebase credentials
npm test
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Links

- [Mastra Documentation](https://mastra.ai/docs)
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [GitHub Repository](https://github.com/AskElephant/mastra-firestore)
- [npm Package](https://www.npmjs.com/package/@askelephant/mastra-firestore)
- [Issue Tracker](https://github.com/AskElephant/mastra-firestore/issues)

## Support

For issues and questions:

- Open an issue on [GitHub](https://github.com/AskElephant/mastra-firestore/issues)
- Check the [Mastra documentation](https://mastra.ai/docs)
- Review [Firebase documentation](https://firebase.google.com/docs)

## Author

[kdawgwilk](https://github.com/kdawgwilk)

---

Made with ❤️ by [AskElephant](https://askelephant.ai) for the Mastra community
