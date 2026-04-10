import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  formatUnits,
  parseEther,
  parseUnits,
  type Chain,
  type PublicClient,
  type WalletClient,
  type TransactionReceipt,
  type Abi,
  type Address,
  type Hash,
  type Transport,
} from "viem";
import {
  privateKeyToAccount,
  generatePrivateKey,
  type PrivateKeyAccount,
} from "viem/accounts";
import {
  radiusTestnet,
  radiusMainnet,
  SBC_ADDRESS,
  SBC_DECIMALS,
  ERC20_ABI,
  FAUCET_BASE,
} from "./constants.js";

export interface Balances {
  address: string;
  rusd: string;
  sbc: string;
}

export interface DeployResult {
  address: Address;
  txHash: Hash;
  receipt: TransactionReceipt;
}

export interface FaucetResult {
  tx_hash?: string;
  [key: string]: unknown;
}

export interface RadiusWalletOptions {
  chain?: "testnet" | "mainnet";
}

/** Parse a fetch Response as JSON, with a clear error if the body is not valid JSON. */
async function parseJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Expected JSON response from ${res.url} but got ${res.status}: ${text.slice(0, 200)}`
    );
  }
}

function validateAmountInput(amount: string, decimals: number, label: string): void {
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error(`${label} amount must be a decimal string (e.g. "1.5").`);
  }
  const [, fraction = ""] = amount.split(".");
  if (fraction.length > decimals) {
    throw new Error(`${label} amount has more than ${decimals} decimal places.`);
  }
  if (!/[1-9]/.test(amount.replace(".", ""))) {
    throw new Error(`${label} amount must be greater than zero.`);
  }
}

export class RadiusWallet {
  public readonly address: Address;
  public readonly chain: Chain;
  private readonly account: PrivateKeyAccount;
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient<Transport, Chain, PrivateKeyAccount>;

  constructor(privateKey: `0x${string}`, options: RadiusWalletOptions = {}) {
    if (!privateKey.startsWith("0x") || privateKey.length !== 66) {
      throw new Error(
        "Invalid private key: must be a 0x-prefixed 64-character hex string (66 chars total)"
      );
    }
    const chain =
      options.chain === "mainnet" ? radiusMainnet : radiusTestnet;
    const account = privateKeyToAccount(privateKey);
    const transport = http(chain.rpcUrls.default.http[0]);

    this.address = account.address;
    this.chain = chain;
    this.account = account;
    this.publicClient = createPublicClient({ chain, transport });
    this.walletClient = createWalletClient({ account, chain, transport });
  }

  /**
   * Generate a new random wallet.
   */
  static create(options: RadiusWalletOptions = {}): RadiusWallet {
    const key = generatePrivateKey();
    return new RadiusWallet(key, options);
  }

  /**
   * Load wallet from RADIUS_PRIVATE_KEY environment variable.
   */
  static fromEnv(options: RadiusWalletOptions = {}): RadiusWallet {
    const key = process.env.RADIUS_PRIVATE_KEY;
    if (!key) throw new Error("RADIUS_PRIVATE_KEY environment variable not set");
    if (!key.startsWith("0x")) {
      throw new Error(
        "RADIUS_PRIVATE_KEY must start with 0x"
      );
    }
    return new RadiusWallet(key as `0x${string}`, options);
  }

  // ---------------------------------------------------------------------------
  // Balances
  // ---------------------------------------------------------------------------

  async getRusdBalance(address?: Address): Promise<string> {
    const addr = address ?? this.address;
    const raw = await this.publicClient.getBalance({ address: addr });
    return formatEther(raw);
  }

  async getSbcBalance(address?: Address): Promise<string> {
    const addr = address ?? this.address;
    const raw = await this.publicClient.readContract({
      address: SBC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [addr],
    });
    return formatUnits(raw as bigint, SBC_DECIMALS);
  }

  async getBalances(address?: Address): Promise<Balances> {
    const addr = address ?? this.address;
    const [rusd, sbc] = await Promise.all([
      this.getRusdBalance(addr),
      this.getSbcBalance(addr),
    ]);
    return { address: addr, rusd, sbc };
  }

  // ---------------------------------------------------------------------------
  // Chain info
  // ---------------------------------------------------------------------------

  async getChainInfo(): Promise<{
    chainId: number;
    blockNumber: bigint;
    gasPriceGwei: string;
  }> {
    const [chainId, blockNumber, gasPrice] = await Promise.all([
      this.publicClient.getChainId(),
      this.publicClient.getBlockNumber(),
      this.publicClient.getGasPrice(),
    ]);
    return {
      chainId,
      blockNumber,
      gasPriceGwei: formatUnits(gasPrice, 9),
    };
  }

  // ---------------------------------------------------------------------------
  // Transfers
  // ---------------------------------------------------------------------------

  async sendRusd(to: Address, amount: string): Promise<Hash> {
    validateAmountInput(amount, 18, "RUSD");
    const value = parseEther(amount);
    return this.walletClient.sendTransaction({
      account: this.account,
      to,
      value,
      chain: this.chain,
    });
  }

  async sendSbc(to: Address, amount: string): Promise<Hash> {
    validateAmountInput(amount, SBC_DECIMALS, "SBC");
    const value = parseUnits(amount, SBC_DECIMALS);
    return this.walletClient.writeContract({
      account: this.account,
      address: SBC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [to, value],
      chain: this.chain,
    });
  }

  // ---------------------------------------------------------------------------
  // Transaction status
  // ---------------------------------------------------------------------------

  async getTxReceipt(hash: Hash): Promise<TransactionReceipt> {
    return this.publicClient.getTransactionReceipt({ hash });
  }

  async waitForTx(hash: Hash): Promise<TransactionReceipt> {
    return this.publicClient.waitForTransactionReceipt({ hash });
  }

  explorerUrl(hash: Hash): string {
    const base = this.chain.blockExplorers?.default.url ?? "";
    return `${base}/tx/${hash}`;
  }

  // ---------------------------------------------------------------------------
  // Faucet (testnet)
  // ---------------------------------------------------------------------------

  async requestFaucet(token: string = "SBC"): Promise<FaucetResult> {
    if (this.chain.id === radiusMainnet.id) {
      throw new Error("Faucet is testnet-only. Initialize with testnet to request faucet funds.");
    }
    // Try unsigned drip first
    const res = await fetch(`${FAUCET_BASE}/drip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: this.address, token }),
    });
    const data = await parseJsonResponse(res);
    if (res.ok) return data as FaucetResult;

    const error = (data as { error?: string }).error ?? "";

    // Handle signature requirement
    if (error === "signature_required" || res.status === 401) {
      return this.faucetSigned(token);
    }

    // Handle rate limiting
    if (error === "rate_limited") {
      const d = data as { retry_after_ms?: number; retry_after_seconds?: number };
      const retryMs = d.retry_after_ms ?? (d.retry_after_seconds ?? 0) * 1000;
      throw new Error(`Faucet rate-limited. Retry after ${Math.ceil(retryMs / 1000)}s.`);
    }

    throw new Error(`Faucet error: ${JSON.stringify(data)}`);
  }

  private async faucetSigned(token: string): Promise<FaucetResult> {
    // Get challenge
    const challengeRes = await fetch(
      `${FAUCET_BASE}/challenge/${this.address}?token=${token}`
    );
    if (!challengeRes.ok) throw new Error("Failed to get faucet challenge");
    const challengeData = (await parseJsonResponse(challengeRes)) as {
      message?: string;
      challenge?: string;
    };
    const message = challengeData.message ?? challengeData.challenge;
    if (!message) throw new Error("No challenge message in faucet response");

    // Sign the challenge
    const signature = await this.walletClient.signMessage({
      message,
      account: this.account,
    });

    // Submit signed drip
    const res = await fetch(`${FAUCET_BASE}/drip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: this.address, token, signature }),
    });
    const data = await parseJsonResponse(res);
    if (!res.ok)
      throw new Error(`Signed faucet drip failed: ${JSON.stringify(data)}`);
    return data as FaucetResult;
  }

  // ---------------------------------------------------------------------------
  // Contract deployment
  // ---------------------------------------------------------------------------

  async deployContract(
    abi: Abi,
    bytecode: `0x${string}`,
    args?: unknown[]
  ): Promise<DeployResult> {
    const hash = await this.walletClient.deployContract({
      account: this.account,
      abi,
      bytecode,
      args: args ?? [],
      chain: this.chain,
    });
    const receipt = await this.waitForTx(hash);
    const address = receipt.contractAddress;
    if (!address) throw new Error(`Deploy failed — no contract address. Tx: ${hash}`);
    return { address, txHash: hash, receipt };
  }

  // ---------------------------------------------------------------------------
  // Contract interaction
  // ---------------------------------------------------------------------------

  async readContract(
    address: Address,
    abi: Abi,
    functionName: string,
    args?: unknown[]
  ): Promise<unknown> {
    return this.publicClient.readContract({
      address,
      abi,
      functionName,
      args: args ?? [],
    });
  }

  async writeContract(
    address: Address,
    abi: Abi,
    functionName: string,
    args?: unknown[],
    value?: bigint
  ): Promise<Hash> {
    return this.walletClient.writeContract({
      account: this.account,
      address,
      abi,
      functionName,
      args: args ?? [],
      ...(value !== undefined && { value }),
      chain: this.chain,
    });
  }
}
