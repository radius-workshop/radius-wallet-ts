/**
 * Request testnet SBC from the Radius faucet.
 *
 * Run: npx tsx examples/request-faucet.ts
 */
import { RadiusWallet } from "../src/index.js";

const wallet = RadiusWallet.fromEnv();

console.log(`Wallet: ${wallet.address}`);
console.log(`Balance before: ${await wallet.getSbcBalance()} SBC`);

const result = await wallet.requestFaucet();
console.log("Faucet response:", result);

// Wait for settlement
await new Promise((r) => setTimeout(r, 3000));
console.log(`Balance after: ${await wallet.getSbcBalance()} SBC`);
