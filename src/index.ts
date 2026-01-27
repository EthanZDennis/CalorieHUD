import express from 'express';
import path from 'path';
import * as db from './db';

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.get('/api/stats', async (req, res) => {
  const stats = await db.getStats(req.query.user as string);
  res.json(stats);
});

app.post('/api/log/manual', async (req, res) => {
  await db.logMeal(req.body.user, req.body);
  res.sendStatus(200);
});

app.post('/api/weight', async (req, res) => {
  await db.logWeight(req.body.user, req.body.weight, req.body.date);
  res.sendStatus(200);
});

app.delete('/api/log/:id', async (req, res) => {
  await db.deleteLog(req.body.user, req.params.id);
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
db.initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
});
