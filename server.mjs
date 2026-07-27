import express from 'express';
import nunjucks from 'nunjucks';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import fs from 'fs';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const INNERTUBE_BASE = "http://localhost:5000";

// --- Nunjucks setup (Jinja2 equivalent) ---
nunjucks.configure('templates', {
    autoescape: true,
    express: app,
    watch: true
});
app.set('view engine', 'html');

// --- Static files ---
app.use('/static', express.static(path.join(__dirname, 'templates/static')));
app.use('/photo', express.static(path.join(__dirname, 'photo')));

// --- Helper: Static Version ---
function getStaticVer() {
    try {
        const h = crypto.createHash('md5');
        const files = [];
        const walk = (dir) => {
            fs.readdirSync(dir).forEach(f => {
                const p = path.join(dir, f);
                if (fs.statSync(p).isDirectory()) walk(p);
                else if (f.endsWith('.js') || f.endsWith('.css')) files.push(p);
            });
        };
        walk(path.join(__dirname, 'templates/static'));
        files.sort().forEach(f => h.update(fs.readFileSync(f)));
        return h.digest('hex').substring(0, 8);
    } catch (e) {
        return Date.now().toString();
    }
}
const STATIC_VER = getStaticVer();
app.locals.static_ver = STATIC_VER;

// --- Invidious Proxy Logic ---
const INVIDIOUS_BASE = "https://raw.githubusercontent.com/kuru-bana/yt-data/main/invidious";
const VIDEO_BACK_URL = "https://raw.githubusercontent.com/kuru-bana/yt-data/refs/heads/main/api/video-back.json";
let categoryCache = {};
const CACHE_TTL = 5 * 60 * 1000;

async function getInstances(category) {
    const now = Date.now();
    if (categoryCache[category] && now - categoryCache[category].time < CACHE_TTL) {
        return categoryCache[category].instances;
    }
    try {
        const resp = await axios.get(`${INVIDIOUS_BASE}/${category}.json`);
        const instances = resp.data.working_instances || [];
        categoryCache[category] = { instances, time: now };
        return instances;
    } catch (e) {
        return categoryCache[category] ? categoryCache[category].instances : [];
    }
}

async function getVideoBackInstances() {
    const key = "__video_back__";
    const now = Date.now();
    if (categoryCache[key] && now - categoryCache[key].time < CACHE_TTL) {
        return categoryCache[key].instances;
    }
    try {
        const resp = await axios.get(VIDEO_BACK_URL);
        const instances = resp.data || [];
        categoryCache[key] = { instances, time: now };
        return instances;
    } catch (e) {
        return categoryCache[key] ? categoryCache[key].instances : [];
    }
}

function mapPath(appPath) {
    let m;
    m = appPath.match(/^\/api\/trending\/(music|gaming|news|movies)([?].*)?$/i);
    if (m) {
        const typeName = m[1].toLowerCase();
        const qsPart = m[2] || "";
        const typeMap = { music: "Music", gaming: "Gaming", news: "News", movies: "Movies" };
        const invidiousPath = `/api/v1/trending${qsPart}${qsPart ? '&' : '?'}type=${typeMap[typeName]}`;
        return { category: `trending_${typeName}`, invidiousPath };
    }
    m = appPath.match(/^\/api\/stream\/([^?]+)(.*)/);
    if (m) return { category: "video", invidiousPath: `/api/v1/videos/${m[1]}${m[2]}` };

    if (appPath.startsWith("/api/search/suggestions")) {
        return { category: "search_suggestions", invidiousPath: "/api/v1/search/suggestions" + appPath.substring("/api/search/suggestions".length) };
    }

    m = appPath.match(/^\/api\/channels\/([^/?]+)\/(videos|shorts|streams|latest|playlists|comments|search)(.*)/);
    if (m) return { category: `channel_${m[2]}`, invidiousPath: `/api/v1/channels/${m[1]}/${m[2]}${m[3]}` };

    const prefixMap = [
        ["/api/trending", "trending"],
        ["/api/search", "search"],
        ["/api/channels", "channel"],
        ["/api/videos", "video"],
        ["/api/playlists", "playlist"],
        ["/api/mixes", "mix"],
        ["/api/hashtag", "hashtag"],
        ["/api/comments", "comments"],
        ["/api/transcripts", "transcripts"],
        ["/api/captions", "captions"]
    ];
    for (const [prefix, cat] of prefixMap) {
        if (appPath.startsWith(prefix)) return { category: cat, invidiousPath: "/api/v1" + appPath.substring(4) };
    }
    return { category: "video", invidiousPath: "/api/v1" + appPath.substring(4) };
}

