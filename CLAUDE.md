# Orderflow Platform

Event-driven order platform, built stage by stage to learn Kubernetes.
Owner is a principal engineer learning by building. Roadmap: see stages/.

## Working rules
- Be precise. Short answers, no extra explanation.
- One stage at a time. Plan first, wait for the user's "go", build, wait for review.
- The user types key commands; explain, then verify.
- Never start the next stage without approval.

## Git workflow (real-world practice)
- Each stage on its own branch: `stage/NN-name` (e.g. `stage/00-foundations`).
- Open a PR to main, user reviews, then merge. Never commit stage work directly to main.
- Branch names and commit messages must be human readable: plain English, no jargon or abbreviations.
- Commit format: `type: plain-English summary` (`feat`, `fix`, `docs`, `chore`). Use `/commit` to commit.
- Never add Co-Authored-By or other attribution lines to commits or PRs.
- Stages 0-12 deploy by hand (kubectl). From Stage 13, deploy only via CI + GitOps.

## Roles
- Label every task with its owner: [Platform] (cluster, ingress, policies, pipelines) or [Dev] (app code, Dockerfile, app manifests/values).

## Cluster safety
- Only use kind clusters. Context must start with `kind-`.
- Run `kubectl config current-context` before any apply, scale, or delete.
- Never touch a non-kind context. Enforced by hook in .claude/hooks/.

## Docs
- One README per stage: stages/NN-name/README.md. No other doc files.
- Use the stage-docs skill to keep it updated. Never edit "What I learned".

## Code and manifests
- App: Node.js in app/. Containers run as non-root, multi-stage Dockerfile.
- Manifests in stages/NN-name/manifests/. Always set labels, probes, resource requests/limits.
- Prefer plain YAML until Stage 11 (Helm).

## Commands
- Create cluster (Docker Desktop must be running): kind create cluster --config stages/00-foundations/kind-config.yaml
- Delete cluster: kind delete cluster --name orderflow
- Context: kind-orderflow

## Layout
app/  stages/  .claude/
