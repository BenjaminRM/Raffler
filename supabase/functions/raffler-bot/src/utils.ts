export function hexToUint8Array(hex: string) {
  return new Uint8Array(hex.match(/.{1,2}/g)!.map((val) => parseInt(val, 16)));
}

export function parseCommission(rateStr: string, marketPrice: number): number {
    if (!rateStr) return 0;
    const percentMatch = rateStr.match(/^(\d+(?:\.\d+)?)%$/);
    if (percentMatch) {
        const percent = parseFloat(percentMatch[1]);
        return (marketPrice * percent) / 100;
    }
    const flatMatch = rateStr.match(/^\$?(\d+(?:\.\d+)?)$/);
    if (flatMatch) {
        return parseFloat(flatMatch[1]);
    }
    return 0;
}

export function bankersRound(num: number): number {
    const n = +num.toFixed(8);
    const i = Math.floor(n);
    const f = n - i;
    const e = 1e-8;
    if (f > 0.5 - e && f < 0.5 + e) {
        return (i % 2 === 0) ? i : i + 1;
    }
    return Math.round(n);
}

export function generateRaffleCode(length = 8): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
