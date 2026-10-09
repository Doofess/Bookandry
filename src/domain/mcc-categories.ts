import type { Category } from '@/types/domain';

import { MCC_CODES } from './mcc-codes';

/**
 * Business type to category.
 *
 * The default table files each business type under a built-in EXPENSE
 * category; the person's own moves (`Category.mccs`) come before it. Income
 * never goes through here: a refund from a supermarket is still a refund.
 */

/** A run of business types, both ends included, compared as four-digit strings. */
export type MccRange = readonly [from: string, to: string, categoryId: string];

/** Where a business type no range names is filed. */
export const DEFAULT_OTHER = 'cat.otherExpense';

/**
 * Sorted and non-overlapping, so every code falls in one range or in none
 * (then `DEFAULT_OTHER`). Each line follows the code's meaning: the spec's
 * examples, and the plan's readings of the rest (spec point 14). Retail
 * (5200-5999) not named otherwise is shopping.
 */
export const DEFAULT_MCC_CATEGORY: readonly MccRange[] = [
  ['0742', '0742', 'cat.pets'],
  // Airlines, car rental (3351-3441) and lodging (3501-3999) brands.
  ['3000', '3999', 'cat.travel'],
  // Railways.
  ['4011', '4011', 'cat.transport'],
  // Local transport, passenger railways.
  ['4111', '4112', 'cat.transport'],
  // Ambulance.
  ['4119', '4119', 'cat.health'],
  // Taxis, buses.
  ['4121', '4131', 'cat.transport'],
  // Cruises, boat rentals.
  ['4411', '4457', 'cat.travel'],
  ['4511', '4511', 'cat.travel'],
  ['4582', '4582', 'cat.travel'],
  // Travel agencies, package tours.
  ['4722', '4723', 'cat.travel'],
  // Tolls, other transport.
  ['4784', '4789', 'cat.transport'],
  // Telecom, network services.
  ['4812', '4821', 'cat.phoneInternet'],
  // Cable and pay TV.
  ['4899', '4899', 'cat.phoneInternet'],
  ['4900', '4900', 'cat.utilities'],
  // Vehicle supplies.
  ['5013', '5013', 'cat.transport'],
  // Medical equipment.
  ['5047', '5047', 'cat.health'],
  // Drugs.
  ['5122', '5122', 'cat.health'],
  // Petroleum.
  ['5172', '5172', 'cat.transport'],
  // Home supply, hardware, garden, department and discount stores.
  ['5200', '5399', 'cat.shopping'],
  // Food stores.
  ['5411', '5499', 'cat.groceries'],
  // Car, boat and motorcycle dealers, parts, tyres, fuel.
  ['5511', '5599', 'cat.transport'],
  ['5611', '5640', 'cat.shopping'],
  ['5641', '5641', 'cat.kids'],
  ['5642', '5733', 'cat.shopping'],
  // Software stores.
  ['5734', '5734', 'cat.aiSoftware'],
  ['5735', '5735', 'cat.shopping'],
  // Caterers, restaurants, bars, fast food.
  ['5811', '5814', 'cat.dining'],
  // Digital goods.
  ['5815', '5818', 'cat.subscriptions'],
  ['5832', '5832', 'cat.shopping'],
  // Pharmacies.
  ['5912', '5912', 'cat.health'],
  ['5921', '5944', 'cat.shopping'],
  ['5945', '5945', 'cat.kids'],
  ['5946', '5950', 'cat.shopping'],
  // Insurance (direct marketing).
  ['5960', '5960', 'cat.insurance'],
  ['5961', '5961', 'cat.shopping'],
  // Travel (direct marketing).
  ['5962', '5962', 'cat.travel'],
  ['5963', '5967', 'cat.shopping'],
  // Subscription merchants.
  ['5968', '5968', 'cat.subscriptions'],
  ['5969', '5973', 'cat.shopping'],
  // Hearing aids, orthopaedic goods.
  ['5975', '5976', 'cat.health'],
  ['5977', '5978', 'cat.shopping'],
  // Heating fuel, bottled gas.
  ['5983', '5983', 'cat.utilities'],
  ['5992', '5994', 'cat.shopping'],
  ['5995', '5995', 'cat.pets'],
  ['5996', '5999', 'cat.shopping'],
  // Cash withdrawal (see spec point 14: not an expense in import).
  ['6010', '6011', 'cat.currencyExchange'],
  // Currency exchange.
  ['6051', '6051', 'cat.currencyExchange'],
  // Insurance.
  ['6300', '6399', 'cat.insurance'],
  // Property rentals.
  ['6513', '6513', 'cat.rent'],
  // Hotels, timeshares.
  ['7011', '7012', 'cat.travel'],
  // Camps.
  ['7032', '7032', 'cat.kids'],
  ['7033', '7033', 'cat.travel'],
  // Counselling.
  ['7277', '7277', 'cat.health'],
  ['7278', '7278', 'cat.shopping'],
  ['7296', '7296', 'cat.shopping'],
  // Massage, health and beauty.
  ['7297', '7298', 'cat.health'],
  // Programming and data processing (software as a service).
  ['7372', '7372', 'cat.aiSoftware'],
  // Information services.
  ['7375', '7375', 'cat.subscriptions'],
  ['7511', '7511', 'cat.transport'],
  ['7512', '7512', 'cat.travel'],
  ['7513', '7513', 'cat.transport'],
  ['7519', '7519', 'cat.travel'],
  // Parking, car repair, car wash, towing.
  ['7523', '7549', 'cat.transport'],
  // Lotteries, casinos, racing.
  ['7800', '7802', 'cat.entertainment'],
  ['7832', '7832', 'cat.entertainment'],
  // Video rental.
  ['7841', '7841', 'cat.subscriptions'],
  // Dance studios.
  ['7911', '7911', 'cat.fitness'],
  // Theatre, bands, billiards, bowling.
  ['7922', '7933', 'cat.entertainment'],
  // Sports clubs.
  ['7941', '7941', 'cat.fitness'],
  // Attractions, golf, games, betting, amusement parks.
  ['7991', '7996', 'cat.entertainment'],
  // Sports and country clubs.
  ['7997', '7997', 'cat.fitness'],
  ['7998', '7999', 'cat.entertainment'],
  // Doctors, dentists, hospitals, labs.
  ['8011', '8099', 'cat.health'],
  // Schools, colleges.
  ['8211', '8299', 'cat.education'],
  // Child care.
  ['8351', '8351', 'cat.kids'],
];

