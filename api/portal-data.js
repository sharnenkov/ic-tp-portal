/**
 * Vercel API Route для загрузки данных портала
 * Читает данные из data/portal.json
 */

import fs from 'fs';
import path from 'path';

export default async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Read portal data from JSON file
    const filePath = path.join(process.cwd(), 'data', 'portal.json');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);

    res.status(200).json(data);
  } catch (error) {
    console.error('❌ Error loading portal data:', error);
    res.status(500).json({ error: error.message });
  }
};
