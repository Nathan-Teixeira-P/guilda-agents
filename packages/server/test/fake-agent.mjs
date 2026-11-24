// Fake `claude`: replays a recorded stream-json fixture on stdout. argv: <fixture> [hang]
import { readFileSync } from "node:fs";
const [, , fixture, mode] = process.argv;
process.stdout.write(readFileSync(fixture, "utf8"));
if (mode === "hang") setInterval(() => {}, 1000); // stays alive until killed by the runner
else if (mode === "fail") process.exit(3);
