import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const port = 4000;
const server = createServer(app);
const rooms = {};
const points = {};
const correctGuessers = {};
const io = new Server(server, {
  cors: {
    origin: "https://sketchrace.vercel.app/",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const wordSelect = 7;
const wordGuess = 45;
const maxRounds = 3;
const hintTime = 20;

const activeTimers = {};

io.on("connection", (socket) => {
  console.log("user connected");
  console.log("id", socket.id);

  socket.on("join", ({ roomId, name }) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: [],
        ownerId: socket.id,
        gamestarted: false,
        currentDrawerIndex: 0,
        currentRound: 1,
        currentWord: "",
        hintRevealed: false,
      };
    }

    rooms[roomId].users.push({ id: socket.id, name });

    io.to(roomId).emit("user-list", {
      users: rooms[roomId].users,
      ownerId: rooms[roomId].ownerId,
      gamestarted: rooms[roomId].gamestarted,
      currentRound: rooms[roomId].currentRound,
    });

    console.log(rooms[roomId]);

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      rooms[roomId].users = rooms[roomId].users.filter(
        (user) => user.id !== socket.id
      );
      if (rooms[roomId].users.length === 0) {
        delete rooms[roomId];
        delete correctGuessers[roomId];
        if (activeTimers[roomId]) {
          clearInterval(activeTimers[roomId].selectionTimer);
          clearInterval(activeTimers[roomId].guessingTimer);
          delete activeTimers[roomId];
        }
      } else {
        io.to(roomId).emit("user-list", {
          users: rooms[roomId].users,
          ownerId: rooms[roomId].ownerId,
          gamestarted: rooms[roomId].gamestarted,
          currentRound: rooms[roomId].currentRound,
        });
      }
    });
  });

  socket.on("start-game", (roomId) => {
    rooms[roomId].gamestarted = true;
    io.to(roomId).emit("game started");
    wordSelectionTime(roomId);
  });

  socket.on("reset-game", (roomId) => {
    if (points[roomId]) delete points[roomId];
    if (correctGuessers[roomId]) delete correctGuessers[roomId];
    io.to(roomId).emit("scores-reset");
  });

  function wordSelectionTime(roomId) {
    const room = rooms[roomId];
    if (room) {
      const currentDrawer = room.users[room.currentDrawerIndex];
      io.to(roomId).emit("message", {
        message: `${currentDrawer.name} is selecting a word...`,
        name: "System",
      });

      io.to(roomId).emit("drawer-selected", {
        drawerId: currentDrawer.id,
        name: currentDrawer.name,
      });

      correctGuessers[roomId] = [];
      room.hintRevealed = false;

      let timeLeft = wordSelect;

      if (activeTimers[roomId] && activeTimers[roomId].selectionTimer) {
        clearInterval(activeTimers[roomId].selectionTimer);
      }

      if (!activeTimers[roomId]) activeTimers[roomId] = {};

      activeTimers[roomId].selectionTimer = setInterval(() => {
        timeLeft--;
        io.to(roomId).emit("word-selection-time", timeLeft);
        if (timeLeft === 0) {
          clearInterval(activeTimers[roomId].selectionTimer);
          wordGuessingTime(roomId);
        }
      }, 1000);
    }
  }

  function wordGuessingTime(roomId) {
    const totalTime = wordGuess;
    let timeLeft = totalTime;

    if (activeTimers[roomId] && activeTimers[roomId].guessingTimer) {
      clearInterval(activeTimers[roomId].guessingTimer);
    }

    io.to(roomId).emit("message", {
      message: "Guessing time has started!",
      name: "System",
    });

    rooms[roomId].totalGuessingTime = totalTime;

    activeTimers[roomId].guessingTimer = setInterval(() => {
      timeLeft--;
      io.to(roomId).emit("word-guessing-time", timeLeft);

      if (timeLeft === hintTime && !rooms[roomId].hintRevealed) {
        rooms[roomId].hintRevealed = true;
        revealHint(roomId);
      }

      if (timeLeft === 0) {
        clearInterval(activeTimers[roomId].guessingTimer);

        const room = rooms[roomId];
        const currentDrawer = room.users[room.currentDrawerIndex];
        const drawerName = currentDrawer.name;

        if (!points[roomId]) points[roomId] = {};
        if (!points[roomId][drawerName]) points[roomId][drawerName] = 0;

        const guessers = correctGuessers[roomId] || [];
        const correctGuessCount = guessers.length;
        const totalPossibleGuessers = room.users.length - 1;

        if (correctGuessCount > 0) {
          const percentCorrect = correctGuessCount / totalPossibleGuessers;
          const drawerBonus = Math.round(10 * percentCorrect);
          points[roomId][drawerName] += drawerBonus;

          io.to(roomId).emit("message", {
            message: `${drawerName} earned ${drawerBonus} points for their drawing!`,
            name: "System",
          });

          io.to(roomId).emit("scores-update", points[roomId]);
        }

        if (correctGuessCount < totalPossibleGuessers) {
          io.to(roomId).emit("message", {
            message: `The word was: ${room.currentWord}`,
            name: "System",
          });
        }

        proceedToNextTurn(roomId);
      }
    }, 1000);
  }

  function revealHint(roomId) {
    const room = rooms[roomId];
    if (!room || !room.currentWord) return;

    const word = room.currentWord;

    let maskedWord = word
      .split("")
      .map(() => "_")
      .join("");

    let positions = [];
    while (positions.length < 2 && positions.length < word.length) {
      const randomPos = Math.floor(Math.random() * word.length);
      if (!positions.includes(randomPos)) {
        positions.push(randomPos);
      }
    }

    positions.forEach((pos) => {
      maskedWord =
        maskedWord.substring(0, pos) +
        word[pos] +
        maskedWord.substring(pos + 1);
    });

    const currentDrawer = room.users[room.currentDrawerIndex];
    room.users.forEach((user) => {
      if (user.id !== currentDrawer.id) {
        io.to(user.id).emit("word-hint", {
          hint: maskedWord,
          message: "HINT: Two letters revealed!",
        });
      }
    });

    io.to(roomId).emit("message", {
      message: "Time is running out! A hint has been revealed to guessers.",
      name: "System",
    });
  }

  function proceedToNextTurn(roomId) {
    const room = rooms[roomId];
    if (room) {
      room.currentDrawerIndex =
        (room.currentDrawerIndex + 1) % room.users.length;

      if (room.currentDrawerIndex === 0) {
        room.currentRound++;
        if (room.currentRound > maxRounds) {
          io.to(roomId).emit("final-scores", points[roomId]);
          room.gamestarted = false;
          room.currentDrawerIndex = 0;
          room.currentRound = 1;
          io.to(roomId).emit("game-ended");
        } else {
          io.to(roomId).emit("clear-canvas");
          io.to(roomId).emit("message", {
            message: `Round ${room.currentRound} is starting...`,
            name: "System",
          });
          wordSelectionTime(roomId);
        }
      } else {
        io.to(roomId).emit("clear-canvas");
        wordSelectionTime(roomId);
      }
    }
  }

  socket.on("correct-guess", ({ name, roomId }) => {
    const room = rooms[roomId];

    if (correctGuessers[roomId] && correctGuessers[roomId].includes(name)) {
      return;
    }

    if (!room || !room.gamestarted) return;

    const currentDrawer = room.users[room.currentDrawerIndex];
    if (!currentDrawer || currentDrawer.name === name) return;

    if (!points[roomId]) points[roomId] = {};
    if (!points[roomId][name]) points[roomId][name] = 0;

    const timeRemaining = activeTimers[roomId]
      ? parseInt(
          room.totalGuessingTime -
            (room.totalGuessingTime -
              activeTimers[roomId].guessingTimer._idleTimeout / 1000)
        )
      : 0;
    const totalTime = room.totalGuessingTime || wordGuess;

    const timeRatio = timeRemaining / totalTime;
    const timeBonus = Math.round(10 * timeRatio);
    const totalPoints = 10 + timeBonus;

    const finalPoints = room.hintRevealed
      ? Math.round(totalPoints * 0.8)
      : totalPoints;

    points[roomId][name] += finalPoints;

    if (!correctGuessers[roomId]) correctGuessers[roomId] = [];
    correctGuessers[roomId].push(name);

    const drawerName = currentDrawer.name;
    if (!points[roomId][drawerName]) points[roomId][drawerName] = 0;
    points[roomId][drawerName] += 5;

    io.to(socket.id).emit("message", {
      message: room.hintRevealed
        ? `You guessed correctly! You earned ${finalPoints} points (${timeBonus} time bonus, but reduced because you saw a hint)`
        : `You guessed correctly! You earned ${finalPoints} points (${timeBonus} time bonus)`,
      name: "System",
    });

    io.to(roomId).emit("message", {
      message: `${name} guessed the word correctly!`,
      name: "System",
    });

    io.to(roomId).emit("scores-update", points[roomId]);

    const totalPossibleGuessers = room.users.length - 1;
    if (correctGuessers[roomId].length >= totalPossibleGuessers) {
      if (activeTimers[roomId] && activeTimers[roomId].guessingTimer) {
        clearInterval(activeTimers[roomId].guessingTimer);
      }

      points[roomId][drawerName] += 10;
      io.to(roomId).emit("message", {
        message: `Everyone guessed the word! ${drawerName} gets a 10 point bonus!`,
        name: "System",
      });
      io.to(roomId).emit("scores-update", points[roomId]);

      setTimeout(() => {
        proceedToNextTurn(roomId);
      }, 3000);
    }
  });

  socket.on("force-end-timer", (roomId) => {
    const room = rooms[roomId];
    if (room) {
      if (activeTimers[roomId] && activeTimers[roomId].selectionTimer) {
        clearInterval(activeTimers[roomId].selectionTimer);
      }

      io.to(roomId).emit("word-selection-time", 0);

      wordGuessingTime(roomId);
    }
  });

  socket.on("word-selected", ({ roomId, word }) => {
    if (rooms[roomId]) {
      rooms[roomId].currentWord = word;
    }

    io.to(roomId).emit("word-to-guess", word);
  });

  socket.on("message", ({ message, name, roomId }) => {
    console.log("message", message);
    console.log("name", name);
    io.to(roomId).emit("message", { message, name });
  });

  socket.on(
    "drawing",
    ({ roomId, prevX, prevY, x, y, brushColor, brushSize }) => {
      socket
        .to(roomId)
        .emit("drawing", { prevX, prevY, x, y, brushColor, brushSize });
    }
  );

  socket.on("clear-canvas", (roomId) => {
    socket.to(roomId).emit("clear-canvas");
  });
});

app.get("/", (req, res) => {
  res.send("hello");
});

server.listen(port, () => {
  console.log(`server is running on ${port}`);
});
