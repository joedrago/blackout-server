// ----------------------------------------------------------------------------
// Imports

var fs = require('fs');
var path = require('path');
var http = require('http');
var url = require('url');
var querystring = require('querystring');
var template = require('./json-template.js');
var blackout = require('./blackout.js');

// ----------------------------------------------------------------------------
// Constants

var BLACKOUT_TICK_MS = 3 * 1000;

// ----------------------------------------------------------------------------
// Global structures holding all data

var sConnections = {};
var sPlayers = {};
var sGames = {};

// ----------------------------------------------------------------------------

function redirect(res, url)
{
    res.writeHead(302, {
        'Location': url
    });
    res.end();
}

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
// redirect

function redirectClient(context)
{
    redirect(context.res, '/'+context.id+'/blackout/client');
}

// ----------------------------------------------------------------------------
// player

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
        id = randomString(8);
    }
    while(sPlayers.hasOwnProperty(id));

    sPlayers[id] = {
        'id': id,
        'name': "Anonymous",
        'game': 0
    };
    redirect(context.res, '/'+id+'/blackout/rename');
    return true;
}

function rpcRename(context)
{
    console.log("context.post: " + JSON.stringify(context.post));
    if(typeof context.post.name === 'string')
    {
        context.player.name = context.post['name'];
        redirectClient(context);
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
    console.log("updateConnection: " + connection.id);

    var player = sPlayers[connection.id];
    var games = [];

    if(!player.game)
    {
        // List available games

        for(var id in sGames)
        {
            if(sGames.hasOwnProperty(id))
            {
                if(sGames[id].state == blackout.State.LOBBY)
                {
                    var g = sGames[id];
                    games.push({ id: id, owner: g.players[0]});
                }
            }
        }
    }

    var data = {
        'type': 'update',
        'player': player,
        'games': games
    };
    connection.res.write('data: ' + JSON.stringify(data) + '\n\n');
}

// ----------------------------------------------------------------------------
// Helpers

function sendReply(context, reply)
{
    context.res.writeHead(200, {'Content-Type': 'text/plain'});
    context.res.end(reply);
    return true;
}

function sendSuccess(context)
{
    return sendReply(context, 'OK');
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
            if(player.game && (player.game.state != blackout.State.LOBBY))
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

function updateGame(context)
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
    return sendSuccess(context);
}

function newGame(context)
{
    console.log('newGame');
    endGame(context);

    var id;

    do
    {
        id = randomString(8);
    } while(sGames.hasOwnProperty(id));

    var params =
    {
        'id': id,
        'players': [
            {'id': context.id, 'name': context.player.name }
        ]
    };
    var game = blackout.newGame(params);
    sGames[id] = game;
    context.player.game = game;

    updateLobby();

    return sendSuccess(context);
}

function joinGame(context)
{
    endGame(context);

    var gameid = context.post.game;

    if(gameid && sGames.hasOwnProperty(gameid))
    {
        for(var i = 0; i < sGames[gameid].players.length; i++)
        {
            if(sGames[gameid].players[i].id == context.id)
            {
                return sendReply(context, 'alreadyInThisGame');
            }
        }
        sGames[gameid].players.push({'id':context.id, 'name': context.player.name});
        context.player.game = sGames[gameid];
    }
    updateLobby();

    return sendSuccess(context);
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
        return newGame(context);
    }
    else if(context.post.action == 'endGame')
    {
        return endGame(context);
    }
    else if(context.post.action == 'joinGame')
    {
        return joinGame(context);
    }
    else
    {
        if(context.player.game)
        {
            console.log('running action: ' + JSON.stringify(context.post));
            var reply = context.player.game.action(context.post);
            updateGame(context);
            return sendReply(context, reply);
        }
    }

    return sendSuccess(context);
}

// ----------------------------------------------------------------------------
// Static serving

var staticFiles = {};

function isStaticFile(filename)
{
    return staticFiles.hasOwnProperty(filename);
}

