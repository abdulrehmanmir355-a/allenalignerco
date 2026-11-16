const { Client } = require("pg");

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();

    const result = await client.query(
      'SELECT "fullName", email, "clinicName", "registrationNumber", "isVerified" FROM "Doctor" ORDER BY "createdAt" DESC LIMIT 10'
    );

    console.table(result.rows);
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error("Database error:", error.message);
  process.exitCode = 1;
});
