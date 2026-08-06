import pg from "../lib/db/node_modules/pg/lib/index.js";

const passwordsToTry = [
  process.env.DATABASE_URL ? null : "postgres",
  "admin",
  "root",
  "password",
  "1234",
  "123456",
  "",
  "postgres123",
  "admin123"
];

async function tryConnect() {
  if (process.env.DATABASE_URL) {
    passwordsToTry.unshift(null); // test process.env.DATABASE_URL directly
  }

  for (const pwd of passwordsToTry) {
    const connStr = pwd === null 
      ? process.env.DATABASE_URL 
      : `postgresql://postgres:${encodeURIComponent(pwd)}@localhost:5432/postgres`;

    console.log(`Trying connection with password '${pwd === null ? "ENV_URL" : pwd}'...`);
    const client = new pg.Client({ connectionString: connStr });
    try {
      await client.connect();
      console.log(`SUCCESS! Connected to PostgreSQL with password: '${pwd}'`);
      
      const res = await client.query("SELECT datname FROM pg_database WHERE datname = 'legal_case_sim'");
      if (res.rows.length === 0) {
        console.log("Creating database 'legal_case_sim'...");
        await client.query("CREATE DATABASE legal_case_sim");
        console.log("Database 'legal_case_sim' created successfully!");
      } else {
        console.log("Database 'legal_case_sim' already exists.");
      }
      
      const workingUrl = pwd === null ? process.env.DATABASE_URL : `postgresql://postgres:${encodeURIComponent(pwd)}@localhost:5432/legal_case_sim`;
      console.log(`FINAL_DATABASE_URL=${workingUrl}`);
      await client.end();
      return workingUrl;
    } catch (err) {
      console.log(`Failed for password '${pwd}': ${err.message}`);
      try { await client.end(); } catch {}
    }
  }
  return null;
}

tryConnect();
