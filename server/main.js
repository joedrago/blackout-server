var http = require('http');
var be = require('./blackout.js');

function processRequest(req, res)
{
    var regex = /\/events\/(\S+)$/;
    var result = req.url.match(regex);

    if(result)
    {
        var id = result[1];
        res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*'
                });

        res.write(':' + Array(2049).join(' ') + '\n'); //2kb padding for IE

        be.connect(id, res);
        res.socket.on('close', function () {
                be.disconnect(id, res);
                });
    }
    else
    {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('Hello World\n');
    }
}

http.createServer(processRequest).listen(8124);

console.log('Server running at http://127.0.0.1:8124/');
