var http = require('http');
var url = require('url');
var blackout = require('./blackout.js');
var user = require('./user.js');
var util = require('./util.js');

function sendError(context, text)
{
    context.res.writeHead(500, {'Content-Type': 'text/plain'});
    context.res.end('ERROR: '+text+' (path:"'+context.path+'" postdata:"'+context.rawPostData+'")\n');
    return false;
}

function processRequest(context)
{
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
            return sendError(context, 'Bad JSON in POST: "'+err+'")\n');
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
    console.log("args: "+JSON.stringify(args));

    var id = args.shift();
    var module = args.shift();

    console.log("id: " + id + " module: " + module);

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

http.createServer(getPostData).listen(8124);

console.log('Server running at http://127.0.0.1:8124/');
