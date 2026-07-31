alter table "user"
  alter column "dateOfBirth" drop not null;

update "user"
set "isAnonymous" = false
where "isAnonymous" is null;

alter table "user"
  alter column "isAnonymous" set default false,
  alter column "isAnonymous" set not null;
