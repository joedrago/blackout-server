// ----------------------------------------------------------------------------

var context = {
    user: {
        'name': '{BLACKOUT_NAME}'
    },
    'id': '{BLACKOUT_ID}',
};

var server = {
    'player': 0,
    'games': []
};

var actionUrl = '/' + context.id + '/blackout/action';

// ---------------------------------------------------------------------------------------------------------------------------
// Card

var Suit =
{
    NONE: -1,
    CLUBS: 0,
    DIAMONDS: 1,
    HEARTS: 2,
    SPADES: 3
};

var SuitName = ['Clubs', 'Diamonds', 'Hearts', 'Spades'];
var ShortSuitName = ['C', 'D', 'H', 'S'];

function Card(x)
{
    this.suit  = Math.floor(x / 13);
    this.value = Math.floor(x % 13);
    switch(this.value)
    {
        case 9:
            this.valueName = 'J';
            break;
        case 10:
            this.valueName = 'Q';
            break;
        case 11:
            this.valueName = 'K';
            break;
        case 12:
            this.valueName = 'A';
            break;
        default:
            this.valueName = String(this.value + 2);
            break;
    }
    this.name = this.valueName + ShortSuitName[this.suit];
}

// ----------------------------------------------------------------------------
// QueryString Manipulation

function makeQueryString(args)
{
    var qs = '';
    for(var i = 0; i < args.length; i+=2)
    {
        if(qs.length)
        {
            qs += '&';
        }
        qs += args[i] + '=' + args[i+1];
    }
    return '?'+qs;
}

function parseQueryString(queryString)
{
    if (queryString == "") return {};

    var qsArray = queryString.split('&');
    var queryDict = {};
    for (var i = 0; i < qsArray.length; ++i)
    {
        var p = qsArray[i].split('=');
        if (p.length != 2) continue;
        queryDict[p[0]] = decodeURIComponent(p[1].replace(/\+/g, " "));
    }
    return queryDict;
}

// ----------------------------------------------------------------------------
// Render Helpers

function makeMarkup(entries)
{
    var markup = '';
    var inList = false;

    for ( var i = 0; i < entries.length; i++ )
    {
        var e = entries[i];

        if(e.type == 'text')
        {
            if(inList)
            {
                markup += '</ul>';
                inList = false;
            }

            markup += "<p>"+e.text+"</p>";
        }
        else if((e.type == 'action') || (e.type == 'url'))
        {
            if(!inList)
            {
                markup += "<ul data-role='listview' data-inset='true'>";
                inList = true;
            }

            markup += '<li>';
            markup += '<a ';

            var url;
            if(e.type == 'url')
            {
                url = e.url;
                markup += 'rel="external" ';
            }
            else
            {
                e.args.push('action');
                e.args.push(e.action);
                e.args.push('id');
                e.args.push(server.player.id);
                if(server.player.game)
                {
                    e.args.push('counter');
                    e.args.push(server.player.game.counter);
                }
                var qs = makeQueryString(e.args);
                url = '#dyn' + qs;
            }

            markup += 'href="'+url+'">' + e.text + '</a>';
            markup += '</li>';
        }
    }

    if(inList)
        markup += '</ul>';
    return markup;
}

// ----------------------------------------------------------------------------
// Render Tree Helpers

function addText(entries, text)
{
    entries.push({
        'type': 'text',
        'text': text
    });
}

function addURL(entries, url, text)
{
    entries.push({
        'type': 'url',
        'url': url,
        'text': text
    });
}

function addAction()
{
    var args = Array.prototype.slice.call(arguments);
    var entries = args.shift();
    var action = args.shift();
    var text = args.shift();

    var e = {
        'type': 'action',
        'action': action,
        'text': text,
        'args': args
    };
    entries.push(e);
}

// ----------------------------------------------------------------------------
// Renderer

