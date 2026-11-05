---
description: Update the current stage README (stages/NN-name/README.md) with new commands, concepts, diagrams, choices, and fixes. Use whenever Claude gives the user commands to run, explains a Kubernetes concept or diagram, makes a design choice, or helps fix a problem during a stage. Also runs on /stage-docs.
---

# Stage docs

Keep the current stage README complete, in plain human language.

## Steps

1. Find the stage from the branch: `git branch --show-current` (e.g. `stage/01-first-pod`
   means `stages/01-first-pod/README.md`). On `main`, ask which stage.
2. If the README does not exist, create it from [template.md](template.md).
3. Read the README. Add only what is new. Never duplicate.
4. Put each item under the right heading:
   - **Commands** go under Steps, in the order the user runs them, inside ```powershell blocks.
     Below each block add a table `| Command | What it does |` explaining every command
     and every flag in plain words, plus what output to expect. No command goes unexplained.
   - **Explanations tied to one step** go inside that step, before its commands.
   - **General concepts and diagrams** (used across steps) go under Concepts. Use simple words or analogies
     (the project uses a restaurant analogy). Plain ASCII diagrams, no emojis.
   - **Choices** go under Why, one line each: what we chose and why.
   - **Problems and fixes** go as a note under the step where they happened.
   - **Exercises** that break something on purpose go under Break it.
5. Never edit "What I learned". The user writes it.
6. Tell the user in 1-3 lines what changed. Do not commit.

## Writing style
- Short sentences. Explain jargon once.
- Write for a teammate, not a textbook. No filler.
- Tables for comparisons, numbered lists for steps.
