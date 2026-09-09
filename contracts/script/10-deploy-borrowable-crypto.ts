import { ethers, network } from "hardhat";
import { saveContractAddress } from "./utils/deployments";
import * as cryptoConfig from "../config/borrowable-crypto.json";

/**
 * Deploys the 20 MockCrypto tokens (top-20-by-market-cap, see
 * docs/phase-5-crypto-borrow.md) and mints an initial supply to the
 * deployer — used both as a demo/faucet balance and as the liquidity
 * this wallet will later deposit into the pool (script/12-seed-crypto-liquidity.ts)
 * so there's actually something to borrow.
 */
interface CryptoDef {
  key: string;
  symbol: string;
  name: string;
  redstoneFeedId: string;
}

const INITIAL_MINT = "1000000"; // whole units — generous, these are synthetic mocks

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const assets = (cryptoConfig as { assets: CryptoDef[] }).assets;

  for (const asset of assets) {
    const Token = await ethers.getContractFactory("MockCrypto");
    const token = await Token.deploy(asset.name, asset.symbol);
    await token.waitForDeployment();
    const address = await token.getAddress();

    const mintAmount = ethers.parseUnits(INITIAL_MINT, 18);
    await (await token.mint(deployer.address, mintAmount)).wait();

    console.log(`${asset.symbol} deployed to ${address}, minted ${INITIAL_MINT}`);
    saveContractAddress(network.name, asset.key, address);
  }

  console.log("\nDone. Next: script/11-add-crypto-reserves.ts registers these as borrow-enabled pool reserves.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
