// Blocks state-changing kubectl commands unless the target is a kind cluster.
// Claude Code passes the pending tool call as JSON on stdin. Exit 2 blocks it.
const { execFileSync } = require("child_process");

const MUTATING = [
  "apply", "create", "delete", "scale", "patch", "edit", "replace", "rollout",
  "set", "label", "annotate", "drain", "cordon", "uncordon", "taint", "run",
  "expose", "autoscale",
];

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const command = JSON.parse(input).tool_input?.command ?? "";
  if (!/\bkubectl\b/.test(command)) return;

  const tokens = command.split(/\s+/);
  const isMutating = tokens.some((t) => MUTATING.includes(t));
  if (!isMutating) return;

  if (tokens.some((t) => t.startsWith("--kubeconfig"))) {
    block("--kubeconfig is not allowed. Only the default kind context is permitted.");
  }

  const flagIndex = tokens.findIndex((t) => t === "--context" || t.startsWith("--context="));
  let context;
  if (flagIndex >= 0) {
    const t = tokens[flagIndex];
    context = t.includes("=") ? t.split("=")[1] : tokens[flagIndex + 1];
  } else {
    try {
      context = execFileSync("kubectl", ["config", "current-context"], { encoding: "utf8" }).trim();
    } catch {
      block("Could not read the current kubectl context.");
    }
  }

  if (!context || !context.startsWith("kind-")) {
    block(`Context "${context}" is not a kind cluster. Switch with: kubectl config use-context kind-orderflow`);
  }
});

function block(reason) {
  console.error(`Blocked by kind-only hook: ${reason}`);
  process.exit(2);
}
