import { defineChain } from "viem";

export const radiusTestnet = defineChain({
  id: 72344,
  name: "Radius Testnet",
  nativeCurrency: { name: "RUSD", symbol: "RUSD", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.radiustech.xyz"] },
  },
  blockExplorers: {
    default: {
      name: "Radius Explorer",
      url: "https://testnet.radiustech.xyz",
    },
  },
});

export const radiusMainnet = defineChain({
  id: 723487,
  name: "Radius",
  nativeCurrency: { name: "RUSD", symbol: "RUSD", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.radiustech.xyz"] },
  },
  blockExplorers: {
    default: {
      name: "Radius Explorer",
      url: "https://network.radiustech.xyz",
    },
  },
});

export const SBC_ADDRESS =
  "0x33ad9e4BD16B69B5BFdED37D8B5D9fF9aba014Fb" as const;
export const SBC_DECIMALS = 6;
export const RUSD_DECIMALS = 18;

export const FAUCET_BASE = "https://testnet.radiustech.xyz/api/v1/faucet";

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const;
