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

    sGames[this.id] = this; // register with game list
}

// ----------------------------------------------------------------------------
// Connection handlers

function onConnect(id, res)
{
    console.log("attaching id: " + id);
    sConnections[id] = { 'id':id, 'res':res };
}

function onDisconnect(id, res)
{
    delete sConnections[id];
}

// ----------------------------------------------------------------------------
// Update Connection

function updateConnection(connection)
{
    var data = {};

    // TOMORROW

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

function interp(name, vars)
{
    var text;
    try
    {
        var fileContents = fs.readFileSync('./templates/'+name+'.html', 'utf8');
        text = template.expand(fileContents, vars);
    }
    catch(err)
    {
        text = '';
    }
    return text;
}

// ----------------------------------------------------------------------------
// Timed event to cleanup, do pings, age out games and players, etc

function tick()
{
//    console.log("-------------------");
//    console.log("sConnections:\n"+JSON.stringify(sConnections));
//    console.log("sGames:\n"+JSON.stringify(sGames));

//    var connectionList = "connections: ";
//    for(var i = 0; i < sConnections.length; i++)
//    {
//        connectionList += sConnections[i].id + " ";
//    }
//
//    for(var i = 0; i < sConnections.length; i++)
//    {
//        var connection = sConnections[i];
//        connection.res.write('data: ' + connectionList + '\n\n');
//    }
};

setInterval(function() { tick(); }, BLACKOUT_TICK_MS);

// ----------------------------------------------------------------------------
// Main: displays main page, tailored for a specific user

function rpcMain(context)
{
    context.res.writeHead(200, {'Content-Type': 'text/html'});
    context.res.end(interp('main', {'name': context.user.name}));
    return true;
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
// NewGame: leaves any old game, puts user in a new game as the owner

function rpcNewGame(context)
{
    var game = new Game(context.id);
    context.user.gameid = game.id;

    updateConnection(sConnections[context.id]);

    return sendSuccess(context);
}

// ----------------------------------------------------------------------------
// HTTP processing

var sDispatch = {
    'main': rpcMain,
    'eventsource': rpcEventsource,
    'newgame': rpcNewGame
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
    util.redirect(context.res, '/'+context.id+'/blackout/main');
}

// ----------------------------------------------------------------------------
// Exports

exports.connect = onConnect;
exports.disconnect = onDisconnect;
exports.processRequest = processRequest;
exports.redirect = redirect;
