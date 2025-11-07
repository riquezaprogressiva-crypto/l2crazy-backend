import express from 'express';
import mysql from 'mysql2/promise';
import crypto from 'crypto';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

// Teste de rota
app.get('/', (req, res) => {
  res.send('Backend do L2Crazy rodando!');
});

// Conexão com banco
const db = await mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

// Função de hash compatível L2BySmall
function hashPasswordL2(password) {
  const sha1 = crypto.createHash('sha1').update(password).digest('hex');
  const packed = Buffer.from(sha1, 'hex');
  return packed.toString('base64');
}

// Cadastro / alteração de senha
app.post('/register', async (req, res) => {
  const { login, password, newPassword, email } = req.body;
  if (!login || !password)
    return res.status(400).json({ success: false, error: 'Login e senha são obrigatórios' });

  try {
    const hashedPassword = hashPasswordL2(password);
    const [rows] = await db.query('SELECT * FROM accounts WHERE login = ?', [login]);

    if (rows.length === 0) {
      // Cria conta
      const timestamp = Date.now();
      const accessLevel = 0;
      const lastIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      const lastServer = 1;

      await db.query(
        `INSERT INTO accounts 
         (login, password, email, lastactive, access_level, lastIP, lastServer)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [login, hashedPassword, email || '', timestamp, accessLevel, lastIP, lastServer]
      );

      return res.json({ success: true, message: 'Conta criada com sucesso!' });

    } else if (newPassword) {
      // Troca senha
      if (rows[0].password !== hashedPassword) {
        return res.status(400).json({ success: false, error: 'Senha atual incorreta!' });
      }
      const hashedNewPassword = hashPasswordL2(newPassword);
      await db.query('UPDATE accounts SET password = ? WHERE login = ?', [hashedNewPassword, login]);
      return res.json({ success: true, message: 'Senha atualizada com sucesso!' });

    } else {
      return res.status(400).json({ success: false, error: 'Login já existe!' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Login
app.post('/login', async (req, res) => {
  const { login, password } = req.body;
  if (!login || !password)
    return res.status(400).json({ success: false, error: 'Login e senha são obrigatórios' });

  try {
    const [rows] = await db.query('SELECT * FROM accounts WHERE login = ?', [login]);
    if (rows.length === 0) return res.status(400).json({ success: false, error: 'Conta não existe' });

    const hashedPassword = hashPasswordL2(password);
    if (rows[0].password !== hashedPassword)
      return res.status(400).json({ success: false, error: 'Senha incorreta' });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rota de ranks (PVP, PK, Clan)
app.get('/ranks', async (req, res) => {
  try {
    // PVP: top 10 pvpkills
    const [pvpRanks] = await db.query(
      'SELECT char_name AS name, pvpkills AS value FROM characters ORDER BY pvpkills DESC LIMIT 10'
    );

    // PK: top 10 pkkills
    const [pkRanks] = await db.query(
      'SELECT char_name AS name, pkkills AS value FROM characters ORDER BY pkkills DESC LIMIT 10'
    );

    // Clan: top 10 clãs por nível
    const [clanRanks] = await db.query(
      `SELECT c.clan_name AS name, c.clan_level AS value
       FROM clan_data c
       ORDER BY c.clan_level DESC
       LIMIT 10`
    );

    res.json({
      success: true,
      PVP: pvpRanks.map(r => `${r.name} - ${r.value}`),
      PK: pkRanks.map(r => `${r.name} - ${r.value}`),
      Clan: clanRanks.map(r => `${r.name} - ${r.value}`)
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rodar servidor
app.listen(3000, () => console.log('API rodando na porta 3000'));

