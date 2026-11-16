# Local risk management

Run `npm run dev:local` and open http://localhost:3000/quality/risks.
Create the independent local Risk Management login on first use. Risk authentication and storage require no HR account or database.
Finance has its own independent login at /finance/login and dashboard at /finance. Finance continues to use the configured payroll database; payroll writes create an inactive audit identity, which cannot sign in to HR.
Local login accounts are stored with bcrypt password hashes in .private/module-access. Sessions expire after eight hours. Sign-out is available in each workspace.

Risk records and review snapshots are stored in `.private/risk-management/register.json` on this machine, excluded by the existing `.private/` ignore rule. No database migration is needed. The module rejects non-loopback hosts and Netlify/Vercel environments. The launcher binds to 127.0.0.1.

Scores range from 1 to 25 (severity × likelihood). Bands are internal workflow defaults, not a clinical or regulatory determination. Capture hazard, owner, controls, review date, inherent and residual scores. Closing requires verification evidence. Stale edits are rejected. Concurrent writes are locked and saved using atomic rename. An interrupted process may leave `write.lock`; after confirming no app process is writing, remove that lock before retrying.

Use Export backup to download the register and its history. Keep backups in a private location. History is recorded by the application; administrators with filesystem access can modify the file. This is a single-machine setup, not a validated compliance system.
