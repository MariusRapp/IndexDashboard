// Plain-language explanations for every tile, shown in the info sheet (ⓘ next to each title).
// Keyed by market symbol, CNN component key, or "cnn" / "crypto" for the two main gauges.
// Keep it short and simple: a reader with little finance background should get it in 20 seconds.

export const INFO = {
  /* ---------- Fear & Greed ---------- */
  cnn: {
    what: "A score from 0 to 100 that shows the mood of the US stock market. CNN builds it from the 7 signals below.",
    read: "<b>Below 25 (Extreme Fear):</b> investors are scared and selling. <b>Above 75 (Extreme Greed):</b> investors are very optimistic, maybe too optimistic. Some investors see extreme fear as a chance to buy and extreme greed as a warning. It is a mood check, not a forecast.",
  },
  crypto: {
    what: "The same idea for crypto: a 0–100 mood score for Bitcoin and the crypto market. It uses price swings, trading volume, social media and Google searches.",
    read: "Low = fear, high = greed. Crypto moods change much faster than stock moods, so the score can jump a lot within a few days.",
  },

  /* ---------- CNN components (each is also scored 0–100: low = fear, high = greed) ---------- */
  market_momentum_sp125: {
    what: "Compares the S&P 500 today with its average over the last 125 trading days (about 6 months).",
    read: "Clearly above its average = prices are rising, <b>Greed</b>. Clearly below = prices are falling, <b>Fear</b>.",
  },
  stock_price_strength: {
    what: "Counts how many US stocks are at a 52-week high versus a 52-week low.",
    read: "Many new highs = <b>Greed</b>. Many new lows = <b>Fear</b>.",
  },
  stock_price_breadth: {
    what: "Compares how much money is traded in rising stocks versus falling stocks.",
    read: "More volume in rising stocks = <b>Greed</b>. More in falling stocks = <b>Fear</b>. It shows if a rally is broad or carried by only a few stocks.",
  },
  put_call_options: {
    what: "Options are bets on prices. A put pays off when prices fall (like insurance), a call pays off when prices rise.",
    read: "Many puts compared with calls = investors protect themselves, <b>Fear</b>. Many calls = investors bet on gains, <b>Greed</b>.",
  },
  market_volatility_vix_50: {
    what: "Compares the VIX (the “fear gauge”, see below) with its average of the last 50 days.",
    read: "VIX above its average = investors expect big swings, <b>Fear</b>. Below = calm market, <b>Greed</b>.",
  },
  junk_bond_demand: {
    what: "Junk bonds are loans to riskier companies. They must pay more interest than safe bonds. This measures that extra interest (the “spread”).",
    read: "Small spread = investors happily take risk, <b>Greed</b>. Large spread = investors demand more for the risk, <b>Fear</b>.",
  },
  safe_haven_demand: {
    what: "Compares how stocks and safe US government bonds performed over the last 20 trading days.",
    read: "Stocks did better = <b>Greed</b>. Bonds did better = money is hiding in safe places, <b>Fear</b>.",
  },

  /* ---------- Market indices ---------- */
  "^GSPC": {
    what: "The 500 largest US companies in one number. The most watched stock index in the world.",
    read: "Rising = US companies are worth more in total. Many funds and investors use it as the benchmark for “the market”.",
  },
  "^DJI": {
    what: "30 large, well-known US companies. One of the oldest stock indices in the world.",
    read: "Moves mostly like the S&P 500. Because it holds only 30 stocks and is weighted by share price, single companies can move it a lot.",
  },
  "^NDX": {
    what: "The 100 largest non-financial companies on the Nasdaq exchange, mostly tech (e.g. Apple, Microsoft, Nvidia).",
    read: "Shows how tech and growth stocks are doing. It usually swings more than the S&P 500, up and down.",
  },
  "^GDAXI": {
    what: "The 40 largest companies in Germany.",
    read: "Rising = German big companies are worth more. Dividends are counted in, so over the years it climbs a bit faster than most other indices.",
  },
  "^STOXX50E": {
    what: "The 50 largest companies in the eurozone (e.g. from France, Germany, the Netherlands).",
    read: "The main measure for how European big companies are doing.",
  },
  "^N225": {
    what: "225 large companies in Japan. Japan’s best-known stock index.",
    read: "Rising = Japanese stocks are doing well. A weak yen often helps it, because Japanese exporters then earn more.",
  },
  "^FTSE": {
    what: "The 100 largest companies on the London Stock Exchange.",
    read: "Many of these companies earn most of their money abroad, e.g. in oil, banks and mining, so it often moves differently from tech-heavy indices.",
  },
  URTH: {
    what: "An ETF (a fund traded like a stock) that holds about 1,400 large companies from 23 rich countries. About 70 % are US companies.",
    read: "Shown as the fund price in USD, not in index points. Rising = global stocks are doing well. A popular one-stop investment for “the whole world”.",
  },

  /* ---------- Rates, volatility & currency ---------- */
  "^VIX": {
    what: "The “fear gauge”. Shows how strongly investors expect the S&P 500 to swing over the next 30 days.",
    read: "<b>Below 15:</b> calm. <b>20–30:</b> nervous. <b>Above 30:</b> strong fear. A rising VIX is shown in red, because it usually goes along with falling stocks.",
  },
  "^MOVE": {
    what: "Like the VIX, but for US government bonds: how strongly investors expect interest rates to swing.",
    read: "The higher, the more nervous the bond market. A rise is shown in red. Big jumps often come with surprises about inflation or central bank decisions.",
  },
  "^TNX": {
    what: "The interest rate the US government pays to borrow money for 10 years. A benchmark for loans and mortgages worldwide.",
    read: "Rising = borrowing gets more expensive; this can weigh on stocks, especially tech. Falling = often investors seek safety or expect rate cuts. Neither direction is simply good or bad, so it is shown without color.",
  },
  "DX-Y.NYB": {
    what: "The value of the US dollar against six major currencies, mostly the euro.",
    read: "Rising = the dollar gets stronger. A strong dollar makes things priced in dollars (oil, gold, US stocks) more expensive for the rest of the world. It often rises in crises.",
  },
  "10Y-3M": {
    what: "The 10-year US interest rate minus the 3-month rate, in percentage points (pp).",
    read: "Normally positive, because lending for longer pays more. <b>Below 0 (“inverted”):</b> in the past this came before most US recessions, often 6–18 months later. It is a warning sign, not a timer.",
  },

  /* ---------- Commodities & crypto ---------- */
  "GC=F": {
    what: "The price of one ounce of gold (about 31 g) in US dollars.",
    read: "Gold is a classic “safe haven”. It often rises in crises, with high inflation or when interest rates fall. It pays no interest or dividends.",
  },
  "CL=F": {
    what: "The price of one barrel (159 liters) of US crude oil.",
    read: "Rising oil means higher costs for fuel and energy and can push up inflation. Falling oil often signals weaker demand from the economy.",
  },
  "BTC-USD": {
    what: "The price of one Bitcoin, the largest cryptocurrency, in US dollars.",
    read: "Very volatile: moves of 5 % in a day are normal. It often moves together with investors’ appetite for risk, similar to tech stocks.",
  },
  "ETH-USD": {
    what: "The price of one Ether, the second-largest cryptocurrency, in US dollars. Ethereum is a platform for apps built on a blockchain.",
    read: "Usually moves in the same direction as Bitcoin, but often even more strongly.",
  },
};
