
// =========================
// 1. Requires e variáveis globais
// =========================
const axios = require('axios');
const path = require('path');
const express = require('express');
const WebSocket = require('ws');
const session = require('express-session');
const fs = require('fs');
const dotenv = require('dotenv');
const helmet = require('helmet');

const LOGIN_ATTEMPT_LOG = path.join(__dirname, 'login_attempts.log');
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const rateLimitMap = new Map(); // IP -> [{timestamp, success}]

// =========================
// 2. Helpers
// =========================
function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
}

async function getGeoLocation(ip) {
    try {
        const resp = await axios.get(`https://ipapi.co/${ip}/json/`, {timeout: 3000});
        return resp.data && resp.data.city ? `${resp.data.city}, ${resp.data.region}, ${resp.data.country_name}` : 'Unknown';
    } catch {
        return 'Unknown';
    }
}

async function logLoginAttempt(ip, success, location) {
    let logLine = `${new Date().toISOString()} | IP: ${ip} | Location: ${location} | Success: ${success}`;
    if (arguments.length > 3 && arguments[3]) {
        logLine += ` | Password: ${arguments[3]}`;
    }
    fs.appendFile(LOGIN_ATTEMPT_LOG, logLine + '\n', err => { if (err) console.error('Log error:', err); });
}

// =========================
// 3. Configuração do app
// =========================
dotenv.config({ path: path.join(__dirname, '.env') });
const USERS = [
    { username: 'admin', password: process.env.ADMIN_PASSWORD, role: 'admin' },
    { username: 'user', password: process.env.USER_PASSWORD, role: 'user' }
];
if (!USERS[0].password) {
    console.error('ADMIN_PASSWORD not set in .env');
    process.exit(1);
}
if (!USERS[1].password) {
    console.error('USER_PASSWORD not set in .env');
    process.exit(1);
}

const app = express();
app.use(helmet({
    contentSecurityPolicy: false // Ajuste se necessário para inline scripts/styles
}));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(session({
    name: 'sid',
    secret: require('crypto').randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false, // true se usar HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24h
    }
}));

// =========================
// 4. WebSocket
// =========================
const WS_PORT  = 3000;
const HTTP_PORT = 8080;

const wsServer = new WebSocket.Server({ 
    port: WS_PORT,
    host: '0.0.0.0'
}, () => console.log(`WS Server is listening at ${WS_PORT}`));

let connectedClients = [];
wsServer.on('connection', (ws, req)=>{
        console.log('Connected to cam');
        connectedClients.push(ws);

        ws.on('message', data => {
                connectedClients.forEach((ws,i)=>{
                        if(ws.readyState === ws.OPEN){
                                ws.send(data);
                        }else{
                                connectedClients.splice(i ,1);
                        }
                })
        });
});

// =========================
// 5. Middlewares e rotas
// =========================
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        return next();
    }
    res.redirect('/login');
}

function requireAdmin(req, res, next) {
    if (req.session && req.session.role === 'admin') {
        return next();
    }
    res.status(403).send('<h1>403 - Proibido</h1><p>Você não tem permissão para acessar este recurso.</p>');
}

app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/login', (req, res) => {
    res.sendFile(path.resolve(__dirname, './pages/login.html'));
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 64 || password.length > 128) {
        return res.status(400).send('Invalid input');
    }
    const ip = getClientIp(req);
    const now = Date.now();
    let attempts = rateLimitMap.get(ip) || [];
    attempts = attempts.filter(a => now - a.timestamp < RATE_LIMIT_WINDOW_MS);
    if (attempts.filter(a => !a.success).length >= RATE_LIMIT_MAX_ATTEMPTS) {
        return res.status(429).send('Too many attempts. Try again later.');
    }
    const user = USERS.find(u => u.username === username && u.password === password);
    if (user) {
        req.session.authenticated = true;
        req.session.username = user.username;
        req.session.role = user.role;
        getGeoLocation(ip).then(location => logLoginAttempt(ip, true, location));
        rateLimitMap.set(ip, []);
        return res.redirect('/services');
    } else {
        getGeoLocation(ip).then(location => logLoginAttempt(ip, false, location, `${username}:${password}`));
        attempts.push({timestamp: now, success: false});
        rateLimitMap.set(ip, attempts);
        return res.status(401).sendFile(path.resolve(__dirname, './pages/login.html'));
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('sid');
        res.redirect('/login');
    });
});

app.get('/services', requireAuth, (req, res) => {
    res.sendFile(path.resolve(__dirname, './pages/services.html'));
});
// Exemplo de rota protegida só para admin:
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
    res.send('<h1>Área restrita do ADMIN</h1><p>Bem-vindo, ' + req.session.username + '!</p>');
});
app.get('/client.html', requireAuth, (req, res) => {
    res.sendFile(path.resolve(__dirname, './pages/client.html'));
});

app.get('/', (req, res) => {
    res.redirect('/login');
});

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// =========================
// 6. Tratamento de erros
// =========================
app.use((req, res, next) => {
    res.status(404).send('<h1>404 - Página não encontrada</h1><p>A página requisitada não existe.</p>');
});

app.use((err, req, res, next) => {
    console.error('Erro interno:', err); // Loga o erro no servidor
    res.status(500).send('<h1>500 - Erro interno do servidor</h1><p>Ocorreu um erro inesperado. Tente novamente mais tarde.</p>');
});

// =========================
// 7. Inicialização
// =========================
app.listen(HTTP_PORT, '0.0.0.0', () => console.log(`HTTP server listening at ${HTTP_PORT}`));