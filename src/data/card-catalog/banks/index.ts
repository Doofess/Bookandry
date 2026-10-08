import type { CatalogBank } from '../types';
import { discount } from './discount';
import { fibi, otsarHahayal, pagi, ubank } from './fibi';
import { hapoalim } from './hapoalim';
import { leumi } from './leumi';
import { massad } from './massad';
import { mercantile } from './mercantile';
import { mizrahi } from './mizrahi';
import { oneZero } from './one-zero';
import { yahav } from './yahav';

export const banks: readonly CatalogBank[] = [
  leumi,
  hapoalim,
  mizrahi,
  discount,
  mercantile,
  fibi,
  pagi,
  otsarHahayal,
  ubank,
  massad,
  yahav,
  oneZero,
];
