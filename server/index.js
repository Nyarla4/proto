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
  cors: { origin: "*", methods: ["GET", "POST"] }
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
  status: 'LOBBY', // 게임 상태: LOBBY, PLAYING, VOTING, RESULT
  category: '',
  correctWord: '',
  turnOrder: [],
  currentTurnIndex: 0,
  votes: {},
  votedCount: 0
};

io.on('connection', (socket) => {
  // 입장 로직
  // 1. 방 입장 이벤트
  socket.on('join_room', (userName) => {
    const isDuplicate = gameState.players.some(p => p.name === userName);
    if (isDuplicate) return socket.emit('game_error', '이미 사용 중인 닉네임입니다.');

    const isHost = gameState.players.length === 0;
    gameState.players.push({
      id: socket.id,
      name: userName,
      isReady: isHost,
      isHost: isHost,
      role: '',
      word: '',
      votedFor: ''
    });
    socket.emit('join_success');
    io.emit('update_players', gameState.players);
  });

  socket.on('send_message', (data) => {
    io.emit('receive_message', {
      id: Date.now() + Math.random(),
      message: data.message,
      author: data.author
    });
  });

  socket.on('start_game', () => {
    if (gameState.players.length < 3) return socket.emit('game_error', '최소 3명이 필요합니다.');
    if (!gameState.players.every(p => p.isReady)) return socket.emit('game_error', '모든 플레이어가 준비 완료 상태여야 합니다.');

    const categories = Object.keys(wordDb);
    const category = categories[Math.floor(Math.random() * categories.length)];
    const wordList = [...wordDb[category]].sort(() => Math.random() - 0.5);
    const correctWord = wordList[0];
    const liarIndex = Math.floor(Math.random() * gameState.players.length);

    gameState.status = 'PLAYING';
    gameState.category = category;
    gameState.correctWord = correctWord;
    gameState.votes = {};
    gameState.votedCount = 0;
    gameState.turnOrder = gameState.players.map(p => p.id).sort(() => Math.random() - 0.5);
    gameState.currentTurnIndex = 0;

    gameState.players.forEach((p, i) => {
      p.role = i === liarIndex ? 'LIAR' : 'CITIZEN';
      p.word = i === liarIndex ? '당신은 라이어입니다.' : correctWord;
      p.votedFor = '';
      io.to(p.id).emit('game_start_info', { role: p.role, word: p.word, category });
    });

    io.emit('update_game_status', 'PLAYING');
    io.emit('update_turn', gameState.turnOrder[gameState.currentTurnIndex]);
    io.emit('update_players', gameState.players);
  });

  socket.on('next_turn', () => {
    if (socket.id !== gameState.turnOrder[gameState.currentTurnIndex]) return;
    gameState.currentTurnIndex++;
    if (gameState.currentTurnIndex < gameState.turnOrder.length) {
      io.emit('update_turn', gameState.turnOrder[gameState.currentTurnIndex]);
    } else {
      gameState.status = 'VOTING';
      io.emit('update_game_status', 'VOTING');
    }
  });

  socket.on('submit_vote', (targetId) => {
    if (gameState.status !== 'VOTING') return;
    const player = gameState.players.find(p => p.id === socket.id);
    if (player && !player.votedFor) {
      player.votedFor = targetId;
      gameState.votes[targetId] = (gameState.votes[targetId] || 0) + 1;
      gameState.votedCount++;

      io.emit('update_voted_count', gameState.votedCount);

      if (gameState.votedCount === gameState.players.length) {
        // 투표 결과 계산
        const sortedVotes = Object.entries(gameState.votes).sort((a, b) => b[1] - a[1]);
        const mostVotedId = sortedVotes[0][0];
        const liar = gameState.players.find(p => p.role === 'LIAR');

        if (mostVotedId === liar.id) {
          // 라이어 검거 성공 -> 라이어의 최후 변론/정답 맞추기 시간
          gameState.status = 'LIAR_GUESS';
          io.emit('update_game_status', 'LIAR_GUESS');
        } else {
          // 검거 실패 -> 라이어 승리
          gameState.status = 'RESULT';
          io.emit('game_result', {
            winner: 'LIAR',
            liar: { name: liar.name, word: gameState.correctWord },
            votes: gameState.votes
          });
          io.emit('update_game_status', 'RESULT');
        }
      }
    }
  });

  // 라이어의 정답 제출 처리
  socket.on('submit_guess', (guess) => {
    if (gameState.status !== 'LIAR_GUESS') return;
    const liar = gameState.players.find(p => p.id === socket.id);
    if (!liar || liar.role !== 'LIAR') return;

    const isCorrect = guess.trim() === gameState.correctWord;
    gameState.status = 'RESULT';
    
    io.emit('game_result', {
      winner: isCorrect ? 'LIAR' : 'CITIZEN',
      liar: { name: liar.name, word: gameState.correctWord },
      votes: gameState.votes
    });
    io.emit('update_game_status', 'RESULT');
  });

  socket.on('toggle_ready', () => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (player && !player.isHost) {
      player.isReady = !player.isReady;
      io.emit('update_players', gameState.players);
    }
  });

  socket.on('disconnect', () => {
    gameState.players = gameState.players.filter(p => p.id !== socket.id);
    if (gameState.players.length > 0 && !gameState.players.some(p => p.isHost)) {
      gameState.players[0].isHost = true;
      gameState.players[0].isReady = true;
    }
    io.emit('update_players', gameState.players);
  });
});

server.listen(3001, () => console.log('Server running on 3001'));