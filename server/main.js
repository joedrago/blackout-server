var http = require('http');
var url = require('url');
var path = require('path');
var fs = require('fs');
var querystring = require('querystring');
var blackout = require('./blackout.js');
var util = require('./util.js');

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
        if(!blackout.findPlayer(context))
        {
            return sendError(context, 'Unknown player: ' + context.id);
        }
    }

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
    else
    {
        context.post = {};
    }

    if(context.module == 'blackout')
    {
        return blackout.processRequest(context);
    }

    return sendError(context, 'Bad request');
}

function getPostData(req, res)
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
        util.redirect(res, '/new/blackout/newPlayer');
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

http.createServer(getPostData).listen(8124);

console.log('Server running at http://127.0.0.1:8124/');
