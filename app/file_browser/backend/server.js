const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const wopiRoutes = require('./wopi');
const app = express();
const PORT = process.env.PORT || 8971;
const PAGE_LIMIT = parseInt(process.env.PAGE_LIMIT) || 20;

app.use(cors());
app.use(express.json());

// ROOT env var points to any local filesystem path; defaults to ./storage
const STORAGE_DIR = path.resolve(process.env.ROOT || path.join(__dirname, 'storage'));

// Hardened path resolver:
// 1. Rejects null bytes
// 2. Checks path boundary with separator (prevents /storage_evil bypass)
// 3. Resolves symlinks to prevent escape via symlink
const resolveSafePath = async (userPath) => {
    // [7] Null byte sanitization
    if (userPath.includes('\0')) {
        throw new Error('Invalid path: null byte detected');
    }

    const safePath = path.resolve(STORAGE_DIR, userPath.replace(/^\//, ''));

    // [2] Boundary check with separator to prevent off-by-one
    if (safePath !== STORAGE_DIR && !safePath.startsWith(STORAGE_DIR + path.sep)) {
        throw new Error('Invalid path');
    }

    // [1] Resolve symlinks to check the real destination
    try {
        const realPath = await fs.realpath(safePath);
        if (realPath !== STORAGE_DIR && !realPath.startsWith(STORAGE_DIR + path.sep)) {
            throw new Error('Invalid path: symlink escape detected');
        }
        return realPath;
    } catch (err) {
        // Path doesn't exist yet (e.g., new file write) — verify the parent
        if (err.code === 'ENOENT') {
            const parentDir = path.dirname(safePath);
            const realParent = await fs.realpath(parentDir);
            if (realParent !== STORAGE_DIR && !realParent.startsWith(STORAGE_DIR + path.sep)) {
                throw new Error('Invalid path: symlink escape detected');
            }
            return path.join(realParent, path.basename(safePath));
        }
        throw err;
    }
};

// Ensure storage dir exists
fs.mkdir(STORAGE_DIR, { recursive: true }).catch(console.error);

// Add WOPI endpoints before other middleware so body parsing doesn't conflict
wopiRoutes(app, resolveSafePath);

// [5] File uploads: writes with .incomplete suffix, renames on success
const upload = multer({
    storage: multer.diskStorage({
        destination: async (req, file, cb) => {
            try {
                const dir = req.query.dir || '/';
                const targetPath = await resolveSafePath(dir);
                cb(null, targetPath);
            } catch (err) {
                cb(err);
            }
        },
        filename: (req, file, cb) => {
            cb(null, file.originalname + '.incomplete');
        }
    }),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Rename from .incomplete to final name
        const incompletePath = req.file.path;
        const finalPath = incompletePath.replace(/\.incomplete$/, '');
        await fs.rename(incompletePath, finalPath);

        req.file.path = finalPath;
        req.file.filename = req.file.originalname;
        res.status(200).json({ message: 'File uploaded successfully', file: req.file });
    } catch (err) {
        console.error(err);
        if (req.file) {
            await fs.unlink(req.file.path).catch(() => {});
        }
        res.status(500).json({ error: 'Upload failed' });
    }
});

// [3] Dir listing with pagination and broken-file tolerance
app.get('/api/files', async (req, res) => {
    try {
        const dir = req.query.dir || '/';
        const targetPath = await resolveSafePath(dir);
        const page = parseInt(req.query.page) || 1;
        const limit = PAGE_LIMIT;

        const entries = await fs.readdir(targetPath, { withFileTypes: true });

        const totalItems = entries.length;
        const totalPages = Math.ceil(totalItems / limit) || 1;
        const startIndex = (page - 1) * limit;
        const pagedItems = entries.slice(startIndex, startIndex + limit);

        // Promise.allSettled: one broken symlink/deleted file won't crash the listing
        const results = await Promise.allSettled(pagedItems.map(async (f) => {
            const fullPath = path.join(targetPath, f.name);
            const stat = await fs.stat(fullPath);
            return {
                name: f.name,
                isDir: f.isDirectory(),
                size: stat.size,
                mtime: stat.mtime,
                path: path.join(dir, f.name).replace(/\\/g, '/')
            };
        }));

        const fileList = results
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value);

        res.json({
            items: fileList,
            pagination: { page, limit, totalItems, totalPages },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Cannot read directory' });
    }
});

// [6] Content-Disposition + nosniff + cache-control
app.get('/api/file/content', async (req, res) => {
    try {
        const filePath = req.query.path;
        if (!filePath) return res.status(400).json({ error: 'Path is required' });

        const targetPath = await resolveSafePath(filePath);
        const fileName = path.basename(targetPath);

        res.sendFile(targetPath, {
            headers: {
                'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'private, no-cache',
            }
        }, (err) => {
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

// [4] Atomic write: temp file then rename
app.put('/api/file/content', express.text({ type: '*/*', limit: '50mb' }), async (req, res) => {
    let tmpPath;
    try {
        const filePath = req.query.path;
        if (!filePath) return res.status(400).json({ error: 'Path is required' });

        const targetPath = await resolveSafePath(filePath);

        tmpPath = targetPath + '.tmp.' + crypto.randomBytes(6).toString('hex');
        await fs.writeFile(tmpPath, req.body);
        await fs.rename(tmpPath, targetPath);

        res.status(200).json({ message: 'File saved successfully' });
    } catch (err) {
        console.error(err);
        if (tmpPath) await fs.unlink(tmpPath).catch(() => {});
        res.status(500).json({ error: 'Failed to save file' });
    }
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Minimal Storage Backend running on http://0.0.0.0:${PORT}`);
});

server.on('error', (err) => {
    console.error('Server error event:', err);
});
