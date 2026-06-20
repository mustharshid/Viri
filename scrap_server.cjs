const http = require('http');
const fs = require('fs');
const path = require('path');

const scrapDir = path.join(__dirname, 'scrap');
if (!fs.existsSync(scrapDir)) {
    fs.mkdirSync(scrapDir);
}

const server = http.createServer((req, res) => {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Step-Name');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/save') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            const stepName = req.headers['x-step-name'] || 'unknown_step';
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${timestamp}_${stepName}.html`;
            const filepath = path.join(scrapDir, filename);
            fs.writeFileSync(filepath, body);
            console.log(`Saved: ${filename}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(9999, () => {
    console.log('Scrap server running on http://localhost:9999');
});
