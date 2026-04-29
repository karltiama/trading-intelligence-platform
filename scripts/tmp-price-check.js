const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.resolve("apps/api/.env") });

const { PrismaClient } = require("../apps/api/node_modules/@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const row = await prisma.dailyPrice.findFirst({
      where: { symbol: { ticker: "GOOGL" } },
      orderBy: { date: "desc" },
      select: {
        date: true,
        close: true,
        symbol: { select: { ticker: true } },
      },
    });
    if (!row) {
      console.log("DB_LATEST_CLOSE null");
    } else {
      console.log(
        "DB_LATEST_CLOSE",
        JSON.stringify({
          symbol: row.symbol.ticker,
          date: row.date.toISOString(),
          close: Number(row.close),
        }),
      );
    }

    const key = process.env.ALPACA_API_KEY;
    const secret = process.env.ALPACA_SECRET_KEY;
    const base = process.env.ALPACA_BASE_URL || "https://data.alpaca.markets";
    if (!key || !secret) {
      console.log("ALPACA_ENV_MISSING");
      return;
    }

    const headers = {
      "APCA-API-KEY-ID": key,
      "APCA-API-SECRET-KEY": secret,
    };
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 10);
    const barsUrl =
      `${base}/v2/stocks/bars?symbols=GOOGL&timeframe=1Day` +
      `&start=${encodeURIComponent(start.toISOString())}` +
      `&end=${encodeURIComponent(end.toISOString())}` +
      "&limit=10&adjustment=raw&feed=iex&sort=asc";
    const barsRes = await fetch(barsUrl, { headers });
    const barsJson = await barsRes.json();
    const bars = (barsJson.bars && barsJson.bars.GOOGL) || [];
    const lastBar = bars[bars.length - 1] || null;
    console.log(
      "ALPACA_LATEST_DAILY_BAR",
      JSON.stringify(
        lastBar
          ? {
              timestamp: lastBar.t,
              close: lastBar.c,
              open: lastBar.o,
              high: lastBar.h,
              low: lastBar.l,
              volume: lastBar.v,
            }
          : null,
      ),
    );

    const quoteUrl = `${base}/v2/stocks/GOOGL/quotes/latest?feed=iex`;
    const quoteRes = await fetch(quoteUrl, { headers });
    const quoteJson = await quoteRes.json();
    const q = quoteJson.quote || null;
    console.log(
      "ALPACA_LATEST_QUOTE",
      JSON.stringify(q ? { timestamp: q.t, bid: q.bp, ask: q.ap } : null),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
