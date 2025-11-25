const express = require('express');
const multer = require('multer');  // Memory storage — файлы в RAM
const axios = require('axios');
const fs = require('fs');  // Только для сохранения результата
const path = require('path');

const app = express();

// Memory storage: файлы в req.files как Buffer (не на диск!)
const upload = multer({ storage: multer.memoryStorage() });

// Папки и статика
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));  // Для результата

// ←←← КЛЮЧ ИЗ ПЕРЕМЕННЫХ ОКРУЖЕНИЯ (на Render: Environment → Add Variable) ←←←
const XAI_API_KEY = process.env.XAI_API_KEY?.trim();

if (!XAI_API_KEY) {
  console.error('ОШИБКА: XAI_API_KEY не установлен в переменных окружения!');
  process.exit(1);
}
console.log('XAI_API_KEY загружен (длина:', XAI_API_KEY.length, ')');

app.get('/', (req, res) => res.render('index'));

app.post('/compose', upload.fields([
  { name: 'background', maxCount: 1 },
  { name: 'object', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('Получен POST /compose');  // Лог для дебага

    // Проверяем файлы
    if (!req.files || !req.files.background || !req.files.object) {
      return res.status(400).send('Ошибка: Загрузи оба изображения (фон и объект)');
    }

    const bgBuffer = req.files.background[0].buffer;  // Buffer из memory
    const objBuffer = req.files.object[0].buffer;
    const userPrompt = (req.body.prompt || '').trim();

    // Base64 из Buffer (быстро, без диска)
    const toB64 = buffer => buffer.toString('base64');
    const bgB64 = toB64(bgBuffer);
    const objB64 = toB64(objBuffer);

    console.log('Файлы в base64 готовы (размеры:', bgBuffer.length, 'and', objBuffer.length, 'bytes)');

    // Промпт для Grok-4 (сам вырезает и компонует)
    const prompt = `
Ты — мастер CGI и фотореалистичной композитингу 2025 года.
Первое изображение — фон.
Второе изображение — исходное фото с объектом (любой фон).
Сделай:
1. Идеально вырежи основной объект со второго (волосы, стекло, дым — без артефактов).
2. Фотореалистично вставь на первый фон.
3. Подбери масштаб, положение, перспективу естественно.
4. Добавь реалистичные тени, отражения, блики, коррекцию освещения/цвета.
${userPrompt ? 'Дополнительно: ' + userPrompt : ''}
Результат — как профессиональная съёмка. Верни ТОЛЬКО одно изображение в высоком качестве.`;

    console.log('Отправляем в Grok-4...');

    const response = await axios.post('https://api.x.ai/v1/chat/completions', {
      model: "grok-4",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${bgB64}` } },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${objB64}` } }
        ]
      }],
      max_tokens: 100,
      temperature: 0.15
    }, {
      headers: { 
        'Authorization': `Bearer ${XAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 180000  // 3 мин на Grok
    });

    const resultB64 = response.data.choices[0].message.content[0].image_base64;
    const resultPath = `uploads/result_${Date.now()}.jpg`;

    // Создаём uploads/, если нет (на Render writable для результатов)
    if (!fs.existsSync('uploads')) {
      fs.mkdirSync('uploads', { recursive: true });
    }

    fs.writeFileSync(resultPath, Buffer.from(resultB64, 'base64'));
    console.log('Результат сохранён:', resultPath);

    res.render('result', { image: '/' + resultPath });

  } catch (err) {
    console.error('ОШИБКА в /compose:', err.response?.data || err.message);  // Логи для Render dashboard

    if (err.response?.status === 401) {
      res.status(401).send('Ошибка: Неверный XAI_API_KEY. Проверь переменные окружения.');
    } else if (err.response?.status === 429) {
      res.status(429).send('Лимит запросов к Grok-4. Подожди 1–2 мин.');
    } else {
      res.status(500).send(`
        <h2>Ошибка обработки</h2>
        <p>${err.message}</p>
        <pre>${JSON.stringify(err.response?.data, null, 2)}</pre>
        <br><a href="/">← Назад</a>
      `);
    }
  }
});

// Обработка ошибок Express (для multer и других)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).send(`Ошибка загрузки: ${err.message}`);
  }
  console.error('Unhandled error:', err);
  res.status(500).send('Внутренняя ошибка сервера');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер на порту ${PORT} (Render mode)`);
});
