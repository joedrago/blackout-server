var http = require('http');
var url = require('url');
var path = require('path');
var fs = require('fs');
var querystring = require('querystring');
var blackout = require('./blackout.js');
var user = require('./user.js');
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

function sendStaticFile(context, filename)
{
    var mimeType = 'text/plain';
    var results = filename.match(/\.([^\.]+)$/);
    if(results)
    {
        var extension = results[1];
        if(extension == 'js')
            mimeType = 'text/javascript';
        else if(extension == 'html')
            mimeType = 'text/html';
    }

    context.res.writeHead(200, {'Content-Type': 'text/plain'});
    var fileContents = fs.readFileSync('./static/'+filename);
    context.res.end(fileContents);
}

function processRequest(context)
{
    console.log("processRequest id: "+context.id);
    if(isStaticFile(context.id))
    {
        return sendStaticFile(context, context.id);
    }

    if(context.id == 'favicon.ico')
    {
        return sendError(context, 'favicon is dumb');
    }

    if(context.id != 'new')
    {
        if(!user.addInfo(context))
        {
            return sendError(context, 'Unknown user: ' + context.id);
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

    if(context.module == 'user')
    {
        return user.processRequest(context);
    }
    else if(context.module == 'blackout')
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
    //console.log("args: "+JSON.stringify(args));

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
        util.redirect(res, '/new/user');
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

var list = fs.readdirSync('./static');
for(var i=0; i<list.length; i++)
{
    console.log("Static File: "+list[i]);
    staticFiles[list[i]]++;
}

http.createServer(getPostData).listen(8124);

console.log('Server running at http://127.0.0.1:8124/');
