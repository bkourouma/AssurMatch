# Runbook — Prisma migrations

## Apply

```bash
ssh deployer@<vps>
docker exec assurmatch-app npx prisma migrate deploy --schema /app/backend/prisma/schema.prisma
docker exec assurmatch-app npx prisma migrate status --schema /app/backend/prisma/schema.prisma
```

## Status check

If status is not clean, do NOT serve traffic. Investigate divergence; if necessary roll back the last
deploy and create a corrective migration via a new spec.

## Notes

Spec 013 does not introduce new migrations. Future migrations follow the standard Prisma flow with a
dedicated spec.
