// ----------------------------------------------------------------------------
// Imports

var util = require('./util.js');
var template = require('./json-template.js');
var fs = require('fs');

// ----------------------------------------------------------------------------
// Constants

var BLACKOUT_TICK_MS = 3 * 1000;

// ----------------------------------------------------------------------------
// Global structures holding all data

var sConnections = {};
var sPlayers = {};
var sGames = {};

// ----------------------------------------------------------------------------
// class Game

function Game(ownerid)
{
    do
    {
        this.id = util.randomString(8);
    } while(sGames.hasOwnProperty(this.id));

    this.owner = ownerid;
    this.players = [ sPlayers[ownerid] ];
    this.started = false;
    this.ended = false;

    sGames[this.id] = this; // register with game list
}

// ----------------------------------------------------------------------------
// redirect

function redirect(context)
{
    util.redirect(context.res, '/'+context.id+'/blackout/client');
}

// ----------------------------------------------------------------------------
// player

function jsonPlayerNoGame(player)
{
    if(!player)
        return player;

    var p = {};
    for(var k in player)
    {
        if(k == 'game')
            continue;

        if(player.hasOwnProperty(k))
        {
            p[k] = player[k];
        }
    }
    return p;
}

function jsonPlayerPrunedGame(player)
{
    if(!player)
        return player;

    var p = {};
    for(var k in player)
    {
        if(player.hasOwnProperty(k))
        {
            if(k == 'game')
            {
                p[k] = jsonGame(player[k]);
            }
            else
            {
                p[k] = player[k];
            }
        }
    }
    return p;
}

function jsonGame(game)
{
    if(!game)
        return game;

    var g = {};
    for(var k in game)
    {
        if(game.hasOwnProperty(k))
        {
            if(k == 'players')
            {
                g.players = [];
                for(var i = 0; i < game.players.length; i++)
                {
                    g.players.push(jsonPlayerNoGame(game.players[i]));
                }
            }
            else
            {
                g[k] = game[k];
            }
        }
    }
    return g;
}

function findPlayer(context)
{
    if(sPlayers.hasOwnProperty(context.id))
    {
        context.player = sPlayers[context.id];
        return true;
    }

    return false;
}

function rpcNewPlayer(context)
{
    var id;
    {
        id = util.randomString(8);
    }
    while(sPlayers.hasOwnProperty(id));

    sPlayers[id] = {
        'id': id,
        'name': "Anonymous",
        'game': 0
    };
    util.redirect(context.res, '/'+id+'/blackout/rename');
    return true;
}

function rpcRename(context)
{
    if(typeof context.post['name'] === 'string')
    {
        context.player.name = context.post['name'];
        redirect(context);
        return true;
    }

    context.res.writeHead(200, {'Content-Type': 'text/html'});
    context.res.end('Pick a name: <form method="POST"><input type="text" name="name" value="'+context.player.name+'"></form>\n');
    return true;
}

// ----------------------------------------------------------------------------
// Update Connection

function updateConnection(connection)
{
    var player = sPlayers[connection.id];
    var game = 0;
    var games = [];

    if(player.game)
    {
        game = player.game;
    }
    else
    {
        // List available games

        for(var id in sGames)
        {
            if(sGames.hasOwnProperty(id))
            {
                if(!sGames[id].started)
                {
                    games.push(jsonGame(sGames[id]));
                }
            }
        }
    }

    console.log(JSON.stringify(jsonGame(game)));

    var data = {
        'type': 'update',
        'player': jsonPlayerPrunedGame(player),
        'games': games
    };
    connection.res.write('data: ' + JSON.stringify(data) + '\n\n');
}

// ----------------------------------------------------------------------------
// Helpers

function sendSuccess(context)
{
    context.res.writeHead(200, {'Content-Type': 'text/plain'});
    context.res.end('OK');
    return true;
}

function sendError(context)
{
    context.res.writeHead(200, {'Content-Type': 'text/plain'});
    context.res.end('ERR');
    return true;
}

