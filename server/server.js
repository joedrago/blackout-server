// ----------------------------------------------------------------------------
// Imports

var fs = require('fs');
var http = require('http');
var url = require('url');
var socketIO = require('socket.io');
var nodeStatic = require('node-static');
var template = require('./json-template.js');
var fileServer = new(nodeStatic.Server)('./static');
var blackout = require('./blackout.js');

// ----------------------------------------------------------------------------

var sPlayers = {};
var sGames = {};
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
// Update

function sendError(conn, error)
{
    if(!conn)
        return false;
    if(error == blackout.OK)
        return false;

    var data = { error: error };
    console.log("sending error: " + JSON.stringify(data));
    conn.socket.emit('error', data);
    return true;
}

function updateConnection(conn)
{
    var player = sPlayers[conn.id];
    if(!player)
        return;

    var update = { player: player, games:[] };

    if(!player.game || (player.game.state == blackout.State.LOBBY))
    {
        for(var k in sGames)
        {
            if(sGames.hasOwnProperty(k))
            {
                var game = sGames[k];
                if(game.state == blackout.State.LOBBY)
                {
                    update.games.push(game);
                }
            }
        }
    }

    conn.socket.emit('update', update);
}

function updateLobby()
{
    for(var id in sConnections)
    {
        if(sConnections.hasOwnProperty(id) && sPlayers.hasOwnProperty(id))
        {
            updateConnection(sConnections[id]);
        }
    }
}

function updateGame(game)
{
    if(!game)
        return;

    for(var k in game.players)
    {
        if(game.players.hasOwnProperty(k))
        {
            var id = game.players[k].id;
            if(sConnections.hasOwnProperty(id) && sPlayers.hasOwnProperty(id))
            {
                updateConnection(sConnections[id]);
            }
        }
    }
}

// ----------------------------------------------------------------------------
// Actions

// ----------------------------------------------------------------------------
// Socket Manipulation

function onAction(data)
{
    console.log('Got Action: ' + JSON.stringify(data));

    var player = sPlayers[data.id];
    if(!player)
    {
        console.log("Ignoring action; No such player id " + data.id);
        return;
    }

    var game = player.game;
    var conn = sConnections[data.id];

    switch(data.action)
    {
        case 'next':
            {
                if(game)
                {
                    if(!sendError(conn, game.next()))
                        updateGame(game);
                }
                else
                {
                    console.log("Ignoring next from " + data.id);
                }

                break;
            }

        case 'play':
            {
                if(game)
                {
                    sendError(conn, game.play(data.args));
                    updateGame(game);
                }
                else
                {
                    console.log("Ignoring next from " + data.id);
                }

                break;
            }

        case 'newGame':
            {
                if(player.game)
                {
                    player.game.endGame();
                    updateGame(player.game);
                }

                var id;
                {
                    id = randomString(8);
                }
                while(sGames.hasOwnProperty(id));

                player.game = blackout.newGame({ id: id, players: [ { id: player.id, name: player.name } ] });
                sGames[player.game.id] = player.game;
                updateLobby();

                break;
            }

        case 'joinGame':
            {
                if(player.game)
                {
                    player.game.quit();
                    updateGame(player.game);
                }

                var gameid = data.args.id;

                var game = sGames[gameid];
                if(game)
                {
                    game.players.push({ id: player.id, name: player.name });
                    player.game = game;
                    updateLobby();
                }
                else
                {
                    sendError(conn, 'gameDoesNotExist');
                }

                break;
            }
    };
}

function onHello(socket, data)
{
    var conn = { socket: socket, id: data.id };

    console.log('Got Hello: ' + JSON.stringify(data));
    sConnections[data.id] = conn;

    updateConnection(conn);
}

function onDisconnect(socket)
{
    for(var k in sConnections)
    {
        if(sConnections.hasOwnProperty(k))
        {
            var conn = sConnections[k];
            if(socket === conn.socket)
            {
                delete sConnections[k];
                return;
            }
        }
    }
}

function onConnect(socket)
{
    socket.on('action', function (data) {
            onAction(data);
            });
    socket.on('hello', function (data) {
            onHello(socket, data);
            });
    socket.on('disconnect', function () {
            onDisconnect(socket);
            });
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
      //socket.emit('news', { hello: 'world' });
      onConnect(socket);
});

//io.sockets.on('connection', onDisconnect);
//io.sockets.on('disconnect', onDisconnect);

console.log('Server running at http://127.0.0.1:8124/');
