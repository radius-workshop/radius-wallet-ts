import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Constants we need for assertions
// ---------------------------------------------------------------------------
const TEST_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const MOCK_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const RECIPIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`;
const MOCK_TX_HASH =
  "0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1" as `0x${string}`;

// ---------------------------------------------------------------------------
// Mock viem clients
// ---------------------------------------------------------------------------
const mockPublicClient = {
  getBalance: vi.fn(),
  readContract: vi.fn(),
  getChainId: vi.fn(),
  getBlockNumber: vi.fn(),
  getGasPrice: vi.fn(),
  getTransactionReceipt: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
};

const mockWalletClient = {
  sendTransaction: vi.fn(),
  writeContract: vi.fn(),
  deployContract: vi.fn(),
  signMessage: vi.fn(),
};

// ---------------------------------------------------------------------------
// Mock viem module
// ---------------------------------------------------------------------------
vi.mock("viem", async () => {
  const actual = await vi.importActual<typeof import("viem")>("viem");
  return {
    ...actual,
    createPublicClient: vi.fn(() => mockPublicClient),
    createWalletClient: vi.fn(() => mockWalletClient),
  };
});

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: vi.fn(() => ({
    address: MOCK_ADDRESS,
    signMessage: vi.fn(),
  })),
  generatePrivateKey: vi.fn(() => TEST_KEY),
}));

// ---------------------------------------------------------------------------
// Import after mocks are in place
// ---------------------------------------------------------------------------
import { RadiusWallet } from "../src/wallet.js";
import { SBC_ADDRESS, radiusTestnet, radiusMainnet } from "../src/constants.js";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createWallet(opts?: { chain?: "testnet" | "mainnet" }) {
  return new RadiusWallet(TEST_KEY, opts);
}

function mockFetch(...responses: Array<{ ok: boolean; status: number; body: unknown; url?: string }>) {
  const queue = [...responses];
  return vi.fn(async (input: string | URL | Request) => {
    const r = queue.shift()!;
    const url = typeof input === "string" ? input : (input as Request).url ?? "";
    return {
      ok: r.ok,
      status: r.status,
      url: r.url ?? url,
      text: async () => JSON.stringify(r.body),
    } as unknown as Response;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("RadiusWallet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Constructor
  // =========================================================================
  describe("constructor", () => {
    it("creates a wallet with a valid private key", () => {
      const w = createWallet();
      expect(w.address).toBe(MOCK_ADDRESS);
      expect(w.chain).toBe(radiusTestnet);
    });

    it("defaults to testnet chain", () => {
      const w = createWallet();
      expect(w.chain.id).toBe(radiusTestnet.id);
    });

    it("rejects a key missing the 0x prefix", () => {
      const badKey = TEST_KEY.slice(2) as `0x${string}`;
      expect(() => new RadiusWallet(badKey)).toThrow("must be a 0x-prefixed");
    });

    it("rejects a key with wrong length", () => {
      expect(() => new RadiusWallet("0xdeadbeef" as `0x${string}`)).toThrow(
        "66 chars total"
      );
    });
  });

  // =========================================================================
  // create()
  // =========================================================================
  describe("create()", () => {
    it("generates a wallet using generatePrivateKey", () => {
      const w = RadiusWallet.create();
      expect(w.address).toBe(MOCK_ADDRESS);
    });
  });

  // =========================================================================
  // fromEnv()
  // =========================================================================
  describe("fromEnv()", () => {
    const originalEnv = process.env.RADIUS_PRIVATE_KEY;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.RADIUS_PRIVATE_KEY;
      } else {
        process.env.RADIUS_PRIVATE_KEY = originalEnv;
      }
    });

    it("creates wallet from RADIUS_PRIVATE_KEY env var", () => {
      process.env.RADIUS_PRIVATE_KEY = TEST_KEY;
      const w = RadiusWallet.fromEnv();
      expect(w.address).toBe(MOCK_ADDRESS);
    });

    it("throws when RADIUS_PRIVATE_KEY is not set", () => {
      delete process.env.RADIUS_PRIVATE_KEY;
      expect(() => RadiusWallet.fromEnv()).toThrow(
        "RADIUS_PRIVATE_KEY environment variable not set"
      );
    });

    it("throws when RADIUS_PRIVATE_KEY lacks 0x prefix", () => {
      process.env.RADIUS_PRIVATE_KEY = TEST_KEY.slice(2);
      expect(() => RadiusWallet.fromEnv()).toThrow("must start with 0x");
    });
  });

  // =========================================================================
  // getRusdBalance()
  // =========================================================================
  describe("getRusdBalance()", () => {
    it("returns formatted ether balance from publicClient.getBalance", async () => {
      const raw = parseEther("42.5");
      mockPublicClient.getBalance.mockResolvedValueOnce(raw);

      const w = createWallet();
      const balance = await w.getRusdBalance();

      expect(mockPublicClient.getBalance).toHaveBeenCalledWith({
        address: MOCK_ADDRESS,
      });
      expect(balance).toBe(formatEther(raw));
    });

    it("accepts a custom address", async () => {
      mockPublicClient.getBalance.mockResolvedValueOnce(0n);
      const w = createWallet();
      await w.getRusdBalance(RECIPIENT);

      expect(mockPublicClient.getBalance).toHaveBeenCalledWith({
        address: RECIPIENT,
      });
    });
  });

  // =========================================================================
  // getSbcBalance()
  // =========================================================================
  describe("getSbcBalance()", () => {
    it("reads SBC ERC-20 balanceOf and formats with 6 decimals", async () => {
      const raw = parseUnits("100.5", 6);
      mockPublicClient.readContract.mockResolvedValueOnce(raw);

      const w = createWallet();
      const balance = await w.getSbcBalance();

      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: SBC_ADDRESS,
          functionName: "balanceOf",
          args: [MOCK_ADDRESS],
        })
      );
      expect(balance).toBe(formatUnits(raw, 6));
    });

    it("accepts a custom address", async () => {
      mockPublicClient.readContract.mockResolvedValueOnce(0n);
      const w = createWallet();
      await w.getSbcBalance(RECIPIENT);

      expect(mockPublicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          args: [RECIPIENT],
        })
      );
    });
  });

  // =========================================================================
  // getBalances()
  // =========================================================================
  describe("getBalances()", () => {
    it("returns address, rusd, and sbc balances", async () => {
      const rusdRaw = parseEther("10");
      const sbcRaw = parseUnits("20", 6);
      mockPublicClient.getBalance.mockResolvedValueOnce(rusdRaw);
      mockPublicClient.readContract.mockResolvedValueOnce(sbcRaw);

      const w = createWallet();
      const result = await w.getBalances();

      expect(result).toEqual({
        address: MOCK_ADDRESS,
        rusd: formatEther(rusdRaw),
        sbc: formatUnits(sbcRaw, 6),
      });
    });
  });

  // =========================================================================
  // getChainInfo()
  // =========================================================================
  describe("getChainInfo()", () => {
    it("returns chainId, blockNumber, gasPriceGwei", async () => {
      mockPublicClient.getChainId.mockResolvedValueOnce(72344);
      mockPublicClient.getBlockNumber.mockResolvedValueOnce(999n);
      mockPublicClient.getGasPrice.mockResolvedValueOnce(1_000_000_000n); // 1 gwei

      const w = createWallet();
      const info = await w.getChainInfo();

      expect(info).toEqual({
        chainId: 72344,
        blockNumber: 999n,
        gasPriceGwei: "1",
      });
    });
  });

  // =========================================================================
  // sendRusd()
  // =========================================================================
  describe("sendRusd()", () => {
    it("calls walletClient.sendTransaction with correct params", async () => {
      mockWalletClient.sendTransaction.mockResolvedValueOnce(MOCK_TX_HASH);

      const w = createWallet();
      const hash = await w.sendRusd(RECIPIENT, "1.5");

      expect(mockWalletClient.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          to: RECIPIENT,
          value: parseEther("1.5"),
          chain: radiusTestnet,
        })
      );
      expect(hash).toBe(MOCK_TX_HASH);
    });
  });

  // =========================================================================
  // sendSbc()
  // =========================================================================
  describe("sendSbc()", () => {
    it("calls walletClient.writeContract with SBC transfer params", async () => {
      mockWalletClient.writeContract.mockResolvedValueOnce(MOCK_TX_HASH);

      const w = createWallet();
      const hash = await w.sendSbc(RECIPIENT, "50");

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: SBC_ADDRESS,
          functionName: "transfer",
          args: [RECIPIENT, parseUnits("50", 6)],
          chain: radiusTestnet,
        })
      );
      expect(hash).toBe(MOCK_TX_HASH);
    });
  });

  // =========================================================================
  // getTxReceipt()
  // =========================================================================
  describe("getTxReceipt()", () => {
    it("calls publicClient.getTransactionReceipt", async () => {
      const fakeReceipt = { status: "success", blockNumber: 42n };
      mockPublicClient.getTransactionReceipt.mockResolvedValueOnce(fakeReceipt);

      const w = createWallet();
      const receipt = await w.getTxReceipt(MOCK_TX_HASH);

      expect(mockPublicClient.getTransactionReceipt).toHaveBeenCalledWith({
        hash: MOCK_TX_HASH,
      });
      expect(receipt).toBe(fakeReceipt);
    });
  });

  // =========================================================================
  // waitForTx()
  // =========================================================================
  describe("waitForTx()", () => {
    it("calls publicClient.waitForTransactionReceipt", async () => {
      const fakeReceipt = { status: "success", blockNumber: 43n };
      mockPublicClient.waitForTransactionReceipt.mockResolvedValueOnce(fakeReceipt);

      const w = createWallet();
      const receipt = await w.waitForTx(MOCK_TX_HASH);

      expect(mockPublicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
        hash: MOCK_TX_HASH,
      });
      expect(receipt).toBe(fakeReceipt);
    });
  });

  // =========================================================================
  // explorerUrl()
  // =========================================================================
  describe("explorerUrl()", () => {
    it("returns correct testnet explorer URL", () => {
      const w = createWallet();
      const url = w.explorerUrl(MOCK_TX_HASH);
      expect(url).toBe(`https://testnet.radiustech.xyz/tx/${MOCK_TX_HASH}`);
    });

    it("returns correct mainnet explorer URL", () => {
      const w = createWallet({ chain: "mainnet" });
      const url = w.explorerUrl(MOCK_TX_HASH);
      expect(url).toBe(`https://network.radiustech.xyz/tx/${MOCK_TX_HASH}`);
    });
  });

  // =========================================================================
  // requestFaucet()
  // =========================================================================
  describe("requestFaucet()", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("returns result on unsigned success", async () => {
      const body = { tx_hash: "0xaaa" };
      globalThis.fetch = mockFetch({ ok: true, status: 200, body });

      const w = createWallet();
      const result = await w.requestFaucet("SBC");

      expect(result).toEqual(body);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("falls back to signed flow on signature_required", async () => {
      const dripError = { error: "signature_required" };
      const challenge = { message: "sign-this-challenge" };
      const signedResult = { tx_hash: "0xbbb" };

      mockWalletClient.signMessage.mockResolvedValueOnce("0xsig123");

      globalThis.fetch = mockFetch(
        { ok: false, status: 401, body: dripError },
        { ok: true, status: 200, body: challenge },
        { ok: true, status: 200, body: signedResult }
      );

      const w = createWallet();
      const result = await w.requestFaucet("RUSD");

      expect(result).toEqual(signedResult);
      // 3 fetch calls: initial drip, challenge, signed drip
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
      expect(mockWalletClient.signMessage).toHaveBeenCalledWith(
        expect.objectContaining({ message: "sign-this-challenge" })
      );
    });

    it("falls back to signed flow on 401 status", async () => {
      const dripError = { error: "something_else" };
      const challenge = { challenge: "other-challenge-field" };
      const signedResult = { tx_hash: "0xccc" };

      mockWalletClient.signMessage.mockResolvedValueOnce("0xsig456");

      globalThis.fetch = mockFetch(
        { ok: false, status: 401, body: dripError },
        { ok: true, status: 200, body: challenge },
        { ok: true, status: 200, body: signedResult }
      );

      const w = createWallet();
      const result = await w.requestFaucet();

      expect(result).toEqual(signedResult);
    });

    it("throws on rate limit error", async () => {
      const body = { error: "rate_limited", retry_after_seconds: 60 };
      globalThis.fetch = mockFetch({ ok: false, status: 429, body });

      const w = createWallet();
      await expect(w.requestFaucet()).rejects.toThrow("Faucet rate-limited");
    });

    it("throws on unknown faucet error", async () => {
      const body = { error: "unknown_error" };
      globalThis.fetch = mockFetch({ ok: false, status: 500, body });

      const w = createWallet();
      await expect(w.requestFaucet()).rejects.toThrow("Faucet error:");
    });
  });

  // =========================================================================
  // deployContract()
  // =========================================================================
  describe("deployContract()", () => {
    it("deploys contract and waits for receipt", async () => {
      const contractAddress = "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`;
      const fakeReceipt = {
        status: "success",
        contractAddress,
        blockNumber: 50n,
      };

      mockWalletClient.deployContract.mockResolvedValueOnce(MOCK_TX_HASH);
      mockPublicClient.waitForTransactionReceipt.mockResolvedValueOnce(fakeReceipt);

      const abi = [{ type: "constructor", inputs: [], stateMutability: "nonpayable" }] as const;
      const bytecode = "0xdeadbeef" as `0x${string}`;

      const w = createWallet();
      const result = await w.deployContract(abi as any, bytecode, []);

      expect(mockWalletClient.deployContract).toHaveBeenCalledWith(
        expect.objectContaining({
          abi,
          bytecode,
          args: [],
          chain: radiusTestnet,
        })
      );
      expect(result).toEqual({
        address: contractAddress,
        txHash: MOCK_TX_HASH,
        receipt: fakeReceipt,
      });
    });

    it("throws when receipt has no contract address", async () => {
      const fakeReceipt = {
        status: "success",
        contractAddress: null,
        blockNumber: 50n,
      };

      mockWalletClient.deployContract.mockResolvedValueOnce(MOCK_TX_HASH);
      mockPublicClient.waitForTransactionReceipt.mockResolvedValueOnce(fakeReceipt);

      const w = createWallet();
      await expect(
        w.deployContract([] as any, "0xdeadbeef" as `0x${string}`)
      ).rejects.toThrow("Deploy failed");
    });
  });

  // =========================================================================
  // readContract()
  // =========================================================================
  describe("readContract()", () => {
    it("calls publicClient.readContract with the correct arguments", async () => {
      mockPublicClient.readContract.mockResolvedValueOnce(42n);

      const abi = [
        {
          type: "function",
          name: "getValue",
          inputs: [],
          outputs: [{ type: "uint256" }],
          stateMutability: "view",
        },
      ] as const;
      const contractAddr = "0x1111111111111111111111111111111111111111" as `0x${string}`;

      const w = createWallet();
      const result = await w.readContract(contractAddr, abi as any, "getValue");

      expect(mockPublicClient.readContract).toHaveBeenCalledWith({
        address: contractAddr,
        abi,
        functionName: "getValue",
        args: [],
      });
      expect(result).toBe(42n);
    });

    it("passes custom args", async () => {
      mockPublicClient.readContract.mockResolvedValueOnce(true);

      const abi = [] as any;
      const contractAddr = "0x2222222222222222222222222222222222222222" as `0x${string}`;

      const w = createWallet();
      await w.readContract(contractAddr, abi, "isApproved", [MOCK_ADDRESS, 1n]);

      expect(mockPublicClient.readContract).toHaveBeenCalledWith({
        address: contractAddr,
        abi,
        functionName: "isApproved",
        args: [MOCK_ADDRESS, 1n],
      });
    });
  });

  // =========================================================================
  // writeContract()
  // =========================================================================
  describe("writeContract()", () => {
    it("calls walletClient.writeContract with correct params", async () => {
      mockWalletClient.writeContract.mockResolvedValueOnce(MOCK_TX_HASH);

      const abi = [] as any;
      const contractAddr = "0x3333333333333333333333333333333333333333" as `0x${string}`;

      const w = createWallet();
      const hash = await w.writeContract(contractAddr, abi, "setValue", [99n]);

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: contractAddr,
          abi,
          functionName: "setValue",
          args: [99n],
          chain: radiusTestnet,
        })
      );
      expect(hash).toBe(MOCK_TX_HASH);
    });

    it("includes value when provided", async () => {
      mockWalletClient.writeContract.mockResolvedValueOnce(MOCK_TX_HASH);

      const abi = [] as any;
      const contractAddr = "0x4444444444444444444444444444444444444444" as `0x${string}`;

      const w = createWallet();
      await w.writeContract(contractAddr, abi, "deposit", [], 1000n);

      expect(mockWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          value: 1000n,
        })
      );
    });

    it("omits value when undefined", async () => {
      mockWalletClient.writeContract.mockResolvedValueOnce(MOCK_TX_HASH);

      const abi = [] as any;
      const contractAddr = "0x5555555555555555555555555555555555555555" as `0x${string}`;

      const w = createWallet();
      await w.writeContract(contractAddr, abi, "doSomething");

      const call = mockWalletClient.writeContract.mock.calls[0][0];
      expect(call).not.toHaveProperty("value");
    });
  });

  // =========================================================================
  // Mainnet chain selection
  // =========================================================================
  describe("mainnet option", () => {
    it("selects mainnet chain when chain is 'mainnet'", () => {
      const w = createWallet({ chain: "mainnet" });
      expect(w.chain).toBe(radiusMainnet);
      expect(w.chain.id).toBe(723487);
    });

    it("selects testnet chain when chain is 'testnet'", () => {
      const w = createWallet({ chain: "testnet" });
      expect(w.chain).toBe(radiusTestnet);
      expect(w.chain.id).toBe(72344);
    });
  });
});
