// TODO List
// * Quit button (X in top right corner?)
// * Less tragic UI layout
// * Better color choices for buttons
// * "Flavor" (name calling, detecting 'bleeds the table', etc)

// ----------------------------------------------------------------------------

var PLAY_ANIMATE_SPEED = 150;
var TRICK_ANIMATE_SPEED = 150;
var TRICK_DISPLAY_MS = 4000;
var DELAY_MS      = 500;
var SELECTED_Y    = -20;
var UNSELECTED_Y  = 0;
var PILE_OFFSET_Y = -200;
var PREV_OFFSET_X = 750;

var TRICK_FADE_MS = 1000;
var TRICK_TEXT_FADE_MS = 5000;

var waitingOnAnim = false;

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

var lastLocalHand = [];

var localHand = [];
var localPile = [];
var localPrev = [];

var trickTakerName = '';

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
// Helpers

function tableTitle(title, cols)
{
    var t = '<tr><th colspan="'+cols+'">'+title+'</th></tr>\n';
    t += '<tr><th colspan="'+cols+'">&nbsp;</th></tr>\n';
    return t;
}

function arraysHaveSameContent(a, b)
{
    if(a.length != b.length)
        return false;

    var sortedA = a.slice(0);
    var sortedB = b.slice(0);

    sortedA.sort(function(a,b) { return a - b });
    sortedB.sort(function(a,b) { return a - b });

    for(var i = 0; i < sortedA.length; i++)
    {
        if(sortedA[i] !== sortedB[i])
            return false;
    }

    return true;
}

// Puts the content of 'replacement' into 'original',
// while doing its best to preserve orig's order.
function carefullyResetHand(orig, rep)
{
    var newHand = [];

    var origHas = {};
    for(var i = 0; i < orig.length; i++)
        origHas[orig[i]] = 1;

    var repHas = {};
    for(var i = 0; i < rep.length; i++)
        repHas[rep[i]] = 1;

    for(var i = 0; i < orig.length; i++)
        if(repHas.hasOwnProperty(orig[i]))
            newHand.push(orig[i]);
    for(var i = 0; i < rep.length; i++)
        if(!origHas.hasOwnProperty(rep[i]))
            newHand.push(rep[i]);

    return newHand;
}

function hideTrickTaker()
{
    $('#trickTaker').html('');
}

function showTrickTaker()
{
    $('#trickTaker').html(trickTakerName);
    $('#trickTaker').css('opacity', 1);

    setTimeout(function() {
        $('#trickTaker').css('opacity', 0);
        for(var i = 0; i < 5; i++)
        {
            var id = '#prev' + String(i);
            $(id).css('opacity', 0);
        }
    }, TRICK_DISPLAY_MS);
}

// ----------------------------------------------------------------------------
// Event Handlers

