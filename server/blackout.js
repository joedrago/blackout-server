var MIN_PLAYERS = 3;
var MAX_LOG_LINES = 8;
var OK = 'OK';
var State =
{
    LOBBY: 'lobby',

    BID: 'bid',
    BIDSUMMARY: 'bidSummary',
    TRICK: 'trick',
    ROUNDSUMMARY: 'roundSummary',

    POSTGAMESUMMARY: 'postGameSummary',
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
// AI Name Generator

var aiNames = [
    "Mario",
    "Luigi",
    "Toad",
    "Peach"
];

function randomName()
{
    var r = Math.floor(Math.random() * aiNames.length);
    return aiNames[r];
}

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
        this.id = params.id;
        this.state = State.LOBBY;
        this.players = params.players;
        this.counter = 0;
        this.log = [];
        this.rounds = params.rounds.split("|");

        this.players[0].bid = 0;
        this.players[0].tricks = 0;
        this.players[0].score = 0;

        this.output(this.players[0].name + ' creates game');
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

Game.prototype.rename = function(id, name)
{
    var player = this.findPlayer(id);
    if(player)
    {
        this.output(player.name + ' renamed to ' + name);
        player.name = name;
    }
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
    this.counter = 0;
    this.nextRound = 0;
    this.dealer = Math.floor(Math.random() * this.players.length);
    this.trumpBroken = false;
    this.output('Game reset. (' + this.players.length + ' players, ' + this.rounds.length + ' rounds)');

    this.startBid();

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
        player.hand.sort(function(a,b) { return a - b });
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
    var lowestPlayer = 0;
    var lowestCard = this.players[0].hand[0]; // hand is sorted, therefore hand[0] is the lowest
    for(var i = 1; i < this.players.length; i++)
    {
        var player = this.players[i];
        if(player.hand[0] < lowestCard)
        {
            lowestPlayer = i;
            lowestCard = player.hand[0];
        }
    }

    this.lowestRequired = true; // Next player is obligated to throw the lowest card
    this.turn = lowestPlayer;
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

        for(var i = 0; i < this.players.length; i++)
        {
            var player = this.players[i];
            var overUnder = player.bid - player.tricks;
            if(overUnder < 0)
                overUnder *= -1;

            var penaltyPoints = 0;
            var step = 1;
            while(overUnder > 0)
            {
                penaltyPoints += step++; // dat quadratic
                overUnder--;
            }

            player.score += penaltyPoints;

            player.lastWent = String(player.tricks) + '/' + String(player.bid);
            player.lastPoints = penaltyPoints;
        }

        // TODO: Penalty points here (with logging)

        if(this.nextRound >= this.rounds.length)
        {
            this.state = State.POSTGAMESUMMARY;
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
    this.state = State.POSTGAMESUMMARY;
    this.output('Someone quit; Game over');
}

Game.prototype.next = function(params)
{
    switch(this.state)
    {
        case State.LOBBY:
            {
                return this.reset(params);
            }
        case State.BIDSUMMARY:
            {
                return this.startTrick();
            }
        case State.ROUNDSUMMARY:
            {
                return this.startBid();
            }
        case State.POSTGAMESUMMARY:
            {
                return 'gameOver';
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

    params.bid = Number(params.bid);

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

    if(this.state != State.BID)
    {
        // Bidding ended

        this.output('Bidding ends ' + this.bids + '/' + this.tricks + '; ' + this.players[this.turn].name + ' throws first');
    }

    return OK;
}

Game.prototype.addPlayer = function(player)
{
    player.bid = 0;
    player.tricks = 0;
    player.score = 0;
    if(!player.ai)
    {
        player.ai = false;
    }
    this.players.push(player);
    this.output(player.name + " joins game (" + this.players.length + ")");
}

Game.prototype.namePresent = function(name)
{
    for(var i = 0; i < this.players.length; i++)
    {
        if(this.players[i].name === name)
            return true;
    }
    return false;
}

Game.prototype.addAI = function()
{
    if(this.players.length > 4)
    {
        return 'tooManyPlayers';
    }

    do
    {
    var name = randomName();
    } while(this.namePresent(name));

    var ai = {
        name: name,
        id: 'ai' + String(this.players.length),
        ai: true
    };
    this.addPlayer(ai);

    console.log("added AI player");
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

    if(params.hasOwnProperty('which'))
    {
        params.which = Number(params.which);
        params.index = -1;
        for(var i = 0; i < currentPlayer.hand.length; i++)
        {
            if(currentPlayer.hand[i] == params.which)
            {
                params.index = i;
                break;
            }
        }

        if(params.index == -1)
        {
            return 'doNotHave';
        }
    }
    else
    {
        params.index = Number(params.index);
    }

    if((params.index < 0) || (params.index >= currentPlayer.hand.length))
    {
        return 'indexOutOfRange';
    }

    if(this.lowestRequired && (params.index != 0))
    {
        return 'lowestCardRequired';
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

    this.lowestRequired = false;

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
// Exports

exports.newGame = function(params)
{
    var game = new Game(params);
    return game;
}

exports.State = State;
exports.OK = OK;

// ---------------------------------------------------------------------------------------------------------------------------
// AI

Game.prototype.aiTick = function()
{
    if((this.state != State.BID)
    && (this.state != State.TRICK))
        return false;

    var currentPlayer = this.currentPlayer();
    if(!currentPlayer.ai)
        return false;

    // TODO: Actually think about the AI a bit

    var reply;

    for(var i = 0; i <= currentPlayer.hand.length; i++)
    {
        reply = this.action({'counter': this.counter, 'id':currentPlayer.id, 'action': 'bid', 'bid':i});
        if(reply == OK)
        {
            console.log("AI: " + currentPlayer.name + " bids " + String(i));
            return true;
        }
        else
        {
            // console.log('AI FAIL BID ['+i+']: ' + reply);
        }
    }

    for(var i = 0; i < currentPlayer.hand.length; i++)
    {
        reply = this.action({'counter': this.counter, 'id':currentPlayer.id, 'action': 'play', 'index':i});
        if(reply == OK)
        {
            var card = new Card(currentPlayer.hand[i]);
            console.log("AI: " + currentPlayer.name + " plays " + card.name);
            return true;
        }
        else
        {
            // console.log('AI FAIL PLAY ['+i+']: ' + reply);
        }
    }

    return false;
}
