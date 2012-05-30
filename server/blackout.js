// ----------------------------------------------------------------------------
// Imports

var util = require('./util.js');
var user = require('./user.js');
var template = require('./json-template.js');
var fs = require('fs');

// ----------------------------------------------------------------------------
// Constants

var BLACKOUT_TICK_MS = 3 * 1000;

// ----------------------------------------------------------------------------
// Global structures holding all data

var sConnections = {};
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
    this.users = [ ownerid ];
    this.started = false;
    this.ended = false;

    sGames[this.id] = this; // register with game list
}

// ----------------------------------------------------------------------------
// Update Connection

function addUsersFromGame(users, game)
{
    for(var i = 0; i < game.users.length; i++)
    {
        var id = game.users[i];
        var userInfo = user.getInfo(id);
        if(userInfo)
        {
            users[id] = userInfo;
        }
    }
    return users;
}

function updateConnection(connection)
{
    var info = user.getInfo(connection.id);
    var users = {};
    var game = '';
    var games = [];

    console.log('sGames.length: ' + sGames.length);

    if(info.game == '')
    {
        // List available games

        for(var id in sGames)
        {
            if(sGames.hasOwnProperty(id))
            {
                if(!sGames[id].started)
                {
                    games.push(sGames[id]);
                    users = addUsersFromGame(users, sGames[id]);
                }
            }
        }
    }
    else
    {
        game = sGames[info.game];
        users = addUsersFromGame(users, game);
    }

    var data = {
        'type': 'update',
        'game': game,
        'users': users,
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
    var vars = { 'BLACKOUT_NAME': context.user.name, 'BLACKOUT_ID': context.id };
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
            var userInfo = user.getInfo(id);
            var updateNeeded = true;
            if(userInfo.game)
            {
                var game = sGames[userInfo.game];
                if(game && game.started)
                {
                    updateNeeded = false;
                }
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
// newGame: leaves any old game, puts user in a new game as the owner

function endGame(context)
{
    if(context.user.game != '')
    {
        if(sGames[context.user.game].started)
        {
            sGames[context.user.game].ended = true;
        }
        else
        {
            var game = sGames[context.user.game];
            for(var i = 0; i < game.users.length; i++)
            {
                var userInfo = user.getInfo(game.users[i]);
                if(userInfo.game == game.id)
                {
                    userInfo.game = '';
                }

                var connection = sConnections[game.users[i]];
                if(connection)
                {
                    updateConnection(connection);
                }
            }
            delete sGames[context.user.game];
        }
        context.user.game = '';
    }

    updateLobby();
}

// ----------------------------------------------------------------------------
// newGame: leaves any old game, puts user in a new game as the owner

function newGame(context)
{
    endGame(context);

    var game = new Game(context.id);
    context.user.game = game.id;

    updateLobby();
}

// ----------------------------------------------------------------------------
// NewGame: leaves any old game, puts user in a new game as the owner

function rpcAction(context)
{
    if(context.post.action == '')
        return sendError(context);

    console.log("Action: " + JSON.stringify(context.post));

    if(context.post.action == 'newGame')
    {
        newGame(context);
    }

    if(context.post.action == 'endGame')
    {
        endGame(context);
    }

    updateConnection(sConnections[context.id]);
    return sendSuccess(context);
}

// ----------------------------------------------------------------------------
// HTTP processing

var sDispatch = {
    'client': rpcClient,
    'client.js': rpcClientJS,
    'eventsource': rpcEventsource,
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

function redirect(context)
{
    util.redirect(context.res, '/'+context.id+'/blackout/client');
}

// ----------------------------------------------------------------------------
// Exports

exports.connect = onConnect;
exports.disconnect = onDisconnect;
exports.processRequest = processRequest;
exports.redirect = redirect;
