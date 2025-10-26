import { Facilitator, Chain } from './types';

// Extract all address+token pairs with their id and chain
type ExtractAddressTokenPairs<F extends Facilitator> = F['addresses'] extends Record<
  infer C extends Chain,
  infer Addrs
>
  ? Addrs extends Array<infer A extends { address: string; token: { address: string } }>
    ? {
        [K in C]: A extends { address: infer Addr; token: { address: infer Token } }
          ? `${F['id']}:${K}:${Addr & string}:${Token & string}`
          : never;
      }[C]
    : never
  : never;

// Find duplicates by checking each pair
type FindDuplicate<
  T extends readonly Facilitator[],
  Seen extends string = never,
> = T extends readonly [
  infer First extends Facilitator,
  ...infer Rest extends readonly Facilitator[],
]
  ? ExtractAddressTokenPairs<First> extends infer CurrentPairs extends string
    ? CurrentPairs extends Seen
      ? CurrentPairs // Found a duplicate
      : FindDuplicate<Rest, Seen | CurrentPairs>
    : never
  : never;

export function validateUniqueFacilitators<const T extends readonly Facilitator[]>(
  facilitators: FindDuplicate<T> extends never
    ? T
    : `❌ COMPILE ERROR: Duplicate address/token pair detected: '${FindDuplicate<T>}' (format: id:chain:address:token)`
): T {
  return facilitators;
}