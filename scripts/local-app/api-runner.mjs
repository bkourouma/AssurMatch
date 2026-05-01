import { bootstrap } from "../../backend/src/main.ts";

const port = Number(process.env.PORT ?? 3600);
await bootstrap(port);
