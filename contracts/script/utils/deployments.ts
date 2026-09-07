import * as fs from "fs";
import * as path from "path";

/**
 * Shared read/write helper for `deployments/<network>.json`. Every deploy
 * script reads its dependencies from here and writes its own outputs back,
 * so `deployments/` is always a reproducible record of what's live on a
 * given network — see PLAN.md §9 (Definition of done: "tx hashes in
 * deployments/").
 */

const DEPLOYMENTS_DIR = path.join(__dirname, "..", "..", "..", "deployments");

export interface DeploymentRecord {
  network: string;
  updatedAt: string;
  contracts: Record<string, string>; // name -> address
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

export function requireContractAddress(network: string, name: string): string {
  const record = loadDeployment(network);
  const address = record.contracts[name];
  if (!address) {
    throw new Error(
      `deployments/${network}.json has no address for "${name}". ` +
        `Run the script that deploys it first (see contracts/script/README.md for order).`
    );
  }
  return address;
}
