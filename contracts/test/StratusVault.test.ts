import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// PLAN.md Phase 3: StratusVault's own decompose/recompose wrapper logic,
// isolated from the real pool's accounting (health factor, LTV-weighted
// borrow capacity, liquidation) via MockLendingPool. Those pool-accounting
// properties are verified against the real, unmodified pool on testnet
// instead - see contracts/script/verify-gate2-deposit-withdraw.ts and
// verify-gate3-*.ts - since re-deriving Aave v2's own math in a mock
// would test the mock's fidelity to Aave, not StratusVault's correctness.
describe("StratusVault", function () {
  const RATIO_A_BPS = 5_000; // 50/50

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

    const MockLendingPool = await ethers.getContractFactory("MockLendingPool");
    const pool = await MockLendingPool.deploy();

    const StratusVault = await ethers.getContractFactory("StratusVault");
    const vault = await StratusVault.deploy(await basket.getAddress(), await pool.getAddress());

    const seedAmount = ethers.parseEther("1000");
    await gold.mint(user.address, seedAmount);
    await stock.mint(user.address, seedAmount);

    return { deployer, user, gold, stock, basket, pool, vault };
  }

  async function mintBasketFor(user: any, gold: any, stock: any, basket: any, amount: bigint) {
    await gold.connect(user).approve(await basket.getAddress(), amount);
    await stock.connect(user).approve(await basket.getAddress(), amount);
    await basket.connect(user).mint(amount);
  }

  it("decomposes on deposit: two independent pool.deposit calls at the basket ratio", async function () {
    const { user, gold, stock, basket, pool, vault } = await loadFixture(deployFixture);
    const basketAmount = ethers.parseEther("100");
    await mintBasketFor(user, gold, stock, basket, basketAmount);

    await basket.connect(user).approve(await vault.getAddress(), basketAmount);
    await vault.connect(user).depositBasket(basketAmount);

    expect(await pool.depositCount()).to.equal(2n);

    const [assetA, amountA, onBehalfOfA] = await pool.deposits(0);
    const [assetB, amountB, onBehalfOfB] = await pool.deposits(1);
    expect(assetA).to.equal(await gold.getAddress());
    expect(assetB).to.equal(await stock.getAddress());
    expect(amountA).to.equal(ethers.parseEther("50"));
    expect(amountB).to.equal(ethers.parseEther("50"));
    expect(onBehalfOfA).to.equal(user.address);
    expect(onBehalfOfB).to.equal(user.address);

    // the pool (not the vault) ends up holding the underlying, matching
    // onBehalfOf semantics: aTokens (here, just the mock's bookkeeping)
    // belong to the user, but the vault itself custodies nothing after
    // the call.
    expect(await gold.balanceOf(await pool.getAddress())).to.equal(ethers.parseEther("50"));
    expect(await stock.balanceOf(await pool.getAddress())).to.equal(ethers.parseEther("50"));
    expect(await gold.balanceOf(await vault.getAddress())).to.equal(0n);
    expect(await stock.balanceOf(await vault.getAddress())).to.equal(0n);
  });

  it("emits BasketDecomposed with the exact per-component amounts", async function () {
    const { user, gold, stock, basket, vault } = await loadFixture(deployFixture);
    const basketAmount = ethers.parseEther("100");
    await mintBasketFor(user, gold, stock, basket, basketAmount);
    await basket.connect(user).approve(await vault.getAddress(), basketAmount);

    await expect(vault.connect(user).depositBasket(basketAmount))
      .to.emit(vault, "BasketDecomposed")
      .withArgs(user.address, basketAmount, ethers.parseEther("50"), ethers.parseEther("50"));
  });

  it("depositBasket rejects a zero amount", async function () {
    const { user, vault } = await loadFixture(deployFixture);
    await expect(vault.connect(user).depositBasket(0)).to.be.revertedWith("zero amount");
  });

  it("second deposit succeeds without re-approving the pool (lazy approval is idempotent)", async function () {
    const { user, gold, stock, basket, pool, vault } = await loadFixture(deployFixture);
    const basketAmount = ethers.parseEther("100");
    await mintBasketFor(user, gold, stock, basket, basketAmount * 2n);

    await basket.connect(user).approve(await vault.getAddress(), basketAmount);
    await vault.connect(user).depositBasket(basketAmount);

    await basket.connect(user).approve(await vault.getAddress(), basketAmount);
    await vault.connect(user).depositBasket(basketAmount);

    expect(await pool.depositCount()).to.equal(4n);
  });

  it("recomposes: pulls the approved underlying and returns the exact basket amount", async function () {
    const { user, gold, stock, basket, vault } = await loadFixture(deployFixture);
    const basketAmount = ethers.parseEther("50");
    const [amountA, amountB] = await basket.previewComponents(basketAmount);

    // Simulates the user already having withdrawn amountA/amountB from
    // the real pool to their own wallet (step 1 of StratusVault's
    // documented withdrawal flow) - MockLendingPool doesn't need to be
    // involved since recomposeBasket never calls the pool.
    await gold.mint(user.address, amountA);
    await stock.mint(user.address, amountB);
    await gold.connect(user).approve(await vault.getAddress(), amountA);
    await stock.connect(user).approve(await vault.getAddress(), amountB);

    const basketBefore = await basket.balanceOf(user.address);
    await vault.connect(user).recomposeBasket(basketAmount);

    expect(await basket.balanceOf(user.address)).to.equal(basketBefore + basketAmount);
    expect(await gold.balanceOf(await vault.getAddress())).to.equal(0n);
    expect(await stock.balanceOf(await vault.getAddress())).to.equal(0n);
  });

  it("emits BasketRecomposed with the exact per-component amounts", async function () {
    const { user, gold, stock, vault, basket } = await loadFixture(deployFixture);
    const basketAmount = ethers.parseEther("50");
    const [amountA, amountB] = await basket.previewComponents(basketAmount);
    await gold.mint(user.address, amountA);
    await stock.mint(user.address, amountB);
    await gold.connect(user).approve(await vault.getAddress(), amountA);
    await stock.connect(user).approve(await vault.getAddress(), amountB);

    await expect(vault.connect(user).recomposeBasket(basketAmount))
      .to.emit(vault, "BasketRecomposed")
      .withArgs(user.address, basketAmount, amountA, amountB);
  });

  it("recomposeBasket rejects a zero amount", async function () {
    const { user, vault } = await loadFixture(deployFixture);
    await expect(vault.connect(user).recomposeBasket(0)).to.be.revertedWith("zero amount");
  });

  it("full round trip: deposit then recompose returns to the exact starting balances", async function () {
    const { user, gold, stock, basket, vault } = await loadFixture(deployFixture);
    const basketAmount = ethers.parseEther("100");
    await mintBasketFor(user, gold, stock, basket, basketAmount);

    // depositBasket only ever touches the user's basket-token balance
    // directly (the underlying it redeems comes from the vault's own
    // holding, not the user's wallet) - gold/stock stay untouched here.
    const goldAfterMint = await gold.balanceOf(user.address);
    const stockAfterMint = await stock.balanceOf(user.address);

    await basket.connect(user).approve(await vault.getAddress(), basketAmount);
    await vault.connect(user).depositBasket(basketAmount);
    expect(await basket.balanceOf(user.address)).to.equal(0n);
    expect(await gold.balanceOf(user.address)).to.equal(goldAfterMint);
    expect(await stock.balanceOf(user.address)).to.equal(stockAfterMint);

    // Simulate the user withdrawing the deposited amounts back from the
    // real pool to their own wallet (MockLendingPool doesn't model this -
    // mint stands in for it), then recomposing.
    const [amountA, amountB] = await basket.previewComponents(basketAmount);
    await gold.mint(user.address, amountA);
    await stock.mint(user.address, amountB);
    await gold.connect(user).approve(await vault.getAddress(), amountA);
    await stock.connect(user).approve(await vault.getAddress(), amountB);
    await vault.connect(user).recomposeBasket(basketAmount);

    // The withdrawal-simulating mint and the recompose consuming it net
    // out exactly, so the user ends up back at their post-mint balances -
    // holding the basket token again, same underlying balances as before
    // any of this started.
    expect(await basket.balanceOf(user.address)).to.equal(basketAmount);
    expect(await gold.balanceOf(user.address)).to.equal(goldAfterMint);
    expect(await stock.balanceOf(user.address)).to.equal(stockAfterMint);
  });
});
