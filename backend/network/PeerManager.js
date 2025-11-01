const { URL } = require('url');

if (typeof fetch === 'undefined') {
    throw new Error('Global fetch API không có sẵn. Vui lòng chạy Node.js v18 trở lên để hỗ trợ P2P.');
}

class PeerManager {
    constructor({ nodeId, baseUrl, blockchain, initialPeers = [] }) {
        if (!baseUrl) {
            throw new Error('PeerManager cần baseUrl để định danh node.');
        }

        this.nodeId = nodeId || 'node';
        this.baseUrl = this.normalizePeer(baseUrl);
        this.blockchain = blockchain;
        this.peers = new Set();

        initialPeers
            .map(peer => this.normalizePeer(peer))
            .filter(Boolean)
            .forEach(peer => this.addPeer(peer));
    }

    normalizePeer(peerUrl) {
        if (!peerUrl || typeof peerUrl !== 'string') return null;

        let url = peerUrl.trim();
        if (!url) return null;

        if (!/^https?:\/\//i.test(url)) {
            url = `http://${url}`;
        }

        try {
            const parsed = new URL(url);
            parsed.hash = '';
            parsed.search = '';
            let normalized = parsed.toString();
            if (normalized.endsWith('/')) {
                normalized = normalized.slice(0, -1);
            }
            return normalized;
        } catch (error) {
            console.warn(`⚠️ Không thể chuẩn hóa peer URL: ${peerUrl}`, error.message);
            return null;
        }
    }

    addPeer(peerUrl) {
        const normalized = this.normalizePeer(peerUrl);
        if (!normalized) return null;

        if (normalized === this.baseUrl) {
            return null;
        }

        if (this.peers.has(normalized)) {
            return null;
        }

        this.peers.add(normalized);
        console.log(`🤝 Thêm peer mới: ${normalized}`);
        return normalized;
    }

    getPeerList() {
        return Array.from(this.peers.values());
    }

    async connectToPeers() {
        const peers = this.getPeerList();
        for (const peer of peers) {
            await this.registerWithPeer(peer);
        }
    }

    async registerWithPeer(peer) {
        try {
            console.log(`🔗 Kết nối peer: ${peer}`);
            const response = await this.postJSON(`${peer}/p2p/peers`, {
                peer: this.baseUrl,
                nodeId: this.nodeId
            });

            if (response && Array.isArray(response.peers)) {
                response.peers.forEach(p => this.addPeer(p));
            }

            return response;
        } catch (error) {
            console.error(`❌ Không thể kết nối peer ${peer}:`, error.message);
            this.peers.delete(peer);
            return null;
        }
    }

    async broadcastBlock(block) {
        const peers = this.getPeerList();
        if (peers.length === 0) {
            console.log('ℹ️ Không có peer nào để broadcast block.');
            return;
        }

        console.log(`📡 Broadcast block #${block.index} tới ${peers.length} peers...`);
        await Promise.all(peers.map(async (peer) => {
            try {
                await this.postJSON(`${peer}/p2p/block`, {
                    block,
                    sender: this.baseUrl,
                    nodeId: this.nodeId
                });
            } catch (error) {
                console.error(`⚠️ Lỗi gửi block tới ${peer}:`, error.message);
            }
        }));
    }

    async requestChainFromPeer(peer) {
        try {
            const response = await this.getJSON(`${peer}/p2p/chain`);
            if (response && Array.isArray(response.chain)) {
                return response.chain;
            }
            return null;
        } catch (error) {
            console.error(`⚠️ Lỗi lấy chain từ ${peer}:`, error.message);
            return null;
        }
    }

    async syncWithPeers() {
        const peers = this.getPeerList();
        if (peers.length === 0) {
            return;
        }

        let bestChain = null;
        for (const peer of peers) {
            const chain = await this.requestChainFromPeer(peer);
            if (Array.isArray(chain)) {
                if (!bestChain || chain.length > bestChain.length) {
                    bestChain = chain;
                }
            }
        }

        if (bestChain && bestChain.length > this.blockchain.chain.length) {
            const result = this.blockchain.replaceChain(bestChain);
            if (result.success) {
                console.log('🧩 Đã đồng bộ blockchain từ peer dài hơn.');
            } else {
                console.warn('⚠️ Chuỗi dài hơn từ peer không hợp lệ hoặc không thể thay thế:', result.reason);
            }
        }
    }

    async postJSON(url, body) {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(8000)
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status} - ${text}`);
        }

        return response.json();
    }

    async getJSON(url) {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(8000)
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status} - ${text}`);
        }

        return response.json();
    }
}

module.exports = PeerManager;

