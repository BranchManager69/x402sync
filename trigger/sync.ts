import { createManyTransferEvents, getTransferEvents } from "@/db/services";
import { logger, schedules } from "@trigger.dev/sdk/v3";
import { ChainSyncConfig, PaginationStrategy } from "./types";
import { PAGE_SIZE, TIME_WINDOW_DAYS } from "./constants";

export function createChainSyncTask(config: ChainSyncConfig) {
  return schedules.task({
    id: config.network + "-sync-transfers",
    cron: config.cron,
    maxDuration: config.maxDuration,
    run: async () => {
      try {
        const now = new Date();
        
        // Get the most recent transfer for this chain
        const mostRecentTransfer = await getTransferEvents({
          orderBy: { block_timestamp: 'desc' },
          take: 1,
          where: {
            chain: config.network
          }
        });

        // Use the most recent transfer's timestamp, or use fallback time
        const since = mostRecentTransfer.length > 0 
          ? mostRecentTransfer[0].block_timestamp 
          : new Date(now.getTime() - config.fallbackTime);

        logger.log(`[${config.network}] Fetching transfers since: ${since.toISOString()} until: ${now.toISOString()}`);

        let allTransfers;

        if (config.paginationStrategy === PaginationStrategy.OFFSET) {
          allTransfers = await fetchWithOffsetPagination(config, since, now);
        } else {
          allTransfers = await fetchWithTimeWindowing(config, since, now)
        }

        logger.log(`[${config.network}] Found ${allTransfers.length} total transfers to sync from facilitators`);

        if (allTransfers.length > 0) {
          const syncResult = await createManyTransferEvents(allTransfers);
          logger.log(`[${config.network}] Successfully synced ${syncResult.count} new transfers`);
        }

      } catch (error) {
        logger.error(`[${config.network}] Error syncing transfers:`, { error: String(error) });
        throw error;
      }
    },
  });
}

async function fetchWithOffsetPagination(
  config: ChainSyncConfig,
  since: Date,
  now: Date
): Promise<any[]> {
  const allTransfers = [];
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    logger.log(`[${config.network}] Fetching with offset: ${offset}`);

    const query = config.buildQuery(since, now, config.facilitators, PAGE_SIZE, offset);
    const transfers = await executeBitqueryRequest(config, query)

    allTransfers.push(...transfers);

    if (transfers.length < PAGE_SIZE) {
      hasMore = false;
    } else {
      offset += PAGE_SIZE;
    }

  }
  
  return allTransfers;
}

async function fetchWithTimeWindowing(
  config: ChainSyncConfig,
  since: Date,
  now: Date
): Promise<any[]> {
  const allTransfers = [];
  let currentStart = new Date(since);
  const timeWindowMs = TIME_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  while (currentStart < now) {
    const currentEnd = new Date(Math.min(currentStart.getTime() + timeWindowMs, now.getTime()));
    
    logger.log(`[${config.network}] Fetching window: ${currentStart.toISOString()} to ${currentEnd.toISOString()}`);

    const query = config.buildQuery(currentStart, currentEnd, config.facilitators, PAGE_SIZE);
    const transfers = await executeBitqueryRequest(config, query);

    allTransfers.push(...transfers);
    logger.log(`[${config.network}] Fetched ${transfers.length} transfers in this time window`);

    // If we got the full PAGE_SIZE, this window has more data
    if (transfers.length >= PAGE_SIZE) {
      logger.warn(`[${config.network}] Window returned ${transfers.length} transfers (at or above limit). Some data might be missing. Consider reducing TIME_WINDOW_DAYS.`);
    }

    currentStart = currentEnd;
  }

  return allTransfers;
}

async function executeBitqueryRequest(
  config: ChainSyncConfig,
  query: string
): Promise<any[]> {
  const headers = new Headers();
  headers.append("Content-Type", "application/json");
  headers.append("Authorization", `Bearer ${process.env.BITQUERY_API_KEY}`);

  const rawQuery = JSON.stringify({ query });

  const requestOptions = {
    method: "POST",
    headers: headers,
    body: rawQuery,
  };

  const response = await fetch(config.apiUrl, requestOptions);

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`[${config.network}] Bitquery API error (${response.status}):`, { error: errorText });
    throw new Error(`Bitquery API returned ${response.status}: ${errorText}`);
  }

  const result = await response.json();

  if (result.errors) {
    logger.error(`[${config.network}] Bitquery GraphQL errors:`, { errors: result.errors });
    throw new Error(`Bitquery GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return config.transformResponse(result.data, config.network);
}
