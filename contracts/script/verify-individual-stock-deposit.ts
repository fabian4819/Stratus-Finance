import { ethers, network } from "hardhat";
import { requireContractAddress } from "./utils/deployments";

/**
 * Mini Gate-2-style verification for one individual stock reserve:
 * deposit into the pool directly, confirm aToken balance increased,
 * withdraw, confirm exact balances restored. Same pattern as
 * verify-gate2-deposit-withdraw.ts, targeting AAPL-x as a representative
 * sample of the new individual-stock reserves.
 */
async function main() {
  const [signer] = await ethers.getSigners();
  const poolAddress = requireContractAddress(network.name, "LendingPool");
  const aaplAddress = requireContractAddress(network.name, "AaplToken");
  const aTokenAddress = requireContractAddress(network.name, "aToken_AAPL-x");

  const pool = await ethers.getContractAt("ILendingPool", poolAddress);
  const aapl = await ethers.getContractAt("IERC20", aaplAddress);
  const aToken = await ethers.getContractAt("IERC20", aTokenAddress);

  const depositAmount = ethers.parseUnits("10", 18);

  const beforeWallet = await aapl.balanceOf(signer.address);
  const beforeAToken = await aToken.balanceOf(signer.address);
  console.log("Before — wallet AAPL-x:", ethers.formatEther(beforeWallet), "aAAPL-x:", ethers.formatEther(beforeAToken));

  console.log("Approving pool...");
  await (await aapl.approve(poolAddress, depositAmount)).wait();

  console.log("Depositing 10 AAPL-x...");
  const depositTx = await pool.deposit(aaplAddress, depositAmount, signer.address, 0);
  const depositReceipt = await depositTx.wait();
  console.log("  deposit tx:", depositTx.hash);

  const afterDepositWallet = await aapl.balanceOf(signer.address);
  const afterDepositAToken = await aToken.balanceOf(signer.address);
  console.log("After deposit — wallet AAPL-x:", ethers.formatEther(afterDepositWallet), "aAAPL-x:", ethers.formatEther(afterDepositAToken));

  console.log("Withdrawing 10 AAPL-x...");
  const withdrawTx = await pool.withdraw(aaplAddress, depositAmount, signer.address);
  const withdrawReceipt = await withdrawTx.wait();
  console.log("  withdraw tx:", withdrawTx.hash);

  const afterWithdrawWallet = await aapl.balanceOf(signer.address);
  const afterWithdrawAToken = await aToken.balanceOf(signer.address);
  console.log("After withdraw — wallet AAPL-x:", ethers.formatEther(afterWithdrawWallet), "aAAPL-x:", ethers.formatEther(afterWithdrawAToken));

  const exact = afterWithdrawWallet === beforeWallet && afterWithdrawAToken === beforeAToken;
  console.log(exact ? "\nPASS: balances restored exactly." : "\nFAIL: balances did not restore exactly.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