async function proxyParallel(category, invidiousPath, overrideInstances = null) {
    const instances = overrideInstances || await getInstances(category);
    if (!instances.length) throw new Error(`No instances for ${category}`);
    
    const errors = [];
    // Try instances in parallel, return the first one that succeeds
    const tasks = instances.map(async (base) => {
        try {
            const resp = await axios.get(base + invidiousPath, { timeout: 10000 });
            return resp.data;
        } catch (e) {
            errors.push(`${base}: ${e.message}`);
            throw e;
        }
    });

    try {
        return await Promise.any(tasks);
    } catch (e) {
        throw new Error(`All instances failed: ${errors.join(', ')}`);
    }
}

// --- Page Routes ---
app.get('/', (req, res) => res.render('index.html'));
app.get('/trending', (req, res) => res.render('trending.html', { active: 'trending' }));
app.get('/dl', (req, res) => res.render('dl.html', { active: 'dl' }));
app.get('/watch', (req, res) => res.render('watch.html'));
app.get('/shorts/:id', (req, res) => res.render('shorts.html'));
app.get('/search', (req, res) => res.render('search.html'));
app.get('/channel', (req, res) => res.render('channel.html'));
app.get('/playlist', (req, res) => res.render('playlist.html'));
app.get('/hashtag', (req, res) => res.render('hashtag.html'));
app.get('/mix', (req, res) => res.render('mix.html'));
app.get('/library', (req, res) => res.render('library.html', { active: 'library' }));
app.get('/settings', (req, res) => res.render('settings.html', { active: 'settings' }));
app.get('/links', (req, res) => res.render('links.html'));
app.get('/version', (req, res) => res.json({ ver: "1.27-node" }));
app.get('/whats', (req, res) => res.json({ name: "choco-tube-plus-node" }));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'templates/chat-page.html')));
app.get('/chat-raw', (req, res) => res.sendFile(path.join(__dirname, 'templates/chat.html')));

// --- API Proxy Routes ---
app.get('/proxy/main/*', async (req, res) => {
    try {
        const fullPath = req.originalUrl.substring("/proxy/main".length);
        const { category, invidiousPath } = mapPath(fullPath);
        const data = await proxyParallel(category, invidiousPath);
        res.json(data);
    } catch (e) {
        res.status(502).json({ error: e.message });
    }
});

app.get('/proxy/stream/*', async (req, res) => {
    try {
        const fullPath = req.originalUrl.substring("/proxy/stream".length);
        const { invidiousPath } = mapPath(fullPath);
        const instances = await getVideoBackInstances();
        const data = await proxyParallel("video", invidiousPath, instances);
        res.json(data);
    } catch (e) {
        res.status(502).json({ error: e.message });
    }
});

app.get('/api/search/suggestions', async (req, res) => {
    try {
        const { q } = req.query;
        const instances = await getInstances("search_suggestions");
        const data = await proxyParallel("search_suggestions", `/api/v1/search/suggestions?q=${encodeURIComponent(q)}`, instances);
        res.json(data);
    } catch (e) {
        res.status(502).json({ error: e.message });
    }
});

app.get('/choco-chat-new', async (req, res) => {
    try {
        const resp = await axios.get("https://raw.githubusercontent.com/kuru-bana/choco-chat-tool/refs/heads/main/url.json");
        res.json(resp.data);
    } catch (e) {
        res.status(502).json({ error: e.message });
    }
});

// --- Other API Endpoints (from routers/api.py) ---
app.get('/api/transcript-langs/:id', async (req, res) => {
    // Basic fallback for transcript langs
    res.status(502).json({ error: "Node.js transcript fallback not fully implemented, please use HQ mode." });
});

// --- SPA Fallback (Wista) ---
app.get('*', (req, res) => {
    const p = req.path;
    if (p.startsWith('/__replco') || p.startsWith('/@') || p.includes('node_modules') || 
        ['.js', '.ts', '.tsx', '.jsx', '.map'].some(ext => p.endsWith(ext))) {
        return res.status(404).end();
    }
    res.sendFile(path.join(__dirname, 'templates/tool/youtube/wista.html'));
});

app.listen(PORT, () => {
    console.log(`Node.js Unified Server running on http://localhost:${PORT}`);
});
