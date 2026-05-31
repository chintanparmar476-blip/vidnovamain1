// VidNova Backend — server.js
// Node.js + Express + yt-dlp

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

function ytdlp(args) {
  return new Promise((resolve, reject) => {
    exec(`yt-dlp ${args}`, { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

// GET video info
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  try {
    const info = await ytdlp(`--dump-json --no-playlist "${url}"`);
    const data = JSON.parse(info);
    const duration = data.duration
      ? `${Math.floor(data.duration/60)}:${String(Math.floor(data.duration%60)).padStart(2,'0')}`
      : '';
    const platform = data.extractor_key || 'Video';
    return res.json({ title: data.title, duration, thumbnail: data.thumbnail, platform });
  } catch (e) {
    return res.status(500).json({ error: 'Could not fetch video info. Check the URL.' });
  }
});

// Download
app.get('/api/download', async (req, res) => {
  const { url, format } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vidnova-'));
  const outputTemplate = path.join(tmpDir, '%(title)s.%(ext)s');
  let ytArgs = '';
  if (format === 'mp3') {
    ytArgs = `-x --audio-format mp3 --audio-quality 0 -o "${outputTemplate}" "${url}"`;
  } else if (format === 'webm') {
    ytArgs = `-f bestvideo[ext=webm]+bestaudio[ext=webm]/best[ext=webm] -o "${outputTemplate}" "${url}"`;
  } else {
    ytArgs = `-f bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best -o "${outputTemplate}" "${url}"`;
  }
  try {
    await ytdlp(ytArgs);
    const files = fs.readdirSync(tmpDir);
    if (!files.length) throw new Error('No file downloaded');
    const filePath = path.join(tmpDir, files[0]);
    const ext = path.extname(files[0]);
    const mimeMap = { '.mp4':'video/mp4', '.mp3':'audio/mpeg', '.webm':'video/webm' };
    res.setHeader('Content-Disposition', `attachment; filename="${files[0]}"`);
    res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('close', () => fs.rmSync(tmpDir, { recursive:true, force:true }));
  } catch (e) {
    fs.rmSync(tmpDir, { recursive:true, force:true });
    return res.status(500).json({ error: 'Download failed. Try again.' });
  }
});

app.post('/api/contact', (req, res) => {
  const { name, email, message } = req.body;
  console.log('Contact:', { name, email, message });
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`VidNova running at http://localhost:${PORT}`));
