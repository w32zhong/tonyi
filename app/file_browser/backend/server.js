/**
 * File Browser API Endpoints
 * --------------------------------------------------------------------------------
 * METHOD | API PATH                     | DESCRIPTION
 * --------------------------------------------------------------------------------
 * POST   | /api/upload                  | File uploads
 * GET    | /api/files                   | Directory listing with pagination
 * GET    | /api/locate                  | Locate a specific file and return its page
 * GET    | /api/file/content            | Download/view file content
 * PUT    | /api/file/content            | Atomic write/save file
 * --------------------------------------------------------------------------------
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const wopiRoutes = require('./wopi');

const PORT = process.env.PORT || 8971;
const PAGE_LIMIT = parseInt(process.env.PAGE_LIMIT) || 20;
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB) || 50;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const MAX_UPLOAD_STRING = `${MAX_UPLOAD_MB}mb`;
const STORAGE_DIR = path.resolve(process.env.ROOT || path.join(__dirname, 'storage'));

const app = express();
app.use(cors());
app.use(express.json());

// Ensure storage dir exists
fs.mkdir(STORAGE_DIR, { recursive: true }).catch(console.error);

// Hardened path resolver:
// - Rejects null bytes
// - Checks path boundary with separator (prevents /storage_evil bypass)
// - Resolves symlinks to prevent escape via symlink
const resolveSafePath = async (userPath) => {
    // Null byte sanitization
    if (userPath.includes('\0')) {
        throw new Error('Invalid path: null byte detected');
    }

    const safePath = path.resolve(STORAGE_DIR, userPath.replace(/^\//, ''));

    // Boundary check with separator to prevent off-by-one
    if (safePath !== STORAGE_DIR && !safePath.startsWith(STORAGE_DIR + path.sep)) {
        throw new Error('Invalid path');
    }

    // Resolve symlinks to check the real destination
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

// Add WOPI endpoints before other middleware so body parsing doesn't conflict
wopiRoutes(app, resolveSafePath, MAX_UPLOAD_STRING);

// File uploads: writes with .incomplete suffix, renames on success
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
            file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
            cb(null, file.originalname + '.incomplete');
        }
    }),
    limits: { fileSize: MAX_UPLOAD_BYTES }
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

// Dir listing with pagination and broken-file tolerance
app.get('/api/files', async (req, res) => {
    try {
        const dir = req.query.dir || '/';
        const targetPath = await resolveSafePath(dir);
        const page = parseInt(req.query.page) || 1;
        const limit = PAGE_LIMIT;
        const sortBy = req.query.sortBy || 'name'; // name, size, mtime
        const sortOrder = req.query.sortOrder || 'asc'; // asc, desc

        const entries = await fs.readdir(targetPath, { withFileTypes: true });
        
        // To sort by size or mtime, we need stats for all files in the directory
        const allItems = await Promise.allSettled(entries.map(async (f) => {
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

        let fileList = allItems
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value);

        // Sorting logic
        fileList.sort((a, b) => {
            // Always keep directories at the top
            if (a.isDir && !b.isDir) return -1;
            if (!a.isDir && b.isDir) return 1;

            let comparison = 0;
            if (sortBy === 'size') {
                comparison = a.size - b.size;
            } else if (sortBy === 'mtime') {
                comparison = new Date(a.mtime) - new Date(b.mtime);
            } else {
                comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            }

            return sortOrder === 'desc' ? -comparison : comparison;
        });

        const totalItems = fileList.length;
        const totalPages = Math.ceil(totalItems / limit) || 1;
        const startIndex = (page - 1) * limit;
        const pagedItems = fileList.slice(startIndex, startIndex + limit);

        res.json({
            items: pagedItems,
            pagination: { page, limit, totalItems, totalPages },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Cannot read directory' });
    }
});

// Locate a specific file and return the directory content on the correct page
app.get('/api/locate', async (req, res) => {
    try {
        const userPath = decodeURIComponent(req.query.path || '');
        if (!userPath) return res.status(400).json({ error: 'Path is required' });
        const sortBy = req.query.sortBy || 'name';
        const sortOrder = req.query.sortOrder || 'asc';

        const fullPath = await resolveSafePath(userPath);
        const stat = await fs.stat(fullPath);
        
        const isDir = stat.isDirectory();
        const dirPath = isDir ? userPath : path.dirname(userPath);
        const fileName = isDir ? null : path.basename(userPath);
        
        const targetDir = await resolveSafePath(dirPath);
        const entries = await fs.readdir(targetDir, { withFileTypes: true });
        
        const allItems = await Promise.allSettled(entries.map(async (f) => {
            const fPath = path.join(targetDir, f.name);
            const fStat = await fs.stat(fPath);
            return {
                name: f.name,
                isDir: f.isDirectory(),
                size: fStat.size,
                mtime: fStat.mtime,
                path: path.join(dirPath, f.name).replace(/\\/g, '/')
            };
        }));

        let fileList = allItems
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value);

        // Apply same sorting logic
        fileList.sort((a, b) => {
            if (a.isDir && !b.isDir) return -1;
            if (!a.isDir && b.isDir) return 1;
            let comparison = 0;
            if (sortBy === 'size') {
                comparison = a.size - b.size;
            } else if (sortBy === 'mtime') {
                comparison = new Date(a.mtime) - new Date(b.mtime);
            } else {
                comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            }
            return sortOrder === 'desc' ? -comparison : comparison;
        });

        const limit = PAGE_LIMIT;
        let page = 1;
        
        if (fileName) {
            const index = fileList.findIndex(e => e.name === fileName);
            if (index !== -1) {
                page = Math.floor(index / limit) + 1;
            }
        }

        const totalItems = fileList.length;
        const totalPages = Math.ceil(totalItems / limit) || 1;
        const startIndex = (page - 1) * limit;
        const pagedItems = fileList.slice(startIndex, startIndex + limit);

        const targetFile = fileList.find(f => f.name === fileName);

        res.json({
            dir: dirPath,
            file: targetFile,
            items: pagedItems,
            pagination: { page, limit, totalItems, totalPages }
        });
    } catch (err) {
        console.error(err);
        res.status(404).json({ error: 'File not found' });
    }
});

// Content-Disposition + nosniff + cache-control
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

// Atomic write: temp file then rename
app.put('/api/file/content', express.text({ type: '*/*', limit: MAX_UPLOAD_STRING }), async (req, res) => {
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
