import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const port = 4000;
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    // methods: ["GET", "POST"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("user connected");
  console.log("id", socket.id);

  socket.on("disconnect", () => {
    console.log("user Disconnected", socket.id);
  });

  socket.on("join", (data) => {
    console.log(data);

    socket.join(data);
    socket.emit("user joined", data);
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
