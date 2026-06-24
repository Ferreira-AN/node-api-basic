// ARQUIVO: backend/server.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CONFIGURAÇÃO DO BANCO DE DADOS
// ============================================

// Detectar se está no Render
const isRender = process.env.RENDER === 'true' || process.env.RENDER_EXTERNAL_URL;

let dbPath;

if (isRender) {
  // Render com Disco Persistente
  const diskPath = '/opt/render/project/src/backend/database';
  
  // Criar a pasta se não existir
  if (!fs.existsSync(diskPath)) {
    fs.mkdirSync(diskPath, { recursive: true });
    console.log(`📁 Pasta criada: ${diskPath}`);
  }
  
  dbPath = path.join(diskPath, 'clientes.db');
  console.log(`🗄️ Render (Disco): ${dbPath}`);
} else {
  // Localhost
  const localDbDir = path.join(__dirname, 'database');
  if (!fs.existsSync(localDbDir)) {
    fs.mkdirSync(localDbDir, { recursive: true });
  }
  dbPath = path.join(localDbDir, 'clientes.db');
  console.log(`🗄️ Local: ${dbPath}`);
}

// Conectar ao banco
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
    }
  });
}

// ============================================
// URL DO SITE
// ============================================

function getSiteURL() {
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL;
  }
  return `http://localhost:${PORT}`;
}

const SITE_URL = getSiteURL();

// ============================================
// CONFIGURAÇÕES DO SERVIDOR
// ============================================

app.use(cors());
app.use(express.json());
// Redireciona a raiz direto para o admin (sem aparecer /admin.html na URL)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});
app.use(express.static(path.join(__dirname, '../frontend')));

// ============================================
// ROTAS
// ============================================

// Rota para o validador (página intermediária)
app.get('/validador', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/validador.html'));
});

// Rota para a página do cliente (via query string)
app.get('/cliente.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/cliente.html'));
});

// Rota antiga (mantém compatibilidade)
app.get('/verificar/:codigo', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/cliente.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// API: Buscar cliente
app.get('/api/cliente/:codigo', (req, res) => {
  const codigo = req.params.codigo;
  
  db.get('SELECT * FROM clientes WHERE codigo_qr = ? OR rnm = ?', 
    [codigo, codigo], 
    (err, cliente) => {
      if (err) {
        res.status(500).json({ erro: err.message });
      } else if (cliente) {
        res.json({ sucesso: true, cliente });
      } else {
        res.json({ sucesso: false, erro: 'Documento não encontrado' });
      }
    }
  );
});

// API: Cadastrar cliente
app.post('/api/clientes', async (req, res) => {
  try {
    const cliente = req.body;
    const codigoQR = 'qr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    const linkQR = `${SITE_URL}/validador?codigo=${codigoQR}`;
    
    if (!cliente.nome || !cliente.sobrenome || !cliente.rnm) {
      return res.status(400).json({ erro: 'Nome, sobrenome e RNM obrigatórios' });
    }

    db.run(
      `INSERT INTO clientes (codigo_qr, nome, sobrenome, rnm, data_nascimento, nacionalidade, data_validade, email, telefone) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        codigoQR,
        cliente.nome,
        cliente.sobrenome,
        cliente.rnm,
        cliente.data_nascimento,
        cliente.nacionalidade,
        cliente.data_validade,
        cliente.email || '',
        cliente.telefone || ''
      ],
      function(err) {
        if (err) {
          return res.status(500).json({ erro: 'Erro ao salvar: ' + err.message });
        }
        
        QRCode.toDataURL(linkQR, (err, qrData) => {
          if (err) {
            return res.status(500).json({ erro: 'Erro ao gerar QR Code' });
          }
          
          res.json({
            sucesso: true,
            mensagem: 'Cliente cadastrado!',
            cliente_id: this.lastID,
            codigo_qr: codigoQR,
            qr_code_image: qrData,
            link_qr: linkQR
          });
        });
      }
    );
  } catch (error) {
    res.status(500).json({ erro: 'Erro interno: ' + error.message });
  }
});

// API: Listar clientes
app.get('/api/clientes', (req, res) => {
  db.all('SELECT * FROM clientes ORDER BY id DESC', [], (err, clientes) => {
    if (err) {
      return res.status(500).json({ erro: err.message });
    }
    res.json({ sucesso: true, clientes });
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
