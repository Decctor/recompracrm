// Service constructors are imported by confirmation, but no external service runs in these tests.
process.env.RESEND_API_KEY = "re_test_unused";
process.env.STRIPE_SECRET_KEY = "sk_test_unused";
process.env.SUPABASE_DB_URL = "postgres://unused:unused@127.0.0.1:1/unused";
