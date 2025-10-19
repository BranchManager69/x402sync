import { createManyTransferEvents, getTransferEvents } from "@/db/services";
import { logger, schedules } from "@trigger.dev/sdk/v3";
import { ChainSyncConfig } from "./types";
import { fetchTransfers } from "./fetch/fetch";

export function createChainSyncTask(config: ChainSyncConfig) {
  return schedules.task({
    id: config.chain + "-sync-transfers-" + config.provider,
    cron: config.cron,
    maxDuration: config.maxDurationInSeconds,
    run: async () => {
      try {
        const now = new Date();

        for (const facilitator of config.facilitators) {
          // Get the most recent transfer for this chain and facilitator
          const mostRecentTransfer = await getTransferEvents({
            orderBy: { block_timestamp: 'desc' },
            take: 1,
            where: {
              chain: config.chain,
              transaction_from: facilitator,
              provider: config.provider
            }
          });

          // Use the most recent transfer's timestamp, or use fallback time
          const since = mostRecentTransfer.length > 0 
            ? mostRecentTransfer[0].block_timestamp 
            : config.syncStartDate;

          logger.log(`[${config.chain}] Fetching transfers for ${facilitator} since: ${since.toISOString()} until: ${now.toISOString()}`);

          const transfers = await fetchTransfers(config, [facilitator], since, now);

          if (transfers.length > 0) {
            const syncResult = await createManyTransferEvents(transfers);
            logger.log(`[${config.chain}] Successfully synced ${syncResult.count} new transfers`);
          }

          logger.log(`[${config.chain}] Found ${transfers.length} transfers from ${facilitator}`);
        }


      } catch (error) {
        logger.error(`[${config.chain}] Error syncing transfers:`, { error: String(error) });
        throw error;
      }
    },
  });
}

