const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

module.exports = function(app, STORAGE_DIR, resolveSafePath) {
    // 1. CheckFileInfo
    app.get('/wopi/files/:id', async (req, res) => {
        try {
            const filePath = Buffer.from(req.params.id, 'base64').toString('utf8');
            const targetPath = resolveSafePath(filePath);
            
            const stat = await fs.stat(targetPath);
            const fileName = path.basename(targetPath);
            
            // Generate a dummy SHA256 of the file as an identifier
            // For a simple mock, we just use the mtime
            const version = stat.mtimeMs.toString();
            
            const wopiInfo = {
                BaseFileName: fileName,
                OwnerId: "user1",
                Size: stat.size,
                UserId: "user1",
                Version: version,
                UserFriendlyName: "Test User",
                UserCanWrite: true,
                SupportsUpdate: true,
                SupportsLocks: true,
            };
            
            res.json(wopiInfo);
        } catch (err) {
            console.error(err);
            res.status(404).json({ error: 'File not found' });
        }
    });

    // 2. GetFile
    app.get('/wopi/files/:id/contents', (req, res) => {
        try {
            const filePath = Buffer.from(req.params.id, 'base64').toString('utf8');
            const targetPath = resolveSafePath(filePath);
            res.sendFile(targetPath);
        } catch (err) {
            console.error(err);
            res.status(404).json({ error: 'File not found' });
        }
    });

    // 3. PutFile
    // Use raw parser because the body will be binary data
    app.post('/wopi/files/:id/contents', express.raw({ type: '*/*', limit: '50mb' }), async (req, res) => {
        try {
            const filePath = Buffer.from(req.params.id, 'base64').toString('utf8');
            const targetPath = resolveSafePath(filePath);
            
            // Write the new content to disk
            await fs.writeFile(targetPath, req.body);
            
            res.status(200).send('OK');
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to save file' });
        }
    });
};
