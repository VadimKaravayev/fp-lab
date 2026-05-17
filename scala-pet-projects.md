# Scala Pet Project Ideas

Projects that actually force you to use the language deeply, not just syntax.

---

## Data Pipeline (Spark / fs2)

Build a mini ETL platform:
- Ingest CSV/JSON from multiple sources
- Transform, validate, aggregate with pure functions
- Output to Parquet or a database
- Add a schema registry (case classes as schemas, Circe for encoding)

**Forces:** fs2 streams, Cats Effect IO, Circe, Doobie, error handling with Either/EitherT

---

## Distributed Task Queue

A simple job queue system:
- HTTP API to submit jobs (http4s or ZIO HTTP)
- Workers pull and process jobs concurrently
- State tracked in Postgres
- Retry logic, dead letter queue

**Forces:** concurrency primitives (Ref, Queue, Fiber in Cats Effect), http4s, Doobie, proper resource management

---

## Event Sourcing / CQRS System

Model a domain (e.g. bank account, inventory):
- Commands → Events → State reconstruction
- Persist event log to Postgres
- Replay events to rebuild state
- Separate read model (projections)

**Forces:** ADTs for commands/events, pure state machines, type-safe domain modeling — this is where Scala's type system shines most

---

## Kafka Pipeline

- Produce events from a mock data source
- Consume and process with fs2-kafka
- Aggregate and sink to a database or another topic
- Add schema validation with Vulcan (Avro + Cats)

**Forces:** fs2-kafka, effect system, streaming backpressure, error handling at scale

---

## Type-Safe Query Builder

Build a small DSL for SQL queries:
- Fluent API: `select("users").where("age" > 18).limit(10)`
- Type-safe column references (phantom types)
- Render to SQL string + parameterized query

**Forces:** type-level programming, phantom types, implicit/given instances, DSL design — very deep Scala

---

## Mini Interpreter / Rule Engine

Build a simple expression language:
- Parse text rules: `"age > 18 AND country == 'UA'"`
- Evaluate against data objects
- Return typed results

**Forces:** ADTs for AST, pattern matching, recursion schemes if you go deep, parser combinators (fastparse)

---

## Recommendation Engine Pipeline

- Ingest user behavior events (fs2)
- Compute similarity scores (pure functions, parallelism)
- Serve recommendations via HTTP API
- Cache results in Redis (redis4cats)

**Forces:** full Cats Effect stack, concurrency, streaming, HTTP, external service integration

---

## Difficulty Ladder

| Project | Core concepts practiced |
|---|---|
| ETL pipeline | fs2, IO, error handling |
| Task queue | Concurrency, Ref, Fiber, HTTP |
| Event sourcing | ADTs, state machines, domain modeling |
| Kafka pipeline | Streaming at scale, backpressure |
| Query DSL | Type-level programming, implicits |
| Interpreter | Recursion, ADTs, parser combinators |
| Recommendation engine | Full stack integration |

---

## Recommended Starting Point

**Event sourcing system** — maps directly to enterprise patterns from AEM/Java, but forces you to model everything with ADTs and pure functions. Transferable to fintech interviews. Naturally grows into Kafka/Spark if you add an event log layer.
