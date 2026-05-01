import { composeFile, composeProjectName, postgresPort, redisPort, runDockerCompose } from "./runtime-smoke-env.mjs";

console.warn(`[runtime-smoke] starting Docker Compose project ${composeProjectName}`);
console.warn(`[runtime-smoke] compose=${composeFile}`);
console.warn(`[runtime-smoke] postgres=localhost:${postgresPort} redis=localhost:${redisPort}`);

runDockerCompose(["up", "-d", "--wait"]);

console.warn("[runtime-smoke] services are running");
