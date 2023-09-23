#!/usr/bin/env node

const AWS = require('aws-sdk');
const http = require('http');
const httpProxy = require('http-proxy');
const express = require('express');
const bodyParser = require('body-parser');
const stream = require('stream');
const basicAuth = require('express-basic-auth');
const compress = require('compression');
const os = require('os');
const figlet = require('figlet');

const yargs = require('yargs')
    .usage('usage: $0 [options] <aws-es-cluster-endpoint> or set ES_ENDPOINT environment variable ')
    .option('b', {
        alias: 'bind-address',
        default: process.env.BIND_ADDRESS || '127.0.0.1',
        demand: false,
        describe: 'the ip address to bind to',
        type: 'string',
    })
    .option('p', {
        alias: 'port',
        default: process.env.PORT || 9200,
        demand: false,
        describe: 'the port to bind to',
        type: 'number',
    })
    .option('r', {
        alias: 'region',
        default: process.env.AWS_REGION,
        demand: false,
        describe: 'the region of the Elasticsearch cluster',
        type: 'string',
    })
    .option('u', {
        alias: 'user',
        default: process.env.AUTH_USER || process.env.USER,
        demand: false,
        describe: 'the username to access the proxy',
    })
    .option('a', {
        alias: 'password',
        default: process.env.AUTH_PASSWORD || process.env.PASSWORD,
        demand: false,
        describe: 'the password to access the proxy',
    })
    .option('s', {
        alias: 'silent',
        default: false,
        demand: false,
        describe: 'remove figlet banner',
    })
    .option('H', {
        alias: 'health-path',
        default: process.env.HEALTH_PATH,
        demand: false,
        describe: 'URI path for health check',
        type: 'string',
    })
    .option('l', {
        alias: 'limit',
        default: process.env.LIMIT || '10000kb',
        demand: false,
        describe: 'request limit',
    })
    .help()
    .version()
    .strict();

const argv = yargs.argv;

const ES_ENDPOINT = process.env.ES_ENDPOINT || argv._[0];
const REGION = argv.r || process.env.AWS_REGION;

// Check if ES_ENDPOINT is provided
if (!ES_ENDPOINT) {
    console.error('Elasticsearch endpoint is required. Set ES_ENDPOINT or provide it as an argument.');
    yargs.showHelp();
    process.exit(1);
}

// Check if REGION is provided
if (!REGION) {
    console.error(
        'Region must be provided either through --region argument or AWS_REGION environment variable.'
    );
    yargs.showHelp();
    process.exit(1);
}

// Check if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are provided
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be provided as environment variables.');
    yargs.showHelp();
    process.exit(1);
}

// Check if AUTH_USER and AUTH_PASSWORD are provided together
if ((process.env.AUTH_USER && !process.env.AUTH_PASSWORD) || (!process.env.AUTH_USER && process.env.AUTH_PASSWORD)) {
    console.error('Both AUTH_USER and AUTH_PASSWORD must be provided or omitted together.');
    yargs.showHelp();
    process.exit(1);
}

// Check if PORT is a valid number
if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
    console.error('Invalid PORT number. Please provide a valid port number between 1 and 65535.');
    yargs.showHelp();
    process.exit(1);
}

// Check if LIMIT is a valid limit format
if (!/^\d+(\.\d+)?[kKmMgG]?[bB]?$/.test(REQ_LIMIT)) {
    console.error('Invalid request limit format. Please provide a valid limit (e.g., 10000kb).');
    yargs.showHelp();
    process.exit(1);
}

// Check if ENDPOINT starts with 'http://' or 'https://'
const TARGET = (ES_ENDPOINT.startsWith('http://') || ES_ENDPOINT.startsWith('https://'))
    ? ES_ENDPOINT
    : `https://${ES_ENDPOINT}`; // Assuming https by default if missing

const BIND_ADDRESS = argv.b;
const PORT = argv.p;
const REQ_LIMIT = argv.l;

const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN, // Only if you are using temporary session credentials
};

const options = {
    target: TARGET,
    changeOrigin: true,
    secure: true,
};

const proxy = httpProxy.createProxyServer(options);

const app = express();
app.use(compress());
app.use(bodyParser.raw({ limit: REQ_LIMIT, type: () => true }));

if (argv.H) {
    app.get(argv.H, (req, res) => {
        res.setHeader('Content-Type', 'text/plain');
        res.send('ok');
    });
}

if (argv.u && argv.a) {
    const users = {};
    const user = process.env.USER || process.env.AUTH_USER;
    const pass = process.env.PASSWORD || process.env.AUTH_PASSWORD;
    users[user] = pass;

    app.use(
        basicAuth({
            users: users,
            challenge: true,
        })
    );
}

app.use(async (req, res) => {
    let bufferStream;
    if (Buffer.isBuffer(req.body)) {
        bufferStream = new stream.PassThrough();
        await bufferStream.end(req.body);
    }
    proxy.web(req, res, { buffer: bufferStream });
});

proxy.on('proxyReq', (proxyReq, req) => {
    const endpoint = new AWS.Endpoint(ES_ENDPOINT);
    const request = new AWS.HttpRequest(endpoint);
    request.method = proxyReq.method;
    request.path = proxyReq.path;
    request.region = REGION;
    if (Buffer.isBuffer(req.body)) request.body = req.body;
    if (!request.headers) request.headers = {};
    request.headers['presigned-expires'] = false;
    request.headers['Host'] = endpoint.hostname;

    const signer = new AWS.Signers.V4(request, 'es');
    signer.addAuthorization(credentials, new Date());

    proxyReq.setHeader('Host', request.headers['Host']);
    proxyReq.setHeader('X-Amz-Date', request.headers['X-Amz-Date']);
    proxyReq.setHeader('Authorization', request.headers['Authorization']);
    if (request.headers['x-amz-security-token'])
        proxyReq.setHeader('x-amz-security-token', request.headers['x-amz-security-token']);
});

proxy.on('proxyRes', (proxyReq, req, res) => {
    if (req.url.match(/\.(css|js|img|font)/)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
    }
});

const server = http.createServer(app);

server.on('error', (error) => {
    console.error('Server error:', error);
    process.exit(1);
});

const listener = server.listen(PORT, BIND_ADDRESS, () => {
    if (!argv.s) {
        console.log(
            figlet.textSync('AWS ES Proxy!', {
                font: 'Speed',
                horizontalLayout: 'default',
                verticalLayout: 'default',
            })
        );
    }

    console.log(`AWS ES cluster available at http://${BIND_ADDRESS}:${PORT}`);
    console.log(`Kibana available at http://${BIND_ADDRESS}:${PORT}/_plugin/kibana/`);
    if (argv.H) {
        console.log(`Health endpoint enabled at http://${BIND_ADDRESS}:${PORT}${argv.H}`);
    }
});

process.on('SIGINT', () => {
    console.log('Received SIGINT. Exiting...');
    listener.close(() => {
        console.log('Server has closed. Exiting gracefully.');
        process.exit(0);
    });
});
