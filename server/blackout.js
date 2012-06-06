var MIN_PLAYERS = 3;
var MAX_LOG_LINES = 40;
var OK = 'OK';
var State =
{
    LOBBY: 'lobby',

    GAMESUMMARY: 'gameSummary',

    BID: 'bid',
    BIDSUMMARY: 'bidSummary',
    TRICK: 'trick',

    ROUNDSUMMARY: 'roundSummary',
};

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

// ---------------------------------------------------------------------------------------------------------------------------
// Card

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

function cardBeats(challengerX, championX, currentSuit)
{
    var challenger = new Card(challengerX);
    var champion = new Card(championX);

    if(challenger.suit == champion.suit)
    {
        // Easy case... same suit, just test value
        return (challenger.value > champion.value);
    }
    else
    {
        if(challenger.suit == Suit.SPADES)
        {
            // Trump; guaranteed win
            return true;
        }
        else
        {
            // Dump; guaranteed loss
            return false;
        }
    }

    return false;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Deck

function ShuffledDeck()
{
    // dat inside-out shuffle!

    this.cards = [ 0 ];
    for(var i = 1; i < 52; i++)
    {
        var j = Math.floor(Math.random() * i);
        this.cards.push(this.cards[j]);
        this.cards[j] = i;
    }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Game

function Game(params)
{
    if(!params)
        return;

    if(params.json)
    {
        var data;
        try
        {
            data = JSON.parse(params.json);
        }
        catch(err)
        {
            console.log("JSON parse error: " + err);
        }

        if(data)
        {
            for(k in data)
            {
                if(data.hasOwnProperty(k))
                {
                    this[k] = data[k];
                }
            }
        }
    }
    else
    {
        // new game
        this.state = State.LOBBY;
        this.players = params.players;
        this.counter = 0;
    }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Game methods

Game.prototype.findPlayer = function(id)
{
    for(var i = 0; i < this.players.length; i++)
    {
        if(this.players[i].id == id)
            return this.players[i];
    }
    return undefined;
}

Game.prototype.findOwner = function()
{
    return this.players[0];
}

Game.prototype.currentPlayer = function()
{
    return this.players[this.turn];
}

Game.prototype.currentSuit = function()
{
    if(this.pile.length == 0)
        return Suit.NONE;

    var card = new Card(this.pile[0]);
    return card.suit;
}

Game.prototype.playerHasSuit = function(player, suit)
{
    for(var i = 0; i < player.hand.length; i++)
    {
        var card = new Card(player.hand[i]);
        if(card.suit == suit)
            return true;
    }
    return false;
}

Game.prototype.playerHasOnlySpades = function(player)
{
    for(var i = 0; i < player.hand.length; i++)
    {
        var card = new Card(player.hand[i]);
        if(card.suit != Suit.SPADES)
            return false;
    }
    return true;
}

Game.prototype.playerCanWinInSuit = function(player, championCard)
{
    for(var i = 0; i < player.hand.length; i++)
    {
        var card = new Card(player.hand[i]);
        if(card.suit == championCard.suit)
        {
            if(card.value > championCard.value)
                return true;
        }
    }
    return false;
}

Game.prototype.bestInPile = function()
{
    if(this.pile.length == 0)
        return -1;

    var currentSuit = this.currentSuit();
    var best = 0;
    for(var i = 1; i < this.pile.length; i++)
    {
        if(cardBeats(this.pile[i], this.pile[best], currentSuit))
        {
            best = i;
        }
    }
    return best;
}

Game.prototype.playerAfter = function(index)
{
    return (index + 1) % this.players.length;
}

Game.prototype.output = function(text)
{
    this.log.push(text);
    if(this.log.length > MAX_LOG_LINES)
    {
        this.log.shift();
    }
}

Game.prototype.reset = function(params)
{
    if(this.players.length < MIN_PLAYERS)
    {
        return 'notEnoughPlayers';
    }

    for(var i = 0; i < this.players.length; i++)
    {
        var player = this.players[i];
        player.score = 0;
        player.hand = [];
    }
    this.state = State.GAMESUMMARY;
    this.counter = 0;
    this.rounds = [3, 3];
    this.nextRound = 0;
    this.dealer = 0; // TODO: choose random player?
    this.log = [];
    this.trumpBroken = false;
    this.output('Game reset. (' + this.players.length + ' players, ' + this.rounds.length + ' rounds)');

    return OK;
}

Game.prototype.startBid = function(params)
{
    if(this.nextRound >= this.rounds.length)
    {
        return 'gameOver';
    }

    this.tricks = this.rounds[this.nextRound];
    this.nextRound++;

    var deck = new ShuffledDeck();
    for(var i = 0; i < this.players.length; i++)
    {
        var player = this.players[i];
        player.bid = -1;
        player.tricks = 0;

        player.hand = [];
        for(var j = 0; j < this.tricks; j++)
        {
            player.hand.push(deck.cards.shift());
        }
    }

    this.state = State.BID;
    this.turn = this.playerAfter(this.dealer);
    this.bids = 0;
    this.pile = [];

    this.output('Round ' + this.nextRound + ' begins; ' + this.players[this.turn].name + ' bids first');

    return OK;
}

Game.prototype.endBid = function()
{
    this.turn = this.playerAfter(this.dealer); // TODO: should be lowest club/card
    this.state = State.BIDSUMMARY;
}

Game.prototype.startTrick = function(params)
{
    // this.turn should already be correct, either from endBid (lowest club) or endTrick (last trickTaker)

    this.trickTaker = -1;
    this.state = State.TRICK;

    return OK;
}

Game.prototype.endTrick = function()
{
    var taker = this.players[this.trickTaker];
    taker.tricks++;

    this.output(taker.name + ' pockets the trick [' + taker.tricks + ']');
    this.turn = this.trickTaker;

    if(this.players[0].hand.length > 0)
    {
        this.startTrick();
    }
    else
    {
        this.output('Round ends [' + this.nextRound + '/' + this.rounds.length + ']');

        // TODO: Penalty points here (with logging)

        if(this.nextRound >= this.rounds.length)
        {
            this.state = State.GAMESUMMARY;
        }
        else
        {
            this.state = State.ROUNDSUMMARY;
        }
    }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Game actions

Game.prototype.quit = function(params)
{
}

Game.prototype.next = function(params)
{
    switch(this.state)
    {
        case State.LOBBY:
            {
                return this.reset(params);
            }
        case State.GAMESUMMARY:
            {
                return this.startBid();
            }
        case State.BIDSUMMARY:
            {
                return this.startTrick();
            }
        case State.ROUNDSUMMARY:
            {
                return this.startBid();
            }
        default:
            {
                return 'noNext';
            }
    }
    return 'nextIsConfused';
}

Game.prototype.bid = function(params)
{
    if(this.state != State.BID)
    {
        return 'notBiddingNow';
    }

    var currentPlayer = this.currentPlayer();
    if(params.id != currentPlayer.id)
    {
        return 'notYourTurn';
    }

    if((params.bid < 0) || (params.bid > this.tricks))
    {
        return 'bidOutOfRange';
    }

    if(this.turn == this.dealer)
    {
        if((this.bids + params.bid) == this.tricks)
        {
            return 'dealerFucked';
        }

        this.endBid();
    }
    else
    {
        this.turn = this.playerAfter(this.turn);
    }

    currentPlayer.bid = params.bid;
    this.bids += currentPlayer.bid;
    this.output(currentPlayer.name + " bids " + currentPlayer.bid);

    return OK;
}

Game.prototype.play = function(params)
{
    if(this.state != State.TRICK)
    {
        return 'notInTrick';
    }

    var currentPlayer = this.currentPlayer();
    if(params.id != currentPlayer.id)
    {
        return 'notYourTurn';
    }

    if((params.index < 0) || (params.index >= currentPlayer.hand.length))
    {
        return 'indexOutOfRange';
    }

    var chosenCardX = currentPlayer.hand[params.index];
    var chosenCard = new Card(chosenCardX);

    var oldPile = this.pile;
    if(this.trickTaker == -1)
    {
        // Lazily clear the pile so people can see it
        this.pile = [];
    }

    if((!this.trumpBroken)                         // Ensure that trump is broken
    && (this.pile.length == 0)                     // before allowing someone to lead
    && (chosenCard.suit == Suit.SPADES)            // with spades
    && (!this.playerHasOnlySpades(currentPlayer))  // unless it is all they have
    )
    {
        this.pile = oldPile;
        return 'trumpNotBroken';
    }

    var bestIndex = this.bestInPile();
    var forcedSuit = this.currentSuit();
    if(forcedSuit != Suit.NONE) // safe to assume (bestIndex != -1) in this block
    {
        if(this.playerHasSuit(currentPlayer, forcedSuit))
        {
            // You must throw in-suit if you have one of that suit
            if(chosenCard.suit != forcedSuit)
            {
                this.pile = oldPile;
                return 'forcedInSuit';
            }

            // If the current winner is winning in-suit, you must try to beat them in-suit
            var currentWinningCardX = this.pile[bestIndex];
            var currentWinningCard = new Card(currentWinningCardX);
            if(currentWinningCard.suit == forcedSuit)
            {
                if((!cardBeats(chosenCardX, currentWinningCardX, forcedSuit))
                && (this.playerCanWinInSuit(currentPlayer, currentWinningCard))
                )
                {
                    this.pile = oldPile;
                    return 'forcedHigherInSuit';
                }
            }
        }
        else
        {
            // Current player doesn't have that suit, don't bother
            forcedSuit = Suit.NONE;
        }
    }

    // If you get here, you can throw whatever you want, and it
    // will either put you in the lead, trump, or dump.

    // Throw the card on the pile, advance the turn
    this.pile.push(currentPlayer.hand[params.index]);
    currentPlayer.hand.splice(params.index, 1);

    // Recalculate best index
    bestIndex = this.bestInPile();
    if(bestIndex == (this.pile.length - 1))
    {
        // The card this player just threw is the best card. Claim the trick.
        this.trickTaker = this.turn;
    }

    var msg;
    if(this.pile.length == 1)
    {
        msg = currentPlayer.name + " leads with " + chosenCard.name;
    }
    else
    {
        if(this.trickTaker == this.turn)
        {
            msg = currentPlayer.name + " claims the trick with " + chosenCard.name;
        }
        else
        {
            msg = currentPlayer.name + " dumps " + chosenCard.name;
        }
    }

    if((!this.trumpBroken)
    && (chosenCard.suit == Suit.SPADES)
    )
    {
        msg += " (trump broken)";
        this.trumpBroken = true;
    }

    this.output(msg);

    if(this.pile.length == this.players.length)
    {
        this.endTrick();
    }
    else
    {
        this.turn = this.playerAfter(this.turn);
    }
    return OK;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Action dispatch

var sDispatch =
{
    'next': Game.prototype.next,
    'bid': Game.prototype.bid,
    'play': Game.prototype.play,

    'quit': Game.prototype.quit
};

Game.prototype.action = function(params)
{
    if((params.action != 'quit')                                // the only action everyone can do
    && (this.state != State.BID) && (this.state != State.TRICK) // the only states where non-owners get a say in things
    && (params.id != this.findOwner().id)                       // test to see if you're the owner
    )
    {
        return 'ownerOnly';
    }

    if(!this[params.action])
    {
        return 'unknownAction';
    }

    if(this.counter != params.counter)
    {
        return 'staleCounter';
    }

    var reply = this[params.action](params);
    if(reply == OK)
    {
        this.counter++;
    }
    return reply;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Test helpers

function perform(game, expl, action)
{
    console.log('------------------------------------------------------------');
    console.log('Action: ' + expl + '\n        => ' + JSON.stringify(action));
    var reply = game.action(action);
    console.log('Reply : ' + reply);
    console.log('State : ' + JSON.stringify(game, null, '  '));
    return reply;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Test code

var params =
{
    'players': [
        {'id':'j', 'name': 'joe'}
    ]
};
var game = new Game(params);
game.players.push({'id':'c', 'name': 'chris'});
game.players.push({'id':'d', 'name': 'dave'});

perform(game, "next", {'counter':game.counter, 'id':'j', 'action': 'next'}); // start game

for(var rounds = 0; rounds < 20; rounds++)
{
    perform(game, "next", {'counter':game.counter, 'id':'j', 'action': 'next'}); // start bid

    perform(game, "bid", {'counter':game.counter, 'id':'c', 'action': 'bid', 'bid':1});
    perform(game, "bid", {'counter':game.counter, 'id':'d', 'action': 'bid', 'bid':1});
    perform(game, "bid", {'counter':game.counter, 'id':'j', 'action': 'bid', 'bid':0});

    perform(game, "next", {'counter':game.counter, 'id':'j', 'action': 'next'}); // start trick

    for(var i = 0; i < 3; i++)
        if(OK == perform(game, "play", {'counter':game.counter, 'id':'c', 'action': 'play', 'index':i}))
            break;

    for(var i = 0; i < 3; i++)
        if(OK == perform(game, "play", {'counter':game.counter, 'id':'d', 'action': 'play', 'index':i}))
            break;

    for(var i = 0; i < 3; i++)
        if(OK == perform(game, "play", {'counter':game.counter, 'id':'j', 'action': 'play', 'index':i}))
            break;
}
