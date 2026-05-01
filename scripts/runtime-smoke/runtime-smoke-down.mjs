import { runDockerCompose } from "./runtime-smoke-env.mjs";

const removeVolumes = process.argv.includes("--volumes");
const args = removeVolumes ? ["down", "--volumes", "--remove-orphans"] : ["down", "--remove-orphans"];

console.warn(`[runtime-smoke] stopping Docker Compose services${removeVolumes ? " and removing smoke volumes" : ""}`);
runDockerCompose(args);
console.warn("[runtime-smoke] stopped");
