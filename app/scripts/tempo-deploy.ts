/**
 * Deploys HodlPaySettlement to Tempo testnet (Moderato) and funds it with
 * AlphaUSD settlement liquidity. Idempotent: reuses the relayer key and an
 * existing deployment.
 *
 *   npx tsx scripts/tempo-deploy.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import solc from "solc";
import { createPublicClient, createWalletClient, erc20Abi, formatUnits, http, parseUnits, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { tempoModerato } from "viem/chains";

const PATH_USD = "0x20c0000000000000000000000000000000000000";
const ALPHA_USD = "0x20c0000000000000000000000000000000000001";
const LIQUIDITY = Number(process.env.TEMPO_LIQUIDITY ?? 250_000);

const stateDir = path.join(process.cwd(), ".hodlpay");
const keyFile = path.join(stateDir, "tempo-key.json");
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
  return { abi: c.abi, bytecode: `0x${c.evm.bytecode.object}` as Hex };
}

async function main() {
  const account = privateKeyToAccount(relayerKey());
  const transport = http(tempoModerato.rpcUrls.default.http[0]);
  const pub = createPublicClient({ chain: tempoModerato, transport });
  const wallet = createWalletClient({ account, chain: tempoModerato, transport });
  console.log(`relayer ${account.address}`);

  const bal = (token: Hex, who: Hex) => pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] });

  if ((await bal(ALPHA_USD, account.address)) < parseUnits(String(LIQUIDITY), 6)) {
    const hashes = await pub.request({ method: "tempo_fundAddress" as never, params: [account.address] as never });
    console.log(`faucet: ${(hashes as string[]).length} mint txs`);
    for (let i = 0; i < 20 && (await bal(ALPHA_USD, account.address)) === BigInt(0); i++) await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`relayer AlphaUSD ${formatUnits(await bal(ALPHA_USD, account.address), 6)}, pathUSD ${formatUnits(await bal(PATH_USD, account.address), 6)}`);

  const { abi, bytecode } = compile();
  let settlement: Hex | undefined = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")).settlement : undefined;
  if (settlement && (await pub.getCode({ address: settlement }))?.length) {
    console.log(`settlement already deployed at ${settlement}`);
  } else {
    const hash = await wallet.deployContract({ abi, bytecode, args: [account.address] });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    settlement = receipt.contractAddress!;
    console.log(`deployed HodlPaySettlement at ${settlement} (tx ${hash})`);
  }

  const pool = await bal(ALPHA_USD, settlement);
  if (pool < parseUnits(String(LIQUIDITY / 2), 6)) {
    const hash = await wallet.writeContract({
      address: ALPHA_USD,
      abi: erc20Abi,
      functionName: "transfer",
      args: [settlement, parseUnits(String(LIQUIDITY), 6)],
    });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`funded settlement with ${LIQUIDITY} AlphaUSD`);
  }

  const existing = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : {};
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
        settlement,
        token: ALPHA_USD,
        tokenSymbol: "AlphaUSD",
        relayer: account.address,
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
