# Orderflow Platform

An event-driven order platform, built step by step to learn Kubernetes.
Orders come in, payment is processed, inventory is reserved, and the customer is notified.
AI features (fraud scoring, recommendations, an LLM gateway) come later.

## Goal
Learn Kubernetes by building one real system, from a single Pod to a scalable,
observable, secure platform. Every stage adds one idea and is reviewed before the next.

## Stack
Kubernetes (kind, local) · Node.js · Docker · kubectl · Helm (from Stage 5)

## Roadmap
| Stage | Topic |
|---|---|
| 0 | Claude setup + local kind cluster |
| 1 | First Pod + Dockerfile |
| 2 | Deployment + Service |
| 3 | ConfigMap, Secret, namespaces |
| 4 | Probes, resource limits, graceful shutdown |
| 5 | Ingress |
| 6 | Postgres StatefulSet |
| 6b | Database operations: replicas, failover, backups, connection pooling, Redis caching |
| 7 | Split into services + event broker |
| 8 | Retries, idempotency, dead-letter queue |
| 9 | Autoscaling (HPA, KEDA) + load test |
| 10 | Security (RBAC, NetworkPolicy) |
| 11 | Helm chart |
| 12 | Observability |
| 13 | CI + GitOps |
| 14 | Chaos drills |
| 15+ | AI features |

## Status
Stages 0-1 done. Stage 2 in progress.

## Repo layout
- `stages/` — one folder per stage, with one README, manifests and exercises
- `app/` — Node.js services
- `CLAUDE.md`, `.claude/` — Claude Code project rules, permissions and safety hook

## Safety
Only local `kind` clusters are used. A hook blocks state-changing `kubectl`
commands against any other cluster.
