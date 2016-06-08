#!/usr/bin/env node

var AWS = require('aws-sdk');
var http = require('http');
var httpProxy = require('http-proxy');
var express = require('express');
var bodyParser = require('body-parser');
var stream = require('stream');
var figlet = require('figlet');
var compress = require('compression');

var yargs = require('yargs')
    .usage('usage: $0 [options] <aws-es-cluster-endpoint>')
    .option('b', {
        alias: 'bind-address',
        default: '127.0.0.1',
        demand: false,
        describe: 'the ip address to bind to',
        type: 'string'
    })
    .option('p', {
        alias: 'port',
        default: 9200,
        demand: false,
        describe: 'the port to bind to',
        type: 'number'
    })
    .option('r', {
        alias: 'region',
        demand: false,
        describe: 'the region of the Elasticsearch cluster',
        type: 'string'
    })
    .help()
    .version()
    .strict();
var argv = yargs.argv;

if (argv._.length !== 1) {
    yargs.showHelp();
    process.exit(1);
}

var ENDPOINT = argv._[0];

// Try to infer the region if it is not provided as an argument.
var REGION = argv.r;
if (!REGION) {
    var m = ENDPOINT.match(/\.([^.]+)\.es\.amazonaws\.com\.?$/);
    if (m) {
        REGION = m[1];
    } else {
        console.error('region cannot be parsed from endpoint address, either the endpoint must end ' +
                      'in .<region>.es.amazonaws.com or --region should be provided as an argument');
        yargs.showHelp();
        process.exit(1);
    }
}

var TARGET = argv._[0];
if (!TARGET.match(/^https?:\/\//)) {
    TARGET = 'https://' + TARGET;
}

var BIND_ADDRESS = argv.b;
var PORT = argv.p;

var creds;
var chain = new AWS.CredentialProviderChain();
chain.resolve(function (err, resolved) {
    if (err) throw err;
    else creds = resolved;
});

function getcreds(req, res, next) {
    return creds.get(function (err) {
        if (err) return next(err);
        else return next();
    });
}
var proxy = httpProxy.createProxyServer({
    target: TARGET,
    changeOrigin: true,
    secure: true
});

var app = express();
app.use(compress());
app.use(bodyParser.raw({type: '*/*'}));
app.use(getcreds);
app.use(function (req, res) {
    var bufferStream;
    if (Buffer.isBuffer(req.body)) {
        var bufferStream = new stream.PassThrough();
        bufferStream.end(req.body);
    }
    proxy.web(req, res, {buffer: bufferStream});
});

proxy.on('proxyReq', function (proxyReq, req, res, options) {
    var endpoint = new AWS.Endpoint(ENDPOINT);
    var request = new AWS.HttpRequest(endpoint);
    request.method = proxyReq.method;
    request.path = proxyReq.path;
    request.region = REGION;
    if (Buffer.isBuffer(req.body)) request.body = req.body;
    if (!request.headers) request.headers = {};
    request.headers['presigned-expires'] = false;
    request.headers['Host'] = ENDPOINT;

    var signer = new AWS.Signers.V4(request, 'es');
    signer.addAuthorization(creds, new Date());

    proxyReq.setHeader('Host', request.headers['Host']);
    proxyReq.setHeader('X-Amz-Date', request.headers['X-Amz-Date']);
    proxyReq.setHeader('Authorization', request.headers['Authorization']);
    if (request.headers['x-amz-security-token']) proxyReq.setHeader('x-amz-security-token', request.headers['x-amz-security-token']);
});

http.createServer(app).listen(PORT, BIND_ADDRESS);

console.log(figlet.textSync('AWS ES Proxy!', {
    font: 'Speed',
    horizontalLayout: 'default',
    verticalLayout: 'default'
}));

console.log('AWS ES cluster available at http://' + BIND_ADDRESS + ':' + PORT);
console.log('Kibana available at http://' + BIND_ADDRESS + ':' + PORT + '/_plugin/kibana/');