function sendError(context, text)
{
    context.res.writeHead(500, {'Content-Type': 'text/plain'});
    context.res.end('ERROR: '+text+' (path:"'+context.path+'" postdata:"'+context.rawPostData+'")\n');
    return false;
}

function sendStaticFile(context)
{
    if(context.id != 'static')
        return false;

    var filenamePieces = [ context.module ];
    filenamePieces = filenamePieces.concat(context.args);
    var filename = filenamePieces.join('/');

    if(!isStaticFile(filename))
    {
        // Send a 404
        console.log('static file not found: '+filename);
        context.res.writeHead(404, {'Content-Type': 'text/plain'});
        context.res.end('static file not found');
        return true;
    }

    var mimeType = 'text/plain';
    var results = filename.match(/\.([^\.]+)$/);
    if(results)
    {
        var extension = results[1];
        if(extension == 'js')
            mimeType = 'text/javascript';
        if(extension == 'css')
            mimeType = 'text/css';
        else if(extension == 'html')
            mimeType = 'text/html';
    }

    console.log('sending static file "'+filename+'" ['+mimeType+']');

    context.res.writeHead(200, {'Content-Type': mimeType});
    var fileContents = fs.readFileSync('./static/'+filename);
    context.res.end(fileContents);
    return true;
}

// ----------------------------------------------------------------------------
// Dispatch

var sDispatch = {
    'client': rpcClient,
    'client.js': rpcClientJS,
    'eventsource': rpcEventsource,
    'newPlayer': rpcNewPlayer,
    'rename': rpcRename,
    'action': rpcAction
};

function processRequest(context)
{
    if(context.id == 'favicon.ico')
    {
        return sendError(context, 'favicon is dumb');
    }

    if(sendStaticFile(context))
        return;

    if(context.id != 'new')
    {
        if(!findPlayer(context))
        {
            return sendError(context, 'Unknown player: ' + context.id);
        }
    }

    context.post = 0;
    if(context.rawPostData.length > 0)
    {
        try
        {
            context.post = JSON.parse(context.rawPostData);
        }
        catch(err)
        {
            context.post = querystring.parse(context.rawPostData);
        }
    }
    if(!context.post)
        context.post = {};

    var cmd = context.args.shift();

    if(sDispatch.hasOwnProperty(cmd))
    {
        if(sDispatch[cmd](context))
            return;
    }

    context.res.writeHead(200, {'Content-Type': 'text/plain'});
    context.res.end('Bad blackout request (postdata:'+context.postData+')\n');
}

function buildContext(req, res)
{
    var parsedUrl = url.parse(req.url);
    var path = parsedUrl.pathname;
    var args = path.split('/');
    args.shift();

    console.log("Request for " + path + " received.");
    console.log("args: "+JSON.stringify(args));

    var id = args.shift();
    var module = args.shift();

    var context = {
        'path': path,
        'req': req,
        'res': res,
        'rawPostData':'',
        'id': id,
        'module': module,
        'args': args
    };

    if(id === '')
    {
        redirect(res, '/new/blackout/newPlayer');
    }
    else
    {
        req.setEncoding("utf8");
        req.addListener("data", function(rawPostDataChunk) {
                context.rawPostData += rawPostDataChunk;
                });
        req.addListener("end", function() {
                processRequest(context);
                });
    }
}

function addStaticDir(subdir)
{
    var dir = './static/';
    if(subdir)
        dir += subdir;
    var list = fs.readdirSync(dir);
    for(var i=0; i<list.length; i++)
    {
        var path = dir + list[i];
        var s = fs.statSync(path);
        if(!s.isDirectory())
        {
            staticFiles[subdir+list[i]]++;
        }
    }
}

addStaticDir('');
addStaticDir('images/');

var staticFileCount = 0;
for(var i in staticFiles)
{
    if(staticFiles.hasOwnProperty(i))
    {
        staticFileCount++;
    }
}
console.log('Serving '+staticFileCount+' static files.');

http.createServer(buildContext).listen(8124);

console.log('Server running at http://127.0.0.1:8124/');
