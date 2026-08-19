import { createHash } from "node:crypto";

export const LEDGER_HASH_VERSION = 1;
export const LEDGER_GENESIS_HASH = Buffer.alloc(32);

export interface LedgerHashInput {
  id: bigint;
  providerId: string;
  eventType: string;
  credits: string;
  occurredAt: Date;
  previousHash?: Buffer;
}

function field(value: string | Buffer): Buffer {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(bytes.length);
  return Buffer.concat([length, bytes]);
}

export function computeLedgerHash(input: LedgerHashInput): Buffer {
  const payload = Buffer.concat([
    field(`v${LEDGER_HASH_VERSION}`),
    field(input.previousHash ?? LEDGER_GENESIS_HASH),
    field(input.id.toString()),
    field(input.providerId),
    field(input.eventType),
    field(input.credits),
    field(input.occurredAt.toISOString()),
  ]);
  return createHash("sha256").update(payload).digest();
}

export function verifyLedgerChain(
  events: readonly (LedgerHashInput & { hash: Buffer })[],
): boolean {
  let previous: Buffer = LEDGER_GENESIS_HASH;
  for (const [index, event] of events.entries()) {
    if (index > 0 && !event.previousHash) return false;
    if (event.previousHash && !event.previousHash.equals(previous)) return false;
    const expected = computeLedgerHash({ ...event, previousHash: previous });
    if (!expected.equals(event.hash)) return false;
    previous = event.hash;
  }
  return true;
}
