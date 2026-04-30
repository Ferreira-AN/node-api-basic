// seed.js - VERSÃO COMPLETA
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database/clientes.db');

console.log('=== INICIANDO CONFIGURAÇÃO ===');

// 1. Criar tabela
db.run(`CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_qr VARCHAR(50) UNIQUE,
    nome VARCHAR(100),
    sobrenome VARCHAR(100),
    rnm VARCHAR(20),
    data_nascimento DATE,
    nacionalidade VARCHAR(50),
    data_validade DATE,
    email VARCHAR(100),
    telefone VARCHAR(20),
    status VARCHAR(20) DEFAULT 'ativo'
)`, (err) => {
    if (err) {
        console.error('❌ ERRO criando tabela:', err.message);
        db.close();
        return;
    }
    
    console.log('✅ Tabela criada/verificada');
    
    // 2. Inserir dados
    const dados = [
        ['qr_123', 'HELIO', 'PINTO PIRES', 'B2371187', '1995-08-25', 'Angola', '2026-12-16', 'helio@email.com', '(11) 99999-9999', 'ativo'],
        ['qr_456', 'MARIA', 'SILVA', 'B4455667', '1990-05-15', 'Brasil', '2025-10-31', 'maria@email.com', '(21) 88888-8888', 'ativo']
    ];
    
    let count = 0;
    dados.forEach(cliente => {
        db.run(
            `INSERT OR IGNORE INTO clientes (codigo_qr, nome, sobrenome, rnm, data_nascimento, nacionalidade, data_validade, email, telefone, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            cliente,
            (err) => {
                if (err) {
                    console.error('❌ Erro inserindo:', err.message);
                } else {
                    console.log(`✅ ${cliente[1]} adicionado`);
                }
                count++;
                
                if (count === dados.length) {
                    console.log('\n🎉 CONFIGURAÇÃO COMPLETA!');
                    console.log('👉 Execute: node server.js');
                    db.close();
                }
            }
        );
    });
});
