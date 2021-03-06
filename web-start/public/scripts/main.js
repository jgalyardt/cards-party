'use strict';

//Game setup variables
var STARTING_HAND_SIZE = 1;
var WHITE_DECK = [];
var WHITE_INDEX = 0; //Tracks position in WHITE_DECK
var NUM_PLAYERS = 0;
var TURN_INDEX = 0;
var MAX_SCORE = 8;
var IS_HOST = false;
var IS_IN_GAME = false;
var SELECTED_CARD = undefined;
var CARD_SETS = [];
var CARDS = undefined;

String.prototype.hashCode = function () {
  var hash = 0;
  if (this.length == 0) {
    return hash;
  }
  for (var i = 0; i < this.length; i++) {
    var char = this.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

checkSetup();
initFirebaseAuth();
$(function () {

  $('#controls-container').hide();
  $('.host-only').hide();
  $('#card-sets-container').hide();
  if (isUserSignedIn) {
    $('#sign-in-message').hide();
  }
  else {
    $('#controls-container').show();
  }

  $('#card-sets').click(function () {
    if ($('#response-container').is(':visible')) {
      $('#response-container').hide();
      $('#card-sets-container').show();
    }
    else {
      $('#card-sets-container').hide();
      $('#response-container').show();
    }
  });

  $(':checkbox').each(function(index) {
    if ($(this).is(':checked')) {
      console.log($(this));
      var setName = $(this).attr('id');
      CARD_SETS.append(setName.substring(8, setName.length));
    };
  });

  $(':checkbox').click(function() {
    console.log($(this).attr('id'));
    if ($(this).is(':checked')) {
      var setName = $(this).attr('id');
      CARD_SETS.push(setName.substring(8, setName.length));
    }
    else {
      var setName = $(this).attr('id');
      setName = setName.substring(8, setName.length);
      CARD_SETS.splice(CARD_SETS.indexOf(setName), 1);
    }
    CARDS = fetchJSON(CARD_SETS);
  });

  initializeGame();
  loadMessages();
});

//HTML Templates
var HAND_CARD_TEMPLATE =
  '<div class="mdl-cell mdl-cell--2-col">' +
  '<div class="hand-card-square mdl-card mdl-shadow--2dp">' +
  '<form action="#">' +
  '<div class="mdl-textfield mdl-js-textfield">' +
  '<textarea class="card-text mdl-textfield__input" type="text" rows= "7"></textarea>' +
  '</div>' +
  '</form>' +
  '</div>' +
  '</div>';

var WHITE_CARD_TEMPLATE =
  '<div class="mdl-cell mdl-cell--2-col">' +
  '<div class="white-card-square mdl-card mdl-shadow--2dp">' +
  '<div class="card-text mdl-card__supporting-text">' +
  '</div>' +
  '</div>' +
  '</div>';

var PLAYER_SCORE_TEMPLATE =
  '<div class="score-panel mdl-cell mdl-cell--1-col">' +
  '<div class="score-initials"></div>' +
  '<div class="score-number"></div>' +
  '</div>';

//CAH functions
function initializeGame() {
  var query = firebase.firestore()
    .collection('players')
    .where('host', '==', true)
    .where('name', '==', getUserName());
  query.get().then(function (snapshot) {
    if (snapshot.empty) {
      $('#host-game').show();
    }
    else {
      IS_HOST = true;
      $('#host-game').hide();
    }
  });
  loadActiveCards();
  bindPlayers();
  bindHand('all-blank');
  bindGameState();
}

//Snapshot to the game-state collection and run commands when a change happens
function bindGameState() {

  var query = firebase.firestore()
    .collection('black-card')
  query.onSnapshot(function (snapshot) {
    snapshot.docChanges().forEach(function (change) {
      var data = change.doc.data();
      $('#black-text').text(data.text);
    });
  });

  query = firebase.firestore()
    .collection('game-state')
  query.onSnapshot(function (snapshot) {
    snapshot.docChanges().forEach(function (change) {
      var data = change.doc.data();
      console.log('Game state changed to: ' + data.state);
      if (!IS_IN_GAME && data.state == 'gameReady') {
        //Make the join-game button start flashing
        $("#join-game").prop("disabled", false);
        $("#join-game").addClass("waiting");
        $("#host-game").hide();
      }
      else if (IS_IN_GAME && data.state == 'bindHand') {
        // if (data.mode == 'all-blank') {
        //   bindHand('all-blank');
        // }
      }
      else if (data.state == 'endRound') {

        $("#" + data.cardID).addClass('selected');
        $('.czar').removeClass('czar');
        $(submitCardElement).prop('disabled', false);

        //Only the host needs to run all these queries
        if (IS_HOST) {
          //Delete all active cards
          var query = firebase.firestore()
            .collection('active-cards')
          query.get().then(function (snapshot) {
            snapshot.forEach(function (card) {
              console.log(card);
              card.ref.delete();
            });
          });

          //Add one to the winning player's score
          var query = firebase.firestore()
            .collection('players')
            .where('name', '==', data.winner);
          query.get().then(function (snapshot) {
            snapshot.docs[0].ref.set({
              score: snapshot.docs[0].get('score') + 1
            }, { merge: true });
          });

          //Remove the current czar
          var query = firebase.firestore()
            .collection('players')
            .where('czar', '==', true);
          query.get().then(function (snapshot) {
            snapshot.docs[0].ref.set({
              czar: false
            }, { merge: true });
          });

          //Pick the next card czar
          TURN_INDEX = TURN_INDEX == (NUM_PLAYERS - 1) ? 0 : TURN_INDEX + 1;
          firebase.firestore().collection('players').get().then(function (players) {
            players.docs[TURN_INDEX].ref.set({
              czar: true
            }, { merge: true });
          });

          //Set a new black card
          newBlackCard();

          change.doc.ref.set({
            state: 'idle'
          });
        }

      }
      else if (data.state == 'endGame') {
        $('.hand-container').children().each(function () {
          $(this).remove();
        });
      }
    });
  });
}

function hostGame() {
  IS_HOST = true;
  CARDS = fetchJSON(CARD_SETS);
  firebase.firestore().collection('game-state').get().then(function (state) {
    state.docs[0].ref.set({
      state: 'gameReady'
    });
  });
  $('.host-only').show();
  $('#host-game').hide();
}

function startGame() {
  firebase.firestore().collection('game-state').get().then(function (state) {
    state.docs[0].ref.set({
      state: 'init'
    });
  });
  startFirstTurn('all-blank');
}

function newBlackCard() {
  var randomSet = Math.floor(Math.random() * CARDS.length);
  var blackCard = CARDS[randomSet]['blackCards'][Math.floor(Math.random() * CARDS[randomSet]['blackCards'].length)];
  // while (blackCard['pick'] != 1) {
  //   blackCard = CARDS['blackCards'][Math.floor(Math.random() * CARDS['blackCards'].length)];
  // }

  firebase.firestore().collection('black-card').get().then(function (card) {
    card.docs[0].ref.set({
      text: blackCard['text']
    });
  });
}

function endGame() {
  firebase.firestore().collection('game-state').get().then(function (state) {
    state.docs[0].ref.set({
      state: 'endGame'
    });
  });

  var cardQuery = firebase.firestore()
    .collection('white-cards')
    .where('assigned', '==', true);
  cardQuery.get().then(function (cards) {
    //Reset any previously assigned cards
    cards.forEach(function (card) {
      card.ref.set({
        text: card.get('text'),
      });
    });
  });
  var cardQuery = firebase.firestore()
    .collection('players')
  cardQuery.get().then(function (players) {
    //Reset any previously assigned cards
    players.forEach(function (player) {
      player.ref.set({
        score: 0,
        czar: false
      }, { merge: true });
    });
  });
  var cardQuery = firebase.firestore()
    .collection('active-cards');
  cardQuery.get().then(function (cards) {
    //Delete all active cards
    cards.forEach(function (card) {
      card.ref.delete();
    });
  });
}

function startFirstTurn(gameMode) {

  newBlackCard();

  if (gameMode == 'all-blank') {
    firebase.firestore().collection('game-state').get().then(function (state) {
      state.docs[0].ref.set({
        state: 'bindHand',
        mode: 'all-blank'
      });
    });
    var playerQuery = firebase.firestore()
      .collection('players');
    playerQuery.get().then(function (players) {
      //Randomly select a player to start
      TURN_INDEX = Math.floor(Math.random() * NUM_PLAYERS);
      players.docs[TURN_INDEX].ref.set({
        czar: true
      }, { merge: true });
    });
  }
  else if (gameMode == 'classic') {
    //FOLLOWING CODE APPLIES TO ORIGINAL CAH RULES
    //Begin by shuffling the deck and dealing starting hands
    var playerQuery = firebase.firestore()
      .collection('players');
    playerQuery.get().then(function (players) {
      var cardQuery = firebase.firestore()
        .collection('white-cards');
      cardQuery.get().then(function (cards) {
        //Create a shuffled card order (emulates a deck of cards)
        WHITE_DECK = [];
        for (var i = 0; i < cards.size; i++) {
          WHITE_DECK.push(i);
        }
        for (var i = cards.size - 1; i > 0; i--) {
          var j = Math.floor(Math.random() * (i + 1));
          var temp = WHITE_DECK[i];
          WHITE_DECK[i] = WHITE_DECK[j];
          WHITE_DECK[j] = temp;
        }
        //Assign players a number of cards equal to STARTING_HAND_SIZE
        WHITE_INDEX = 0;
        players.forEach(function (player) {
          for (var i = 0; i < STARTING_HAND_SIZE; i++) {
            if (WHITE_INDEX > WHITE_DECK.length) {
              console.log("Error: Not enough white cards for all players!");
              break;
            }
            var playerName = player.get('name');
            cards.docs[WHITE_DECK[WHITE_INDEX]].ref.set({
              assigned: true,
              assignedPlayer: playerName
            }, { merge: true });
            WHITE_INDEX++;
          }
        });
        //Randomly select a player to start
        TURN_INDEX = Math.floor(Math.random() * NUM_PLAYERS);
        players.docs[TURN_INDEX].ref.set({
          czar: true
        }, { merge: true });
      });
    });
  }

  firebase.firestore().collection('game-state').get().then(function (state) {
    state.docs[0].ref.set({
      state: 'bindHand'
    });
  });
}

//Binds the player's hand to white-cards in firestore where the assignedPlayer field == their username
function bindHand(gameMode) {
  if (gameMode == 'all-blank') {
    for (var i = 0; i < STARTING_HAND_SIZE; i++) {
      displayCardInHand('blank' + (Math.random().toString()).hashCode(), '');
    }
  }
  else if (gameMode == 'classic') {
    var query = firebase.firestore()
      .collection('white-cards')
      .limit(STARTING_HAND_SIZE)
      .where('assignedPlayer', '==', getUserName());
    query.onSnapshot(function (snapshot) {
      snapshot.docChanges().forEach(function (change) {
        if (change.type == 'removed') {
          removeCardFromUI(change.doc.id);
        } else {
          var card = change.doc.data();
          displayCardInHand(change.doc.id, card.text);
        }
      });
    });
  }

}

function displayCardInHand(id, text) {
  var div = document.getElementById(id);
  // If an element for that message does not exists yet we create it.
  if (!div) {
    var container = document.createElement('div');
    container.innerHTML = HAND_CARD_TEMPLATE;
    div = container.firstChild;
    div.firstChild.setAttribute('id', id);
    handListElement.appendChild(div);
  }
  if (text != '') {
    div.querySelector('.card-text').textContent = text;
  }


  $("#" + id).click(function () {
    if (SELECTED_CARD != null) {
      SELECTED_CARD.removeClass("selected");
    }
    $(this).addClass("selected");
    SELECTED_CARD = $(this);
  })
}

function submitCard() {
  //Remove assignedPlayer value from card

  // var cardQuery = firebase.firestore()
  //   .collection('white-cards')
  //   .where('text', '==', $(SELECTED_CARD).text());
  // cardQuery.get().then(function (cards) {
  //   cards.docs[0].ref.set({
  //     text: cards.docs[0].get('text')
  //   });
  // });
  var div = document.getElementById($(SELECTED_CARD).attr("id"));
  firebase.firestore().collection('active-cards').add({
    id: $(SELECTED_CARD).attr("id"),
    text: $(div.querySelector('.card-text')).val(),
    player: getUserName(),
    selected: false,
    hidden: true
  }).catch(function (error) {
    console.error('Error writing new message to Firebase Database', error);
  });
  $(SELECTED_CARD).parent().remove();
  displayCardInHand('blank' + (Math.random().toString()).hashCode(), '');
  $(submitCardElement).prop('disabled', true);
}

function loadActiveCards() {
  var query = firebase.firestore()
    .collection('active-cards')
    .limit(12);
  query.onSnapshot(function (snapshot) {
    snapshot.docChanges().forEach(function (change) {
      if (change.type == 'removed') {
        removeCardFromUI(change.doc.id);
      } else {
        var card = change.doc.data();
        displayActiveCard(change.doc.id, card.text, card.player, card.selected, card.hidden);
        if ($('#response-container').children().length >= NUM_PLAYERS - 1) {
          firebase.firestore().collection('active-cards').get().then(function(snapshot) {
            snapshot.forEach(function(item) {
              item.ref.set({
                hidden: false
              }, { merge: true });
            });
          });
        }
      }
    });
  });
}

function displayActiveCard(id, text, player, selected, hidden) {
  var div = document.getElementById(id);
  // If an element for that message does not exists yet we create it.
  if (!div) {
    var container = document.createElement('div');
    container.innerHTML = WHITE_CARD_TEMPLATE;
    div = container.firstChild;
    div.firstChild.setAttribute('id', id);
    responseListElement.appendChild(div);
  }
  if (hidden) {
    div.querySelector('.card-text').innerHTML = '<p class="hidden-card">?</p>';
  }
  else {
    div.querySelector('.card-text').innerHTML = text;

    $("#" + id).click(function () {
      var query = firebase.firestore()
        .collection('players')
        .where('czar', '==', true)
        .where('name', '==', getUserName());
      query.get().then(function (snapshot) {
        if ($('#response-container').children().length >= NUM_PLAYERS - 1) {
          if (snapshot.size > 0) {
            firebase.firestore().collection('active-cards').doc(id).get().then(function (card) {
              card.ref.set({
                selected: true
              }, { merge: true });
            }).catch(function (error) {
              console.error("Error updating document: ", error);
            });
            firebase.firestore().collection('game-state').get().then(function (state) {
              state.docs[0].ref.set({
                state: 'endRound',
                czar: getUserName(),
                winner: player,
                cardID: id
              });
            });
          }
        }
      });
    });
  }
}

function removeCardFromUI(id) {
  $("#" + id).parent().fadeOut(4000, function () {
    $(this).remove();
  });
}

function joinGame() {
  $("#join-game").prop("disabled", true);
  $("#join-game").removeClass("waiting");
  var query = firebase.firestore()
    .collection('players')
    .where('name', '==', getUserName());
  query.get().then(function (snapshot) {
    if (snapshot.size > 0) {
      console.log("Player '" + getUserName() + "' is already in the game.");
      return;
    }
    else {
      IS_IN_GAME = true;
      return firebase.firestore().collection('players').add({
        name: getUserName(),
        initials: getInitials(),
        host: IS_HOST,
        score: 0,
        czar: false
      }).catch(function (error) {
        console.error('Error writing new message to Firebase Database', error);
      });
    }
  }).catch(function (error) {
    console.error('Error reading from Firebase Database', error);
  });
}

function getInitials() {
  var nameArray = getUserName().split(" ");
  return getUserName().substring(0, 7);
}

function bindPlayers() {
  var query = firebase.firestore()
    .collection('players')
    .limit(10);
  query.onSnapshot(function (snapshot) {
    NUM_PLAYERS = snapshot.size;
    snapshot.docChanges().forEach(function (change) {
      var player = change.doc.data();
      if (change.type == 'removed') {
        IS_IN_GAME = !(player.name == getUserName());
        $("#" + change.doc.id).remove();
      }
      else if (player.score == MAX_SCORE) {
        firebase.firestore().collection('game-state').get().then(function (state) {
          state.docs[0].ref.set({
            state: 'gameOver',
            winner: player.name
          });
        });
      }
      else {
        if (player.name == getUserName()) {
          IS_IN_GAME = true;
          $(submitCardElement).prop('disabled',
            player.czar ? true : false);
        }
        if (player.host == true) {
          $('#host-game').hide();
          CARDS = fetchJSON(CARD_SETS);
        }
        if (player.name == getUserName() && player.host == true) {
          IS_HOST = true;
          $('.host-only').show();
        }

        displayPlayer(change.doc.id, player.initials, player.score, player.czar);
      }
    });
  });
}

function displayPlayer(id, initials, score, czar) {
  var div = document.getElementById(id);
  // If an element for that message does not exists yet we create it.
  if (!div) {
    var container = document.createElement('div');
    container.innerHTML = PLAYER_SCORE_TEMPLATE;
    div = container.firstChild;
    div.setAttribute('id', id);
    infoListElement.appendChild(div);
  }
  div.querySelector('.score-initials').textContent = initials + ':';
  div.querySelector('.score-number').textContent = score.toString();
  if (czar) {
    console.log('new czar: ' + initials);
    $("#" + id).addClass('czar');
  }
  else {
    $("#" + id).removeClass('czar');
  }
}

//End CAH functions ###!

// Signs-in for chat.
function signIn() {
  var provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider);
}

// Signs-out of Friendly Chat.
function signOut() {
  firebase.auth().signOut();
}

// Initiate firebase auth.
function initFirebaseAuth() {
  firebase.auth().onAuthStateChanged(authStateObserver);
}

// Returns the signed-in user's profile Pic URL.
function getProfilePicUrl() {
  return firebase.auth().currentUser.photoURL || '/images/profile_placeholder.png';
}

// Returns the signed-in user's display name.
function getUserName() {
  if (!isUserSignedIn()) {
    return 'ERR_PLAYER_NOT_SIGNED_IN';
  }
  return firebase.auth().currentUser.displayName;
}

// Returns true if a user is signed-in.
function isUserSignedIn() {
  return !!firebase.auth().currentUser;
}

// Saves a new message on the Firebase DB.
function saveMessage(messageText) {
  return firebase.firestore().collection('messages').add({
    name: getUserName(),
    text: messageText,
    profilePicUrl: getProfilePicUrl(),
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(function (error) {
    console.error('Error writing new message to Firebase Database', error);
  });
}

// Loads chat messages history and listens for upcoming ones.
function loadMessages() {
  var query = firebase.firestore()
    .collection('messages')
    .orderBy('timestamp', 'desc')
    .limit(12);

  query.onSnapshot(function (snapshot) {
    snapshot.docChanges().forEach(function (change) {
      if (change.type == 'removed') {
        deleteMessage(change.doc.id);
      } else {
        var message = change.doc.data();
        displayMessage(change.doc.id, message.timestamp, message.name, message.text, message.profilePicUrl, message.imageUrl);
      }
    });
  });
}

// Triggered when the send new message form is submitted.
function onMessageFormSubmit(e) {
  e.preventDefault();
  // Check that the user entered a message and is signed in.
  if (messageInputElement.value && checkSignedInWithMessage()) {
    saveMessage(messageInputElement.value).then(function () {
      // Clear message text field and re-enable the SEND button.
      resetMaterialTextfield(messageInputElement);
      toggleButton();
    });
  }
}

// Triggers when the auth state change for instance when the user signs-in or signs-out.
function authStateObserver(user) {
  if (user) { // User is signed in!
    //$('#sign-in-message').hide();
    $('#user-container').hide();
    $('#controls-container').show();
    // Show user's profile and sign-out button.
    //signOutButtonElement.removeAttribute('hidden');

    // Hide sign-in button.
    signInButtonElement.setAttribute('hidden', 'true');


  } else { // User is signed out!
    $('#controls-container').hide();
    $('#sign-in-message').show();
    // Hide user's profile and sign-out button.
    signOutButtonElement.setAttribute('hidden', 'true');

    // Show sign-in button.
    signInButtonElement.removeAttribute('hidden');
  }
}

// Returns true if user is signed-in. Otherwise false and displays a message.
function checkSignedInWithMessage() {
  // Return true if the user is signed in Firebase
  if (isUserSignedIn()) {
    return true;
  }

  // Display a message to the user using a Toast.
  var data = {
    message: 'You must sign-in first',
    timeout: 2000
  };
  signInSnackbarElement.MaterialSnackbar.showSnackbar(data);
  return false;
}

// Resets the given MaterialTextField.
function resetMaterialTextfield(element) {
  element.value = '';
  element.parentNode.MaterialTextfield.boundUpdateClassesHandler();
}

// Template for messages.
var MESSAGE_TEMPLATE =
  '<div class="message-container">' +
  '<div class="spacing"><div class="pic"></div></div>' +
  '<div class="message"></div>' +
  '<div class="name"></div>' +
  '</div>';

// Adds a size to Google Profile pics URLs.
function addSizeToGoogleProfilePic(url) {
  if (url.indexOf('googleusercontent.com') !== -1 && url.indexOf('?') === -1) {
    return url + '?sz=150';
  }
  return url;
}

// A loading image URL.
var LOADING_IMAGE_URL = 'https://www.google.com/images/spin-32.gif?a';

// Delete a Message from the UI.
function deleteMessage(id) {
  var div = document.getElementById(id);
  // If an element for that message exists we delete it.
  if (div) {
    div.parentNode.removeChild(div);
  }
}

// Displays a Message in the UI.
function displayMessage(id, timestamp, name, text, picUrl, imageUrl) {
  var div = document.getElementById(id);
  // If an element for that message does not exists yet we create it.
  if (!div) {
    var container = document.createElement('div');
    container.innerHTML = MESSAGE_TEMPLATE;
    div = container.firstChild;
    div.setAttribute('id', id);
    div.setAttribute('timestamp', timestamp);
    for (var i = 0; i < messageListElement.children.length; i++) {
      var child = messageListElement.children[i];
      var time = child.getAttribute('timestamp');
      if (time && time > timestamp) {
        break;
      }
    }
    messageListElement.insertBefore(div, child);
  }
  if (picUrl) {
    div.querySelector('.pic').style.backgroundImage = 'url(' + addSizeToGoogleProfilePic(picUrl) + ')';
  }
  div.querySelector('.name').textContent = name;
  var messageElement = div.querySelector('.message');
  if (text) { // If the message is text.
    messageElement.textContent = text;
    // Replace all line breaks by <br>.
    messageElement.innerHTML = messageElement.innerHTML.replace(/\n/g, '<br>');
  }
  // Show the card fading-in and scroll to view the new message.
  setTimeout(function () { div.classList.add('visible') }, 1);
  messageListElement.scrollTop = messageListElement.scrollHeight;
  messageInputElement.focus();
}

// Enables or disables the submit button depending on the values of the input
// fields.
function toggleButton() {
  if (messageInputElement.value) {
    $(submitButtonElement).prop('disabled', false);
  } else {
    $(submitButtonElement).prop('disabled', true);
  }
}

// Checks that the Firebase SDK has been correctly setup and configured.
function checkSetup() {
  if (!window.firebase || !(firebase.app instanceof Function) || !firebase.app().options) {
    window.alert('You have not configured and imported the Firebase SDK. ' +
      'Make sure you go through the codelab setup instructions and make ' +
      'sure you are running the codelab using `firebase serve`');
  }
}

// Shortcuts to DOM Elements.
var handListElement = document.getElementById('hand-container');
var responseListElement = document.getElementById('response-container');
var infoListElement = document.getElementById('info-container');
var submitCardElement = document.getElementById('submit-card');
var hostGameElement = document.getElementById('host-game');
var joinGameElement = document.getElementById('join-game');
var startGameElement = document.getElementById('start-game');
var endGameElement = document.getElementById('end-game');

var messageListElement = document.getElementById('messages');
var messageFormElement = document.getElementById('message-form');
var messageInputElement = document.getElementById('message');
var submitButtonElement = document.getElementById('submit');

var signInButtonElement = document.getElementById('sign-in');
var signOutButtonElement = document.getElementById('sign-out');
var signInSnackbarElement = document.getElementById('must-signin-snackbar');

//Listeners
submitCardElement.addEventListener('click', submitCard);
hostGameElement.addEventListener('click', hostGame);
joinGameElement.addEventListener('click', joinGame);
startGameElement.addEventListener('click', startGame);
endGameElement.addEventListener('click', endGame);


// Saves message on form submit.
messageFormElement.addEventListener('submit', onMessageFormSubmit);
signOutButtonElement.addEventListener('click', signOut);
signInButtonElement.addEventListener('click', signIn);

// Toggle for the button.
messageInputElement.addEventListener('keyup', toggleButton);
messageInputElement.addEventListener('change', toggleButton);

// initialize Firebase


// Remove the warning about timstamps change. 
var firestore = firebase.firestore();
var settings = { timestampsInSnapshots: true };
firestore.settings(settings);

// TODO: Enable Firebase Performance Monitoring.

// We load currently existing chat messages and listen to new ones.

