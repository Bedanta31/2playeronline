// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDKtXP4MGQQvaTUYnON5XPDdtosWM50_8I",
  authDomain: "player-online-game-8f6db.firebaseapp.com",
  projectId: "player-online-game-8f6db",
  storageBucket: "player-online-game-8f6db.appspot.com",
  messagingSenderId: "881838715321",
  appId: "1:881838715321:web:9b35fce1fff16512c28668"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// DOM Elements
const startScreen = document.getElementById("startScreen");
const gameScreen = document.getElementById("gameScreen");
const startBtn = document.getElementById("startBtn");
const boardDiv = document.getElementById("board");
const statusDiv = document.getElementById("status");
const cancelBtn = document.getElementById("cancelBtn");
let unsubGameListener = null;

let userId, gameId, isPlayerX;

// Start Game button
startBtn.onclick = () => {
  startScreen.style.display = "none";
  gameScreen.style.display = "block";
  statusDiv.textContent = "Looking for opponent...";

  firebase.auth().signInAnonymously().then(user => {
    userId = user.user.uid;
    findMatch();
  });
};

// Return to Start Screen
function returnToStart() {
  boardDiv.innerHTML = "";
  statusDiv.textContent = "Waiting...";
  gameId = null;
  isPlayerX = false;
  startScreen.style.display = "block";
  gameScreen.style.display = "none";
}

// Draw board
function renderBoard(board, turn, winner) {
  boardDiv.innerHTML = '';
  board.forEach((cell, i) => {
    const div = document.createElement('div');
    div.className = 'cell';
    div.textContent = cell;
    div.onclick = () => {
      if (!cell && turn === (isPlayerX ? 'X' : 'O') && !winner) {
        db.collection("games").doc(gameId).get().then(doc => {
          const game = doc.data();
          const updatedBoard = [...game.board];
          updatedBoard[i] = isPlayerX ? 'X' : 'O';
          db.collection("games").doc(gameId).update({
            board: updatedBoard,
            turn: isPlayerX ? 'O' : 'X'
          });
        });
      }
    };
    boardDiv.appendChild(div);
  });
}

// Matchmaking logic
async function findMatch() {
  const waitRef = db.collection("waiting").doc("queue");
  const gamesRef = db.collection("games");

  await db.runTransaction(async tx => {
    const doc = await tx.get(waitRef);
    if (!doc.exists || !doc.data().player) {
      tx.set(waitRef, { player: userId });
    } else {
      const opponent = doc.data().player;
      const newGame = {
        playerX: opponent,
        playerO: userId,
        board: ["", "", "", "", "", "", "", "", ""],
        turn: "X",
        winner: null
      };
      const newDoc = gamesRef.doc();
      tx.set(newDoc, newGame);
      tx.delete(waitRef);
      gameId = newDoc.id;
      isPlayerX = false;
    }
  });

  // If player is waiting, listen for game
  if (!gameId) {
    const unsub = gamesRef.where("playerX", "==", userId).onSnapshot(snapshot => {
      snapshot.forEach(doc => {
        gameId = doc.id;
        isPlayerX = true;
        unsub(); // stop listening
        subscribeGame();
      });
    });
  } else {
    subscribeGame();
  }
}

// Realtime game updates
function subscribeGame() {
  unsubGameListener = db.collection("games").doc(gameId).onSnapshot(doc => {
    const data = doc.data();
    const mySymbol = isPlayerX ? "X" : "O";
    const enemySymbol = isPlayerX ? "O" : "X";

    renderBoard(data.board, data.turn, data.winner);

    if (data.winner) {
      if (data.winner === mySymbol) statusDiv.textContent = "🎉 You Win!";
      else if (data.winner === enemySymbol) statusDiv.textContent = "😢 You Lose!";
      else statusDiv.textContent = "🤝 It's a Draw!";

      // Auto delete room (by Player X only)
      if (isPlayerX) {
        setTimeout(() => {
          db.collection("games").doc(gameId).delete().then(() => {
            console.log("Game room deleted");
          });
        }, 1000);
      }

      // Return to start screen
      setTimeout(() => {
        returnToStart();
      }, 2000);

    } else {
      statusDiv.textContent = data.turn === mySymbol ? "Your Turn" : "Opponent's Turn";
    }

    // Check for winner if none yet
    if (!data.winner) {
      const winner = checkWin(data.board);
      if (winner) {
        db.collection("games").doc(gameId).update({ winner });
      } else if (!data.board.includes("")) {
        db.collection("games").doc(gameId).update({ winner: "Draw" });
      }
    }
  });
}

// Check win logic
function checkWin(b) {
  const lines = [
    [0,1,2], [3,4,5], [6,7,8],
    [0,3,6], [1,4,7], [2,5,8],
    [0,4,8], [2,4,6]
  ];
  for (let [a,b1,c] of lines) {
    if (b[a] && b[a] === b[b1] && b[a] === b[c]) return b[a];
  }
  return null;
}

function cleanupMatch() {
  // Remove from waiting queue if still there
  db.collection("waiting").doc("queue").get().then(doc => {
    if (doc.exists && doc.data().player === userId) {
      db.collection("waiting").doc("queue").delete();
    }
  });

  // If in a game but not finished, delete it (only playerX to avoid double-delete)
  if (gameId && isPlayerX) {
    db.collection("games").doc(gameId).get().then(doc => {
      const data = doc.data();
      if (data && !data.winner) {
        db.collection("games").doc(gameId).delete();
      }
    });
  }

  // Stop any active Firestore listeners
  if (typeof unsubGameListener === "function") {
    unsubGameListener();
    unsubGameListener = null;
  }
}
window.addEventListener("beforeunload", cleanupMatch);
