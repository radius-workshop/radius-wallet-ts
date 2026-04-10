# radius-wallet-ts

A simple TypeScript library for interacting with the [Radius network](https://radiustech.xyz). Built on [viem](https://viem.sh/).

Check balances, send tokens, request faucet funds, deploy contracts, and interact with smart contracts.

## Quick Start

```bash
npm install viem

# Generate a new key
node -e "import('viem/accounts').then(m => console.log(m.generatePrivateKey()))"

# Set your private key
export RADIUS_PRIVATE_KEY=0x...
```

```typescript
import { RadiusWallet } from "./src/index.js";

const wallet = RadiusWallet.fromEnv();
console.log(await wallet.getBalances());
```

## API

### Create / Load Wallet

```typescript
// From private key
const wallet = new RadiusWallet("0xYOUR_PRIVATE_KEY");

// Generate new wallet
const wallet = RadiusWallet.create();
console.log(wallet.address);

// From environment variable (RADIUS_PRIVATE_KEY)
const wallet = RadiusWallet.fromEnv();

// Use mainnet
const wallet = new RadiusWallet("0x...", { chain: "mainnet" });
```

### Check Balances

```typescript
await wallet.getRusdBalance();               // Your RUSD balance
await wallet.getSbcBalance();                 // Your SBC balance
await wallet.getBalances();                   // Both as { address, rusd, sbc }

await wallet.getSbcBalance("0x1234...");      // Someone else's balance
```

### Send Tokens

```typescript
// Send SBC (amounts are strings, decimals handled automatically)
const hash = await wallet.sendSbc("0xRecipient", "1.5");

// Send RUSD (native token)
const hash = await wallet.sendRusd("0xRecipient", "0.001");

// Wait for confirmation
const receipt = await wallet.waitForTx(hash);
console.log(receipt.status);  // "success" or "reverted"
console.log(wallet.explorerUrl(hash));
```

### Transaction Status

```typescript
const receipt = await wallet.getTxReceipt(hash);
const receipt = await wallet.waitForTx(hash);  // Waits for confirmation
wallet.explorerUrl(hash);                       // Link to block explorer
```

### Faucet (Testnet)

```typescript
const result = await wallet.requestFaucet();  // Requests SBC from testnet faucet
```

`requestFaucet()` is testnet-only and throws when the wallet is configured for mainnet.

### Deploy Contracts

```typescript
import MyContract from "./artifacts/MyContract.json";

const result = await wallet.deployContract(
  MyContract.abi,
  MyContract.bytecode as `0x${string}`,
  [constructorArg1, constructorArg2]  // optional
);
console.log(result.address);
console.log(result.txHash);
```

### Read from Contracts

```typescript
const count = await wallet.readContract(
  "0xContractAddress",
  counterAbi,
  "getCount"
);
```

### Write to Contracts

```typescript
const hash = await wallet.writeContract(
  "0xContractAddress",
  erc20Abi,
  "transfer",
  ["0xRecipient", 1000000n]
);
const receipt = await wallet.waitForTx(hash);
```

## Radius Network Details

| | Testnet | Mainnet |
|--|---------|---------|
| RPC | `https://rpc.testnet.radiustech.xyz` | `https://rpc.radiustech.xyz` |
| Chain ID | 72344 | 723487 |
| Explorer | `https://testnet.radiustech.xyz` | `https://network.radiustech.xyz` |

**Tokens:**
- **RUSD** — Native token, 18 decimals (used for gas)
- **SBC** — ERC-20 stablecoin, 6 decimals, at `0x33ad9e4BD16B69B5BFdED37D8B5D9fF9aba014Fb`

**Things to know:**
- Gas price is fixed (~1 gwei). No EIP-1559, no priority fees.
- Block numbers are timestamps in milliseconds (not sequential).
- Sub-second finality — no reorgs possible.
- Failed transactions don't charge gas.

## Exported Constants

```typescript
import {
  radiusTestnet,    // viem Chain definition
  radiusMainnet,    // viem Chain definition
  SBC_ADDRESS,      // SBC token contract address
  SBC_DECIMALS,     // 6
  RUSD_DECIMALS,    // 18
  ERC20_ABI,        // Minimal ERC-20 ABI
} from "./src/index.js";
```

## Examples

See the [examples/](examples/) directory:

- `check-balance.ts` — Query balances
- `send-sbc.ts` — Send an SBC transfer
- `request-faucet.ts` — Get testnet tokens

Run with: `npx tsx examples/check-balance.ts`

## Production Notes

This library uses a local private key for signing. For production, use a managed signing service like [Privy](https://privy.io/). See the [Nanda Wallet Concierge](https://github.com/radius-workshop/nanda-wallet-concierge) for an example.