function onServerUpdate(serverData)
{
    var showNext = false;
    var showLobby = true;
    var showPlay = false;
    var bidCount = -1;

    console.log("onServerUpdate: " + JSON.stringify(serverData));
    server = serverData;

    // TODO: copy to localHand/localPile in a much more clever way
    var newHand = [];
    var newPile = [];
    var newPrev = [];

    var scoreboard = '';
    var summary = '';
    var isOwner = false;
    var lobbyState = false;
    var trickTaker = '';

    var game = server.player.game;
    if(game)
    {
        showLobby = false;

        if((game.state != 'bid')
        && (game.state != 'trick'))
        {
            showNext = true;
        }

        if(game.players[0].id == server.player.id)
        {
            isOwner = true;
        }

        if(game.state == 'lobby')
        {
            lobbyState = true;
        }

        // Summary preparation
        if((game.state != 'lobby')
        && (game.state != 'bid')
        && (game.state != 'trick'))
        {
            summary = '<table>';

            switch(game.state)
            {
                case 'bidSummary':
                {
                    var totalBids = 0;
                    summary += tableTitle("Bid Summary: Round " + game.nextRound + ' of ' + game.rounds.length , 2);
                    summary += '<tr><th>Name</th><th>Bid</th></tr>';
                    for(var i = 0; i < game.players.length; i++)
                    {
                        var player = game.players[i];
                        summary += '<tr><td>'+player.name+'</td><td>'+player.bid+'</td></tr>';
                        totalBids += player.bid;
                    }
                    var totalTricks = game.players[0].hand.length;
                    var total = String(totalBids) + ' / ' + String(totalTricks) + ' ';
                    total += (totalBids > totalTricks) ? "(over)" : "(under)";
                    summary += '<tr><td>Total:</td><td>'+total+'</td></tr>';

                    break;
                }

                case 'roundSummary':
                {
                    summary += tableTitle("Summary: Round " + game.nextRound + ' of ' + game.rounds.length, 4);
                    summary += '<tr><th>Name</th><th>Went</th><th>Penalty</th><th>Score</th></tr>';
                    for(var i = 0; i < game.players.length; i++)
                    {
                        var player = game.players[i];
                        summary += '<tr><td>'+player.name+'</td><td>'+player.lastWent+'</td><td>'+player.lastPoints+'</td><td>'+player.score+'</td></tr>';
                    }

                    break;
                }

                case 'postGameSummary':
                {
                    var lowestScore = game.players[0].score;
                    var lowestPlayer = 0;
                    var tie = false;

                    summary += tableTitle('Game Over!', 4);
                    summary += '<tr><th>Name</th><th>Went</th><th>Penalty</th><th>Final Score</th></tr>';
                    for(var i = 0; i < game.players.length; i++)
                    {
                        var player = game.players[i];
                        if(player.score < lowestScore)
                        {
                            lowestScore = player.score;
                            lowestPlayer = i;
                            tie = false;
                        }
                        else if((i != lowestPlayer) && (player.score == lowestScore))
                        {
                            tie = true;
                        }
                        summary += '<tr><td>'+player.name+'</td><td>'+player.lastWent+'</td><td>'+player.lastPoints+'</td><td>'+player.score+'</td></tr>';
                    }

                    summary += '<tr><th colspan="4">&nbsp;</th></tr>\n';
                    if(tie)
                    {
                        summary += '<tr><th colspan="4">Its a tie!</th></tr>\n';
                    }
                    else
                    {
                        summary += '<tr><th colspan="4">'+game.players[lowestPlayer].name+' Wins!</th></tr>\n';
                    }
                    break;
                }
            };

            summary += '</table>';
        }

        var playerInfo;
        for(var i = 0; i < game.players.length; i++)
        {
            if(game.players[i].id == context.id)
            {
                playerInfo = game.players[i];
                break;
            }
        }

        if(playerInfo && playerInfo.hand && game.pile)
        {
            if(game.players[game.turn].id == server.player.id)
            {
                if(game.state == 'bid')
                    bidCount = playerInfo.hand.length;
                else if(game.state == 'trick')
                    showPlay = true;
            }

            newHand = playerInfo.hand;
            newPile = game.pile;
            newPrev = game.prev;
        }

        if(game.log)
        {
            var log = "";
            for(var i = 0; i < game.log.length; i++)
            {
                log += game.log[i] + '<br>';
            }

            $('#log').html(log);
        }

        if(game.hasOwnProperty('lastTrickTaker') && (game.lastTrickTaker != -1))
        {
            trickTaker = game.players[game.lastTrickTaker].name;
        }

        scoreboard += "<table>";
        scoreboard += '<tr><th>Name</th><th>Tricks</th><th>Bids</th><th>Score</th></tr>';
        for(var i = 0; i < game.players.length; i++)
        {
            var p = game.players[i];
            var bid = p.bid;
            var tricks = p.tricks;
            var tricksRemaining = 0;
            var tricksClass = '';
            var tdExtras = '';

            if(p.hasOwnProperty('hand'))
            {
                tricksRemaining = p.hand.length;
            }

            if((typeof bid === undefined) || bid == -1)
            {
                bid = '--';
            }
            if(game.state == 'bid')
            {
                tricks = '--';
            }
            else if(p.bid == p.tricks)
            {
                tricksClass = 'tricksGood';
            }
            else if((p.bid < p.tricks) || (tricksRemaining < (p.bid - p.tricks)))
            {
                tricksClass = 'tricksBad';
            }
            else
            {
                tricksClass = 'tricksUnknown';
            }
            if(i == game.turn)
            {
                tdExtras = ' class="yourturntd"';
            }
            scoreboard += '<tr><td'+tdExtras+'><div class="name">'+p.name+'</div></td><td'+tdExtras+'><div class="'+tricksClass+'">'+tricks+'</div></td><td'+tdExtras+'>'+bid+'</td><td'+tdExtras+'>'+p.score+'</td></tr>';
        }
        scoreboard += "</table>";
    }

    trickTakerName = trickTaker;

    if(!arraysHaveSameContent(localPrev, newPrev))
    {
        localPrev = newPrev;

        if(localPile.length > newPile.length)
        {
            // a trick just finished, animate it!
            hideTrickTaker();
            for(var i = 0; i < 13; i++)
            {
                positionCard('#prev', i, i, PC_PILE);
                positionCard('#prev', i, i, PC_PREV | PC_ANIMATED | PC_DELAYED);
            }
        }
        else
        {
            showTrickTaker();
            for(var i = 0; i < 13; i++)
            {
                positionCard('#prev', i, i, PC_PREV);
            }
        }
    }

    $('#yourturn').css('bottom', '-1000px');
    if(game.players[game.turn].id == server.player.id)
    {
        $('#yourturn').animate(
        {
            'bottom': '0px'
        },
        {
            duration: 25000, queue: false
        });
    }

    if(!arraysHaveSameContent(localPile, newPile))
    {
        localPile = newPile;

        for(var i = 0; i < 13; i++)
        {
            positionCard('#pile', i, i, PC_PILE);
        }
    }

    if(!arraysHaveSameContent(localHand, newHand))
    {
        console.log("checking lastlocalhand: " + JSON.stringify(lastLocalHand));
        console.log("against newHand: " + JSON.stringify(newHand));

        if(arraysHaveSameContent(lastLocalHand, newHand)) // You tried to play an illegal move
        {
            localHand = lastLocalHand;
        }
        else
        {
            localHand = carefullyResetHand(localHand, newHand);
        }

        selectedCard = -1;
        for(var i = 0; i < 13; i++)
        {
            positionCard('#card', i, i, PC_NORMAL);
        }
    }

    //console.log("update hand:"+JSON.stringify(localHand)+" pile:"+JSON.stringify(localPile)+" prev:"+JSON.stringify(localPrev));

    setAllArt();

    $('#scoreboard').html(scoreboard);

    if(isOwner)
    {
        $('#nextButton').css('display', showNext ? 'block' : 'none');
        $('#waitText').css('display', 'none');
        $('#aiButton').css('display', lobbyState ? 'block' : 'none');
    }
    else
    {
        $('#waitText').css('display', showNext ? 'block' : 'none');
        $('#nextButton').css('display', 'none');
        $('#aiButton').css('display', 'none');
    }

    $('#playButton').css('display', showPlay ? 'block' : 'none');

    if(showLobby)
    {
        $('#joinGameList option').each(function() {
            $(this).remove();
        });

        $('#joinGameList').append('<option selected value="">Join Game (' + server.games.length + ' game(s) available)</option>');

        for(var i = 0; i < server.games.length; i++)
        {
            var game = server.games[i];
            $('#joinGameList').append('<option value="'+game.id+'">Game: '+game.players[0].name+', '+game.players.length+' player(s)</option>');
        }
    }

    var lobbyState = showLobby ? 'block' : 'none';
    $('#newGameList').css('display', lobbyState);
    $('#joinGameList').css('display', lobbyState);

    if(showLobby)
    {
        $('#newGameList').val('none');
    }

    if(bidCount >= 0)
    {
        $('#bidList option').each(function() {
            $(this).remove();
        });

        $('#bidList').append('<option selected value="none">Select Bid</option>');

        for(var i = 0; i <= bidCount; i++)
        {
            $('#bidList').append('<option value="'+i+'">Bid '+i+'</option>');
        }

        $('#bidList').css('display', 'block');
    }
    else
    {
        $('#bidList').css('display', 'none');
    }
/*
    var cols = 5;
    var step = ($(window).width()-100) / (cols);
    for(var i = 0; i <= bidCount; i++)
    {
        var x = 50 + (step * (i % cols));
        var y = 150 + (70 * Math.floor(i / cols));

        var id = '#bid' + String(i);
        $(id).css('left', String(x) + 'px');
        $(id).css('top',  String(y) + 'px');
        $(id).css('display', 'inline');
    }
    for(var i = bidCount+1; i <= 13; i++)
    {
        var id = '#bid' + String(i);
        $(id).css('display', 'none');
    }
    */

    if(server.player.name === 'Anonymous')
    {
        onRename();
    }

    $('#splash').css('display', 'none');

    if(summary)
    {
        $('#summary').html(summary);
        $('#summaryOuter').css('display', 'block');
    }
    else
    {
        $('#summaryOuter').css('display', 'none');
    }
}

