import { ChainSyncConfig, PaginationStrategy } from "../../types";
import { transformResponse } from "../base/config";

function buildQuery(since: Date, now: Date, facilitators: string[], limit: number): string {
  return `
    {
      EVM(network: matic, dataset: combined) {
        Transfers(
          limit: {count: ${limit}}
          where: {
            Transaction: {
              From: {in: ${JSON.stringify(facilitators)}}
              Time: {
                since: "${since.toISOString()}"
                till: "${now.toISOString()}"
              }
            }
          }
          orderBy: {descending: Block_Number}
        ) {
          Transfer {
            Amount
            Sender
            Receiver
            Currency {
              Name
              SmartContract
              Symbol
            }
          }
          Block {
            Time
            Number
          }
          Transaction {
            Hash
            From
          }
        }
      }
    }
  `;
}

export const polygonChainConfig: ChainSyncConfig = {
  cron: "*/30 * * * *",
  maxDuration: 1000,
  network: "polygon",
  facilitators: [
    "0xD8Dfc729cBd05381647EB5540D756f4f8Ad63eec" // Coinbase
  ],
  fallbackTime: 6 * 30 * 24 * 60 * 60 * 1000,
  apiUrl: "https://streaming.bitquery.io/graphql",
  paginationStrategy: PaginationStrategy.OFFSET,
  buildQuery,
  transformResponse,
};