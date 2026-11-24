-- Functions are executable by PUBLIC by default, which includes anon and authenticated.
-- Close that for functions the owner role creates from now on, so a future migration cannot
-- expose a function by forgetting the explicit REVOKE. Applies to objects created by the
-- migration role only; existing functions in public were already revoked by the init migration.
alter default privileges for role postgres revoke execute on functions from public;
revoke execute on all functions in schema public from public;
