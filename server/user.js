var user = {
        'users_':{}
    };
var util = require('./util.js');
var blackout = require('./blackout.js');

user.addInfo = function(context)
{
    if(user.users_.hasOwnProperty(context.id))
    {
        context.user = user.users_[context.id];
        return true;
    }

    console.log("user.addInfo(): failed to find "+context.id);
    context.user = {};
    return false;
}

user.newUser = function(context)
{
    var id;
    {
        id = 123456;//util.randomString(8);
    }
    while(user.users_.hasOwnProperty(id));

    user.users_[id] = {
        'id': id,
        'name': "Anonymous"
    };
    util.redirect(context.res, '/'+id+'/user/rename');
    return true;
}

user.rename = function(context)
{
    if(typeof context.post['name'] === 'string')
    {
        context.user.name = context.post['name'];
        blackout.redirect(context);
        return true;
    }

    context.res.writeHead(200, {'Content-Type': 'text/plain'});
    context.res.end('Pick a name, '+context.user.name+'!\n');
    return true;
}

user.processRequest = function(context)
{
    console.log("user.processRequest");

    if(context.id == 'new')
    {
        if(user.newUser(context))
            return;
    }

    var cmd = context.args.shift();

    if(cmd == 'rename')
    {
        if(user.rename(context))
            return;
    }

    context.res.writeHead(200, {'Content-Type': 'text/plain'});
    context.res.end('Bad user request (postdata:'+context.postData+')\n');
}

exports.addInfo = user.addInfo;
exports.processRequest = user.processRequest;
