export default async (req, res) => {
  try {
    const r = await fetch('https://raw.githubusercontent.com/sharnenkov/ic-tp-portal/main/metrics.json');
    const data = await r.json();
    res.json({ status: 'ok', overallConnectivity: data.overallConnectivity });
  } catch (e) {
    res.json({ status: 'error', message: e.message });
  }
};
