# Known development issues

## Windows pnpm version during API database tests

During local validation of [#35](https://github.com/zeddlabs/taskflow/issues/35), the outer Corepack command selected the project's pnpm 10.34.9, but the nested `pnpm run build` in `test:db` selected pnpm 12.10.1 and stopped with `ERR_PNPM_BAD_PM_VERSION`. With a disposable migrated PostgreSQL database, run the same steps from the repository root with Corepack:

```powershell
corepack.cmd pnpm --filter '@taskflow/api' exec prisma db seed
corepack.cmd pnpm --filter '@taskflow/api' build
corepack.cmd pnpm --filter '@taskflow/api' exec tsx --test test/database.test.ts
corepack.cmd pnpm --filter '@taskflow/api' exec jest --runInBand --config jest.db.config.json
```
