// ARQUIVO: backend/server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// UTILIZADORES DO SISTEMA
// Para adicionar novos: copie uma linha e mude id, usuario e senha
// ============================================
const USUARIOS = [
  { id: 1, usuario: 'Geral',  senha: 'CadaPla26' },
  { id: 2, usuario: 'Usuario1',  senha: 'Blok93ag&'  },
];

// Tokens activos em memória: { token: { usuario_id, expira } }
const tokensActivos = {};

function gerarToken() {
  return crypto.randomBytes(32).toString('hex');
}

function autenticar(req, res, next) {
  const token = req.headers['x-token'];
  if (!token || !tokensActivos[token]) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }
  if (Date.now() > tokensActivos[token].expira) {
    delete tokensActivos[token];
    return res.status(401).json({ erro: 'Sessão expirada' });
  }
  req.usuario_id = tokensActivos[token].usuario_id;
  next();
}

// ============================================
// CONFIGURAÇÃO DO BANCO DE DADOS
// ============================================
const isRender = process.env.RENDER === 'true' || process.env.RENDER_EXTERNAL_URL;
let dbPath;

if (isRender) {
  const diskPath = '/opt/render/project/src/backend/database';
  if (!fs.existsSync(diskPath)) {
    fs.mkdirSync(diskPath, { recursive: true });
    console.log(`📁 Pasta criada: ${diskPath}`);
  }
  dbPath = path.join(diskPath, 'clientes.db');
  console.log(`🗄️ Render (Disco): ${dbPath}`);
} else {
  const localDbDir = path.join(__dirname, 'database');
  if (!fs.existsSync(localDbDir)) fs.mkdirSync(localDbDir, { recursive: true });
  dbPath = path.join(localDbDir, 'clientes.db');
  console.log(`🗄️ Local: ${dbPath}`);
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro no banco:', err.message);
  } else {
    console.log('✅ Banco conectado!');
    criarTabelas();
  }
});

// ============================================
// CRIAR TABELAS
// ============================================
function criarTabelas() {
  db.run(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL DEFAULT 1,
      codigo_qr VARCHAR(50) UNIQUE,
      nome VARCHAR(100) NOT NULL,
      sobrenome VARCHAR(100) NOT NULL,
      rnm VARCHAR(20) NOT NULL,
      data_nascimento DATE NOT NULL,
      nacionalidade VARCHAR(50) NOT NULL,
      data_validade DATE NOT NULL,
      email VARCHAR(100),
      telefone VARCHAR(20),
      status VARCHAR(20) DEFAULT 'ativo',
      data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('❌ Erro na tabela:', err.message);
    } else {
      console.log('✅ Tabela clientes pronta!');
      // Adiciona coluna usuario_id se não existir (migração)
      db.run(`ALTER TABLE clientes ADD COLUMN usuario_id INTEGER NOT NULL DEFAULT 1`, () => {});
    }
  });
}

// ============================================
// URL DO SITE
// ============================================
function getSiteURL() {
  if (process.env.CUSTOM_DOMAIN) return `https://${process.env.CUSTOM_DOMAIN}`;
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL;
  return `http://localhost:${PORT}`;
}
const SITE_URL = getSiteURL();

// ============================================
// CONFIGURAÇÕES DO SERVIDOR
// ============================================
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});
app.use(express.static(path.join(__dirname, '../frontend')));

// ============================================
// ROTAS DE PÁGINAS
// ============================================
app.get('/validador', (req, res) => res.sendFile(path.join(__dirname, '../frontend/validador.html')));
app.get('/cliente.html', (req, res) => res.sendFile(path.join(__dirname, '../frontend/cliente.html')));
app.get('/documento', (req, res) => res.sendFile(path.join(__dirname, '../frontend/cliente.html')));
app.get('/verificar/:codigo', (req, res) => res.sendFile(path.join(__dirname, '../frontend/cliente.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, '../frontend/login.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, '../frontend/admin.html')));

// ============================================
// API: LOGIN
// ============================================
app.post('/api/login', (req, res) => {
  const { usuario, senha } = req.body;
  const user = USUARIOS.find(u => u.usuario === usuario && u.senha === senha);
  if (!user) return res.status(401).json({ erro: 'Utilizador ou senha incorretos' });

  const token = gerarToken();
  tokensActivos[token] = {
    usuario_id: user.id,
    expira: Date.now() + 8 * 60 * 60 * 1000 // 8 horas
  };
  console.log(`✅ Login: ${usuario} (id=${user.id})`);
  res.json({ sucesso: true, token, usuario: user.usuario });
});

