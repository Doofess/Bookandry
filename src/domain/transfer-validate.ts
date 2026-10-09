import { CURRENT_DOC_VERSION, envelopeSchema, type ExportEnvelope } from './transfer-schema';

/**
 * Validation beyond what a per-row schema can express.
 *
 * Referential integrity is inherently cross-entity: no schema attached to a
 * single transaction can know whether its categoryId exists. IndexedDB has no
 * foreign keys, so if these checks do not happen here they do not happen at
 * all, and the result is feed rows with no category chip and a crash in the
 * first `categories.find(...)` that assumes a hit.
 */

export type ValidationIssue = { path: string; message: string };

export type ValidationResult =
  | { ok: true; doc: ExportEnvelope }
  | { ok: false; reason: 'unknown_version'; issues: ValidationIssue[]; docVersion: number }
  | { ok: false; reason: 'invalid'; issues: ValidationIssue[]; totalIssues: number };

/** A 5,000-row file with one systematic problem must not print 5,000 errors. */
const MAX_REPORTED_ISSUES = 20;

function crossEntityIssues(doc: ExportEnvelope): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { profiles, categories, paymentMethods, transactions, overrides } = doc.data;

  const profileIds = new Set(profiles.map((p) => p.id));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const methodIds = new Set(paymentMethods.map((m) => m.id));
  const transactionIds = new Set(transactions.map((t) => t.id));
  const kindOf = new Map(transactions.map((t) => [t.id, t.kind]));

  const colours = new Map<string, string>();
  for (const p of profiles) {
    const lower = p.color.toLowerCase();
    const owner = colours.get(lower);
    if (owner !== undefined) {
      issues.push({
        path: `profiles.${p.id}.color`,
        message: `Colour ${p.color} is already used by ${owner}`,
      });
    } else {
      colours.set(lower, p.name);
    }
  }

  for (const t of transactions) {
    if (!profileIds.has(t.profileId)) {
      issues.push({ path: `transactions.${t.id}.profileId`, message: `No profile ${t.profileId}` });
    }

    const category = categoryById.get(t.categoryId);
    if (!category) {
      issues.push({ path: `transactions.${t.id}.categoryId`, message: `No category ${t.categoryId}` });
    } else if (category.kind !== t.kind) {
      // An expense filed under an income category would flip its sign in every
      // total that groups by category.
      issues.push({
        path: `transactions.${t.id}.categoryId`,
        message: `Category ${t.categoryId} is ${category.kind}, but the transaction is ${t.kind}`,
      });
    }

    if (t.paymentMethodId !== undefined && !methodIds.has(t.paymentMethodId)) {
      issues.push({
        path: `transactions.${t.id}.paymentMethodId`,
        message: `No payment method ${t.paymentMethodId}`,
      });
    }

    if (t.kind === 'income' && t.paymentMethodId !== undefined) {
      issues.push({
        path: `transactions.${t.id}.paymentMethodId`,
        message: 'Income rows do not carry a payment method',
      });
    }

    if (t.kind !== 'income' && t.destinationId !== undefined) {
      // Only income lands somewhere; a destination on an expense would count it as cash coming in.
      issues.push({
        path: `transactions.${t.id}.destinationId`,
        message: 'Only income rows say where the money went',
      });
    }

    if (t.money.baseCurrency !== doc.defaultCurrency) {
      issues.push({
        path: `transactions.${t.id}.money.baseCurrency`,
        message: `Base currency ${t.money.baseCurrency} does not match the file's ${doc.defaultCurrency}`,
      });
    }
  }

  const slots = new Set<string>();
  for (const o of overrides) {
    if (!transactionIds.has(o.transactionId)) {
      issues.push({ path: `overrides.${o.id}.transactionId`, message: `No transaction ${o.transactionId}` });
    }
    const destination = o.patch?.destinationId;
    if (destination !== undefined && destination !== null && kindOf.get(o.transactionId) === 'expense') {
      issues.push({
        path: `overrides.${o.id}.patch.destinationId`,
        message: 'Only income rows say where the money went',
      });
    }
    const slot = `${o.transactionId}|${o.occurrenceDate}`;
    if (slots.has(slot)) {
      issues.push({
        path: `overrides.${o.id}`,
        message: `Duplicate override for ${o.transactionId} on ${o.occurrenceDate}`,
      });
    }
    slots.add(slot);
  }

  const actual = {
    profiles: profiles.length,
    categories: categories.length,
    paymentMethods: paymentMethods.length,
    transactions: transactions.length,
    overrides: overrides.length,
  };
  for (const [key, count] of Object.entries(doc.counts)) {
    const got = actual[key as keyof typeof actual];
    if (got !== count) {
      // Catches a truncated or partially written file before any transaction opens.
      issues.push({
        path: `counts.${key}`,
        message: `Header says ${String(count)}, file contains ${String(got)}`,
      });
    }
  }

  return issues;
}

export function validateEnvelope(input: unknown): ValidationResult {
  const parsed = envelopeSchema.safeParse(input);

  if (!parsed.success) {
    const all = parsed.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));

    // A version we do not understand deserves its own message, not a wall of
    // shape errors that makes it look like a corrupt file.
    const version = (input as { schemaVersion?: unknown } | null)?.schemaVersion;
    if (typeof version === 'number' && version > CURRENT_DOC_VERSION) {
      return { ok: false, reason: 'unknown_version', issues: [], docVersion: version };
    }

    return {
      ok: false,
      reason: 'invalid',
      issues: all.slice(0, MAX_REPORTED_ISSUES),
      totalIssues: all.length,
    };
  }

  if (parsed.data.schemaVersion > CURRENT_DOC_VERSION) {
    return { ok: false, reason: 'unknown_version', issues: [], docVersion: parsed.data.schemaVersion };
  }

  const issues = crossEntityIssues(parsed.data);
  if (issues.length > 0) {
    return {
      ok: false,
      reason: 'invalid',
      issues: issues.slice(0, MAX_REPORTED_ISSUES),
      totalIssues: issues.length,
    };
  }

  return { ok: true, doc: parsed.data };
}