/** The built-in category the table files a business type under. */
export function defaultCategoryForMcc(code: string): string {
  return DEFAULT_MCC_CATEGORY.find(([from, to]) => from <= code && code <= to)?.[2] ?? DEFAULT_OTHER;
}

const liveExpense = (category: Category): boolean => category.kind === 'expense' && category.isArchived === 0;

/**
 * The category a business type files under, or undefined to let the rest of
 * the chain decide:
 *  1. a live category the person moved it into - the one updated last, if
 *     two claim it (two devices moving it apart, before they met);
 *  2. the default table's built-in, unless that is archived or missing.
 */
export function categoryForMcc(code: string, categories: readonly Category[]): string | undefined {
  const moved = categories
    .filter((category) => liveExpense(category) && category.mccs?.includes(code) === true)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  if (moved[0] !== undefined) return moved[0].id;
  const fallback = defaultCategoryForMcc(code);
  return categories.some((category) => category.id === fallback && liveExpense(category))
    ? fallback
    : undefined;
}

/**
 * What a category's business-types page lists: the table's codes for it,
 * less any the person moved into another live category, then the ones moved
 * into it. An income category has none.
 */
export function businessTypesOf(
  category: Category,
  categories: readonly Category[],
): { readonly defaults: readonly string[]; readonly moved: readonly string[] } {
  if (category.kind !== 'expense') return { defaults: [], moved: [] };
  const moved = category.mccs ?? [];
  const elsewhere = new Set(
    categories.filter((c) => c.id !== category.id && liveExpense(c)).flatMap((c) => c.mccs ?? []),
  );
  const defaults = MCC_CODES.filter(
    (code) => defaultCategoryForMcc(code) === category.id && !elsewhere.has(code) && !moved.includes(code),
  );
  return { defaults, moved };
}
