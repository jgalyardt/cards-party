'use strict';

//Game setup variables
var STARTING_HAND_SIZE = 3;
var WHITE_DECK = [];
var WHITE_INDEX = 0; //Tracks position in WHITE_DECK
var IS_IN_GAME = false;

//Backend declarations
var selectedCard = undefined;

$(function () {
  initializeGame();
});

//HTML Templates
var HAND_CARD_TEMPLATE =
  '<div class="mdl-cell mdl-cell--2-col">' +
  '<div class="hand-card-square mdl-card mdl-shadow--2dp">' +
  '<div class="card-text mdl-card__supporting-text">' +
  '</div>' +
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
  loadActiveCards();
  bindPlayers();
  bindGameState();
}

//Snapshot to the game-state collection and run commands when a change happens
function bindGameState() {
  
  var query = firebase.firestore()
    .collection('game-state')
  query.onSnapshot(function (snapshot) {
    snapshot.docChanges().forEach(function (change) {
      console.log('Game state changed to: ' + change.doc.get('state'));
      if (IS_IN_GAME && change.doc.get('state') == 'bindHand') {
        bindHand();
      }
    });
  });
}

function startGame() {
  var stateQuery = firebase.firestore()
    .collection('game-state');
  stateQuery.get().then(function (state) {
    state.docs[0].ref.set({
      state: 'init'
    });
  });
  dealStartingHands();
}

function dealStartingHands() {
  var playerQuery = firebase.firestore()
    .collection('players');
  playerQuery.get().then(function (players) {
    var cardQuery = firebase.firestore()
      .collection('white-cards');
    cardQuery.get().then(function (cards) {
      //Reset any previously assigned cards
      cards.forEach(function (card) {
        card.ref.set({
          text: card.get('text'),
        });
      });

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
          cards.docs[WHITE_DECK[WHITE_INDEX]].ref.set({
            assignedPlayer: player.get('name')
          }, { merge: true });
          WHITE_INDEX++;
        }
      });
    });
  });
  var stateQuery = firebase.firestore()
    .collection('game-state');
  stateQuery.get().then(function (state) {
    state.docs[0].ref.set({
      state: 'bindHand'
    });
  });
}

//Binds the player's hand to white-cards in firestore where the assignedPlayer field == their username
function bindHand() {
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
  div.querySelector('.card-text').textContent = text;

  $("#" + id).click(function () {
    if (selectedCard != null) {
      selectedCard.removeClass("selected");
    }
    $(this).addClass("selected");
    selectedCard = $(this);
  })
}

function submitCard() {
  //Remove assignedPlayer value from card
  var cardQuery = firebase.firestore()
    .collection('white-cards')
    .where('text', '==', $(selectedCard).text());
  cardQuery.get().then(function (cards) {
    cards.docs[0].ref.set({
      text: cards.docs[0].get('text')
    });
  });
  return firebase.firestore().collection('active-cards').add({
    id: $(selectedCard).attr("id"),
    text: $(selectedCard).text()
  }).catch(function (error) {
    console.error('Error writing new message to Firebase Database', error);
  });
}

function loadActiveCards() {
  var query = firebase.firestore()
    .collection('active-cards')
    .limit(10);
  query.onSnapshot(function (snapshot) {
    snapshot.docChanges().forEach(function (change) {
      if (change.type == 'removed') {
        removeCardFromUI(change.doc.id);
      } else {
        var card = change.doc.data();
        displayActiveCard(change.doc.id, card.text);
      }
    });
  });
}

function displayActiveCard(id, text) {
  var div = document.getElementById(id);
  // If an element for that message does not exists yet we create it.
  if (!div) {
    var container = document.createElement('div');
    container.innerHTML = WHITE_CARD_TEMPLATE;
    div = container.firstChild;
    div.firstChild.setAttribute('id', id);
    responseListElement.appendChild(div);
  }
  div.querySelector('.card-text').textContent = text;

  $("#" + id).click(function () {
    $(this).fadeOut(200, function () {
      firebase.firestore().collection('active-cards').doc(id).delete().then(function () {
        console.log("Document successfully deleted!");
      }).catch(function (error) {
        console.error("Error removing document: ", error);
      });
    });
  })
}

