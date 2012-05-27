var util = require('./util.js');

var BLACKOUT_TICK_MS = 3 * 1000;

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


blackout.main = function(context)
{
    context.res.writeHead(200, {'Content-Type': 'text/plain'});
    context.res.end('Main: '+context.user.name+'!\n');
    return true;
}

blackout.eventsource = function(context)
{
    context.res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
            });

    context.res.write(':' + Array(2049).join(' ') + '\n'); //2kb padding for IE

    blackout.connect(context.id, context.res);
    context.res.socket.on('close', function () {
            blackout.disconnect(context.id, context.res);
            });
    return true;
}

blackout.processRequest = function(context)
{
    console.log("blackout.processRequest");

    var cmd = context.args.shift();

    if(cmd == 'main')
    {
        if(blackout.main(context))
            return;
    }

    if(cmd == 'eventsource')
    {
        if(blackout.eventsource(context))
            return;
    }

    context.res.writeHead(200, {'Content-Type': 'text/plain'});
    context.res.end('Bad blackout request (postdata:'+context.postData+')\n');
}

blackout.redirect = function(context)
{
    util.redirect(context.res, '/'+context.id+'/blackout/main');
}

setInterval(function() { blackout.tick(); }, BLACKOUT_TICK_MS);
exports.connect = blackout.connect;
exports.disconnect = blackout.disconnect;
exports.processRequest = blackout.processRequest;
exports.redirect = blackout.redirect;