function interp(context, name)
{
    var vars = { 'BLACKOUT_NAME': context.player.name, 'BLACKOUT_ID': context.id };
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
// Timed event to cleanup, do pings, age out games and players, etc

function tick()
{
//    for(var id in sConnections)
//    {
//        if(sConnections.hasOwnProperty(id))
//        {
//            var connection = sConnections[id];
//            connection.res.write('data: {"herp":"derp"}\n\n');
//        }
//    }
};

setInterval(function() { tick(); }, BLACKOUT_TICK_MS);

// ----------------------------------------------------------------------------
// Client: displays main page, tailored for a specific user

function rpcClient(context)
{
    console.log("sending client HTML");
    context.res.writeHead(200, {'Content-Type': 'text/html'});
    context.res.end(interp(context, 'client.html'));
    return true;
}

function rpcClientJS(context)
{
    console.log("sending client JS");
    context.res.writeHead(200, {'Content-Type': 'text/javascript'});
    context.res.end(interp(context, 'client.js'));
    return true;
}

// ----------------------------------------------------------------------------
// Connection handlers

function onConnect(id, res)
{
    console.log("attaching eventsource: " + id);
    sConnections[id] = { 'id':id, 'res':res };

    updateConnection(sConnections[id]);
}

function onDisconnect(id, res)
{
    console.log("disconecting eventsource: " + id);
    delete sConnections[id];
}

// ----------------------------------------------------------------------------
// Lobby

function updateLobby()
{
    for(var id in sConnections)
    {
        if(sConnections.hasOwnProperty(id))
        {
            var connection = sConnections[id];
            var player = sPlayers[connection.id];
            var updateNeeded = true;
            if(player.game && player.game.started)
            {
                updateNeeded = false;
            }
            if(updateNeeded)
            {
                updateConnection(connection);
            }
        }
    }
}

function updateGame()
{
    if(context.player.game)
    {
        var game = context.player.game;
        for(var i = 0; i < game.players.length; i++)
        {
            if(sConnections.hasOwnProperty(game.players[i].id))
            {
                updateConnection(sConnections[game.players[i].id]);
            }
        }
    }

    for(var id in sConnections)
    {
        if(sConnections.hasOwnProperty(id))
        {
            var connection = sConnections[id];
            var player = sPlayers[id];
            var updateNeeded = true;
            if(player.game && player.game.started)
            {
                updateNeeded = false;
            }
            if(updateNeeded)
            {
                updateConnection(connection);
            }
        }
    }
}

// ----------------------------------------------------------------------------
// Creates persistent connection for pushing data

function rpcEventsource(context)
{
    context.res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
            });

    context.res.write(':' + Array(2049).join(' ') + '\n'); //2kb padding for IE

    onConnect(context.id, context.res);
    context.res.socket.on('close', function () {
            onDisconnect(context.id, context.res);
            });
    return true;
}

// ----------------------------------------------------------------------------
// Game create/join

function endGame(context)
{
    if(context.player.game)
    {
        if(context.player.game.started)
        {
            context.player.game.ended = true;
        }
        else
        {
            var gameid = context.player.game.id;
            var game = context.player.game;
            for(var i = 0; i < game.players.length; i++)
            {
                var player = game.players[i];
                if(player.game == game)
                {
                    player.game = 0;
                }

                var connection = sConnections[game.players[i].id];
                if(connection)
                {
                    updateConnection(connection);
                }
            }
            delete sGames[gameid];
        }
        context.player.game = '';
    }

    updateLobby();
}

function newGame(context)
{
    console.log('newGame');
    endGame(context);

    var game = new Game(context.id);
    context.player.game = game;

    updateLobby();
}

function joinGame(context)
{
    endGame(context);

    var gameid = context.post.game;

    if(gameid && sGames.hasOwnProperty(gameid))
    {
        sGames[gameid].players.push(sPlayers[context.id]);
        context.player.game = sGames[gameid];
    }
    updateLobby();
}

// ----------------------------------------------------------------------------
// Action dispatch

function rpcAction(context)
{
    if(context.post.action == '')
        return sendError(context);

    console.log("Action: " + JSON.stringify(context.post));

    if(context.post.action == 'newGame')
    {
        newGame(context);
    }
    else if(context.post.action == 'endGame')
    {
        endGame(context);
    }
    else if(context.post.action == 'joinGame')
    {
        joinGame(context);
    }

    return sendSuccess(context);
}

// ----------------------------------------------------------------------------
// HTTP processing

var sDispatch = {
    'client': rpcClient,
    'client.js': rpcClientJS,
    'eventsource': rpcEventsource,
    'newPlayer': rpcNewPlayer,
    'rename': rpcRename,
    'action': rpcAction
};

processRequest = function(context)
{
    console.log("processRequest");

    var cmd = context.args.shift();

    if(sDispatch.hasOwnProperty(cmd))
    {
        if(sDispatch[cmd](context))
            return;
    }

    context.res.writeHead(200, {'Content-Type': 'text/plain'});
    context.res.end('Bad blackout request (postdata:'+context.postData+')\n');
}

// ----------------------------------------------------------------------------
// Exports

exports.connect = onConnect;
exports.disconnect = onDisconnect;
exports.processRequest = processRequest;
exports.redirect = redirect;
exports.findPlayer = findPlayer;