function removeCardFromUI(id) {
  $("#" + id).parent().remove();
}

function joinGame() {
  var query = firebase.firestore()
    .collection('players')
    .where('name', '==', getUserName());
  query.get().then(function (snapshot) {
    if (snapshot.size > 0) {
      console.log("Player '" + getUserName() + "' is already in the game.");
      return;
    }
    else {
      $("#join-game").prop("disabled", true);
      $("#join-game").removeClass("waiting");
      IS_IN_GAME = true;
      return firebase.firestore().collection('players').add({
        name: getUserName(),
        initials: getInitials(),
        score: 0
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
  return nameArray[0].charAt(0) + nameArray[1].charAt(0);
}

function bindPlayers() {
  var query = firebase.firestore()
    .collection('players')
    .limit(10);
  query.onSnapshot(function (snapshot) {
    snapshot.docChanges().forEach(function (change) {
      if (change.type == 'removed') { 
        console.log(change.doc.data().name + ' ' + getUserName());
        IS_IN_GAME = !(change.doc.data().name == getUserName());
        $("#" + change.doc.id).remove();
        $("#join-game").prop("disabled", false);
        $("#join-game").addClass("waiting");
      } else {
        if (change.doc.data().name == getUserName()) {
          IS_IN_GAME = true;
        }
        var player = change.doc.data();
        displayPlayer(change.doc.id, player.initials, player.score);
      }
    });
  });
}

function displayPlayer(id, initials, score) {
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

  $("#" + id).click(function () {
    $(this).fadeOut(200, function () {
      firebase.firestore().collection('players').doc(id).delete().then(function () {
        //console.log("Player successfully deleted!");
      }).catch(function (error) {
        console.error("Error removing document: ", error);
      });
    });
  })
}

//End CAH functions ###!

// Signs-in for chat.
function signIn() {
  var provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider);
  //Make the join-game button start flashing
  $("#join-game").prop("disabled", false);
  $("#join-game").addClass("waiting");
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
    // Get the signed-in user's profile pic and name.
    var userName = getUserName();



    // Show user's profile and sign-out button.
    signOutButtonElement.removeAttribute('hidden');

    // Hide sign-in button.
    signInButtonElement.setAttribute('hidden', 'true');


  } else { // User is signed out!
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
    submitButtonElement.removeAttribute('disabled');
  } else {
    submitButtonElement.setAttribute('disabled', 'true');
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

// Checks that Firebase has been imported.
checkSetup();

// Shortcuts to DOM Elements.
var handListElement = document.getElementById('hand-container');
var responseListElement = document.getElementById('response-container');
var infoListElement = document.getElementById('info-container');
var submitCardElement = document.getElementById('submit-card');
var joinGameElement = document.getElementById('join-game');
var startGameElement = document.getElementById('start-game');

var messageListElement = document.getElementById('messages');
var messageFormElement = document.getElementById('message-form');
var messageInputElement = document.getElementById('message');
var submitButtonElement = document.getElementById('submit');

var signInButtonElement = document.getElementById('sign-in');
var signOutButtonElement = document.getElementById('sign-out');
var signInSnackbarElement = document.getElementById('must-signin-snackbar');

//Listeners
submitCardElement.addEventListener('click', submitCard);
joinGameElement.addEventListener('click', joinGame);
startGameElement.addEventListener('click', startGame);

// Saves message on form submit.
messageFormElement.addEventListener('submit', onMessageFormSubmit);
signOutButtonElement.addEventListener('click', signOut);
signInButtonElement.addEventListener('click', signIn);

// Toggle for the button.
messageInputElement.addEventListener('keyup', toggleButton);
messageInputElement.addEventListener('change', toggleButton);

// initialize Firebase
initFirebaseAuth();

// Remove the warning about timstamps change. 
var firestore = firebase.firestore();
var settings = { timestampsInSnapshots: true };
firestore.settings(settings);

// TODO: Enable Firebase Performance Monitoring.

// We load currently existing chat messages and listen to new ones.
loadMessages();
