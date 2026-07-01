require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(express.static(__dirname));

app.post('/api/login', (req, res) => {
    const { user, pass } = req.body;
    if (user === process.env.LOGIN_USER && pass === process.env.LOGIN_PASS) {
        return res.json({ success: true });
    }
    res.status(401).json({ success: false });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
