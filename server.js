import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// 启用CORS
app.use(cors());

// 只提供login.html文件的静态服务
app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'login.html'));
});

// 提供必要的静态资源（如果有的话）
app.use('/static', express.static(join(__dirname, 'static')));

const PORT = process.env.PORT || 12000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});