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

// 신규: 하드코딩된 wordDb 객체를 통째로 삭제하고, DB 저장소 모듈을 불러옴
const { getWordDb } = require('./db/wordRepository');

// 신규: 게임 초기화 로직 분리 (start-game 내부의 로직을 함수로 분리하여 상단에 배치)
const initializeGame = (io, roomId, room, activePlayers, socket, categoryName, liarWord, citizenWord, startTimerFunc, handleNextTurnFunc) => {
  room.status = 'PLAYING';
  room.category = categoryName;
  room.liarWord = liarWord;
  room.citizenWord = citizenWord;
  room.votes = {};
  room.votedCount = 0;
  room.roundResults = { voteSuccess: false, guessSuccess: false };
  room.currentTurnIndex = 0;
  
  room.turnOrder = activePlayers.map(p => p.id).sort(() => Math.random() - 0.5);

  const liarIndex = Math.floor(Math.random() * activePlayers.length);
  activePlayers.forEach((p, i) => {
    p.role = (i === liarIndex) ? 'LIAR' : 'CITIZEN';
    p.word = (p.role === 'LIAR') ? liarWord : citizenWord;
    p.votedFor = '';     
    p.currentInput = ''; 
    io.to(p.id).emit('game-start', { role: p.role, word: p.word, category: categoryName });
  });

  const spectators = room.players.filter(p => p.userType === 'SPECTATOR');
  spectators.forEach(p => {
    p.role = 'SPECTATOR';
    p.word = '(관전 중)';
    p.votedFor = '';
    p.currentInput = '';
    io.to(p.id).emit('game-start', { role: 'SPECTATOR', word: '관전 중', category: categoryName });
  });

  io.to(roomId).emit('update-game-status', 'PLAYING');
  io.to(roomId).emit('update-players', room.players);
  io.to(roomId).emit('chat-message', { 
    id: `sys-start-${Date.now()}`, 
    author: 'SYSTEM', 
    message: '게임을 시작합니다! 순서대로 단어를 설명해주세요.' 
  });

  const firstPlayerId = room.turnOrder[0];
  if (firstPlayerId) {
    io.to(roomId).emit('update-turn', firstPlayerId);
    startTimerFunc(roomId, 30, () => {
      const p = room.players.find(player => player.id === firstPlayerId);
      const forcedDesc = (p && p.currentInput) ? p.currentInput : "(시간 초과)";
      io.to(roomId).emit('chat-message', { author: 'SYSTEM', message: `⏰ [${p?.name || '알 수 없음'}]님 시간 초과!` });
      handleNextTurnFunc(roomId, socket, forcedDesc);
    });
  }
};

// [추가] 방 설정을 클라이언트에게 동기화하는 헬퍼 함수
const emitRoomSettings = (roomId, room) => {
  if (!room) return;
  io.to(roomId).emit('update-room-settings', {
    hostId: room.players.find(p => p.isHost)?.id || null,
    allCategories: room.allCategories,
    selectedCategories: room.selectedCategories,
    liarMode: room.liarMode // 라이어 모드 상태 추가
  });
};

const rooms = {};
let cachedAllCategories = [];

const startTimer = (roomId, duration, onTimeUp) => {
  const room = rooms[roomId];
  if (!room) return;

  if (room.timer) clearInterval(room.timer);

  room.timeLeft = duration;
  io.to(roomId).emit('timer-tick', room.timeLeft, duration);

  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(roomId).emit('timer-tick', room.timeLeft, duration);

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
        timeLeft: 0,
        timer: null,
        roundResults: { voteSuccess: false, guessSuccess: false },
        allCategories: cachedAllCategories,
        selectedCategories: [...cachedAllCategories],
        liarMode: 'different_word'
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
      userType: isPlaying ? 'SPECTATOR' : 'PLAYER',
      isReady: isHost,
      isHost: isHost,
      role: '',
      word: '',
      votedFor: '',
      score: 0,
      currentInput: ''
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

    emitRoomSettings(roomId, room);
  });

  socket.on('toggle-category', (roomId, category, isChecked) => {
    const room = rooms[roomId];
    if (!room || (room.status !== 'LOBBY' && room.status !== 'RESULT')) return;

    const hostPlayer = room.players.find(p => p.isHost);
    if (!hostPlayer || hostPlayer.id !== socket.id) return;

    if (isChecked) {
      if (!room.selectedCategories.includes(category)) room.selectedCategories.push(category);
    } else {
      room.selectedCategories = room.selectedCategories.filter(c => c !== category);
    }

    emitRoomSettings(roomId, room);
  });

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

  socket.on('toggle-liar-mode', (roomId, mode) => {
  const room = rooms[roomId];
  if (!room) return;

  // 방어적 권한 검증 (가드 클로즈)
  const hostPlayer = room.players.find(p => p.isHost);
  if (!hostPlayer || hostPlayer.id !== socket.id) return;

  room.liarMode = mode; // 서버 상태 업데이트
  emitRoomSettings(roomId, room); // 변경된 상태 브로드캐스트
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

  // 신규: async 핸들러로 변경
  socket.on('start-game', async (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    const activePlayers = room.players.filter(p => p.userType === 'PLAYER');

    if (activePlayers.length < 3) {
      return socket.emit('error-message', '최소 3명의 플레이어가 필요합니다.');
    }
    
    if (!activePlayers.every(p => p.isReady)) {
      return socket.emit('error-message', '모든 플레이어가 준비 완료 상태여야 합니다.');
    }

    try {
      // 기존 검증 블록 유지
      const wordDb = await getWordDb();
      if (!wordDb) return socket.emit('error-message', '단어 DB를 불러오지 못했습니다.');

      const categories = Object.keys(wordDb);
      if (categories.length === 0) return socket.emit('error-message', 'DB에 등록된 단어 카테고리가 없습니다.');

      const validCategories = room.selectedCategories;
      if (!validCategories || validCategories.length === 0) {
        return socket.emit('error-message', '방장이 카테고리를 최소 1개 이상 선택해야 합니다.');
      }

      const categoryName = validCategories[Math.floor(Math.random() * validCategories.length)];
      const categoryWords = wordDb[categoryName] || [];

      // 여기서부터 새 코드의 liarMode 분기로 교체
      let citizenWord = "";
      let liarWord = "";

      if (room.liarMode === 'you_are_liar') {
        if (categoryWords.length < 1) return socket.emit('error-message', `[${categoryName}] 카테고리에 단어가 없습니다.`);
        citizenWord = categoryWords[Math.floor(Math.random() * categoryWords.length)];
        liarWord = "당신은 라이어입니다";
      } else {
        if (categoryWords.length < 2) return socket.emit('error-message', `[${categoryName}] 카테고리에 단어가 부족합니다. (최소 2개 필요)`);
        const shuffledWords = [...categoryWords].sort(() => Math.random() - 0.5);
        citizenWord = shuffledWords[0];
        liarWord = shuffledWords[1];
      }

      // 3. 검증된 데이터로 분리된 게임 초기화 함수 호출
      initializeGame(io, roomId, room, activePlayers, socket, categoryName, liarWord, citizenWord, startTimer, handleNextTurnInternal);

    } catch (err) {
      console.error('start-game 비동기 처리 중 치명적 오류:', err);
      socket.emit('error-message', '게임 시작 중 서버 오류가 발생했습니다.');
    }
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

          if (leftPlayer.userType == 'PLAYER') {
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
getWordDb().then(db => {
  if (db) {
    cachedAllCategories = Object.keys(db);
    console.log('단어 DB 및 카테고리 캐싱 완료:', cachedAllCategories);
  }
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});