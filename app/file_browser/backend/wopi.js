const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

// In-memory lock store: fileId -> { lockId, timestamp }
const locks = new Map();

module.exports = function(app, resolveSafePath, maxUploadString = '50mb') {
    // 1. CheckFileInfo
    app.get('/wopi/files/:id', async (req, res) => {
        try {
            const filePath = Buffer.from(req.params.id, 'base64').toString('utf8');
            const targetPath = await resolveSafePath(filePath);

            const stat = await fs.stat(targetPath);
            const fileName = path.basename(targetPath);
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

    // 2. Lock/Unlock/RefreshLock operations
    // Collabora sends POST /wopi/files/:id with X-WOPI-Override header
    // to LOCK, UNLOCK, REFRESH_LOCK, or GET_LOCK before saving.
    app.post('/wopi/files/:id', express.raw({ type: '*/*', limit: maxUploadString }), (req, res) => {
        const fileId = req.params.id;
        const override = (req.headers['x-wopi-override'] || '').toUpperCase();
        const requestLock = req.headers['x-wopi-lock'] || '';
        const oldLock = req.headers['x-wopi-oldlock'] || '';

        const currentLock = locks.get(fileId);

        switch (override) {
            case 'LOCK': {
                if (oldLock) {
                    // This is an UNLOCK_AND_RELOCK operation
                    if (currentLock && currentLock.lockId !== oldLock) {
                        res.set('X-WOPI-Lock', currentLock.lockId);
                        return res.status(409).json({ error: 'Lock mismatch' });
                    }
                    locks.set(fileId, { lockId: requestLock, timestamp: Date.now() });
                    return res.status(200).json({});
                }

                if (currentLock && currentLock.lockId !== requestLock) {
                    // Conflict: already locked with a different lock
                    res.set('X-WOPI-Lock', currentLock.lockId);
                    return res.status(409).json({ error: 'Lock mismatch' });
                }
                // Grant the lock (or re-lock with same ID)
                locks.set(fileId, { lockId: requestLock, timestamp: Date.now() });
                return res.status(200).json({});
            }

            case 'GET_LOCK': {
                res.set('X-WOPI-Lock', currentLock ? currentLock.lockId : '');
                return res.status(200).json({});
            }

            case 'REFRESH_LOCK': {
                if (!currentLock || currentLock.lockId !== requestLock) {
                    res.set('X-WOPI-Lock', currentLock ? currentLock.lockId : '');
                    return res.status(409).json({ error: 'Lock mismatch' });
                }
                currentLock.timestamp = Date.now();
                return res.status(200).json({});
            }

            case 'UNLOCK': {
                if (!currentLock || currentLock.lockId !== requestLock) {
                    res.set('X-WOPI-Lock', currentLock ? currentLock.lockId : '');
                    return res.status(409).json({ error: 'Lock mismatch' });
                }
                locks.delete(fileId);
                return res.status(200).json({});
            }

            default:
                return res.status(400).json({ error: `Unknown X-WOPI-Override: ${override}` });
        }
    });

    // 3. GetFile
    app.get('/wopi/files/:id/contents', async (req, res) => {
        try {
            const filePath = Buffer.from(req.params.id, 'base64').toString('utf8');
            const targetPath = await resolveSafePath(filePath);
            res.sendFile(targetPath);
        } catch (err) {
            console.error(err);
            res.status(404).json({ error: 'File not found' });
        }
    });

    // 4. PutFile — atomic write
    app.post('/wopi/files/:id/contents', express.raw({ type: '*/*', limit: maxUploadString }), async (req, res) => {
        let tmpPath;
        try {
            const filePath = Buffer.from(req.params.id, 'base64').toString('utf8');
            const targetPath = await resolveSafePath(filePath);

            // Atomic write: temp file then rename
            tmpPath = targetPath + '.tmp.' + crypto.randomBytes(6).toString('hex');
            await fs.writeFile(tmpPath, req.body);
            await fs.rename(tmpPath, targetPath);

            // Return the updated file info as required by the WOPI spec
            const stat = await fs.stat(targetPath);
            res.status(200).json({
                LastModifiedTime: stat.mtime.toISOString(),
            });
        } catch (err) {
            console.error(err);
            if (tmpPath) await fs.unlink(tmpPath).catch(() => {});
            res.status(500).json({ error: 'Failed to save file' });
        }
    });
};
