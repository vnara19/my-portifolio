import { defineConfig } from "@neon/config/v1";


//
//   pnpm jobs:build                        # bundle into jobs/neon/dist
//   cd jobs/neon
//   neon link                              # jobs project in aws-us-east-1

//


export default defineConfig({
  functions: {
    quotesync: {
      name: "Quote updates",


      source: "./dist",
      bundler: "none",
      env: {
        PORTFOLIO_DATABASE_URL: process.env.PORTFOLIO_DATABASE_URL ?? "",
        COINGECKO_API_KEY: process.env.COINGECKO_API_KEY ?? "",
        FINNHUB_API_KEY: process.env.FINNHUB_API_KEY ?? "",
        ALPHA_VANTAGE_API_KEY: process.env.ALPHA_VANTAGE_API_KEY ?? "",
        BRAPI_TOKEN: process.env.BRAPI_TOKEN ?? "",
        AWESOME_API_KEY: process.env.AWESOME_API_KEY ?? "",

        TZ: "America/Sao_Paulo",
      },
    },
  },
  triggers: {


    "quotes-hourly": {
      type: "schedule",
      function: "quotesync",
      cron: "0 * * * *",
    },
  },
});
