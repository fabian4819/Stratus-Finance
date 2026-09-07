import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// PLAN.md Phase 0 finding: Hedera testnet's Pyth cache is a pull oracle
// nobody keeps warm, so StratusPriceOracle needs a working
// updatePriceFeeds pass-through, not just a getter. These tests exercise
// both the staleness-revert path and the update-then-read path against
// MockPyth's simplified update-data encoding.
describe("StratusPriceOracle", function () {
  const MAX_PRICE_AGE = 60;
  const FEED_ID = ethers.zeroPadValue("0x01", 32);

  async function deployFixture() {
    const [deployer, other] = await ethers.getSigners();

    const MockPyth = await ethers.getContractFactory("MockPyth");
    const pyth = await MockPyth.deploy();

    const MockRwaToken = await ethers.getContractFactory("MockRwaToken");
    const asset = await MockRwaToken.deploy("Mock Gold", "GOLD-x");

    const StratusPriceOracle = await ethers.getContractFactory("StratusPriceOracle");
    const oracle = await StratusPriceOracle.deploy(await pyth.getAddress(), MAX_PRICE_AGE);
    await oracle.setFeed(await asset.getAddress(), FEED_ID);

    return { deployer, other, pyth, asset, oracle };
  }

  function encodeUpdate(id: string, price: bigint, conf: bigint, expo: number, publishTime: number) {
    return ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "int64", "uint64", "int32", "uint256"],
      [id, price, conf, expo, publishTime]
    );
  }

  // Mirrors StratusPriceOracle's internal _roundUpToTinybar: Hedera's
  // native HBAR ledger only tracks whole tinybars (1 tinybar = 1e10 wei at
  // this contract's 18-decimal precision), so Pyth's few-wei fee gets
  // rounded up before being charged/forwarded - see docs/phase-2-findings.md.
  const TINYBAR_IN_WEI = 10_000_000_000n;
  function roundUpToTinybar(amount: bigint): bigint {
    if (amount === 0n) return 0n;
    return ((amount + TINYBAR_IN_WEI - 1n) / TINYBAR_IN_WEI) * TINYBAR_IN_WEI;
  }

  it("reverts on a stale price (nothing pushed yet)", async function () {
    const { asset, oracle } = await loadFixture(deployFixture);
    await expect(oracle.getAssetPrice(await asset.getAddress())).to.be.reverted;
  });

  it("updatePriceFeeds pushes a fresh price, then getAssetPrice succeeds and scales correctly", async function () {
    const { asset, oracle, pyth } = await loadFixture(deployFixture);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;

    // Pyth-style: price=245000, expo=-2 -> $2,450.00 -> 18-decimal: 2450 * 1e18
    const update = encodeUpdate(FEED_ID, 245_000n, 100n, -2, now);
    const fee = roundUpToTinybar(await pyth.getUpdateFee([update]));

    await oracle.updatePriceFeeds([update], { value: fee });

    const price = await oracle.getAssetPrice(await asset.getAddress());
    expect(price).to.equal(ethers.parseEther("2450"));
  });

  it("refunds excess value sent to updatePriceFeeds", async function () {
    const { asset, oracle, pyth, deployer } = await loadFixture(deployFixture);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const update = encodeUpdate(FEED_ID, 100n, 1n, 0, now);
    const fee = roundUpToTinybar(await pyth.getUpdateFee([update]));
    const overpay = fee + ethers.parseEther("1");

    const balanceBefore = await ethers.provider.getBalance(deployer.address);
    const tx = await oracle.updatePriceFeeds([update], { value: overpay });
    const receipt = await tx.wait();
    const gasCost = receipt!.gasUsed * receipt!.gasPrice;
    const balanceAfter = await ethers.provider.getBalance(deployer.address);

    // spent only fee + gas, not the full overpay
    expect(balanceBefore - balanceAfter).to.equal(fee + gasCost);
  });

  it("rejects updatePriceFeeds when msg.value is below the required fee", async function () {
    const { asset, oracle, pyth } = await loadFixture(deployFixture);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const update = encodeUpdate(FEED_ID, 100n, 1n, 0, now);
    const fee = roundUpToTinybar(await pyth.getUpdateFee([update]));

    await expect(oracle.updatePriceFeeds([update], { value: fee - 1n })).to.be.revertedWith("insufficient fee");
  });

  it("applies the demo stress offset on top of a freshly-updated price", async function () {
    const { asset, oracle, pyth, deployer } = await loadFixture(deployFixture);
    const now = (await ethers.provider.getBlock("latest"))!.timestamp;
    const update = encodeUpdate(FEED_ID, 100_000n, 1n, -2, now); // $1,000.00
    const fee = roundUpToTinybar(await pyth.getUpdateFee([update]));
    await oracle.updatePriceFeeds([update], { value: fee });

    await oracle.connect(deployer).setDemoOffsetBps(await asset.getAddress(), -4_000); // -40%
    const price = await oracle.getAssetPrice(await asset.getAddress());
    expect(price).to.equal(ethers.parseEther("600")); // 1000 * 0.6
    expect(await oracle.isDemoStressed(await asset.getAddress())).to.equal(true);
  });
});
