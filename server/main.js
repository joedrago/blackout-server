var http = require('http');
var url = require('url');
var blackout = require('./blackout.js');

function getPostData(req, res)
{
    var postData = "";
    var pathname = url.parse(req.url).pathname;
    console.log("Request for " + pathname + " received.");

    req.setEncoding("utf8");
    req.addListener("data", function(postDataChunk) {
            postData += postDataChunk;
            console.log("Received POST data chunk '"+
                postDataChunk + "'.");
            });
    req.addListener("end", function() {
            blackout.process(req, res, postData);
            });
}

http.createServer(getPostData).listen(8124);

console.log('Server running at http://127.0.0.1:8124/');
