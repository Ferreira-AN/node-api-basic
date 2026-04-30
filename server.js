// ARQUIVO: backend/server.js - VERSÃO PARA RENDER
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');

const app = express();

// ============================================
// CONFIGURAÇÕES DINÂMICAS
// ============================================

// Porta automática (Render define, local usa 3000)
const PORT = process.env.PORT || 3000;

// URL automática - funciona em qualquer lugar
function getSiteURL() {
  // 1. Se estiver no Render
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL;
  }
  
  // 2. Se quiser testar com IP local (opcional)
  if (process.env.LOCAL_IP) {
    return `http://${process.env.LOCAL_IP}:${PORT}`;
  }
  
  // 3. Padrão: localhost
  return `http://localhost:${PORT}`;
}

const SITE_URL = getSiteURL();

// ============================================
// CONFIGURAÇÕES DO SERVIDOR
// ============================================

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Conectar ao banco de dados
const db = new sqlite3.Database('./database/clientes.db', (err) => {
  if (err) {
    console.error('Erro no banco de dados:', err);
  } else {
    console.log('Banco de dados conectado!');
    criarTabelas();
  }
});

// Criar tabelas no banco
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
  `);
  console.log('Tabela de clientes pronta!');
}

// ============================================
// ROTAS DA API
// ============================================


// ROTA: Página de login
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/login.html'));
});

// ROTA: Painel admin (protegido pelo login.html)
app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

// ROTA: Página inicial pública
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});



// ROTA 1: Buscar cliente pelo código
app.get('/api/cliente/:codigo', (req, res) => {
  const codigo = req.params.codigo;
  
  db.get('SELECT * FROM clientes WHERE codigo_qr = ? OR rnm = ?', 
    [codigo, codigo], 
    (err, cliente) => {
      if (err) {
        res.status(500).json({ erro: err.message });
      } else if (cliente) {
        res.json({ 
          sucesso: true, 
          cliente: cliente 
        });
      } else {
        res.json({ 
          sucesso: false, 
          erro: 'Documento não encontrado' 
        });
      }
    }
  );
});

// ROTA 2: Cadastrar novo cliente (VERSÃO CORRIGIDA)
app.post('/api/clientes', async (req, res) => {
  try {
    const cliente = req.body;
    const codigoQR = 'qr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    
    // Validar dados obrigatórios
    if (!cliente.nome || !cliente.sobrenome || !cliente.rnm) {
      return res.status(400).json({ erro: 'Nome, sobrenome e RNM são obrigatórios' });
    }

    // ✅✅✅ LINK DINÂMICO - funciona local e no Render ✅✅✅
    const linkQR = `${SITE_URL}/verificar/${codigoQR}`;
    
    // Inserir no banco
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
          return res.status(500).json({ erro: 'Erro ao salvar no banco: ' + err.message });
        }
        
        // Gerar QR Code
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
            link_qr: linkQR,  // ✅ Link correto aqui!
            site_url: SITE_URL // Para debug
          });
        });
      }
    );
  } catch (error) {
    res.status(500).json({ erro: 'Erro interno: ' + error.message });
  }
});

// ROTA 3: Listar todos clientes
app.get('/api/clientes', (req, res) => {
  db.all(`SELECT * FROM clientes ORDER BY data_cadastro DESC`, [], (err, clientes) => {
    if (err) {
      return res.status(500).json({ erro: 'Erro ao buscar clientes' });
    }
    res.json({ sucesso: true, clientes: clientes });
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
  console.log(`🔐 Admin: ${SITE_URL}/login.html`);
  console.log(`📱 Validador: ${SITE_URL}/verificar/{codigo}`);
  console.log(`📊 API: ${SITE_URL}/api/clientes`);
  console.log('='.repeat(50));
  
  // Mostrar modo atual
  if (process.env.RENDER_EXTERNAL_URL) {
    console.log('✅ MODO: PRODUÇÃO (Render)');
  } else {
    console.log('🛠️  MODO: DESENVOLVIMENTO (Local)');
  }
  
  console.log('='.repeat(50));
});