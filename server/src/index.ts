import dotenv from 'dotenv';
dotenv.config();

import { initDb } from './db/database.js';
import { createApp } from './app.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

initDb();
const app = createApp();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
