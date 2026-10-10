import { beforeAll, describe, expect, it } from 'vitest';

import i18n from '@/i18n';
import { initTestI18n } from '@/test/render';
import {
  BUILTIN_METHOD_IDS,
  OTHER_METHOD_ID,
  STANDING_ORDER_METHOD_ID,
  TRANSFER_METHOD_ID,
  WALLET_METHOD_ID,
  type PaymentMethod,
} from '@/types/domain';

import { methodDisplayName } from './method-name';

const row = (id: string, label: string): PaymentMethod => ({
  id,
  label,
  profileId: '*',
  type: 'other',
  isArchived: 0,
  createdAt: '2026-10-10T00:00:00.000Z' as PaymentMethod['createdAt'],
  updatedAt: '2026-10-10T00:00:00.000Z' as PaymentMethod['updatedAt'],
});

describe('built-in names follow the language, whatever label is stored', () => {
  beforeAll(async () => {
    await initTestI18n('he');
  });

  // The namespaces a screen asks for: the built-in names live in `profiles`.
  const hebrew = () => i18n.getFixedT('he', ['common', 'profiles']);

  it('names every built-in in Hebrew', () => {
    const t = hebrew();
    expect(methodDisplayName(row(TRANSFER_METHOD_ID, 'Bank transfer'), t)).toBe('העברה בנקאית');
    expect(methodDisplayName(row(STANDING_ORDER_METHOD_ID, 'Standing order'), t)).toBe('הוראת קבע');
    expect(methodDisplayName(row(WALLET_METHOD_ID, 'Bit / PayBox'), t)).toBe('ביט / פייבוקס');
    expect(methodDisplayName(row(OTHER_METHOD_ID, 'Other'), t)).toBe('אחר');
    expect(BUILTIN_METHOD_IDS).toHaveLength(6);
  });

  it('keeps a person’s own label on their own row', () => {
    expect(methodDisplayName(row('pm-x', 'Bit'), hebrew())).toBe('Bit');
  });
});
