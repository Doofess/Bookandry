import type { CatalogIssuer } from '../types';
import { amex } from './amex';
import { cal } from './cal';
import { diners } from './diners';
import { isracard } from './isracard';
import { max } from './max';

export const issuers: readonly CatalogIssuer[] = [isracard, amex, cal, diners, max];
