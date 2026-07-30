import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "py" : "python3";
const args = [
  ...(process.platform === "win32" ? ["-3"] : []),
  "-m",
  "unittest",
  "discover",
  "-s",
  "services/moderation",
  "-p",
  "test_*.py",
  "-v"
];
const result = spawnSync(command, args, { stdio: "inherit" });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
