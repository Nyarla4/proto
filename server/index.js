const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// 단어 데이터베이스 (이전 구조로 복구)
const wordDb = {
  "동물": ["강아지", "고양이", "사자", "호랑이", "코끼리", "토끼", "판다"],
  "과일": ["사과", "바나나", "포도", "딸기", "수박", "복숭아", "멜론"],
  "직업": ["의사", "경찰", "선생님", "요리사", "판사", "가수", "화가"],
  "음식": ["피자", "치킨", "햄버거", "떡볶이", "초밥", "파스타", "삼겹살"]
};

let gameState = {
  players: [],
  status: 'LOBBY',
  category: '',
  citizenWord: '', // 시민들이 가진 정답 단어
  liarWord: '',    // 라이어가 가진 가짜 단어
  turnOrder: [],
  currentTurnIndex: 0,
  votes: {},
  votedCount: 0,
  roundResults: {
    voteSuccess: false,
    guessSuccess: false
  }
};

io.on('connection', (socket) => {
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
      votedFor: '',
      score: 0
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
    const categoryName = categories[Math.floor(Math.random() * categories.length)];
    
    // 이전에 사용하던 방식: 리스트를 섞어서 인덱스로 배정
    const shuffledWords = [...wordDb[categoryName]].sort(() => Math.random() - 0.5);
    const liarWord = shuffledWords[0];    // 인덱스 0은 라이어용 가짜 단어
    const citizenWord = shuffledWords[1]; // 인덱스 1은 시민용 정답 단어
    
    const liarIndex = Math.floor(Math.random() * gameState.players.length);

    gameState.status = 'PLAYING';
    gameState.category = categoryName;
    gameState.liarWord = liarWord;
    gameState.citizenWord = citizenWord;
    gameState.votes = {};
    gameState.votedCount = 0;
    gameState.roundResults = { voteSuccess: false, guessSuccess: false };
    gameState.turnOrder = gameState.players.map(p => p.id).sort(() => Math.random() - 0.5);
    gameState.currentTurnIndex = 0;

    gameState.players.forEach((p, i) => {
      const isLiar = i === liarIndex;
      p.role = isLiar ? 'LIAR' : 'CITIZEN';
      p.word = isLiar ? liarWord : citizenWord; // 요청하신 인덱스 방식 적용
      p.votedFor = '';
      io.to(p.id).emit('game_start_info', { role: p.role, word: p.word, category: categoryName });
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
        const sortedVotes = Object.entries(gameState.votes).sort((a, b) => b[1] - a[1]);
        const mostVotedId = sortedVotes[0][0];
        const liar = gameState.players.find(p => p.role === 'LIAR');

        // [규칙 1] 투표 결과 점수 부여
        if (mostVotedId === liar.id) {
          gameState.roundResults.voteSuccess = true;
          gameState.players.forEach(p => { if (p.role === 'CITIZEN') p.score += 1; });
        } else {
          gameState.roundResults.voteSuccess = false;
          liar.score += 1;
        }

        // 투표 성공/실패 여부와 관계없이 라이어의 정답 맞히기 단계 진입
        gameState.status = 'LIAR_GUESS';
        io.emit('update_game_status', 'LIAR_GUESS');
        io.emit('update_players', gameState.players);
      }
    }
  });

  socket.on('submit_guess', (guess) => {
    if (gameState.status !== 'LIAR_GUESS') return;
    const liar = gameState.players.find(p => p.id === socket.id);
    if (!liar || liar.role !== 'LIAR') return;

    const isCorrect = guess.trim() === gameState.citizenWord;
    gameState.roundResults.guessSuccess = isCorrect;

    // [규칙 2] 라이어의 정답 맞히기 점수 부여
    if (isCorrect) {
      liar.score += 1;
    } else {
      gameState.players.forEach(p => { if (p.role === 'CITIZEN') p.score += 1; });
    }

    gameState.status = 'RESULT';
    io.emit('game_result', {
      voteSuccess: gameState.roundResults.voteSuccess,
      guessSuccess: isCorrect,
      liar: { name: liar.name, word: gameState.citizenWord },
      votes: gameState.votes
    });
    io.emit('update_game_status', 'RESULT');
    io.emit('update_players', gameState.players);
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