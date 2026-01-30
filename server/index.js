const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

const buildPath = path.join(__dirname, '../build');
app.use(express.static(buildPath));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const wordDb = {
  "동물": ["강아지", "고양이", "사자", "호랑이", "코끼리", "기린", "펭귄", "토끼", "다람쥐", "판다"],
  "과일": ["사과", "바나나", "포도", "딸기", "수박", "복숭아", "멜론"],
  "직업": ["의사", "경찰관", "소방관", "선생님", "요리사", "판사", "프로그래머", "변호사", "가수", "운동선수", "과학자", "화가"],
  "음식": ["피자", "비빔밥", "치킨", "햄버거", "떡볶이", "초밥", "파스타", "삼겹살", "짜장면", "냉면"],
  "전자제품": ["스마트폰", "노트북", "냉장고", "세탁기", "에어컨", "텔레비전", "전자레인지", "청소기", "가습기", "이어폰"],
  "운동": ["축구", "농구", "야구", "배구", "수영", "테니스", "골프", "배드민턴", "스케이트", "탁구"]
};

const rooms = {};

// --- [추가] 타이머 관리 유틸리티 ---
const startTimer = (roomId, duration, onTimeUp) => {
  const room = rooms[roomId];
  if (!room) return;

  if (room.timer) clearInterval(room.timer);

  room.timeLeft = duration;
  io.to(roomId).emit('timer-tick', room.timeLeft);

  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(roomId).emit('timer-tick', room.timeLeft);

    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      onTimeUp();
    }
  }, 1000);
};

