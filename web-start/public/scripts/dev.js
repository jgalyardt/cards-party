//Dev functions for debug purposes

function resetWhiteCards(deckSize = 20) {
  var collectionRef = firebase.firestore().collection('white-cards');
  var query = collectionRef.orderBy('__name__');

  query.get().then(function (snapshot) {
    snapshot.forEach(function (item) {
      item.ref.delete();
    });
    for (var i = 0; i < deckSize; i++) {
      firebase.firestore().collection('white-cards').add({
        text: i.toString(),
      }).catch(function (error) {
        console.error('Error writing new message to Firebase Database', error);
      });
    }
  });
}

function resetJoinGame() {
  $("#join-game").prop("disabled", false);
  $("#join-game").addClass("waiting");
  return 'Reset join button';
}

function addCardSet(setName) {
  var json = (function () {
    var json = null;
    $.ajax({
      'async': false,
      'global': false,
      'url': "cards/" + setName + ".json",
      'dataType': "json",
      'success': function (data) {
        json = data;
      }
    });
    return json;
  })();
  console.log(json);
}