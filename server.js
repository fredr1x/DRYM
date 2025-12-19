const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));

// ВСЯ статика из public
app.use(express.static(path.join(__dirname, 'public')));

// Главная точка входа
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.listen(PORT, () => {
    console.log(`Frontend server running at http://localhost:${PORT}`);
});
