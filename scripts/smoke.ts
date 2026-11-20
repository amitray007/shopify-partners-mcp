// Starts a built server over stdio with placeholder credentials and checks that it answers
// initialize and lists its tools. Usage: node scripts/smoke.ts [path/to/index.js]
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const EXPECTED_TOOLS = 18;
const entry = process.argv[2] ?? "dist/index.js";
const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8")
) as {
  version: string;
};

const server = spawn(process.execPath, [entry], {
  env: {
    ...process.env,
    SHOPIFY_PARTNER_ID: "1",
    SHOPIFY_PARTNER_ACCESS_TOKEN: "placeholder",
  },
  stdio: ["pipe", "pipe", "inherit"],
});
const timer = setTimeout(() => fail("timed out"), 10_000);

function fail(message: string): never {
  console.error(`smoke test failed: ${message}`);
  server.kill();
  process.exit(1);
}

function send(message: object): void {
  server.stdin.write(`${JSON.stringify(message)}\n`);
}

const replies = new Map<number, { result?: Record<string, unknown> }>();
createInterface({ input: server.stdout }).on("line", (line) => {
  const reply = JSON.parse(line) as {
    id?: number;
    result?: Record<string, unknown>;
  };
  if (reply.id === undefined) {
    return;
  }
  replies.set(reply.id, reply);
  if (reply.id === 1) {
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  }
  if (reply.id === 2) {
    finish();
  }
});

function finish(): void {
  clearTimeout(timer);
  const info = replies.get(1)?.result?.serverInfo as
    | { version?: string }
    | undefined;
  const tools = replies.get(2)?.result?.tools as unknown[] | undefined;
  if (info?.version !== version) {
    fail(
      `server reports version ${info?.version}, package.json has ${version}`
    );
  }
  if (tools?.length !== EXPECTED_TOOLS) {
    fail(`expected ${EXPECTED_TOOLS} tools, got ${tools?.length}`);
  }
  console.log(`smoke test passed: version ${version}, ${tools.length} tools`);
  server.kill();
}

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke", version },
  },
});
