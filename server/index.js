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
  citizenWord: '',
  liarWord: '',
  turnOrder: [],
  currentTurnIndex: 0,
  votes: {},
  votedCount: 0,
  roundResults: {
    voteSuccess: false,
    guessSuccess: false
  }
};

const processVoteResults = () => {
  const sortedVotes = Object.entries(gameState.votes).sort((a, b) => b[1] - a[1]);
  if (sortedVotes.length === 0) return;

  const mostVotedId = sortedVotes[0][0];
  const liar = gameState.players.find(p => p.role === 'LIAR');
  const votedUser = gameState.players.find(p => p.id === mostVotedId);

  io.emit('receive_message', { 
    id: 'sys-' + Date.now(), 
    author: 'SYSTEM', 
    message: `투표 결과: 가장 많은 표를 받은 사람은 [${votedUser ? votedUser.name : '알 수 없음'}]입니다!` 
  });

  if (liar) {
    io.emit('receive_message', { 
      id: 'sys-liar-' + Date.now(), 
      author: 'SYSTEM', 
      message: `실제 라이어는 [${liar.name}]였습니다!` 
    });

    if (mostVotedId === liar.id) {
      gameState.roundResults.voteSuccess = true;
      gameState.players.forEach(p => { if (p.role === 'CITIZEN') p.score += 1; });
    } else {
      gameState.roundResults.voteSuccess = false;
      liar.score += 1;
    }
  }

  gameState.status = 'LIAR_GUESS';
  io.emit('update_game_status', 'LIAR_GUESS');
  io.emit('update_players', gameState.players);
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
    const shuffledWords = [...wordDb[categoryName]].sort(() => Math.random() - 0.5);
    const liarWord = shuffledWords[0];
    const citizenWord = shuffledWords[1];
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
      p.word = isLiar ? liarWord : citizenWord;
      p.votedFor = '';
      io.to(p.id).emit('game_start_info', { role: p.role, word: p.word, category: categoryName });
    });

    io.emit('update_game_status', 'PLAYING');
    io.emit('update_turn', gameState.turnOrder[gameState.currentTurnIndex]);
    io.emit('update_players', gameState.players);
    io.emit('receive_message', { id: 'sys-start', author: 'SYSTEM', message: '게임을 시작합니다! 순서대로 단어를 설명해주세요.' });
  });

  socket.on('next_turn', () => {
    if (socket.id !== gameState.turnOrder[gameState.currentTurnIndex]) return;
    gameState.currentTurnIndex++;
    if (gameState.currentTurnIndex < gameState.turnOrder.length) {
      io.emit('update_turn', gameState.turnOrder[gameState.currentTurnIndex]);
    } else {
      gameState.status = 'VOTING';
      io.emit('update_game_status', 'VOTING');
      io.emit('receive_message', { id: 'sys-vote', author: 'SYSTEM', message: '설명이 끝났습니다. 라이어를 투표해주세요!' });
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
        processVoteResults();
      }
    }
  });

  socket.on('submit_guess', (guess) => {
    if (gameState.status !== 'LIAR_GUESS') return;
    const liar = gameState.players.find(p => p.id === socket.id);
    if (!liar || liar.role !== 'LIAR') return;

    const isCorrect = guess.trim() === gameState.citizenWord;
    gameState.roundResults.guessSuccess = isCorrect;

    if (isCorrect) {
      liar.score += 1;
      io.emit('receive_message', { id: 'sys-ans-ok', author: 'SYSTEM', message: `라이어가 정답 [${gameState.citizenWord}]을(를) 맞혔습니다!` });
    } else {
      gameState.players.forEach(p => { if (p.role === 'CITIZEN') p.score += 1; });
      io.emit('receive_message', { id: 'sys-ans-no', author: 'SYSTEM', message: `라이어가 정답을 맞히지 못했습니다. 시민의 단어는 [${gameState.citizenWord}]였습니다!` });
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
    const disconnectedId = socket.id;
    const disconnectedPlayer = gameState.players.find(p => p.id === disconnectedId);
    if (!disconnectedPlayer) return;

    // 1. 현재 설명 중인 사람이 나갔는지 확인
    const isCurrentTurnPlayer = (gameState.status === 'PLAYING' && gameState.turnOrder[gameState.currentTurnIndex] === disconnectedId);

    // 2. 라이어 탈주 처리 (정답 맞히기 단계)
    if (disconnectedPlayer.role === 'LIAR' && gameState.status === 'LIAR_GUESS') {
      io.emit('receive_message', { id: 'sys-esc', author: 'SYSTEM', message: '라이어가 도망갔습니다! 시민의 승리입니다.' });
      gameState.players.forEach(p => { if (p.role === 'CITIZEN') p.score += 1; });
      gameState.status = 'RESULT';
      io.emit('game_result', {
        voteSuccess: gameState.roundResults.voteSuccess,
        guessSuccess: false,
        liar: { name: disconnectedPlayer.name, word: gameState.citizenWord },
        votes: gameState.votes
      });
      io.emit('update_game_status', 'RESULT');
    }

    // 3. 투표 데이터 정리
    if (gameState.status === 'VOTING') {
      if (disconnectedPlayer.votedFor) {
        gameState.votedCount--;
      }
      if (gameState.votes[disconnectedId]) {
        delete gameState.votes[disconnectedId];
      }
    }

    // 4. 플레이어 리스트 및 턴 순서에서 제거
    gameState.players = gameState.players.filter(p => p.id !== disconnectedId);
    
    if (gameState.status === 'PLAYING') {
      // 턴 순서 배열에서도 제거
      const removedIndex = gameState.turnOrder.indexOf(disconnectedId);
      gameState.turnOrder = gameState.turnOrder.filter(id => id !== disconnectedId);

      // 나간 사람이 현재 차례였거나, 나간 사람 때문에 인덱스가 밀리는 경우 조정
      if (isCurrentTurnPlayer) {
        io.emit('receive_message', { id: 'sys-skip', author: 'SYSTEM', message: `설명 중이던 [${disconnectedPlayer.name}]님이 퇴장하여 다음 턴으로 넘깁니다.` });
        if (gameState.currentTurnIndex >= gameState.turnOrder.length) {
          // 더 이상 설명할 사람이 없으면 투표로
          gameState.status = 'VOTING';
          io.emit('update_game_status', 'VOTING');
        } else {
          // 다음 사람에게 턴 알림
          io.emit('update_turn', gameState.turnOrder[gameState.currentTurnIndex]);
        }
      } else if (removedIndex < gameState.currentTurnIndex) {
        // 현재 차례보다 앞 순서 사람이 나갔으면 인덱스 하나 줄임 (순서 유지)
        gameState.currentTurnIndex--;
      }
    }

    // 5. 투표 진행 중 이탈 체크
    if (gameState.status === 'VOTING' && gameState.players.length > 0) {
      const actualVoters = gameState.players.filter(p => p.votedFor).length;
      gameState.votedCount = actualVoters;
      io.emit('update_voted_count', gameState.votedCount);

      if (gameState.votedCount === gameState.players.length) {
        processVoteResults();
      }
    }

    // 방장 퇴장 처리
    if (gameState.players.length > 0 && !gameState.players.some(p => p.isHost)) {
      gameState.players[0].isHost = true;
      gameState.players[0].isReady = true;
    }

    // 인원 부족 중단 처리
    if (gameState.players.length < 3 && gameState.status !== 'LOBBY' && gameState.status !== 'RESULT') {
      gameState.status = 'LOBBY';
      io.emit('update_game_status', 'LOBBY');
      io.emit('receive_message', { id: 'sys-stop', author: 'SYSTEM', message: '인원 부족으로 게임이 중단되었습니다.' });
    }

    io.emit('update_players', gameState.players);
  });
});

server.listen(3001, () => console.log('Server running on 3001'));