const stopTimer = (roomId) => {
  const room = rooms[roomId];
  if (room && room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
};
// --------------------------------

const processVoteResults = (roomId) => {
  const room = rooms[roomId];
  if (!room) return;

  stopTimer(roomId);

  const sortedVotes = Object.entries(room.votes).sort((a, b) => b[1] - a[1]);

  // 미투표자 기권 처리로 인해 표가 아예 없을 수도 있음
  let mostVotedId = null;
  if (sortedVotes.length > 0 && sortedVotes[0][1] > 0) {
    mostVotedId = sortedVotes[0][0];
  }

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

  // --- [수정] 라이어 정답 추리 타이머 시작 (예: 15초) ---
  startTimer(roomId, 15, () => {
    if (room.status === 'LIAR_GUESS') {
      // 1. 현재 방에서 라이어 역할을 가진 플레이어를 찾습니다.
      const currentLiar = room.players.find(p => p.role === 'LIAR');

      // 2. 해당 플레이어가 실시간으로 보내온 currentInput 값을 가져옵니다. (없으면 빈 문자열)
      const lastInput = currentLiar ? currentLiar.currentInput : "";

      // 3. 사용자들에게 알림을 보냅니다.
      io.to(roomId).emit('chat-message', {
        author: 'SYSTEM',
        message: `⏰ 시간이 초과되었습니다! 최종 입력값 [${lastInput || "없음"}]으로 정답을 판정합니다.`
      });

      // 4. 기존에 만들어둔 판정 함수에 해당 입력값을 넣어 결과 처리
      handleGuessResult(roomId, lastInput);
    }
  });

};

// --- [추가] 정답 확인 및 결과 발표 공통 로직 ---
const handleGuessResult = (roomId, guess) => {
  const room = rooms[roomId];
  if (!room) return;

  stopTimer(roomId); // 정답 제출 혹은 시간 초과 시 타이머 중지

  const liar = room.players.find(p => p.role === 'LIAR');
  if (!liar) return;

  // 입력값의 앞뒤 공백을 제거하고 시민 단어와 비교합니다.
  const finalGuess = (guess || "").trim();
  const isCorrect = finalGuess === room.citizenWord;
  room.roundResults.guessSuccess = isCorrect;

  if (isCorrect) {
    liar.score += 1;
    io.to(roomId).emit('chat-message', { id: 'sys-ans-ok', author: 'SYSTEM', message: `라이어가 정답 [${room.citizenWord}]을 맞혔습니다! 시민 패배!` });
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

  room.players.forEach(p=>p.userType = 'PLAYER');
  io.to(roomId).emit('update-game-status', 'RESULT');
  io.to(roomId).emit('update-players', room.players);
};

io.on('connection', (socket) => {
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
        timeLeft: 0,    // [추가]
        timer: null,    // [추가]
        roundResults: { voteSuccess: false, guessSuccess: false }
      };
    }

    const room = rooms[roomId];
    const isDuplicate = room.players.some(p => p.name === name);
    if (isDuplicate) return socket.emit('error-message', '이미 사용 중인 닉네임입니다.');

    socket.join(roomId);
    socket.roomId = roomId;

    const isHost = room.players.length === 0;
    const isPlaying = room.status !== 'RESULT' && room.status !== 'LOBBY';
    const newPlayer = {
      id: socket.id,
      name,
      userType: isPlaying ? 'SPECTATOR' : 'PLAYER', // 추가: 'PLAYER' 또는 'SPECTATOR'
      isReady: isHost,
      isHost: isHost,
      role: '',
      word: '',
      votedFor: '',
      score: 0,
      currentInput: '' // [추가] 실시간 입력값 저장용
    };

    room.players.push(newPlayer);
    socket.emit('join-success');
    io.to(roomId).emit('update-players', room.players);
    io.to(roomId).emit('chat-message', {
      id: Date.now(),
      author: 'SYSTEM',
      message: `${name}님이 입장하셨습니다.`
    });

    io.to(roomId).emit('update-game-status', room.status);
  });

  // [추가] 클라이언트에서 입력 중인 텍스트 수신
  socket.on('update-input', (text) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player) player.currentInput = text;
  });

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

  // --- [수정] 턴 전환 로직을 함수로 분리 (시간 초과 시 재사용 위함) ---
  const handleNextTurnInternal = (roomId, targetSocket, description) => {
    const room = rooms[roomId];
    if (!room) return;

    stopTimer(roomId);
    const player = room.players.find(p => p.id === room.turnOrder[room.currentTurnIndex]);

    if (description && description.trim()) {
      io.to(roomId).emit('chat-message', {
        id: 'desc-' + Date.now(),
        author: 'SYSTEM_DESC',
        message: `📢 [설명] ${player.name}: "${description}"`
      });
    }

    room.currentTurnIndex++;
    if (room.currentTurnIndex < room.turnOrder.length) {
      const nextPlayerId = room.turnOrder[room.currentTurnIndex];
      io.to(roomId).emit('update-turn', nextPlayerId);

      // 다음 사람 타이머 시작
      startTimer(roomId, 30, () => {
        const p = room.players.find(player => player.id === nextPlayerId);
        const forcedDesc = p ? (p.currentInput || "(시간 초과)") : "";
        io.to(roomId).emit('chat-message', { author: 'SYSTEM', message: `⏰ [${p?.name}]님 시간 초과!` });
        handleNextTurnInternal(roomId, targetSocket, forcedDesc);
      });
    } else {
      room.status = 'VOTING';
      io.to(roomId).emit('update-game-status', 'VOTING');
      io.to(roomId).emit('chat-message', { id: 'sys-vote', author: 'SYSTEM', message: '설명이 끝났습니다. 라이어를 투표해주세요!' });

      // 투표 타이머 시작
      startTimer(roomId, 20, () => {
        io.to(roomId).emit('chat-message', { author: 'SYSTEM', message: `⏰ 투표 시간이 종료되었습니다. 미투표자는 기권 처리됩니다.` });
        processVoteResults(roomId);
      });
    }
  };

  // [중요] 게임 시작 시점의 로직 수정
  socket.on('start-game', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    // 1. 실제 게임에 참여하는 인원만 추출
    const activePlayers = room.players.filter(p => p.userType === 'PLAYER');

    // 최소 인원 체크 등은 activePlayers 기준
    if (activePlayers.length < 3) return socket.emit('error-message', '최소 3명이 필요합니다.');
    if (!activePlayers.every(p => p.isReady)) return socket.emit('error-message', '모든 플레이어가 준비 완료 상태여야 합니다.');

    const categories = Object.keys(wordDb);
    const categoryName = categories[Math.floor(Math.random() * categories.length)];
    const shuffledWords = [...wordDb[categoryName]].sort(() => Math.random() - 0.5);
    const liarWord = shuffledWords[0];
    const citizenWord = shuffledWords[1];
    // 3. 역할 부여 (activePlayers 내에서만 라이어 선정)
    const liarIndex = Math.floor(Math.random() * activePlayers.length);

    room.status = 'PLAYING';
    room.category = categoryName;
    room.liarWord = liarWord;
    room.citizenWord = citizenWord;
    room.votes = {};
    room.votedCount = 0;
    room.roundResults = { voteSuccess: false, guessSuccess: false };
    // 2. 턴 순서(turnOrder)는 반드시 activePlayers의 ID로만 구성
    room.turnOrder = activePlayers.map(p => p.id).sort(() => Math.random() - 0.5);
    room.currentTurnIndex = 0;
    
    activePlayers.forEach((p, i) => {
      const isLiar = i === liarIndex;
      p.role = isLiar ? 'LIAR' : 'CITIZEN';
      p.word = isLiar ? liarWord : citizenWord;
      p.votedFor = '';
      p.currentInput = '';
      io.to(p.id).emit('game-start', { role: p.role, word: p.word, category: categoryName });
    });

    // SPECTATOR 처리
    room.players.filter(p => p.userType === 'SPECTATOR').forEach(p => {
      p.role = 'SPECTATOR';
      p.word = '(관전 중)';
      io.to(p.id).emit('game-start', { role: 'SPECTATOR', word: '관전 중', category: room.category });
    });

    io.to(roomId).emit('update-game-status', 'PLAYING');
    //io.to(roomId).emit('update-turn', room.turnOrder[room.currentTurnIndex]);
    io.to(roomId).emit('update-players', room.players);
    io.to(roomId).emit('chat-message', { id: 'sys-start', author: 'SYSTEM', message: '게임을 시작합니다! 순서대로 단어를 설명해주세요.' });

    // [수정된 부분] 첫 번째 플레이어 턴 전송 및 타이머 시작
    const firstPlayerId = room.turnOrder[0];
    io.to(roomId).emit('update-turn', firstPlayerId);

    startTimer(roomId, 30, () => {
      const p = room.players.find(player => player.id === firstPlayerId);
      // 현재 입력 중인 내용이 있다면 그것을 사용, 없다면 "(시간 초과)" 메시지
      const forcedDesc = p ? (p.currentInput || "(시간 초과)") : "";
      io.to(roomId).emit('chat-message', { author: 'SYSTEM', message: `⏰ [${p?.name}]님 시간 초과!` });
      handleNextTurnInternal(roomId, socket, forcedDesc);
    });
  });

  // 4. 턴 넘기기 (설명 내용 포함 버전으로 수정)
  socket.on('next-turn', (description) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || socket.id !== room.turnOrder[room.currentTurnIndex]) return;
    handleNextTurnInternal(roomId, socket, description);
  });

  socket.on('submit-vote', (targetId) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'VOTING') return;

    const player = room.players.find(p => p.id === socket.id);
    
    // 관전자는 투표권이 없으므로 무시
    if (!player || player.userType !== 'PLAYER') return;

    if (player && !player.votedFor) {
      player.votedFor = targetId;
      room.votes[targetId] = (room.votes[targetId] || 0) + 1;
      room.votedCount++;
      io.to(roomId).emit('update-voted-count', room.votedCount);

      // [수정] 전체 인원이 아니라 실제 플레이어(activePlayers) 수와 비교해야 함
      const activePlayers = room.players.filter(p => p.userType === 'PLAYER');
      if (room.votedCount === activePlayers.length) {
        processVoteResults(roomId);
      }
    }
  });

  socket.on('submit-guess', (guess) => {
    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room || room.status !== 'LIAR_GUESS') return;

    handleGuessResult(roomId, guess);
  });

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

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);

      if (playerIndex !== -1) {
        const leftPlayer = room.players[playerIndex];
        room.players.splice(playerIndex, 1);

        if (room.players.length === 0) {
          stopTimer(roomId);
          delete rooms[roomId];
        } else {
          if (leftPlayer.isHost) {
            room.players[0].isHost = true;
            room.players[0].isReady = true;
          }

          if (room.status !== 'LOBBY' && room.status !== 'RESULT') {
            stopTimer(roomId); // 나갔을 때 타이머 중지
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