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

// DOM
const startScreen = document.getElementById("startScreen");
const gameScreen = document.getElementById("gameScreen");
const startBtn = document.getElementById("startBtn");
const boardDiv = document.getElementById("board");
const statusDiv = document.getElementById("status");
const cancelBtn = document.getElementById("cancelBtn");

let userId, gameId, isPlayerX;
let unsubGameListener = null;

// 🧠 Try cleanup from previous session
window.addEventListener("DOMContentLoaded", () => {
  const savedUser = localStorage.getItem("userId");
  const savedGame = localStorage.getItem("gameId");
  const savedRole = localStorage.getItem("isPlayerX");

  if (savedUser) {
    userId = savedUser;
    gameId = savedGame;
    isPlayerX = savedRole === "true";
    cleanupMatch(); // 🔥 Immediately clean up
    localStorage.clear();
  }
});

// ✅ Back button trap
function blockBack() {
  history.pushState(null, null, location.href);
}

// ✅ Start Matchmaking
startBtn.onclick = () => {
  startScreen.style.display = "none";
  gameScreen.style.display = "block";
  cancelBtn.style.display = "inline-block";
  statusDiv.textContent = "Looking for opponent...";

  firebase.auth().signInAnonymously().then(user => {
    userId = user.user.uid;

    // Save for refresh recovery
    localStorage.setItem("userId", userId);

    // Trap system back button AFTER a short delay
    setTimeout(() => {
      history.pushState(null, null, location.href);
      window.addEventListener("popstate", blockBack);
    }, 200);

    findMatch();
  });
};

// ✅ Cancel
cancelBtn.onclick = () => {
  cleanupMatch();
  returnToStart();
};

// ✅ Return
function returnToStart() {
  window.removeEventListener("popstate", blockBack);
  window.removeEventListener("beforeunload", cleanupMatch);
  localStorage.clear();

  boardDiv.innerHTML = "";
  statusDiv.textContent = "Waiting...";
  gameId = null;
  isPlayerX = false;

  startScreen.style.display = "block";
  gameScreen.style.display = "none";
}

// ✅ Cleanup queue or game
function cleanupMatch() {
  const queueRef = db.collection("waiting").doc("queue");
  const gameRef = gameId ? db.collection("games").doc(gameId) : null;

  if (userId) {
    queueRef.get().then(doc => {
      if (doc.exists && doc.data().player === userId) {
        queueRef.delete();
      }
    });
  }

  if (gameRef && isPlayerX) {
    gameRef.get().then(doc => {
      if (doc.exists && !doc.data().winner) {
        gameRef.delete();
      }
    });
  }

  if (typeof unsubGameListener === "function") {
    unsubGameListener();
    unsubGameListener = null;
  }
}

// ✅ Board Rendering
function renderBoard(board, turn, winner) {
  boardDiv.innerHTML = '';
  board.forEach((cell, i) => {
    const div = document.createElement('div');
    div.className = 'cell';
    div.textContent = cell;
    div.onclick = () => {
      if (!cell && turn === (isPlayerX ? 'X' : 'O') && !winner) {
        db.collection("games").doc(gameId).get().then(doc => {
          const updatedBoard = [...doc.data().board];
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

// ✅ Matchmaking
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
        board: Array(9).fill(""),
        turn: "X",
        winner: null
      };
      const newDoc = gamesRef.doc();
      tx.set(newDoc, newGame);
      tx.delete(waitRef);
      gameId = newDoc.id;
      isPlayerX = false;

      // Save to recover
      localStorage.setItem("gameId", gameId);
      localStorage.setItem("isPlayerX", "false");
    }
  });

  if (!gameId) {
    const unsub = gamesRef.where("playerX", "==", userId).onSnapshot(snapshot => {
      snapshot.forEach(doc => {
        gameId = doc.id;
        isPlayerX = true;
        unsub();

        localStorage.setItem("gameId", gameId);
        localStorage.setItem("isPlayerX", "true");

        subscribeGame();
      });
    });
  } else {
    subscribeGame();
  }
}

// ✅ Listen to Game
function subscribeGame() {
  cancelBtn.style.display = "none"; // hide cancel once game starts

  unsubGameListener = db.collection("games").doc(gameId).onSnapshot(doc => {
    const data = doc.data();
    const me = isPlayerX ? "X" : "O";
    const them = isPlayerX ? "O" : "X";

    renderBoard(data.board, data.turn, data.winner);

    if (data.winner) {
      statusDiv.textContent =
        data.winner === me ? "🎉 You Win!" :
        data.winner === them ? "😢 You Lose!" :
        "🤝 It's a Draw!";

      if (isPlayerX) {
        setTimeout(() => {
          db.collection("games").doc(gameId).delete();
        }, 1000);
      }

      setTimeout(() => returnToStart(), 2000);
    } else {
      statusDiv.textContent = data.turn === me ? "Your Turn" : "Opponent's Turn";
    }

    if (!data.winner) {
      const winner = checkWin(data.board);
      if (winner) db.collection("games").doc(gameId).update({ winner });
      else if (!data.board.includes("")) db.collection("games").doc(gameId).update({ winner: "Draw" });
    }
  });
}

// ✅ Check for Win
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