function renderGame()
{
    var entries = [];
    var game = server.player.game;
    var currentPlayer = game.players[game.turn];
    var me;

    for(var i = 0; i < game.players.length; i++)
    {
        if(game.players[i].id == context.id)
        {
            me = game.players[i];
            break;
        }
    }

    addText(entries, "In Game (State:" + game.state + ")");

    if((game.state == 'bid')
    || (game.state == 'bidsummary')
    || (game.state == 'trick'))
    {
        for(var i = 0; i < me.hand.length; i++)
        {
            var card = new Card(me.hand[i]);
            addText(entries, "Card: " + card.name);
        }
    }

    if(game.state == 'trick')
    {
        for(var i = 0; i < game.pile.length; i++)
        {
            var card = new Card(game.pile[i]);
            addText(entries, "Pile: " + card.name);
        }
    }

    switch(game.state)
    {
        case 'preGameSummary':
        case 'bidSummary':
        case 'roundSummary':
        case 'postGameSummary':
            {
                if(game.players[0].id == context.id)
                {
                    addAction(entries, 'next', 'Next');
                }
                else
                {
                    addText(entries, 'Waiting for game owner...');
                }
                break;
            }

        case 'bid':
            {
                if(currentPlayer.id == context.id)
                {
                    for(var i = 0; i <= currentPlayer.hand.length; i++)
                    {
                        addAction(entries, 'bid', 'Bid ' + i, 'bid', i);
                    }
                }
                else
                {
                    addText(entries, "Please wait, not your turn");
                }
                break;
            }

        case 'trick':
            {
                if(currentPlayer.id == context.id)
                {
                    for(var i = 0; i < me.hand.length; i++)
                    {
                        var card = new Card(me.hand[i]);
                        addAction(entries, 'play', 'Play ' + card.name, 'index', i);
                    }
                }
                else
                {
                    addText(entries, "Please wait, not your turn");
                }
                break;
            }
    }

    return entries;
}

function render()
{
    // ------------------------------------------------------------------------
    // decide what you can do right now
    var entries = [];

    if(server.player.game && server.player.game.state != 'lobby')
    {
        entries = renderGame();
    }
    else
    {
        // Lobby

        if(server.player.game)
        {
            addText(entries, 'Lobby (Creating Game):');
            for(var i = 0; i < server.player.game.players.length; i++)
            {
                var info = server.player.game.players[i];
                addText(entries, '* User: ' + info.name);
            }
            if(server.player.game.players[0].id == context.id)
            {
                addAction(entries, 'next', 'Start Game');
            }
            addAction(entries, 'endGame', 'End Game');
        }
        else
        {
            addText(entries, 'Lobby:');
            addAction(entries, 'newGame', 'New Game');
        }

        for(var i = 0; i < server.games.length; i++)
        {
            var game = server.games[i];
            var ownerInfo = game.owner;
            addAction(entries, 'joinGame', 'Join Game ('+ownerInfo.name+')', 'game', game.id);
        }
    }

    addText(entries, 'Options');
    addURL(entries, '/'+context.id+'/user/rename', 'Rename');

    if(server.player.game && server.player.game.log)
    {
        addText(entries, 'Log');
        for(var i = 0; i < server.player.game.log.length; i++)
        {
            addText(entries, ' * ' + server.player.game.log[i]);
        }
    }

    // ------------------------------------------------------------------------
    // update page
    var page = $('#dyn');
    var content = page.children(":jqmData(role=content)");
    var markup = makeMarkup(entries);
    //console.log('Markup: ' + markup); // chatty

    // ------------------------------------------------------------------------
    // update header
    var header = page.children(":jqmData(role=header)" ).find('h1');
    var title = "Blackout: " + context.user.name;

    header.html(title);
    content.html(markup);
    page.page();
    content.find( ":jqmData(role=listview)" ).listview();
    $.mobile.changePage( page );
}

// ----------------------------------------------------------------------------
// Event Handler (Server did something)

function onEvent(data)
{
    //console.log("Event: " + JSON.stringify(data));

    if(data.type == 'update')
    {
        server = data;
    }

    render();
}

// ----------------------------------------------------------------------------
// Action Handler (User did something)

function onAction(args)
{
    $.ajax(actionUrl, {
            'type': 'POST',
            'dataType': 'text',
            'data': JSON.stringify(args),
            'success': function(data, textStatus, xhr)
            {
                console.log("Reply: " + data);
            }
        });

    render();
}

// ----------------------------------------------------------------------------
// Icky page change handling stuff

// Listen for any attempts to call changePage().
$(document).bind("pagebeforechange", function( e, data )
{
    if ( typeof data.toPage === "string" )
    {
        console.log('toPage: '+data.toPage);
        if(data.toPage.search(/#/) == -1)
            return;

        // We are being asked to load a page by URL, but we only
        // want to handle URLs that request the data for a specific
        // category.
        var url = $.mobile.path.parseUrl(data.toPage);
        var hash = url.hash;

        if(hash.search(/^#dyn?/) != -1)
        {
            hash = hash.replace(/^#dyn\??/, '');
            var args = parseQueryString(hash);
            onAction(args);
            e.preventDefault();
        }
    }
});

// ----------------------------------------------------------------------------
// Startup

function ready()
{
    // Attach eventsource
    $.eventsource({
        label:    'blackoutEvents',
        url:      '/'+context.id+'/blackout/eventsource',
        dataType: 'json',
        message: onEvent,
        });

    // render once
    render();
}

$(document).ready(function() {
    ready();
});

// --------------------------------------
