var BLACKOUT_TICK_MS = 10 * 1000;
var blackout = {
    'clients_': []
};

blackout.connect = function(id, res)
{
    console.log("attaching id: " + id);
    blackout.clients_.push({ 'id':id, 'res':res });
};

blackout.disconnect = function(id, res)
{
    for(var i = 0; i < blackout.clients_.length; i++)
    {
        if(blackout.clients_[i].id == id)
        {
            blackout.clients_.splice(i, 1);
            break;
        }
    }
};

blackout.tick = function()
{
    console.log("tick");

    var clientList = "clients: ";
    for(var i = 0; i < blackout.clients_.length; i++)
    {
        clientList += blackout.clients_[i].id + " ";
    }

    for(var i = 0; i < blackout.clients_.length; i++)
    {
        var client = blackout.clients_[i];
        client.res.write('data: ' + clientList + '\n\n');
    }
};

blackout.process = function(req, res, postData)
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
        res.end('Hello World (postdata:'+postData+')\n');
    }
}

setInterval(function() { blackout.tick(); }, BLACKOUT_TICK_MS);
exports.connect = blackout.connect;
exports.disconnect = blackout.disconnect;
exports.process = blackout.process;
