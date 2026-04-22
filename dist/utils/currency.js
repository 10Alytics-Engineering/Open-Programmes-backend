"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ngnToUSD = ngnToUSD;
exports.usdToTarget = usdToTarget;
// Step 1: Convert NGN to USD using sell rate
function ngnToUSD(amountInNGN, rates) {
    const ngnRate = rates.find((r) => r.symbol === "NGN");
    if (!ngnRate)
        throw new Error("NGN rate not found");
    return amountInNGN / ngnRate.sell;
}
// Step 2: Convert USD to target currency using buy rate
function usdToTarget(amountInUSD, symbol, rates) {
    const rate = rates.find((r) => r.symbol === symbol);
    if (!rate)
        throw new Error(`Rate not found for ${symbol}`);
    return amountInUSD * rate.buy;
}
//# sourceMappingURL=currency.js.map