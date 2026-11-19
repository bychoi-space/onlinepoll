import { buildMasterDB } from '../src/services/onnuri-db-builder.js';

export { buildMasterDB };

if (process.argv[1]?.includes('build-onnuri-master-db.js')) {
  buildMasterDB().catch((err) => {
    console.error('[Onnuri Master DB CLI 오류]', err);
    process.exitCode = 1;
  });
}
