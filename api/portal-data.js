/**
 * Vercel API Route для загрузки данных портала
 * Читает данные из data/portal.json
 */

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
    const data = await import('../data/portal.json', { assert: { type: 'json' } });

    res.status(200).json(data.default || data);
  } catch (error) {
    console.error('❌ Error loading portal data:', error);
    res.status(500).json({ error: error.message });
  }
};
