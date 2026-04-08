/**
 * Check RUSD and SBC balances on Radius Testnet.
 *
 * Run: npx tsx examples/check-balance.ts
 */
import { RadiusWallet } from "../src/index.js";

const wallet = RadiusWallet.fromEnv();

const balances = await wallet.getBalances();
console.log(`Address: ${balances.address}`);
console.log(`RUSD:    ${balances.rusd}`);
console.log(`SBC:     ${balances.sbc}`);