function onServerError(data)
{
    console.log("onServerError: " + JSON.stringify(data));

    if(data.error)
    {
        $('#errors').html(data.error);
        $('#errors').css('opacity', 1);
        $('#errors').animate(
        {
            'opacity': 0
        },
        {
            duration: 3000, queue: false
        });
    }
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

    for(var i = 0; i < localPrev.length; i++)
    {
        id = '#prev' + String(i);
        setArt(id, localPrev[i]);
    }

    for(var i = localPrev.length; i < 5; i++)
    {
        id = '#prev' + String(i);
        setArt(id, -1);
    }
}

function fadePrev()
{
}

var PC_NORMAL   = 0;
var PC_SELECTED = (1 << 0);
var PC_ANIMATED = (1 << 1);
var PC_PILE     = (1 << 2);
var PC_PREV     = (1 << 3);
var PC_DELAYED  = (1 << 4);

function positionCard(prefix, index, viewIndex, flags)
{
    var id = prefix + String(index);

    var x = viewIndex * 66;
    var y = UNSELECTED_Y;
    if(flags & PC_SELECTED)
    {
        y = SELECTED_Y;
    }
    else
    {
        if(flags & PC_PILE)
        {
            x = index * 85;
            y = PILE_OFFSET_Y;
        }
        if(flags & PC_PREV)
        {
            x = (index * 15) + PREV_OFFSET_X;
            y = PILE_OFFSET_Y;
        }
    }

    var delay = 0;
    var queue = false;
    if(flags & PC_DELAYED)
    {
        if(!waitingOnAnim)
        {
            waitingOnAnim = true;
            queue = true;
        }
        delay = DELAY_MS;
    }

    if(flags & PC_ANIMATED)
    {
        $(id).css('opacity', 1);
        $(id).delay(delay).animate({ left: String(x) + 'px', top: String(y) + 'px' }, TRICK_ANIMATE_SPEED);
        if(queue)
        {
            $(id).queue(function()
                    {
                        waitingOnAnim = false;
                        showTrickTaker();
                        $(this).dequeue();
                    });
        }
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
        positionCard('#card', which, which, PC_NORMAL);
        return;
    }

    var playing = false;
    if(where == -1)
    {
        where = localHand.length - 1;
        playing = true;
        lastLocalHand = localHand.slice(0);
        console.log("remembering lastlocalhand: " + JSON.stringify(lastLocalHand));
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
        positionCard('#card', lc, c, (c == which) ? PC_SELECTED : PC_NORMAL);
    }
    positionCard('#card', where, which, PC_SELECTED);

    for(var i = 0; i < localHand.length; i++)
    {
        positionCard('#card', i, i, PC_ANIMATED);
    }
}

