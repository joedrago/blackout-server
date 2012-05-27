exports.redirect = function(res, url)
{
    res.writeHead(302, {
        'Location': url
    });
    res.end();
}

var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";

exports.randomString = function(length)
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
