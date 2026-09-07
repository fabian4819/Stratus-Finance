/**
 * ISO 6166 ISIN checksum generator, matching the exact algorithm ATS
 * enforces on-chain (`node_modules/@hashgraph/asset-tokenization-contracts/contracts/factory/isinValidator.sol`
 * — Luhn-style, 12 chars total, check digit at the last position).
 * Verified against a known-valid real ISIN (Apple's `US0378331005`) before
 * use — see PLAN.md Phase 1 / docs/phase-0-findings.md Finding 3.
 */

const ASCII_0 = 48;
const ASCII_9 = 57;
const ASCII_7 = 55;

function byteToCode(ch: string): number {
  const code = ch.charCodeAt(0);
  return code > ASCII_9 ? code - ASCII_7 : code - ASCII_0;
}

function convertToDigits(prefix11: string): number[] {
  const conv: number[] = [];
  for (let i = 0; i < 11; i++) {
    const code = byteToCode(prefix11[i]);
    if (code > 9) {
      conv.push(Math.floor(code / 10), code % 10);
    } else {
      conv.push(code);
    }
  }
  return conv;
}

function calculateChecksum(conv: number[]): number {
  const pairing = (conv.length + 1) % 2;
  let sum = 0;
  for (let i = 0; i < conv.length; i++) {
    const code = conv[i] * (i % 2 === pairing ? 2 : 1);
    sum += code > 9 ? Math.floor(code / 10) + (code % 10) : code;
  }
  return (10 - (sum % 10)) % 10;
}

/** `prefix11` must be exactly 11 characters (2-letter country code + 9 alphanumeric). */
export function makeValidIsin(prefix11: string): string {
  if (prefix11.length !== 11) {
    throw new Error(`ISIN prefix must be exactly 11 characters, got ${prefix11.length}: "${prefix11}"`);
  }
  const checkDigit = calculateChecksum(convertToDigits(prefix11));
  return `${prefix11}${checkDigit}`;
}
