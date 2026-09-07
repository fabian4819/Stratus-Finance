import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// Gate 1 (PLAN.md §Phase 1): mint/redeem round-trip preserves the basket
// ratio exactly, with no dust drain, using MockRwaToken stand-ins for the
// real ATS-issued GOLD-x / STOCK-x tokens.
describe("StratusBasketToken", function () {
  const RATIO_A_BPS = 5_000; // 50/50 gold / stock-index

  async function deployFixture() {
    const [deployer, user] = await ethers.getSigners();

    const MockRwaToken = await ethers.getContractFactory("MockRwaToken");
    const gold = await MockRwaToken.deploy("Mock Gold", "GOLD-x");
    const stock = await MockRwaToken.deploy("Mock Stock Index", "STOCK-x");

    const StratusBasketToken = await ethers.getContractFactory("StratusBasketToken");
    const basket = await StratusBasketToken.deploy(
      "Stratus ETF",
      "sETF",
      await gold.getAddress(),
      await stock.getAddress(),
      RATIO_A_BPS
    );

    const seedAmount = ethers.parseEther("1000");
    await gold.mint(user.address, seedAmount);
    await stock.mint(user.address, seedAmount);

    return { deployer, user, gold, stock, basket };
  }

  it("previews components at the configured ratio", async function () {
    const { basket } = await loadFixture(deployFixture);
    const amount = ethers.parseEther("100");
    const [amountA, amountB] = await basket.previewComponents(amount);

    expect(amountA).to.equal(ethers.parseEther("50"));
    expect(amountB).to.equal(ethers.parseEther("50"));
  });

  it("mints basket tokens by pulling the pro-rata underlying", async function () {
    const { user, gold, stock, basket } = await loadFixture(deployFixture);
    const amount = ethers.parseEther("100");

    await gold.connect(user).approve(await basket.getAddress(), amount);
    await stock.connect(user).approve(await basket.getAddress(), amount);
    await basket.connect(user).mint(amount);

    expect(await basket.balanceOf(user.address)).to.equal(amount);
    expect(await gold.balanceOf(await basket.getAddress())).to.equal(ethers.parseEther("50"));
    expect(await stock.balanceOf(await basket.getAddress())).to.equal(ethers.parseEther("50"));
  });

  it("round-trips mint -> redeem with zero dust", async function () {
    const { user, gold, stock, basket } = await loadFixture(deployFixture);
    const amount = ethers.parseEther("373"); // deliberately not ratio-friendly

    const goldBefore = await gold.balanceOf(user.address);
    const stockBefore = await stock.balanceOf(user.address);

    await gold.connect(user).approve(await basket.getAddress(), amount);
    await stock.connect(user).approve(await basket.getAddress(), amount);
    await basket.connect(user).mint(amount);
    await basket.connect(user).redeem(amount);

    expect(await basket.balanceOf(user.address)).to.equal(0n);
    expect(await gold.balanceOf(user.address)).to.equal(goldBefore);
    expect(await stock.balanceOf(user.address)).to.equal(stockBefore);
  });

  it("rejects a zero-value component or an out-of-range ratio", async function () {
    const { gold, stock } = await loadFixture(deployFixture);
    const StratusBasketToken = await ethers.getContractFactory("StratusBasketToken");

    await expect(
      StratusBasketToken.deploy("Stratus ETF", "sETF", ethers.ZeroAddress, await stock.getAddress(), RATIO_A_BPS)
    ).to.be.revertedWith("zero component");

    await expect(
      StratusBasketToken.deploy("Stratus ETF", "sETF", await gold.getAddress(), await stock.getAddress(), 10_000)
    ).to.be.revertedWith("ratio out of range");
  });
});
