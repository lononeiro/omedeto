require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const {
  testConnection,
  messageQueries
} = require('./database');

const app = express();

// Substitua sua configuração atual do CORS por esta:

// Configuração CORS atualizada
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : ['http://localhost:5501', 'http://127.0.0.1:5500', 'http://localhost:3001', 'https://omedeto-front-end.onrender.com'];

// Middleware CORS mais permissivo para desenvolvimento
app.use(cors({
  origin: function (origin, callback) {
    // Permite requisições sem origem (como mobile apps ou curl)
    if (!origin) {
      return callback(null, true);
    }

    // Verifica se a origem está na lista de permitidas
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Log para debug
      console.log('CORS bloqueado para origem:', origin);
      console.log('Origens permitidas:', allowedOrigins);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Length', 'X-Kuma-Revision'],
  preflightContinue: false,
  optionsSuccessStatus: 200
}));

// Adicione este middleware APÓS o CORS e ANTES das rotas
app.options('*', cors()); // Habilita preflight para todas as rotas
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware para logs
app.use((req, res, next) => {
  console.log(`${new Date().toLocaleString()} - ${req.method} ${req.url}`);
  next();
});

// Middleware de autenticação JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Token não fornecido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};

// ========== ROTAS PÚBLICAS ==========

// Rota de teste
app.get('/api/health', async (req, res) => {
  try {
    const dbStatus = await testConnection();

    res.json({
      success: true,
      service: 'RH Backend API',
      status: 'online',
      database: dbStatus ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rota de login (sem banco de dados)
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email e senha são obrigatórios'
      });
    }

    // Verificar credenciais do .env
    const adminEmail = process.env.ADMIN_EMAIL || 'rh.admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'wMb~IVrfnM*%"ç';

    if (email !== adminEmail || password !== adminPassword) {
      return res.status(401).json({
        success: false,
        error: 'Credenciais inválidas'
      });
    }

    // Gerar token JWT
    const token = jwt.sign(
      {
        email: email,
        role: 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      token,
      user: {
        email: email,
        role: 'admin'
      }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno no servidor'
    });
  }
});

// Rota para verificar token
app.get('/api/verify-token', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// ========== ROTAS PROTEGIDAS (MENSAGENS) ==========

// Rota para salvar nova mensagem
app.post('/api/messages', authenticateToken, async (req, res) => {
  try {
    const messageData = req.body;

    // Validação básica
    if (!messageData.remetente_nome || !messageData.destinatario_nome || !messageData.mensagem) {
      return res.status(400).json({
        success: false,
        error: 'Campos obrigatórios faltando'
      });
    }

    const result = await messageQueries.saveMessage(messageData);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.status(201).json({
      success: true,
      message: 'Mensagem salva com sucesso',
      data: result.data
    });

  } catch (error) {
    console.error('Erro ao salvar mensagem:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao salvar mensagem'
    });
  }
});

// Rota para obter todas as mensagens
// No seu server.js, altere estas rotas para não exigir autenticação:

// Rota para obter todas as mensagens (SEM autenticação - frontend já protege)
app.get('/api/messages', async (req, res) => {  // REMOVA authenticateToken
  try {
    const result = await messageQueries.getAllMessages();

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      count: result.data.length,
      data: result.data
    });

  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar mensagens'
    });
  }
});

// Rota para obter estatísticas (SEM autenticação)
app.get('/api/stats', async (req, res) => {  // REMOVA authenticateToken
  try {
    const result = await messageQueries.getStats();

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      data: result.data
    });

  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar estatísticas'
    });
  }
});

// Rota para excluir uma mensagem
app.delete('/api/messages/:id', authenticateToken, async (req, res) => {
  try {
    const messageId = req.params.id;

    const result = await messageQueries.deleteMessage(messageId);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: 'Mensagem excluída com sucesso',
      data: result.data
    });

  } catch (error) {
    console.error('Erro ao excluir mensagem:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao excluir mensagem'
    });
  }
});

// Rota para excluir todas as mensagens
app.delete('/api/messages', authenticateToken, async (req, res) => {
  try {
    const result = await messageQueries.deleteAllMessages();

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: `${result.count} mensagens excluídas com sucesso`,
      count: result.count
    });

  } catch (error) {
    console.error('Erro ao excluir todas as mensagens:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao excluir todas as mensagens'
    });
  }
});


app.put('/api/messages/:id', authenticateToken, async (req, res) => {
  try {
    const messageId = req.params.id;
    const messageData = req.body;

    const result = await messageQueries.updateMessage(messageId, messageData);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: 'Mensagem atualizada com sucesso',
      data: result.data
    });

  } catch (error) {
    console.error('Erro ao atualizar mensagem:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao atualizar mensagem'
    });
  }
});



// Servir arquivos estáticos (opcional)
app.use(express.static('public'));

