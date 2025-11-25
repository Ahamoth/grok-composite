const express = require('express');
const multer  = require('multer');
const axios   = require('axios');
const fs      = require('fs');
const path    = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Папки
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←
// КЛЮЧ ТОЛЬКО ИЗ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ!
const XAI_API_KEY = process.env.XAI_API_KEY?.trim();

if (!XAI_API_KEY) {
  console.error('ОШИБКА: Переменная окружения XAI_API_KEY не установлена!');
  process.exit(1);
}
// ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←

app.get('/', (req, res) => res.render('index'));

app.post('/compose', upload.fields([
  { name: 'background', maxCount: 1 },
  { name: 'object',     maxCount: 1 }
]), async (req, res) => {
  let tempFiles = [];

  try {
    const bgPath  = req.files.background[0].path;
    const objPath = req.files.object[0].path;
    tempFiles = [bgPath, objPath];

    const userPrompt = (req.body.prompt || '').trim();

    const toB64 = file => fs.readFileSync(file, { encoding: 'base64' });

    const prompt = `
Ты — лучший в мире CGI- и фото-композитор 2025 года.
Первое изображение — фон.
Второе изображение — исходное фото с объектом (может быть любой фон).
Сделай следующее:
1. Идеально вырежи основной объект со второго изображения (даже волосы, стекло, дым, мех — без единого артефакта).
2. Фотореалистично вставь его на первый фон.
3. Автоматически подбери масштаб, положение, перспективу.
4. Добавь 100 % реалистичные контактные тени, мягкие тени от света в сцене, отражения, блики, коррекцию освещения и цветовой температуры.
${userPrompt ? 'Дополнительно: ' + userPrompt : ''}
Результат должен быть неотличим от настоящей профессиональной съёмки.
Верни ТОЛЬКО одно финальное изображение в максимальном качестве.`;

    const response = await axios.post('https://api.x.ai/v1/chat/completions', {
      model: "grok-4",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${toB64(bgPath)}` } },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${toB64(objPath)}` } }
        ]
      }],
      max_tokens: 100,
      temperature: 0.15
    }, {
      headers: { 
        'Authorization': `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 180000
    });

    const resultB64 = response.data.choices[0].message.content[0].image_base64;
    const resultPath = `uploads/result_${Date.now()}.jpg`;
    fs.writeFileSync(resultPath, Buffer.from(resultB64, 'base64'));

    // Чистим временные файлы
    tempFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));

    res.render('result', { image: '/' + resultPath });

  } catch (err) {
    // Чистим временные файлы даже при ошибке
    tempFiles.forEach(f => fs.existsSync(f) && fs.unlinkSync(f));
    
    console.error('Ошибка:', err.response?.data || err.message);
    res.status(500).send(`
      <h2>Ошибка</h2>
      <pre>${err.response?.data?.error?.message || err.message}</pre>
      <br><a href="/">← Назад</a>
    `);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Grok-4 композитор готов → http://localhost:${PORT}`);
});
