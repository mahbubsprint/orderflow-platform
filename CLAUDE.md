# Orderflow Platform

Event-driven order platform, built stage by stage to learn Kubernetes.
Owner is a principal engineer learning by building. Roadmap: see stages/.

## Working rules
- Be precise. Short answers, no extra explanation.
- One stage at a time. Plan first, wait for the user's "go", build, wait for review.
- The user types key commands; explain, then verify.
- Never start the next stage without approval.

## Cluster safety
- Only use kind clusters. Context must start with `kind-`.
- Run `kubectl config current-context` before any apply, scale, or delete.
- Never touch a non-kind context. Enforced by hook in .claude/hooks/.

## Docs
- Plain, human language. Short sentences. Explain jargon once.
- Every stage has stages/NN-name/README.md: goal, why, concepts, steps, break-it, checkpoint.
- Update docs/learning-log.md at the end of each stage.
- Record choices in docs/decisions/ (one page each).

## Code and manifests
- App: Node.js in app/. Containers run as non-root, multi-stage Dockerfile.
- Manifests in stages/NN-name/manifests/. Always set labels, probes, resource requests/limits.
- Prefer plain YAML until Stage 11 (Helm).

## Commands
- Create cluster: kind create cluster --name orderflow --config stages/00-foundations/kind-config.yaml
- Delete cluster: kind delete cluster --name orderflow
- Context: kind-orderflow

## Layout
app/  stages/  docs/  .claude/
