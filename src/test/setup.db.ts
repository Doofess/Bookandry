/**
 * Must run BEFORE any module that constructs a Dexie instance at import scope,
 * hence a bare setup-file specifier rather than an import inside a test.
 */
import 'fake-indexeddb/auto';
