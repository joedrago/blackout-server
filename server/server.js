// ----------------------------------------------------------------------------
// Imports

var fs = require('fs');
var http = require('http');
var url = require('url');
var socketIO = require('socket.io');
var nodeStatic = require('node-static');
var template = require('./json-template.js');
var fileServer = new(nodeStatic.Server)('./static');

// ----------------------------------------------------------------------------

var sPlayers = {};
var sConnections = {};

// ----------------------------------------------------------------------------

var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";

function randomString(length)
{
    // Guts of this function taken from https://github.com/eliaskg/node-randomstring/
    // Copyright (c) 2012 Elias Klughammer

    length = length ? length : 32;

    var string = "";

    for (var i=0; i<length; i++) {
        var randomNumber = Math.floor(Math.random() * chars.length);
        string += chars.substring(randomNumber, randomNumber + 1);
    }

    return string;
}

// ----------------------------------------------------------------------------

function interp(player, name)
{
    var vars = { 'BLACKOUT_NAME': player.name, 'BLACKOUT_ID': player.id };
    var text;
    try
    {
        var fileContents = fs.readFileSync('./templates/'+name, 'utf8');
        text = template.expand(fileContents, vars);
    }
    catch(err)
    {
        text = '';
    }
    if(text.length == 0)
    {
        console.log('WARNING: 0 bytes interped for '+name);
    }
    return text;
}

// ----------------------------------------------------------------------------

function redirect(res, url)
{
    res.writeHead(302, {
        'Location': url
    });
    res.end();
}

// ----------------------------------------------------------------------------

function onHttpRequest(req, res)
{
    var parsedUrl = url.parse(req.url);
    var path = parsedUrl.pathname;
    var player = 0;
    var args = path.split('/');
    args.shift();

    if((args[0] == 'client')
    || (args[0] == 'clientjs'))
    {
        if(args[1])
        {
            player = sPlayers[args[1]];
        }

        if(!player)
        {
            var id;
            {
                id = randomString(8);
            }
            while(sPlayers.hasOwnProperty(id));

            player = {
                'id': id,
                'name': 'Anonymous',
                'game': 0
            };
            sPlayers[id] = player;

            redirect(res, '/client/' + player.id);
        }
        else if(args[0] == 'client')
        {
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end(interp(player, 'client.html'));
        }
        else if(args[0] == 'clientjs')
        {
            res.writeHead(200, {'Content-Type': 'text/javascript'});
            res.end(interp(player, 'client.js'));
        }
    }
    else
    {
        fileServer.serve(req, res);
    }
}

// ----------------------------------------------------------------------------

var server = http.createServer(onHttpRequest);
var io = socketIO.listen(server);

server.listen(8124);

io.sockets.on('connection', function (socket) {
      socket.emit('news', { hello: 'world' });
        socket.on('my other event', function (data) {
                console.log(data);
                  });
});

//io.sockets.on('connection', onDisconnect);
//io.sockets.on('disconnect', onDisconnect);

console.log('Server running at http://127.0.0.1:8124/');
