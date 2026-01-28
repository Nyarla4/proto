const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// 리액트 빌드 결과물(build 폴더) 정적 서비스 설정
const buildPath = path.join(__dirname, '../build');
app.use(express.static(buildPath));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// 게임 데이터베이스
const wordDb = {
  "동물": ["강아지", "고양이", "사자", "호랑이", "코끼리", "토끼", "판다"],
  "과일": ["사과", "바나나", "포도", "딸기", "수박", "복숭아", "멜론"],
  "직업": ["의사", "경찰", "선생님", "요리사", "판사", "가수", "화가"],
  "음식": ["피자", "치킨", "햄버거", "떡볶이", "초밥", "파스타", "삼겹살"]
};

/**
 * 방 정보를 저장할 객체
 * 구조: { roomId: { players: [], status: 'LOBBY', ...gameData } }
 */
const rooms = {};

// 투표 결과 처리 함수 (방 단위로 실행)
const processVoteResults = (roomId) => {
  const room = rooms[roomId];
  if (!room) return;

  const sortedVotes = Object.entries(room.votes).sort((a, b) => b[1] - a[1]);
  if (sortedVotes.length === 0) return;

  const mostVotedId = sortedVotes[0][0];
  const liar = room.players.find(p => p.role === 'LIAR');
  const votedUser = room.players.find(p => p.id === mostVotedId);

  io.to(roomId).emit('chat-message', { 
    id: 'sys-' + Date.now(), 
    author: 'SYSTEM', 
    message: `투표 결과: 가장 많은 표를 받은 사람은 [${votedUser ? votedUser.name : '알 수 없음'}]입니다!` 
  });

  if (liar) {
    io.to(roomId).emit('chat-message', { 
      id: 'sys-liar-' + Date.now(), 
      author: 'SYSTEM', 
      message: `실제 라이어는 [${liar.name}]였습니다!` 
    });

    if (mostVotedId === liar.id) {
      room.roundResults.voteSuccess = true;
      room.players.forEach(p => { if (p.role === 'CITIZEN') p.score += 1; });
    } else {
      room.roundResults.voteSuccess = false;
      liar.score += 1;
    }
  }

  room.status = 'LIAR_GUESS';
  io.to(roomId).emit('update-game-status', 'LIAR_GUESS');
  io.to(roomId).emit('update-players', room.players);
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // 1. 방 입장 (Join Room)
  socket.on('join-room', ({ roomId, name }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        status: 'LOBBY',
        category: '',
        citizenWord: '',
        liarWord: '',
        turnOrder: [],
        currentTurnIndex: 0,
        votes: {},
        votedCount: 0,
        roundResults: { voteSuccess: false, guessSuccess: false }
      };
    }

    const room = rooms[roomId];
    const isDuplicate = room.players.some(p => p.name === name);
    if (isDuplicate) return socket.emit('error-message', '이미 사용 중인 닉네임입니다.');

    socket.join(roomId);
    socket.roomId = roomId;

    const isHost = room.players.length === 0;
    const newPlayer = {
      id: socket.id,
      name,
      isReady: isHost,
      isHost: isHost,
      role: '',
      word: '',
      votedFor: '',
      score: 0
    };

    room.players.push(newPlayer);
    
    socket.emit('join-success');
    io.to(roomId).emit('update-players', room.players);
    io.to(roomId).emit('chat-message', {
      id: Date.now(),
      author: 'SYSTEM',
      message: `${name}님이 입장하셨습니다.`
    });
  });

  // 2. 메시지 전송
  socket.on('send-message', ({ roomId, message }) => {
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    io.to(roomId).emit('chat-message', {
      id: Date.now() + Math.random(),
      message: message,
      author: player.name
    });
  });

  // 3. 게임 시작
  socket.on('start-game', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.players.length < 3) return socket.emit('error-message', '최소 3명이 필요합니다.');
    if (!room.players.every(p => p.isReady)) return socket.emit('error-message', '모든 플레이어가 준비 완료 상태여야 합니다.');

    const categories = Object.keys(wordDb);
    const categoryName = categories[Math.floor(Math.random() * categories.length)];
    const shuffledWords = [...wordDb[categoryName]].sort(() => Math.random() - 0.5);
    const liarWord = shuffledWords[0];
    const citizenWord = shuffledWords[1];
    const liarIndex = Math.floor(Math.random() * room.players.length);

    room.status = 'PLAYING';
    room.category = categoryName;
    room.liarWord = liarWord;
    room.citizenWord = citizenWord;
    room.votes = {};
    room.votedCount = 0;
    room.roundResults = { voteSuccess: false, guessSuccess: false };
    room.turnOrder = room.players.map(p => p.id).sort(() => Math.random() - 0.5);
    room.currentTurnIndex = 0;

    room.players.forEach((p, i) => {
      const isLiar = i === liarIndex;
      p.role = isLiar ? 'LIAR' : 'CITIZEN';
      p.word = isLiar ? liarWord : citizenWord;
      p.votedFor = '';
      io.to(p.id).emit('game-start', { role: p.role, word: p.word, category: categoryName });
    });

    io.to(roomId).emit('update-game-status', 'PLAYING');
    io.to(roomId).emit('update-turn', room.turnOrder[room.currentTurnIndex]);
    io.to(roomId).emit('update-players', room.players);
    io.to(roomId).emit('chat-message', { id: 'sys-start', author: 'SYSTEM', message: '게임을 시작합니다! 순서대로 단어를 설명해주세요.' });
  });

  // 4. 턴 넘기기
  socket.on('next-turn', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || socket.id !== room.turnOrder[room.currentTurnIndex]) return;

    room.currentTurnIndex++;
    if (room.currentTurnIndex < room.turnOrder.length) {
      io.to(roomId).emit('update-turn', room.turnOrder[room.currentTurnIndex]);
    } else {
      room.status = 'VOTING';
      io.to(roomId).emit('update-game-status', 'VOTING');
      io.to(roomId).emit('chat-message', { id: 'sys-vote', author: 'SYSTEM', message: '설명이 끝났습니다. 라이어를 투표해주세요!' });
    }
  });

  // 5. 투표 제출
  socket.on('submit-vote', (targetId) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'VOTING') return;

    const player = room.players.find(p => p.id === socket.id);
    if (player && !player.votedFor) {
      player.votedFor = targetId;
      room.votes[targetId] = (room.votes[targetId] || 0) + 1;
      room.votedCount++;
      io.to(roomId).emit('update-voted-count', room.votedCount);

      if (room.votedCount === room.players.length) {
        processVoteResults(roomId);
      }
    }
  });

  // 6. 라이어 정답 맞히기
  socket.on('submit-guess', (guess) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'LIAR_GUESS') return;

    const liar = room.players.find(p => p.id === socket.id);
    if (!liar || liar.role !== 'LIAR') return;

    const isCorrect = guess.trim() === room.citizenWord;
    room.roundResults.guessSuccess = isCorrect;

    if (isCorrect) {
      liar.score += 1;
      io.to(roomId).emit('chat-message', { id: 'sys-ans-ok', author: 'SYSTEM', message: `라이어가 정답 [${room.citizenWord}]을(를) 맞혔습니다!` });
    } else {
      room.players.forEach(p => { if (p.role === 'CITIZEN') p.score += 1; });
      io.to(roomId).emit('chat-message', { id: 'sys-ans-no', author: 'SYSTEM', message: `라이어가 정답을 맞히지 못했습니다. 시민의 단어는 [${room.citizenWord}]였습니다!` });
    }

    room.status = 'RESULT';
    io.to(roomId).emit('game-result', {
      voteSuccess: room.roundResults.voteSuccess,
      guessSuccess: isCorrect,
      liar: { name: liar.name, word: room.citizenWord },
      votes: room.votes
    });
    io.to(roomId).emit('update-game-status', 'RESULT');
    io.to(roomId).emit('update-players', room.players);
  });

  // 7. 준비 상태 토글
  socket.on('toggle-ready', () => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player && !player.isHost) {
      player.isReady = !player.isReady;
      io.to(roomId).emit('update-players', room.players);
    }
  });

  // 8. 연결 해제
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        const leftPlayer = room.players[playerIndex];
        room.players.splice(playerIndex, 1);

        if (room.players.length === 0) {
          delete rooms[roomId];
        } else {
          // 방장 위임
          if (leftPlayer.isHost) {
            room.players[0].isHost = true;
            room.players[0].isReady = true;
          }

          // 게임 중 탈주 처리
          if (room.status !== 'LOBBY' && room.status !== 'RESULT') {
            if (leftPlayer.role === 'LIAR') {
              io.to(roomId).emit('chat-message', { author: 'SYSTEM', message: '라이어가 나갔습니다! 시민의 승리입니다.' });
              room.status = 'LOBBY';
            } else if (room.players.length < 3) {
              io.to(roomId).emit('chat-message', { author: 'SYSTEM', message: '인원 부족으로 게임이 종료됩니다.' });
              room.status = 'LOBBY';
            }
            io.to(roomId).emit('update-game-status', room.status);
          }

          io.to(roomId).emit('update-players', room.players);
          io.to(roomId).emit('chat-message', {
            author: 'SYSTEM',
            message: `${leftPlayer.name}님이 퇴장하셨습니다.`
          });
        }
      }
    }
  });
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});