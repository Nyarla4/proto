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

// 단어 데이터베이스
const wordDb = {
  "동물": ["강아지", "고양이", "사자", "호랑이", "코끼리", "토끼", "판다"],
  "과일": ["사과", "바나나", "포도", "딸기", "수박", "복숭아", "멜론"],
  "직업": ["의사", "경찰", "선생님", "요리사", "판사", "가수", "화가"],
  "음식": ["피자", "치킨", "햄버거", "떡볶이", "초밥", "파스타", "삼겹살"]
};

/**
 * 게임의 상태를 관리하는 객체
 * 실제 서비스에서는 여러 방을 관리하기 위해 Map이나 DB를 사용하지만,
 * 연습용이므로 단일 방 객체로 구현합니다.
 */
let gameState = {
  players: [],     // { id, name, isReady, isHost, score }
  status: 'LOBBY', // 게임 상태: LOBBY, PLAYING, VOTING, GUESSING
  category: '',
  turnOrder: [],
  currentTurnIndex: 0
};

io.on('connection', (socket) => {
  // 입장 로직
  // 1. 방 입장 이벤트
  socket.on('join_room', (userName) => {
    // 첫 번째로 들어온 사람을 방장(Host)으로 지정
    const isHost = gameState.players.length === 0;
    gameState.players.push({
      id: socket.id,
      name: userName,
      isReady: isHost, // 방장은 자동으로 준비 상태
      isHost: isHost,
      role: '',
      word: ''
    });
    // 방 안의 모든 사람에게 업데이트된 플레이어 명단 전송
    io.emit('update_players', gameState.players);
  });

  // 채팅 메시지 수신 및 전달
  // 채팅 로직: 게임 상태와 관계없이 항상 동작함
  socket.on('send_message', (data) => {
    // 서버 시간 기준으로 ID를 생성하여 중복 방지 및 전송
    io.emit('receive_message', { 
      id: Date.now() + Math.random(), 
      message: data.message, 
      author: data.author,
      socketId: socket.id // 보낸 사람 구분을 위해 추가
    });
  });

  // 게임 시작 로직
  socket.on('start_game', () => {
    // 1. 최소 인원 확인 (3명 이상)
    if (gameState.players.length < 3) return socket.emit('game_error', '최소 3명의 플레이어가 필요합니다.');
    // 2. 전원 준비 확인
    if (!gameState.players.every(p => p.isReady)) return socket.emit('game_error', '모든 플레이어가 준비 완료 상태여야 합니다.');

    // 3. 단어 배정
    const categories = Object.keys(wordDb);
    const category = categories[Math.floor(Math.random() * categories.length)];
    const words = [...wordDb[category]].sort(() => Math.random() - 0.5);
    
    // 4. 라이어 선정 및 역할 부여
    const liarIndex = Math.floor(Math.random() * gameState.players.length);
    gameState.status = 'PLAYING';
    gameState.category = category;

    // 턴 순서 무작위 셔플
    gameState.turnOrder = gameState.players.map(p => p.id).sort(() => Math.random() - 0.5);
    gameState.currentTurnIndex = 0;

    gameState.players.forEach((player, index) => {
      // 라이어 배정 (클라이언트에서 본인이 라이어인지 모르게 하려면 서버는 알고 있어야 함)
      player.role = index === liarIndex ? 'LIAR' : 'CITIZEN';
      // 라이어에게는 다른 단어(함정 단어)를 줌
      player.word = index === liarIndex ? words[1] : words[0];
      
      // 각 유저에게 개인별 정보 전송 (보안상 개별 전송)
      io.to(player.id).emit('game_start_info', {
        role: player.role,
        word: player.word,
        category: category
      });
    });

    io.emit('update_game_status', 'PLAYING');
    io.emit('update_turn', gameState.turnOrder[gameState.currentTurnIndex]);
  });

  // 다음 턴 로직
  socket.on('next_turn', () => {
    // 현재 턴인 사람만 턴을 넘길 수 있도록 검증
    if (socket.id !== gameState.turnOrder[gameState.currentTurnIndex]) return;

    gameState.currentTurnIndex++;
    
    if (gameState.currentTurnIndex < gameState.turnOrder.length) {
      io.emit('update_turn', gameState.turnOrder[gameState.currentTurnIndex]);
    } else {
      // 모든 플레이어가 설명을 마침
      io.emit('all_turns_finished');
      // 여기서 투표 단계로 상태를 바꿀 수도 있음
    }
  });

  // 준비 토글
  socket.on('toggle_ready', () => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (player && !player.isHost) {
      player.isReady = !player.isReady;
      // 상태 변경 후 플레이어 명단 다시 배포
      io.emit('update_players', gameState.players);
    }
  });

  // 퇴장 처리
  socket.on('disconnect', () => {
    // 접속 끊긴 유저 제거
    gameState.players = gameState.players.filter(p => p.id !== socket.id);
    // 방장이 나가면 다음 사람에게 위임
    if (gameState.players.length > 0 && !gameState.players.some(p => p.isHost)) {
      gameState.players[0].isHost = true;
      gameState.players[0].isReady = true;
    }
    io.emit('update_players', gameState.players);
  });
});

const PORT = 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));