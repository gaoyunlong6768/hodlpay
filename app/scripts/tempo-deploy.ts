/**
 * Deploys HodlPaySettlement to Tempo testnet (Moderato) and funds it with
 * AlphaUSD settlement liquidity. Idempotent: reuses the relayer and attester
 * keys and an existing deployment. A previous single-relayer deployment is
 * drained into the new contract and kept under `legacy` so its payouts still show.
 *
 *   npx tsx scripts/tempo-deploy.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import solc from "solc";
import { createPublicClient, createWalletClient, erc20Abi, formatUnits, http, parseUnits, type Abi, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { tempoModerato } from "viem/chains";

const PATH_USD = "0x20c0000000000000000000000000000000000000";
const ALPHA_USD = "0x20c0000000000000000000000000000000000001";
const LIQUIDITY = Number(process.env.TEMPO_LIQUIDITY ?? 250_000);
const ATTESTERS = 3;
const THRESHOLD = 2;
const MAX_PER_SETTLEMENT = parseUnits("5000", 6);
const DAILY_LIMIT = parseUnits("50000", 6);

const stateDir = path.join(process.cwd(), ".hodlpay");
const keyFile = path.join(stateDir, "tempo-key.json");
const attesterFile = path.join(stateDir, "tempo-attesters.json");
const outFile = path.join(process.cwd(), "src/lib/hodlpay/tempo.json");
const sourceFile = path.join(process.cwd(), "../tempo/contracts/HodlPaySettlement.sol");

function relayerKey(): Hex {
  if (process.env.TEMPO_PRIVATE_KEY) return process.env.TEMPO_PRIVATE_KEY as Hex;
  mkdirSync(stateDir, { recursive: true });
  if (existsSync(keyFile)) return JSON.parse(readFileSync(keyFile, "utf8")).privateKey;
  const privateKey = generatePrivateKey();
  writeFileSync(keyFile, JSON.stringify({ privateKey }));
  return privateKey;
}

function attesterKeys(): Hex[] {
  if (process.env.TEMPO_ATTESTER_KEYS) return JSON.parse(process.env.TEMPO_ATTESTER_KEYS);
  mkdirSync(stateDir, { recursive: true });
  if (existsSync(attesterFile)) return JSON.parse(readFileSync(attesterFile, "utf8"));
  const keys = Array.from({ length: ATTESTERS }, () => generatePrivateKey());
  writeFileSync(attesterFile, JSON.stringify(keys));
  return keys;
}

function compile() {
  const input = {
    language: "Solidity",
    sources: { "HodlPaySettlement.sol": { content: readFileSync(sourceFile, "utf8") } },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors ?? []).filter((e: { severity: string }) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e: { formattedMessage: string }) => e.formattedMessage).join("\n"));
  const c = out.contracts["HodlPaySettlement.sol"].HodlPaySettlement;
  return { abi: c.abi as Abi, bytecode: `0x${c.evm.bytecode.object}` as Hex };
}

const V1_WITHDRAW_ABI = [
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

async function main() {
  const account = privateKeyToAccount(relayerKey());
  const attesters = attesterKeys().map((k) => privateKeyToAccount(k).address);
  const transport = http(tempoModerato.rpcUrls.default.http[0]);
  const pub = createPublicClient({ chain: tempoModerato, transport });
  const wallet = createWalletClient({ account, chain: tempoModerato, transport });
  console.log(`relayer ${account.address}`);
  console.log(`attesters ${attesters.join(", ")} (${THRESHOLD} of ${attesters.length})`);

  const bal = (token: Hex, who: Hex) => pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] });

  const { abi, bytecode } = compile();
  const existing = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : {};
  const legacy: { settlement: Hex; deployBlock: number }[] = existing.legacy ?? [];
  let settlement: Hex | undefined = existing.version === 2 ? existing.settlement : undefined;
  let deployBlock: number | undefined = existing.version === 2 ? existing.deployBlock : undefined;

  if (existing.settlement && existing.version !== 2) {
    const old = existing.settlement as Hex;
    const left = await bal(ALPHA_USD, old);
    if (left > BigInt(0)) {
      const hash = await wallet.writeContract({ address: old, abi: V1_WITHDRAW_ABI, functionName: "withdraw", args: [ALPHA_USD, left] });
      await pub.waitForTransactionReceipt({ hash });
      console.log(`withdrew ${formatUnits(left, 6)} AlphaUSD from single-relayer contract ${old}`);
    }
    if (!legacy.some((l) => l.settlement === old)) legacy.push({ settlement: old, deployBlock: existing.deployBlock });
  }

  if ((await bal(ALPHA_USD, account.address)) < parseUnits(String(LIQUIDITY), 6)) {
    const hashes = await pub.request({ method: "tempo_fundAddress" as never, params: [account.address] as never });
    console.log(`faucet: ${(hashes as string[]).length} mint txs`);
    for (let i = 0; i < 20 && (await bal(ALPHA_USD, account.address)) === BigInt(0); i++) await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`relayer AlphaUSD ${formatUnits(await bal(ALPHA_USD, account.address), 6)}, pathUSD ${formatUnits(await bal(PATH_USD, account.address), 6)}`);

  if (settlement && (await pub.getCode({ address: settlement }))?.length) {
    console.log(`settlement already deployed at ${settlement}`);
  } else {
    const hash = await wallet.deployContract({ abi, bytecode, args: [attesters, THRESHOLD, MAX_PER_SETTLEMENT, DAILY_LIMIT] });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    settlement = receipt.contractAddress!;
    deployBlock = Number(receipt.blockNumber);
    console.log(`deployed HodlPaySettlement v2 at ${settlement} (tx ${hash})`);
  }

  const pool = await bal(ALPHA_USD, settlement);
  if (pool < parseUnits(String(LIQUIDITY / 2), 6)) {
    const available = await bal(ALPHA_USD, account.address);
    const target = parseUnits(String(LIQUIDITY), 6);
    const amount = available < target ? available : target;
    const hash = await wallet.writeContract({ address: ALPHA_USD, abi: erc20Abi, functionName: "transfer", args: [settlement, amount] });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`funded settlement with ${formatUnits(amount, 6)} AlphaUSD`);
  }

  const merchants =
    existing.merchants ??
    Object.fromEntries(
      ["Nomad Air", "Kinfolk Studio", "Bluebottle"].map((name) => [name, privateKeyToAccount(generatePrivateKey()).address]),
    );
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        chainId: tempoModerato.id,
        rpc: tempoModerato.rpcUrls.default.http[0],
        explorer: tempoModerato.blockExplorers.default.url,
        version: 2,
        settlement,
        deployBlock,
        token: ALPHA_USD,
        tokenSymbol: "AlphaUSD",
        relayer: account.address,
        attesters,
        threshold: THRESHOLD,
        maxPerSettlement: Number(formatUnits(MAX_PER_SETTLEMENT, 6)),
        dailyLimit: Number(formatUnits(DAILY_LIMIT, 6)),
        legacy,
        merchants,
        abi,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`settlement pool: ${formatUnits(await bal(ALPHA_USD, settlement), 6)} AlphaUSD`);
  console.log(`wrote ${path.relative(process.cwd(), outFile)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
