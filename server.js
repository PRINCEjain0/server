import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const port = 4000;
const server = createServer(app);
const rooms = {};
const points = {};
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const wordSelect = 7;
const wordGuess = 15;
const showScores = 5;
const maxRounds = 2;
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
    wordSelectiontTime(roomId);
  });

  function wordSelectiontTime(roomId) {
    const room = rooms[roomId];
    if (room) {
      const currentDrawer = room.users[room.currentDrawerIndex];
      io.to(roomId).emit("drawer-selected", {
        drawerId: currentDrawer.id,
        name: currentDrawer.name,
      });
      let timeLeft = wordSelect;

      const interval = setInterval(() => {
        timeLeft--;
        io.to(roomId).emit("word-selection-time", timeLeft);
        if (timeLeft === 0) {
          clearInterval(interval);
          wordGuessingTime(roomId);
        }
      }, [1000]);
    }
  }

  function wordGuessingTime(roomId) {
    let timeLeft = wordGuess;

    const interval = setInterval(() => {
      timeLeft--;
      io.to(roomId).emit("word-guessing-time", timeLeft);
      if (timeLeft === 0) {
        clearInterval(interval);
        proceedToNextTurn(roomId);
      }
    }, [1000]);
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
          points[roomId] = {};
          io.to(roomId).emit("game-ended");
        } else {
          io.to(roomId).emit("clear-canvas");
          wordSelectiontTime(roomId);
        }
      } else {
        io.to(roomId).emit("clear-canvas");
        wordSelectiontTime(roomId);
      }
    }
  }

  socket.on("correct-guess", ({ name, roomId }) => {
    if (!points[roomId]) points[roomId] = {};
    if (!points[roomId][name]) points[roomId][name] = 0;

    points[roomId][name] += 10;

    io.to(roomId).emit("scores-update", points[roomId]);
  });

  socket.on("word-selected", ({ roomId, word }) => {
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
  console.log(`serevr is running on ${port}`);
});
