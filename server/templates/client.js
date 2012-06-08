// ----------------------------------------------------------------------------

var ANIMATE_SPEED = 150;
var SELECTED_Y    = -100;
var UNSELECTED_Y  = 0;
var PILE_OFFSET   = -200;

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

var socket;

var actionUrl = '/' + context.id + '/blackout/action';

var selectedCard = -1;

var localHand = [];
var localPile = [];

// ----------------------------------------------------------------------------
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
// Event Handlers

function onServerUpdate(serverData)
{
    console.log("onServerUpdate: " + JSON.stringify(serverData));
    server = serverData;

    // TODO: copy to localHand/localPile in a much more clever way
    localHand = [];
    localPile = [];

    if(server.player.game)
    {
        var playerInfo;
        for(var i = 0; i < server.player.game.players.length; i++)
        {
            if(server.player.game.players[i].id == context.id)
            {
                playerInfo = server.player.game.players[i];
                break;
            }
        }

        if(playerInfo && playerInfo.hand && server.player.game.pile)
        {
            localHand = playerInfo.hand;
            localPile = server.player.game.pile;

            console.log("update hand:"+JSON.stringify(localHand)+" pile:"+JSON.stringify(localPile));

            for(var i = 0; i < 13; i++)
            {
                positionCard(i, i, PC_NORMAL);
            }
            for(var i = 0; i < 5; i++)
            {
                positionCard(i, i, PC_PILE);
            }
        }
        else
        {
        }
    }
    setAllArt();
}

function onServerError(data)
{
    console.log("onServerError: " + JSON.stringify(data));
}

function sendAction(action, args)
{
    if(!server || !server.player)
    {
        console.log("Not sending actions while there is no server data");
        return;
    }

    var counter = 0;
    if(server.player.game)
    {
        counter = server.player.game.counter;
    }


    if(!args)
    {
        args = [];
    }
    var data = { id: context.id, counter: counter, action: action, args: args };
    console.log("sending action: " + JSON.stringify(data));
    socket.emit('action', data);
}

// ----------------------------------------------------------------------------

function setArt(id, which)
{
    if(which == -1)
    {
        $(id).css('display', 'none');
    }
    else
    {
        var card = new Card(which);
        $(id).css('display', 'block');
        $(id).css('background-position', '-' + String(card.value * 79) + 'px -' + String(card.suit * 123) + 'px');
    }
}

function setAllArt()
{
    var id;

    for(var i = 0; i < localHand.length; i++)
    {
        id = '#card' + String(i);
        setArt(id, localHand[i]);
    }

    for(var i = localHand.length; i < 13; i++)
    {
        id = '#card' + String(i);
        setArt(id, -1);
    }

    for(var i = 0; i < localPile.length; i++)
    {
        id = '#pile' + String(i);
        setArt(id, localPile[i]);
    }

    for(var i = localPile.length; i < 5; i++)
    {
        id = '#pile' + String(i);
        setArt(id, -1);
    }
}

var PC_NORMAL   = 0;
var PC_SELECTED = (1 << 0);
var PC_ANIMATED = (1 << 1);
var PC_PILE     = (1 << 2);

function positionCard(index, viewIndex, flags)
{
    var id = (flags & PC_PILE) ? '#pile' : '#card';
    id += String(index);

    var x = viewIndex * 65;
    var y = UNSELECTED_Y;
    if(flags & PC_SELECTED)
    {
        y = SELECTED_Y;
    }
    else
    {
        if(flags & PC_PILE)
        {
            x = index * 65;
            y = PILE_OFFSET;
        }
    }

    if(flags & PC_ANIMATED)
    {
        $(id).animate({ left: String(x) + 'px', top: String(y) + 'px' }, ANIMATE_SPEED);
    }
    else
    {
        $(id).css('left', String(x) + 'px');
        $(id).css('top',  String(y) + 'px');
    }
}

function moveCard(which, where)
{
    if(which == where)
    {
        positionCard(which, which, PC_NORMAL);
        return;
    }

    var playing = false;
    if(where == -1)
    {
        where = localHand.length - 1;
        playing = true;
    }

    var dir = (where < which) ? -1 : 1;
    var c, lc;

    var t = localHand[which];
    for(lc = which, c = which+dir; c != where+dir; lc += dir, c += dir)
    {
        localHand[lc] = localHand[c];
    }

    if(playing)
    {
        localHand.splice(where, 1);
    }
    else
    {
        localHand[where] = t;
    }

    setAllArt();

    for(lc = which, c = which+dir; c != where+dir; lc += dir, c += dir)
    {
        positionCard(lc, c, (c == which) ? PC_SELECTED : PC_NORMAL);
    }
    positionCard(where, which, PC_SELECTED);

    for(var i = 0; i < localHand.length; i++)
    {
        positionCard(i, i, PC_ANIMATED);
    }
}

function playCard(which)
{
    localPile.push(localHand[which]);
    positionCard(localPile.length - 1, which, PC_PILE | PC_SELECTED);
    positionCard(localPile.length - 1, 0, PC_PILE | PC_ANIMATED);

    sendAction('play', { which: localHand[which] });
}

function onPlayButton()
{
    if(selectedCard != -1)
    {
        playCard(selectedCard);
        moveCard(selectedCard, -1);
        selectedCard = -1;
    }
}

function onNextButton()
{
    sendAction('next');
}

function onNewGameButton()
{
    sendAction('newGame');
}

function onJoinGameButton()
{
    if(server && server.games.length)
    {
        sendAction('joinGame', { id: server.games[0].id });
    }
}

function clickCard(which)
{
    var id;

    if(selectedCard == which)
    {
        id = '#card' + String(selectedCard);
        $(id).animate({ top: String(UNSELECTED_Y)+'px' }, ANIMATE_SPEED);
        selectedCard = -1;
    }
    else if(selectedCard == -1)
    {
        id = '#card' + String(which);
        $(id).animate({ top: String(SELECTED_Y)+'px' }, ANIMATE_SPEED);
        selectedCard = which;
    }
    else
    {
        moveCard(selectedCard, which);
        selectedCard = -1;
    }
}

// ----------------------------------------------------------------------------
// Startup

function ready()
{
    socket = io.connect('');
    socket.on('connect', function () {
            socket.emit('hello', { id: context.id });
            });
    socket.on('update', onServerUpdate);
    socket.on('error', onServerError);
}

$(document).ready(function() {
    ready();
});
