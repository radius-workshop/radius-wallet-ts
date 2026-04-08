/**
 * Send SBC tokens to another address on Radius Testnet.
 *
 * Run: npx tsx examples/send-sbc.ts
 */
import { RadiusWallet } from "../src/index.js";

const wallet = RadiusWallet.fromEnv();

const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // replace
const hash = await wallet.sendSbc(recipient as `0x${string}`, "0.1");

console.log(`Tx submitted: ${hash}`);
console.log(`Explorer: ${wallet.explorerUrl(hash)}`);

const receipt = await wallet.waitForTx(hash);
console.log(`Status: ${receipt.status}`);
