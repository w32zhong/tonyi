// Adding multer to server.js
const multer = require('multer');

// Configure multer
const upload = multer({ 
    storage: multer.diskStorage({
        destination: async (req, file, cb) => {
            try {
                const dir = req.query.dir || '/';
                const targetPath = resolveSafePath(dir);
                // Ensure directory exists
                await fs.mkdir(targetPath, { recursive: true });
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