import * as fs from "fs";
import * as path from "path";

/**
 * Minimal read/write helper for `deployments/<network>.json`, mirroring
 * `contracts/script/utils/deployments.ts`. Duplicated rather than shared
 * across workspaces to avoid cross-workspace ts-node module resolution —
 * both copies must stay in sync on the file shape if either changes.
 */

const DEPLOYMENTS_DIR = path.join(__dirname, "..", "..", "..", "deployments");

interface DeploymentRecord {
  network: string;
  updatedAt: string;
  contracts: Record<string, string>;
  meta?: Record<string, unknown>;
}

function filePath(network: string): string {
  return path.join(DEPLOYMENTS_DIR, `${network}.json`);
}

export function loadDeployment(network: string): DeploymentRecord {
  const p = filePath(network);
  if (!fs.existsSync(p)) {
    return { network, updatedAt: new Date().toISOString(), contracts: {} };
  }
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

export function saveContractAddress(network: string, name: string, address: string): void {
  const record = loadDeployment(network);
  record.contracts[name] = address;
  record.updatedAt = new Date().toISOString();
  if (!fs.existsSync(DEPLOYMENTS_DIR)) fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });
  fs.writeFileSync(filePath(network), JSON.stringify(record, null, 2) + "\n");
  console.log(`  -> saved ${name} = ${address} to deployments/${network}.json`);
}
