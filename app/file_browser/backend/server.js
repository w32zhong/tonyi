const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');
const wopiRoutes = require('./wopi');
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const STORAGE_DIR = path.join(__dirname, 'storage');

// Helper to ensure path is within STORAGE_DIR
const resolveSafePath = (userPath) => {
    const safePath = path.resolve(STORAGE_DIR, userPath.replace(/^\//, ''));
    if (!safePath.startsWith(STORAGE_DIR)) {
        throw new Error('Invalid path');
    }
    return safePath;
};

// Ensure storage dir exists
fs.mkdir(STORAGE_DIR, { recursive: true }).catch(console.error);

// Add WOPI endpoints before other middleware so body parsing doesn't conflict
wopiRoutes(app, STORAGE_DIR, resolveSafePath);

// File uploads configuration
const upload = multer({ 
    storage: multer.diskStorage({
        destination: async (req, file, cb) => {
            try {
                const dir = req.query.dir || '/';
                const targetPath = resolveSafePath(dir);
                cb(null, targetPath);
            } catch (err) {
                cb(err);
            }
        },
        filename: (req, file, cb) => {
            cb(null, file.originalname);
        }
    })
});

app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        res.status(200).json({ message: 'File uploaded successfully', file: req.file });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Upload failed' });
    }
});

app.get('/api/files', async (req, res) => {
    try {
        const dir = req.query.dir || '/';
        const targetPath = resolveSafePath(dir);
        
        const files = await fs.readdir(targetPath, { withFileTypes: true });
        
        const fileList = await Promise.all(files.map(async (f) => {
            const stat = await fs.stat(path.join(targetPath, f.name));
            return {
                name: f.name,
                isDir: f.isDirectory(),
                size: stat.size,
                mtime: stat.mtime,
                path: path.join(dir, f.name).replace(/\\/g, '/')
            };
        }));
        
        res.json(fileList);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Cannot read directory' });
    }
});

app.get('/api/file/content', (req, res) => {
    try {
        const filePath = req.query.path;
        if (!filePath) return res.status(400).json({ error: 'Path is required' });
        
        const targetPath = resolveSafePath(filePath);
        // Using res.sendFile to automatically support HTTP Range requests 
        // which are critical for videos and PDFs.
        res.sendFile(targetPath, (err) => {
            if (err) {
                console.error(err);
                if (!res.headersSent) res.status(404).json({ error: 'File not found' });
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Invalid path' });
    }
});

app.put('/api/file/content', express.text({ type: '*/*', limit: '50mb' }), async (req, res) => {
    try {
        const filePath = req.query.path;
        if (!filePath) return res.status(400).json({ error: 'Path is required' });
        
        const targetPath = resolveSafePath(filePath);
        await fs.writeFile(targetPath, req.body);
        res.status(200).json({ message: 'File saved successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save file' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Minimal Storage Backend running on http://0.0.0.0:${PORT}`);
});
