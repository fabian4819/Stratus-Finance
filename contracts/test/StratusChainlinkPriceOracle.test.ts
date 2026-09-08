import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// PLAN.md Phase 2/4 pivot: Pyth's Hermes infrastructure is blocked
// (docs/phase-2-findings.md), so the pool is actually wired to this
// Chainlink-backed oracle instead. Push-based feeds need no update step,
// so there's no updatePriceFeeds-equivalent to test here - just reading
// and staleness/scaling correctness, mirroring StratusPriceOracle.test.ts.
describe("StratusChainlinkPriceOracle", function () {
  const MAX_PRICE_AGE = 3600; // 1 hour, matching Chainlink's typical heartbeat-driven freshness

  async function deployFixture() {
    const [deployer] = await ethers.getSigners();

    const MockRwaToken = await ethers.getContractFactory("MockRwaToken");
    const asset = await MockRwaToken.deploy("Mock HBAR-pegged asset", "mHBAR");

    const MockChainlinkAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
    const feed = await MockChainlinkAggregator.deploy(8); // Chainlink feeds are 8dp

    const StratusChainlinkPriceOracle = await ethers.getContractFactory("StratusChainlinkPriceOracle");
    const oracle = await StratusChainlinkPriceOracle.deploy(MAX_PRICE_AGE);
    await oracle.setFeed(await asset.getAddress(), await feed.getAddress());

    return { deployer, asset, feed, oracle };
  }

  it("reverts on a stale price", async function () {
    const { asset, feed, oracle } = await loadFixture(deployFixture);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    await feed.setAnswer(100_000_000n, now - MAX_PRICE_AGE - 1); // 8dp: $1.00, but stale
    await expect(oracle.getAssetPrice(await asset.getAddress())).to.be.revertedWith("stale price");
  });

  it("reads a fresh price and scales 8dp -> 18dp correctly", async function () {
    const { asset, feed, oracle } = await loadFixture(deployFixture);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    await feed.setAnswer(24_720_000_000n, now); // 8dp: $247.20

    const price = await oracle.getAssetPrice(await asset.getAddress());
    expect(price).to.equal(ethers.parseEther("247.2"));
  });

  it("rejects a non-positive price", async function () {
    const { asset, feed, oracle } = await loadFixture(deployFixture);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    await feed.setAnswer(0n, now);
    await expect(oracle.getAssetPrice(await asset.getAddress())).to.be.revertedWith("non-positive price");
  });

  it("reverts when no feed is set for the asset", async function () {
    const { oracle } = await loadFixture(deployFixture);
    const someAddress = ethers.Wallet.createRandom().address;
    await expect(oracle.getAssetPrice(someAddress)).to.be.revertedWith("no feed set for asset");
  });

  it("applies the demo stress offset on top of a fresh price", async function () {
    const { deployer, asset, feed, oracle } = await loadFixture(deployFixture);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    await feed.setAnswer(100_000_000_000n, now); // 8dp: $1,000.00

    await oracle.connect(deployer).setDemoOffsetBps(await asset.getAddress(), -4_000); // -40%
    const price = await oracle.getAssetPrice(await asset.getAddress());
    expect(price).to.equal(ethers.parseEther("600")); // 1000 * 0.6
    expect(await oracle.isDemoStressed(await asset.getAddress())).to.equal(true);
  });

  it("getAssetsPrices batches multiple assets in one call", async function () {
    const { asset, feed, oracle } = await loadFixture(deployFixture);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    await feed.setAnswer(500_000_000n, now); // $5.00

    const MockRwaToken = await ethers.getContractFactory("MockRwaToken");
    const asset2 = await MockRwaToken.deploy("Mock BTC-pegged asset", "mBTC");
    const MockChainlinkAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
    const feed2 = await MockChainlinkAggregator.deploy(8);
    await feed2.setAnswer(1_000_000_000n, now); // $10.00
    await oracle.setFeed(await asset2.getAddress(), await feed2.getAddress());

    const prices = await oracle.getAssetsPrices([await asset.getAddress(), await asset2.getAddress()]);
    expect(prices[0]).to.equal(ethers.parseEther("5"));
    expect(prices[1]).to.equal(ethers.parseEther("10"));
  });
});
