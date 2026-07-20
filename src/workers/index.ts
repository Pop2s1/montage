import { config } from "dotenv";
config({ path: ".env" });

import { workerLoop } from "./processor";

const ac = new AbortController();
process.on("SIGINT", () => ac.abort());
process.on("SIGTERM", () => ac.abort());

workerLoop(ac.signal).catch((err) => {
  console.error(err);
  process.exit(1);
});
