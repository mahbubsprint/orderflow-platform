---
description: Group current changes into clear, human-readable commits after the user approves. Use only when the user runs /commit.
disable-model-invocation: true
---

# Commit changes

1. Run `git branch --show-current`. If it is `main`, stop and suggest a branch name
   like `stage/01-first-pod`. Branch names: lowercase words joined by hyphens, saying what the work is.
2. Run `git status` and `git diff` (and `git diff --staged`) to see all changes.
3. Group changes by topic. One commit per topic.
4. Write each message so a person understands it without reading the code:
   - Subject: `type: plain-English summary`, under 60 characters.
     Types: `feat` new feature, `fix` bug fix, `docs` documentation, `chore` setup/config.
   - Good: `feat: add local 3-node cluster setup`
   - Bad: `feat(stage-0): add kind cfg`
   - Body (optional): 1-3 short lines on why, in simple words.
   - Never add Co-Authored-By or any other attribution lines.
5. Show the plan to the user: each commit's message and its files. Wait for OK.
6. Commit each group, staging only its files: `git add <files>` then `git commit`.
   Never use `git add .` or `git add -A`.
7. Show `git log --oneline` for the new commits.
8. Ask before pushing. Never push without the user's OK.