// Rota para página inicial
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Sistema RH - Backend</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .container { max-width: 800px; margin: 0 auto; }
        .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
        .online { background: #d4edda; color: #155724; }
        .offline { background: #f8d7da; color: #721c24; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🚀 Sistema RH - Backend API</h1>
        <p>API REST para gerenciamento de mensagens de reconhecimento</p>
        
        <div id="status" class="status"></div>
        
        <h3>Endpoints disponíveis:</h3>
        <ul>
          <li><code>POST /api/login</code> - Autenticação (rh.admin / senha do .env)</li>
          <li><code>GET /api/messages</code> - Listar mensagens (requer autenticação)</li>
          <li><code>POST /api/messages</code> - Criar mensagem (requer autenticação)</li>
          <li><code>GET /api/stats</code> - Estatísticas (requer autenticação)</li>
          <li><code>GET /api/health</code> - Status do servidor</li>
          <li><code>GET /api/messages/new</code> - Novas mensagens desde ID (para notificações)</li>
        </ul>
        
        <p><strong>Usuário padrão:</strong> ${process.env.ADMIN_EMAIL || 'rh.admin'}</p>
      </div>
      
      <script>
        fetch('/api/health')
          .then(response => response.json())
          .then(data => {
            const statusDiv = document.getElementById('status');
            if (data.success) {
              statusDiv.className = 'status online';
              statusDiv.innerHTML = \`
                ✅ Servidor online | 
                Banco de dados: \${data.database} | 
                Ambiente: \${data.environment}
              \`;
            } else {
              statusDiv.className = 'status offline';
              statusDiv.textContent = '❌ Servidor offline';
            }
          })
          .catch(error => {
            document.getElementById('status').className = 'status offline';
            document.getElementById('status').textContent = '❌ Erro ao conectar ao servidor';
          });
      </script>
    </body>
    </html>
  `);
});


// Rota PÚBLICA para enviar mensagens (sem autenticação)
app.post('/api/messages/public', async (req, res) => {
  try {
    const messageData = req.body;

    // Validação básica
    if (!messageData.remetente_nome || !messageData.destinatario_nome || !messageData.mensagem) {
      return res.status(400).json({
        success: false,
        error: 'Campos obrigatórios faltando'
      });
    }

    const result = await messageQueries.saveMessage(messageData);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.status(201).json({
      success: true,
      message: 'Mensagem salva com sucesso',
      data: result.data
    });

  } catch (error) {
    console.error('Erro ao salvar mensagem (pública):', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao salvar mensagem'
    });
  }
});

// server.js (adicionar estas rotas)

// Rota para marcar mensagem como impressa
app.put('/api/messages/:id/printed', authenticateToken, async (req, res) => {
  try {
    const messageId = req.params.id;

    const result = await messageQueries.markAsPrinted(messageId);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      message: 'Mensagem marcada como impressa',
      data: result.data
    });

  } catch (error) {
    console.error('Erro ao marcar mensagem como impressa:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao marcar mensagem como impressa'
    });
  }
});

// Rota para obter mensagens ordenadas (não impressas primeiro)
app.get('/api/messages/ordered', authenticateToken, async (req, res) => {
  try {
    const result = await messageQueries.getMessagesOrdered();

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      count: result.data.length,
      data: result.data
    });

  } catch (error) {
    console.error('Erro ao buscar mensagens ordenadas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar mensagens ordenadas'
    });
  }
});

// ========== NOVAS ROTAS PARA NOTIFICAÇÕES ==========

// Rota para obter novas mensagens desde um determinado ID
app.get('/api/messages/new', authenticateToken, async (req, res) => {
  try {
    const sinceId = req.query.since_id || 0;
    const limit = req.query.limit || 50;

    const result = await messageQueries.getMessagesSinceId(sinceId, limit);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      count: result.data.length,
      data: result.data
    });

  } catch (error) {
    console.error('Erro ao buscar novas mensagens:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar novas mensagens'
    });
  }
});

// Rota para obter contagem de mensagens não impressas (para notificações)
app.get('/api/messages/unread-count', authenticateToken, async (req, res) => {
  try {
    const result = await messageQueries.getUnreadMessagesCount();

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      count: result.count
    });

  } catch (error) {
    console.error('Erro ao buscar contagem de mensagens não lidas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar contagem de mensagens não lidas'
    });
  }
});

// Rota para obter última mensagem
app.get('/api/messages/latest', authenticateToken, async (req, res) => {
  try {
    const result = await messageQueries.getLatestMessages();

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      count: result.data.length,
      data: result.data
    });

  } catch (error) {
    console.error('Erro ao buscar últimas mensagens:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar últimas mensagens'
    });
  }
});

// Inicializar servidor
const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // Testar conexão com o banco
    const dbConnected = await testConnection();

    if (!dbConnected) {
      console.error('❌ Não foi possível conectar ao banco de dados');
      console.log('⚠️  O sistema funcionará sem banco de dados (modo fallback)');
    }

    app.listen(PORT, () => {
      console.log(`
  ===========================================
  🚀 Sistema RH Backend iniciado com sucesso!
  
  📍 URL: http://localhost:${PORT}
  🌐 Ambiente: ${process.env.NODE_ENV || 'development'}
  🗄️  Banco de dados: ${dbConnected ? '✅ Conectado' : '❌ Desconectado'}
  
  🔐 Credenciais admin:
  👤 Usuário: ${process.env.ADMIN_EMAIL || 'rh.admin'}
  🔑 Senha: ${process.env.ADMIN_PASSWORD ? '***' : 'não configurada'}
  
  📚 Endpoints:
  🔗 http://localhost:${PORT}/api/health
  🔗 http://localhost:${PORT}/api/login
  🔗 http://localhost:${PORT}/api/messages/new (notificações)
  ===========================================
      `);
    });

  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

startServer();