// ============================================
// API: BUSCAR CLIENTE (público — para o validador)
// ============================================
app.get('/api/cliente/:codigo', (req, res) => {
  const codigo = req.params.codigo;
  db.get('SELECT * FROM clientes WHERE codigo_qr = ? OR rnm = ?', [codigo, codigo], (err, cliente) => {
    if (err) return res.status(500).json({ erro: err.message });
    if (cliente) return res.json({ sucesso: true, cliente });
    res.json({ sucesso: false, erro: 'Documento não encontrado' });
  });
});

// ============================================
// API: LISTAR CLIENTES (filtrado por utilizador)
// ============================================
app.get('/api/clientes', autenticar, (req, res) => {
  db.all('SELECT * FROM clientes WHERE usuario_id = ? ORDER BY id DESC', [req.usuario_id], (err, clientes) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ sucesso: true, clientes });
  });
});

// ============================================
// API: CADASTRAR CLIENTE
// ============================================
app.post('/api/clientes', autenticar, async (req, res) => {
  try {
    const cliente = req.body;
    const codigoQR = 'qr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    const linkQR = `${SITE_URL}/validador?codigo=${codigoQR}`;

    if (!cliente.nome || !cliente.sobrenome || !cliente.rnm) {
      return res.status(400).json({ erro: 'Nome, sobrenome e RNM obrigatórios' });
    }

    db.run(
      `INSERT INTO clientes (usuario_id, codigo_qr, nome, sobrenome, rnm, data_nascimento, nacionalidade, data_validade, email, telefone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.usuario_id, codigoQR, cliente.nome, cliente.sobrenome, cliente.rnm,
       cliente.data_nascimento, cliente.nacionalidade, cliente.data_validade,
       cliente.email || '', cliente.telefone || ''],
      function(err) {
        if (err) return res.status(500).json({ erro: 'Erro ao salvar: ' + err.message });
        QRCode.toDataURL(linkQR, (err, qrData) => {
          if (err) return res.status(500).json({ erro: 'Erro ao gerar QR Code' });
          res.json({ sucesso: true, mensagem: 'Cliente cadastrado!', cliente_id: this.lastID, codigo_qr: codigoQR, qr_code_image: qrData, link_qr: linkQR });
        });
      }
    );
  } catch (error) {
    res.status(500).json({ erro: 'Erro interno: ' + error.message });
  }
});

// ============================================
// API: EDITAR CLIENTE
// ============================================
app.put('/api/clientes/:id', autenticar, (req, res) => {
  const id = req.params.id;
  const { nome, sobrenome, rnm, data_nascimento, nacionalidade, data_validade, email, telefone } = req.body;
  if (!nome || !sobrenome || !rnm) return res.status(400).json({ erro: 'Nome, sobrenome e RNM obrigatórios' });

  db.run(
    `UPDATE clientes SET nome=?, sobrenome=?, rnm=?, data_nascimento=?, nacionalidade=?, data_validade=?, email=?, telefone=?
     WHERE id=? AND usuario_id=?`,
    [nome, sobrenome, rnm, data_nascimento, nacionalidade, data_validade, email, telefone, id, req.usuario_id],
    function(err) {
      if (err) return res.status(500).json({ erro: 'Erro ao atualizar: ' + err.message });
      if (this.changes === 0) return res.status(404).json({ erro: 'Cliente não encontrado' });
      res.json({ sucesso: true, mensagem: 'Cliente atualizado!', id });
    }
  );
});

// ============================================
// API: GERAR QR CODE
// ============================================
app.get('/api/qrcode', async (req, res) => {
  const link = req.query.link;
  if (!link) return res.status(400).json({ erro: 'Link obrigatório' });
  try {
    const qrData = await QRCode.toDataURL(link);
    res.json({ sucesso: true, qr_code_image: qrData });
  } catch (err) {
    res.status(500).json({ erro: 'Erro ao gerar QR: ' + err.message });
  }
});

// ============================================
// API: DELETAR CLIENTE
// ============================================
app.delete('/api/clientes/:id', autenticar, (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM clientes WHERE id=? AND usuario_id=?', [id, req.usuario_id], function(err) {
    if (err) return res.status(500).json({ erro: 'Erro ao deletar: ' + err.message });
    if (this.changes === 0) return res.status(404).json({ erro: 'Cliente não encontrado' });
    res.json({ sucesso: true, mensagem: 'Cliente removido com sucesso!' });
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log('🚀 SISTEMA DE QR CODE INICIADO');
  console.log('='.repeat(50));
  console.log(`📍 Porta: ${PORT}`);
  console.log(`🌐 URL: ${SITE_URL}`);
  console.log(`🗄️ Banco: ${dbPath}`);
  console.log(`🔐 Admin: ${SITE_URL}/login.html`);
  console.log('='.repeat(50));
});