function playCard(which)
{
    localPile.push(localHand[which]);
    positionCard('#pile', localPile.length - 1, which, PC_PILE | PC_SELECTED);
    positionCard('#pile', localPile.length - 1, 0, PC_PILE | PC_ANIMATED);

    sendAction('play', { id:context.id, which: localHand[which] });
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

function onBid(x)
{
    sendAction('bid', {
        'id': context.id,
        'bid':x
        });
}

function onNextButton()
{
    sendAction('next');
}

function onAIButton()
{
    sendAction('addAI');
}

function onRename()
{
    var newName = prompt("Rename", server.player.name);
    if(!newName)
        return;

    sendAction('rename', {
        name: newName
    });
}

function onNewGame(rounds)
{
    sendAction('newGame', {
        rounds: rounds
    });
}

function onJoinGame(id)
{
    sendAction('joinGame', { id: id });
}

function onQuit()
{
    if(!server || !server.player.game)
        return;

    if((server.player.game.state != 'lobby') && (server.player.game.state != 'postGameSummary'))
    {
        if(!confirm("Quitting the game will end it for everyone. Are you sure?"))
            return;
    }

    sendAction('quitGame');
    $('#log').html('');
}

function clickCard(which)
{
    var id;

    if(selectedCard == which)
    {
        id = '#card' + String(selectedCard);
        $(id).animate({ top: String(UNSELECTED_Y)+'px' }, PLAY_ANIMATE_SPEED);
        selectedCard = -1;
    }
    else if(selectedCard == -1)
    {
        id = '#card' + String(which);
        $(id).animate({ top: String(SELECTED_Y)+'px' }, PLAY_ANIMATE_SPEED);
        selectedCard = which;
    }
    else
    {
        moveCard(selectedCard, which);
        selectedCard = -1;
    }
}

$('#joinGameList').change(function() {
    var chosen = false;
    $('#joinGameList option:selected').each(function() {
        chosen = $(this).val();
    });

    if(chosen)
    {
        onJoinGame(chosen);
    }
});

$('#bidList').change(function() {
    var chosen = false;
    $('#bidList option:selected').each(function() {
        chosen = $(this).val();
    });

    if(chosen != 'none')
    {
        onBid(chosen);
    }
});

$('#newGameList').change(function() {
    var chosen = false;
    $('#newGameList option:selected').each(function() {
        chosen = $(this).val();
    });

    if(chosen != 'none')
    {
        onNewGame(chosen);
    }
});

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
