type ForexRate = {
  symbol: string;
  buy: number;
  sell: number;
};

// Step 1: Convert NGN to USD using sell rate
export function ngnToUSD(amountInNGN: number, rates: ForexRate[]) {
  const ngnRate = rates.find((r) => r.symbol === "NGN");
  if (!ngnRate) throw new Error("NGN rate not found");

  return amountInNGN / ngnRate.sell;
}

// Step 2: Convert USD to target currency using buy rate
export function usdToTarget(
  amountInUSD: number,
  symbol: string,
  rates: ForexRate[],
) {
  const rate = rates.find((r) => r.symbol === symbol);
  if (!rate) throw new Error(`Rate not found for ${symbol}`);

  return amountInUSD * rate.buy;
}
