import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = window.location.hostname === 'localhost'
  ? "http://localhost:3001"
  : window.location.origin;

const socket = io(SOCKET_URL, {
  transports: ["websocket"]
});

function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialRoomId = urlParams.get('room') || 'default-room';

  const [roomId, setRoomId] = useState(initialRoomId);
  const [name, setName] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [players, setPlayers] = useState([]);
  const [message, setMessage] = useState("");
  const [chatLog, setChatLog] = useState([]);
  const [isConnected, setIsConnected] = useState(socket.connected);

  const [gameStatus, setGameStatus] = useState("LOBBY");
  const [myGameData, setMyGameData] = useState(null);
  const [showError, setShowError] = useState("");
  const [currentTurnId, setCurrentTurnId] = useState("");

  const [votedCount, setVotedCount] = useState(0);
  const [gameResult, setGameResult] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [guessWord, setGuessWord] = useState("");
  const [descInput, setDescInput] = useState("");
  const [isInfoVisible, setIsInfoVisible] = useState(true);

  // 모달 최소화 상태
  const [isMinimized, setIsMinimized] = useState(false);

  // 타이머 상태
  const [timeLeft, setTimeLeft] = useState(0);
  const [timeMax, setTimeMax] = useState(0);

  const [roomSettings, setRoomSettings] = useState({
    allCategories: [],
    selectedCategories: []
  });

  const chatEndRef = useRef(null);
  const descInputRef = useRef("");
  const guessWordRef = useRef("");
  const currentTurnIdRef = useRef("");
  const gameStatusRef = useRef("LOBBY");

  useEffect(() => { descInputRef.current = descInput; }, [descInput]);
  useEffect(() => { guessWordRef.current = guessWord; }, [guessWord]);
  useEffect(() => { currentTurnIdRef.current = currentTurnId; }, [currentTurnId]);
  useEffect(() => { gameStatusRef.current = gameStatus; }, [gameStatus]);

  useEffect(() => {
    const scriptId = "tailwind-cdn";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://cdn.tailwindcss.com";
      document.head.appendChild(script);
    }

    if (socket.connected) {
      setIsConnected(true);
    }

    socket.on("connect", () => {
      setIsConnected(true);
    });

    socket.on("connect_error", (err) => {
      console.error("❌ 소켓 연결 에러 발생:", err.message);
    });

    socket.on("disconnect", (reason) => {
      setIsConnected(false);
    });

    socket.on("update-players", (data) => setPlayers(data));
    socket.on("chat-message", (data) => setChatLog((prev) => [...prev, data]));

    socket.on("join-success", () => {
      setIsJoined(true);
      setShowError("");
    });

    socket.on("game-start", (data) => {
      setMyGameData(data);
      setGameStatus("PLAYING");
      setGameResult(null);
      setHasVoted(false);
      setVotedCount(0);
      setGuessWord("");
      setDescInput("");
      setIsMinimized(false);
    });

    socket.on("update-game-status", (status) => {
      setGameStatus(status);
      // 라이어가 단어를 맞추는 단계(LIAR_GUESS)가 되었을 때
      if (status === "LIAR_GUESS") {
        // 본인이 라이어라면 모달을 다시 보여줌 (최소화 해제)
        if (myGameData?.role === "LIAR") {
          setIsMinimized(false);
        }
      }
    });
    socket.on("update-turn", (id) => {
      setCurrentTurnId(id);
      if (id === socket.id) setIsMinimized(false);
    });
    socket.on("update-voted-count", (count) => setVotedCount(count));

    socket.on("timer-tick", (time, maxTime) => {
      setTimeLeft(time);
      setTimeMax(maxTime);
      if (time === 0) {
        if (gameStatusRef.current === "PLAYING" && currentTurnIdRef.current === socket.id) {
          socket.emit("next-turn", descInputRef.current || "시간 초과로 설명을 건너뜁니다.");
          setDescInput("");
        }
        if (gameStatusRef.current === "LIAR_GUESS" && myGameData?.role === "LIAR") {
          socket.emit("submit-guess", guessWordRef.current || "시간 초과");
          setGuessWord("");
        }
      }
    });

    socket.on("game-result", (result) => {
      setGameResult(result);
      setGameStatus("RESULT");
      setTimeLeft(0);
    });

    socket.on("error-message", (msg) => {
      setShowError(msg);
      setTimeout(() => setShowError(""), 3000);
    });

    socket.on('update-room-settings', (settings) => {
      if (settings) {
        setRoomSettings({
          allCategories: settings.allCategories || [],
          selectedCategories: settings.selectedCategories || []
        });
      }
    });

    return () => {
      socket.off("update-players");
      socket.off("chat-message");
      socket.off("join-success");
      socket.off("game-start");
      socket.off("update-game-status");
      socket.off("update-turn");
      socket.off("update-voted-count");
      socket.off("timer-tick");
      socket.off("game-result");
      socket.off("error-message");
      socket.off('update-room-settings');
    };
  }, [myGameData]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);

  useEffect(() => {
  }, [roomSettings]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (name.trim() && roomId.trim()) {
      socket.emit("join-room", { roomId, name });
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!message.trim()) {
      setShowError("채팅 내용은 공백일 수 없습니다.");
      setTimeout(() => setShowError(""), 2000);
      return;
    }
    socket.emit("send-message", { roomId, message });
    setMessage("");
  };

  const handleToggleReady = () => socket.emit("toggle-ready");
  const handleStartGame = () => socket.emit("start-game", roomId);

  const handleDescInputChange = (e) => {
    const val = e.target.value;
    setDescInput(val);
    if (currentTurnId === socket.id) {
      socket.emit("update-input", val);
    }
  };

  const handleGuessInputChange = (e) => {
    const val = e.target.value;
    setGuessWord(val);
    if (gameStatus === 'LIAR_GUESS') {
      socket.emit("update-input", val);
    }
  };

  const handleNextTurn = (e) => {
    if (e) e.preventDefault();
    if (!descInput.trim()) {
      setShowError("단어에 대한 설명을 입력해주세요.");
      setTimeout(() => setShowError(""), 2000);
      return;
    }
    socket.emit("next-turn", descInput);
    setDescInput("");
  };

  const handleVote = (targetId) => {
    if (hasVoted) return;
    socket.emit("submit-vote", targetId);
    setHasVoted(true);
  };

  const handleSubmitGuess = (e) => {
    e.preventDefault();
    if (guessWord.trim()) {
      socket.emit("submit-guess", guessWord);
    }
  };

  const handleExit = () => {
    if (!window.confirm("정말 방에서 나가시겠습니까?")) return;
    socket.disconnect();
    setIsJoined(false);
    setGameStatus("LOBBY");
    setChatLog([]);
    socket.connect();
  };

  const myInfo = players.find(p => p.id === socket.id);
  const isMyTurn = currentTurnId === socket.id && gameStatus === "PLAYING";
  const isLiar = myGameData?.role === "LIAR";
  const isSpectator = myInfo?.userType === 'SPECTATOR';
  const amIHost = myInfo?.isHost;
  const isTimerActive = ["PLAYING", "VOTING", "LIAR_GUESS"].includes(gameStatus);

  if (!isJoined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-4 relative font-sans">
        {showError && (
          <div className="absolute top-10 bg-rose-500 text-white px-8 py-4 rounded-2xl shadow-2xl z-50 animate-bounce font-black text-sm uppercase">
            ⚠ {showError}
          </div>
        )}
        <div className="bg-white p-10 rounded-[3rem] shadow-2xl w-full max-w-md border border-slate-200 text-center flex flex-col gap-6">
          <div>
            <h1 className="text-5xl font-black text-blue-600 tracking-tighter italic uppercase mb-2">Liar Game</h1>
            <p className="text-slate-400 font-bold text-sm tracking-widest uppercase">Multi-Room Edition</p>
          </div>
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">Room ID</label>
              <input
                type="text"
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 focus:border-blue-500 rounded-2xl outline-none font-bold text-center"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1 text-left">
              <label className="text-[10px] font-black text-slate-400 ml-2 uppercase">Nickname</label>
              <input
                type="text"
                placeholder="닉네임 입력"
                className="w-full p-5 bg-slate-50 border-2 border-slate-100 focus:border-blue-500 rounded-2xl outline-none font-bold text-center"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={10}
              />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white p-5 rounded-2xl font-black text-xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 uppercase active:scale-95">입장하기</button>
          </form>
          <div className="flex items-center justify-center gap-2 text-slate-300 font-bold text-[10px] uppercase tracking-widest">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
            {isConnected ? 'Server Connected' : 'Connecting...'}
          </div>
        </div>
      </div>
    );
  }

  const gaugeWidth = timeMax > 0 ? Math.min(100, (timeLeft / timeMax) * 100) : 0;

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden text-slate-800 font-sans relative">
      {showError && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 bg-rose-500 text-white px-8 py-4 rounded-2xl shadow-2xl z-[100] animate-bounce font-black text-sm uppercase">
          ⚠ {showError}
        </div>
      )}

      {/* 내 차례 설명 모달 (조건부 표시: 최소화되지 않았을 때만 중앙 모달 노출) */}
      {isMyTurn && !isMinimized && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden w-full max-w-lg animate-in zoom-in-95">
            <div className="h-2 bg-slate-100 w-full overflow-hidden">
              <div
                className={`h-full transition-all duration-1000 ease-linear ${timeLeft < 5 ? 'bg-rose-500' : 'bg-blue-600'}`}
                style={{ width: `${gaugeWidth}%` }}
              />
            </div>

            <div className="bg-blue-600 p-4 flex justify-between items-center relative">
              <span className="text-white font-black italic uppercase tracking-tighter text-xl mx-auto">
                Your Turn
              </span>
              <button
                onClick={() => setIsMinimized(true)}
                className="text-white/80 hover:text-white transition-colors p-1 absolute right-6"
                title="최소화"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
              </button>
            </div>

            <div className="p-8 flex flex-col gap-6 text-center">
              <div>
                <p className="font-black uppercase tracking-widest text-slate-400 text-[10px] mb-1">
                  Your Word
                </p>
                <h2 className="font-black text-slate-900 tracking-tighter italic uppercase text-4xl">
                  {myGameData?.word}
                </h2>
              </div>

              <form onSubmit={handleNextTurn} className="space-y-4">
                <input
                  autoFocus
                  type="text"
                  value={descInput}
                  onChange={handleDescInputChange}
                  placeholder="단어에 대해 설명해주세요"
                  className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-black text-center text-xl focus:border-blue-600 transition-all"
                />
                <button type="submit" className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-blue-700 shadow-xl shadow-blue-100 uppercase italic">
                  설명 완료 ({timeLeft}s)
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 라이어 정답 추리 모달 (이 부분도 최소화 대응 가능하게 유지) */}
      {gameStatus === "LIAR_GUESS" && isLiar && !isSpectator && !isMinimized && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-rose-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] shadow-2xl border-4 border-rose-500 overflow-hidden w-full max-w-lg animate-in zoom-in-95">
            <div className="bg-rose-500 p-4 flex justify-between items-center">
              <span className="text-white font-black italic uppercase tracking-tighter text-xl mx-auto">
                Guess Time!
              </span>
              <button onClick={() => setIsMinimized(true)} className="text-white/80 hover:text-white p-1 absolute right-6">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
              </button>
            </div>
            <div className="p-8 flex flex-col gap-6 text-center">
              <div>
                <p className="text-[10px] text-rose-400 font-black uppercase tracking-widest mb-1">당신은 라이어입니다</p>
                <h2 className="text-2xl font-black text-slate-900 tracking-tighter italic uppercase">시민의 단어를 맞히세요</h2>
              </div>
              <form onSubmit={handleSubmitGuess} className="space-y-4">
                <input
                  autoFocus
                  type="text"
                  value={guessWord}
                  onChange={handleGuessInputChange}
                  placeholder="정답 입력..."
                  className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-black text-center text-xl focus:border-rose-500 transition-all"
                />
                <button className="w-full bg-rose-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-rose-700 shadow-xl shadow-rose-100 uppercase italic">
                  정답 제출 ({timeLeft}s)
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 모바일 헤더 */}
      <div className="md:hidden bg-white/80 backdrop-blur-sm p-3 flex justify-between items-center border-b shrink-0 z-40">
        <span className="font-black italic text-slate-800 tracking-tighter">🕵️ {roomId.toUpperCase()}</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsInfoVisible(!isInfoVisible)}
            className="bg-slate-800 text-white px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-transform"
          >
            {isInfoVisible ? "HIDE INFO" : "SHOW INFO"}
          </button>
          <button
            onClick={handleExit}
            className="bg-rose-50 text-rose-600 border-2 border-rose-200 px-3 py-1.5 rounded-full text-[10px] font-black uppercase shadow-sm active:scale-95 transition-all duration-300 hover:bg-rose-600 hover:text-white hover:border-rose-600"
          >
            EXIT ROOM
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 p-2 md:p-4 gap-2 md:gap-4 overflow-hidden relative">
        {/* 모바일 전용 최소화 복구 버튼 (채팅창 위 배치) */}
        {isMinimized && (isMyTurn || (gameStatus === "LIAR_GUESS" && isLiar)) && (
          <div className="md:hidden fixed bottom-[80px] left-2 right-2 z-[55] animate-in slide-in-from-bottom-2">
            <button
              onClick={() => setIsMinimized(false)}
              className="w-full bg-slate-900 text-white p-4 rounded-2xl shadow-xl border-2 border-white/20 flex items-center justify-between font-black italic uppercase"
            >
              <div className="flex items-center gap-2">
                <span className="bg-blue-600 px-2 py-1 rounded text-[10px]">RECOVERY</span>
                <span className="text-sm">입력창 열기</span>
              </div>
              <div className="bg-rose-500 text-white px-3 py-1 rounded-lg text-lg tabular-nums">
                {timeLeft}s
              </div>
            </button>
          </div>
        )}

        {/* 좌측 패널 */}
        <div className={`
          ${isInfoVisible ? 'flex' : 'hidden'}
          md:flex w-full md:w-1/3 flex-col gap-2 md:gap-4 overflow-hidden h-full shrink-0
          max-h-[50vh] md:max-h-full transition-all duration-300
        `}>
          {/* 내 정보 카드 */}
          <div className="bg-white p-3 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 shrink-0 flex items-center gap-3 md:gap-4">
            <div className="w-10 h-10 md:w-16 md:h-16 bg-blue-100 rounded-full flex items-center justify-center shrink-0 border-2 md:border-4 border-white text-lg md:text-2xl">
              👤
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-black text-base md:text-xl text-slate-900 leading-none truncate max-w-[100px]">{name}</span>
                <span className="bg-blue-600 text-white text-[8px] md:text-[10px] px-1.5 py-0.5 rounded-full font-black uppercase">Me</span>
                {isSpectator && (
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter shrink-0 border bg-indigo-50 border-indigo-200 text-indigo-600 ml-1">
                    Spectator
                  </span>
                )}
              </div>
              <span className="text-slate-400 text-[9px] md:text-xs font-bold mt-1 uppercase">
                SCORE: <span className="text-blue-600">{myInfo?.score || 0}</span> | {myInfo?.isHost ? "HOST 👑" : "MEMBER"}
              </span>
            </div>
            {isTimerActive && (
              <div className={`ml-auto px-4 py-2 rounded-2xl border-2 font-black text-xl ${timeLeft <= 5 ? 'bg-rose-50 border-rose-400 text-rose-600 animate-pulse' : 'bg-slate-50 border-slate-100 text-slate-600'}`}>
                {timeLeft}s
              </div>
            )}
          </div>

          {/* 플레이어 리스트 및 상태 */}
          <div className="bg-white p-4 md:p-6 rounded-[1.5rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 flex-1 flex flex-col overflow-hidden">
            <h2 className="text-base md:text-xl font-black mb-2 md:mb-4 border-b pb-2 flex justify-between items-center shrink-0 uppercase italic text-slate-400">
              {gameStatus === "LOBBY" ? "🏠 Lobby" :
                gameStatus === "VOTING" ? "🗳 Voting" :
                  gameStatus === "LIAR_GUESS" ? "🤔 Liar's Turn" :
                    gameStatus === "RESULT" ? "🏆 Result" : "🎮 Playing"}
            </h2>

            <div className="flex-1 flex flex-col overflow-hidden">
              {(gameStatus === "PLAYING" || gameStatus === "VOTING" || gameStatus === "LIAR_GUESS") && myGameData && (
                <div className="mb-3 p-4 bg-blue-600 rounded-[1.5rem] text-center shadow-lg shadow-blue-100 shrink-0">
                  <p className="text-[8px] text-blue-200 font-black mb-0.5 uppercase tracking-widest">Category: {myGameData.category}</p>
                  <p className="text-2xl font-black text-white tracking-tighter italic uppercase">{myGameData.word}</p>
                </div>
              )}

              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {players.map((p) => (
                  <div key={p.id}
                    className={`p-3 md:p-4 rounded-2xl flex justify-between items-center border-2 transition-all ${currentTurnId === p.id ? "bg-amber-50 border-amber-400 shadow-md" : "bg-white border-slate-50"
                      } ${socket.id === p.id ? "ring-2 ring-blue-600/10" : ""}`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div className="flex items-center gap-1.5 truncate">
                        {p.isHost && <span className="text-xs">👑</span>}
                        <span className={`font-black text-xs md:text-sm truncate ${socket.id === p.id ? "text-blue-600" : "text-slate-700"}`}>
                          {p.name}
                        </span>
                      </div>
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">
                        {p.score || 0}P
                      </span>
                      {currentTurnId === p.id && gameStatus === "PLAYING" && (
                        <span className="text-[8px] bg-amber-400 text-white px-1.5 py-0.5 rounded-full font-black animate-pulse uppercase shrink-0">Turn</span>
                      )}
                      {((gameStatus === "LOBBY" || gameStatus === "RESULT") && !p.isHost) ? (
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter shrink-0 border ${p.isReady
                          ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                          : "bg-slate-50 border-slate-200 text-slate-400"
                          }`}>
                          {p.isReady ? "Ready" : "Wait"}
                        </span>
                      ) : p.userType === "SPECTATOR" && (
                        <span className={"text-[9px] font-black px-2 py-0.5 rounded-md uppercase border bg-indigo-50 border-indigo-200 text-indigo-600"}>Spectator</span>
                      )}
                    </div>
                    {gameStatus === "VOTING" && !hasVoted && !isSpectator && p.id !== socket.id && p.userType === 'PLAYER' && (
                      <button
                        onClick={() => handleVote(p.id)}
                        className="bg-rose-500 text-white text-[10px] px-3 py-1.5 rounded-xl font-black hover:bg-rose-600 transition-colors uppercase italic shadow-sm"
                      >
                        VOTE
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {(gameStatus === "LOBBY" || gameStatus === "RESULT") && roomSettings.allCategories.length > 0 && (
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 w-full mb-3 text-left z-10 relative">
              <h3 className="text-sm font-bold text-slate-600 mb-3 flex items-center justify-between">
                카테고리 설정
                <span className={`text-xs px-2 py-1 rounded-full ${amIHost ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                  {amIHost ? '방장 권한' : '방장만 변경 가능'}
                </span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {roomSettings.allCategories.map(cat => (
                  <label key={cat} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${!amIHost ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'} ${roomSettings.selectedCategories.includes(cat) ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-slate-200 text-slate-500'}`}>
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 categoryCheckboxes"
                      checked={roomSettings.selectedCategories.includes(cat)}
                      disabled={!amIHost}
                      onChange={(e) => socket.emit('toggle-category', roomId, cat, e.target.checked)}
                    />
                    {cat}
                  </label>
                ))}
              </div>
              {amIHost && (
                <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => {
                      roomSettings.allCategories.forEach(cat => {
                        if (!roomSettings.selectedCategories.includes(cat)) {
                          socket.emit('toggle-category', roomId, cat, true);
                        }
                      });
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                  >
                    모두 선택
                  </button>
                  <button
                    onClick={() => {
                      roomSettings.selectedCategories.forEach(cat => {
                        socket.emit('toggle-category', roomId, cat, false);
                      });
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-rose-600 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors shadow-sm"
                  >
                    모두 해제
                  </button>
                </div>
              )}
            </div>
          )}

          {/* PC 액션 패널 영역 (최초 클라이언트 설명 입력 위치) */}
          <div className="bg-white p-3 rounded-[1.5rem] border border-slate-200 shadow-sm shrink-0">
            {isMinimized && (isMyTurn || (gameStatus === "LIAR_GUESS" && isLiar)) ? (
              /* PC용 최소화 복구 버튼 */
              <button
                onClick={() => setIsMinimized(false)}
                className="hidden md:flex w-full bg-slate-900 text-white p-4 rounded-2xl shadow-lg border-2 border-slate-700 flex items-center justify-between font-black italic uppercase hover:bg-slate-800 transition-all group"
              >
                <div className="flex flex-col items-start leading-none">
                  <span className="text-[10px] text-blue-400 mb-1 group-hover:animate-pulse">MINIMIZED</span>
                  <span className="text-sm">열어서 입력하기</span>
                </div>
                <div className="bg-rose-500 text-white w-12 h-12 rounded-xl flex items-center justify-center text-xl tabular-nums shadow-inner">
                  {timeLeft}
                </div>
              </button>
            ) : gameStatus === "LOBBY" ? (
              myInfo?.isHost ? (
                <button onClick={handleStartGame} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-blue-700 shadow-lg shadow-blue-100 uppercase italic">Start Game</button>
              ) : (
                <button onClick={handleToggleReady} className={`w-full py-4 rounded-2xl font-black text-lg transition-all ${myInfo?.isReady ? "bg-slate-200 text-slate-500" : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-100"}`}>
                  {myInfo?.isReady ? "준비완료" : "준비"}
                </button>
              )
            ) : gameStatus === "RESULT" ? (
              myInfo?.isHost ? (
                <button onClick={handleStartGame} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg hover:bg-blue-700 uppercase italic">다시 시작</button>
              ) : (
                <button onClick={handleToggleReady} className={`w-full py-4 rounded-2xl font-black text-lg transition-all ${myInfo?.isReady ? "bg-slate-200 text-slate-500" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}>
                  {myInfo?.isReady ? "준비완료" : "준비"}
                </button>
              )
            ) : (
              <div className="text-center py-2 text-[10px] font-black text-slate-300 uppercase tracking-widest italic animate-pulse">
                {gameStatus} in progress
              </div>
            )}
          </div>
        </div>

        {/* 우측 채팅 패널 */}
        <div className="flex-1 bg-white rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col overflow-hidden h-full min-h-0">
          <div className="p-4 border-b border-slate-50 bg-slate-50/20 flex justify-between items-center shrink-0">
            <h3 className="font-black text-slate-800 italic uppercase text-xs flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span> {roomId.toUpperCase()} CHAT
            </h3>
            <button
              onClick={handleExit}
              className="hidden md:flex text-[10px] font-black px-4 py-2 rounded-xl uppercase border-2 border-rose-100 bg-white text-rose-500 hover:bg-rose-500 hover:text-white hover:border-rose-500 transition-all duration-300"
            >
              Exit Room
            </button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar">
            {chatLog.map((chat, idx) => (
              <div key={idx} className={`flex flex-col ${chat.author === name ? "items-end" : chat.author === 'SYSTEM_DESC' ? "items-center" : "items-start"}`}>
                {chat.author !== 'SYSTEM_DESC' && (
                  <span className={`text-[9px] font-black mb-1 px-2 uppercase tracking-tighter ${chat.author === 'SYSTEM' ? 'text-blue-500' : 'text-slate-400'}`}>
                    {chat.author === name ? "Me" : chat.author}
                  </span>
                )}
                <div className={`px-5 py-3 rounded-[1.5rem] max-w-[85%] break-all shadow-sm font-bold text-sm ${chat.author === 'SYSTEM' ? "bg-slate-900 text-white mx-auto text-center rounded-2xl text-[10px] py-1.5 uppercase" :
                    chat.author === 'SYSTEM_DESC' ? "bg-blue-600 text-white rounded-[1.5rem] w-full text-center py-6 font-black italic text-xl shadow-xl shadow-blue-100 animate-in slide-in-from-bottom-2" :
                      chat.author === name ? "bg-blue-600 text-white rounded-tr-none shadow-blue-100" : "bg-slate-50 text-slate-700 border border-slate-100 rounded-tl-none"
                  }`}>
                  {chat.message}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-4 bg-white border-t flex gap-2">
            <input
              className="flex-1 p-4 bg-slate-50 rounded-2xl outline-none font-black text-slate-700 border-2 border-transparent focus:border-blue-100 transition-all text-sm"
              placeholder="메시지 입력..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button className="bg-blue-600 text-white px-8 rounded-2xl font-black uppercase italic shadow-lg shadow-blue-100">Send</button>
          </form>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}</style>
    </div>
  );
}

export default App;