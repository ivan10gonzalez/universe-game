const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'universe-game' });
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Ruta API no encontrada.' });
  }

  res.sendFile(path.join(__dirname, 'index.html'), (err) => {
    if (err) next(err);
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Universe Game running on port ${PORT}`);
});
