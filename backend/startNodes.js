const { spawn } = require('child_process');
const path = require('path');

const backendDir = __dirname;

const HOST = process.env.NODE_HOST || 'localhost';

const nodes = [
    {
        name: 'node-1',
        port: '5001',
        dataFile: 'node-data/node1.json',
        peers: []
    },
    {
        name: 'node-2',
        port: '5002',
        dataFile: 'node-data/node2.json',
        peers: [`http://${HOST}:5001`]
    },
    {
        name: 'node-3',
        port: '5003',
        dataFile: 'node-data/node3.json',
        peers: [`http://${HOST}:5001`, `http://${HOST}:5002`]
    }
];

const children = [];

const spawnNode = (config) => {
    const args = [
        path.join(backendDir, 'server.js'),
        `--port=${config.port}`,
        `--dataFile=${config.dataFile}`,
        `--name=${config.name}`
    ];

    if (config.peers && config.peers.length > 0) {
        args.push(`--peers=${config.peers.join(',')}`);
    }

    if (process.env.NODE_HOST) {
        args.push(`--host=${process.env.NODE_HOST}`);
    }

    if (process.env.NODE_BASE_URL) {
        args.push(`--baseUrl=${process.env.NODE_BASE_URL.replace(/\/$/, '')}`);
    }

    console.log(`🚀 Starting ${config.name} on port ${config.port}`);

    const child = spawn(process.execPath, args, {
        cwd: backendDir,
        stdio: 'inherit',
        env: { ...process.env }
    });

    child.on('exit', (code) => {
        console.log(`🛑 ${config.name} exited with code ${code}`);
    });

    children.push(child);
};

nodes.forEach(spawnNode);

const shutdown = () => {
    console.log('\n🛑 Stopping all nodes...');
    children.forEach(child => {
        if (!child.killed) {
            child.kill('SIGINT');
        }
    });
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

