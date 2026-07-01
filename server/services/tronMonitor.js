import { registerDonation, getDonations } from "./sheetsAgent.js";
import { broadcast } from "./sseManager.js";

const WALLET = process.env.BINANCE_WALLET_ADDRESS;
const TRON_API_KEY = process.env.TRON_API_KEY;
const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // USDT TRC20
const POLL_INTERVAL = 30_000; // 30 segundos
const TRON_API = "https://api.trongrid.io";

const knownTxHashes = new Set();
let initialized = false;

async function loadExistingHashes() {
  try {
    const donations = await getDonations();
    donations.forEach((d) => { if (d.tx_hash) knownTxHashes.add(d.tx_hash); });
    console.log(`[TronMonitor] ${knownTxHashes.size} txs previos cargados.`);
  } catch (err) {
    console.error("[TronMonitor] Error cargando hashes:", err.message);
  }
}

async function fetchRecentTransfers() {
  const url = `${TRON_API}/v1/accounts/${WALLET}/transactions/trc20?only_to=true&contract_address=${USDT_CONTRACT}&limit=20`;
  const res = await fetch(url, { headers: TRON_API_KEY ? { "TRON-PRO-API-KEY": TRON_API_KEY } : {} });
  if (!res.ok) throw new Error(`TronGrid HTTP ${res.status}`);
  const data = await res.json();
  return data.data ?? [];
}

async function processTransfer(tx) {
  const txHash = tx.transaction_id;
  if (knownTxHashes.has(txHash)) return;

  const decimals = tx.token_info?.decimals ?? 6;
  const amountUsd = Number(tx.value) / 10 ** decimals;
  knownTxHashes.add(txHash);

  const data = await registerDonation({
    donor_name: "Anónimo (USDT)",
    amount_usd: amountUsd,
    amount_original: amountUsd,
    currency: "USDT",
    method: "usdt",
    country: "INT",
    status: "approved",
    tx_hash: txHash,
  });

  broadcast({
    id: data.id,
    name: data.donor_name,
    amount: amountUsd,
    currency: "USDT",
  });

  console.log(`[TronMonitor] Nueva donación USDT: $${amountUsd} — tx ${txHash}`);
}

async function poll() {
  try {
    const transfers = await fetchRecentTransfers();
    for (const tx of transfers.reverse()) {
      await processTransfer(tx);
    }
  } catch (err) {
    console.error("[TronMonitor] Poll error:", err.message);
  }
}

export async function startTronMonitor() {
  if (!WALLET) {
    console.warn("[TronMonitor] BINANCE_WALLET_ADDRESS no configurada, monitor desactivado.");
    return;
  }
  await loadExistingHashes();
  initialized = true;
  console.log(`[TronMonitor] Monitoreando wallet ${WALLET} cada 30s...`);
  setInterval(poll, POLL_INTERVAL);
}
