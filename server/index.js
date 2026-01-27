/**
 * 라이어 게임 서버 (Node.js + Socket.io)
 * 포트: 3001
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors()); // 교차 출처 리소스 공유 허용

// HTTP 서버 생성 및 소켓 초기화
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // 리액트 개발 서버 주소 (Vite 기본값)
    methods: ["GET", "POST"]
  }
});

/**
 * 게임의 상태를 관리하는 객체
 * 실제 서비스에서는 여러 방을 관리하기 위해 Map이나 DB를 사용하지만,
 * 연습용이므로 단일 방 객체로 구현합니다.
 */
let gameState = {
  players: [],     // { id, name, isReady, isHost, score }
  status: 'LOBBY', // 게임 상태: LOBBY, PLAYING, VOTING, GUESSING
  chatLog: []      // 전체 채팅 기록
};

io.on('connection', (socket) => {
  console.log('새로운 유저 접속:', socket.id);

  // 1. 방 입장 이벤트
  socket.on('join_room', (userName) => {
    // 첫 번째로 들어온 사람을 방장(Host)으로 지정
    const isHost = gameState.players.length === 0;
    
    const newUser = {
      id: socket.id,
      name: userName,
      isReady: isHost, // 방장은 자동으로 준비 상태
      isHost: isHost,
      score: 0
    };

    gameState.players.push(newUser);
    
    // 방 안의 모든 사람에게 업데이트된 플레이어 명단 전송
    io.emit('update_players', gameState.players);
    console.log(`${userName}님이 입장했습니다.`);
  });

  // 2. 채팅 메시지 수신 및 전달
  socket.on('send_message', (data) => {
    // data: { message, author }
    const chatData = {
      ...data,
      id: Date.now() // 메시지 구분을 위한 ID
    };
    // 채팅 로그를 모두에게 브로드캐스트
    io.emit('receive_message', chatData);
  });

  // 3. 준비 상태 토글 (방장은 상태 변경 불가)
  socket.on('toggle_ready', () => {
    const playerIndex = gameState.players.findIndex(p => p.id === socket.id);
    if (playerIndex !== -1 && !gameState.players[playerIndex].isHost) {
      gameState.players[playerIndex].isReady = !gameState.players[playerIndex].isReady;
      
      // 상태 변경 후 플레이어 명단 다시 배포
      io.emit('update_players', gameState.players);
    }
  });

  // 4. 접속 종료 처리
  socket.on('disconnect', () => {
    console.log('유저 접속 종료:', socket.id);
    // 접속 끊긴 유저 제거
    gameState.players = gameState.players.filter(p => p.id !== socket.id);
    
    // 만약 방장이 나갔다면 다음 사람에게 방장 위임 로직 추가 가능
    if (gameState.players.length > 0 && !gameState.players.some(p => p.isHost)) {
      gameState.players[0].isHost = true;
      gameState.players[0].isReady = true;
    }

    io.emit('update_players', gameState.players);
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});