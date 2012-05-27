var blackout = {
    'clients_': []
};

blackout.connect = function(id, res)
{
    console.log("attaching id: " + id);
    blackout.clients_.push({ 'id':id, 'res':res });
};

blackout.disconnect = function(id, res)
{
    for(var i = 0; i < blackout.clients_.length; i++)
    {
        if(blackout.clients_[i].id == id)
        {
            blackout.clients_.splice(i, 1);
            break;
        }
    }
};

blackout.tick = function()
{
    console.log("tick");

    var clientList = "clients: ";
    for(var i = 0; i < blackout.clients_.length; i++)
    {
        clientList += blackout.clients_[i].id + " ";
    }

    for(var i = 0; i < blackout.clients_.length; i++)
    {
        var client = blackout.clients_[i];
        client.res.write('data: ' + clientList + '\n\n');
    }
};

setInterval(function() { blackout.tick(); }, 1000);

exports.connect = blackout.connect;
exports.disconnect = blackout.disconnect;
