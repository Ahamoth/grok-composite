// server.js — Grok-4 сам вырезает и вставляет (без remove.bg!)
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←
const XAI_API_KEY = "xai_твой_ключ_здесь";   // ←←←←←←←←←←←←
// ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←

app.get('/', (req, res) => res.render('index'));

app.post('/compose', upload.fields([
  { name: 'background', maxCount: 1 },
  { name: 'object', maxCount: 1 }
]), async (req, res) => {
  try {
    const bgPath = req.files.background[0].path;
    const objPath = req.files.object[0].path;
    const userPrompt = req.body.prompt?.trim() || "";

    // Конвертируем в base64
    const toB64 = p => fs.readFileSync(p, { encoding: 'base64' });
    const bgB64 = toB64(bgPath);
    const objB64 = toB64(objPath);

    // ←←←←←←←←←←← САМЫЙ ВАЖНЫЙ ПРОМПТ 2025 ГОДА ←←←←←←←←←←←
    const systemPrompt = `
Ты — лучший в мире специалист по фотокомпозиции и CGI.
Первое изображение — это фон.
Второе изображение — это исходное фото с объектом (фон может быть любой).
Твоя задача:
1. Автоматически и идеально вырежи основной объект со второго фото (даже если фон сложный: трава, волосы, прозрачные части — всё должно быть без артефактов).
2. Фотореалистично вставь этот объект на первое изображение (фон).
3. Подбери масштаб, положение и перспективу так, чтобы выглядело естественно.
4. Добавь полностью реалистичные контактные тени, мягкие тени от света в сцене, отражения (если пол глянцевый), блики, коррекцию освещения и цветовой температуры.
5. Результат должен быть неотличим от настоящей фотографии, снятой на профессиональную камеру.
${userPrompt ? "Дополнительные указания пользователя: " + userPrompt : ""}
Верни ТОЛЬКО одно финальное изображение в максимальном качестве, без текста и рамок.`;

    const response = await axios.post('https://api.x.ai/v1/chat/completions', {
      model: "grok-4",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: systemPrompt },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${bgB64}` } },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${objB64}` } }
        ]
      }],
      max_tokens: 100,
      temperature: 0.15
    }, {
      headers: { Authorization: `Bearer ${XAI_API_KEY}` }
    });

    const resultB64 = response.data.choices[0].message.content[0].image_base64;
    const resultPath = `uploads/result_${Date.now()}.jpg`;
    fs.writeFileSync(resultPath, Buffer.from(resultB64, 'base64'));

    // Чистим временные файлы
    fs.unlinkSync(bgPath);
    fs.unlinkSync(objPath);

    res.render('result', { image: '/' + resultPath });

  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).send(`Ошибка Grok: ${err.message}<br><pre>${JSON.stringify(err.response?.data, null, 2)}</pre>`);
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Готово!'));