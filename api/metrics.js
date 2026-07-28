export default async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const url = `https://raw.githubusercontent.com/sharnenkov/ic-tp-portal/main/metrics.json?t=${Date.now()}`;
    const response = await fetch(url);

    if (!response.ok) {
      res.status(502).json({ error: 'Failed to load metrics' });
      return;
    }

    const metricsData = await response.json();
    res.status(200).json(metricsData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
