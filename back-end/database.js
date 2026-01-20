const { Pool } = require('pg');
require('dotenv').config();

// Configuração do pool de conexões para o Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Testar conexão com o banco
async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Conectado ao banco de dados Neon PostgreSQL');

    // Criar tabela se não existir
    await createTables();

    client.release();
    return true;
  } catch (error) {
    console.error('❌ Erro ao conectar ao banco:', error.message);
    return false;
  }
}

// Criar apenas a tabela de mensagens
async function createTables() {
  const createMessagesTable = `
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      remetente_nome VARCHAR(255) NOT NULL,
      destinatario_nome VARCHAR(255) NOT NULL,
      mensagem TEXT NOT NULL,
      isPrinted BOOLEAN DEFAULT FALSE,
      printed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(50) DEFAULT 'active'
    );
  `;

  try {
    await pool.query(createMessagesTable);
    console.log('✅ Tabela "messages" verificada/criada');
  } catch (error) {
    console.error('❌ Erro ao criar tabelas:', error.message);
  }
}

// Funções CRUD para mensagens
const messageQueries = {
  // Salvar nova mensagem
  saveMessage: async (messageData) => {
    try {
      const query = `
        INSERT INTO messages (remetente_nome, destinatario_nome, mensagem, status)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `;

      const values = [
        messageData.remetente_nome,
        messageData.destinatario_nome,
        messageData.mensagem,
        'active'
      ];

      const result = await pool.query(query, values);
      return { success: true, data: result.rows[0] };
    } catch (error) {
      console.error('Erro ao salvar mensagem:', error.message);
      return { success: false, error: error.message };
    }


  },
  getLatestMessage: async () => {
    try {
      const query = `
        SELECT * FROM messages 
        WHERE status = 'active'
        ORDER BY created_at DESC
        LIMIT 1;
      `;
    } catch (error) {
      console.error('Erro ao buscar a última mensagem:', error.message);
      return { success: false, error: error.message };
    }
  },


  // Obter todas as mensagens
  getAllMessages: async () => {
    try {
      const query = `
        SELECT * FROM messages 
        WHERE status = 'active'
        ORDER BY created_at DESC;
      `;

      const result = await pool.query(query);
      return { success: true, data: result.rows };
    } catch (error) {
      console.error('Erro ao buscar mensagens:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Obter mensagem por ID
  getMessageById: async (id) => {
    try {
      const query = 'SELECT * FROM messages WHERE id = $1 AND status = $2';
      const result = await pool.query(query, [id, 'active']);

      if (result.rows.length === 0) {
        return { success: false, error: 'Mensagem não encontrada' };
      }

      return { success: true, data: result.rows[0] };
    } catch (error) {
      console.error('Erro ao buscar mensagem:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Excluir mensagem (soft delete)
  deleteMessage: async (id) => {
    try {
      const query = 'UPDATE messages SET status = $1 WHERE id = $2 RETURNING *';
      const result = await pool.query(query, ['deleted', id]);

      if (result.rowCount === 0) {
        return { success: false, error: 'Mensagem não encontrada' };
      }

      return { success: true, data: result.rows[0] };
    } catch (error) {
      console.error('Erro ao excluir mensagem:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Excluir todas as mensagens
  deleteAllMessages: async () => {
    try {
      const query = 'UPDATE messages SET status = $1 WHERE status = $2 RETURNING *';
      const result = await pool.query(query, ['deleted', 'active']);

      return {
        success: true,
        data: result.rows,
        count: result.rowCount
      };
    } catch (error) {
      console.error('Erro ao excluir todas as mensagens:', error.message);
      return { success: false, error: error.message };
    }
  },
  // database.js (adicionar estas funções no objeto messageQueries)

  // Marcar mensagem como impressa
  markAsPrinted: async (id) => {
    try {
      const query = 'UPDATE messages SET isPrinted = $1, printed_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *';
      const result = await pool.query(query, [true, id]);

      if (result.rowCount === 0) {
        return { success: false, error: 'Mensagem não encontrada' };
      }

      return { success: true, data: result.rows[0] };
    } catch (error) {
      console.error('Erro ao marcar mensagem como impressa:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Obter mensagens organizadas por status (não impressas primeiro)
  getMessagesOrdered: async () => {
    try {
      const query = `
      SELECT * FROM messages 
      WHERE status = 'active'
      ORDER BY 
        CASE WHEN isPrinted = false THEN 0 ELSE 1 END,
        created_at DESC;
    `;

      const result = await pool.query(query);
      return { success: true, data: result.rows };
    } catch (error) {
      console.error('Erro ao buscar mensagens ordenadas:', error.message);
      return { success: false, error: error.message };
    }
  },

  // Estatísticas
  getStats: async () => {
    try {
      const totalQuery = `SELECT COUNT(*) as total FROM messages WHERE status = 'active'`;
      const printedMessagesQuery = `SELECT COUNT(*) as printed FROM messages WHERE status = 'active' AND isPrinted = true`;
      const recipientsQuery = `SELECT COUNT(DISTINCT destinatario_nome) as recipients FROM messages WHERE status = 'active'`;
      const recentQuery = `SELECT COUNT(*) as recent FROM messages WHERE status = 'active' AND created_at >= NOW() - INTERVAL '7 days'`;

      const [total, printed, recipients, recent] = await Promise.all([
        pool.query(totalQuery),
        pool.query(printedMessagesQuery),
        pool.query(recipientsQuery),
        pool.query(recentQuery)
      ]);

      return {
        success: true,
        data: {
          total: parseInt(total.rows[0].total),
          printed: parseInt(printed.rows[0].printed),
          uniqueRecipients: parseInt(recipients.rows[0].recipients),
          recent: parseInt(recent.rows[0].recent)
        }
      };
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error.message);
      return { success: false, error: error.message };
    }
  },
                  // Função para obter mensagens desde um ID específico
  getMessagesSinceId: async (sinceId, limit = 50) => {
    try {
      const query = `
        SELECT id, remetente_nome, destinatario_nome, mensagem, created_at, printed_at, isprinted
        FROM messages
        WHERE id > $1
        ORDER BY id DESC
        LIMIT $2
      `;
      const values = [sinceId, limit];
      const result = await pool.query(query, values);
      return {
        success: true,
        data: result.rows
      };
    } catch (error) {
      console.error('Erro ao buscar mensagens desde ID:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Função para obter contagem de mensagens não impressas
  getUnreadMessagesCount: async () => {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM messages
        WHERE isprinted = false
      `;
      const result = await pool.query(query);
      return {
        success: true,
        count: parseInt(result.rows[0].count)
      };
    } catch (error) {
      console.error('Erro ao buscar contagem de mensagens não lidas:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Função para obter as últimas mensagens
  getLatestMessages: async (limit = 10) => {
    try {
      const query = `
        SELECT id, remetente_nome, destinatario_nome, created_at, isprinted
        FROM messages
        ORDER BY id DESC
        LIMIT $1
      `;
      const values = [limit];
      const result = await pool.query(query, values);
      return {
        success: true,
        data: result.rows
      };
    } catch (error) {
      console.error('Erro ao buscar últimas mensagens:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};




module.exports = {
  pool,
  testConnection,
  createTables,
  messageQueries
};