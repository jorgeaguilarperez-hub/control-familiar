import 'dotenv/config';
import { buildApp } from './app.js';

const PORT = Number(process.env.PORT) || 4000;

async function main() {
  const app = await buildApp({ logger: true });
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Control Familiar backend escuchando en http://localhost:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
